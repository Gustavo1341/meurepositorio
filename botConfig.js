/**
 * @fileoverview Bot Configuration for WhatsApp AI Sales Agent
 *
 * This module defines the configuration for the WhatsApp AI Sales Agent,
 * including its identity, behavior, API settings, and server configuration.
 * Configuration is loaded from environment variables with sensible defaults.
 */

const dotenv = require("dotenv");
const path = require("path");
const logger = require("./logger");

// Load environment variables from .env file
dotenv.config();

/**
 * Parse a boolean value from an environment variable
 * @param {string} value - The environment variable value
 * @param {boolean} defaultValue - Default value if parsing fails
 * @returns {boolean} The parsed boolean value
 */
function parseBooleanEnv(value, defaultValue) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const normalized = String(value).toLowerCase().trim();

  if (["true", "yes", "1", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "no", "0", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

/**
 * Parse an integer value from an environment variable
 * @param {string} value - The environment variable value
 * @param {number} defaultValue - Default value if parsing fails
 * @param {number} [minValue] - Minimum allowed value
 * @param {number} [maxValue] - Maximum allowed value
 * @returns {number} The parsed integer value
 */
function parseIntEnv(value, defaultValue, minValue = null, maxValue = null) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const parsedValue = parseInt(value, 10);

  if (isNaN(parsedValue)) {
    return defaultValue;
  }

  if (minValue !== null && parsedValue < minValue) {
    return minValue;
  }

  if (maxValue !== null && parsedValue > maxValue) {
    return maxValue;
  }

  return parsedValue;
}

/**
 * Parse a float value from an environment variable
 * @param {string} value - The environment variable value
 * @param {number} defaultValue - Default value if parsing fails
 * @param {number} [minValue] - Minimum allowed value
 * @param {number} [maxValue] - Maximum allowed value
 * @returns {number} The parsed float value
 */
function parseFloatEnv(value, defaultValue, minValue = null, maxValue = null) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const parsedValue = parseFloat(value);

  if (isNaN(parsedValue)) {
    return defaultValue;
  }

  if (minValue !== null && parsedValue < minValue) {
    return minValue;
  }

  if (maxValue !== null && parsedValue > maxValue) {
    return maxValue;
  }

  return parsedValue;
}

/**
 * Parse a JSON value from an environment variable
 * @param {string} value - The environment variable value
 * @param {any} defaultValue - Default value if parsing fails
 * @returns {any} The parsed JSON value
 */
function parseJsonEnv(value, defaultValue) {
  if (!value) {
    return defaultValue;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    logger.warn(
      `Failed to parse JSON from environment variable: ${error.message}`
    );
    return defaultValue;
  }
}

/**
 * Parse a comma-separated list from an environment variable
 * @param {string} value - The environment variable value
 * @param {Array} defaultValue - Default value if parsing fails
 * @returns {Array<string>} The parsed array
 */
function parseArrayEnv(value, defaultValue) {
  if (!value) {
    return defaultValue;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

// Define bot identity from environment variables or defaults
const BOT_IDENTITY = {
  firstName: process.env.BOT_FIRST_NAME || "Ana",
  lastName: process.env.BOT_LAST_NAME || "Silva",
  position: process.env.BOT_POSITION || "Consultora de Vendas",
  company: process.env.BOT_COMPANY || "TechVendas Solutions",
  tone:
    process.env.BOT_TONE ||
    "Profissional, amigável e persuasiva. Comunico de forma clara e direta, usando linguagem envolvente mas não agressiva. Adapto meu estilo a cada cliente, sendo mais formal ou casual conforme necessário. Sempre busco construir rapport genuíno antes de focar em vendas.",
  personalDetails: parseJsonEnv(process.env.BOT_PERSONAL_DETAILS, {
    background:
      "Trabalho há 5 anos com consultoria de vendas, especialmente no setor de tecnologia",
    expertise:
      "Especialista em soluções de automação e otimização de processos de vendas",
    personality: "Comunicativa, atenciosa e orientada a resultados",
  }),
};

// Define bot behavior settings
const BOT_BEHAVIOR = {
  responseSettings: {
    typingDelayMinMs: parseIntEnv(
      process.env.RESPONSE_TYPING_DELAY_MIN_MS,
      1000,
      500,
      5000
    ),
    typingDelayMaxMs: parseIntEnv(
      process.env.RESPONSE_TYPING_DELAY_MAX_MS,
      2500,
      1000,
      7000
    ),
    betweenMessagesMinMs: parseIntEnv(
      process.env.RESPONSE_BETWEEN_MSG_MIN_MS,
      800,
      300,
      3000
    ),
    betweenMessagesMaxMs: parseIntEnv(
      process.env.RESPONSE_BETWEEN_MSG_MAX_MS,
      2000,
      800,
      5000
    ),
    groupingDelaySeconds: parseIntEnv(
      process.env.RESPONSE_GROUPING_DELAY_SECONDS,
      15,
      5,
      30
    ),
  },
  messageSettings: {
    maxCharsPerMessage: parseIntEnv(
      process.env.MAX_CHARS_PER_MESSAGE,
      1000,
      100,
      4000
    ),
    splitInParagraphs: parseBooleanEnv(process.env.SPLIT_IN_PARAGRAPHS, true),
  },
  spamProtection: parseBooleanEnv(process.env.ENABLE_SPAM_PROTECTION, true),
  maxMessagesPerMinute: parseIntEnv(
    process.env.MAX_MESSAGES_PER_MINUTE,
    15,
    5,
    60
  ),
  caseHandling: {
    ignoreExistingChats: parseBooleanEnv(
      process.env.IGNORE_EXISTING_CHATS,
      false
    ),
    ignoreBroadcastLists: parseBooleanEnv(
      process.env.IGNORE_BROADCAST_LISTS,
      true
    ),
    ignoreGroups: parseBooleanEnv(process.env.IGNORE_GROUPS, true),
    ignoreSelf: true, // Always ignore self messages
  },
  enableUpsellDownsell: parseBooleanEnv(
    process.env.ENABLE_UPSELL_DOWNSELL,
    true
  ),
  maxInactivityDays: parseIntEnv(process.env.MAX_INACTIVITY_DAYS, 30, 1, 365),
};

// Define OpenAI API configuration
const OPENAI_CONFIG = {
  apiKey: process.env.OPENAI_API_KEY || "",
  apiBaseUrl: process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1",
  model: process.env.OPENAI_MODEL || "gpt-4-turbo",
  temperature: parseFloatEnv(process.env.OPENAI_TEMPERATURE, 0.7, 0, 2),
  maxTokens: parseIntEnv(process.env.OPENAI_MAX_TOKENS, 1000, 100, 4000),
  topP: parseFloatEnv(process.env.OPENAI_TOP_P, 1, 0, 1),
  presencePenalty: parseFloatEnv(process.env.OPENAI_PRESENCE_PENALTY, 0, -2, 2),
  frequencyPenalty: parseFloatEnv(
    process.env.OPENAI_FREQUENCY_PENALTY,
    0,
    -2,
    2
  ),
  retryConfig: {
    maxRetries: parseIntEnv(process.env.OPENAI_MAX_RETRIES, 3, 0, 10),
    initialDelayMs: parseIntEnv(
      process.env.OPENAI_RETRY_INITIAL_DELAY_MS,
      1000,
      100,
      10000
    ),
    maxDelayMs: parseIntEnv(
      process.env.OPENAI_RETRY_MAX_DELAY_MS,
      15000,
      1000,
      60000
    ),
  },
  useLocalModel: parseBooleanEnv(process.env.USE_LOCAL_MODEL, false),
  localModelConfig: parseJsonEnv(process.env.LOCAL_MODEL_CONFIG, {
    apiUrl: "http://localhost:1234/v1",
    apiKey: "not-needed",
    model: "local-model",
  }),
};

// Define Whisper API configuration for audio transcription
const WHISPER_CONFIG = {
  model: process.env.WHISPER_MODEL || "whisper-1",
  language: process.env.WHISPER_LANGUAGE || "pt",
  maxDurationSeconds: parseIntEnv(
    process.env.WHISPER_MAX_DURATION_SECONDS,
    300,
    10,
    3600
  ),
  translateToPortuguese: parseBooleanEnv(
    process.env.WHISPER_TRANSLATE_TO_PORTUGUESE,
    true
  ),
};

// Define API server configuration
const SERVER_CONFIG = {
  port: parseIntEnv(process.env.SERVER_PORT, 3000, 1024, 65535),
  host: process.env.SERVER_HOST || "0.0.0.0",
  enabled: parseBooleanEnv(process.env.ENABLE_API_SERVER, true),
  security: {
    apiToken: process.env.API_TOKEN || "change-me-in-env-file",
    rateLimit: parseBooleanEnv(process.env.API_RATE_LIMIT, true),
    maxRequestsPerMinute: parseIntEnv(
      process.env.API_MAX_REQUESTS_PER_MINUTE,
      60,
      10,
      1000
    ),
  },
  routes: {
    sendMessage: "/api/send",
    getStatus: "/api/status",
    getStats: "/api/stats",
  },
};

// Define WhatsApp client configuration
const WHATSAPP_CONFIG = {
  sessionId: process.env.WHATSAPP_SESSION_ID || "ai-sales-agent",
  sessionFilePath:
    process.env.WHATSAPP_SESSION_FILE_PATH ||
    path.join(process.cwd(), ".wwebjs_auth"),
  headless: parseBooleanEnv(process.env.WHATSAPP_HEADLESS, true),
  qrMaxRetries: parseIntEnv(process.env.WHATSAPP_QR_MAX_RETRIES, 5, 1, 20),
  restartOnCrash: parseBooleanEnv(process.env.WHATSAPP_RESTART_ON_CRASH, true),
  browserArgs: parseArrayEnv(process.env.WHATSAPP_BROWSER_ARGS, [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--no-first-run",
    "--no-zygote",
    "--disable-gpu",
  ]),
};

// Define paths for data, logs, and assets
const PATHS_CONFIG = {
  data: process.env.DATA_PATH || path.join(process.cwd(), "data"),
  logs: process.env.LOGS_PATH || path.join(process.cwd(), "logs"),
  assets: process.env.ASSETS_PATH || path.join(process.cwd(), "assets"),
  training: process.env.TRAINING_PATH || path.join(process.cwd(), "training"),
  temp: process.env.TEMP_PATH || path.join(process.cwd(), "temp"),
};

// Combine all configurations
const botConfig = {
  identity: BOT_IDENTITY,
  behavior: BOT_BEHAVIOR,
  openai: OPENAI_CONFIG,
  whisper: WHISPER_CONFIG,
  server: SERVER_CONFIG,
  whatsapp: WHATSAPP_CONFIG,
  paths: PATHS_CONFIG,
  debug: parseBooleanEnv(process.env.DEBUG, false),
  logLevel: process.env.LOG_LEVEL || "info",
  environment: process.env.NODE_ENV || "development",
  version: process.env.npm_package_version || "1.0.0",
  appName: "WhatsApp AI Sales Agent",
  startTime: new Date().toISOString(),
};

// Validate critical configuration
function validateConfig() {
  const errors = [];

  // Check for required API keys
  if (!botConfig.openai.apiKey && !botConfig.openai.useLocalModel) {
    errors.push(
      "Missing OPENAI_API_KEY environment variable and local model is not enabled"
    );
  }

  // Check for security risks
  if (
    botConfig.server.enabled &&
    botConfig.server.security.apiToken === "change-me-in-env-file"
  ) {
    errors.push(
      "API server is enabled but API_TOKEN is still set to default value. Please change it in the .env file."
    );
  }

  // Check for valid identity configuration
  if (!botConfig.identity.firstName || !botConfig.identity.company) {
    errors.push(
      "Bot identity is incomplete. Please set BOT_FIRST_NAME and BOT_COMPANY environment variables."
    );
  }

  // Check for valid model configuration
  if (
    botConfig.openai.useLocalModel &&
    (!botConfig.openai.localModelConfig.apiUrl ||
      !botConfig.openai.localModelConfig.model)
  ) {
    errors.push(
      "Local model is enabled but configuration is incomplete. Please check LOCAL_MODEL_CONFIG."
    );
  }

  // Log validation results
  if (errors.length > 0) {
    logger.error("Configuration validation failed:");
    errors.forEach((error) => logger.error(`- ${error}`));
  } else {
    logger.info("Configuration validation successful");
  }

  return errors;
}

// Validate configuration and store result
botConfig.validationErrors = validateConfig();

// Export the configuration
module.exports = botConfig;
