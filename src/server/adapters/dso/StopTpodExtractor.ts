/**
 * StopTpodExtractor - Extract text from STOP/TPOD XML
 * 
 * MVP implementation: extracts text content from STOP/TPOD XML documents.
 * Later: structured parser for headings, articles, etc.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/07-dso-stop-tpod-adapter.md
 */

import { parseStringPromise } from 'xml2js';
import { logger } from '../../utils/logger.js';

/**
 * Extracted text from STOP/TPOD XML
 */
export interface StopTpodExtractionResult {
  fullText: string;
  metadata?: {
    title?: string;
    bestuursorgaan?: string;
    documentType?: string;
  };
}

/**
 * StopTpodExtractor - Extract text from STOP/TPOD XML
 */
export class StopTpodExtractor {
  /**
   * Extract text from STOP/TPOD XML
   * 
   * MVP: extracts all text content from XML elements.
   * Preserves basic structure (headings, paragraphs) where possible.
   * 
   * @param xmlContent - STOP/TPOD XML content as string or Buffer
   * @returns Extracted text and metadata
   */
  async extract(xmlContent: string | Buffer): Promise<StopTpodExtractionResult> {
    const xmlString = typeof xmlContent === 'string' ? xmlContent : xmlContent.toString('utf-8');
    
    try {
      // Parse XML
      const parsed = await parseStringPromise(xmlString, {
        explicitArray: false,
        mergeAttrs: false,
        trim: true,
        normalize: true,
      });

      // Extract text content recursively
      const fullText = this.extractText(parsed);
      
      // Extract metadata
      const metadata = this.extractMetadata(parsed);

      if (!fullText || fullText.trim().length === 0) {
        throw new Error('Extracted fullText is empty');
      }

      logger.debug(
        { 
          textLength: fullText.length,
          hasTitle: !!metadata?.title,
          documentType: metadata?.documentType,
        },
        'Extracted text from STOP/TPOD XML'
      );

      return {
        fullText,
        metadata,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to extract text from STOP/TPOD XML');
      throw new Error(`STOP/TPOD extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract text content from parsed XML object
   */
  private extractText(obj: unknown): string {
    if (typeof obj === 'string') {
      return obj;
    }

    if (typeof obj !== 'object' || obj === null) {
      return '';
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.extractText(item)).join('\n\n');
    }

    const parts: string[] = [];
    
    for (const [key, value] of Object.entries(obj)) {
      // Handle text content
      if (key === '_') {
        parts.push(String(value));
        continue;
      }

      // Skip attributes and metadata
      if (key === '$') {
        continue;
      }

      const text = this.extractText(value);
      if (text.trim().length > 0) {
        // Add heading markers for common STOP/TPOD elements
        if (this.isHeadingElement(key)) {
          parts.push(`\n## ${text}\n`);
        } else {
          parts.push(text);
        }
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Check if element name suggests a heading
   */
  private isHeadingElement(elementName: string): boolean {
    const headingPatterns = [
      /^titel$/i,
      /^hoofdstuk$/i,
      /^artikel$/i,
      /^paragraaf$/i,
      /^afdeling$/i,
      /^kop$/i,
      /^heading$/i,
    ];
    
    return headingPatterns.some(pattern => pattern.test(elementName));
  }

  /**
   * Extract metadata from parsed XML
   */
  private extractMetadata(parsed: unknown): StopTpodExtractionResult['metadata'] {
    const metadata: StopTpodExtractionResult['metadata'] = {};

    if (typeof parsed !== 'object' || parsed === null) {
      return metadata;
    }

    const obj = parsed as Record<string, unknown>;

    // Try to find title
    const title = this.findValue(obj, ['titel', 'title', 'naam', 'name']);
    if (title) {
      metadata.title = String(title);
    }

    // Try to find bestuursorgaan
    const bestuursorgaan = this.findValue(obj, ['bestuursorgaan', 'publisher', 'uitgever']);
    if (bestuursorgaan) {
      metadata.bestuursorgaan = String(bestuursorgaan);
    }

    // Try to find documentType
    const documentType = this.findValue(obj, ['documentType', 'type', 'soort']);
    if (documentType) {
      metadata.documentType = String(documentType);
    }

    return metadata;
  }

  /**
   * Find value by key (case-insensitive, supports nested objects)
   */
  private findValue(obj: unknown, keys: string[]): unknown {
    if (typeof obj !== 'object' || obj === null) {
      return null;
    }

    for (const key of keys) {
      // Direct match
      if (key in obj) {
        const value = (obj as Record<string, unknown>)[key];
        if (value !== null && value !== undefined) {
          return value;
        }
      }

      // Case-insensitive match
      for (const [objKey, value] of Object.entries(obj)) {
        if (objKey.toLowerCase() === key.toLowerCase()) {
          if (value !== null && value !== undefined) {
            return value;
          }
        }
      }
    }

    // Recursive search in nested objects
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const found = this.findValue(value, keys);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }
}

