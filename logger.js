/**
 * @fileoverview Logging System for WhatsApp AI Sales Agent
 * 
 * This module provides a centralized logging system with multi-destination output,
 * log level filtering, structured logging support, and file rotation capabilities.
 * It serves as the primary logging interface for the entire application.
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const { createWriteStream } = require('fs');
const { format: formatDate } = require('date-fns');
const { mkdir } = require('fs/promises');

// Default configuration
const DEFAULT_CONFIG = {
  logLevel: process.env.LOG_LEVEL || 'info',
  logToConsole: true,
  logToFile: process.env.LOG_TO_FILE !== 'false',
  logDir: process.env.LOG_DIR || path.join(process.cwd(), 'logs'),
  logFileName: process.env.LOG_FILE_NAME || 'app.log',
  maxLogFileSize: parseInt(process.env.MAX_LOG_FILE_SIZE || '10485760', 10), // 10MB
  maxLogFiles: parseInt(process.env.MAX_LOG_FILES || '10', 10),
  logFormat: process.env.LOG_FORMAT || 'text', // 'text' or 'json'
  includeTimestamp: true,
  includePid: process.env.INCLUDE_PID !== 'false',
  environment: process.env.NODE_ENV || 'development'
};

// Log levels with numeric values for comparison
const LOG_LEVELS = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5
};

// ANSI color codes for console output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m'
};

// Color mapping for log levels
const LEVEL_COLORS = {
  fatal: `${COLORS.bgRed}${COLORS.white}${COLORS.bright}`,
  error: COLORS.red,
  warn: COLORS.yellow,
  info: COLORS.green,
  debug: COLORS.cyan,
  trace: COLORS.dim
};

/**
 * @class Logger
 * @description Advanced logging system with file rotation and multi-destination output
 */
class Logger {
  /**
   * Create a new Logger instance
   * @param {Object} config - Logger configuration
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Validate log level
    if (!LOG_LEVELS.hasOwnProperty(this.config.logLevel)) {
      console.warn(`Invalid log level '${this.config.logLevel}', defaulting to 'info'`);
      this.config.logLevel = 'info';
    }
    
    this.currentLogLevel = LOG_LEVELS[this.config.logLevel];
    this.logStream = null;
    this.logFile = null;
    this.currentLogSize = 0;
    this.isInitialized = false;
    
    // Create log methods for each level
    Object.keys(LOG_LEVELS).forEach(level => {
      this[level] = (message, ...args) => {
        if (LOG_LEVELS[level] <= this.currentLogLevel) {
          this._logInternal(level, message, ...args);
        }
      };
    });
    
    // Initialize logging
    if (this.config.logToFile) {
      this._initializeLogFile().catch(err => {
        console.error('Failed to initialize log file:', err);
        // Fall back to console-only logging
        this.config.logToFile = false;
      });
    } else {
      this.isInitialized = true;
    }
  }
  
  /**
   * Change the current log level
   * @param {string} level - New log level
   * @returns {boolean} Whether the level was changed successfully
   */
  setLogLevel(level) {
    if (LOG_LEVELS.hasOwnProperty(level)) {
      this.currentLogLevel = LOG_LEVELS[level];
      this.config.logLevel = level;
      this.debug(`Log level changed to '${level}'`);
      return true;
    }
    
    this.warn(`Invalid log level '${level}', keeping '${this.config.logLevel}'`);
    return false;
  }

  /**
   * Initialize the log file and create write stream
   * @private
   * @returns {Promise<void>}
   */
  async _initializeLogFile() {
    try {
      // Ensure the log directory exists
      await mkdir(this.config.logDir, { recursive: true });
      
      const logFilePath = path.join(this.config.logDir, this.config.logFileName);
      this.logFile = logFilePath;
      
      // Check if the log file exists and get its size
      try {
        const stats = await fs.promises.stat(logFilePath);
        this.currentLogSize = stats.size;
      } catch (error) {
        // File doesn't exist, starting with size 0
        this.currentLogSize = 0;
      }
      
      // Create write stream
      this.logStream = createWriteStream(logFilePath, { flags: 'a' });
      
      // Setup error handling
      this.logStream.on('error', (error) => {
        console.error('Error writing to log file:', error);
        if (this.config.logToConsole) {
          console.warn('Disabling file logging due to error');
        }
        this.config.logToFile = false;
        this.logStream = null;
      });
      
      this.isInitialized = true;
      
      // Log startup message
      this.info(`Logging initialized. Level: ${this.config.logLevel}, File: ${this.logFile !== null ? this.logFile : 'none'}`);
    } catch (error) {
      console.error('Failed to initialize log file:', error);
      // Disable file logging on error
      this.config.logToFile = false;
      throw error;
    }
  }

  /**
   * Rotate log files when size limit is reached
   * @private
   * @returns {Promise<void>}
   */
  async _rotateLogFile() {
    if (!this.logFile || !this.logStream) return;
    
    try {
      // Close current stream
      const closeStream = util.promisify(this.logStream.end).bind(this.logStream);
      await closeStream();
      
      // Rotate log files
      const baseLogFile = this.logFile;
      const timestamp = formatDate(new Date(), 'yyyyMMdd-HHmmss');
      const rotatedLogFile = `${baseLogFile}.${timestamp}`;
      
      await fs.promises.rename(baseLogFile, rotatedLogFile);
      
      // Clean up old log files if we have too many
      try {
        const logDir = path.dirname(baseLogFile);
        const baseLogFileName = path.basename(baseLogFile);
        const files = await fs.promises.readdir(logDir);
        
        // Get log files with timestamps
        const logFiles = files
          .filter(file => file.startsWith(baseLogFileName) && file !== baseLogFileName)
          .map(file => ({
            name: file,
            path: path.join(logDir, file),
            timestamp: file.split('.').pop() // Extract timestamp
          }))
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // Sort newest first
        
        // Delete excess log files
        if (logFiles.length >= this.config.maxLogFiles) {
          const filesToDelete = logFiles.slice(this.config.maxLogFiles - 1);
          for (const file of filesToDelete) {
            await fs.promises.unlink(file.path);
            this.debug(`Deleted old log file: ${file.name}`);
          }
        }
      } catch (error) {
        console.error('Error cleaning up old log files:', error);
      }
      
      // Create new log file
      this.logStream = createWriteStream(baseLogFile, { flags: 'a' });
      this.currentLogSize = 0;
      
      this.info(`Log file rotated. Previous log: ${rotatedLogFile}`);
    } catch (error) {
      console.error('Error rotating log file:', error);
      // Disable file logging on error
      this.config.logToFile = false;
      this.logStream = null;
    }
  }

  /**
   * Internal logging implementation
   * @private
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  _logInternal(level, message, ...args) {
    // Wait for initialization if still in progress
    if (!this.isInitialized) {
      // If taking too long, log to console anyway
      if (this.config.logToConsole) {
        console.log(`[${level.toUpperCase()}] ${message}`, ...args);
      }
      
      // Queue log for when initialization completes
      setTimeout(() => this._logInternal(level, message, ...args), 100);
      return;
    }
    
    try {
      // Format the log entry
      const timestamp = this.config.includeTimestamp 
        ? formatDate(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS')
        : '';
      
      const pid = this.config.includePid ? process.pid : '';
      
      // Format args properly
      const formattedArgs = args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
          if (arg instanceof Error) {
            return arg.stack || arg.message;
          }
          return util.inspect(arg, { depth: 5, colors: false });
        }
        return arg;
      });
      
      // Create log entry based on format
      let logEntry;
      if (this.config.logFormat === 'json') {
        // JSON format for structured logging
        const logData = {
          level,
          message,
          timestamp,
          pid,
          environment: this.config.environment
        };
        
        // Add additional data if provided
        if (formattedArgs.length > 0) {
          if (formattedArgs.length === 1 && typeof formattedArgs[0] === 'object' && formattedArgs[0] !== null) {
            // Merge object into log data
            logData.data = formattedArgs[0];
          } else {
            // Add as args array
            logData.args = formattedArgs;
          }
        }
        
        logEntry = JSON.stringify(logData);
      } else {
        // Text format with optional coloring for console
        const prefix = `${timestamp ? `[${timestamp}] ` : ''}${pid ? `[${pid}] ` : ''}[${level.toUpperCase()}]`;
        
        const messageWithArgs = formattedArgs.length > 0
          ? `${message} ${formattedArgs.join(' ')}`
          : message;
        
        logEntry = `${prefix} ${messageWithArgs}`;
      }
      
      // Log to console if enabled
      if (this.config.logToConsole) {
        // Add colors for console output
        const levelColor = LEVEL_COLORS[level] || '';
        const coloredLevel = `${levelColor}[${level.toUpperCase()}]${COLORS.reset}`;
        
        const coloredPrefix = `${timestamp ? `[${timestamp}] ` : ''}${pid ? `[${pid}] ` : ''}${coloredLevel}`;
        
        const consoleMessage = `${coloredPrefix} ${message}`;
        
        switch (level) {
          case 'fatal':
          case 'error':
            console.error(consoleMessage, ...args);
            break;
          case 'warn':
            console.warn(consoleMessage, ...args);
            break;
          case 'info':
            console.info(consoleMessage, ...args);
            break;
          case 'debug':
          case 'trace':
          default:
            console.log(consoleMessage, ...args);
            break;
        }
      }
      
      // Log to file if enabled
      if (this.config.logToFile && this.logStream) {
        const logLine = `${logEntry}\n`;
        this.logStream.write(logLine);
        
        // Update current log size and rotate if needed
        this.currentLogSize += Buffer.byteLength(logLine);
        if (this.currentLogSize >= this.config.maxLogFileSize) {
          this._rotateLogFile().catch(err => {
            console.error('Log rotation failed:', err);
          });
        }
      }
    } catch (error) {
      // Fallback to basic console logging if there's an error in our logging logic
      console.error('Logging error:', error);
      console.log(`[${level.toUpperCase()}] ${message}`, ...args);
    }
  }
  
  /**
   * Close the logger and flush any pending writes
   * @returns {Promise<void>}
   */
  async close() {
    if (this.logStream) {
      try {
        const closeStream = util.promisify(this.logStream.end).bind(this.logStream);
        await closeStream();
        this.info('Logger closed successfully');
      } catch (error) {
        console.error('Error closing log stream:', error);
      } finally {
        this.logStream = null;
      }
    }
  }
}

// Create and export a singleton logger instance
const logger = new Logger();

// Handle process exit to ensure logs are flushed
process.on('exit', () => {
  // Synchronous close on exit
  if (logger.logStream) {
    logger.logStream.end();
  }
});

module.exports = logger;