/**
 * @fileoverview Central Type Definitions for WhatsApp AI Sales Agent
 *
 * This module defines the types and interfaces used throughout the application.
 * While JavaScript doesn't have native TypeScript-like type checking,
 * these definitions serve as documentation and can be used with JSDoc
 * for better code intelligence and validation in modern IDEs.
 */

/**
 * @typedef {Object} HistoryMessage
 * @property {string} role - The role of the message sender ('user', 'assistant', 'system')
 * @property {string} content - The content of the message
 * @property {string} [timestamp] - ISO timestamp of when the message was sent
 * @property {Object} [metadata] - Additional metadata about the message
 */

/**
 * @typedef {Object} ChatState
 * @property {string} phoneNumber - The phone number identifier for the chat
 * @property {string} [contactName] - The contact name if available
 * @property {Array<HistoryMessage>} messages - The history of messages in the chat
 * @property {string} [currentStage] - The current sales funnel stage
 * @property {Object} [metadata] - Additional metadata about the chat state
 * @property {boolean} [isActive] - Whether the chat is currently active
 * @property {string} [lastInteractionTime] - ISO timestamp of the last interaction
 */

/**
 * @typedef {Object} BotIdentity
 * @property {string} firstName - The first name of the bot
 * @property {string} [lastName] - The last name of the bot
 * @property {string} position - The job position/title of the bot
 * @property {string} company - The company name the bot represents
 * @property {string} tone - Description of the bot's tone and communication style
 * @property {Object} [personalDetails] - Additional personal details for more natural conversations
 */

/**
 * @typedef {Object} BotBehavior
 * @property {Object} responseSettings - Settings for response timing and behavior
 * @property {number} responseSettings.typingDelayMinMs - Minimum typing delay in milliseconds
 * @property {number} responseSettings.typingDelayMaxMs - Maximum typing delay in milliseconds
 * @property {number} responseSettings.betweenMessagesMinMs - Minimum delay between messages in milliseconds
 * @property {number} responseSettings.betweenMessagesMaxMs - Maximum delay between messages in milliseconds
 * @property {number} responseSettings.groupingDelaySeconds - Time to wait for grouping user messages in seconds
 * @property {Object} messageSettings - Settings for message formatting and structure
 * @property {number} messageSettings.maxCharsPerMessage - Maximum characters per message
 * @property {boolean} messageSettings.splitInParagraphs - Whether to split long messages at paragraph breaks
 * @property {boolean} spamProtection - Whether spam protection is enabled
 * @property {number} maxMessagesPerMinute - Maximum messages allowed per minute (anti-spam)
 */

/**
 * @typedef {Object} OpenAIConfig
 * @property {string} apiKey - The OpenAI API key
 * @property {string} model - The model to use (e.g., 'gpt-4', 'gpt-3.5-turbo')
 * @property {number} temperature - The temperature setting for response generation
 * @property {number} maxTokens - Maximum tokens for the API response
 * @property {number} topP - Top-p sampling parameter
 * @property {number} presencePenalty - Presence penalty parameter
 * @property {number} frequencyPenalty - Frequency penalty parameter
 * @property {Object} [retryConfig] - Configuration for API retry logic
 * @property {number} retryConfig.maxRetries - Maximum number of retry attempts
 * @property {number} retryConfig.initialDelayMs - Initial delay before first retry in milliseconds
 * @property {number} retryConfig.maxDelayMs - Maximum delay between retries in milliseconds
 */

/**
 * @typedef {Object} WhisperConfig
 * @property {string} model - The Whisper model to use for speech-to-text
 * @property {string} language - The language code for transcription
 * @property {number} [maxDurationSeconds] - Maximum audio duration to process in seconds
 * @property {boolean} [translateToPortuguese] - Whether to translate non-Portuguese audio to Portuguese
 */

/**
 * @typedef {Object} ServerConfig
 * @property {number} port - The port for the Express API server
 * @property {string} host - The host for the Express API server
 * @property {boolean} enabled - Whether the API server is enabled
 * @property {Object} security - Security settings for the API server
 * @property {string} security.apiToken - API token for authentication
 * @property {boolean} security.rateLimit - Whether rate limiting is enabled
 * @property {number} security.maxRequestsPerMinute - Maximum requests allowed per minute
 */

/**
 * @typedef {Object} BotConfig
 * @property {BotIdentity} identity - The identity configuration of the bot
 * @property {BotBehavior} behavior - The behavior configuration of the bot
 * @property {OpenAIConfig} openai - The OpenAI API configuration
 * @property {WhisperConfig} whisper - The Whisper API configuration
 * @property {ServerConfig} server - The API server configuration
 * @property {Object} whatsapp - WhatsApp client configuration
 * @property {boolean} debug - Whether debug mode is enabled
 * @property {string} logLevel - The logging level
 */

/**
 * @typedef {Object} TrainingContext
 * @property {string} generalData - General training data as text
 * @property {Object} specificData - Specific training data organized by keys
 * @property {Object} productData - Product information data
 * @property {Array<Object>} socialProofAssets - Available social proof assets
 * @property {Object} stats - Statistics about the training data
 */

/**
 * @typedef {Object} Product
 * @property {string} id - Unique identifier for the product
 * @property {string} name - Name of the product
 * @property {string} description - Detailed description of the product
 * @property {string} [shortDescription] - Short description for the product
 * @property {string} [category] - Category the product belongs to
 * @property {Array<Plan>} plans - Available plans for the product
 * @property {Object} features - Features of the product organized by category
 * @property {Array<Object>} [faqs] - Frequently asked questions about the product
 */

/**
 * @typedef {Object} Plan
 * @property {string} id - Unique identifier for the plan
 * @property {string} name - Name of the plan
 * @property {number} price - Price of the plan
 * @property {string} billingCycle - Billing cycle ('monthly', 'annual', 'one-time')
 * @property {string} description - Description of the plan
 * @property {Array<string>} features - Features included in the plan
 * @property {boolean} [popular] - Whether this is a popular/recommended plan
 * @property {string} [checkoutLink] - Link to checkout for this plan
 * @property {Array<string>} [compareWith] - IDs of plans to compare with
 */

/**
 * @typedef {Object} SocialProofAsset
 * @property {string} id - Unique identifier for the asset
 * @property {string} type - Type of asset ('image', 'video', 'audio', 'document')
 * @property {string} description - Description of the social proof asset
 * @property {string} filename - Filename of the asset
 * @property {string} path - Path to the asset file
 * @property {Array<string>} [tags] - Tags for categorizing the asset
 */

/**
 * @typedef {string} FunnelStageId
 * Valid values: 'greeting', 'qualification', 'need_discovery', 'pain_point_exploration',
 * 'solution_presentation', 'product_demonstration', 'value_proposition', 'proof_and_credibility',
 * 'objection_handling', 'price_discussion', 'closing', 'checkout', 'post_purchase_followup',
 * 'upsell', 'downsell', 'cross_sell', 'reactivation', 'feedback'
 */

/**
 * @typedef {Object} FunnelStage
 * @property {FunnelStageId} id - Unique identifier for the funnel stage
 * @property {string} name - Human-readable name of the stage
 * @property {string} description - Description of the stage
 * @property {Array<string>} [nextStages] - IDs of possible next stages
 * @property {Array<string>} [previousStages] - IDs of possible previous stages
 * @property {Object} [instructionsForAI] - Specific instructions for the AI in this stage
 */

/**
 * @typedef {Object} ClientFunnelConfig
 * @property {string} clientId - Unique identifier for the client
 * @property {FunnelStageId} currentStage - Current stage in the funnel
 * @property {Object} [stageData] - Additional data specific to the current stage
 * @property {string} [lastTransitionTime] - ISO timestamp of the last stage transition
 * @property {Array<Object>} [stageHistory] - History of stage transitions
 */

/**
 * @typedef {Object} ApiRequest
 * @property {string} [phoneNumber] - Target phone number for the message
 * @property {string} [message] - Text message to send
 * @property {Object} [media] - Media to attach to the message
 * @property {string} [apiKey] - API authentication key
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success - Whether the API request was successful
 * @property {string} [message] - Response message
 * @property {Object} [data] - Response data
 * @property {string} [error] - Error message if request failed
 */

/**
 * @typedef {Object} TranscriptionResult
 * @property {boolean} success - Whether the transcription was successful
 * @property {string} [text] - The transcribed text
 * @property {string} [error] - Error message if transcription failed
 * @property {number} [durationSeconds] - Duration of the audio in seconds
 * @property {string} [language] - Detected language of the audio
 */

/**
 * @typedef {Object} MemoryEntry
 * @property {string} id - Unique identifier for the memory entry
 * @property {string} conversationId - ID of the conversation this entry belongs to
 * @property {string} type - Type of memory entry
 * @property {string} key - Key for the memory entry
 * @property {string|Object} value - Value stored in the memory entry
 * @property {Date} createdAt - When the entry was created
 * @property {Date} updatedAt - When the entry was last updated
 */

/**
 * @typedef {Object} AiResponse
 * @property {string} content - The text content of the AI response
 * @property {Object} [metadata] - Additional metadata from the AI response
 * @property {Array<string>} [actions] - Special actions to take (send media, checkout link, etc.)
 * @property {string} [suggestedStage] - Suggested next funnel stage
 */

/**
 * @typedef {Object} WhatsAppMessageMedia
 * @property {string} mimetype - MIME type of the media
 * @property {Buffer|string} data - Media data as Buffer or base64 string
 * @property {string} [filename] - Filename for the media
 * @property {string} [caption] - Caption for the media
 */

/**
 * @typedef {Object} SalesReport
 * @property {string} timeframe - Timeframe for the report ('daily', 'weekly', 'monthly')
 * @property {Date} startDate - Start date for the report period
 * @property {Date} endDate - End date for the report period
 * @property {number} totalConversations - Total number of conversations
 * @property {number} newLeads - Number of new leads generated
 * @property {number} qualifiedLeads - Number of qualified leads
 * @property {number} sales - Number of completed sales
 * @property {number} revenue - Total revenue generated
 * @property {Object} funnelMetrics - Metrics for each funnel stage
 * @property {Array<Object>} conversionRates - Conversion rates between stages
 */

// Environment-specific configurations
/**
 * @typedef {Object} EnvironmentVariables
 * @property {string} NODE_ENV - Environment ('development', 'production', 'test')
 * @property {string} OPENAI_API_KEY - OpenAI API key
 * @property {string} OPENAI_MODEL - OpenAI model to use
 * @property {string} DATABASE_URL - Database connection URL
 * @property {string} API_TOKEN - API authentication token
 * @property {string} LOG_LEVEL - Logging level
 * @property {number} SERVER_PORT - Server port
 * @property {string} PRICING_OVERRIDE - JSON string to override pricing data
 * @property {number} TYPING_DELAY_MIN - Minimum typing delay in milliseconds
 * @property {number} TYPING_DELAY_MAX - Maximum typing delay in milliseconds
 */

module.exports = {
  // This is just a placeholder for JSDoc type definitions
  // The actual exports are empty since these are just type definitions
  // used for documentation and code intelligence in IDEs that support JSDoc
};
