/**
 * @fileoverview Product Pricing Data for WhatsApp AI Sales Agent
 *
 * This module defines the products, plans, and pricing information used by the sales agent.
 * It supports environment variable overrides for flexible pricing adjustments
 * and provides functions to access and validate pricing data.
 */

const logger = require("./logger");

/**
 * Default pricing data structure
 * This will be used unless overridden via environment variables
 * @type {Object}
 */
const DEFAULT_PRICING_DATA = {
  currency: "BRL",
  currencySymbol: "R$",
  products: [
    {
      id: "ai_sales_agent",
      name: "Agente de Vendas IA",
      description:
        "Automatize seu processo de vendas com um agente de IA que qualifica leads, gerencia objeções e fecha vendas 24/7, superando a performance humana.",
      shortDescription: "Assistente de vendas IA que trabalha 24/7",
      category: "automacao_vendas",
      features: {
        core: [
          "Atendimento automático 24/7",
          "Qualificação inteligente de leads",
          "Detecção e tratamento de objeções",
          "Personalização com IA",
          "Geração de relatórios",
        ],
        advanced: [
          "Integração com CRM",
          "Análise de sentimento",
          "Reconhecimento de intenção avançado",
          "Dashboard personalizado",
          "API para integração com outros sistemas",
        ],
        premium: [
          "Modelos de IA personalizados",
          "Consultoria estratégica mensal",
          "Treinamento personalizado",
          "SLA prioritário",
          "Atendimento humano híbrido",
        ],
      },
      plans: [
        {
          id: "basic_plan",
          name: "Plano Básico",
          price: 297,
          billingCycle: "monthly",
          description:
            "Ideal para pequenos negócios iniciando com automação de vendas. Inclui todas as funcionalidades essenciais para automatizar seu processo de vendas.",
          features: [
            "Atendimento 24/7",
            "Até 500 conversas por mês",
            "Qualificação básica de leads",
            "Detecção de 5 tipos de objeções",
            "Integrações via Zapier",
            "Relatórios semanais",
            "Suporte por email",
          ],
          popular: false,
          checkoutLink: "https://checkout.empresa.com/ai-sales-agent-basic",
          compareWith: ["pro_plan"],
        },
        {
          id: "pro_plan",
          name: "Plano Profissional",
          price: 597,
          billingCycle: "monthly",
          description:
            "Perfeito para negócios em crescimento que buscam escalar suas vendas com automação inteligente. Inclui recursos avançados de personalização e análise.",
          features: [
            "Todas as funcionalidades do Plano Básico",
            "Até 2000 conversas por mês",
            "Qualificação avançada de leads",
            "Detecção de 15 tipos de objeções",
            "Integração direta com CRMs populares",
            "Análise de sentimento",
            "Relatórios diários",
            "Configuração personalizada de funil",
            "Suporte prioritário por chat",
          ],
          popular: true,
          checkoutLink: "https://checkout.empresa.com/ai-sales-agent-pro",
          compareWith: ["basic_plan", "enterprise_plan"],
        },
        {
          id: "enterprise_plan",
          name: "Plano Enterprise",
          price: 1497,
          billingCycle: "monthly",
          description:
            "Solução completa para grandes empresas com necessidades avançadas de automação de vendas. Inclui recursos exclusivos de personalização e suporte VIP.",
          features: [
            "Todas as funcionalidades do Plano Profissional",
            "Conversas ilimitadas",
            "Qualificação de leads com IA avançada",
            "Detecção ilimitada de objeções",
            "Integração com qualquer CRM ou sistema",
            "Personalização completa do modelo de IA",
            "Modelo de linguagem dedicado",
            "Dashboard personalizado",
            "Consultoria estratégica mensal",
            "Suporte VIP com atendimento 24h",
          ],
          popular: false,
          checkoutLink:
            "https://checkout.empresa.com/ai-sales-agent-enterprise",
          compareWith: ["pro_plan"],
        },
      ],
      addons: [
        {
          id: "addon_training",
          name: "Treinamento Personalizado",
          price: 997,
          billingCycle: "one-time",
          description:
            "Sessão de treinamento personalizada com especialista para maximizar resultados com nossa plataforma.",
          features: [
            "4 horas de treinamento ao vivo",
            "Personalização para seu negócio",
            "Configuração assistida do sistema",
            "Estratégias avançadas de vendas",
            "Material de apoio exclusivo",
          ],
          checkoutLink: "https://checkout.empresa.com/ai-sales-agent-training",
        },
        {
          id: "addon_quickstart",
          name: "Quickstart Guide Premium",
          price: 297,
          billingCycle: "one-time",
          description:
            "Guia premium de início rápido com vídeos e documentação avançada para auto-aprendizado.",
          features: [
            "Vídeos tutoriais detalhados",
            "Manual passo a passo",
            "Templates prontos",
            "Checklist de implementação",
            "Acesso permanente à biblioteca de recursos",
          ],
          checkoutLink:
            "https://checkout.empresa.com/ai-sales-agent-quickstart",
        },
        {
          id: "addon_extra_conversations",
          name: "Pacote de Conversas Extra",
          price: 197,
          billingCycle: "one-time",
          description: "Adicione 1000 conversas extras ao seu plano atual.",
          features: [
            "+1000 conversas",
            "Válido por 90 dias",
            "Mesmas funcionalidades do seu plano atual",
            "Ativação imediata",
          ],
          checkoutLink:
            "https://checkout.empresa.com/ai-sales-agent-extra-conversations",
        },
      ],
      faqs: [
        {
          question: "O que é o Agente de Vendas IA?",
          answer:
            "O Agente de Vendas IA é uma solução completa de automação de vendas que utiliza inteligência artificial avançada para qualificar leads, responder perguntas, gerenciar objeções e guiar potenciais clientes através do funil de vendas até o fechamento, funcionando 24/7 sem intervenção humana.",
        },
        {
          question: "Quanto tempo leva para começar a usar o sistema?",
          answer:
            "A implementação básica leva apenas 24 horas. Após a contratação, configuramos o sistema com suas informações de produto e estratégia de vendas, permitindo que você comece a receber leads qualificados imediatamente.",
        },
        {
          question: "É necessário conhecimento técnico para utilizar?",
          answer:
            "Não, nossa plataforma foi desenvolvida para ser intuitiva e fácil de usar, mesmo para pessoas sem conhecimento técnico. Oferecemos treinamento inicial e suporte contínuo para garantir que você aproveite ao máximo nossa solução.",
        },
        {
          question:
            "Como o Agente de Vendas IA se integra com meus sistemas atuais?",
          answer:
            "Nossa solução oferece diversas opções de integração, desde conectores nativos com CRMs populares até integrações via Zapier e API REST. Nosso time técnico ajuda a configurar a integração ideal para seu cenário.",
        },
        {
          question:
            "O que acontece quando o cliente precisa de atendimento humano?",
          answer:
            "O sistema detecta automaticamente quando um cliente precisa de atendimento humano e pode transferir a conversa para um vendedor real. Também é possível configurar gatilhos específicos para esse redirecionamento.",
        },
        {
          question:
            "Como é feito o treinamento do agente com informações do meu produto?",
          answer:
            "Utilizamos um processo simples de ingestion de dados onde você fornece informações sobre seus produtos, casos de uso, FAQs e scripts de vendas. Nossa tecnologia processa esses dados e personaliza o modelo de IA para representar perfeitamente sua oferta.",
        },
      ],
    },
    {
      id: "crm_integration",
      name: "Integração com CRM",
      description:
        "Integração avançada do Agente de Vendas IA com os principais sistemas de CRM do mercado, sincronizando leads, vendas e dados de clientes automaticamente.",
      shortDescription: "Conecte seu Agente de Vendas IA ao seu CRM",
      category: "integracoes",
      plans: [
        {
          id: "crm_basic",
          name: "Integração CRM Básica",
          price: 97,
          billingCycle: "monthly",
          description:
            "Integração simples com CRMs populares para sincronização básica de leads e oportunidades.",
          features: [
            "Conexão com um CRM",
            "Sincronização de leads",
            "Atualização de status de oportunidades",
            "Suporte técnico por email",
          ],
          popular: false,
          checkoutLink: "https://checkout.empresa.com/crm-integration-basic",
        },
        {
          id: "crm_advanced",
          name: "Integração CRM Avançada",
          price: 197,
          billingCycle: "monthly",
          description:
            "Integração completa com qualquer CRM, incluindo sincronização bidirecional e mapeamento de campos personalizados.",
          features: [
            "Conexão com múltiplos CRMs",
            "Sincronização bidirecional em tempo real",
            "Mapeamento de campos personalizados",
            "Automação de fluxos de trabalho",
            "Dashboard de integração",
            "Suporte técnico prioritário",
          ],
          popular: true,
          checkoutLink: "https://checkout.empresa.com/crm-integration-advanced",
        },
      ],
    },
  ],
  discounts: {
    annual: 0.2, // 20% discount for annual billing
    referral: 0.1, // 10% discount for referrals
    earlyBird: 0.15, // 15% early bird discount
  },
  specialOffers: [
    {
      id: "bundle_complete",
      name: "Pacote Completo",
      description: "Agente de Vendas IA Plano Pro + Integração CRM Avançada",
      discount: 0.15, // 15% off the combined price
      includedItems: ["pro_plan", "crm_advanced"],
      checkoutLink: "https://checkout.empresa.com/bundle-complete",
    },
  ],
};

/**
 * Try to parse a JSON string from environment variable
 * @param {string} jsonString - JSON string to parse
 * @param {string} varName - Name of the environment variable (for logging)
 * @param {any} defaultValue - Default value if parsing fails
 * @returns {any} Parsed value or default
 */
function tryParseJsonFromEnv(jsonString, varName, defaultValue) {
  if (!jsonString) return defaultValue;

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    logger.error(
      `Failed to parse ${varName} environment variable as JSON:`,
      error
    );
    return defaultValue;
  }
}

/**
 * Get a numeric value from environment variable with validation
 * @param {string} value - Value from environment variable
 * @param {string} varName - Name of the environment variable (for logging)
 * @param {number} defaultValue - Default value if parsing fails
 * @param {number} [minValue] - Minimum allowed value
 * @param {number} [maxValue] - Maximum allowed value
 * @returns {number} Parsed and validated value
 */
function getNumericEnvVar(
  value,
  varName,
  defaultValue,
  minValue = null,
  maxValue = null
) {
  if (!value) return defaultValue;

  const numValue = Number(value);

  if (isNaN(numValue)) {
    logger.warn(
      `Invalid ${varName} value: ${value}, using default ${defaultValue}`
    );
    return defaultValue;
  }

  if (minValue !== null && numValue < minValue) {
    logger.warn(
      `${varName} value ${numValue} is below minimum ${minValue}, using minimum`
    );
    return minValue;
  }

  if (maxValue !== null && numValue > maxValue) {
    logger.warn(
      `${varName} value ${numValue} is above maximum ${maxValue}, using maximum`
    );
    return maxValue;
  }

  return numValue;
}

/**
 * Create a plan object with environment variable overrides
 * @param {Object} basePlan - Base plan object from default pricing
 * @param {Object} config - Configuration with potential overrides
 * @returns {Object} Plan with overrides applied
 */
function createPlan(basePlan, config = {}) {
  // Apply overrides for this specific plan if they exist
  const planEnvPrefix = `PRICE_${basePlan.id.toUpperCase()}`;

  const price = getNumericEnvVar(
    process.env[`${planEnvPrefix}_PRICE`],
    `${planEnvPrefix}_PRICE`,
    config.defaultPrice || basePlan.price,
    0
  );

  const checkoutLink =
    process.env[`${planEnvPrefix}_CHECKOUT_LINK`] ||
    config.defaultCheckoutLink ||
    basePlan.checkoutLink;

  return {
    ...basePlan,
    price,
    checkoutLink,
    // Flag to indicate if price was overridden
    _priceOverridden: price !== basePlan.price,
  };
}

/**
 * Apply overrides to the pricing data from environment variables
 * @param {Object} basePricing - Base pricing data
 * @returns {Object} Pricing data with overrides applied
 */
function applyPricingOverrides(basePricing) {
  try {
    // Check for complete pricing data override
    const pricingOverride = tryParseJsonFromEnv(
      process.env.PRICING_OVERRIDE,
      "PRICING_OVERRIDE",
      null
    );

    if (pricingOverride) {
      logger.info("Using complete pricing data override from PRICING_OVERRIDE");
      return pricingOverride;
    }

    // Apply individual overrides
    const pricingData = { ...basePricing };

    // Override currency settings if specified
    pricingData.currency = process.env.PRICE_CURRENCY || pricingData.currency;
    pricingData.currencySymbol =
      process.env.PRICE_CURRENCY_SYMBOL || pricingData.currencySymbol;

    // Apply plan-specific overrides
    pricingData.products = pricingData.products.map((product) => {
      // Apply product-level overrides
      const productEnvPrefix = `PRICE_${product.id.toUpperCase()}`;

      // Create a configuration for this product's plans
      const productConfig = {
        defaultCheckoutLinkBase:
          process.env[`${productEnvPrefix}_CHECKOUT_LINK_BASE`],
      };

      // Apply plan overrides
      const updatedPlans = product.plans.map((plan) =>
        createPlan(plan, productConfig)
      );

      // Apply addon overrides if they exist
      const updatedAddons = product.addons
        ? product.addons.map((addon) => createPlan(addon, productConfig))
        : product.addons;

      return {
        ...product,
        plans: updatedPlans,
        addons: updatedAddons,
      };
    });

    // Apply discount overrides
    if (pricingData.discounts) {
      Object.keys(pricingData.discounts).forEach((discountKey) => {
        const envVarName = `PRICE_DISCOUNT_${discountKey.toUpperCase()}`;
        const discountValue = getNumericEnvVar(
          process.env[envVarName],
          envVarName,
          pricingData.discounts[discountKey],
          0,
          1
        );

        pricingData.discounts[discountKey] = discountValue;
      });
    }

    return pricingData;
  } catch (error) {
    logger.error("Failed to apply pricing overrides:", error);
    return basePricing;
  }
}

/**
 * Validate checkout links for all active plans
 * @param {Object} pricing - Pricing data to validate
 * @returns {Array<Object>} Array of validation issues
 */
function validateCheckoutLinks(pricing) {
  const issues = [];

  // Validate product plans
  pricing.products.forEach((product) => {
    product.plans.forEach((plan) => {
      if (
        !plan.checkoutLink ||
        plan.checkoutLink.includes("checkout.empresa.com")
      ) {
        issues.push({
          type: "missing_checkout_link",
          productId: product.id,
          planId: plan.id,
          message: `Missing or default checkout link for ${product.name} - ${plan.name}`,
        });
      }
    });

    // Validate addons if they exist
    if (product.addons) {
      product.addons.forEach((addon) => {
        if (
          !addon.checkoutLink ||
          addon.checkoutLink.includes("checkout.empresa.com")
        ) {
          issues.push({
            type: "missing_checkout_link",
            productId: product.id,
            addonId: addon.id,
            message: `Missing or default checkout link for addon ${addon.name}`,
          });
        }
      });
    }
  });

  // Validate special offers
  if (pricing.specialOffers) {
    pricing.specialOffers.forEach((offer) => {
      if (
        !offer.checkoutLink ||
        offer.checkoutLink.includes("checkout.empresa.com")
      ) {
        issues.push({
          type: "missing_checkout_link",
          offerId: offer.id,
          message: `Missing or default checkout link for special offer ${offer.name}`,
        });
      }
    });
  }

  return issues;
}

/**
 * Find a product by its ID
 * @param {Object} pricingData - Pricing data to search in
 * @param {string} productId - ID of the product to find
 * @returns {Object|null} Found product or null
 */
function findProductById(pricingData, productId) {
  return pricingData.products.find((p) => p.id === productId) || null;
}

/**
 * Find a plan within a product by its ID
 * @param {Object} product - Product object to search in
 * @param {string} planId - ID of the plan to find
 * @returns {Object|null} Found plan or null
 */
function findPlanById(product, planId) {
  if (!product || !product.plans) return null;
  return product.plans.find((p) => p.id === planId) || null;
}

/**
 * Find an addon within a product by its ID
 * @param {Object} product - Product object to search in
 * @param {string} addonId - ID of the addon to find
 * @returns {Object|null} Found addon or null
 */
function findAddonById(product, addonId) {
  if (!product || !product.addons) return null;
  return product.addons.find((a) => a.id === addonId) || null;
}

/**
 * Calculate the price with applicable discounts
 * @param {number} basePrice - Base price before discounts
 * @param {Object} options - Options for price calculation
 * @param {string} [options.billingCycle='monthly'] - Billing cycle ('monthly', 'annual', 'one-time')
 * @param {Array<string>} [options.discountCodes=[]] - Discount codes to apply
 * @param {boolean} [options.isReferral=false] - Whether this is a referral purchase
 * @returns {Object} Price calculation result
 */
function calculatePrice(basePrice, options = {}) {
  const {
    billingCycle = "monthly",
    discountCodes = [],
    isReferral = false,
  } = options;

  const pricingData = module.exports.pricingData;

  let finalPrice = basePrice;
  const appliedDiscounts = [];

  // Apply billing cycle discount if applicable
  if (
    billingCycle === "annual" &&
    pricingData.discounts &&
    pricingData.discounts.annual
  ) {
    const discountAmount = basePrice * pricingData.discounts.annual;
    finalPrice -= discountAmount;
    appliedDiscounts.push({
      type: "annual",
      description: "Desconto de assinatura anual",
      amount: discountAmount,
      percentage: pricingData.discounts.annual * 100,
    });
  }

  // Apply referral discount if applicable
  if (isReferral && pricingData.discounts && pricingData.discounts.referral) {
    const discountAmount = basePrice * pricingData.discounts.referral;
    finalPrice -= discountAmount;
    appliedDiscounts.push({
      type: "referral",
      description: "Desconto por indicação",
      amount: discountAmount,
      percentage: pricingData.discounts.referral * 100,
    });
  }

  // Apply early bird discount if applicable
  const hasEarlyBirdCode =
    discountCodes.includes("EARLYBIRD") ||
    discountCodes.includes("EARLY") ||
    discountCodes.includes("LANCAMENTO");

  if (
    hasEarlyBirdCode &&
    pricingData.discounts &&
    pricingData.discounts.earlyBird
  ) {
    const discountAmount = basePrice * pricingData.discounts.earlyBird;
    finalPrice -= discountAmount;
    appliedDiscounts.push({
      type: "earlyBird",
      description: "Desconto de early bird",
      amount: discountAmount,
      percentage: pricingData.discounts.earlyBird * 100,
    });
  }

  // Round to 2 decimal places
  finalPrice = Math.round(finalPrice * 100) / 100;

  return {
    basePrice,
    finalPrice,
    appliedDiscounts,
    currency: pricingData.currency,
    currencySymbol: pricingData.currencySymbol,
    formattedPrice: `${pricingData.currencySymbol} ${finalPrice.toFixed(2)}`,
    billingCycle,
  };
}

// Apply pricing overrides and export the final pricing data
const pricingData = applyPricingOverrides(DEFAULT_PRICING_DATA);

// Log validation issues
const validationIssues = validateCheckoutLinks(pricingData);
if (validationIssues.length > 0) {
  logger.warn("Pricing configuration has validation issues:", validationIssues);
}

module.exports = {
  pricingData,
  findProductById,
  findPlanById,
  findAddonById,
  calculatePrice,
  validateCheckoutLinks,
};
