/**
 * @fileoverview Memory Manager for WhatsApp AI Sales Agent
 *
 * This module manages persistent and in-memory storage of conversation history,
 * user data, and sales funnel state. It provides a unified interface for storing
 * and retrieving data across different storage backends.
 */

const { prisma } = require("./db");
const logger = require("./logger");
const botConfig = require("./botConfig");

/**
 * Default memory retention period in days
 * @type {number}
 */
const DEFAULT_RETENTION_DAYS = 90;

/**
 * Memory Manager class for handling data storage and retrieval
 */
class MemoryManager {
  /**
   * Create a new MemoryManager instance
   */
  constructor() {
    // Cache for frequently accessed data
    this.cache = {
      messages: new Map(),
      memoryEntries: new Map(),
      lastAccess: new Map(),
    };

    // Cache TTL in milliseconds (30 minutes)
    this.cacheTTL = 30 * 60 * 1000;

    // Initialize memory cleanup interval
    this.initializeCleanupTask();

    logger.info("MemoryManager initialized");
  }

  /**
   * Initialize periodic cleanup tasks
   * @private
   */
  initializeCleanupTask() {
    // Run cache cleanup every hour
    setInterval(() => this.cleanupCache(), 60 * 60 * 1000);

    // Run database cleanup every day
    setInterval(() => this.cleanupOldData(), 24 * 60 * 60 * 1000);

    logger.debug("Memory cleanup tasks initialized");
  }

  /**
   * Clean up expired cache entries
   * @private
   */
  cleanupCache() {
    try {
      const now = Date.now();
      let expiredCount = 0;

      // Clean up messages cache
      for (const [key, lastAccess] of this.cache.lastAccess.entries()) {
        if (now - lastAccess > this.cacheTTL) {
          this.cache.messages.delete(key);
          this.cache.memoryEntries.delete(key);
          this.cache.lastAccess.delete(key);
          expiredCount++;
        }
      }

      logger.debug(
        `Cache cleanup completed. Removed ${expiredCount} expired entries.`
      );
    } catch (error) {
      logger.error("Error during cache cleanup:", error);
    }
  }

  /**
   * Clean up old data from the database
   * @private
   * @returns {Promise<void>}
   */
  async cleanupOldData() {
    try {
      const retentionDays = process.env.MEMORY_RETENTION_DAYS
        ? parseInt(process.env.MEMORY_RETENTION_DAYS, 10)
        : DEFAULT_RETENTION_DAYS;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      logger.debug(
        `Running database cleanup for data older than ${cutoffDate.toISOString()}`
      );

      // Delete old messages
      const deletedMessages = await prisma.message.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      // Delete old memory entries
      const deletedEntries = await prisma.memoryEntry.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
          type: {
            notIn: ["contact_info", "purchase_history", "important_note"],
          },
        },
      });

      logger.info(
        `Database cleanup completed. Removed ${deletedMessages.count} messages and ${deletedEntries.count} memory entries.`
      );
    } catch (error) {
      logger.error("Error during database cleanup:", error);
    }
  }

  /**
   * Add a message to memory
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} role - The role of the message sender ('user', 'assistant', 'system')
   * @param {string} content - The content of the message
   * @param {Object} metadata - Additional metadata about the message
   * @returns {Promise<Object>} The created message
   */
  async addMessage(phoneNumber, role, content, metadata = {}) {
    try {
      logger.debug(`Adding message for ${phoneNumber} with role ${role}`);

      // Validate required fields
      if (!phoneNumber || !role || !content) {
        throw new Error("Missing required fields: phoneNumber, role, content");
      }

      // Validate role
      if (!["user", "assistant", "system"].includes(role)) {
        throw new Error(
          `Invalid role: ${role}. Must be one of: user, assistant, system`
        );
      }

      // Create message in database
      const message = await prisma.message.create({
        data: {
          conversationId: phoneNumber,
          role,
          content,
          metadata: metadata || {},
        },
      });

      // Update cache
      this._updateMessageCache(phoneNumber, message);

      return message;
    } catch (error) {
      logger.error(`Failed to add message for ${phoneNumber}:`, error);
      throw new Error(`Failed to add message: ${error.message}`);
    }
  }

  /**
   * Get messages for a conversation
   * @param {string} phoneNumber - The phone number identifier
   * @param {Object} options - Query options
   * @param {number} options.limit - Maximum number of messages to return
   * @param {string} options.role - Filter by message role
   * @param {boolean} options.includeSystem - Whether to include system messages
   * @returns {Promise<Array<Object>>} Array of messages
   */
  async getMessages(phoneNumber, options = {}) {
    try {
      const { limit = 50, role, includeSystem = false } = options;

      logger.debug(
        `Getting messages for ${phoneNumber} with options:`,
        options
      );

      // Try to get from cache first
      const cachedMessages = this.cache.messages.get(phoneNumber);
      if (cachedMessages) {
        // Update last access time
        this.cache.lastAccess.set(phoneNumber, Date.now());

        // Apply filters to cached messages
        let filteredMessages = [...cachedMessages];

        if (role) {
          filteredMessages = filteredMessages.filter((m) => m.role === role);
        }

        if (!includeSystem) {
          filteredMessages = filteredMessages.filter(
            (m) => m.role !== "system"
          );
        }

        // Apply limit and sort
        filteredMessages.sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        );

        if (filteredMessages.length > limit) {
          filteredMessages = filteredMessages.slice(-limit);
        }

        return filteredMessages;
      }

      // Prepare query
      const whereClause = {
        conversationId: phoneNumber,
      };

      if (role) {
        whereClause.role = role;
      }

      if (!includeSystem) {
        whereClause.role = { not: "system" };
      }

      // Query database
      const messages = await prisma.message.findMany({
        where: whereClause,
        orderBy: {
          createdAt: "asc",
        },
        take: limit,
      });

      // Update cache
      this._setMessagesCache(phoneNumber, messages);

      return messages;
    } catch (error) {
      logger.error(`Failed to get messages for ${phoneNumber}:`, error);
      return [];
    }
  }

  /**
   * Save a memory entry
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} key - The key for the memory entry
   * @param {string|Object} value - The value to store
   * @param {string} type - The type of memory entry
   * @returns {Promise<Object>} The created memory entry
   */
  async saveMemoryEntry(phoneNumber, key, value, type = "general") {
    try {
      logger.debug(`Saving memory entry for ${phoneNumber}: ${key} (${type})`);

      // Validate required fields
      if (!phoneNumber || !key) {
        throw new Error("Missing required fields: phoneNumber, key");
      }

      // Convert value to JSON if it's an object
      const serializedValue =
        typeof value === "object" ? JSON.stringify(value) : String(value);

      // Check if entry already exists
      const existingEntry = await prisma.memoryEntry.findFirst({
        where: {
          conversationId: phoneNumber,
          key,
          type,
        },
      });

      let entry;

      if (existingEntry) {
        // Update existing entry
        entry = await prisma.memoryEntry.update({
          where: { id: existingEntry.id },
          data: { value: serializedValue },
        });
      } else {
        // Create new entry
        entry = await prisma.memoryEntry.create({
          data: {
            conversationId: phoneNumber,
            key,
            value: serializedValue,
            type,
          },
        });
      }

      // Update cache
      this._updateMemoryEntryCache(phoneNumber, entry);

      return entry;
    } catch (error) {
      logger.error(`Failed to save memory entry for ${phoneNumber}:`, error);
      throw new Error(`Failed to save memory entry: ${error.message}`);
    }
  }

  /**
   * Get a specific memory entry
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} key - The key for the memory entry
   * @param {string} type - The type of memory entry
   * @returns {Promise<Object|null>} The memory entry or null if not found
   */
  async getMemoryEntry(phoneNumber, key, type = "general") {
    try {
      logger.debug(`Getting memory entry for ${phoneNumber}: ${key} (${type})`);

      // Try to get from cache first
      const cacheKey = `${phoneNumber}:${type}:${key}`;
      const cachedEntries = this.cache.memoryEntries.get(phoneNumber);

      if (cachedEntries) {
        // Update last access time
        this.cache.lastAccess.set(phoneNumber, Date.now());

        // Find matching entry
        const cachedEntry = cachedEntries.find(
          (e) => e.key === key && e.type === type
        );
        if (cachedEntry) {
          return this._deserializeMemoryEntry(cachedEntry);
        }
      }

      // Query database
      const entry = await prisma.memoryEntry.findFirst({
        where: {
          conversationId: phoneNumber,
          key,
          type,
        },
      });

      if (entry) {
        // Update cache
        this._updateMemoryEntryCache(phoneNumber, entry);

        return this._deserializeMemoryEntry(entry);
      }

      return null;
    } catch (error) {
      logger.error(`Failed to get memory entry for ${phoneNumber}:`, error);
      return null;
    }
  }

  /**
   * Get the latest memory entry of a specific type
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} type - The type of memory entry
   * @returns {Promise<Object|null>} The memory entry or null if not found
   */
  async getLatestMemoryEntry(phoneNumber, type = "general") {
    try {
      logger.debug(
        `Getting latest memory entry for ${phoneNumber} of type ${type}`
      );

      // Try to get from cache first
      const cachedEntries = this.cache.memoryEntries.get(phoneNumber);

      if (cachedEntries) {
        // Update last access time
        this.cache.lastAccess.set(phoneNumber, Date.now());

        // Find latest matching entry
        const matchingEntries = cachedEntries.filter((e) => e.type === type);
        if (matchingEntries.length > 0) {
          // Sort by updated time descending
          matchingEntries.sort(
            (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
          );
          return this._deserializeMemoryEntry(matchingEntries[0]);
        }
      }

      // Query database
      const entry = await prisma.memoryEntry.findFirst({
        where: {
          conversationId: phoneNumber,
          type,
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

      if (entry) {
        // Update cache
        this._updateMemoryEntryCache(phoneNumber, entry);

        return this._deserializeMemoryEntry(entry);
      }

      return null;
    } catch (error) {
      logger.error(
        `Failed to get latest memory entry for ${phoneNumber}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get all memory entries for a conversation
   * @param {string} phoneNumber - The phone number identifier
   * @param {Object} options - Query options
   * @param {string} options.type - Filter by type
   * @param {string} options.keyPattern - Filter by key pattern
   * @param {number} options.limit - Maximum number of entries to return
   * @returns {Promise<Array<Object>>} Array of memory entries
   */
  async getMemoryEntries(phoneNumber, options = {}) {
    try {
      const { type, keyPattern, limit = 50 } = options;

      logger.debug(
        `Getting memory entries for ${phoneNumber} with options:`,
        options
      );

      // Prepare query
      const whereClause = {
        conversationId: phoneNumber,
      };

      if (type) {
        whereClause.type = type;
      }

      if (keyPattern) {
        whereClause.key = {
          contains: keyPattern,
        };
      }

      // Query database
      const entries = await prisma.memoryEntry.findMany({
        where: whereClause,
        orderBy: {
          updatedAt: "desc",
        },
        take: limit,
      });

      // Update cache with these entries
      this._updateMemoryEntriesCache(phoneNumber, entries);

      // Deserialize values
      return entries.map((entry) => this._deserializeMemoryEntry(entry));
    } catch (error) {
      logger.error(`Failed to get memory entries for ${phoneNumber}:`, error);
      return [];
    }
  }

  /**
   * Delete a memory entry
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} key - The key for the memory entry
   * @param {string} type - The type of memory entry
   * @returns {Promise<boolean>} Whether the deletion was successful
   */
  async deleteMemoryEntry(phoneNumber, key, type = "general") {
    try {
      logger.debug(
        `Deleting memory entry for ${phoneNumber}: ${key} (${type})`
      );

      // Delete from database
      await prisma.memoryEntry.deleteMany({
        where: {
          conversationId: phoneNumber,
          key,
          type,
        },
      });

      // Update cache
      const cachedEntries = this.cache.memoryEntries.get(phoneNumber);
      if (cachedEntries) {
        const updatedEntries = cachedEntries.filter(
          (e) => !(e.key === key && e.type === type)
        );
        this.cache.memoryEntries.set(phoneNumber, updatedEntries);
      }

      return true;
    } catch (error) {
      logger.error(`Failed to delete memory entry for ${phoneNumber}:`, error);
      return false;
    }
  }

  /**
   * Clear all memory for a conversation
   * @param {string} phoneNumber - The phone number identifier
   * @param {Object} options - Clear options
   * @param {boolean} options.keepContactInfo - Whether to keep contact information
   * @param {boolean} options.keepPurchaseHistory - Whether to keep purchase history
   * @returns {Promise<boolean>} Whether the operation was successful
   */
  async clearMemory(phoneNumber, options = {}) {
    try {
      const { keepContactInfo = true, keepPurchaseHistory = true } = options;

      logger.debug(`Clearing memory for ${phoneNumber} with options:`, options);

      // Prepare where clause
      const messageWhereClause = {
        conversationId: phoneNumber,
      };

      const memoryWhereClause = {
        conversationId: phoneNumber,
      };

      // Exclude specific types if needed
      const typesToKeep = [];
      if (keepContactInfo) {
        typesToKeep.push("contact_info");
      }
      if (keepPurchaseHistory) {
        typesToKeep.push("purchase_history");
      }

      if (typesToKeep.length > 0) {
        memoryWhereClause.type = {
          notIn: typesToKeep,
        };
      }

      // Delete from database
      const [deletedMessages, deletedEntries] = await prisma.$transaction([
        prisma.message.deleteMany({ where: messageWhereClause }),
        prisma.memoryEntry.deleteMany({ where: memoryWhereClause }),
      ]);

      // Clear cache
      this.cache.messages.delete(phoneNumber);

      // Update memory entries cache if keeping some types
      if (keepContactInfo || keepPurchaseHistory) {
        const remainingEntries = await prisma.memoryEntry.findMany({
          where: {
            conversationId: phoneNumber,
          },
        });

        this.cache.memoryEntries.set(phoneNumber, remainingEntries);
      } else {
        this.cache.memoryEntries.delete(phoneNumber);
      }

      // Clear last access
      this.cache.lastAccess.delete(phoneNumber);

      logger.info(
        `Cleared memory for ${phoneNumber}: ${deletedMessages.count} messages and ${deletedEntries.count} memory entries deleted.`
      );

      return true;
    } catch (error) {
      logger.error(`Failed to clear memory for ${phoneNumber}:`, error);
      return false;
    }
  }

  /**
   * Get a summary of memory usage
   * @returns {Promise<Object>} Memory usage statistics
   */
  async getMemoryStats() {
    try {
      logger.debug("Getting memory stats");

      // Count records in database
      const [messageCount, entryCount, conversationCount] = await Promise.all([
        prisma.message.count(),
        prisma.memoryEntry.count(),
        prisma.$queryRaw`SELECT COUNT(DISTINCT "conversationId") FROM "Message"`,
      ]);

      // Get cache stats
      const cacheStats = {
        messages: {
          conversations: this.cache.messages.size,
          entries: Array.from(this.cache.messages.values()).reduce(
            (sum, messages) => sum + messages.length,
            0
          ),
        },
        memoryEntries: {
          conversations: this.cache.memoryEntries.size,
          entries: Array.from(this.cache.memoryEntries.values()).reduce(
            (sum, entries) => sum + entries.length,
            0
          ),
        },
      };

      return {
        database: {
          messages: messageCount,
          memoryEntries: entryCount,
          conversations: Number(conversationCount[0].count),
        },
        cache: cacheStats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Failed to get memory stats:", error);
      return {
        error: "Failed to get memory stats",
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Export all data for a conversation
   * @param {string} phoneNumber - The phone number identifier
   * @returns {Promise<Object>} Exported data
   */
  async exportConversationData(phoneNumber) {
    try {
      logger.debug(`Exporting conversation data for ${phoneNumber}`);

      // Get all messages and memory entries
      const [messages, memoryEntries] = await Promise.all([
        prisma.message.findMany({
          where: { conversationId: phoneNumber },
          orderBy: { createdAt: "asc" },
        }),
        prisma.memoryEntry.findMany({
          where: { conversationId: phoneNumber },
        }),
      ]);

      // Deserialize memory entries
      const deserializedEntries = memoryEntries.map((entry) => ({
        ...entry,
        value: this._tryParseJson(entry.value),
      }));

      // Group entries by type
      const entriesByType = deserializedEntries.reduce((acc, entry) => {
        if (!acc[entry.type]) {
          acc[entry.type] = [];
        }
        acc[entry.type].push({
          key: entry.key,
          value: entry.value,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        });
        return acc;
      }, {});

      return {
        phoneNumber,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
          metadata: msg.metadata,
          timestamp: msg.createdAt,
        })),
        memoryEntries: entriesByType,
        exportedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(
        `Failed to export conversation data for ${phoneNumber}:`,
        error
      );
      throw new Error(`Failed to export conversation data: ${error.message}`);
    }
  }

  /**
   * Import data for a conversation
   * @param {string} phoneNumber - The phone number identifier
   * @param {Object} data - Data to import
   * @returns {Promise<Object>} Import results
   */
  async importConversationData(phoneNumber, data) {
    try {
      logger.debug(`Importing conversation data for ${phoneNumber}`);

      if (!data || !data.messages || !data.memoryEntries) {
        throw new Error("Invalid import data format");
      }

      // Track counts for reporting
      const counts = {
        messagesAdded: 0,
        entriesAdded: 0,
        errors: [],
      };

      // Import messages
      if (Array.isArray(data.messages)) {
        for (const msg of data.messages) {
          try {
            if (!msg.role || !msg.content) continue;

            await prisma.message.create({
              data: {
                conversationId: phoneNumber,
                role: msg.role,
                content: msg.content,
                metadata: msg.metadata || {},
                createdAt: msg.timestamp ? new Date(msg.timestamp) : undefined,
              },
            });

            counts.messagesAdded++;
          } catch (error) {
            counts.errors.push(`Error importing message: ${error.message}`);
          }
        }
      }

      // Import memory entries
      if (typeof data.memoryEntries === "object") {
        for (const [type, entries] of Object.entries(data.memoryEntries)) {
          if (!Array.isArray(entries)) continue;

          for (const entry of entries) {
            try {
              if (!entry.key) continue;

              const valueToStore =
                typeof entry.value === "object"
                  ? JSON.stringify(entry.value)
                  : String(entry.value);

              await prisma.memoryEntry.create({
                data: {
                  conversationId: phoneNumber,
                  key: entry.key,
                  value: valueToStore,
                  type,
                  createdAt: entry.createdAt
                    ? new Date(entry.createdAt)
                    : undefined,
                  updatedAt: entry.updatedAt
                    ? new Date(entry.updatedAt)
                    : undefined,
                },
              });

              counts.entriesAdded++;
            } catch (error) {
              counts.errors.push(
                `Error importing memory entry ${entry.key}: ${error.message}`
              );
            }
          }
        }
      }

      // Clear cache for this conversation
      this.cache.messages.delete(phoneNumber);
      this.cache.memoryEntries.delete(phoneNumber);
      this.cache.lastAccess.delete(phoneNumber);

      logger.info(
        `Imported data for ${phoneNumber}: ${counts.messagesAdded} messages and ${counts.entriesAdded} memory entries added.`
      );

      return {
        success: true,
        ...counts,
        importedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(
        `Failed to import conversation data for ${phoneNumber}:`,
        error
      );
      return {
        success: false,
        error: error.message,
        importedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Update cache with a new message
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {Object} message - The message object
   */
  _updateMessageCache(phoneNumber, message) {
    // Get or initialize messages array
    let messages = this.cache.messages.get(phoneNumber);
    if (!messages) {
      messages = [];
      this.cache.messages.set(phoneNumber, messages);
    }

    // Add message to array
    messages.push(message);

    // Update last access time
    this.cache.lastAccess.set(phoneNumber, Date.now());
  }

  /**
   * Set messages cache for a conversation
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {Array<Object>} messages - The messages array
   */
  _setMessagesCache(phoneNumber, messages) {
    // Set messages in cache
    this.cache.messages.set(phoneNumber, [...messages]);

    // Update last access time
    this.cache.lastAccess.set(phoneNumber, Date.now());
  }

  /**
   * Update cache with a new memory entry
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {Object} entry - The memory entry
   */
  _updateMemoryEntryCache(phoneNumber, entry) {
    // Get or initialize entries array
    let entries = this.cache.memoryEntries.get(phoneNumber);
    if (!entries) {
      entries = [];
      this.cache.memoryEntries.set(phoneNumber, entries);
    }

    // Remove old entry with same key and type if exists
    const entryIndex = entries.findIndex(
      (e) => e.key === entry.key && e.type === entry.type
    );
    if (entryIndex !== -1) {
      entries.splice(entryIndex, 1);
    }

    // Add entry to array
    entries.push(entry);

    // Update last access time
    this.cache.lastAccess.set(phoneNumber, Date.now());
  }

  /**
   * Update cache with multiple memory entries
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {Array<Object>} entries - The memory entries
   */
  _updateMemoryEntriesCache(phoneNumber, entries) {
    // Get or initialize entries array
    let cachedEntries = this.cache.memoryEntries.get(phoneNumber);
    if (!cachedEntries) {
      cachedEntries = [];
      this.cache.memoryEntries.set(phoneNumber, cachedEntries);
    }

    // Update entries in cache
    for (const entry of entries) {
      // Remove old entry with same key and type if exists
      const entryIndex = cachedEntries.findIndex(
        (e) => e.key === entry.key && e.type === entry.type
      );
      if (entryIndex !== -1) {
        cachedEntries.splice(entryIndex, 1);
      }

      // Add entry to array
      cachedEntries.push(entry);
    }

    // Update last access time
    this.cache.lastAccess.set(phoneNumber, Date.now());
  }

  /**
   * Deserialize a memory entry
   * @private
   * @param {Object} entry - The memory entry
   * @returns {Object} Deserialized entry
   */
  _deserializeMemoryEntry(entry) {
    return {
      ...entry,
      value: this._tryParseJson(entry.value),
    };
  }

  /**
   * Try to parse a JSON string
   * @private
   * @param {string} value - The string to parse
   * @returns {any} Parsed value or original string
   */
  _tryParseJson(value) {
    if (typeof value !== "string") {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
}

// Create and export singleton instance
const memoryManager = new MemoryManager();
module.exports = memoryManager;