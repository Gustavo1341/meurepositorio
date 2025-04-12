/**
 * @fileoverview AI Handler for WhatsApp AI Sales Agent
 *
 * This module manages interactions with AI models, including:
 * - Building and sending prompts to OpenAI
 * - Processing and formatting AI responses
 * - Handling conversation context and memory
 * - Managing token usage and optimizing performance
 */

const { Configuration, OpenAIApi } = require("openai");
const axios = require("axios");
const logger = require("./logger");
const botConfig = require("./botConfig");
const memoryManager = require("./memoryManager");
const { SalesFunnelService, FUNNEL_STAGES } = require("./salesFunnelService");
const trainingLoader = require("./trainingLoader");

/**
 * Maximum number of messages to include in conversation history
 * @type {number}
 */
const MAX_CONVERSATION_HISTORY = 15;

/**
 * Maximum number of tokens to allow in the conversation history
 * @type {number}
 */
const MAX_HISTORY_TOKENS = 4000;

/**
 * Timeout for AI requests in milliseconds
 * @type {number}
 */
const REQUEST_TIMEOUT_MS = 60000;

/**
 * AI Handler class for managing AI interactions
 */
class AiHandler {
  /**
   * Create a new AiHandler instance
   */
  constructor() {
    // Initialize OpenAI configuration
    this.initializeOpenAI();

    // Load training context
    this.trainingContext = null;
    this.trainingContextLoaded = false;

    // Token counting function (approximate)
    this.countTokens = this._simpleTokenCount;

    logger.info("AiHandler initialized");
  }

  /**
   * Initialize OpenAI client
   * @private
   */
  initializeOpenAI() {
    if (botConfig.openai.useLocalModel) {
      logger.info("Using local model for AI interactions");
      this.useLocalModel = true;
      this.localModelConfig = botConfig.openai.localModelConfig;
      this.openai = null; // Not using OpenAI client for local models
    } else {
      // Initialize OpenAI client
      const configuration = new Configuration({
        apiKey: botConfig.openai.apiKey,
        basePath: botConfig.openai.apiBaseUrl,
      });

      this.openai = new OpenAIApi(configuration);
      this.useLocalModel = false;
      logger.info(
        `OpenAI client initialized with model: ${botConfig.openai.model}`
      );
    }
  }

  /**
   * Load and prepare training context for the AI
   * @returns {Promise<void>}
   */
  async loadTrainingContext() {
    try {
      if (this.trainingContextLoaded) {
        logger.debug("Training context already loaded, skipping");
        return;
      }

      logger.info("Loading training context");
      this.trainingContext = await trainingLoader.prepareTrainingContext();
      this.trainingContextLoaded = true;

      logger.info(
        `Training context loaded with ${this.trainingContext.stats.files} files`
      );
    } catch (error) {
      logger.error("Failed to load training context:", error);
      this.trainingContext = {
        generalData: "",
        specificData: {},
        productData: null,
        socialProofAssets: [],
      };
    }
  }

  /**
   * Process a user message and generate AI response
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} userMessage - The user's message
   * @param {Object} chatState - Current chat state
   * @returns {Promise<Object>} The AI response
   */
  async processUserMessage(phoneNumber, userMessage, chatState) {
    try {
      logger.debug(
        `Processing message from ${phoneNumber}: "${userMessage.substring(
          0,
          50
        )}${userMessage.length > 50 ? "..." : ""}"`
      );

      // Ensure training context is loaded
      if (!this.trainingContextLoaded) {
        await this.loadTrainingContext();
      }

      // Update chat state with new message if not already included
      const updatedState = { ...chatState };
      if (!updatedState.messages) {
        updatedState.messages = [];
      }

      // Check if this message is already in the history
      const messageExists = updatedState.messages.some(
        (m) => m.role === "user" && m.content === userMessage
      );

      // Add user message to history if not already there
      if (!messageExists) {
        updatedState.messages.push({
          role: "user",
          content: userMessage,
          timestamp: new Date().toISOString(),
        });
      }

      // Determine current funnel stage
      const currentFunnelStage = await SalesFunnelService.determineCurrentStage(
        phoneNumber,
        updatedState
      );

      logger.debug(
        `Current funnel stage for ${phoneNumber}: ${currentFunnelStage}`
      );

      // Generate system prompt based on funnel stage
      const systemPrompt = await SalesFunnelService.generateSystemPrompt(
        currentFunnelStage,
        updatedState,
        botConfig.identity,
        this.trainingContext,
        this.trainingContext.socialProofAssets
      );

      // Prepare messages for OpenAI
      const messages = this._prepareMessagesForAI(
        systemPrompt,
        updatedState.messages
      );

      // Send to OpenAI and get response
      const aiResponse = await this._sendToAI(messages);

      // Process the AI response
      const processedResponse = this._processAIResponse(
        aiResponse,
        currentFunnelStage
      );

      // Detect stage transitions based on AI response
      const suggestedStage = this._detectStageSuggestion(
        processedResponse.content,
        currentFunnelStage
      );
      if (suggestedStage && suggestedStage !== currentFunnelStage) {
        logger.info(
          `Stage transition suggested for ${phoneNumber}: ${currentFunnelStage} -> ${suggestedStage}`
        );
        processedResponse.suggestedStage = suggestedStage;
      }

      // If active upsell/downsell, analyze response
      if (
        currentFunnelStage === FUNNEL_STAGES.UPSELL ||
        currentFunnelStage === FUNNEL_STAGES.DOWNSELL
      ) {
        // Get active offer details
        const offerType =
          currentFunnelStage === FUNNEL_STAGES.UPSELL
            ? "active_upsell"
            : "active_downsell";
        const offerMem = await memoryManager.getLatestMemoryEntry(
          phoneNumber,
          offerType
        );

        if (offerMem && offerMem.value) {
          // Analyze user response to the offer
          const responseAnalysis =
            SalesFunnelService.analyzeUpsellResponse(userMessage);

          if (responseAnalysis.confidence > 0.7) {
            // Record the response
            await SalesFunnelService.recordOfferResponse(
              phoneNumber,
              currentFunnelStage === FUNNEL_STAGES.UPSELL
                ? "upsell"
                : "downsell",
              offerMem.value.targetPlanId,
              responseAnalysis.accepted
            );

            // Add metadata for downstream processing
            processedResponse.metadata = {
              ...processedResponse.metadata,
              offerResponse: responseAnalysis,
            };
          }
        }
      }

      // Add assistant message to history
      updatedState.messages.push({
        role: "assistant",
        content: processedResponse.content,
        timestamp: new Date().toISOString(),
      });

      // Truncate history if needed
      if (updatedState.messages.length > MAX_CONVERSATION_HISTORY * 2) {
        // Keep the first system message if present
        const systemMessage = updatedState.messages.find(
          (m) => m.role === "system"
        );

        // Keep the most recent messages
        const recentMessages = updatedState.messages.slice(
          -MAX_CONVERSATION_HISTORY * 2
        );

        updatedState.messages = systemMessage
          ? [systemMessage, ...recentMessages]
          : recentMessages;
      }

      return {
        response: processedResponse,
        updatedState,
      };
    } catch (error) {
      logger.error(`Error processing message from ${phoneNumber}:`, error);

      // Return a fallback response
      return {
        response: {
          content:
            "Desculpe, estou enfrentando dificuldades técnicas no momento. Poderia tentar novamente em alguns instantes?",
        },
        updatedState: chatState,
      };
    }
  }

  /**
   * Prepare messages array for AI API
   * @private
   * @param {string} systemPrompt - The system prompt
   * @param {Array<Object>} conversationHistory - Conversation history
   * @returns {Array<Object>} Prepared messages
   */
  _prepareMessagesForAI(systemPrompt, conversationHistory) {
    // Start with system message
    const messages = [{ role: "system", content: systemPrompt }];

    // Get recent conversation history
    const recentMessages = [...conversationHistory];

    // Trim history if too large (approximate token counting)
    let totalTokens = this.countTokens(systemPrompt);
    let historyToInclude = [];

    // Process messages from most recent to oldest until we hit the token limit
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      const msgTokens = this.countTokens(msg.content);

      // Skip system messages in the history (we already have a new system prompt)
      if (msg.role === "system") continue;

      if (totalTokens + msgTokens <= MAX_HISTORY_TOKENS) {
        historyToInclude.unshift(msg);
        totalTokens += msgTokens;
      } else {
        // Stop adding once we exceed the token limit
        break;
      }
    }

    // Add the selected conversation history
    historyToInclude.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });

    logger.debug(
      `Prepared ${messages.length} messages for AI with ~${totalTokens} tokens`
    );
    return messages;
  }

  /**
   * Send messages to AI and get response
   * @private
   * @param {Array<Object>} messages - The messages to send to the AI
   * @returns {Promise<Object>} The AI response
   */
  async _sendToAI(messages) {
    if (this.useLocalModel) {
      return this._sendToLocalModel(messages);
    } else {
      return this._sendToOpenAI(messages);
    }
  }

  /**
   * Send messages to OpenAI API
   * @private
   * @param {Array<Object>} messages - The messages to send to OpenAI
   * @returns {Promise<Object>} The OpenAI response
   */
  async _sendToOpenAI(messages) {
    let response = null;
    let attempts = 0;
    const maxRetries = botConfig.openai.retryConfig.maxRetries;
    let delay = botConfig.openai.retryConfig.initialDelayMs;

    while (attempts <= maxRetries) {
      try {
        logger.debug(
          `Sending request to OpenAI (attempt ${attempts + 1}/${
            maxRetries + 1
          })`
        );

        response = await this.openai.createChatCompletion(
          {
            model: botConfig.openai.model,
            messages,
            temperature: botConfig.openai.temperature,
            max_tokens: botConfig.openai.maxTokens,
            top_p: botConfig.openai.topP,
            presence_penalty: botConfig.openai.presencePenalty,
            frequency_penalty: botConfig.openai.frequencyPenalty,
          },
          {
            timeout: REQUEST_TIMEOUT_MS,
          }
        );

        // If we get here, the request was successful
        break;
      } catch (error) {
        attempts++;

        // Check if we should retry
        const shouldRetry =
          attempts <= maxRetries && this._isRetryableError(error);

        if (shouldRetry) {
          logger.warn(
            `OpenAI request failed (attempt ${attempts}/${
              maxRetries + 1
            }), retrying in ${delay}ms: ${error.message}`
          );

          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, delay));

          // Exponential backoff with jitter
          delay = Math.min(
            delay * 2 * (0.8 + 0.4 * Math.random()), // Add jitter
            botConfig.openai.retryConfig.maxDelayMs
          );
        } else {
          // Either we've exhausted retries or the error isn't retryable
          logger.error(
            `OpenAI request failed after ${attempts} attempts:`,
            error
          );
          throw error;
        }
      }
    }

    // Process the successful response
    if (
      !response ||
      !response.data ||
      !response.data.choices ||
      !response.data.choices[0]
    ) {
      throw new Error("Invalid response from OpenAI");
    }

    return response.data.choices[0].message;
  }

  /**
   * Send messages to a local model API
   * @private
   * @param {Array<Object>} messages - The messages to send to the local model
   * @returns {Promise<Object>} The model response
   */
  async _sendToLocalModel(messages) {
    let response = null;
    let attempts = 0;
    const maxRetries = botConfig.openai.retryConfig.maxRetries;
    let delay = botConfig.openai.retryConfig.initialDelayMs;

    while (attempts <= maxRetries) {
      try {
        logger.debug(
          `Sending request to local model at ${
            this.localModelConfig.apiUrl
          } (attempt ${attempts + 1}/${maxRetries + 1})`
        );

        // Use axios to send request to local model endpoint
        response = await axios.post(
          `${this.localModelConfig.apiUrl}/chat/completions`,
          {
            model: this.localModelConfig.model,
            messages,
            temperature: botConfig.openai.temperature,
            max_tokens: botConfig.openai.maxTokens,
            top_p: botConfig.openai.topP,
            presence_penalty: botConfig.openai.presencePenalty,
            frequency_penalty: botConfig.openai.frequencyPenalty,
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.localModelConfig.apiKey}`,
            },
            timeout: REQUEST_TIMEOUT_MS,
          }
        );

        // If we get here, the request was successful
        break;
      } catch (error) {
        attempts++;

        // Check if we should retry
        const shouldRetry =
          attempts <= maxRetries && this._isRetryableError(error);

        if (shouldRetry) {
          logger.warn(
            `Local model request failed (attempt ${attempts}/${
              maxRetries + 1
            }), retrying in ${delay}ms: ${error.message}`
          );

          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, delay));

          // Exponential backoff with jitter
          delay = Math.min(
            delay * 2 * (0.8 + 0.4 * Math.random()),
            botConfig.openai.retryConfig.maxDelayMs
          );
        } else {
          // Either we've exhausted retries or the error isn't retryable
          logger.error(
            `Local model request failed after ${attempts} attempts:`,
            error
          );
          throw error;
        }
      }
    }

    // Process the successful response
    if (
      !response ||
      !response.data ||
      !response.data.choices ||
      !response.data.choices[0]
    ) {
      throw new Error("Invalid response from local model");
    }

    return response.data.choices[0].message;
  }

  /**
   * Process the AI response and extract special commands
   * @private
   * @param {Object} aiResponse - The raw AI response
   * @param {string} currentFunnelStage - The current funnel stage
   * @returns {Object} Processed response with extracted metadata
   */
  _processAIResponse(aiResponse, currentFunnelStage) {
    // Default response structure
    const processedResponse = {
      content: aiResponse.content,
      metadata: {},
      actions: [],
    };

    // Extract special commands from content
    const specialCommands = this._extractSpecialCommands(aiResponse.content);

    // Clean content by removing special commands
    if (specialCommands.length > 0) {
      processedResponse.content = this._removeSpecialCommands(
        aiResponse.content
      );
    }

    // Process each special command
    specialCommands.forEach((command) => {
      // Add to actions list
      processedResponse.actions.push(command);

      // Process specific command types
      switch (command.type) {
        case "prova_social":
          // Store social proof ID for later use
          processedResponse.metadata.socialProofId = command.id;
          break;
        case "checkout":
          // Store checkout plan ID for later use
          processedResponse.metadata.checkoutPlanId = command.id;
          break;
        case "etapa":
          // Store suggested stage transition
          processedResponse.metadata.suggestedStage = command.id;
          break;
        case "suporte":
          // Mark for human support handoff
          processedResponse.metadata.requiresHumanSupport = true;
          break;
      }
    });

    return processedResponse;
  }

  /**
   * Extract special commands from AI response
   * @private
   * @param {string} content - The AI response content
   * @returns {Array<Object>} Extracted commands
   */
  _extractSpecialCommands(content) {
    const commands = [];

    // Command pattern: !command_type:[command_id]
    const commandPattern =
      /!(prova_social|checkout|etapa|suporte)(?::\s*([a-z0-9_-]+))?/gi;
    let match;

    while ((match = commandPattern.exec(content)) !== null) {
      const fullCommand = match[0];
      const type = match[1].toLowerCase();
      const id = match[2] || "";

      commands.push({
        type,
        id,
        fullCommand,
      });
    }

    return commands;
  }

  /**
   * Remove special commands from AI response content
   * @private
   * @param {string} content - The AI response content
   * @returns {string} Cleaned content
   */
  _removeSpecialCommands(content) {
    // Remove command pattern: !command_type:[command_id]
    return content
      .replace(
        /!(prova_social|checkout|etapa|suporte)(?::\s*[a-z0-9_-]+)?/gi,
        ""
      )
      .replace(/\n{3,}/g, "\n\n") // Remove excessive newlines
      .trim();
  }

  /**
   * Detect suggested stage transitions from AI response
   * @private
   * @param {string} content - The AI response content
   * @param {string} currentStage - The current funnel stage
   * @returns {string|null} Suggested stage or null
   */
  _detectStageSuggestion(content, currentStage) {
    // Check for explicit stage commands in the response
    const stageCommand = /!etapa:([a-z_]+)/i.exec(content);
    if (stageCommand && stageCommand[1]) {
      const suggestedStage = stageCommand[1].toLowerCase();

      // Validate that it's a valid stage
      if (Object.values(FUNNEL_STAGES).includes(suggestedStage)) {
        return suggestedStage;
      }
    }

    // Otherwise, use content analysis to detect implicit stage transitions
    // Simple regex-based detection for common transition indicators
    const stageIndicators = {
      [FUNNEL_STAGES.QUALIFICATION]: [
        /poderia me contar mais sobre/i,
        /me fale um pouco sobre sua empresa/i,
        /quantos funcionários vocês têm/i,
        /qual o tamanho da sua operação/i,
      ],
      [FUNNEL_STAGES.NEED_DISCOVERY]: [
        /quais são os principais desafios/i,
        /o que você busca resolver/i,
        /quais problemas você enfrenta/i,
        /o que tem sido difícil no seu processo/i,
      ],
      [FUNNEL_STAGES.PAIN_POINT_EXPLORATION]: [
        /quanto isso tem custado para você/i,
        /qual o impacto desse problema/i,
        /como isso afeta seus resultados/i,
        /que consequências isso traz/i,
      ],
      [FUNNEL_STAGES.SOLUTION_PRESENTATION]: [
        /nossa solução pode ajudar/i,
        /temos uma solução que/i,
        /nosso produto resolve isso/i,
        /deixe-me apresentar como podemos/i,
      ],
      [FUNNEL_STAGES.VALUE_PROPOSITION]: [
        /o valor que entregamos/i,
        /o retorno sobre o investimento/i,
        /nossos clientes conseguem/i,
        /em termos de resultados/i,
      ],
      [FUNNEL_STAGES.OBJECTION_HANDLING]: [
        /entendo sua preocupação/i,
        /é natural ter essa dúvida/i,
        /muitos clientes também questionam/i,
        /compreendo seu ponto/i,
      ],
      [FUNNEL_STAGES.PRICE_DISCUSSION]: [
        /o investimento para/i,
        /nossos preços são/i,
        /temos diferentes planos/i,
        /o valor do nosso produto/i,
      ],
      [FUNNEL_STAGES.CLOSING]: [
        /podemos seguir com/i,
        /qual plano faz mais sentido para você/i,
        /quer começar com/i,
        /vamos avançar com/i,
      ],
    };

    // Check for stage indicators
    for (const [stage, patterns] of Object.entries(stageIndicators)) {
      // Only consider forward transitions
      // This is a simplified check - in a real system, you'd use a proper stage progression graph
      if (stage === currentStage) continue;

      const matchesPattern = patterns.some((pattern) => pattern.test(content));
      if (matchesPattern) {
        return stage;
      }
    }

    return null;
  }

  /**
   * Check if an error is retryable
   * @private
   * @param {Error} error - The error to check
   * @returns {boolean} Whether the error is retryable
   */
  _isRetryableError(error) {
    // Network errors are retryable
    if (axios.isAxiosError(error)) {
      // Timeout errors
      if (error.code === "ECONNABORTED") {
        return true;
      }

      // No response or server errors (5xx)
      if (
        !error.response ||
        (error.response.status >= 500 && error.response.status < 600)
      ) {
        return true;
      }

      // Rate limiting errors
      if (error.response && error.response.status === 429) {
        return true;
      }

      // Other non-retryable client errors
      if (
        error.response &&
        error.response.status >= 400 &&
        error.response.status < 500
      ) {
        // Don't retry bad requests or unauthorized
        if (error.response.status === 400 || error.response.status === 401) {
          return false;
        }

        // Other 4xx errors might be retryable
        return true;
      }
    }

    // Some OpenAI specific errors
    if (
      error.message &&
      (error.message.includes("timeout") ||
        error.message.includes("rate limit") ||
        error.message.includes("overloaded") ||
        error.message.includes("internal error") ||
        error.message.includes("service unavailable"))
    ) {
      return true;
    }

    return false;
  }

  /**
   * Simple token counting function (approximation)
   * @private
   * @param {string} text - Text to count tokens for
   * @returns {number} Approximate token count
   */
  _simpleTokenCount(text) {
    if (!text) return 0;

    // Very rough approximation: 4 chars per token on average
    // More accurate counting would use a proper tokenizer
    return Math.ceil(text.length / 4);
  }

  /**
   * Transcribe audio to text using OpenAI's Whisper API
   * @param {Buffer} audioBuffer - Audio data as buffer
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} Transcription result
   */
  async transcribeAudio(audioBuffer, options = {}) {
    try {
      logger.debug("Transcribing audio with Whisper API");

      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer]);

      formData.append("file", audioBlob, "audio.ogg");
      formData.append("model", botConfig.whisper.model);

      if (botConfig.whisper.language) {
        formData.append("language", botConfig.whisper.language);
      }

      // Optional parameters
      if (botConfig.whisper.translateToPortuguese) {
        formData.append("response_format", "text");
      }

      const response = await this.openai.createTranscription(
        audioBuffer,
        botConfig.whisper.model,
        undefined,
        "text",
        1,
        botConfig.whisper.language
      );

      if (!response || !response.data) {
        throw new Error("Invalid response from Whisper API");
      }

      logger.debug("Audio transcription successful");

      return {
        success: true,
        text: response.data,
        language: botConfig.whisper.language,
      };
    } catch (error) {
      logger.error("Audio transcription failed:", error);

      return {
        success: false,
        error: error.message,
        text: "",
      };
    }
  }
}

// Create and export singleton instance
const aiHandler = new AiHandler();
module.exports = aiHandler;
