/**
 * @fileoverview Database Configuration for WhatsApp AI Sales Agent
 *
 * This module configures and initializes the Prisma ORM for database interactions.
 * It handles connection management, query logging, and provides a singleton
 * instance of PrismaClient for use throughout the application.
 */

const { PrismaClient } = require("@prisma/client");
const logger = require("./logger");

/**
 * Custom Prisma client with query logging and error handling
 * @type {PrismaClient}
 */
const prisma = new PrismaClient({
  // Log all queries in development mode
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "info", "warn", "error"]
      : ["warn", "error"],
  errorFormat: "pretty",
});

// Track connection status
let isConnected = false;

/**
 * Configure Prisma logging middleware
 */
function configurePrismaLogging() {
  // Add middleware for query logging
  prisma.$use(async (params, next) => {
    const before = Date.now();

    try {
      const result = await next(params);

      const after = Date.now();
      const duration = after - before;

      // Only log slow queries in production
      const isSlowQuery = duration > 200; // ms
      const shouldLog = process.env.NODE_ENV === "development" || isSlowQuery;

      if (shouldLog) {
        logger.debug(
          `Prisma Query: ${params.model}.${params.action} took ${duration}ms`
        );
      }

      // Log particularly slow queries as warnings
      if (duration > 1000) {
        logger.warn(
          `Slow Prisma Query: ${params.model}.${params.action} took ${duration}ms`
        );
      }

      return result;
    } catch (error) {
      // Log query errors
      logger.error(
        `Prisma Query Error in ${params.model}.${params.action}: ${error.message}`,
        {
          params: JSON.stringify(params),
          error: error.stack,
        }
      );
      throw error;
    }
  });

  // Log all Prisma events to help with debugging
  prisma.$on("query", (e) => {
    if (
      process.env.NODE_ENV === "development" &&
      process.env.LOG_PRISMA_QUERIES === "true"
    ) {
      logger.debug(`Prisma Query: ${e.query}`);
    }
  });

  prisma.$on("error", (e) => {
    logger.error(`Prisma Error: ${e.message}`);
  });

  prisma.$on("info", (e) => {
    if (process.env.NODE_ENV === "development") {
      logger.info(`Prisma Info: ${e.message}`);
    }
  });

  prisma.$on("warn", (e) => {
    logger.warn(`Prisma Warning: ${e.message}`);
  });
}

/**
 * Connect to the database
 * @returns {Promise<void>}
 */
async function connectDB() {
  if (isConnected) {
    logger.debug(
      "Database connection already established, skipping connection."
    );
    return;
  }

  try {
    // Configure logging before connecting
    configurePrismaLogging();

    // Connect to the database
    await prisma.$connect();

    isConnected = true;
    logger.info("Database connection established successfully.");

    // Simple query to verify connection
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    if (result && result[0] && result[0].connected === 1) {
      logger.debug("Database connectivity verified with test query.");
    }
  } catch (error) {
    isConnected = false;
    logger.error("Failed to connect to database:", error);
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

/**
 * Disconnect from the database
 * @returns {Promise<void>}
 */
async function disconnectDB() {
  if (!isConnected) {
    logger.debug("No active database connection to disconnect.");
    return;
  }

  try {
    await prisma.$disconnect();
    isConnected = false;
    logger.info("Database connection closed successfully.");
  } catch (error) {
    logger.error("Error while disconnecting from database:", error);
    throw new Error(`Database disconnection failed: ${error.message}`);
  }
}

/**
 * Get the connection status
 * @returns {boolean} Whether the database is connected
 */
function getConnectionStatus() {
  return isConnected;
}

/**
 * Execute a transaction with retry logic
 * @param {Function} fn - Function to execute within transaction
 * @param {Object} options - Transaction options
 * @param {number} options.maxRetries - Maximum number of retry attempts
 * @param {number} options.initialDelay - Initial delay before retrying in ms
 * @returns {Promise<any>} Result of the transaction
 */
async function executeTransaction(fn, options = {}) {
  const { maxRetries = 3, initialDelay = 100 } = options;

  let retries = 0;
  let delay = initialDelay;

  while (true) {
    try {
      return await prisma.$transaction(fn);
    } catch (error) {
      // Check if error is retryable (connection issues, deadlocks)
      const isRetryable =
        error.code === "P1001" || // Authentication failed
        error.code === "P1002" || // Connection timed out
        error.code === "P1008" || // Operations timed out
        error.code === "P1017" || // Server closed the connection
        error.code === "P2034"; // Transaction failed due to deadlock

      if (!isRetryable || retries >= maxRetries) {
        logger.error(`Transaction failed after ${retries} retries:`, error);
        throw error;
      }

      // Exponential backoff
      retries += 1;
      logger.warn(
        `Retrying transaction (${retries}/${maxRetries}) after ${delay}ms due to error: ${error.message}`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
}

/**
 * Health check to verify database connectivity
 * @returns {Promise<Object>} Health check result
 */
async function healthCheck() {
  try {
    const startTime = Date.now();

    // If not connected, try to connect
    if (!isConnected) {
      await connectDB();
    }

    // Simple query to verify connection
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    const isHealthy = result && result[0] && result[0].connected === 1;

    return {
      status: isHealthy ? "healthy" : "unhealthy",
      responseTime,
      connected: isConnected,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("Database health check failed:", error);

    return {
      status: "unhealthy",
      error: error.message,
      connected: false,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = {
  prisma,
  connectDB,
  disconnectDB,
  getConnectionStatus,
  executeTransaction,
  healthCheck,
};
