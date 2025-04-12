/**
 * @fileoverview Main Entry Point for WhatsApp AI Sales Agent
 *
 * This module initializes and coordinates all components of the WhatsApp AI sales agent,
 * including the WhatsApp client, API server, and scheduled jobs.
 */

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { db, connectDB } = require("./db");
const logger = require("./logger");
const ChatHandler = require("./chatHandler");
const apiRouter = require("./api");
const botConfig = require("./botConfig");
const { createScheduler } = require("./scheduler");
const { initializeBotStatus } = require("./utils");
const aiHandler = require("./aiHandler");
const memoryManager = require("./memoryManager");

// Load environment variables
dotenv.config();

// Initialize bot status
const botStatus = initializeBotStatus();

/**
 * Main application class
 */
class WhatsAppAISalesAgent {
  /**
   * Create a new WhatsAppAISalesAgent instance
   */
  constructor() {
    this.client = null;
    this.chatHandler = null;
    this.apiServer = null;
    this.scheduler = null;
    this.startTime = new Date();
    this.qrCode = null;
    this.isClientReady = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

    logger.info(`Starting WhatsApp AI Sales Agent v${botConfig.version}`);
    logger.debug(`Environment: ${botConfig.environment}`);
  }

  /**
   * Initialize all components and start the agent
   */
  async start() {
    try {
      // Check for critical errors in configuration
      if (botConfig.validationErrors && botConfig.validationErrors.length > 0) {
        logger.error("Configuration validation errors detected:");
        botConfig.validationErrors.forEach((error) =>
          logger.error(`- ${error}`)
        );

        // Exit if critical errors are present
        if (
          botConfig.validationErrors.some((e) => e.includes("OPENAI_API_KEY"))
        ) {
          logger.error("Exiting due to critical configuration errors");
          process.exit(1);
        }
      }

      // Ensure required directories exist
      this._ensureRequiredDirectories();

      // Connect to the database
      await connectDB();

      // Initialize AI Handler
      await this._initializeAI();

      // Start the API server
      if (botConfig.server.enabled) {
        await this._startAPIServer();
      }

      // Initialize WhatsApp client
      await this._initializeWhatsAppClient();

      // Initialize scheduler for recurring tasks
      this._initializeScheduler();

      logger.info(
        "WhatsApp AI Sales Agent initialization completed successfully"
      );
    } catch (error) {
      logger.error("Failed to start WhatsApp AI Sales Agent:", error);
      process.exit(1);
    }
  }

  /**
   * Ensure all required directories exist
   * @private
   */
  _ensureRequiredDirectories() {
    const directories = [
      botConfig.paths.data,
      botConfig.paths.logs,
      botConfig.paths.assets,
      botConfig.paths.training,
      botConfig.paths.temp,
    ];

    directories.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        logger.debug(`Creating directory: ${dir}`);
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Initialize AI components
   * @private
   * @returns {Promise<void>}
   */
  async _initializeAI() {
    logger.info("Initializing AI components");

    try {
      // Load training data
      await aiHandler.loadTrainingContext();

      logger.info("AI components initialized successfully");
      botStatus.update({ aiInitialized: true });
    } catch (error) {
      logger.error("Error initializing AI components:", error);
      botStatus.update({
        aiInitialized: false,
        aiError: error.message,
      });
    }
  }

  /**
   * Initialize the WhatsApp client
   * @private
   * @returns {Promise<void>}
   */
  async _initializeWhatsAppClient() {
    logger.info("Initializing WhatsApp client");

    // Configure client options
    const clientOptions = {
      puppeteer: {
        headless: botConfig.whatsapp.headless,
        args: botConfig.whatsapp.browserArgs,
        executablePath: process.env.CHROME_PATH || undefined,
      },
      authStrategy: new LocalAuth({
        clientId: botConfig.whatsapp.sessionId,
        dataPath: botConfig.whatsapp.sessionFilePath,
      }),
      qrMaxRetries: botConfig.whatsapp.qrMaxRetries,
    };

    // Create WhatsApp client
    this.client = new Client(clientOptions);

    // Initialize chat handler
    this.chatHandler = new ChatHandler(this.client);

    // Set up event handlers
    this._setupWhatsAppEvents();

    // Initialize the client
    try {
      await this.client.initialize();
      logger.info("WhatsApp client initialization started");
      botStatus.update({ clientInitializing: true });
    } catch (error) {
      logger.error("Error initializing WhatsApp client:", error);
      botStatus.update({
        clientInitialized: false,
        clientError: error.message,
      });
      throw error;
    }
  }

  /**
   * Set up WhatsApp client event handlers
   * @private
   */
  _setupWhatsAppEvents() {
    // QR code event
    this.client.on("qr", (qr) => {
      logger.info("QR code received. Scan to authenticate WhatsApp Web.");
      this.qrCode = qr;
      botStatus.update({ qrCode: qr });

      // Display QR code in terminal
      qrcode.generate(qr, { small: true });
    });

    // Authentication successful
    this.client.on("authenticated", () => {
      logger.info("WhatsApp client authenticated");
      botStatus.update({ authenticated: true });
      this.qrCode = null;
    });

    // Authentication failure
    this.client.on("auth_failure", (error) => {
      logger.error("WhatsApp authentication failed:", error);
      botStatus.update({
        authenticated: false,
        authError: error.message,
      });

      // Try to reconnect if too many failures
      this.reconnectAttempts++;
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        logger.info(
          `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
        );
        setTimeout(() => {
          this.client.initialize();
        }, 10000 * this.reconnectAttempts); // Increasing delay with each attempt
      } else {
        logger.error(
          `Failed to authenticate after ${this.maxReconnectAttempts} attempts. Please restart the application.`
        );
      }
    });

    // Client ready
    this.client.on("ready", () => {
      logger.info("WhatsApp client ready");
      this.isClientReady = true;
      botStatus.update({
        clientInitialized: true,
        qrCode: null,
        status: "ready",
        readyTime: new Date().toISOString(),
      });

      // Reset reconnect attempts
      this.reconnectAttempts = 0;
    });

    // Message received
    this.client.on("message", async (message) => {
      try {
        // Update status
        botStatus.update({ lastMessageTime: new Date().toISOString() });

        // Forward message to chat handler
        await this.chatHandler.handleIncomingMessage(message);
      } catch (error) {
        logger.error("Error handling incoming message:", error);
      }
    });

    // Disconnect event
    this.client.on("disconnected", (reason) => {
      logger.warn(`WhatsApp client disconnected: ${reason}`);
      this.isClientReady = false;
      botStatus.update({
        status: "disconnected",
        disconnectReason: reason,
        disconnectTime: new Date().toISOString(),
      });

      // Try to reconnect if automatic restart is enabled
      if (botConfig.whatsapp.restartOnCrash) {
        logger.info("Attempting to reconnect in 10 seconds...");
        setTimeout(() => {
          this.client.initialize();
        }, 10000);
      }
    });

    // Connection changes
    this.client.on("change_state", (state) => {
      logger.debug(`WhatsApp connection state changed to: ${state}`);
      botStatus.update({ connectionState: state });
    });

    // Loading screen
    this.client.on("loading_screen", (percent, message) => {
      logger.debug(`WhatsApp loading: ${percent}% - ${message}`);
      botStatus.update({
        loadingProgress: percent,
        loadingMessage: message,
      });
    });
  }

  /**
   * Start the API server
   * @private
   * @returns {Promise<void>}
   */
  async _startAPIServer() {
    try {
      logger.info("Starting API server");

      // Create Express app
      const app = express();

      // Enable CORS
      app.use(
        cors({
          origin: process.env.CORS_ORIGIN || "*",
          methods: ["GET", "POST"],
          allowedHeaders: ["Content-Type", "Authorization"],
          maxAge: 86400, // 1 day
        })
      );

      // Parse JSON bodies
      app.use(express.json());

      // Basic request logging
      app.use((req, res, next) => {
        logger.debug(`API Request: ${req.method} ${req.path}`);
        next();
      });

      // API routes
      app.use("/api", apiRouter);

      // Error handler
      app.use((err, req, res, next) => {
        logger.error("API error:", err);
        res.status(500).json({
          success: false,
          error: "Internal server error",
        });
      });

      // Start server
      const server = app.listen(
        botConfig.server.port,
        botConfig.server.host,
        () => {
          logger.info(
            `API server running on http://${botConfig.server.host}:${botConfig.server.port}`
          );
          botStatus.update({ apiServerRunning: true });
        }
      );

      // Store server reference
      this.apiServer = server;
    } catch (error) {
      logger.error("Failed to start API server:", error);
      botStatus.update({
        apiServerRunning: false,
        apiServerError: error.message,
      });
    }
  }

  /**
   * Initialize scheduler for recurring tasks
   * @private
   */
  _initializeScheduler() {
    logger.info("Initializing scheduler for recurring tasks");

    try {
      // Create scheduler
      this.scheduler = createScheduler();

      // Add tasks
      this.scheduler.addTask({
        name: "cleanupCache",
        schedule: "0 */1 * * *", // Every hour
        task: async () => {
          logger.debug("Running scheduled cache cleanup");
          await memoryManager.cleanupCache();
        },
      });

      this.scheduler.addTask({
        name: "cleanupOldData",
        schedule: "0 3 * * *", // Every day at 3 AM
        task: async () => {
          logger.debug("Running scheduled old data cleanup");
          await memoryManager.cleanupOldData();
        },
      });

      this.scheduler.addTask({
        name: "generateDailyStats",
        schedule: "0 0 * * *", // Every day at midnight
        task: async () => {
          logger.debug("Generating daily statistics");
          botStatus.update({
            lastDailyStats: new Date().toISOString(),
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
          });
        },
      });

      // Start scheduler
      this.scheduler.start();

      logger.info("Scheduler initialized successfully");
      botStatus.update({ schedulerRunning: true });
    } catch (error) {
      logger.error("Failed to initialize scheduler:", error);
      botStatus.update({
        schedulerRunning: false,
        schedulerError: error.message,
      });
    }
  }

  /**
   * Gracefully shut down the application
   */
  async shutdown() {
    logger.info("Shutting down WhatsApp AI Sales Agent");

    // Stop scheduler
    if (this.scheduler) {
      this.scheduler.stop();
      logger.debug("Scheduler stopped");
    }

    // Close WhatsApp client
    if (this.client && this.isClientReady) {
      try {
        await this.client.destroy();
        logger.debug("WhatsApp client destroyed");
      } catch (error) {
        logger.error("Error destroying WhatsApp client:", error);
      }
    }

    // Close API server
    if (this.apiServer) {
      try {
        await new Promise((resolve) => {
          this.apiServer.close(resolve);
        });
        logger.debug("API server closed");
      } catch (error) {
        logger.error("Error closing API server:", error);
      }
    }

    // Close database connection
    try {
      await db.disconnectDB();
      logger.debug("Database connection closed");
    } catch (error) {
      logger.error("Error disconnecting from database:", error);
    }

    // Close logger
    try {
      await logger.close();
    } catch (error) {
      console.error("Error closing logger:", error);
    }

    logger.info("Shutdown complete");
  }
}

// Create the application instance
const app = new WhatsAppAISalesAgent();

// Handle process termination
process.on("SIGINT", async () => {
  console.log("\nReceived SIGINT signal");
  await app.shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nReceived SIGTERM signal");
  await app.shutdown();
  process.exit(0);
});

process.on("uncaughtException", async (error) => {
  logger.fatal("Uncaught exception:", error);
  await app.shutdown();
  process.exit(1);
});

process.on("unhandledRejection", async (reason, promise) => {
  logger.fatal("Unhandled promise rejection:", reason);
  await app.shutdown();
  process.exit(1);
});

// Start the application
app.start().catch((error) => {
  logger.fatal("Fatal error during application startup:", error);
  process.exit(1);
});

// Export for testing
module.exports = app;
