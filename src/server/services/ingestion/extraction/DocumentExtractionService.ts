/**
 * Document Extraction Service
 * 
 * Extracts text from PDF, DOCX, and other document formats.
 * Supports OCR for scanned documents (optional).
 */

import axios, { AxiosRequestConfig } from 'axios';
// pdf-parse is a CommonJS module - import as namespace and use type assertion for function call
import * as pdfParseModule from 'pdf-parse';
// Type assertion: pdf-parse exports a function as default in CommonJS, but TypeScript doesn't see it
interface PdfParseResult {
  text: string;
  numpages: number;
  pages?: Array<{ text?: string }>;
  info?: {
    Title?: string | unknown;
    Author?: string | unknown;
    Subject?: string | unknown;
    Creator?: string | unknown;
    Producer?: string | unknown;
    CreationDate?: string | Date | unknown;
    ModDate?: string | Date | unknown;
    Language?: string | unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
const pdfParse = pdfParseModule as unknown as (buffer: Buffer, options?: { max?: number }) => Promise<PdfParseResult>;
import mammoth from 'mammoth';
import { OCRService } from '../../content-processing/OCRService.js';
import { PDFImageExtractor, PDFImageExtractorConfig } from '../../content-processing/PDFImageExtractor.js';
import { scraperConfig } from '../../../config/scraperConfig.js';
import { logger } from '../../../utils/logger.js';

export interface ExtractedDocument {
  text: string;
  metadata: {
    format: 'pdf' | 'docx' | 'html' | 'text' | 'unknown';
    pageCount?: number;
    language?: string;
    extractionMethod: 'direct' | 'ocr' | 'fallback';
  };
}

/**
 * Service for extracting text from various document formats
 */
export class DocumentExtractionService {
  private ocrEnabled: boolean;
  private ocrProvider: 'tesseract' | 'cloud';
  private ocrService: OCRService | null = null;
  private pdfImageExtractor: PDFImageExtractor | null = null;
  private pdfToImageEnabled: boolean;
  private pdfToImageConfig: PDFImageExtractorConfig;

  constructor() {
    this.ocrEnabled = process.env.DOCUMENT_EXTRACTION_OCR_ENABLED === 'true';
    this.ocrProvider = (process.env.DOCUMENT_EXTRACTION_OCR_PROVIDER as 'tesseract' | 'cloud') || 'tesseract';
    
    // PDF-to-image conversion configuration
    this.pdfToImageEnabled = process.env.PDF_TO_IMAGE_ENABLED !== 'false'; // Default: true if OCR enabled
    const dpi = parseInt(process.env.PDF_TO_IMAGE_DPI || '200', 10);
    const format = (process.env.PDF_TO_IMAGE_FORMAT as 'png' | 'jpeg') || 'png';
    const maxPages = parseInt(process.env.PDF_TO_IMAGE_MAX_PAGES || '0', 10);
    const quality = parseFloat(process.env.PDF_TO_IMAGE_QUALITY || '0.95');
    
    this.pdfToImageConfig = {
      dpi: dpi,
      format: format,
      maxPages: maxPages > 0 ? maxPages : undefined,
      quality: quality
    };
    
    if (this.ocrEnabled && this.ocrProvider === 'tesseract') {
      this.ocrService = new OCRService();
      
      // Initialize PDF image extractor if enabled
      if (this.pdfToImageEnabled) {
        try {
          this.pdfImageExtractor = new PDFImageExtractor(this.pdfToImageConfig);
          logger.info('PDF-to-image conversion enabled');
        } catch (error) {
          logger.warn({ error }, 'Failed to initialize PDF-to-image conversion. PDF OCR will be disabled. Install canvas and system dependencies.');
          this.pdfToImageEnabled = false;
        }
      }
    }
  }

  /**
   * Extract text from a document URL
   * 
   * @param url - URL of the document
   * @returns Extracted text and metadata
   */
  async extractFromUrl(url: string): Promise<ExtractedDocument> {
    try {
      // Determine document type from URL
      const format = this.detectFormat(url);

      // Fetch document
      const response = await this.fetchDocument(url);
      const buffer = response.data;

      // Extract based on format
      switch (format) {
        case 'pdf':
          return await this.extractFromPDF(buffer, url);
        case 'docx':
          return await this.extractFromDOCX(buffer, url);
        case 'html':
          return await this.extractFromHTML(buffer.toString('utf-8'));
        default:
          return {
            text: buffer.toString('utf-8', 0, Math.min(10000, buffer.length)),
            metadata: {
              format: 'unknown',
              extractionMethod: 'fallback'
            }
          };
      }
    } catch (error) {
      logger.error({ error, url }, 'Failed to extract text from document');
      return {
        text: '',
        metadata: {
          format: 'unknown',
          extractionMethod: 'fallback'
        }
      };
    }
  }

  /**
   * Extract text from PDF
   * 
   * Uses pdf-parse library to extract text and metadata from PDF documents.
   * Handles multi-page PDFs, encrypted PDFs, and corrupted PDFs gracefully.
   */
  private async extractFromPDF(buffer: Buffer, url: string): Promise<ExtractedDocument> {
    try {
      const startTime = Date.now();
      
      // Parse PDF - pdf-parse is a CommonJS module
      const pdfData = await pdfParse(buffer, {
        // Options for better extraction
        max: 0, // 0 = no limit on pages
      });

      // Extract text
      const text = pdfData.text || '';

      // Extract metadata
      const language = pdfData.info?.Language;
      const metadata: ExtractedDocument['metadata'] = {
        format: 'pdf',
        pageCount: pdfData.numpages || undefined,
        language: typeof language === 'string' ? language : undefined,
        extractionMethod: 'direct'
      };

      // Check if PDF appears to be image-based (no text extracted)
      if (text.trim().length === 0 && pdfData.numpages > 0) {
        // This might be a scanned PDF - try OCR
        if (this.ocrEnabled && this.ocrService) {
          try {
            logger.info({ url }, 'PDF appears to be image-based. Attempting OCR');
            const ocrText = await this.extractTextWithOCR(buffer, url);
            if (ocrText.trim().length > 0) {
              return {
                text: ocrText,
                metadata: {
                  ...metadata,
                  extractionMethod: 'ocr'
                }
              };
            } else {
              logger.warn({ url }, 'OCR extraction returned no text');
              metadata.extractionMethod = 'fallback';
            }
          } catch (error) {
            logger.error({ error, url }, 'OCR extraction failed');
            metadata.extractionMethod = 'fallback';
          }
        } else {
          logger.warn({ url }, 'PDF appears to be image-based but OCR is not enabled');
          metadata.extractionMethod = 'fallback';
        }
      }

      const extractionTime = Date.now() - startTime;
      if (extractionTime > 2000) {
        logger.warn({ extractionTime, url, target: 2000 }, 'PDF extraction exceeded target time');
      }

      return {
        text,
        metadata
      };
    } catch (error) {
      // Handle specific error types
      if (error instanceof Error) {
        // Check for encrypted/protected PDF
        if (error.message.includes('encrypted') || error.message.includes('password')) {
          logger.warn({ url }, 'PDF is encrypted/protected. Cannot extract text');
          return {
            text: '',
            metadata: {
              format: 'pdf',
              extractionMethod: 'fallback'
            }
          };
        }

        // Check for corrupted PDF
        if (error.message.includes('corrupt') || error.message.includes('invalid')) {
          logger.warn({ url, error: error.message }, 'PDF appears to be corrupted');
          return {
            text: '',
            metadata: {
              format: 'pdf',
              extractionMethod: 'fallback'
            }
          };
        }
      }

      // Generic error handling
      logger.error({ error, url }, 'Failed to extract text from PDF');
      return {
        text: '',
        metadata: {
          format: 'pdf',
          extractionMethod: 'fallback'
        }
      };
    }
  }

  /**
   * Extract text from DOCX
   * 
   * Uses mammoth library to extract text and preserve document structure from DOCX documents.
   * Handles corrupted documents gracefully.
   */
  private async extractFromDOCX(buffer: Buffer, url: string): Promise<ExtractedDocument> {
    try {
      const startTime = Date.now();

      // Extract text with mammoth
      // mammoth.extractRawText() gives plain text
      // mammoth.convertToHtml() gives HTML (preserves structure)
      // We'll use extractRawText for simplicity, but could use convertToHtml for better structure
      const result = await mammoth.extractRawText({ buffer });

      // Extract text
      const text = result.value || '';

      // Get warnings (e.g., unsupported features)
      if (result.messages.length > 0) {
        logger.warn({ url, warnings: result.messages.map(m => m.message) }, 'DOCX extraction warnings');
      }

      const metadata: ExtractedDocument['metadata'] = {
        format: 'docx',
        extractionMethod: 'direct'
      };

      const extractionTime = Date.now() - startTime;
      if (extractionTime > 1000) {
        logger.warn({ extractionTime, url, target: 1000 }, 'DOCX extraction exceeded target time');
      }

      return {
        text,
        metadata
      };
    } catch (error) {
      // Handle corrupted documents
      if (error instanceof Error) {
        if (error.message.includes('corrupt') || error.message.includes('invalid') || 
            error.message.includes('not a valid') || error.message.includes('unexpected')) {
          logger.warn({ url, error: error.message }, 'DOCX appears to be corrupted or invalid');
          return {
            text: '',
            metadata: {
              format: 'docx',
              extractionMethod: 'fallback'
            }
          };
        }
      }

      // Generic error handling
      logger.error({ error, url }, 'Failed to extract text from DOCX');
      return {
        text: '',
        metadata: {
          format: 'docx',
          extractionMethod: 'fallback'
        }
      };
    }
  }

  /**
   * Extract text from HTML
   */
  private async extractFromHTML(html: string): Promise<ExtractedDocument> {
    // Basic HTML text extraction (remove tags, keep text)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      text,
      metadata: {
        format: 'html',
        extractionMethod: 'direct'
      }
    };
  }

  /**
   * Detect document format from URL
   */
  private detectFormat(url: string): 'pdf' | 'docx' | 'html' | 'text' | 'unknown' {
    const urlLower = url.toLowerCase();
    
    if (urlLower.endsWith('.pdf')) return 'pdf';
    if (urlLower.endsWith('.docx') || urlLower.endsWith('.doc')) return 'docx';
    if (urlLower.endsWith('.html') || urlLower.endsWith('.htm')) return 'html';
    if (urlLower.endsWith('.txt')) return 'text';
    
    // Check content type from URL pattern
    if (urlLower.includes('.pdf')) return 'pdf';
    if (urlLower.includes('.docx') || urlLower.includes('.doc')) return 'docx';
    
    return 'unknown';
  }

  /**
   * Fetch document from URL
   */
  private async fetchDocument(url: string): Promise<{ data: Buffer }> {
    const config: AxiosRequestConfig = {
      timeout: 30000,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': scraperConfig.userAgent
      }
    };

    const response = await axios.get(url, config);
    return { data: Buffer.from(response.data) };
  }

  /**
   * Check if OCR is enabled
   */
  isOCREnabled(): boolean {
    return this.ocrEnabled;
  }

  /**
   * Extract text using OCR (for scanned documents)
   * 
   * @param buffer - Document buffer (PDF or image)
   * @param url - Document URL for logging
   * @returns Extracted text from OCR
   */
  async extractWithOCR(buffer: Buffer, url?: string): Promise<string> {
    if (!this.ocrEnabled) {
      throw new Error('OCR is not enabled');
    }

    if (!this.ocrService) {
      throw new Error('OCR service not initialized');
    }

    return await this.extractTextWithOCR(buffer, url || '');
  }

  /**
   * Extract text from PDF using OCR
   * 
   * Converts PDF pages to images and processes each page with OCR.
   * Combines results from all pages into a single text document.
   */
  private async extractTextWithOCR(pdfBuffer: Buffer, url: string): Promise<string> {
    if (!this.ocrService) {
      throw new Error('OCR service not initialized');
    }

    try {
      // Check if OCR service is available
      const isAvailable = await this.ocrService.isAvailable();
      if (!isAvailable) {
        throw new Error('OCR service is not available');
      }

      // Check if PDF-to-image conversion is enabled and available
      if (!this.pdfToImageEnabled || !this.pdfImageExtractor) {
        logger.warn({ url }, 'PDF-to-image conversion is not enabled or available. Cannot perform OCR on PDF');
        return '';
      }

      logger.info({ url }, 'Converting PDF pages to images for OCR');
      
      // Convert PDF pages to images
      const pageImages = await this.pdfImageExtractor.extractPageImages(pdfBuffer);
      
      if (pageImages.length === 0) {
        logger.warn({ url }, 'No pages extracted from PDF');
        return '';
      }

      logger.info({ url, pageCount: pageImages.length }, 'Extracted pages from PDF. Processing with OCR');

      // Process each page image with OCR
      const ocrResults: string[] = [];
      
      for (let i = 0; i < pageImages.length; i++) {
        const pageImage = pageImages[i];
        try {
          logger.debug({ url, pageNumber: pageImage.pageNumber, totalPages: pageImages.length }, 'Processing page with OCR');
          
          const ocrResult = await this.ocrService.extractText(pageImage.imageBuffer);
          
          if (ocrResult.text.trim().length > 0) {
            // Add page marker (optional, can be configured)
            const pageMarker = pageImages.length > 1 
              ? `\n\n--- Page ${pageImage.pageNumber} ---\n\n`
              : '';
            ocrResults.push(pageMarker + ocrResult.text);
          } else {
            logger.warn({ url, pageNumber: pageImage.pageNumber }, 'OCR returned no text for page');
          }
        } catch (error) {
          logger.error({ error, url, pageNumber: pageImage.pageNumber }, 'OCR failed for page');
          // Continue with next page
        }
      }

      // Combine all page results
      const combinedText = ocrResults.join('\n');
      
      logger.info({ 
        url, 
        characterCount: combinedText.length, 
        pageCount: ocrResults.length 
      }, 'OCR completed');

      return combinedText;
    } catch (error) {
      // Handle specific errors
      if (error instanceof Error) {
        // Check for canvas/PDF.js initialization errors
        if (error.message.includes('Canvas') || error.message.includes('canvas')) {
          logger.error({ error, url }, 'Canvas not available for PDF OCR. Install system dependencies: sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev');
          return '';
        }
      }

      logger.error({ error, url }, 'OCR extraction failed');
      throw error;
    }
  }

  /**
   * Check if file is an image file (can be processed directly with OCR)
   */
  private isImageFile(url: string): boolean {
    const urlLower = url.toLowerCase();
    return urlLower.endsWith('.png') || 
           urlLower.endsWith('.jpg') || 
           urlLower.endsWith('.jpeg') || 
           urlLower.endsWith('.gif') || 
           urlLower.endsWith('.bmp') ||
           urlLower.endsWith('.tiff') ||
           urlLower.endsWith('.tif');
  }

  /**
   * Check if PDF-to-image conversion is enabled
   */
  isPDFToImageEnabled(): boolean {
    return this.pdfToImageEnabled && this.pdfImageExtractor !== null;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.ocrService) {
      await this.ocrService.cleanup();
    }
    // PDFImageExtractor doesn't need cleanup (no persistent resources)
  }
}
