/**
 * @fileoverview Chat Handler for WhatsApp AI Sales Agent
 * 
 * This module manages the chat flow, including:
 * - Processing incoming messages
 * - Coordinating between AI responses and WhatsApp replies
 * - Managing conversation state
 * - Handling media messages and audio transcription
 * - Implementing typing indicators and realistic delays
 */

const fs = require('fs').promises;
const path = require('path');
const { Readable } = require('stream');
const logger = require('./logger');
const aiHandler = require('./aiHandler');
const memoryManager = require('./memoryManager');
const botConfig = require('./botConfig');
const { SalesFunnelService, FUNNEL_STAGES } = require('./salesFunnelService');
const { pricingData, findPlanById, findProductById } = require('./pricing');
const { createTempFile, cleanupTempFiles } = require('./utils');

/**
 * Maximum time (in milliseconds) to wait for receiving multiple messages
 * @type {number}
 */
const MESSAGE_GROUPING_DELAY = botConfig.behavior.responseSettings.groupingDelaySeconds * 1000;

/**
 * Maximum size for audio files to transcribe (in bytes)
 * @type {number}
 */
const MAX_AUDIO_SIZE = 15 * 1024 * 1024; // 15MB

/**
 * Chat Handler class for managing WhatsApp interactions
 */
class ChatHandler {
  /**
   * Create a new ChatHandler instance
   * @param {Object} whatsappClient - The WhatsApp client instance
   */
  constructor(whatsappClient) {
    this.whatsappClient = whatsappClient;
    this.incomingMessages = new Map(); // Map to group incoming messages
    this.processingChats = new Map(); // Track currently processing chats
    this.typingIndicators = new Map(); // Track active typing indicators
    this.messageQueues = new Map(); // Queue of messages to be sent
    this.audioTranscriptionInProgress = new Set(); // Track audio transcriptions in progress
    
    // Spam protection
    this.messageCounters = new Map(); // Track message counts for spam protection
    
    logger.info('ChatHandler initialized');
  }

  /**
   * Process an incoming message
   * @param {Object} message - The incoming WhatsApp message
   * @returns {Promise<void>}
   */
  async handleIncomingMessage(message) {
    try {
      // Extract key information from the message
      const chat = await message.getChat();
      const contact = await message.getContact();
      const phoneNumber = contact.id.user;
      
      // Skip if this is a broadcast list
      if (chat.isBroadcast && botConfig.behavior.caseHandling.ignoreBroadcastLists) {
        logger.debug(`Ignoring message from broadcast list: ${phoneNumber}`);
        return;
      }
      
      // Skip if this is a group chat
      if (chat.isGroup && botConfig.behavior.caseHandling.ignoreGroups) {
        logger.debug(`Ignoring message from group chat: ${chat.name}`);
        return;
      }
      
      // Skip if this message is from the bot itself
      if (message.fromMe && botConfig.behavior.caseHandling.ignoreSelf) {
        logger.debug(`Ignoring message from self to: ${phoneNumber}`);
        return;
      }
      
      // Check for spam
      if (botConfig.behavior.spamProtection && this._isSpamming(phoneNumber)) {
        logger.warn(`Spam protection triggered for ${phoneNumber}, ignoring message`);
        return;
      }
      
      // Initialize or increment message counter for spam protection
      this._updateMessageCounter(phoneNumber);
      
      // Check if we have a pending message group for this chat
      this._addToMessageGroup(phoneNumber, message);
    } catch (error) {
      logger.error('Error handling incoming message:', error);
    }
  }

  /**
   * Add an incoming message to a group for batched processing
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {Object} message - The incoming message
   */
  _addToMessageGroup(phoneNumber, message) {
    // Check if we already have a pending message group
    const existingGroup = this.incomingMessages.get(phoneNumber);
    
    if (existingGroup) {
      // Add this message to the existing group
      existingGroup.messages.push(message);
      clearTimeout(existingGroup.timeout);
      
      // Set a new timeout to process the group
      existingGroup.timeout = setTimeout(
        () => this._processMessageGroup(phoneNumber),
        MESSAGE_GROUPING_DELAY
      );
      
      logger.debug(`Added message to existing group for ${phoneNumber}, new count: ${existingGroup.messages.length}`);
    } else {
      // Create a new message group
      const timeout = setTimeout(
        () => this._processMessageGroup(phoneNumber),
        MESSAGE_GROUPING_DELAY
      );
      
      this.incomingMessages.set(phoneNumber, {
        messages: [message],
        timeout
      });
      
      logger.debug(`Created new message group for ${phoneNumber}`);
    }
  }

  /**
   * Process a group of messages from the same chat
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @returns {Promise<void>}
   */
  async _processMessageGroup(phoneNumber) {
    // Check if we have messages to process
    const messageGroup = this.incomingMessages.get(phoneNumber);
    if (!messageGroup || !messageGroup.messages.length) {
      this.incomingMessages.delete(phoneNumber);
      return;
    }
    
    // Clear the timeout and pending group
    if (messageGroup.timeout) {
      clearTimeout(messageGroup.timeout);
    }
    this.incomingMessages.delete(phoneNumber);
    
    // Check if we're already processing messages for this chat
    if (this.processingChats.has(phoneNumber)) {
      logger.debug(`Already processing chat for ${phoneNumber}, adding to existing group`);
      
      // Get the existing processor
      const existingProcessor = this.processingChats.get(phoneNumber);
      
      // Add these messages to the queue
      existingProcessor.pendingMessages.push(...messageGroup.messages);
      return;
    }
    
    // Start processing this chat
    logger.info(`Processing message group for ${phoneNumber} with ${messageGroup.messages.length} messages`);
    
    // Create a processor object to track this chat processing
    const processor = {
      pendingMessages: [...messageGroup.messages],
      isProcessing: true
    };
    this.processingChats.set(phoneNumber, processor);
    
    try {
      // Process all messages in the group
      await this._processChatMessages(phoneNumber, processor);
    } catch (error) {
      logger.error(`Error processing chat for ${phoneNumber}:`, error);
    } finally {
      // Clean up
      this.processingChats.delete(phoneNumber);
    }
  }

  /**
   * Process all messages for a chat
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {Object} processor - The chat processor object
   * @returns {Promise<void>}
   */
  async _processChatMessages(phoneNumber, processor) {
    // Get the chat state from memory
    let chatState = await this._getChatState(phoneNumber);
    
    // Process all pending messages
    while (processor.pendingMessages.length > 0) {
      const messages = [...processor.pendingMessages];
      processor.pendingMessages = [];
      
      // Extract text content from all messages
      const messageContents = await Promise.all(
        messages.map(msg => this._extractMessageContent(msg))
      );
      
      // Combine all text content
      const textContents = messageContents
        .filter(content => content && content.type === 'text')
        .map(content => content.text);
      
      // Process text content if available
      if (textContents.length > 0) {
        const combinedText = textContents.join('\n\n');
        chatState = await this._processTextMessage(phoneNumber, combinedText, chatState);
      }
      
      // Process media content
      for (const content of messageContents) {
        if (content && content.type === 'media') {
          chatState = await this._processMediaMessage(
            phoneNumber,
            content.mediaType,
            content.media,
            content.caption,
            chatState
          );
        }
      }
      
      // If new messages arrived while processing, handle them in the next loop
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Extract content from a message
   * @private
   * @param {Object} message - The WhatsApp message
   * @returns {Promise<Object|null>} Extracted content or null
   */
  async _extractMessageContent(message) {
    try {
      // Handle text message
      if (message.body) {
        return {
          type: 'text',
          text: message.body
        };
      }
      
      // Handle media message
      if (message.hasMedia) {
        const media = await message.downloadMedia();
        
        if (!media || !media.mimetype) {
          return null;
        }
        
        // Determine media type
        let mediaType = 'unknown';
        if (media.mimetype.startsWith('image/')) {
          mediaType = 'image';
        } else if (media.mimetype.startsWith('video/')) {
          mediaType = 'video';
        } else if (media.mimetype.startsWith('audio/')) {
          mediaType = 'audio';
        } else if (media.mimetype === 'application/pdf') {
          mediaType = 'document';
        }
        
        return {
          type: 'media',
          mediaType,
          media,
          caption: message.caption || ''
        };
      }
      
      // Other message types not handled
      return null;
    } catch (error) {
      logger.error('Error extracting message content:', error);
      return null;
    }
  }

  /**
   * Process a text message
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} text - The message text
   * @param {Object} chatState - The current chat state
   * @returns {Promise<Object>} Updated chat state
   */
  async _processTextMessage(phoneNumber, text, chatState) {
    logger.debug(`Processing text message from ${phoneNumber}: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
    // Send typing indicator
    await this._sendTypingIndicator(phoneNumber);
    
    try {
      // Process with AI Handler
      const { response, updatedState } = await aiHandler.processUserMessage(
        phoneNumber,
        text,
        chatState
      );
      
      // Update chat state in memory
      await this._saveChatState(phoneNumber, updatedState);
      
      // Update funnel stage if suggested
      if (response.suggestedStage) {
        await SalesFunnelService.updateFunnelStage(phoneNumber, response.suggestedStage);
      }
      
      // Process special actions
      if (response.actions && response.actions.length > 0) {
        await this._processSpecialActions(phoneNumber, response.actions, updatedState);
      }
      
      // Send the response
      await this._sendResponse(phoneNumber, response.content);
      
      return updatedState;
    } catch (error) {
      logger.error(`Error processing text message from ${phoneNumber}:`, error);
      
      // Send error message
      await this._sendResponse(
        phoneNumber,
        "Desculpe, estou enfrentando dificuldades técnicas no momento. Poderia tentar novamente em alguns instantes?"
      );
      
      return chatState;
    } finally {
      // Clear typing indicator
      await this._clearTypingIndicator(phoneNumber);
    }
  }

  /**
   * Process a media message
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} mediaType - Type of media ('image', 'video', 'audio', 'document')
   * @param {Object} media - Media data
   * @param {string} caption - Caption text
   * @param {Object} chatState - The current chat state
   * @returns {Promise<Object>} Updated chat state
   */
  async _processMediaMessage(phoneNumber, mediaType, media, caption, chatState) {
    logger.debug(`Processing ${mediaType} message from ${phoneNumber}`);
    
    // Send typing indicator
    await this._sendTypingIndicator(phoneNumber);
    
    try {
      // Process based on media type
      if (mediaType === 'audio') {
        // Handle voice messages with transcription
        return await this._processAudioMessage(phoneNumber, media, chatState);
      }
      
      // For other media types, just process the caption if present
      if (caption) {
        return await this._processTextMessage(phoneNumber, caption, chatState);
      }
      
      // If no caption and not audio, send a generic response
      if (mediaType === 'image') {
        await this._sendResponse(
          phoneNumber,
          "Recebi sua imagem! Posso ajudar com alguma dúvida sobre ela?"
        );
      } else if (mediaType === 'video') {
        await this._sendResponse(
          phoneNumber,
          "Recebi seu vídeo! Se tiver alguma pergunta sobre ele, estou à disposição."
        );
      } else if (mediaType === 'document') {
        await this._sendResponse(
          phoneNumber,
          "Recebi seu documento! Se precisar de ajuda com algo relacionado a ele, é só me dizer."
        );
      } else {
        await this._sendResponse(
          phoneNumber,
          "Recebi sua mídia! Em que posso ajudar?"
        );
      }
      
      return chatState;
    } catch (error) {
      logger.error(`Error processing media message from ${phoneNumber}:`, error);
      
      await this._sendResponse(
        phoneNumber,
        "Desculpe, não consegui processar sua mídia. Poderia tentar enviar novamente ou explicar em texto?"
      );
      
      return chatState;
    } finally {
      // Clear typing indicator
      await this._clearTypingIndicator(phoneNumber);
    }
  }

  /**
   * Process an audio message with transcription
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {Object} media - Audio media data
   * @param {Object} chatState - The current chat state
   * @returns {Promise<Object>} Updated chat state
   */
  async _processAudioMessage(phoneNumber, media, chatState) {
    // Check if we're already processing audio for this number
    if (this.audioTranscriptionInProgress.has(phoneNumber)) {
      await this._sendResponse(
        phoneNumber,
        "Já estou processando seu áudio anterior. Aguarde um momento, por favor."
      );
      return chatState;
    }
    
    this.audioTranscriptionInProgress.add(phoneNumber);
    
    try {
      // Convert base64 to buffer
      const audioBuffer = Buffer.from(media.data, 'base64');
      
      // Check size limit
      if (audioBuffer.length > MAX_AUDIO_SIZE) {
        await this._sendResponse(
          phoneNumber,
          "Seu áudio é muito longo para ser processado. Por favor, envie um áudio mais curto ou sua mensagem em texto."
        );
        return chatState;
      }
      
      // Let the user know we're processing
      await this._sendResponse(
        phoneNumber,
        "Estou processando seu áudio, um momento por favor..."
      );
      
      // Send typing indicator
      await this._sendTypingIndicator(phoneNumber);
      
      // Save audio to a temporary file for processing
      const audioFile = await createTempFile(audioBuffer, '.ogg');
      
      // Transcribe audio
      const transcription = await aiHandler.transcribeAudio(audioBuffer);
      
      // Clean up temp file
      await cleanupTempFiles([audioFile]);
      
      // If transcription failed
      if (!transcription.success || !transcription.text) {
        await this._sendResponse(
          phoneNumber,
          "Não consegui transcrever seu áudio. Poderia tentar novamente ou enviar sua mensagem em texto?"
        );
        return chatState;
      }
      
      const transcribedText = transcription.text.trim();
      logger.debug(`Transcribed audio from ${phoneNumber}: "${transcribedText.substring(0, 50)}${transcribedText.length > 50 ? '...' : ''}"`);
      
      // Process the transcribed text
      const { response, updatedState } = await aiHandler.processUserMessage(
        phoneNumber,
        transcribedText,
        chatState,
        { transcribedAudio: true }
      );
      
      // Add the transcribed message to chat history
      updatedState.messages.push({
        role: 'user',
        content: transcribedText,
        timestamp: new Date().toISOString(),
        metadata: { transcribedAudio: true }
      });
      
      // Update chat state in memory
      await this._saveChatState(phoneNumber, updatedState);
      
      // Update funnel stage if suggested
      if (response.suggestedStage) {
        await SalesFunnelService.updateFunnelStage(phoneNumber, response.suggestedStage);
      }
      
      // Process special actions
      if (response.actions && response.actions.length > 0) {
        await this._processSpecialActions(phoneNumber, response.actions, updatedState);
      }
      
      // Show the transcribed text and then the response
      await this._sendResponse(
        phoneNumber,
        `Transcrição: "${transcribedText}"`
      );
      
      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Send the AI response
      await this._sendResponse(phoneNumber, response.content);
      
      return updatedState;
    } catch (error) {
      logger.error(`Error processing audio message from ${phoneNumber}:`, error);
      
      await this._sendResponse(
        phoneNumber,
        "Desculpe, tive um problema ao processar seu áudio. Poderia enviar sua mensagem em texto?"
      );
      
      return chatState;
    } finally {
      // Clear flags and indicators
      this.audioTranscriptionInProgress.delete(phoneNumber);
      await this._clearTypingIndicator(phoneNumber);
    }
  }

  /**
   * Process special actions from AI response
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {Array<Object>} actions - Special actions to process
   * @param {Object} chatState - The current chat state
   * @returns {Promise<void>}
   */
  async _processSpecialActions(phoneNumber, actions, chatState) {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'prova_social':
            await this._sendSocialProof(phoneNumber, action.id);
            break;
            
          case 'checkout':
            await this._sendCheckoutLink(phoneNumber, action.id);
            break;
            
          case 'etapa':
            // This is handled separately via suggestedStage
            break;
            
          case 'suporte':
            await this._transferToSupport(phoneNumber, chatState);
            break;
        }
      } catch (error) {
        logger.error(`Error processing action ${action.type} for ${phoneNumber}:`, error);
      }
    }
  }

  /**
   * Send a social proof asset
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} assetId - The social proof asset ID
   * @returns {Promise<void>}
   */
  async _sendSocialProof(phoneNumber, assetId) {
    try {
      // Ensure training context is loaded to access social proof assets
      if (!aiHandler.trainingContextLoaded) {
        await aiHandler.loadTrainingContext();
      }
      
      // Find the social proof asset
      const asset = aiHandler.trainingContext.socialProofAssets.find(a => a.id === assetId);
      if (!asset) {
        logger.warn(`Social proof asset not found: ${assetId}`);
        return;
      }
      
      // Get the file path
      const assetPath = path.join(botConfig.paths.assets, 'social-proofs', asset.filename);
      
      // Check if file exists
      try {
        await fs.access(assetPath);
      } catch (error) {
        logger.error(`Social proof asset file not found: ${assetPath}`);
        return;
      }
      
      // Read file
      const fileBuffer = await fs.readFile(assetPath);
      
      // Determine mimetype based on file extension
      let mimetype = 'application/octet-stream';
      const ext = path.extname(asset.filename).toLowerCase();
      
      if (ext === '.jpg' || ext === '.jpeg') mimetype = 'image/jpeg';
      else if (ext === '.png') mimetype = 'image/png';
      else if (ext === '.gif') mimetype = 'image/gif';
      else if (ext === '.mp4') mimetype = 'video/mp4';
      else if (ext === '.mp3') mimetype = 'audio/mpeg';
      else if (ext === '.pdf') mimetype = 'application/pdf';
      
      // Create media object
      const media = {
        mimetype,
        data: fileBuffer.toString('base64'),
        filename: asset.filename,
        caption: asset.description || ''
      };
      
      // Send media
      const chat = await this.whatsappClient.getChatById(`${phoneNumber}@c.us`);
      await chat.sendMessage(media, { caption: asset.description || '' });
      
      logger.info(`Sent social proof asset ${assetId} to ${phoneNumber}`);
    } catch (error) {
      logger.error(`Error sending social proof to ${phoneNumber}:`, error);
    }
  }

  /**
   * Send a checkout link for a specific plan
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} planId - The plan ID
   * @returns {Promise<void>}
   */
  async _sendCheckoutLink(phoneNumber, planId) {
    try {
      let checkoutUrl = null;
      let planName = null;
      
      // Find plan in pricing data
      for (const product of pricingData.products) {
        for (const plan of product.plans) {
          if (plan.id === planId) {
            checkoutUrl = plan.checkoutLink;
            planName = plan.name;
            break;
          }
        }
        if (checkoutUrl) break;
        
        // Check addons if present
        if (product.addons) {
          for (const addon of product.addons) {
            if (addon.id === planId) {
              checkoutUrl = addon.checkoutLink;
              planName = addon.name;
              break;
            }
          }
          if (checkoutUrl) break;
        }
      }
      
      // Check special offers
      if (!checkoutUrl && pricingData.specialOffers) {
        for (const offer of pricingData.specialOffers) {
          if (offer.id === planId) {
            checkoutUrl = offer.checkoutLink;
            planName = offer.name;
            break;
          }
        }
      }
      
      if (!checkoutUrl || checkoutUrl.includes('checkout.empresa.com')) {
        logger.warn(`Valid checkout link not found for plan: ${planId}`);
        
        await this._sendResponse(
          phoneNumber,
          "Desculpe, não consegui gerar o link de pagamento neste momento. Poderia entrar em contato com nosso suporte para finalizar sua compra?"
        );
        return;
      }
      
      // Add tracking parameters
      const trackingUrl = new URL(checkoutUrl);
      trackingUrl.searchParams.append('utm_source', 'whatsapp_bot');
      trackingUrl.searchParams.append('utm_medium', 'chat');
      trackingUrl.searchParams.append('utm_campaign', 'sales_agent');
      trackingUrl.searchParams.append('phone', phoneNumber);
      
      // Send message with checkout link
      await this._sendResponse(
        phoneNumber,
        `Ótima escolha! Aqui está o link para finalizar sua compra de ${planName}:\n\n${trackingUrl.toString()}\n\nO link abrirá uma página segura para você completar o pagamento. Se precisar de ajuda durante o processo, estou à disposição.`
      );
      
      // Record checkout link sent in memory
      await memoryManager.saveMemoryEntry(
        phoneNumber,
        `checkout_link_${Date.now()}`,
        {
          planId,
          planName,
          checkoutUrl: trackingUrl.toString(),
          sentAt: new Date().toISOString()
        },
        'sales_actions'
      );
      
      logger.info(`Sent checkout link for plan ${planId} to ${phoneNumber}`);
    } catch (error) {
      logger.error(`Error sending checkout link to ${phoneNumber}:`, error);
      
      await this._sendResponse(
        phoneNumber,
        "Desculpe, tive um problema ao gerar o link de pagamento. Poderia tentar novamente em alguns instantes?"
      );
    }
  }

  /**
   * Transfer a conversation to human support
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {Object} chatState - The current chat state
   * @returns {Promise<void>}
   */
  async _transferToSupport(phoneNumber, chatState) {
    try {
      logger.info(`Transferring ${phoneNumber} to human support`);
      
      // Record transfer request in memory
      await memoryManager.saveMemoryEntry(
        phoneNumber,
        `support_transfer_${Date.now()}`,
        {
          requestedAt: new Date().toISOString(),
          reason: 'ai_requested',
          currentFunnelStage: await SalesFunnelService.determineCurrentStage(phoneNumber, chatState)
        },
        'support_requests'
      );
      
      // Send transfer message
      await this._sendResponse(
        phoneNumber,
        "Estou transferindo você para nossa equipe de suporte humano. Um consultor especializado entrará em contato em breve. Obrigado pela compreensão!"
      );
      
      // TODO: Integrate with actual support ticket system or CRM
      // This would typically involve creating a ticket in a support system
      // or sending a notification to a support team
      
      // For now, we'll just log that this should happen
      logger.info(`Support transfer for ${phoneNumber} recorded. Integration with support system needed.`);
    } catch (error) {
      logger.error(`Error transferring ${phoneNumber} to support:`, error);
    }
  }

  /**
   * Send a response to the user
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} content - The response content
   * @returns {Promise<void>}
   */
  async _sendResponse(phoneNumber, content) {
    if (!content || !content.trim()) {
      logger.warn(`Attempted to send empty message to ${phoneNumber}`);
      return;
    }
    
    try {
      // Get the chat
      const chat = await this.whatsappClient.getChatById(`${phoneNumber}@c.us`);
      
      // Check if we need to split the message
      const messages = this._splitMessage(content);
      
      // Send typing indicator
      await this._sendTypingIndicator(phoneNumber);
      
      // Queue messages for sending
      this._queueMessages(phoneNumber, messages);
    } catch (error) {
      logger.error(`Error sending response to ${phoneNumber}:`, error);
    }
  }

  /**
   * Queue messages for sending with realistic delays
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {Array<string>} messages - Messages to send
   */
  _queueMessages(phoneNumber, messages) {
    // Create queue if it doesn't exist
    if (!this.messageQueues.has(phoneNumber)) {
      this.messageQueues.set(phoneNumber, []);
    }
    
    const queue = this.messageQueues.get(phoneNumber);
    
    // Add messages to queue
    queue.push(...messages);
    
    // Start processing queue if not already processing
    if (queue.length === messages.length) {
      this._processMessageQueue(phoneNumber);
    }
  }

  /**
   * Process queued messages
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @returns {Promise<void>}
   */
  async _processMessageQueue(phoneNumber) {
    const queue = this.messageQueues.get(phoneNumber);
    
    if (!queue || queue.length === 0) {
      this.messageQueues.delete(phoneNumber);
      return;
    }
    
    try {
      // Get first message
      const message = queue.shift();
      
      // Get the chat
      const chat = await this.whatsappClient.getChatById(`${phoneNumber}@c.us`);
      
      // Calculate typing delay based on message length
      const typingDelay = this._calculateTypingDelay(message);
      
      // Send typing indicator and wait
      await this._simulateTyping(phoneNumber, typingDelay);
      
      // Send the message
      await chat.sendMessage(message);
      
      logger.debug(`Sent message to ${phoneNumber}: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
      
      // Add delay between messages
      if (queue.length > 0) {
        const betweenDelay = this._calculateBetweenMessagesDelay();
        await new Promise(resolve => setTimeout(resolve, betweenDelay));
      }
      
      // Process next message in queue
      setTimeout(() => this._processMessageQueue(phoneNumber), 100);
    } catch (error) {
      logger.error(`Error processing message queue for ${phoneNumber}:`, error);
      
      // Clear the queue on error
      this.messageQueues.delete(phoneNumber);
    }
  }

  /**
   * Split a long message into smaller chunks
   * @private
   * @param {string} content - Message content
   * @returns {Array<string>} Split messages
   */
  _splitMessage(content) {
    const maxLength = botConfig.behavior.messageSettings.maxCharsPerMessage;
    const shouldSplitParagraphs = botConfig.behavior.messageSettings.splitInParagraphs;
    
    // If message is short enough, return as is
    if (content.length <= maxLength) {
      return [content];
    }
    
    const messages = [];
    
    // If we can split on paragraphs
    if (shouldSplitParagraphs) {
      // Split by paragraphs
      const paragraphs = content.split(/\n\s*\n/);
      let currentMessage = '';
      
      for (const paragraph of paragraphs) {
        // If adding this paragraph would make the message too long,
        // push current message and start a new one
        if (currentMessage.length + paragraph.length + 2 > maxLength) {
          // If current message is not empty, push it
          if (currentMessage) {
            messages.push(currentMessage.trim());
            currentMessage = '';
          }
          
          // If the paragraph itself is too long, split it
          if (paragraph.length > maxLength) {
            const paragraphChunks = this._splitTextChunks(paragraph, maxLength);
            messages.push(...paragraphChunks);
          } else {
            currentMessage = paragraph;
          }
        } else {
          // Add paragraph to current message
          if (currentMessage) {
            currentMessage += '\n\n' + paragraph;
          } else {
            currentMessage = paragraph;
          }
        }
      }
      
      // Push any remaining content
      if (currentMessage) {
        messages.push(currentMessage.trim());
      }
    } else {
      // Split by length only
      messages.push(...this._splitTextChunks(content, maxLength));
    }
    
    return messages;
  }

  /**
   * Split text into chunks of maximum length
   * @private
   * @param {string} text - Text to split
   * @param {number} maxLength - Maximum chunk length
   * @returns {Array<string>} Text chunks
   */
  _splitTextChunks(text, maxLength) {
    const chunks = [];
    
    // Try to split on sentence boundaries
    let start = 0;
    while (start < text.length) {
      let end = start + maxLength;
      
      if (end >= text.length) {
        // Last chunk
        chunks.push(text.substring(start).trim());
        break;
      }
      
      // Look for sentence boundary before max length
      let sentenceBoundary = text.lastIndexOf('. ', end);
      
      // If no sentence boundary found, try other punctuation
      if (sentenceBoundary < start + maxLength / 2) {
        sentenceBoundary = text.lastIndexOf('? ', end);
      }
      
      if (sentenceBoundary < start + maxLength / 2) {
        sentenceBoundary = text.lastIndexOf('! ', end);
      }
      
      // If no good sentence boundary found, look for line breaks
      if (sentenceBoundary < start + maxLength / 2) {
        sentenceBoundary = text.lastIndexOf('\n', end);
      }
      
      // If still no good boundary, just look for space
      if (sentenceBoundary < start + maxLength / 2) {
        sentenceBoundary = text.lastIndexOf(' ', end);
      }
      
      // If no boundary found at all, force split at maxLength
      if (sentenceBoundary < start) {
        sentenceBoundary = start + maxLength - 1;
      }
      
      // Add chunk
      chunks.push(text.substring(start, sentenceBoundary + 1).trim());
      
      // Update start position
      start = sentenceBoundary + 1;
    }
    
    return chunks;
  }

  /**
   * Calculate typing delay based on message length
   * @private
   * @param {string} message - The message
   * @returns {number} Delay in milliseconds
   */
  _calculateTypingDelay(message) {
    const { typingDelayMinMs, typingDelayMaxMs } = botConfig.behavior.responseSettings;
    
    // Base delay plus additional time based on length
    // Average human typing speed is ~40 words per minute or ~200 characters per minute
    // That's about 3.33 characters per second
    const baseDelay = typingDelayMinMs;
    const charsPerSecond = 3.33;
    const contentLength = message.length;
    
    // Calculate delay based on length with some randomness
    const calculatedDelay = baseDelay + (contentLength / charsPerSecond) * 1000 * (0.8 + 0.4 * Math.random());
    
    // Ensure it's within limits
    return Math.min(Math.max(calculatedDelay, typingDelayMinMs), typingDelayMaxMs);
  }

  /**
   * Calculate delay between messages
   * @private
   * @returns {number} Delay in milliseconds
   */
  _calculateBetweenMessagesDelay() {
    const { betweenMessagesMinMs, betweenMessagesMaxMs } = botConfig.behavior.responseSettings;
    
    // Random delay between min and max
    return betweenMessagesMinMs + Math.random() * (betweenMessagesMaxMs - betweenMessagesMinMs);
  }

  /**
   * Send a typing indicator
   * @private
   * @param {string} phoneNumber - The phone number
   * @returns {Promise<void>}
   */
  async _sendTypingIndicator(phoneNumber) {
    try {
      // Check if already typing
      if (this.typingIndicators.has(phoneNumber)) {
        return;
      }
      
      // Get the chat
      const chat = await this.whatsappClient.getChatById(`${phoneNumber}@c.us`);
      
      // Start typing
      await chat.sendStateTyping();
      
      // Store typing state
      this.typingIndicators.set(phoneNumber, true);
    } catch (error) {
      logger.error(`Error sending typing indicator to ${phoneNumber}:`, error);
    }
  }

  /**
   * Simulate typing for a given duration
   * @private
   * @param {string} phoneNumber - The phone number
   * @param {number} duration - Duration in milliseconds
   * @returns {Promise<void>}
   */
  async _simulateTyping(phoneNumber, duration) {
    // Send typing indicator
    await this._sendTypingIndicator(phoneNumber);
    
    // Wait for the specified duration
    await new Promise(resolve => setTimeout(resolve, duration));
  }

  /**
   * Clear a typing indicator
   * @private
   * @param {string} phoneNumber - The phone number
   * @returns {Promise<void>}
   */
  async _clearTypingIndicator(phoneNumber) {
    try {
      // Check if typing
      if (!this.typingIndicators.has(phoneNumber)) {
        return;
      }
      
      // Get the chat
      const chat = await this.whatsappClient.getChatById(`${phoneNumber}@c.us`);
      
      // Clear typing
      await chat.clearState();
      
      // Remove typing state
      this.typingIndicators.delete(phoneNumber);
    } catch (error) {
      logger.error(`Error clearing typing indicator for ${phoneNumber}:`, error);
    }
  }

  /**
   * Get the chat state from memory
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @returns {Promise<Object>} Chat state
   */
  async _getChatState(phoneNumber) {
    try {
      // Get contact name
      let contactName = null;
      try {
        const contact = await this.whatsappClient.getContactById(`${phoneNumber}@c.us`);
        contactName = contact.name || contact.pushname || null;
      } catch (error) {
        logger.warn(`Failed to get contact name for ${phoneNumber}:`, error);
      }
      
      // Get messages from memory
      const messages = await memoryManager.getMessages(phoneNumber, { limit: 30 });
      
      // Get current funnel stage
      let currentStage = null;
      try {
        const stageMem = await memoryManager.getLatestMemoryEntry(phoneNumber, 'funnel_stage');
        if (stageMem && stageMem.value) {
          currentStage = stageMem.value;
        }
      } catch (error) {
        logger.warn(`Failed to get funnel stage for ${phoneNumber}:`, error);
      }
      
      return {
        phoneNumber,
        contactName,
        messages,
        currentStage,
        lastInteractionTime: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to get chat state for ${phoneNumber}:`, error);
      
      // Return basic state
      return {
        phoneNumber,
        messages: [],
        lastInteractionTime: new Date().toISOString()
      };
    }
  }

  /**
   * Save the chat state to memory
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @param {Object} chatState - The chat state to save
   * @returns {Promise<void>}
   */
  async _saveChatState(phoneNumber, chatState) {
    try {
      // Save contact name if available
      if (chatState.contactName) {
        await memoryManager.saveMemoryEntry(
          phoneNumber,
          'contact_name',
          chatState.contactName,
          'contact_info'
        );
      }
      
      // Save messages
      if (chatState.messages && chatState.messages.length > 0) {
        for (const msg of chatState.messages) {
          // Check if message already exists in memory
          const existingMessages = await memoryManager.getMessages(
            phoneNumber,
            { 
              limit: 5,
              role: msg.role
            }
          );
          
          const messageExists = existingMessages.some(
            m => m.content === msg.content && 
                Math.abs(new Date(m.timestamp) - new Date(msg.timestamp)) < 5000
          );
          
          // Only save if message doesn't exist
          if (!messageExists) {
            await memoryManager.addMessage(
              phoneNumber,
              msg.role,
              msg.content,
              msg.metadata || {}
            );
          }
        }
      }
      
      // Update last interaction time
      await memoryManager.saveMemoryEntry(
        phoneNumber,
        'last_interaction',
        new Date().toISOString(),
        'session_info'
      );
    } catch (error) {
      logger.error(`Failed to save chat state for ${phoneNumber}:`, error);
    }
  }

  /**
   * Check if a user is sending messages too quickly (spam protection)
   * @private
   * @param {string} phoneNumber - The phone number identifier
   * @returns {boolean} Whether the user is spamming
   */
  _isSpamming(phoneNumber) {
    // Get message counter
    const counter = this.messageCounters.get(phoneNumber);
    if (!counter) return false;
    
    // Check if too many messages in the last minute
    return counter.count > botConfig.behavior.maxMessagesPerMinute;
  }

  /**
   * Update message counter for spam protection
   * @private
   * @param {string} phoneNumber - The phone number identifier
   */
  _updateMessageCounter(phoneNumber) {
    const now = Date.now();
    
    // Get or initialize counter
    let counter = this.messageCounters.get(phoneNumber);
    if (!counter) {
      counter = {
        count: 0,
        timestamp: now,
        timeout: null
      };
      this.messageCounters.set(phoneNumber, counter);
    }
    
    // Reset if last message was more than a minute ago
    if (now - counter.timestamp >= 60000) {
      counter.count = 0;
      counter.timestamp = now;
    }
    
    // Increment counter
    counter.count++;
    
    // Schedule reset after one minute
    clearTimeout(counter.timeout);
    counter.timeout = setTimeout(() => {
      const currentCounter = this.messageCounters.get(phoneNumber);
      if (currentCounter && currentCounter.timestamp === counter.timestamp) {
        this.messageCounters.delete(phoneNumber);
      }
    }, 60000);
  }

  /**
   * Send a message to a specific phone number (used by API)
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} message - The message to send
   * @returns {Promise<Object>} Result of the operation
   */
  async sendMessage(phoneNumber, message) {
    try {
      // Validate phone number
      if (!phoneNumber || typeof phoneNumber !== 'string') {
        return { success: false, error: 'Invalid phone number' };
      }
      
      // Validate message
      if (!message || typeof message !== 'string') {
        return { success: false, error: 'Invalid message' };
      }
      
      // Format phone number if needed
      const formattedPhone = phoneNumber.includes('@c.us') ? 
        phoneNumber : `${phoneNumber.replace(/\D/g, '')}@c.us`;
      
      // Get the chat
      const chat = await this.whatsappClient.getChatById(formattedPhone);
      
      // Send message
      await chat.sendMessage(message);
      
      return { 
        success: true, 
        message: 'Message sent successfully',
        phoneNumber
      };
    } catch (error) {
      logger.error(`Error sending message to ${phoneNumber}:`, error);
      return { 
        success: false, 
        error: `Failed to send message: ${error.message}`,
        phoneNumber
      };
    }
  }
}

module.exports = ChatHandler;