/**
 * @fileoverview Sales Funnel Service for WhatsApp AI Sales Agent
 *
 * This module is responsible for:
 * - Determining the current stage in the sales funnel
 * - Generating dynamic prompts for the AI based on the current funnel stage
 * - Managing the transition between different funnel stages
 * - Providing context-specific sales strategies and objection handling
 * - Implementing upsell and downsell strategies to maximize client value
 */

const logger = require("./logger");
const memoryManager = require("./memoryManager");
const { pricingData } = require("./pricing");
const { BOT_IDENTITY } = require("./botConfig");

// Define sales funnel stages with their IDs and descriptions
const FUNNEL_STAGES = {
  // Initial stages
  GREETING: "greeting",
  QUALIFICATION: "qualification",
  NEED_DISCOVERY: "need_discovery",
  PAIN_POINT_EXPLORATION: "pain_point_exploration",

  // Middle stages
  SOLUTION_PRESENTATION: "solution_presentation",
  PRODUCT_DEMONSTRATION: "product_demonstration",
  VALUE_PROPOSITION: "value_proposition",
  PROOF_AND_CREDIBILITY: "proof_and_credibility",

  // Closing stages
  OBJECTION_HANDLING: "objection_handling",
  PRICE_DISCUSSION: "price_discussion",
  CLOSING: "closing",
  CHECKOUT: "checkout",

  // Post-sale stages
  POST_PURCHASE_FOLLOWUP: "post_purchase_followup",
  UPSELL: "upsell",
  DOWNSELL: "downsell",
  CROSS_SELL: "cross_sell",

  // Re-engagement stages
  REACTIVATION: "reactivation",
  FEEDBACK: "feedback",
};

/**
 * Maps common objections to strategies for handling them
 * @type {Object.<string, Object>}
 */
const OBJECTION_STRATEGIES = {
  price_too_high: {
    detection: [
      "caro",
      "preço",
      "custo",
      "valor",
      "barato",
      "desconto",
      "promoção",
      "investimento",
      "orçamento",
    ],
    strategies: [
      "Reconhecer a preocupação com o valor percebido",
      "Focar no ROI e benefícios de longo prazo",
      "Apresentar opções de pagamento ou planos flexíveis",
      "Comparar com o custo de alternativas ou de não agir",
      "Mostrar exemplos de outros clientes que tiveram retorno positivo",
    ],
    example:
      "Entendo sua preocupação com o investimento. Muitos clientes inicialmente pensaram o mesmo, mas depois de 3 meses, conseguiram um retorno 3x maior que o valor investido. Além disso, temos opções de pagamento que facilitam o início. Posso compartilhar alguns exemplos de resultados específicos de clientes em situação similar à sua?",
  },
  need_time: {
    detection: [
      "tempo",
      "pensar",
      "depois",
      "consultar",
      "decidir",
      "amanhã",
      "semana",
      "reflexão",
      "analisar",
    ],
    strategies: [
      "Reconhecer a necessidade de reflexão",
      "Criar senso de urgência com ofertas por tempo limitado",
      "Oferecer informações adicionais para facilitar a decisão",
      "Sugerir um compromisso menor para iniciar",
      "Perguntar quais informações específicas ajudariam na decisão",
    ],
    example:
      "Entendo que precisa de tempo para pensar. É uma decisão importante. Posso perguntar especificamente o que você precisa saber para se sentir confortável com essa decisão? Além disso, a promoção especial que mencionei está disponível apenas até amanhã - então gostaria de garantir que você tenha todas as informações necessárias hoje.",
  },
  need_approval: {
    detection: [
      "consultar",
      "chefe",
      "sócio",
      "esposa",
      "marido",
      "equipe",
      "decidir junto",
      "gerente",
      "superior",
      "diretor",
    ],
    strategies: [
      "Oferecer materiais para compartilhar com os decisores",
      "Propor uma apresentação para todos os envolvidos",
      "Fornecer casos de estudo e testemunhos relevantes",
      "Criar urgência para acelerar o processo de aprovação",
      "Perguntar sobre o processo de decisão e oferecer apoio específico",
    ],
    example:
      "Compreendo totalmente que precisa consultar seu sócio. Posso preparar um material específico com os pontos que discutimos para você compartilhar? Também estou disponível para uma breve reunião conjunta para responder diretamente às dúvidas dele. Qual seria a melhor forma de apoiar essa conversa?",
  },
  competitor: {
    detection: [
      "concorrente",
      "outra empresa",
      "outro sistema",
      "alternativa",
      "comparando",
      "diferente",
      "similar",
      "serviço parecido",
    ],
    strategies: [
      "Reconhecer os pontos fortes do concorrente",
      "Destacar diferenciais exclusivos do produto",
      "Apresentar comparativos específicos e vantagens",
      "Compartilhar histórias de clientes que migraram do concorrente",
      "Focar nos benefícios únicos e na proposta de valor exclusiva",
    ],
    example:
      "Sim, a Empresa X tem um produto sólido. Muitos de nossos clientes vieram de lá por alguns motivos específicos: nosso suporte 24/7 personalizado, a integração nativa com sistemas que você já usa, e a flexibilidade de personalização que oferecemos sem custos adicionais. Um cliente recente, com perfil similar ao seu, aumentou sua produtividade em 35% após migrar para nossa solução. Gostaria de explicar melhor como esses diferenciais se aplicam ao seu caso específico?",
  },
  no_need: {
    detection: [
      "não preciso",
      "desnecessário",
      "resolvido",
      "satisfeito",
      "não tenho problema",
      "sem interesse",
      "não é prioridade",
    ],
    strategies: [
      "Explorar dores não percebidas ou oportunidades de melhoria",
      "Compartilhar insights sobre tendências futuras relevantes",
      "Apresentar casos de uso que o cliente não considerou",
      "Provocar reflexão sobre custos ocultos ou riscos da situação atual",
      "Oferecer teste ou demonstração para evidenciar valor não percebido",
    ],
    example:
      "Entendo que você está satisfeito com sua solução atual. Muitos dos nossos clientes também estavam, até descobrirem o custo oculto da ineficiência que tinham normalizado. Por curiosidade, quanto tempo sua equipe gasta semanalmente gerenciando manualmente esses processos? Tenho visto empresas similares à sua economizando cerca de 15 horas por semana com nossa automação específica para esse fluxo.",
  },
  technical_concerns: {
    detection: [
      "complicado",
      "difícil",
      "técnico",
      "complexo",
      "implementação",
      "integração",
      "instalar",
      "configurar",
      "aprender",
    ],
    strategies: [
      "Explicar o processo de implementação de forma simples",
      "Destacar o suporte técnico disponível durante a transição",
      "Apresentar exemplos de clientes não técnicos que implementaram com sucesso",
      "Oferecer demonstração prática da facilidade de uso",
      "Garantir disponibilidade para resolver questões técnicas específicas",
    ],
    example:
      "Sua preocupação com a complexidade técnica é válida. Desenvolvemos nosso produto justamente pensando em pessoas sem expertise técnica. Nossa equipe de implementação cuida de todo o processo inicial, que normalmente leva apenas 2 dias. O João, da empresa Crescer Mais (semelhante à sua), implementou sozinho após uma única sessão de 30 minutos com nosso especialista. Posso mostrar rapidamente como funciona na prática?",
  },
};

/**
 * Define upsell opportunities based on initial purchase products
 * @type {Object.<string, Array<Object>>}
 */
const UPSELL_OPPORTUNITIES = {
  // Indexed by product/plan ID, containing possible upsells
  basic_plan: [
    {
      targetPlanId: "pro_plan",
      title: "Upgrade para Plano Pro",
      pitch:
        "Com o Plano Pro, você terá acesso a todas as funcionalidades avançadas como [FEATURES], que podem aumentar seus resultados em até 47% com base nos dados de clientes similares.",
      valueProposition:
        "O investimento adicional de apenas R$X/mês se paga em Y semanas considerando o aumento de produtividade.",
      timing: "após_7_dias", // quando oferecer este upsell
      discount: 0.15, // 15% de desconto no upgrade
      limitedTime: "72h", // oferta válida por 72h
    },
  ],
  pro_plan: [
    {
      targetPlanId: "enterprise_plan",
      title: "Upgrade para Plano Enterprise",
      pitch:
        "O Plano Enterprise inclui recursos exclusivos como [EXCLUSIVE_FEATURES], além de suporte prioritário e consultoria estratégica mensal.",
      valueProposition:
        "Empresas que utilizam nosso plano Enterprise aumentam o ROI em média 3.2x comparado ao Pro.",
      timing: "após_30_dias",
      discount: 0.1,
      limitedTime: "7d",
    },
    {
      targetPlanId: "addon_training",
      title: "Treinamento Personalizado",
      pitch:
        "Complementando seu Plano Pro, oferecemos um programa de treinamento personalizado para sua equipe maximizar o uso da plataforma.",
      valueProposition:
        "Equipes que passam por nosso treinamento personalizado reportam 68% mais resultados nos primeiros 60 dias.",
      timing: "após_3_dias",
      discount: 0.2,
      limitedTime: "48h",
    },
  ],
};

/**
 * Define downsell alternatives when upsells are rejected
 * @type {Object.<string, Object>}
 */
const DOWNSELL_ALTERNATIVES = {
  // Indexed by upsell target plan ID, containing downsell alternatives
  pro_plan: {
    targetPlanId: "basic_plus_plan",
    title: "Plano Básico Plus",
    pitch:
      "Entendo que o Plano Pro pode não ser o ideal neste momento. O Básico Plus oferece os recursos essenciais do Pro, como [KEY_FEATURES], mantendo um investimento mais acessível.",
    valueProposition:
      "Você obtém 70% dos benefícios do Pro por apenas 50% do investimento.",
    discount: 0.25, // 25% de desconto neste plano
    limitedTime: "24h", // oferta válida por 24h
  },
  enterprise_plan: {
    targetPlanId: "pro_plus_plan",
    title: "Plano Pro Plus",
    pitch:
      "Pensando em suas necessidades, desenvolvemos o Pro Plus, que inclui os principais recursos do Enterprise, como [KEY_FEATURES], sem o investimento completo do Enterprise.",
    valueProposition:
      "O Pro Plus entrega 80% do valor do Enterprise por 60% do investimento.",
    discount: 0.15,
    limitedTime: "48h",
  },
  addon_training: {
    targetPlanId: "addon_quickstart",
    title: "Quickstart Guide Premium",
    pitch:
      "Como alternativa ao treinamento completo, nosso Quickstart Guide Premium oferece um conjunto de vídeos e documentação avançada para auto-aprendizado.",
    valueProposition:
      "Economize 70% comparado ao treinamento personalizado e ainda obtenha resultados significativos.",
    discount: 0.3,
    limitedTime: "24h",
  },
};

/**
 * SalesFunnelService class for managing the sales funnel process
 */
class SalesFunnelService {
  /**
   * Creates a new instance of SalesFunnelService
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = {
      defaultStage: FUNNEL_STAGES.GREETING,
      stageAdvancementThreshold: 0.7, // Confidence threshold to advance to next stage
      enableUpsellDownsell: true, // Flag to enable/disable upsell/downsell features
      upsellTiming: {
        default: 7, // Default days to wait before upsell
        premium_threshold: 30, // Days to wait for premium upsells
        quick_wins: 3, // Days for quick win upsells
      },
      ...options,
    };

    logger.debug("SalesFunnelService initialized with options:", this.options);
  }

  /**
   * Determines the current stage of the funnel based on conversation history
   * @param {string} phoneNumber - The phone number identifier
   * @param {Object} chatState - Current state of the chat
   * @returns {Promise<string>} The current funnel stage ID
   */
  async determineCurrentStage(phoneNumber, chatState) {
    try {
      logger.debug(`Determining current funnel stage for ${phoneNumber}`);

      // Try to get the current stage from memory first
      const stageMem = await memoryManager.getLatestMemoryEntry(
        phoneNumber,
        "funnel_stage"
      );

      if (stageMem && stageMem.value) {
        logger.debug(`Found saved funnel stage: ${stageMem.value}`);
        return stageMem.value;
      }

      // Check if there's a purchased product to determine upsell opportunity
      if (this.options.enableUpsellDownsell) {
        const purchasedProductMem = await memoryManager.getLatestMemoryEntry(
          phoneNumber,
          "purchased_product"
        );
        const lastInteractionMem = await memoryManager.getLatestMemoryEntry(
          phoneNumber,
          "last_interaction"
        );

        if (
          purchasedProductMem &&
          purchasedProductMem.value &&
          lastInteractionMem &&
          lastInteractionMem.value
        ) {
          const purchasedProductId = purchasedProductMem.value;
          const daysSincePurchase = this.calculateDaysBetween(
            new Date(
              lastInteractionMem.value.purchase_date || lastInteractionMem.value
            ),
            new Date()
          );

          // Check if it's time for an upsell
          const upsellOpportunity = this.checkUpsellOpportunity(
            purchasedProductId,
            daysSincePurchase
          );
          if (upsellOpportunity) {
            logger.info(
              `Upsell opportunity identified for ${phoneNumber}: ${upsellOpportunity.title}`
            );

            // Save upsell opportunity in memory for use in prompt generation
            await memoryManager.saveMemoryEntry(
              phoneNumber,
              "active_upsell",
              upsellOpportunity,
              "sales_opportunity"
            );
            return FUNNEL_STAGES.UPSELL;
          }

          // Check if user recently rejected an upsell (within last 24h)
          const rejectedUpsellMem = await memoryManager.getLatestMemoryEntry(
            phoneNumber,
            "rejected_upsell"
          );
          if (rejectedUpsellMem && rejectedUpsellMem.value) {
            const rejectedUpsell = rejectedUpsellMem.value;
            const hoursSinceRejection = this.calculateHoursBetween(
              new Date(rejectedUpsell.rejection_time),
              new Date()
            );

            // If rejection was recent (within 24h), consider downsell
            if (hoursSinceRejection < 24) {
              const downsellOpportunity = this.getDownsellForRejectedUpsell(
                rejectedUpsell.target_plan_id
              );
              if (downsellOpportunity) {
                logger.info(
                  `Downsell opportunity identified after rejected upsell for ${phoneNumber}: ${downsellOpportunity.title}`
                );

                // Save downsell opportunity in memory
                await memoryManager.saveMemoryEntry(
                  phoneNumber,
                  "active_downsell",
                  downsellOpportunity,
                  "sales_opportunity"
                );
                return FUNNEL_STAGES.DOWNSELL;
              }
            }
          }
        }
      }

      // If no saved stage or special opportunity, determine based on conversation analysis
      const messageCount = chatState.messages ? chatState.messages.length : 0;

      // Advanced stage determination logic using message content analysis
      // This is a simplified version - a production system would use more sophisticated analysis
      let stage;

      if (messageCount === 0) {
        stage = FUNNEL_STAGES.GREETING;
      } else if (messageCount < 5) {
        stage = FUNNEL_STAGES.QUALIFICATION;
      } else if (messageCount < 10) {
        stage = FUNNEL_STAGES.NEED_DISCOVERY;
      } else {
        // For more advanced stages, analyze recent messages
        const recentMessages = chatState.messages.slice(-5);
        const userMessages = recentMessages
          .filter((m) => m.role === "user")
          .map((m) => m.content.toLowerCase());
        const assistantMessages = recentMessages
          .filter((m) => m.role === "assistant")
          .map((m) => m.content.toLowerCase());

        // Look for pricing signals
        const pricingSignals = [
          "preço",
          "valor",
          "investimento",
          "custo",
          "plano",
          "pacote",
          "quanto custa",
        ];
        const hasPricingDiscussion = userMessages.some((msg) =>
          pricingSignals.some((signal) => msg.includes(signal))
        );

        // Look for closing signals
        const closingSignals = [
          "comprar",
          "adquirir",
          "assinar",
          "contratar",
          "fechar",
          "pagamento",
        ];
        const hasClosingDiscussion = userMessages.some((msg) =>
          closingSignals.some((signal) => msg.includes(signal))
        );

        // Look for demonstration signals
        const demoSignals = [
          "funciona",
          "exemplo",
          "demonstração",
          "mostrar",
          "ver como",
        ];
        const hasDemoRequest = userMessages.some((msg) =>
          demoSignals.some((signal) => msg.includes(signal))
        );

        // Look for objection signals
        const objectionSignals = Object.values(OBJECTION_STRATEGIES).flatMap(
          (obj) => obj.detection
        );
        const hasObjections = userMessages.some((msg) =>
          objectionSignals.some((signal) => msg.includes(signal))
        );

        if (hasClosingDiscussion) {
          stage = FUNNEL_STAGES.CLOSING;
        } else if (hasPricingDiscussion) {
          stage = FUNNEL_STAGES.PRICE_DISCUSSION;
        } else if (hasObjections) {
          stage = FUNNEL_STAGES.OBJECTION_HANDLING;
        } else if (hasDemoRequest) {
          stage = FUNNEL_STAGES.PRODUCT_DEMONSTRATION;
        } else if (messageCount < 15) {
          stage = FUNNEL_STAGES.PAIN_POINT_EXPLORATION;
        } else if (messageCount < 20) {
          stage = FUNNEL_STAGES.SOLUTION_PRESENTATION;
        } else {
          stage = FUNNEL_STAGES.VALUE_PROPOSITION;
        }
      }

      // Save the determined stage
      await memoryManager.saveMemoryEntry(
        phoneNumber,
        "current_stage",
        stage,
        "funnel_stage"
      );

      logger.debug(`Determined funnel stage: ${stage}`);
      return stage;
    } catch (error) {
      logger.error(
        `Failed to determine funnel stage for ${phoneNumber}:`,
        error
      );
      return this.options.defaultStage;
    }
  }

  /**
   * Updates the current funnel stage for a conversation
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} newStage - The new funnel stage ID
   * @returns {Promise<void>}
   */
  async updateFunnelStage(phoneNumber, newStage) {
    try {
      logger.debug(`Updating funnel stage for ${phoneNumber} to ${newStage}`);

      // Validate the stage
      if (!Object.values(FUNNEL_STAGES).includes(newStage)) {
        throw new Error(`Invalid funnel stage: ${newStage}`);
      }

      // Get current stage for transition tracking
      const currentStageMem = await memoryManager.getLatestMemoryEntry(
        phoneNumber,
        "funnel_stage"
      );
      const currentStage =
        currentStageMem && currentStageMem.value
          ? currentStageMem.value
          : this.options.defaultStage;

      // Special handling for upsell rejection transitioning to downsell
      if (
        currentStage === FUNNEL_STAGES.UPSELL &&
        newStage !== FUNNEL_STAGES.UPSELL
      ) {
        const activeUpsellMem = await memoryManager.getLatestMemoryEntry(
          phoneNumber,
          "active_upsell"
        );

        if (activeUpsellMem && activeUpsellMem.value) {
          // Record the rejected upsell
          await memoryManager.saveMemoryEntry(
            phoneNumber,
            "rejected_upsell",
            {
              target_plan_id: activeUpsellMem.value.targetPlanId,
              rejection_time: new Date().toISOString(),
            },
            "sales_opportunity"
          );

          // Check if we should transition to downsell
          const downsellOpportunity = this.getDownsellForRejectedUpsell(
            activeUpsellMem.value.targetPlanId
          );
          if (downsellOpportunity) {
            logger.info(
              `Transitioning to downsell after upsell rejection for ${phoneNumber}`
            );

            // Save downsell opportunity and update stage to downsell instead
            await memoryManager.saveMemoryEntry(
              phoneNumber,
              "active_downsell",
              downsellOpportunity,
              "sales_opportunity"
            );
            newStage = FUNNEL_STAGES.DOWNSELL;
          }
        }
      }

      // Save the new stage
      await memoryManager.saveMemoryEntry(
        phoneNumber,
        "current_stage",
        newStage,
        "funnel_stage"
      );

      // Record stage transition for analytics
      await memoryManager.saveMemoryEntry(
        phoneNumber,
        `stage_transition_${Date.now()}`,
        {
          from: currentStage,
          to: newStage,
          timestamp: new Date().toISOString(),
        },
        "funnel_analytics"
      );

      logger.info(
        `Updated funnel stage for ${phoneNumber} from ${currentStage} to ${newStage}`
      );
    } catch (error) {
      logger.error(`Failed to update funnel stage for ${phoneNumber}:`, error);
      throw new Error(`Failed to update funnel stage: ${error.message}`);
    }
  }

  /**
   * Records a purchase for future upsell opportunities
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} productId - The ID of the purchased product/plan
   * @param {number} value - The purchase value
   * @returns {Promise<void>}
   */
  async recordPurchase(phoneNumber, productId, value) {
    try {
      logger.debug(
        `Recording purchase for ${phoneNumber}: ${productId} ($${value})`
      );

      // Save the purchased product details
      await memoryManager.saveMemoryEntry(
        phoneNumber,
        "purchased_product",
        productId,
        "purchase_history"
      );

      // Save the purchase details
      await memoryManager.saveMemoryEntry(
        phoneNumber,
        `purchase_${Date.now()}`,
        {
          product_id: productId,
          value: value,
          purchase_date: new Date().toISOString(),
        },
        "purchase_history"
      );

      // Update last interaction with purchase date
      await memoryManager.saveMemoryEntry(
        phoneNumber,
        "last_interaction",
        {
          type: "purchase",
          purchase_date: new Date().toISOString(),
          product_id: productId,
        },
        "customer_journey"
      );

      // Update funnel stage to post-purchase
      await this.updateFunnelStage(
        phoneNumber,
        FUNNEL_STAGES.POST_PURCHASE_FOLLOWUP
      );

      logger.info(`Purchase recorded successfully for ${phoneNumber}`);
    } catch (error) {
      logger.error(`Failed to record purchase for ${phoneNumber}:`, error);
      throw new Error(`Failed to record purchase: ${error.message}`);
    }
  }

  /**
   * Check if there's an upsell opportunity based on purchased product and time
   * @param {string} productId - The ID of the purchased product
   * @param {number} daysSincePurchase - Days since the purchase
   * @returns {Object|null} Upsell opportunity if found, null otherwise
   */
  checkUpsellOpportunity(productId, daysSincePurchase) {
    if (!this.options.enableUpsellDownsell) return null;

    const opportunities = UPSELL_OPPORTUNITIES[productId];
    if (!opportunities || !opportunities.length) return null;

    // Find an opportunity that matches the timing
    for (const opportunity of opportunities) {
      let timingDays;

      switch (opportunity.timing) {
        case "após_3_dias":
          timingDays = this.options.upsellTiming.quick_wins;
          break;
        case "após_7_dias":
          timingDays = this.options.upsellTiming.default;
          break;
        case "após_30_dias":
          timingDays = this.options.upsellTiming.premium_threshold;
          break;
        default:
          timingDays = parseInt(
            opportunity.timing.match(/\d+/)?.[0] ||
              this.options.upsellTiming.default
          );
      }

      // Check if the timing is right (give or take a day)
      if (
        daysSincePurchase >= timingDays - 1 &&
        daysSincePurchase <= timingDays + 3
      ) {
        return opportunity;
      }
    }

    return null;
  }

  /**
   * Get a downsell alternative for a rejected upsell
   * @param {string} upsellPlanId - The ID of the rejected upsell plan
   * @returns {Object|null} Downsell opportunity if available, null otherwise
   */
  getDownsellForRejectedUpsell(upsellPlanId) {
    if (!this.options.enableUpsellDownsell) return null;

    const downsellOpportunity = DOWNSELL_ALTERNATIVES[upsellPlanId];
    if (!downsellOpportunity) return null;

    return downsellOpportunity;
  }

  /**
   * Calculate the number of days between two dates
   * @param {Date} date1 - The first date
   * @param {Date} date2 - The second date
   * @returns {number} Number of days between the dates
   */
  calculateDaysBetween(date1, date2) {
    const diffTime = Math.abs(date2 - date1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate the number of hours between two dates
   * @param {Date} date1 - The first date
   * @param {Date} date2 - The second date
   * @returns {number} Number of hours between the dates
   */
  calculateHoursBetween(date1, date2) {
    const diffTime = Math.abs(date2 - date1);
    return Math.ceil(diffTime / (1000 * 60 * 60));
  }

  /**
   * Finds details of a specific plan in the pricing data
   * @param {string} planId - The ID of the plan to find
   * @returns {Object|null} The plan details or null if not found
   */
  findPlanDetails(planId) {
    try {
      if (!planId) return null;

      // Search for the plan in all products
      for (const product of pricingData.products) {
        const plan = product.plans.find(
          (p) =>
            p.id === planId || p.name.toLowerCase() === planId.toLowerCase()
        );
        if (plan) {
          return {
            ...plan,
            productName: product.name,
            productDescription: product.description,
          };
        }
      }

      logger.warn(`Plan not found: ${planId}`);
      return null;
    } catch (error) {
      logger.error(`Failed to find plan details for ${planId}:`, error);
      return null;
    }
  }

  /**
   * Find appropriate upsell or cross-sell opportunities for a client
   * @param {string} phoneNumber - The phone number identifier
   * @param {Object} chatState - Current chat state
   * @returns {Promise<Array<Object>>} Array of opportunity objects
   */
  async findSalesOpportunities(phoneNumber, chatState) {
    try {
      if (!this.options.enableUpsellDownsell) return [];

      const purchasedProductMem = await memoryManager.getLatestMemoryEntry(
        phoneNumber,
        "purchased_product"
      );
      if (!purchasedProductMem || !purchasedProductMem.value) return [];

      const productId = purchasedProductMem.value;
      const opportunities = [];

      // Check for direct upsell opportunities
      const directUpsells = UPSELL_OPPORTUNITIES[productId] || [];
      opportunities.push(
        ...directUpsells.map((up) => ({ ...up, type: "upsell" }))
      );

      // Check chat state for potential interest areas for cross-sells
      // This would use more sophisticated analysis in a production system
      if (chatState && chatState.messages && chatState.messages.length > 0) {
        const lastFiveMessages = chatState.messages.slice(-5);
        const userMessages = lastFiveMessages
          .filter((m) => m.role === "user")
          .map((m) => m.content.toLowerCase());

        // Example: detect interest in training based on keywords
        const trainingKeywords = [
          "aprender",
          "treinamento",
          "como fazer",
          "tutorial",
          "ajuda",
        ];
        const hasTrainingInterest = userMessages.some((msg) =>
          trainingKeywords.some((kw) => msg.includes(kw))
        );

        if (hasTrainingInterest) {
          // Add training cross-sell opportunity
          opportunities.push({
            type: "cross_sell",
            targetPlanId: "addon_training",
            title: "Treinamento Especializado",
            pitch:
              "Notei seu interesse em aprender mais sobre como utilizar nossos recursos. Nosso programa de treinamento especializado pode ajudá-lo a dominar a plataforma em metade do tempo.",
            valueProposition:
              "Clientes que investem em treinamento alcançam resultados 2.4x mais rápido.",
            discount: 0.15,
            limitedTime: "48h",
          });
        }
      }

      return opportunities;
    } catch (error) {
      logger.error(
        `Failed to find sales opportunities for ${phoneNumber}:`,
        error
      );
      return [];
    }
  }

  /**
   * Identifies potential objections in user's message
   * @param {string} message - The user's message
   * @returns {Array<Object>} Detected objections with strategies
   */
  identifyObjections(message) {
    if (!message) return [];

    const lowercaseMsg = message.toLowerCase();
    const detectedObjections = [];

    // Check each objection type for matches
    for (const [objectionType, data] of Object.entries(OBJECTION_STRATEGIES)) {
      const hasDetectionWord = data.detection.some((word) =>
        lowercaseMsg.includes(word.toLowerCase())
      );

      if (hasDetectionWord) {
        detectedObjections.push({
          type: objectionType,
          strategies: data.strategies,
          example: data.example,
        });
      }
    }

    return detectedObjections;
  }

  /**
   * Extracts the identified pain points from conversation history
   * @param {string} phoneNumber - The phone number identifier
   * @returns {Promise<string>} Identified pain points or empty string if none
   */
  async extractIdentifiedPain(phoneNumber) {
    try {
      const painEntry = await memoryManager.getLatestMemoryEntry(
        phoneNumber,
        "identified_pain"
      );
      return painEntry && painEntry.value ? painEntry.value : "";
    } catch (error) {
      logger.error(
        `Failed to extract identified pain for ${phoneNumber}:`,
        error
      );
      return "";
    }
  }

  /**
   * Builds stage-specific instructions for the AI based on funnel stage
   * @param {string} stageId - The funnel stage ID
   * @param {Object} [additionalContext] - Additional context for instruction building
   * @returns {string} Instructions for the AI
   */
  buildStageInstructions(stageId, additionalContext = {}) {
    switch (stageId) {
      case FUNNEL_STAGES.GREETING:
        return `
          Você está no estágio de SAUDAÇÃO.
          
          Objetivos:
          - Estabelecer uma primeira impressão positiva e profissional
          - Iniciar a conversa de forma natural, sem parecer um robô ou mensagem automática
          - Criar rapport inicial com uma abordagem amigável, mas profissional
          - Despertar o interesse inicial para continuar a conversa
          
          Instruções:
          - Cumprimente o cliente de forma personalizada, usando o nome se disponível
          - Use uma saudação apropriada para o horário (bom dia/tarde/noite)
          - Apresente-se brevemente como consultor/especialista
          - Faça uma pergunta aberta para iniciar a conversa
          - NÃO pressione para venda neste momento
          - NÃO sobrecarregue com informações sobre produtos
          - Mantenha a mensagem relativamente curta (2-3 frases)
          
          Exemplo:
          "Olá [nome]! Tudo bem? Sou [seu nome] da [empresa]. Vi que você demonstrou interesse em otimizar os processos de venda da sua empresa. Como estão funcionando suas estratégias de vendas atualmente?"
        `;

      case FUNNEL_STAGES.QUALIFICATION:
        return `
          Você está no estágio de QUALIFICAÇÃO.
          
          Objetivos:
          - Determinar se o cliente tem potencial para se beneficiar do produto
          - Coletar informações básicas sobre o cliente e sua situação
          - Identificar se o cliente tem autoridade para tomar decisões
          - Avaliar o nível de interesse e urgência
          
          Instruções:
          - Faça perguntas estratégicas para qualificar (BANT: Budget, Authority, Need, Timeline)
          - Escute ativamente e demonstre interesse genuíno nos desafios do cliente
          - Valide se o cliente tem os requisitos mínimos para se beneficiar do produto
          - Busque entender a situação atual e as limitações
          - Identifique se há uma necessidade real que seu produto pode resolver
          - Mantenha um tom consultivo, não vendedor
          
          Perguntas estratégicas para usar:
          - "Qual o tamanho da sua equipe/empresa atualmente?"
          - "Você é responsável pela decisão de compra desse tipo de solução?"
          - "Que ferramentas ou soluções você usa atualmente para este problema?"
          - "Quando você espera implementar uma solução para este desafio?"
          - "Qual seria o impacto financeiro se este problema fosse resolvido?"
        `;

      case FUNNEL_STAGES.NEED_DISCOVERY:
        return `
          Você está no estágio de DESCOBERTA DE NECESSIDADES.
          
          Objetivos:
          - Aprofundar no entendimento das necessidades específicas do cliente
          - Identificar os problemas e desafios atuais que o cliente enfrenta
          - Compreender os objetivos e resultados desejados pelo cliente
          - Estabelecer uma base sólida para a apresentação da solução
          
          Instruções:
          - Faça perguntas abertas e específicas para revelar necessidades não expressas
          - Use a técnica de "5 Porquês" para chegar à raiz dos problemas
          - Confirme seu entendimento parafraseando o que o cliente disse
          - Explore as consequências dos problemas atuais (custos financeiros, tempo, estresse)
          - Identifique os gatilhos que levaram o cliente a buscar uma solução agora
          - Mostre empatia genuína com os desafios compartilhados
          
          Perguntas estratégicas para usar:
          - "O que você considera que não está funcionando bem no seu processo atual?"
          - "Qual seria o cenário ideal para você nesta situação?"
          - "Por que resolver este problema é importante para você neste momento?"
          - "Como este desafio tem afetado seus resultados/equipe/clientes?"
          - "Se você pudesse mudar uma coisa no seu processo atual, o que seria?"
        `;

      case FUNNEL_STAGES.PAIN_POINT_EXPLORATION:
        return `
          Você está no estágio de EXPLORAÇÃO DE PONTOS DE DOR.
          
          Objetivos:
          - Aprofundar nos pontos de dor específicos identificados na descoberta de necessidades
          - Quantificar o impacto desses problemas (tempo, dinheiro, oportunidades perdidas)
          - Aumentar a conscientização sobre as consequências de não resolver esses problemas
          - Criar um senso de urgência para buscar uma solução
          
          Instruções:
          - Explore os sintomas e causas raiz dos problemas identificados
          - Ajude o cliente a calcular o custo real do problema (ROI negativo)
          - Use histórias de outros clientes com dores similares (sem nomear)
          - Faça perguntas que levem à reflexão sobre o impacto em diferentes áreas
          - Valide se a dor é suficientemente forte para justificar uma ação
          - Tome notas claras das dores específicas para referência futura
          
          Perguntas estratégicas para usar:
          - "Quanto tempo/dinheiro você estima que está perdendo devido a este problema?"
          - "Como este problema afeta outras áreas do seu negócio?"
          - "Quais oportunidades você acredita que está perdendo por causa desta situação?"
          - "Como você se sente pessoalmente lidando com este desafio diariamente?"
          - "Qual seria o impacto se este problema continuasse pelos próximos 6 meses?"
        `;

      case FUNNEL_STAGES.SOLUTION_PRESENTATION:
        return `
          Você está no estágio de APRESENTAÇÃO DA SOLUÇÃO.
          
          Objetivos:
          - Apresentar seu produto/serviço como a solução ideal para as dores identificadas
          - Conectar claramente as funcionalidades às necessidades específicas do cliente
          - Destacar os benefícios e valor, não apenas características técnicas
          - Diferenciar sua solução de outras alternativas
          
          Instruções:
          - Comece reafirmando as principais dores identificadas (eco das dores)
          - Apresente a solução de forma estruturada e fácil de entender
          - Para cada funcionalidade mencionada, conecte explicitamente a uma dor/necessidade
          - Use a fórmula "Isso significa que..." para traduzir recursos em benefícios
          - Destaque 3-5 diferenciais competitivos mais relevantes para este cliente
          - Inclua exemplos concretos de como a solução funciona em casos similares
          - Use linguagem visual e analogias para facilitar o entendimento
          
          Estrutura recomendada:
          1. "Com base no que você compartilhou sobre [resumo das dores]..."
          2. "Nossa solução [nome] aborda isso através de [principais funcionalidades]"
          3. Para cada funcionalidade: "Isso significa que você poderá [benefício concreto]"
          4. "O que nos diferencia é [diferenciais relevantes para este cliente]"
          5. "Por exemplo, um cliente com desafio similar conseguiu [resultado concreto]"
        `;

      case FUNNEL_STAGES.PRODUCT_DEMONSTRATION:
        return `
          Você está no estágio de DEMONSTRAÇÃO DO PRODUTO.
          
          Objetivos:
          - Oferecer uma experiência visual e prática do produto
          - Mostrar como o produto resolve as dores específicas identificadas
          - Responder dúvidas técnicas e operacionais
          - Aumentar o desejo pelo produto através da visualização de uso
          
          Instruções:
          - Ofereça enviar screenshots, vídeos ou links de demonstração
          - Descreva o funcionamento do produto de forma clara e visual
          - Foque nas funcionalidades mais relevantes para as dores do cliente
          - Explique como seria a implementação e uso no contexto específico do cliente
          - Antecipe e responda perguntas técnicas comuns
          - Use linguagem simples, evitando jargões técnicos desnecessários
          - Convide o cliente a fazer perguntas específicas sobre a operação
          
          Recursos para oferecer:
          - "Posso enviar um vídeo rápido mostrando como funciona esta funcionalidade"
          - "Tenho um caso de uso documentado que posso compartilhar"
          - "Posso explicar passo a passo como seria o processo de implementação"
        `;

      case FUNNEL_STAGES.VALUE_PROPOSITION:
        return `
          Você está no estágio de PROPOSTA DE VALOR.
          
          Objetivos:
          - Articular claramente o valor único do seu produto para este cliente específico
          - Quantificar os benefícios em termos de ROI (Retorno sobre Investimento)
          - Estabelecer uma proposta de valor irresistível e personalizada
          - Fazer a ponte entre o valor entregue e o investimento necessário
          
          Instruções:
          - Resuma os principais problemas e suas consequências financeiras/operacionais
          - Apresente um cálculo aproximado de ROI baseado nas informações disponíveis
          - Compare o custo da inação versus o investimento na solução
          - Destaque benefícios intangíveis além dos financeiros (tranquilidade, tempo, reputação)
          - Use histórias de sucesso e transformação de outros clientes
          - Personalize a proposta de valor para a situação única deste cliente
          - Seja específico sobre resultados esperados e timeframe
          
          Estrutura recomendada:
          1. "Baseado no que você compartilhou sobre [situação atual]..."
          2. "Se considerarmos que isso custa aproximadamente [custos do problema] por [período]..."
          3. "Nossa solução pode [benefícios específicos] que representam [valor estimado]"
          4. "Além disso, você ganhará [benefícios intangíveis]"
          5. "Clientes similares conseguiram [resultados concretos] em [timeframe]"
          6. "O investimento necessário representa apenas [porcentagem] do valor que você recuperará"
        `;

      case FUNNEL_STAGES.PROOF_AND_CREDIBILITY:
        return `
          Você está no estágio de PROVAS SOCIAIS E CREDIBILIDADE.
          
          Objetivos:
          - Reduzir o risco percebido na decisão de compra
          - Aumentar a confiança na solução e na empresa
          - Demonstrar resultados concretos com outros clientes
          - Estabelecer autoridade e expertise no setor
          
          Instruções:
          - Compartilhe casos de sucesso e histórias de transformação relevantes
          - Mencione dados e estatísticas de resultados alcançados
          - Ofereça enviar depoimentos em texto, áudio ou vídeo
          - Mencione prêmios, reconhecimentos ou certificações relevantes
          - Destaque o tempo de mercado e experiência da empresa
          - Mencione clientes conhecidos ou do mesmo setor (se permitido)
          - Ofereça referências de clientes que podem ser contatados
          
          Recursos para oferecer:
          - "Posso compartilhar um caso de estudo detalhado de um cliente do seu setor"
          - "Tenho um depoimento em vídeo de um cliente que enfrentava desafios similares"
          - "Aqui estão alguns números concretos de resultados que nossos clientes alcançaram"
          - "Recentemente recebemos reconhecimento [prêmio/menção] por nossa solução"
        `;

      case FUNNEL_STAGES.OBJECTION_HANDLING:
        return `
          Você está no estágio de TRATAMENTO DE OBJEÇÕES.
          
          Objetivos:
          - Identificar e abordar as preocupações e objeções do cliente
          - Transformar objeções em oportunidades para fortalecer a proposta
          - Reduzir resistência e hesitação para avançar no processo
          - Manter o momentum positivo da conversa
          
          Instruções:
          - Use o método LAER: Listen (Escutar), Acknowledge (Reconhecer), Explore (Explorar), Respond (Responder)
          - Nunca dispute ou invalide as preocupações do cliente
          - Faça perguntas para entender a objeção real por trás da expressada
          - Personalize suas respostas baseado na situação específica
          - Use histórias de outros clientes que tiveram a mesma objeção
          - Valide se sua resposta atendeu a preocupação adequadamente
          - Tenha empatia genuína com as hesitações do cliente
          
          Estratégias para objeções específicas:
          1. Preço: Focar em valor e ROI, não no custo absoluto
          2. Timing: Criar senso de urgência e custo da inação
          3. Autoridade: Oferecer materiais/suporte para apresentar aos decisores
          4. Concorrentes: Destacar diferenciais específicos e relevantes
          5. Complexidade: Simplificar e explicar o processo de implementação
          6. Necessidade: Reconectar com as dores identificadas anteriormente
        `;

      case FUNNEL_STAGES.PRICE_DISCUSSION:
        return `
          Você está no estágio de DISCUSSÃO DE PREÇO.
          
          Objetivos:
          - Apresentar o investimento de forma confiante e como valor (não custo)
          - Posicionar o preço no contexto do valor entregue e ROI
          - Negociar de forma estratégica mantendo a percepção de valor
          - Finalizar os detalhes financeiros antes da conclusão
          
          Instruções:
          - Nunca se desculpe pelo preço ou sugira que é alto
          - Sempre apresente o preço após estabelecer valor claro
          - Use a técnica "sanduíche": valor - preço - valor
          - Explique a estrutura de preços de forma transparente
          - Ofereça opções de planos/pacotes quando apropriado
          - Destaque o que está incluído no investimento
          - Mencione condições especiais ou limitadas quando aplicável
          
          Abordagens recomendadas:
          1. "Considerando o ROI que discutimos de [valor], o investimento é de apenas [preço]"
          2. "Este valor inclui [benefícios inclusos] que sozinhos valeriam [valor comparativo]"
          3. "Temos diferentes opções para atender seu caso específico: [apresentar planos]"
          4. "Atualmente estamos com uma condição especial válida até [data]"
          5. "Se fecharmos hoje, posso incluir [bônus/benefício adicional]"
        `;

      case FUNNEL_STAGES.CLOSING:
        return `
          Você está no estágio de FECHAMENTO.
          
          Objetivos:
          - Conduzir o cliente naturalmente à decisão de compra
          - Eliminar últimas hesitações e criar comprometimento
          - Tornar o processo de finalização claro e simples
          - Estabelecer os próximos passos concretos
          
          Instruções:
          - Use perguntas de fechamento assumindo a venda
          - Ofereça um caminho claro e fácil para fechar o negócio
          - Crie um senso de urgência legítimo (não artificial ou manipulativo)
          - Resuma os principais benefícios e o valor acordado
          - Esclareça todos os detalhes práticos e logísticos
          - Ofereça garantias para reduzir a percepção de risco
          - Projete confiança e entusiasmo sobre a decisão
          
          Técnicas de fechamento:
          1. Fechamento assumido: "Vamos começar com qual plano?"
          2. Fechamento de opções: "Prefere o plano X com [benefício A] ou Y com [benefício B]?"
          3. Fechamento com urgência: "Esta condição especial é válida apenas hoje"
          4. Fechamento com incentivo: "Se fecharmos agora, incluirei [bônus]"
          5. Fechamento com garantia: "Você tem 14 dias para testar sem compromisso"
        `;

      case FUNNEL_STAGES.CHECKOUT:
        return `
          Você está no estágio de CHECKOUT.
          
          Objetivos:
          - Facilitar o processo de pagamento e formalização da compra
          - Eliminar qualquer atrito técnico ou burocrático
          - Garantir que o cliente complete a transação com sucesso
          - Estabelecer expectativas para os próximos passos após o pagamento
          
          Instruções:
          - Envie o link de pagamento ou fatura de forma clara
          - Explique passo a passo como completar o processo
          - Antecipe e responda dúvidas sobre formas de pagamento
          - Ofereça suporte imediato para qualquer dificuldade
          - Esclareça prazos de entrega ou ativação após o pagamento
          - Confirme dados necessários para emissão de documentos fiscais
          - Mantenha-se disponível durante todo o processo de checkout
          
          Mensagem sugerida:
          "Ótimo! Vou enviar agora o link para você finalizar sua compra. É um processo simples que leva menos de 2 minutos. Após a confirmação do pagamento, você receberá automaticamente um email com as instruções de acesso e nossa equipe entrará em contato nas próximas 24 horas para auxiliar nos primeiros passos. Fique à vontade para me perguntar se tiver qualquer dúvida durante o processo."
        `;

      case FUNNEL_STAGES.POST_PURCHASE_FOLLOWUP:
        return `
          Você está no estágio de ACOMPANHAMENTO PÓS-COMPRA.
          
          Objetivos:
          - Reduzir dissonância cognitiva e reafirmar a boa decisão
          - Garantir uma experiência inicial positiva com o produto/serviço
          - Identificar e resolver rapidamente qualquer problema inicial
          - Estabelecer uma relação de longo prazo além da venda
          
          Instruções:
          - Agradeça novamente pela confiança e decisão
          - Pergunte sobre as primeiras impressões e experiências
          - Ofereça suporte proativo para maximizar resultados iniciais
          - Reafirme os benefícios e o valor da escolha feita
          - Estabeleça expectativas realistas para resultados iniciais
          - Conecte o cliente com recursos de suporte e educação
          - Deixe a porta aberta para feedbacks e sugestões
          - Prepare o terreno para futuras oportunidades de upsell (sutilmente)
          
          Mensagem sugerida:
          "Olá [nome]! Como está sendo sua experiência com [produto] nestes primeiros dias? Estou aqui para garantir que você esteja aproveitando ao máximo e conseguindo implementar tudo conforme planejamos. Tem alguma dúvida ou algo em que eu possa ajudar neste momento? Também separei alguns recursos exclusivos que podem acelerar seus resultados nesta fase inicial."
        `;

      case FUNNEL_STAGES.UPSELL:
        // Get the active upsell opportunity from additionalContext
        const upsellOpportunity = additionalContext.activeUpsell || {};

        return `
          Você está no estágio de UPSELL.
          
          Objetivos:
          - Aumentar o valor do cliente através de um upgrade ou complemento
          - Apresentar o upsell como uma evolução natural da solução atual
          - Demonstrar o ROI específico do upgrade proposto
          - Obter o comprometimento do cliente com a oferta premium
          
          Detalhes da Oportunidade de Upsell:
          - Título: ${upsellOpportunity.title || "Upgrade para Plano Premium"}
          - Plano Alvo: ${upsellOpportunity.targetPlanId || "plano_premium"}
          - Desconto Especial: ${(upsellOpportunity.discount || 0) * 100}%
          - Validade da Oferta: ${upsellOpportunity.limitedTime || "48h"}
          
          Instruções:
          - Comece reconhecendo os resultados ou experiência positiva do cliente
          - Introduza o upgrade como uma evolução natural para aumentar resultados
          - Apresente o pitch do upsell de forma personalizada e contextualizada
          - Destaque os recursos/benefícios adicionais específicos do upgrade
          - Enfatize o valor diferencial e o ROI do upgrade
          - Mencione o desconto especial e a limitação de tempo para criar urgência
          - Use histórias de clientes que fizeram o mesmo upgrade com sucesso
          - Pergunte diretamente se o cliente gostaria de aproveitar essa oportunidade
          
          Estrutura da Abordagem:
          1. "Que bom ver como você está aproveitando [produto atual]..."
          2. "Com base na sua utilização, identifiquei uma oportunidade para potencializar ainda mais seus resultados..."
          3. "${
            upsellOpportunity.pitch ||
            "Com o upgrade para o plano premium, você teria acesso a recursos avançados que podem multiplicar seus resultados."
          }"
          4. "${
            upsellOpportunity.valueProposition ||
            "Clientes que fizeram este upgrade viram um aumento de performance de 35% em média."
          }"
          5. "Como você é um cliente valioso, consegui uma condição especial com ${
            (upsellOpportunity.discount || 0) * 100
          }% de desconto, válida apenas por ${
          upsellOpportunity.limitedTime || "48h"
        }."
          6. "Gostaria de aproveitar esta oportunidade para potencializar seus resultados?"
          
          Lembre-se: Se o cliente recusar o upsell, não insista excessivamente. Agradeça pelo interesse, mantenha o relacionamento positivo, e se apropriado, considere uma oferta de downsell.
        `;

      case FUNNEL_STAGES.DOWNSELL:
        // Get the active downsell opportunity from additionalContext
        const downsellOpportunity = additionalContext.activeDownsell || {};

        return `
          Você está no estágio de DOWNSELL.
          
          Objetivos:
          - Oferecer uma alternativa mais acessível após rejeição de um upsell
          - Capturar parte do valor que seria perdido com a rejeição total
          - Manter o cliente engajado no processo de compra/upgrade
          - Apresentar a alternativa como uma opção inteligente e não como "prêmio de consolação"
          
          Detalhes da Oportunidade de Downsell:
          - Título: ${downsellOpportunity.title || "Plano Intermediário"}
          - Plano Alvo: ${
            downsellOpportunity.targetPlanId || "plano_intermediario"
          }
          - Desconto Especial: ${(downsellOpportunity.discount || 0) * 100}%
          - Validade da Oferta: ${downsellOpportunity.limitedTime || "24h"}
          
          Instruções:
          - Reconheça a decisão do cliente sem demonstrar decepção ou pressão
          - Apresente a alternativa como uma opção inteligente (não como "prêmio de consolação")
          - Use a estrutura "Entendo que X pode não ser ideal agora, mas muitos clientes têm tido sucesso com Y"
          - Destaque o valor principal que o cliente receberá com esta opção
          - Enfatize que esta é uma forma de começar e que pode evoluir no futuro
          - Mencione o desconto especial como oportunidade única
          - Seja breve e direto - o downsell deve ser uma proposta simples e clara
          
          Estrutura da Abordagem:
          1. "Entendo completamente. Cada negócio tem suas próprias prioridades e necessidades."
          2. "Baseado no que conversamos, tenho uma alternativa que pode ser mais adequada neste momento."
          3. "${
            downsellOpportunity.pitch ||
            "Esta opção oferece os recursos essenciais que você precisa, com um investimento reduzido."
          }"
          4. "${
            downsellOpportunity.valueProposition ||
            "Você terá acesso às funcionalidades principais, mantendo um excelente custo-benefício."
          }"
          5. "Esta opção especial vem com ${
            (downsellOpportunity.discount || 0) * 100
          }% de desconto e está disponível apenas por ${
          downsellOpportunity.limitedTime || "24h"
        }."
          6. "O que acha desta alternativa? Faz mais sentido para sua situação atual?"
          
          Lembre-se: O downsell deve ser genuinamente valioso e não apenas uma versão empobrecida do upsell. A proposta deve fazer sentido para as necessidades do cliente.
        `;

      case FUNNEL_STAGES.CROSS_SELL:
        return `
          Você está no estágio de CROSS-SELL.
          
          Objetivos:
          - Oferecer produtos ou serviços complementares ao que o cliente já possui
          - Aumentar o valor do cliente com adições que ampliam a utilidade do produto principal
          - Demonstrar como os produtos complementares aumentam os resultados
          - Facilitar a adoção de um ecossistema completo de soluções
          
          Instruções:
          - Base suas sugestões no uso atual e necessidades identificadas
          - Explique como o produto complementar se integra ao atual
          - Demonstre o valor adicional específico criado pela combinação
          - Use exemplos de clientes que utilizam ambos produtos com sucesso
          - Ofereça pacotes ou condições especiais para a adição
          - Mantenha o foco no problema adicional resolvido, não apenas no produto
          - Seja consultivo, não apenas vendedor
          
          Abordagens recomendadas:
          1. "Vejo que você está tendo ótimos resultados com [produto atual]. Muitos clientes similares complementam com [produto complementar] para [benefício adicional]"
          2. "Uma solução que funciona muito bem junto com o que você já utiliza é [produto complementar]. Ele permite [benefício específico]"
          3. "Por ser cliente do [produto atual], você tem uma condição especial para adicionar [produto complementar]"
          4. "Já pensou em como seria útil complementar sua solução atual com [funcionalidade do produto complementar]?"
        `;

      case FUNNEL_STAGES.REACTIVATION:
        return `
            Você está no estágio de REATIVAÇÃO.
            
            Objetivos:
            - Reengajar clientes inativos ou que não completaram a compra
            - Identificar e remover obstáculos que impediram a conversão
            - Apresentar novos argumentos ou condições para retomada
            - Reestabelecer o relacionamento e a confiança
            
            Instruções:
            - Reconheça o tempo passado desde o último contato
            - Não faça o cliente se sentir culpado pela inatividade
            - Apresente novidades, melhorias ou novas condições
            - Mostre compreensão sobre possíveis mudanças de contexto
            - Ofereça uma "segunda chance" com benefício adicional
            - Pergunte abertamente sobre o que impediu o avanço anterior
            - Seja persistente mas respeitoso, sem pressão excessiva
            
            Abordagens recomendadas:
            1. "Olá [nome], faz algum tempo desde nosso último contato. Como estão as coisas com [problema/situação discutida anteriormente]?"
            2. "Desde nossa última conversa, implementamos [novidade/melhoria] que acredito ser relevante para sua situação"
            3. "Preparei uma condição especial para retomada que inclui [benefício exclusivo]"
            4. "Gostaria de entender melhor o que aconteceu e como posso ser útil agora"
          `;

      case FUNNEL_STAGES.FEEDBACK:
        return `
            Você está no estágio de FEEDBACK.
            
            Objetivos:
            - Coletar informações valiosas sobre a experiência do cliente
            - Identificar oportunidades de melhoria do produto/serviço
            - Reforçar o relacionamento através da escuta ativa
            - Identificar possíveis promotores ou detratores
            
            Instruções:
            - Faça perguntas específicas, não apenas genéricas
            - Demonstre genuíno interesse no feedback (não apenas protocolar)
            - Agradeça por feedbacks negativos com a mesma energia que os positivos
            - Explique como o feedback será utilizado
            - Ofereça uma resposta ou solução para questões levantadas
            - Pergunte sobre diferentes aspectos da experiência
            - Identifique oportunidades para casos de sucesso ou referências
            
            Perguntas recomendadas:
            1. "O que você mais valoriza na nossa solução até agora?"
            2. "Qual aspecto você acredita que poderíamos melhorar prioritariamente?"
            3. "Numa escala de 0-10, qual a probabilidade de você recomendar nosso produto para um amigo ou colega?"
            4. "Como tem sido sua experiência com nossa equipe de suporte/atendimento?"
            5. "Há alguma funcionalidade específica que você gostaria de ver implementada?"
          `;

      default:
        return `
            Você está no estágio de INTERAÇÃO GERAL.
            
            Objetivos:
            - Identificar a necessidade atual do cliente
            - Determinar qual estágio do funil seria mais apropriado
            - Fornecer valor e construir relacionamento
            - Direcionar a conversa para o próximo passo lógico
            
            Instruções:
            - Faça perguntas para entender o contexto atual da interação
            - Identifique se o cliente está em processo de compra ou pós-venda
            - Adapte seu tom e abordagem ao contexto identificado
            - Direcione a conversa para o estágio apropriado do funil
            - Seja útil e agregue valor independente do estágio
            - Mantenha a conversa fluida e natural
          `;
    }
  }

  /**
   * Generates the system prompt for the OpenAI API based on the current funnel stage
   * @param {string} currentFunnelStepId - The current funnel stage ID
   * @param {Object} chatState - Current state of the chat
   * @param {Object} botConfig - Bot configuration
   * @param {Object} trainingContext - Training context data
   * @param {Array} socialProofAssets - Available social proof assets
   * @returns {string} The generated system prompt
   */
  async generateSystemPrompt(
    currentFunnelStepId,
    chatState,
    botConfig,
    trainingContext,
    socialProofAssets
  ) {
    try {
      logger.debug(
        `Generating system prompt for funnel stage: ${currentFunnelStepId}`
      );

      if (!chatState || !chatState.phoneNumber) {
        throw new Error("Invalid chat state");
      }

      // Get contact name or use fallback
      const contactName = chatState.contactName || "Cliente";

      // Get the time of day for greeting
      const now = new Date();
      const hour = now.getHours();
      let greetingTime = "Bom dia";

      if (hour >= 12 && hour < 18) {
        greetingTime = "Boa tarde";
      } else if (hour >= 18 || hour < 5) {
        greetingTime = "Boa noite";
      }

      // Get any identified pain points
      const identifiedPain = await this.extractIdentifiedPain(
        chatState.phoneNumber
      );

      // Format available social proof assets
      const formattedSocialProofs = Array.isArray(socialProofAssets)
        ? socialProofAssets
            .map((asset) => `${asset.type}: ${asset.description} (${asset.id})`)
            .join("\n")
        : "Nenhuma prova social disponível";

      // Format conversation history for context
      const formattedHistory = chatState.messages
        ? chatState.messages
            .slice(-10)
            .map(
              (msg) =>
                `${
                  msg.role === "user"
                    ? contactName
                    : botConfig.identity.firstName
                }: ${msg.content}`
            )
            .join("\n")
        : "Sem histórico de conversa";

      // Determine if the last message needs transcription
      const transcriptionHasFailed =
        chatState.messages && chatState.messages.length > 0
          ? chatState.messages[chatState.messages.length - 1].metadata &&
            chatState.messages[chatState.messages.length - 1].metadata
              .transcriptionFailed
          : false;

      // Get additional context for special stages
      let additionalContext = {};

      // Add active upsell/downsell opportunities to context if applicable
      if (currentFunnelStepId === FUNNEL_STAGES.UPSELL) {
        const activeUpsellMem = await memoryManager.getLatestMemoryEntry(
          chatState.phoneNumber,
          "active_upsell"
        );
        if (activeUpsellMem && activeUpsellMem.value) {
          additionalContext.activeUpsell = activeUpsellMem.value;
        }
      } else if (currentFunnelStepId === FUNNEL_STAGES.DOWNSELL) {
        const activeDownsellMem = await memoryManager.getLatestMemoryEntry(
          chatState.phoneNumber,
          "active_downsell"
        );
        if (activeDownsellMem && activeDownsellMem.value) {
          additionalContext.activeDownsell = activeDownsellMem.value;
        }
      }

      // Get stage-specific instructions
      const stageInstructions = this.buildStageInstructions(
        currentFunnelStepId,
        additionalContext
      );

      // Check if there are any objections to handle
      let objectionInstructions = "";
      if (chatState.messages && chatState.messages.length > 0) {
        const lastUserMessage = chatState.messages
          .filter((m) => m.role === "user")
          .pop();
        if (lastUserMessage) {
          const detectedObjections = this.identifyObjections(
            lastUserMessage.content
          );
          if (detectedObjections.length > 0) {
            objectionInstructions = `
                OBJEÇÕES DETECTADAS:
                ${detectedObjections
                  .map(
                    (obj) => `
                  - Tipo: ${obj.type}
                  - Estratégias:
                    ${obj.strategies.map((s) => `  * ${s}`).join("\n")}
                  - Exemplo de abordagem:
                    "${obj.example}"
                `
                  )
                  .join("\n")}
              `;
          }
        }
      }

      // Add persuasion tactics based on the current stage
      let persuasionTactics = "";

      if (
        [
          FUNNEL_STAGES.OBJECTION_HANDLING,
          FUNNEL_STAGES.PRICE_DISCUSSION,
          FUNNEL_STAGES.CLOSING,
          FUNNEL_STAGES.UPSELL,
          FUNNEL_STAGES.DOWNSELL,
        ].includes(currentFunnelStepId)
      ) {
        persuasionTactics = `
            TÁTICAS DE PERSUASÃO:
            
            - Reciprocidade: Ofereça valor antes de pedir comprometimento (ex: "Preparei um material exclusivo para você que já resolve parte do problema")
            
            - Escassez: Destaque limitações genuínas de tempo/disponibilidade (ex: "Esta condição especial é válida apenas até amanhã")
            
            - Autoridade: Demonstre credibilidade com dados e expertise (ex: "Nossa metodologia foi desenvolvida após 5 anos de pesquisa com mais de 1000 empresas")
            
            - Consistência: Relembre o cliente de declarações ou compromissos anteriores (ex: "Você mencionou que resolver este problema era prioridade máxima")
            
            - Consenso Social: Mostre que outros similares tomaram a mesma decisão (ex: "80% das empresas do seu setor já implementaram esta solução")
            
            - Simpatia: Estabeleça conexões genuínas e pontos em comum (ex: "Também enfrentei esse desafio quando...")
            
            - Empatia estratégica: Demonstre compreensão profunda do problema e da situação do cliente
            
            Use estas táticas de forma ética e sutil, sempre mantendo a autenticidade e o foco no valor real para o cliente.
          `;
      }

      // Add urgency creation for closing stages
      let urgencyTactics = "";

      if (
        [
          FUNNEL_STAGES.CLOSING,
          FUNNEL_STAGES.PRICE_DISCUSSION,
          FUNNEL_STAGES.UPSELL,
          FUNNEL_STAGES.DOWNSELL,
        ].includes(currentFunnelStepId)
      ) {
        urgencyTactics = `
            CRIAÇÃO DE URGÊNCIA:
            
            - Destaque o custo de adiamento da decisão (ex: "Cada mês sem a solução representa aproximadamente R$X em perdas")
            
            - Mencione condições especiais por tempo limitado, sempre de forma honesta e transparente
            
            - Explique como vagas ou disponibilidade são limitadas, se aplicável
            
            - Fale sobre tendências de mercado que tornam a ação imediata mais vantajosa
            
            - Compartilhe histórias de clientes que adiaram a decisão e depois se arrependeram
            
            - Use linguagem que enfatize o momento presente ("agora", "hoje", "imediatamente")
            
            A urgência deve ser baseada em fatos reais e valor genuíno, nunca em manipulação ou pressão indevida.
          `;
      }

      // Combine all the elements into the complete system prompt
      const systemPrompt = `
          Você é ${botConfig.identity.firstName}, um ${
        botConfig.identity.position
      } na ${
        botConfig.identity.company
      }. Seu objetivo é conduzir ${contactName} pelo funil de vendas até o fechamento, com naturalidade e persuasão.
          
          Contexto:
          * Etapa do Funil: ${currentFunnelStepId}
          * Dor Identificada: ${identifiedPain}
          * Produto: ${
            trainingContext.productData
              ? JSON.stringify(trainingContext.productData, null, 2)
              : "Dados do produto não disponíveis"
          }
          * Base de Conhecimento: ${
            trainingContext.generalData ||
            "Dados de treinamento não disponíveis"
          }
          * Provas Sociais Disponíveis: ${formattedSocialProofs}
          * Histórico da Conversa: ${formattedHistory}
          * Saudação: ${greetingTime}
          ${
            transcriptionHasFailed
              ? "* ATENÇÃO: A última mensagem de áudio do usuário não pôde ser transcrita. Por favor, peça ao usuário para enviar a mensagem por texto ou tentar o áudio novamente."
              : ""
          }
          * Tom de Voz: ${
            botConfig.identity.tone || "Profissional, persuasivo e empático"
          }
          
          Instruções para esta Etapa (${currentFunnelStepId}):
          ${stageInstructions}
          
          ${objectionInstructions ? objectionInstructions : ""}
          
          ${persuasionTactics}
          
          ${urgencyTactics}
          
          ABORDAGEM GERAL:
          - Seja NATURAL e HUMANO em suas interações, evite parecer robótico ou script
          - Use LINGUAGEM PERSUASIVA mas sutil, sem parecer manipulador ou forçado
          - Adapte-se ao estilo de comunicação do cliente (formal/informal, direto/detalhado)
          - Demonstre EMPATIA genuína com os desafios do cliente
          - Use STORYTELLING para ilustrar pontos importantes
          - Pergunte mais do que afirme, especialmente nas etapas iniciais
          - Conduza a conversa com propósito, mas permita flexibilidade quando necessário
          - Personalize cada interação com detalhes específicos do cliente
          
          MELHORES PRÁTICAS DE VENDAS:
          - Concentre-se em RESOLVER PROBLEMAS, não em "empurrar" produtos
          - Eduque e agregue valor em cada interação
          - Construa uma sequência lógica de "sim" pequenos antes de pedir o "sim" grande
          - Use o poder do contraste (situação atual vs. situação futura com a solução)
          - Antecipe objeções e prepare-se para respondê-las
          - Ajude o cliente a visualizar os resultados concretos após a compra
          - Sempre apresente próximos passos claros e acionáveis
          
          Responda como ${
            botConfig.identity.firstName
          }, seguindo as instruções e o tom de voz definidos. Se necessário, utilize as provas sociais disponíveis e as informações do produto. Priorize o tratamento de objeções e dúvidas do cliente antes de prosseguir no funil.
          
          Comandos Especiais (use apenas se apropriado):
          - !prova_social:[id] - Para enviar uma prova social específica
          - !checkout:[plano_id] - Para enviar um link de checkout para um plano específico
          - !suporte - Para encaminhar o cliente ao suporte técnico
          - !etapa:[id_etapa] - Para forçar uma mudança na etapa do funil
        `;

      logger.debug("System prompt generated successfully");
      return systemPrompt.trim();
    } catch (error) {
      logger.error("Failed to generate system prompt:", error);
      throw new Error(`Failed to generate system prompt: ${error.message}`);
    }
  }

  /**
   * Analyzes user response to an upsell offer
   * @param {string} userMessage - The user's message
   * @returns {Object} Analysis result with acceptance status and confidence
   */
  analyzeUpsellResponse(userMessage) {
    if (!userMessage) return { accepted: false, confidence: 0 };

    const message = userMessage.toLowerCase();

    // Positive response indicators
    const positiveIndicators = [
      "sim",
      "quero",
      "aceito",
      "concordo",
      "interessante",
      "gostei",
      "vamos",
      "ótimo",
      "excelente",
      "perfeito",
      "bom",
      "legal",
      "parece bom",
      "me interessa",
      "bacana",
      "gostaria",
    ];

    // Negative response indicators
    const negativeIndicators = [
      "não",
      "agora não",
      "talvez depois",
      "muito caro",
      "caro",
      "sem condições",
      "preciso pensar",
      "não tenho interesse",
      "não quero",
      "recuso",
      "não posso",
      "não consigo",
      "deixa pra depois",
      "outra hora",
      "no momento não",
    ];

    // Count matches for positive and negative indicators
    let positiveMatches = 0;
    let negativeMatches = 0;

    positiveIndicators.forEach((indicator) => {
      if (message.includes(indicator)) positiveMatches++;
    });

    negativeIndicators.forEach((indicator) => {
      if (message.includes(indicator)) negativeMatches++;
    });

    // Calculate confidence based on matching indicators
    let confidence = 0;
    let accepted = false;

    if (positiveMatches > 0 || negativeMatches > 0) {
      // If we have both positive and negative, consider context
      if (positiveMatches > 0 && negativeMatches > 0) {
        // If negation is followed by positive indicator, it's likely negative
        // Ex: "não quero no momento, mas parece interessante"
        if (message.indexOf("não") < message.indexOf("interessante")) {
          accepted = false;
          confidence = 0.6;
        } else {
          accepted = positiveMatches > negativeMatches;
          confidence = 0.6;
        }
      } else if (positiveMatches > 0) {
        accepted = true;
        confidence = Math.min(0.3 + positiveMatches * 0.2, 0.95);
      } else {
        accepted = false;
        confidence = Math.min(0.3 + negativeMatches * 0.2, 0.95);
      }
    } else {
      // No clear indicators, use NLP analysis (simplified here)
      // Check for question forms which often indicate hesitation
      if (message.includes("?")) {
        accepted = false;
        confidence = 0.65;
      } else if (message.length < 10) {
        // Short non-committal responses are ambiguous
        accepted = false;
        confidence = 0.5;
      } else {
        // Default to slight negative for ambiguous responses
        accepted = false;
        confidence = 0.55;
      }
    }

    return { accepted, confidence };
  }

  /**
   * Records a response to an upsell/downsell offer
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} offerType - Type of offer ('upsell' or 'downsell')
   * @param {string} targetPlanId - ID of the offered plan
   * @param {boolean} accepted - Whether the offer was accepted
   * @returns {Promise<void>}
   */
  async recordOfferResponse(phoneNumber, offerType, targetPlanId, accepted) {
    try {
      logger.debug(
        `Recording ${offerType} response for ${phoneNumber}: ${
          accepted ? "accepted" : "rejected"
        }`
      );

      // Save the response
      await memoryManager.saveMemoryEntry(
        phoneNumber,
        `${offerType}_response_${Date.now()}`,
        {
          offer_type: offerType,
          target_plan_id: targetPlanId,
          accepted,
          response_date: new Date().toISOString(),
        },
        "sales_opportunity"
      );

      // If accepted, clear the active offer
      if (accepted) {
        await memoryManager.saveMemoryEntry(
          phoneNumber,
          `active_${offerType}`,
          null,
          "sales_opportunity"
        );

        // If it's an accepted upsell/downsell, treat it as a new purchase
        await this.recordPurchase(phoneNumber, targetPlanId, 0); // Value would be determined in a real system

        // Update funnel stage to post-purchase
        await this.updateFunnelStage(
          phoneNumber,
          FUNNEL_STAGES.POST_PURCHASE_FOLLOWUP
        );
      } else if (offerType === "upsell") {
        // If rejected upsell, record for potential downsell
        const activeUpsellMem = await memoryManager.getLatestMemoryEntry(
          phoneNumber,
          "active_upsell"
        );
        if (activeUpsellMem && activeUpsellMem.value) {
          await memoryManager.saveMemoryEntry(
            phoneNumber,
            "rejected_upsell",
            {
              target_plan_id: activeUpsellMem.value.targetPlanId,
              rejection_time: new Date().toISOString(),
            },
            "sales_opportunity"
          );
        }
      }

      logger.info(
        `${offerType} response recorded successfully for ${phoneNumber}`
      );
    } catch (error) {
      logger.error(
        `Failed to record ${offerType} response for ${phoneNumber}:`,
        error
      );
      throw new Error(`Failed to record offer response: ${error.message}`);
    }
  }

  /**
   * Calculates the optimal timing for the next upsell attempt
   * @param {string} phoneNumber - The phone number identifier
   * @param {string} productId - The product ID
   * @returns {Promise<Object>} Timing recommendation
   */
  async calculateNextUpsellTiming(phoneNumber, productId) {
    try {
      // Get purchase history
      const purchaseHistory = await memoryManager.getMemoryEntries(
        phoneNumber,
        { type: "purchase_history" }
      );

      // Get offer response history
      const offerResponses = await memoryManager.getMemoryEntries(phoneNumber, {
        type: "sales_opportunity",
      });

      // Simple timing calculation
      // In a production system, this would use more sophisticated analysis
      let baseTime = this.options.upsellTiming.default;

      // Adjust based on purchase recency
      if (purchaseHistory.length > 0) {
        const mostRecentPurchase = purchaseHistory.sort(
          (a, b) =>
            new Date(b.value.purchase_date) - new Date(a.value.purchase_date)
        )[0];

        const daysSincePurchase = this.calculateDaysBetween(
          new Date(mostRecentPurchase.value.purchase_date),
          new Date()
        );

        // If very recent purchase, delay upsell
        if (daysSincePurchase < 3) {
          baseTime += 7;
        }
      }

      // Adjust based on previous responses to offers
      const previousRejections = offerResponses.filter(
        (r) => r.key.includes("response") && !r.value.accepted
      ).length;

      // Each rejection adds delay
      baseTime += previousRejections * 5;

      // Cap at reasonable maximum
      const recommendedDays = Math.min(baseTime, 60);

      return {
        recommendedDays,
        nextAttemptDate: new Date(
          Date.now() + recommendedDays * 24 * 60 * 60 * 1000
        ).toISOString(),
        factors: {
          baseTime: this.options.upsellTiming.default,
          previousRejections,
        },
      };
    } catch (error) {
      logger.error(
        `Failed to calculate next upsell timing for ${phoneNumber}:`,
        error
      );
      return { recommendedDays: this.options.upsellTiming.default };
    }
  }
}

// Export constants and main service
module.exports = {
  FUNNEL_STAGES,
  OBJECTION_STRATEGIES,
  UPSELL_OPPORTUNITIES,
  DOWNSELL_ALTERNATIVES,
  SalesFunnelService: new SalesFunnelService(),
};