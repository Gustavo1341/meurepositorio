/**
 * @fileoverview Training Data Loader for WhatsApp AI Sales Agent
 *
 * This module is responsible for:
 * - Loading training data from different file formats (txt, pdf, json)
 * - Processing and preparing training data for the AI
 * - Loading social proof assets metadata
 * - Loading product information from pricing data
 * - Initializing PDF workers for PDF file processing
 */

const fs = require("fs").promises;
const path = require("path");
const { existsSync } = require("fs");
import * as pdfjs from 'pdfjs-dist';
const logger = require("./logger");
const { pricingData } = require("./pricing");

// Set worker path for PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.js';

// Maximum file sizes in bytes
const MAX_FILE_SIZES = {
  txt: 5 * 1024 * 1024, // 5MB
  pdf: 20 * 1024 * 1024, // 20MB
  json: 10 * 1024 * 1024, // 10MB
};

// Default directories
const DEFAULT_DIRS = {
  training: path.resolve(process.cwd(), "training"),
  socialProofs: path.resolve(process.cwd(), "assets/social-proofs"),
};

/**
 * TrainingLoader class for loading and processing training data
 */
class TrainingLoader {
  /**
   * Creates a new instance of TrainingLoader
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = {
      trainingDir: options.trainingDir || DEFAULT_DIRS.training,
      socialProofsDir: options.socialProofsDir || DEFAULT_DIRS.socialProofs,
      maxFileSizes: { ...MAX_FILE_SIZES, ...(options.maxFileSizes || {}) },
      ...options,
    };

    this.pdfWorker = null;
    logger.debug("TrainingLoader initialized with options:", this.options);
  }

  /**
   * Initializes the PDF.js worker
   * @returns {Promise<void>}
   */
  async initializePdfWorker() {
    try {
      logger.debug("Initializing PDF worker");

      // Set the worker source path
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;

      // Create a simple document to test the worker
      const testDocument = await pdfjs.getDocument({
        data: new Uint8Array([
          "%PDF-1.7\n1 0 obj<</Type/Catalog/Pages 2 0 R>>\nendobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>\nendobj\nxref\n0 3\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n101\n%%EOF\n",
        ]),
      }).promise;

      await testDocument.destroy();

      this.pdfWorker = true;
      logger.debug("PDF worker initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize PDF worker:", error);
      throw new Error(`Failed to initialize PDF worker: ${error.message}`);
    }
  }

  /**
   * Loads metadata and validates social proof assets
   * @returns {Promise<Array>} Array of social proof asset metadata objects
   */
  async loadSocialProofAssets() {
    try {
      logger.debug(
        `Loading social proof assets from ${this.options.socialProofsDir}`
      );

      // Check if directory exists
      if (!existsSync(this.options.socialProofsDir)) {
        logger.warn(
          `Social proofs directory does not exist: ${this.options.socialProofsDir}. Creating it.`
        );
        await fs.mkdir(this.options.socialProofsDir, { recursive: true });
        return [];
      }

      // Read directory contents
      const files = await fs.readdir(this.options.socialProofsDir);

      if (files.length === 0) {
        logger.warn(
          `No social proof assets found in ${this.options.socialProofsDir}`
        );
        return [];
      }

      // Process metadata file first
      const metadataFile = files.find((f) => f === "metadata.json");
      let metadata = [];

      if (metadataFile) {
        try {
          const metadataContent = await fs.readFile(
            path.join(this.options.socialProofsDir, metadataFile),
            "utf-8"
          );
          metadata = JSON.parse(metadataContent);
          logger.debug(
            `Loaded ${metadata.length} social proof metadata entries`
          );
        } catch (error) {
          logger.error("Failed to parse social proofs metadata file:", error);
          metadata = [];
        }
      }

      // Filter and validate metadata entries
      const validatedAssets = [];
      const mediaFiles = files.filter((f) => f !== "metadata.json");

      for (const asset of metadata) {
        // Check if file exists
        const fileExists = mediaFiles.some((f) => f === asset.filename);

        if (fileExists) {
          validatedAssets.push({
            id: asset.id,
            type: asset.type || this.detectMediaType(asset.filename),
            description: asset.description || "No description provided",
            filename: asset.filename,
            path: path.join(this.options.socialProofsDir, asset.filename),
            tags: asset.tags || [],
          });
        } else {
          logger.warn(`Social proof file not found: ${asset.filename}`);
        }
      }

      // Add missing files that weren't in metadata
      for (const file of mediaFiles) {
        const hasMetadata = validatedAssets.some((a) => a.filename === file);

        if (!hasMetadata) {
          const fileId = `auto_${Date.now()}_${Math.floor(
            Math.random() * 10000
          )}`;
          validatedAssets.push({
            id: fileId,
            type: this.detectMediaType(file),
            description: `Auto-detected: ${file}`,
            filename: file,
            path: path.join(this.options.socialProofsDir, file),
            tags: [],
          });
          logger.info(`Added auto-detected social proof file: ${file}`);
        }
      }

      logger.info(
        `Successfully loaded ${validatedAssets.length} social proof assets`
      );
      return validatedAssets;
    } catch (error) {
      logger.error("Failed to load social proof assets:", error);
      return [];
    }
  }

  /**
   * Detects the media type based on file extension
   * @param {string} filename - The filename to analyze
   * @returns {string} Media type ('image', 'video', 'audio', 'document')
   */
  detectMediaType(filename) {
    const ext = path.extname(filename).toLowerCase();

    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];
    const videoExtensions = [".mp4", ".mov", ".webm", ".avi", ".mkv"];
    const audioExtensions = [".mp3", ".wav", ".ogg", ".m4a"];
    const documentExtensions = [
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
    ];

    if (imageExtensions.includes(ext)) return "image";
    if (videoExtensions.includes(ext)) return "video";
    if (audioExtensions.includes(ext)) return "audio";
    if (documentExtensions.includes(ext)) return "document";

    return "unknown";
  }

  /**
   * Loads all training data from the training directory
   * @returns {Promise<Object>} Training data object with generalized and specific contexts
   */
  async loadTrainingData() {
    try {
      logger.debug(`Loading training data from ${this.options.trainingDir}`);

      // Check if directory exists
      if (!existsSync(this.options.trainingDir)) {
        logger.warn(
          `Training directory does not exist: ${this.options.trainingDir}. Creating it.`
        );
        await fs.mkdir(this.options.trainingDir, { recursive: true });
        return {
          generalData: "",
          specificData: {},
          stats: { files: 0, totalSize: 0 },
        };
      }

      // Read directory contents
      const files = await fs.readdir(this.options.trainingDir);

      if (files.length === 0) {
        logger.warn(`No training files found in ${this.options.trainingDir}`);
        return {
          generalData: "",
          specificData: {},
          stats: { files: 0, totalSize: 0 },
        };
      }

      // Process each file
      const processedData = {
        generalData: "",
        specificData: {},
        stats: {
          files: 0,
          totalSize: 0,
          byType: { txt: 0, pdf: 0, json: 0 },
        },
      };

      for (const file of files) {
        const filePath = path.join(this.options.trainingDir, file);
        const fileExt = path.extname(file).toLowerCase().replace(".", "");

        // Skip directories and unsupported file types
        const stats = await fs.stat(filePath);
        if (stats.isDirectory() || !["txt", "pdf", "json"].includes(fileExt)) {
          continue;
        }

        // Check file size
        if (stats.size > this.options.maxFileSizes[fileExt]) {
          logger.warn(
            `Skipping file ${file} due to size (${stats.size} bytes exceeds limit of ${this.options.maxFileSizes[fileExt]} bytes)`
          );
          continue;
        }

        try {
          // Process based on file type
          let content = "";
          let specificKey = path.basename(file, path.extname(file));

          switch (fileExt) {
            case "txt":
              content = await this.readTextFile(filePath);
              break;
            case "pdf":
              if (!this.pdfWorker) {
                await this.initializePdfWorker();
              }
              content = await this.readPdfFile(filePath);
              break;
            case "json":
              content = await this.readJsonFile(filePath, specificKey);
              break;
          }

          // Update stats
          processedData.stats.files++;
          processedData.stats.totalSize += stats.size;
          processedData.stats.byType[fileExt]++;

          // Add content to general or specific data
          if (fileExt === "json") {
            if (typeof content === "object") {
              processedData.specificData[specificKey] = content;
            }
          } else {
            processedData.generalData += `\n\n--- ${file} ---\n${content}`;
          }
        } catch (error) {
          logger.error(`Failed to process training file ${file}:`, error);
        }
      }

      // Trim the general data
      processedData.generalData = processedData.generalData.trim();

      logger.info(
        `Successfully loaded ${processedData.stats.files} training files (${processedData.stats.totalSize} bytes total)`
      );
      return processedData;
    } catch (error) {
      logger.error("Failed to load training data:", error);
      return {
        generalData: "",
        specificData: {},
        stats: { files: 0, totalSize: 0 },
      };
    }
  }

  /**
   * Loads product-specific training data from pricing data
   * @param {string} [productId] - Optional specific product ID to load
   * @returns {Promise<Object>} Product training data
   */
  async loadProductTrainingData(productId = null) {
    try {
      logger.debug(
        `Loading product training data${productId ? ` for ${productId}` : ""}`
      );

      // Check if pricing data is available
      if (
        !pricingData ||
        !pricingData.products ||
        !pricingData.products.length
      ) {
        logger.warn("No pricing data available for product training");
        return null;
      }

      const products = productId
        ? pricingData.products.filter((p) => p.id === productId)
        : pricingData.products;

      if (products.length === 0) {
        logger.warn(`No product found with ID: ${productId}`);
        return null;
      }

      // Format product data for AI training
      const formattedProducts = products.map((product) => {
        // Format plans
        const formattedPlans = product.plans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          price: plan.price,
          billingCycle: plan.billingCycle || "monthly",
          description: plan.description || "",
          features: plan.features || [],
          popular: plan.popular || false,
          checkoutLink: plan.checkoutLink || "",
          compareWith: plan.compareWith || [],
        }));

        // Sort plans by price
        formattedPlans.sort((a, b) => a.price - b.price);

        return {
          id: product.id,
          name: product.name,
          description: product.description || "",
          shortDescription: product.shortDescription || "",
          category: product.category || "",
          plans: formattedPlans,
          features: product.features || {},
          faqs: product.faqs || [],
        };
      });

      // If a single product was requested, return it directly
      const result =
        productId && formattedProducts.length === 1
          ? formattedProducts[0]
          : formattedProducts;

      logger.info(
        `Successfully loaded product training data for ${formattedProducts.length} product(s)`
      );
      return result;
    } catch (error) {
      logger.error("Failed to load product training data:", error);
      return null;
    }
  }

  /**
   * Reads a text file and returns its content
   * @param {string} filePath - Path to the text file
   * @returns {Promise<string>} Text content
   */
  async readTextFile(filePath) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return content.trim();
    } catch (error) {
      logger.error(`Failed to read text file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Reads a PDF file and extracts its text content
   * @param {string} filePath - Path to the PDF file
   * @returns {Promise<string>} Extracted text content
   */
  async readPdfFile(filePath) {
    try {
      // Read file data
      const data = await fs.readFile(filePath);

      // Load the PDF document
      const pdfDocument = await pdfjs.getDocument({ data }).promise;

      // Initialize an array to store text from each page
      let allText = [];

      // Extract text from each page
      for (let i = 1; i <= pdfDocument.numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(" ");
        allText.push(pageText);
      }

      // Clean up
      await pdfDocument.destroy();

      return allText.join("\n\n").trim();
    } catch (error) {
      logger.error(`Failed to read PDF file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Reads a JSON file and returns its parsed content
   * @param {string} filePath - Path to the JSON file
   * @param {string} specificKey - Key for specific data categorization
   * @returns {Promise<Object|string>} Parsed JSON content
   */
  async readJsonFile(filePath, specificKey) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content);

      // Validate and transform if needed
      if (specificKey === "scripts") {
        // Special handling for script templates
        return this.processScriptTemplates(parsed);
      } else if (specificKey === "objections") {
        // Special handling for objection handling data
        return this.processObjectionData(parsed);
      }

      return parsed;
    } catch (error) {
      logger.error(`Failed to read JSON file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Process script templates from JSON data
   * @param {Object} data - Parsed JSON data containing script templates
   * @returns {Object} Processed script templates
   */
  processScriptTemplates(data) {
    // Validate expected structure
    if (!Array.isArray(data.scripts)) {
      logger.warn(
        "Invalid script templates format (expected data.scripts array)"
      );
      return data;
    }

    // Process each script template
    const processed = {
      ...data,
      scripts: data.scripts.map((script) => {
        // Ensure required properties
        if (!script.id || !script.name || !script.content) {
          logger.warn(
            `Script template missing required properties: ${JSON.stringify(
              script
            )}`
          );
          return script;
        }

        // Process variables in script content
        let processedContent = script.content;
        const variables = (script.variables || []).concat([
          "customerName",
          "productName",
          "companyName",
        ]);

        // Add variable markers for easier replacement
        variables.forEach((variable) => {
          const regex = new RegExp(`\\[${variable}\\]`, "g");
          processedContent = processedContent.replace(regex, `<<${variable}>>`);
        });

        return {
          ...script,
          content: processedContent,
          processed: true,
        };
      }),
    };

    return processed;
  }

  /**
   * Process objection handling data from JSON
   * @param {Object} data - Parsed JSON data containing objection handling info
   * @returns {Object} Processed objection handling data
   */
  processObjectionData(data) {
    // Validate expected structure
    if (!Array.isArray(data.objections)) {
      logger.warn(
        "Invalid objection data format (expected data.objections array)"
      );
      return data;
    }

    // Process each objection
    const processed = {
      ...data,
      objections: data.objections.map((objection) => {
        // Ensure required properties
        if (!objection.type || !objection.examples || !objection.responses) {
          logger.warn(
            `Objection missing required properties: ${JSON.stringify(
              objection
            )}`
          );
          return objection;
        }

        // Convert examples to detection keywords if not present
        if (!objection.detection && Array.isArray(objection.examples)) {
          objection.detection = objection.examples.reduce(
            (keywords, example) => {
              // Extract key words from examples
              const words = example
                .toLowerCase()
                .replace(/[,.!?;:]/g, "")
                .split(" ")
                .filter((w) => w.length > 3);

              return [...keywords, ...words];
            },
            []
          );

          // Remove duplicates
          objection.detection = [...new Set(objection.detection)];
        }

        return {
          ...objection,
          processed: true,
        };
      }),
    };

    return processed;
  }

  /**
   * Prepares a complete training context for the AI
   * @param {Object} [options] - Options for context preparation
   * @returns {Promise<Object>} Complete training context
   */
  async prepareTrainingContext(options = {}) {
    try {
      logger.debug("Preparing complete training context");

      // Load general training data
      const trainingData = await this.loadTrainingData();

      // Load product data
      const productData = await this.loadProductTrainingData(options.productId);

      // Load social proof assets
      const socialProofAssets = await this.loadSocialProofAssets();

      // Combine into context
      const context = {
        generalData: trainingData.generalData,
        specificData: trainingData.specificData,
        productData,
        socialProofAssets: socialProofAssets.map((asset) => ({
          id: asset.id,
          type: asset.type,
          description: asset.description,
          tags: asset.tags || [],
        })),
        stats: {
          ...trainingData.stats,
          socialProofs: socialProofAssets.length,
        },
      };

      logger.info("Training context prepared successfully");
      return context;
    } catch (error) {
      logger.error("Failed to prepare training context:", error);
      throw new Error(`Failed to prepare training context: ${error.message}`);
    }
  }

  /**
   * Validates if a file exists and is within size limits
   * @param {string} filePath - Path to the file
   * @param {string} fileType - Type of file ('txt', 'pdf', 'json')
   * @returns {Promise<boolean>} Whether the file is valid
   */
  async validateFile(filePath, fileType) {
    try {
      // Check if file exists
      if (!existsSync(filePath)) {
        logger.warn(`File does not exist: ${filePath}`);
        return false;
      }

      // Check file type
      if (!["txt", "pdf", "json"].includes(fileType)) {
        logger.warn(`Unsupported file type: ${fileType}`);
        return false;
      }

      // Check file size
      const stats = await fs.stat(filePath);
      if (stats.size > this.options.maxFileSizes[fileType]) {
        logger.warn(
          `File too large: ${filePath} (${stats.size} bytes exceeds limit of ${this.options.maxFileSizes[fileType]} bytes)`
        );
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`Failed to validate file ${filePath}:`, error);
      return false;
    }
  }
}

// Create and export singleton instance
const trainingLoader = new TrainingLoader();
module.exports = trainingLoader;
