/**
 * PdfExtractor - Extract text from PDF documents
 * 
 * Robust text extraction from PDF files with quality thresholds and diagnostics.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/10-gemeente-beleid-adapter.md
 */

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
import { logger } from '../../utils/logger.js';

/**
 * Page map entry - maps text position to page number
 */
export interface PageMapEntry {
  pageNumber: number; // 1-based page number
  startOffset: number; // Character offset in fullText where this page starts
  endOffset: number; // Character offset in fullText where this page ends
  textLength: number; // Length of text on this page
}

/**
 * PDF extraction result
 */
export interface PdfExtractionResult {
  fullText: string;
  pageCount: number;
  pageMap?: PageMapEntry[]; // Optional page map for chunking with page references
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    modDate?: Date;
  };
  diagnostics: {
    extractionMethod: 'pdf-parse';
    hasText: boolean;
    textLength: number;
    pageCount: number;
    isScanned?: boolean; // Heuristic: true if text length is very low relative to page count
    hasPageMap?: boolean; // Whether page map was successfully extracted
  };
}

/**
 * PdfExtractor - Extract text from PDF
 */
export class PdfExtractor {
  private readonly minTextLength: number;
  private readonly minTextPerPage: number; // Minimum characters per page to consider valid extraction

  constructor(config: { minTextLength?: number; minTextPerPage?: number } = {}) {
    this.minTextLength = config.minTextLength || 100; // Minimum 100 characters
    this.minTextPerPage = config.minTextPerPage || 50; // Minimum 50 characters per page
  }

  /**
   * Extract text from PDF buffer
   * 
   * @param pdfBuffer - PDF file as Buffer
   * @returns Extracted text and diagnostics
   * @throws Error if extraction fails or text is below threshold
   */
  async extract(pdfBuffer: Buffer): Promise<PdfExtractionResult> {
    try {
      // Parse PDF - pdf-parse is a CommonJS module with non-standard exports
      const data = await pdfParse(pdfBuffer, {
        max: 0, // 0 = no limit on pages
      });

      const fullText = data.text || '';
      const pageCount = data.numpages || 0;

      // Check if PDF appears to be scanned (very low text content)
      const textPerPage = pageCount > 0 ? fullText.length / pageCount : 0;
      const isScanned = textPerPage < this.minTextPerPage && pageCount > 0;

      // Validate extraction quality
      if (fullText.trim().length === 0) {
        throw new Error('PDF extraction produced empty text (may be scanned/image-based PDF)');
      }

      if (fullText.trim().length < this.minTextLength) {
        throw new Error(
          `PDF extraction produced text below minimum threshold (${fullText.trim().length} < ${this.minTextLength} characters). ` +
          'This may indicate a scanned PDF or extraction failure.'
        );
      }

      // Extract page map if pages are available
      let pageMap: PageMapEntry[] | undefined;
      let hasPageMap = false;
      
      if (data.pages && Array.isArray(data.pages) && data.pages.length > 0) {
        try {
          pageMap = this.buildPageMap(data.pages, fullText);
          hasPageMap = pageMap.length > 0;
          
          if (!hasPageMap) {
            logger.debug(
              {
                pageCount: data.pages.length,
                fullTextLength: fullText.length,
                firstPageTextLength: data.pages[0]?.text?.length || 0,
              },
              'Page map building returned empty array - using fallback estimation'
            );
            // Fallback: create page map using even distribution
            // This ensures pageMap is always created when pages are available
            const estimatedTextPerPage = fullText.length / data.pages.length;
            pageMap = data.pages.map((_page: { text?: string }, i: number) => ({
              pageNumber: i + 1,
              startOffset: Math.floor(i * estimatedTextPerPage),
              endOffset: Math.floor((i + 1) * estimatedTextPerPage),
              textLength: Math.floor(estimatedTextPerPage),
            }));
            hasPageMap = pageMap !== undefined && pageMap.length > 0;
          }
        } catch (error) {
          logger.warn({ error }, 'Failed to build page map, continuing without it');
        }
      }

      // Extract metadata
      const metadata: PdfExtractionResult['metadata'] = {};
      if (data.info) {
        if (data.info.Title) metadata.title = String(data.info.Title);
        if (data.info.Author) metadata.author = String(data.info.Author);
        if (data.info.Subject) metadata.subject = String(data.info.Subject);
        if (data.info.Creator) metadata.creator = String(data.info.Creator);
        if (data.info.Producer) metadata.producer = String(data.info.Producer);
        if (data.info.CreationDate) {
          try {
            const dateValue = data.info.CreationDate;
            if (typeof dateValue === 'string' || typeof dateValue === 'number' || dateValue instanceof Date) {
              metadata.creationDate = new Date(dateValue);
            }
          } catch {
            // Invalid date, skip
          }
        }
        if (data.info.ModDate) {
          try {
            const dateValue = data.info.ModDate;
            if (typeof dateValue === 'string' || typeof dateValue === 'number' || dateValue instanceof Date) {
              metadata.modDate = new Date(dateValue);
            }
          } catch {
            // Invalid date, skip
          }
        }
      }

      logger.debug(
        {
          pageCount,
          textLength: fullText.length,
          isScanned,
          hasPageMap,
        },
        'PDF extraction completed'
      );

      return {
        fullText: fullText.trim(),
        pageCount,
        pageMap,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        diagnostics: {
          extractionMethod: 'pdf-parse',
          hasText: true,
          textLength: fullText.length,
          pageCount,
          isScanned,
          hasPageMap,
        },
      };
    } catch (error) {
      logger.error({ error }, 'PDF extraction failed');
      
      if (error instanceof Error && error.message.includes('empty text')) {
        throw error; // Re-throw validation errors
      }
      
      throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Build page map from PDF pages array
   * 
   * Maps each page's text to character offsets in the full text.
   * This enables chunking with page references.
   */
  private buildPageMap(
    pages: Array<{ text?: string }>,
    fullText: string
  ): PageMapEntry[] {
    const pageMap: PageMapEntry[] = [];
    let currentOffset = 0;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageText = page.text || '';
      const pageTextLength = pageText.length;

      // Try to find the page text in the full text starting from current offset
      // This is a heuristic - pdf-parse may concatenate pages with newlines
      // Try multiple strategies: exact match, trimmed match, and substring match
      let pageStart = -1;
      
      // Strategy 1: Try exact match (trimmed)
      if (pageText.trim().length > 0) {
        pageStart = fullText.indexOf(pageText.trim(), currentOffset);
      }
      
      // Strategy 2: Try finding first significant substring if exact match fails
      if (pageStart < 0 && pageText.trim().length > 20) {
        // Try to find a significant substring (first 50 chars) from the page
        const significantSubstring = pageText.trim().substring(0, Math.min(50, pageText.trim().length));
        pageStart = fullText.indexOf(significantSubstring, currentOffset);
        if (pageStart >= 0) {
          // Found substring match - use it but adjust endOffset based on actual page text length
          // This handles cases where pdf-parse adds/removes whitespace between pages
        }
      }
      
      if (pageStart >= 0) {
        // Found match (exact or substring)
        // Calculate end offset: use the page text length, but ensure it doesn't exceed fullText length
        const endOffset = Math.min(pageStart + pageTextLength, fullText.length);
        pageMap.push({
          pageNumber: i + 1, // 1-based
          startOffset: pageStart,
          endOffset: endOffset,
          textLength: endOffset - pageStart,
        });
        currentOffset = endOffset;
      } else {
        // Fallback: estimate based on average text per page
        // This is less accurate but better than nothing
        const estimatedTextPerPage = fullText.length / pages.length;
        const estimatedStart = Math.floor(i * estimatedTextPerPage);
        const estimatedEnd = Math.floor((i + 1) * estimatedTextPerPage);
        
        pageMap.push({
          pageNumber: i + 1,
          startOffset: estimatedStart,
          endOffset: estimatedEnd,
          textLength: estimatedEnd - estimatedStart,
        });
        currentOffset = estimatedEnd;
      }
    }

    return pageMap;
  }
}

