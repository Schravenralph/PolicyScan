/**
 * DocxExtractor - Extract text from DOCX documents
 * 
 * Robust text extraction from DOCX files with heading preservation.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/10-gemeente-beleid-adapter.md
 */

import mammoth from 'mammoth';
import { logger } from '../../utils/logger.js';

/**
 * DOCX extraction result
 */
export interface DocxExtractionResult {
  fullText: string;
  headings?: string[]; // Extracted headings for structure
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    created?: Date;
    modified?: Date;
  };
  diagnostics: {
    extractionMethod: 'mammoth';
    hasText: boolean;
    textLength: number;
    headingCount: number;
  };
}

/**
 * DocxExtractor - Extract text from DOCX
 */
export class DocxExtractor {
  private readonly minTextLength: number;

  constructor(config: { minTextLength?: number } = {}) {
    this.minTextLength = config.minTextLength || 100; // Minimum 100 characters
  }

  /**
   * Extract text from DOCX buffer
   * 
   * @param docxBuffer - DOCX file as Buffer
   * @returns Extracted text and diagnostics
   * @throws Error if extraction fails or text is below threshold
   */
  async extract(docxBuffer: Buffer): Promise<DocxExtractionResult> {
    try {
      // Extract text with HTML conversion (preserves structure)
      const result = await mammoth.extractRawText({ buffer: docxBuffer });
      const fullText = result.value || '';

      // Extract headings from HTML if available
      const htmlResult = await mammoth.convertToHtml({ buffer: docxBuffer });
      const headings: string[] = [];
      
      // Extract headings from HTML (h1-h6)
      if (htmlResult.value) {
        const headingRegex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi;
        let match;
        while ((match = headingRegex.exec(htmlResult.value)) !== null) {
          const headingText = match[1]
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .trim();
          if (headingText.length > 0) {
            headings.push(headingText);
          }
        }
      }

      // Validate extraction quality
      if (fullText.trim().length === 0) {
        throw new Error('DOCX extraction produced empty text');
      }

      if (fullText.trim().length < this.minTextLength) {
        throw new Error(
          `DOCX extraction produced text below minimum threshold (${fullText.trim().length} < ${this.minTextLength} characters)`
        );
      }

      // Extract metadata (if available in DOCX)
      const metadata: DocxExtractionResult['metadata'] = {};
      // Note: mammoth doesn't extract metadata directly, but we can try to infer from document properties
      // For MVP, we'll skip metadata extraction from DOCX

      logger.debug(
        {
          textLength: fullText.length,
          headingCount: headings.length,
        },
        'DOCX extraction completed'
      );

      return {
        fullText: fullText.trim(),
        headings: headings.length > 0 ? headings : undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        diagnostics: {
          extractionMethod: 'mammoth',
          hasText: true,
          textLength: fullText.length,
          headingCount: headings.length,
        },
      };
    } catch (error) {
      logger.error({ error }, 'DOCX extraction failed');
      
      if (error instanceof Error && error.message.includes('empty text')) {
        throw error; // Re-throw validation errors
      }
      
      throw new Error(`DOCX extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

