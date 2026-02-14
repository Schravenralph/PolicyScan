/**
 * PDF Image Extractor
 * 
 * Extracts images from PDF pages for OCR processing.
 * Converts PDF pages to image buffers that can be processed by OCR.
 * 
 * Uses pdfjs-dist with canvas to render PDF pages as images.
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
// pdf-parse is a CommonJS module - import as namespace and use type assertion for function call
import * as pdfParseModule from 'pdf-parse';
// Type assertion: pdf-parse exports a function as default in CommonJS, but TypeScript doesn't see it
const pdfParse = pdfParseModule as unknown as (buffer: Buffer, options?: { max?: number }) => Promise<{ text: string; numpages: number; [key: string]: unknown }>;
import { logger } from '../../utils/logger.js';

// Lazy canvas loader
let canvasModule: typeof import('canvas') | null = null;
async function getCanvas() {
  if (!canvasModule) {
    try {
      canvasModule = await import('canvas');
    } catch (error) {
      throw new Error(`Failed to load canvas module. Canvas may not be built. Run 'pnpm rebuild canvas'. Original error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return canvasModule;
}

export interface PDFPageImage {
  pageNumber: number;
  imageBuffer: Buffer;
  format: 'png' | 'jpeg';
  width: number;
  height: number;
}

export interface PDFImageExtractorConfig {
  dpi?: number; // Default: 200
  format?: 'png' | 'jpeg'; // Default: 'png'
  maxPages?: number; // Default: no limit
  quality?: number; // JPEG quality 0-1, default: 0.95
}

/**
 * Extract images from PDF buffer
 * Returns image buffers for each page that can be processed by OCR
 */
export class PDFImageExtractor {
  private config: Required<PDFImageExtractorConfig>;
  private pdfjsInitialized: boolean = false;

  constructor(config: PDFImageExtractorConfig = {}) {
    this.config = {
      dpi: config.dpi || 200,
      format: config.format || 'png',
      maxPages: config.maxPages || 0, // 0 = no limit
      quality: config.quality || 0.95
    };

    // Initialize pdfjs worker
    this.initializePDFJS();
  }

  /**
   * Initialize PDF.js worker
   */
  private initializePDFJS(): void {
    if (this.pdfjsInitialized) {
      return;
    }

    try {
      // Set worker source for pdfjs-dist
      // In Node.js, we need to use the legacy build
      // workerSrc is not needed in Node.js environment
      this.pdfjsInitialized = true;
    } catch (error) {
      logger.error({ error }, 'Failed to initialize PDF.js. Ensure pdfjs-dist is installed');
      throw new Error('PDF.js initialization failed. Ensure pdfjs-dist is installed.');
    }
  }

  /**
   * Check if PDF is image-based (has no text layer)
   */
  async isImageBasedPDF(buffer: Buffer): Promise<boolean> {
    try {
      // pdf-parse is a CommonJS module - use type-asserted function directly
      const pdfData = await pdfParse(buffer, { max: 0 });
      const text = pdfData.text || '';
      // If no text extracted but has pages, likely image-based
      return text.trim().length === 0 && pdfData.numpages > 0;
    } catch (error) {
      logger.error({ error }, 'Error checking if PDF is image-based');
      return false;
    }
  }

  /**
   * Extract images from PDF pages
   * 
   * Converts each PDF page to an image buffer using pdfjs-dist and canvas.
   * 
   * @param buffer - PDF buffer
   * @returns Array of page images with buffers
   */
  async extractPageImages(buffer: Buffer): Promise<PDFPageImage[]> {
    try {
      // Ensure canvas is available before starting
      await getCanvas();

      const startTime = Date.now();
      
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({
        data: buffer,
        verbosity: 0 // Suppress warnings
      });

      const pdfDocument = await loadingTask.promise;
      const numPages = pdfDocument.numPages;

      // Apply max pages limit if configured
      const pagesToProcess = this.config.maxPages > 0 
        ? Math.min(numPages, this.config.maxPages)
        : numPages;

      if (pagesToProcess === 0) {
        logger.warn('PDF has no pages');
        return [];
      }

      const pageImages: PDFPageImage[] = [];

      // Process each page
      for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
        try {
          const page = await pdfDocument.getPage(pageNum);
          const image = await this.renderPageToImage(page, pageNum);
          pageImages.push(image);

          // Log progress for large PDFs
          if (pagesToProcess > 10 && pageNum % 10 === 0) {
            logger.debug({ pageNum, totalPages: pagesToProcess }, 'Processing PDF pages');
          }
        } catch (error) {
          logger.error({ error, pageNum }, 'Error processing PDF page');
          // Continue with next page
        }
      }

      const processingTime = Date.now() - startTime;
      const avgTimePerPage = processingTime / pagesToProcess;
      
      if (avgTimePerPage > 2000) {
        logger.warn({ 
          avgTimePerPage: avgTimePerPage.toFixed(0), 
          target: 2000 
        }, 'Average processing time exceeded target. Consider reducing DPI or optimizing');
      }

      logger.info({ 
        pageCount: pageImages.length, 
        processingTime, 
        avgTimePerPage: avgTimePerPage.toFixed(0) 
      }, 'PDF pages converted to images');

      return pageImages;
    } catch (error) {
      // Handle specific error types
      if (error instanceof Error) {
        // Check for encrypted/protected PDF
        if (error.message.includes('encrypted') || error.message.includes('password')) {
          logger.warn('PDF is encrypted/protected. Cannot extract images');
          return [];
        }

        // Check for corrupted PDF
        if (error.message.includes('corrupt') || error.message.includes('invalid')) {
          logger.warn({ error: error.message }, 'PDF appears to be corrupted');
          return [];
        }

        // Check for canvas initialization errors
        if (error.message.includes('canvas') || error.message.includes('Canvas')) {
          logger.error({ error }, 'Canvas initialization failed. Ensure canvas package is installed and system dependencies are available. On Ubuntu/Debian: sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev');
          throw new Error('Canvas not available. Install system dependencies and canvas package.');
        }
      }

      logger.error({ error }, 'Error extracting images from PDF');
      throw error;
    }
  }

  /**
   * Render a single PDF page to an image buffer
   */
  private async renderPageToImage(
    page: pdfjsLib.PDFPageProxy,
    pageNumber: number
  ): Promise<PDFPageImage> {
    // Get viewport with scale based on DPI
    // PDF.js uses 72 DPI by default, so scale = desired_dpi / 72
    const scale = this.config.dpi / 72;
    const viewport = page.getViewport({ scale });

    // Create canvas with viewport dimensions
    // Lazy load canvas to avoid blocking server startup
    const canvasModule = await getCanvas();
    const canvas = canvasModule.createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    // Render PDF page to canvas
    // Note: PDF.js expects HTMLCanvasElement but we're using node-canvas
    // We need to provide both canvas and canvasContext for compatibility
    const renderContext = {
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context,
      viewport: viewport
    } as unknown as Parameters<typeof page.render>[0];

    await page.render(renderContext).promise;

    // Convert canvas to image buffer
    let imageBuffer: Buffer;
    if (this.config.format === 'jpeg') {
      imageBuffer = canvas.toBuffer('image/jpeg', { quality: this.config.quality });
    } else {
      imageBuffer = canvas.toBuffer('image/png');
    }

    return {
      pageNumber,
      imageBuffer,
      format: this.config.format,
      width: viewport.width,
      height: viewport.height
    };
  }

  /**
   * Get page count from PDF
   */
  async getPageCount(buffer: Buffer): Promise<number> {
    try {
      const loadingTask = pdfjsLib.getDocument({
        data: buffer,
        verbosity: 0
      });
      const pdfDocument = await loadingTask.promise;
      return pdfDocument.numPages;
    } catch (error) {
      logger.error({ error }, 'Error getting page count from PDF.js');
      // Fallback to pdf-parse
      try {
        // pdf-parse is a CommonJS module - use type-asserted function directly
        const pdfData = await pdfParse(buffer, { max: 0 });
        return pdfData.numpages || 0;
      } catch (parseError) {
        logger.error({ error: parseError }, 'Fallback page count also failed');
        return 0;
      }
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PDFImageExtractorConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): PDFImageExtractorConfig {
    return { ...this.config };
  }
}
