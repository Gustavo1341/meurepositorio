/**
 * @fileoverview Utility Functions for WhatsApp AI Sales Agent
 *
 * This module provides various utility functions used throughout the application,
 * including date formatting, text processing, file operations, and status tracking.
 */

const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { format: formatDate } = require("date-fns");
const { ptBR } = require("date-fns/locale");
const logger = require("./logger");

// Bot status singleton instance
let botStatus = null;

/**
 * Initialize the bot status tracking object
 * @returns {Object} Status object with update method
 */
function initializeBotStatus() {
  if (botStatus) return botStatus;

  const status = {
    startTime: new Date().toISOString(),
    status: "initializing",
    clientInitialized: false,
    aiInitialized: false,
    apiServerRunning: false,
    schedulerRunning: false,
    authenticated: false,
    qrCode: null,
    connectionState: "disconnected",
    lastMessageTime: null,
    lastErrorTime: null,
    lastError: null,
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
    hostname: os.hostname(),
    uptimeSeconds: 0,

    // Method to update status fields
    update(fields) {
      Object.assign(this, fields);

      // Calculate uptime
      this.uptimeSeconds = Math.floor(
        (Date.now() - new Date(this.startTime).getTime()) / 1000
      );

      return this;
    },
  };

  botStatus = status;
  return status;
}

/**
 * Get the current bot status
 * @returns {Object} Current bot status
 */
function getBotStatus() {
  if (!botStatus) {
    return initializeBotStatus();
  }

  // Update uptime before returning
  botStatus.uptimeSeconds = Math.floor(
    (Date.now() - new Date(botStatus.startTime).getTime()) / 1000
  );

  return botStatus;
}

/**
 * Create a temporary file
 * @param {Buffer|string} data - File data
 * @param {string} [extension] - File extension
 * @returns {Promise<string>} Path to the created file
 */
async function createTempFile(data, extension = "") {
  try {
    // Generate random filename
    const filename = `${Date.now()}-${crypto
      .randomBytes(8)
      .toString("hex")}${extension}`;

    // Determine temp directory
    const tempDir = process.env.TEMP_PATH || path.join(process.cwd(), "temp");

    // Ensure temp directory exists
    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
      if (error.code !== "EEXIST") {
        throw error;
      }
    }

    const filePath = path.join(tempDir, filename);

    // Write file
    await fs.writeFile(filePath, data);

    return filePath;
  } catch (error) {
    logger.error("Failed to create temporary file:", error);
    throw new Error(`Failed to create temporary file: ${error.message}`);
  }
}

/**
 * Clean up temporary files
 * @param {Array<string>} filePaths - Paths to files to delete
 * @returns {Promise<void>}
 */
async function cleanupTempFiles(filePaths) {
  if (!Array.isArray(filePaths)) {
    return;
  }

  const deletePromises = filePaths.map(async (filePath) => {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      logger.warn(`Failed to delete temporary file ${filePath}:`, error);
    }
  });

  await Promise.allSettled(deletePromises);
}

/**
 * Format a date in Portuguese
 * @param {Date|string} date - Date to format
 * @param {string} formatString - Format string for date-fns
 * @returns {string} Formatted date string
 */
function formatDatePtBR(date, formatString = "dd 'de' MMMM 'de' yyyy") {
  try {
    if (!date) return "";

    const dateObj = typeof date === "string" ? new Date(date) : date;

    if (isNaN(dateObj.getTime())) {
      return "";
    }

    return formatDate(dateObj, formatString, { locale: ptBR });
  } catch (error) {
    logger.error("Error formatting date:", error);
    return "";
  }
}

/**
 * Format a currency value in Brazilian Real
 * @param {number} value - Value to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted currency string
 */
function formatCurrency(value, options = {}) {
  const {
    currency = "BRL",
    style = "currency",
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options;

  try {
    return new Intl.NumberFormat("pt-BR", {
      style,
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(value);
  } catch (error) {
    logger.error("Error formatting currency:", error);
    return `R$ ${value.toFixed(2)}`;
  }
}

/**
 * Format a phone number in Brazilian format
 * @param {string} phoneNumber - Phone number to format
 * @returns {string} Formatted phone number
 */
function formatPhoneNumber(phoneNumber) {
  if (!phoneNumber) return "";

  try {
    // Remove any non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, "");

    // Check if it's a Brazilian phone number
    if (cleaned.length === 10) {
      // Format as (XX) XXXX-XXXX for 10 digit numbers
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(
        2,
        6
      )}-${cleaned.substring(6, 10)}`;
    } else if (cleaned.length === 11) {
      // Format as (XX) XXXXX-XXXX for 11 digit numbers (with 9 prefix)
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(
        2,
        7
      )}-${cleaned.substring(7, 11)}`;
    }

    // Return the original number if it doesn't match format
    return phoneNumber;
  } catch (error) {
    logger.error("Error formatting phone number:", error);
    return phoneNumber;
  }
}

/**
 * Clean WhatsApp phone number format
 * @param {string} phoneNumber - Phone number to clean
 * @returns {string} Cleaned phone number
 */
function cleanPhoneNumber(phoneNumber) {
  if (!phoneNumber) return "";

  try {
    // Handle WhatsApp ID format (number@c.us)
    if (phoneNumber.includes("@c.us")) {
      phoneNumber = phoneNumber.split("@")[0];
    }

    // Remove any non-digit characters
    return phoneNumber.replace(/\D/g, "");
  } catch (error) {
    logger.error("Error cleaning phone number:", error);
    return phoneNumber;
  }
}

/**
 * Convert base64 data to a Buffer
 * @param {string} base64Data - Base64 string to convert
 * @returns {Buffer} Decoded buffer
 */
function base64ToBuffer(base64Data) {
  try {
    // Handle data URLs (e.g., "data:image/jpeg;base64,...")
    if (base64Data.includes("base64,")) {
      base64Data = base64Data.split("base64,")[1];
    }

    return Buffer.from(base64Data, "base64");
  } catch (error) {
    logger.error("Error converting base64 to buffer:", error);
    throw new Error(`Failed to convert base64 to buffer: ${error.message}`);
  }
}

/**
 * Truncate a string to a maximum length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} [suffix='...'] - Suffix to add when truncated
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength = 100, suffix = "...") {
  if (!text) return "";

  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Sanitize text for safe display
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeText(text) {
  if (!text) return "";

  // Replace HTML special characters
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generate a simple hash of a string
 * @param {string} input - String to hash
 * @returns {string} Hashed string
 */
function simpleHash(input) {
  if (!input) return "";

  return crypto.createHash("md5").update(input).digest("hex");
}

/**
 * Check if a value is a valid JSON string
 * @param {string} str - String to check
 * @returns {boolean} Whether the string is valid JSON
 */
function isValidJson(str) {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} Promise that resolves after the specified time
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a random integer between min and max (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random integer
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Extract content type from MIME type
 * @param {string} mimeType - MIME type string
 * @returns {string} Content type category
 */
function getContentTypeFromMime(mimeType) {
  if (!mimeType) return "unknown";

  const mime = mimeType.toLowerCase();

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("text/")) return "text";
  if (mime.includes("pdf")) return "document";
  if (mime.includes("spreadsheet")) return "spreadsheet";
  if (mime.includes("presentation")) return "presentation";
  if (mime.includes("msword") || mime.includes("wordprocessing"))
    return "document";

  return "other";
}

/**
 * Get file extension from MIME type
 * @param {string} mimeType - MIME type string
 * @returns {string} File extension (with dot)
 */
function getExtensionFromMime(mimeType) {
  if (!mimeType) return "";

  const mime = mimeType.toLowerCase();

  const mimeToExt = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "video/mp4": ".mp4",
    "video/mpeg": ".mpeg",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "text/html": ".html",
    "application/json": ".json",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      ".pptx",
  };

  return mimeToExt[mime] || "";
}

/**
 * Strip accents from a string
 * @param {string} text - Text to process
 * @returns {string} Text without accents
 */
function stripAccents(text) {
  if (!text) return "";

  // Normalize to NFD to separate base characters from accents,
  // then remove the accents
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Generate a slug from a string
 * @param {string} text - Text to convert to slug
 * @returns {string} Slug string
 */
function generateSlug(text) {
  if (!text) return "";

  return stripAccents(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Chunk an array into smaller arrays
 * @param {Array} array - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array<Array>} Array of chunks
 */
function chunkArray(array, size) {
  if (!Array.isArray(array)) return [];
  if (!size || size < 1) return [array];

  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get a deep property from an object using a path string
 * @param {Object} obj - Object to get property from
 * @param {string} path - Property path (e.g., 'user.address.city')
 * @param {any} [defaultValue] - Default value if property doesn't exist
 * @returns {any} Property value or default value
 */
function getDeepProperty(obj, path, defaultValue = undefined) {
  if (!obj || !path) return defaultValue;

  const parts = path.split(".");
  let result = obj;

  for (const part of parts) {
    if (result === undefined || result === null) {
      return defaultValue;
    }
    result = result[part];
  }

  return result === undefined ? defaultValue : result;
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries
 * @param {number} options.initialDelayMs - Initial delay in milliseconds
 * @param {number} options.maxDelayMs - Maximum delay in milliseconds
 * @returns {Promise<any>} Result of the function
 */
async function retryWithBackoff(fn, options = {}) {
  const { maxRetries = 3, initialDelayMs = 1000, maxDelayMs = 30000 } = options;

  let retries = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      retries++;

      if (retries > maxRetries) {
        throw error;
      }

      logger.debug(
        `Retrying function after error (${retries}/${maxRetries}): ${error.message}`
      );

      // Wait for the delay
      await sleep(delay);

      // Calculate next delay with exponential backoff and jitter
      delay = Math.min(delay * 2 * (0.8 + 0.4 * Math.random()), maxDelayMs);
    }
  }
}

/**
 * Calculate similarity between two strings using Levenshtein distance
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
function stringSimilarity(str1, str2) {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;

  // Normalize strings
  const s1 = stripAccents(str1.toLowerCase());
  const s2 = stripAccents(str2.toLowerCase());

  // Calculate Levenshtein distance
  const len1 = s1.length;
  const len2 = s2.length;

  // Create matrix
  const matrix = Array(len1 + 1)
    .fill()
    .map(() => Array(len2 + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= len1; i++) {
    matrix[i][0] = i;
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Calculate distance
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  // Calculate similarity score
  const maxLen = Math.max(len1, len2);
  const distance = matrix[len1][len2];

  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

/**
 * Safely parse a date string
 * @param {string} dateString - Date string to parse
 * @param {Date} [defaultValue=new Date()] - Default value if parsing fails
 * @returns {Date} Parsed date
 */
function safeParseDate(dateString, defaultValue = new Date()) {
  try {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      return defaultValue;
    }

    return date;
  } catch (error) {
    logger.error(`Error parsing date "${dateString}":`, error);
    return defaultValue;
  }
}

/**
 * Convert Brazilian date format (DD/MM/YYYY) to ISO string
 * @param {string} brDate - Brazilian date string
 * @returns {string} ISO date string or null if invalid
 */
function brDateToIso(brDate) {
  try {
    if (!brDate) return null;

    const parts = brDate.split("/");
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-based in JS Date
    const year = parseInt(parts[2], 10);

    const date = new Date(year, month, day);

    if (isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  } catch (error) {
    logger.error(`Error converting date "${brDate}" to ISO:`, error);
    return null;
  }
}

module.exports = {
  initializeBotStatus,
  getBotStatus,
  createTempFile,
  cleanupTempFiles,
  formatDatePtBR,
  formatCurrency,
  formatPhoneNumber,
  cleanPhoneNumber,
  base64ToBuffer,
  truncateText,
  sanitizeText,
  simpleHash,
  isValidJson,
  sleep,
  randomInt,
  getContentTypeFromMime,
  getExtensionFromMime,
  stripAccents,
  generateSlug,
  chunkArray,
  getDeepProperty,
  retryWithBackoff,
  stringSimilarity,
  safeParseDate,
  brDateToIso,
};
