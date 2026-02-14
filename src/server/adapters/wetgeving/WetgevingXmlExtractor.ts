/**
 * WetgevingXmlExtractor - Extract text and metadata from Wetgeving XML
 * 
 * Robust text extraction from Wetgeving XML documents (BWB/CVDR format).
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/09-wetgeving-adapter.md
 */

import { parseStringPromise } from 'xml2js';
import { logger } from '../../utils/logger.js';

/**
 * Extracted content from Wetgeving XML
 */
export interface WetgevingExtractionResult {
  fullText: string;
  title?: string;
  publisherAuthority?: string;
  publishedAt?: Date;
  validFrom?: Date;
  validTo?: Date;
  legalIds?: {
    bwbr?: string;
    akn?: string;
    cvdr?: string;
  };
  citations?: string[]; // Raw citation strings
  metadata?: Record<string, unknown>; // Raw structured fields
}

/**
 * WetgevingXmlExtractor - Extract text from Wetgeving XML
 */
export class WetgevingXmlExtractor {
  /**
   * Extract text and metadata from Wetgeving XML
   * 
   * @param xmlContent - Wetgeving XML content as string or Buffer
   * @returns Extracted content and metadata
   */
  async extract(xmlContent: string | Buffer): Promise<WetgevingExtractionResult> {
    const xmlString = typeof xmlContent === 'string' ? xmlContent : xmlContent.toString('utf-8');
    
    try {
      // Parse XML
      const parsed = await parseStringPromise(xmlString, {
        explicitArray: false,
        mergeAttrs: true,
        trim: true,
        normalize: true,
        xmlns: true,
      });

      // Extract metadata
      const metadata = this.extractMetadata(parsed);
      
      // Extract fullText
      const fullText = this.extractFullText(parsed);
      
      if (!fullText || fullText.trim().length === 0) {
        throw new Error('Extracted fullText is empty');
      }

      // Extract citations (minimal MVP - raw strings)
      const citations = this.extractCitations(fullText);

      logger.debug(
        {
          textLength: fullText.length,
          hasTitle: !!metadata.title,
          legalIds: metadata.legalIds,
        },
        'Extracted text from Wetgeving XML'
      );

      return {
        fullText,
        title: metadata.title,
        publisherAuthority: metadata.publisherAuthority,
        publishedAt: metadata.publishedAt,
        validFrom: metadata.validFrom,
        validTo: metadata.validTo,
        legalIds: metadata.legalIds,
        citations,
        metadata: metadata.raw,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to extract text from Wetgeving XML');
      throw new Error(`Wetgeving extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract metadata from parsed XML
   */
  private extractMetadata(parsed: unknown): {
    title?: string;
    publisherAuthority?: string;
    publishedAt?: Date;
    validFrom?: Date;
    validTo?: Date;
    legalIds?: { bwbr?: string; akn?: string; cvdr?: string };
    raw: Record<string, unknown>;
  } {
    const metadata: {
      title?: string;
      publisherAuthority?: string;
      publishedAt?: Date;
      validFrom?: Date;
      validTo?: Date;
      legalIds?: { bwbr?: string; akn?: string; cvdr?: string };
      raw: Record<string, unknown>;
    } = {
      raw: {},
    };

    if (typeof parsed !== 'object' || parsed === null) {
      return metadata;
    }

    const obj = parsed as Record<string, unknown>;

    // Extract title
    const title = this.findValue(obj, ['title', 'titel', 'dcterms:title', 'dc:title']);
    if (title) {
      metadata.title = String(title);
    }

    // Extract publisher/authority
    const publisher = this.findValue(obj, ['publisher', 'uitgever', 'dcterms:publisher', 'dc:publisher', 'creator', 'dcterms:creator']);
    if (publisher) {
      metadata.publisherAuthority = String(publisher);
    }

    // Extract dates
    const publishedAt = this.findValue(obj, ['publishedAt', 'publicatiedatum', 'dcterms:issued', 'dc:date']);
    if (publishedAt) {
      const date = new Date(String(publishedAt));
      if (!isNaN(date.getTime())) {
        metadata.publishedAt = date;
      }
    }

    const validFrom = this.findValue(obj, ['validFrom', 'geldigVanaf', 'geldigheidsdatum']);
    if (validFrom) {
      const date = new Date(String(validFrom));
      if (!isNaN(date.getTime())) {
        metadata.validFrom = date;
      }
    }

    const validTo = this.findValue(obj, ['validTo', 'geldigTot', 'vervaldatum']);
    if (validTo) {
      const date = new Date(String(validTo));
      if (!isNaN(date.getTime())) {
        metadata.validTo = date;
      }
    }

    // Extract legal identifiers (BWBR, AKN, CVDR)
    const bwbr = this.findValue(obj, ['bwbr', 'BWBR', 'identifier', 'dcterms:identifier']);
    const akn = this.findValue(obj, ['akn', 'AKN', 'ecli']);
    const cvdr = this.findValue(obj, ['cvdr', 'CVDR']);

    metadata.legalIds = {};
    if (bwbr && String(bwbr).match(/^BWBR\d+$/i)) {
      metadata.legalIds.bwbr = String(bwbr).toUpperCase();
    }
    if (akn && String(akn).match(/^AKN/i)) {
      metadata.legalIds.akn = String(akn);
    }
    if (cvdr) {
      metadata.legalIds.cvdr = String(cvdr);
    }

    return metadata;
  }

  /**
   * Extract fullText from XML
   */
  private extractFullText(parsed: unknown): string {
    if (typeof parsed !== 'object' || parsed === null) {
      return '';
    }

    const obj = parsed as Record<string, unknown>;

    // Try to find main content elements
    // Common patterns: <tekst>, <inhoud>, <body>, <content>, <artikel>, <artikelen>
    const contentElements = [
      'tekst', 'inhoud', 'body', 'content', 'artikel', 'artikelen',
      'hoofdstuk', 'afdeling', 'paragraaf', 'lid',
    ];

    const parts: string[] = [];

    for (const elementName of contentElements) {
      const elements = this.findElements(obj, [elementName]);
      for (const element of elements) {
        const text = this.extractTextRecursive(element);
        if (text.trim().length > 0) {
          parts.push(text);
        }
      }
    }

    // If no structured elements found, extract all text
    if (parts.length === 0) {
      return this.extractTextRecursive(obj);
    }

    return parts.join('\n\n');
  }

  /**
   * Extract text recursively from any element
   */
  private extractTextRecursive(obj: unknown): string {
    if (typeof obj === 'string') {
      return obj;
    }

    if (typeof obj !== 'object' || obj === null) {
      return '';
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.extractTextRecursive(item)).join('\n\n');
    }

    const parts: string[] = [];
    const record = obj as Record<string, unknown>;

    for (const [key, value] of Object.entries(record)) {
      // Skip attributes and metadata
      if (key.startsWith('_') || key === '$' || key === 'xmlns') {
        continue;
      }

      // Add heading markers for common legal elements
      if (this.isHeadingElement(key)) {
        const headingText = this.extractTextRecursive(value);
        if (headingText.trim().length > 0) {
          parts.push(`\n## ${headingText}\n`);
        }
      } else {
        const text = this.extractTextRecursive(value);
        if (text.trim().length > 0) {
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
      /^afdeling$/i,
      /^paragraaf$/i,
      /^artikel$/i,
      /^kop$/i,
      /^heading$/i,
    ];
    
    return headingPatterns.some(pattern => pattern.test(elementName));
  }

  /**
   * Extract citations (minimal MVP - raw strings)
   */
  private extractCitations(fullText: string): string[] {
    const citations: string[] = [];

    // BWBR citations (e.g., "BWBR0001234", "Wet van 1 januari 2024, BWBR0001234")
    const bwbrPattern = /BWBR\d+/gi;
    const bwbrMatches = fullText.match(bwbrPattern);
    if (bwbrMatches) {
      citations.push(...bwbrMatches);
    }

    // Article citations (e.g., "Art. 1:1 BW", "Artikel 2 Awb")
    const articlePattern = /(?:Art\.|Artikel)\s+\d+[:\d]*\s+(?:BW|Awb|Wet|Besluit)/gi;
    const articleMatches = fullText.match(articlePattern);
    if (articleMatches) {
      citations.push(...articleMatches);
    }

    // ECLI citations
    const ecliPattern = /ECLI:[A-Z]{2}:[A-Z]{2,4}:\d{4}:\d+/g;
    const ecliMatches = fullText.match(ecliPattern);
    if (ecliMatches) {
      citations.push(...ecliMatches);
    }

    // Remove duplicates
    return Array.from(new Set(citations));
  }

  /**
   * Find value by key (case-insensitive, supports namespaces)
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

      // Case-insensitive and namespace-agnostic match
      for (const [objKey, value] of Object.entries(obj)) {
        const normalizedKey = objKey.replace(/[:\\]/g, '').toLowerCase();
        const normalizedSearch = key.replace(/[:\\]/g, '').toLowerCase();
        if (normalizedKey === normalizedSearch) {
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

  /**
   * Find all elements matching keys
   */
  private findElements(obj: unknown, keys: string[]): unknown[] {
    const elements: unknown[] = [];

    if (typeof obj !== 'object' || obj === null) {
      return elements;
    }

    for (const key of keys) {
      if (key in obj) {
        const value = (obj as Record<string, unknown>)[key];
        if (Array.isArray(value)) {
          elements.push(...value);
        } else if (value !== null && value !== undefined) {
          elements.push(value);
        }
      }

      // Case-insensitive match
      for (const [objKey, value] of Object.entries(obj)) {
        const normalizedKey = objKey.replace(/[:\\]/g, '').toLowerCase();
        const normalizedSearch = key.replace(/[:\\]/g, '').toLowerCase();
        if (normalizedKey === normalizedSearch) {
          if (Array.isArray(value)) {
            elements.push(...value);
          } else if (value !== null && value !== undefined) {
            elements.push(value);
          }
        }
      }
    }

    return elements;
  }
}

