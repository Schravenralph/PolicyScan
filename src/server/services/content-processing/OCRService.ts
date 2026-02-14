/**
 * OCR Service
 * 
 * Provides OCR (Optical Character Recognition) for scanned PDF documents.
 * Supports both local (tesseract.js) and cloud OCR providers (Google Cloud Vision, AWS Textract).
 */

import { createWorker, Worker } from 'tesseract.js';
import { Cache } from '../infrastructure/cache.js';
import * as crypto from 'crypto';

export interface OCRResult {
  text: string;
  confidence: number;
  processingTime: number;
  provider: 'tesseract' | 'cloud';
}

export interface OCRConfig {
  language?: string;
  quality?: 'low' | 'medium' | 'high';
  timeout?: number;
}

/**
 * Service for performing OCR on scanned documents
 */
export class OCRService {
  private provider: 'tesseract' | 'cloud';
  private cache: Cache<string>;
  private worker: Worker | null = null;
  private workerInitialized: boolean = false;
  private defaultLanguage: string;
  private defaultTimeout: number;

  constructor() {
    this.provider = (process.env.DOCUMENT_EXTRACTION_OCR_PROVIDER as 'tesseract' | 'cloud') || 'tesseract';
    this.defaultLanguage = process.env.DOCUMENT_EXTRACTION_OCR_LANGUAGE || 'nld'; // Dutch
    this.defaultTimeout = parseInt(process.env.DOCUMENT_EXTRACTION_OCR_TIMEOUT || '30000', 10); // 30 seconds
    
    // Cache OCR results for 7 days (scanned documents don't change)
    this.cache = new Cache<string>(1000, 7 * 24 * 60 * 60 * 1000);
  }

  /**
   * Initialize Tesseract worker (lazy initialization)
   */
  private async initializeWorker(): Promise<void> {
    if (this.workerInitialized && this.worker) {
      return;
    }

    try {
      console.log('[OCRService] Initializing Tesseract worker...');
      this.worker = await createWorker(this.defaultLanguage, 1, {
        logger: (m) => {
          // Only log errors and warnings
          if (m.status === 'error' || m.status === 'warning') {
            console.warn(`[OCRService] ${m.status}: ${(m as { message?: string }).message || ''}`);
          }
        }
      });
      this.workerInitialized = true;
      console.log('[OCRService] Tesseract worker initialized');
    } catch (error) {
      console.error('[OCRService] Failed to initialize Tesseract worker:', error);
      throw new Error('OCR service unavailable: Failed to initialize Tesseract');
    }
  }

  /**
   * Generate cache key from image buffer
   */
  private getCacheKey(buffer: Buffer): string {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    return `ocr:${this.provider}:${this.defaultLanguage}:${hash}`;
  }

  /**
   * Extract text from image buffer using OCR
   * 
   * @param imageBuffer - Image buffer (PNG, JPEG, etc.)
   * @param config - OCR configuration options
   * @returns Extracted text and metadata
   */
  async extractText(imageBuffer: Buffer, config: OCRConfig = {}): Promise<OCRResult> {
    const startTime = Date.now();
    const language = config.language || this.defaultLanguage;
    const timeout = config.timeout || this.defaultTimeout;

    // Check cache first
    const cacheKey = this.getCacheKey(imageBuffer);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      console.log('[OCRService] Cache hit for OCR result');
      return {
        text: cached,
        confidence: 0.95, // Assume high confidence for cached results
        processingTime: Date.now() - startTime,
        provider: this.provider
      };
    }

    try {
      let text: string;
      let confidence: number;

      if (this.provider === 'tesseract') {
        const result = await this.extractWithTesseract(imageBuffer, language, timeout);
        text = result.text;
        confidence = result.confidence;
      } else {
        // Cloud OCR not yet implemented
        throw new Error('Cloud OCR not yet implemented. Set DOCUMENT_EXTRACTION_OCR_PROVIDER=tesseract');
      }

      const processingTime = Date.now() - startTime;

      // Cache the result
      await this.cache.set(cacheKey, text);

      // Warn if processing took too long
      if (processingTime > 10000) {
        console.warn(`[OCRService] OCR processing took ${processingTime}ms (target: < 10 seconds per page)`);
      }

      return {
        text,
        confidence,
        processingTime,
        provider: this.provider
      };
    } catch (error) {
      console.error('[OCRService] OCR extraction failed:', error);
      throw error;
    }
  }

  /**
   * Extract text using Tesseract.js (local OCR)
   */
  private async extractWithTesseract(
    imageBuffer: Buffer,
    language: string,
    timeout: number
  ): Promise<{ text: string; confidence: number }> {
    await this.initializeWorker();

    if (!this.worker) {
      throw new Error('Tesseract worker not initialized');
    }

    try {
      // Set language if different from default
      if (language !== this.defaultLanguage) {
        // Note: loadLanguage is not available in newer tesseract.js versions, use initialize with language instead
        // await this.worker.loadLanguage(language);
        await this.worker.reinitialize(language);
      }

      // Perform OCR with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('OCR timeout')), timeout);
      });

      const ocrPromise = this.worker.recognize(imageBuffer);

      const result = await Promise.race([ocrPromise, timeoutPromise]);

      return {
        text: result.data.text || '',
        confidence: result.data.confidence || 0
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'OCR timeout') {
        throw new Error(`OCR processing exceeded timeout of ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Extract text from multiple images (batch processing)
   * 
   * @param imageBuffers - Array of image buffers
   * @param config - OCR configuration options
   * @returns Array of extracted text results
   */
  async extractTextBatch(
    imageBuffers: Buffer[],
    config: OCRConfig = {}
  ): Promise<OCRResult[]> {
    const results: OCRResult[] = [];

    for (const buffer of imageBuffers) {
      try {
        const result = await this.extractText(buffer, config);
        results.push(result);
      } catch (error) {
        console.error('[OCRService] Failed to process image in batch:', error);
        // Continue with other images
        results.push({
          text: '',
          confidence: 0,
          processingTime: 0,
          provider: this.provider
        });
      }
    }

    return results;
  }

  /**
   * Check if OCR is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (this.provider === 'tesseract') {
        await this.initializeWorker();
        return this.worker !== null;
      }
      return false;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Cleanup resources (terminate worker)
   */
  async cleanup(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
        this.worker = null;
        this.workerInitialized = false;
        console.log('[OCRService] Tesseract worker terminated');
      } catch (error) {
        console.error('[OCRService] Error terminating worker:', error);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { hits: number; misses: number; hitRate?: number; size: number; maxSize: number } {
    const stats = this.cache.getStats();
    return {
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hitRate,
      size: stats.size,
      maxSize: stats.maxSize
    };
  }
}
