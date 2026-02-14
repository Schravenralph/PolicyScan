/**
 * RechtspraakXmlExtractor - Extract text and metadata from Rechtspraak XML
 * 
 * Robust text extraction from Rechtspraak XML documents following open-rechtspraak.xsd schema.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/08-rechtspraak-adapter.md
 */

import { parseStringPromise, processors } from 'xml2js';
import { logger } from '../../utils/logger.js';

/**
 * Extracted content from Rechtspraak XML
 */
export interface RechtspraakExtractionResult {
  fullText: string;
  title?: string;
  publisherAuthority?: string; // Court
  publishedAt?: Date;
  documentType?: 'uitspraak' | 'conclusie';
  ecli?: string;
  citations?: string[]; // Raw citation strings
  metadata?: Record<string, unknown>; // Raw structured fields
}

/**
 * RechtspraakXmlExtractor - Extract text from Rechtspraak XML
 */
export class RechtspraakXmlExtractor {
  /**
   * Extract text and metadata from Rechtspraak XML
   * 
   * @param xmlContent - Rechtspraak XML content as string or Buffer
   * @returns Extracted content and metadata
   */
  async extract(xmlContent: string | Buffer): Promise<RechtspraakExtractionResult> {
    const xmlString = typeof xmlContent === 'string' ? xmlContent : xmlContent.toString('utf-8');
    
    try {
      // Parse XML
      const parsed = await parseStringPromise(xmlString, {
        explicitArray: false,
        mergeAttrs: true,
        trim: true,
        normalize: true,
        xmlns: true,
        tagNameProcessors: [processors.stripPrefix],
        attrNameProcessors: [processors.stripPrefix],
      });

      // Extract metadata
      const metadata = this.extractMetadata(parsed);
      
      // Extract fullText from uitspraak or conclusie
      const fullText = this.extractFullText(parsed);
      
      if (!fullText || fullText.trim().length === 0) {
        throw new Error('Extracted fullText is empty');
      }

      // Extract citations (minimal MVP - just raw strings)
      const citations = this.extractCitations(parsed);

      logger.debug(
        {
          textLength: fullText.length,
          hasTitle: !!metadata.title,
          documentType: metadata.documentType,
          ecli: metadata.ecli,
        },
        'Extracted text from Rechtspraak XML'
      );

      return {
        fullText,
        title: metadata.title,
        publisherAuthority: metadata.publisherAuthority,
        publishedAt: metadata.publishedAt,
        documentType: metadata.documentType,
        ecli: metadata.ecli,
        citations,
        metadata: metadata.raw,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to extract text from Rechtspraak XML');
      throw new Error(`Rechtspraak extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract metadata from parsed XML
   */
  private extractMetadata(parsed: unknown): {
    title?: string;
    publisherAuthority?: string;
    publishedAt?: Date;
    documentType?: 'uitspraak' | 'conclusie';
    ecli?: string;
    raw: Record<string, unknown>;
  } {
    const metadata: {
      title?: string;
      publisherAuthority?: string;
      publishedAt?: Date;
      documentType?: 'uitspraak' | 'conclusie';
      ecli?: string;
      raw: Record<string, unknown>;
    } = {
      raw: {},
    };

    if (typeof parsed !== 'object' || parsed === null) {
      return metadata;
    }

    const obj = parsed as Record<string, unknown>;

    // Extract ECLI
    const ecli = this.findValue(obj, ['ecli']);
    if (ecli) {
      metadata.ecli = String(ecli);
    }

    // Extract title (dcterms:title -> title)
    const title = this.findValue(obj, ['title']);
    if (title) {
      metadata.title = String(title);
    }

    // Extract court/publisher (dcterms:creator -> creator)
    const creator = this.findValue(obj, ['creator']);
    if (creator) {
      metadata.publisherAuthority = String(creator);
    }

    // Extract date (dcterms:date -> date, dcterms:issued -> issued)
    const dateStr = this.findValue(obj, ['date', 'issued']);
    if (dateStr) {
      try {
        metadata.publishedAt = new Date(String(dateStr));
      } catch {
        // Invalid date, skip
      }
    }

    // Determine document type (uitspraak or conclusie)
    if (this.hasElement(obj, 'uitspraak')) {
      metadata.documentType = 'uitspraak';
    } else if (this.hasElement(obj, 'conclusie')) {
      metadata.documentType = 'conclusie';
    }

    return metadata;
  }

  /**
   * Extract fullText from uitspraak or conclusie
   */
  private extractFullText(parsed: unknown): string {
    if (typeof parsed !== 'object' || parsed === null) {
      return '';
    }

    const obj = parsed as Record<string, unknown>;

    // Find uitspraak or conclusie element
    const uitspraak = this.findElement(obj, ['uitspraak']);
    const conclusie = this.findElement(obj, ['conclusie']);

    const documentElement = uitspraak || conclusie;
    if (!documentElement) {
      // Fallback: extract all text from root
      return this.extractTextRecursive(obj);
    }

    // Extract text from document element
    return this.extractTextFromDocument(documentElement);
  }

  /**
   * Extract text from uitspraak/conclusie element
   */
  private extractTextFromDocument(docElement: unknown): string {
    const parts: string[] = [];

    if (typeof docElement !== 'object' || docElement === null) {
      return '';
    }

    const obj = docElement as Record<string, unknown>;

    // Extract from sections (rs:section -> section)
    const sections = this.findElements(obj, ['section']);
    for (const section of sections) {
      const sectionText = this.extractTextFromSection(section);
      if (sectionText.trim().length > 0) {
        parts.push(sectionText);
      }
    }

    // If no sections, extract directly from paragraphs
    if (parts.length === 0) {
      const paragraphs = this.findElements(obj, ['para', 'p']);
      for (const para of paragraphs) {
        const paraText = this.extractTextRecursive(para);
        if (paraText.trim().length > 0) {
          parts.push(paraText);
        }
      }
    }

    // Extract from bridgeheads (headings)
    const headings = this.findElements(obj, ['bridgehead', 'h1', 'h2', 'h3']);
    for (const heading of headings) {
      const headingText = this.extractTextRecursive(heading);
      if (headingText.trim().length > 0) {
        parts.push(`\n## ${headingText}\n`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Extract text from section element
   */
  private extractTextFromSection(section: unknown): string {
    const parts: string[] = [];

    if (typeof section !== 'object' || section === null) {
      return '';
    }

    const obj = section as Record<string, unknown>;

    // Extract bridgehead (heading)
    const bridgehead = this.findElement(obj, ['bridgehead']);
    if (bridgehead) {
      const headingText = this.extractTextRecursive(bridgehead);
      if (headingText.trim().length > 0) {
        parts.push(`\n## ${headingText}\n`);
      }
    }

    // Extract paragraphs
    const paragraphs = this.findElements(obj, ['para', 'p']);
    for (const para of paragraphs) {
      const paraText = this.extractTextRecursive(para);
      if (paraText.trim().length > 0) {
        parts.push(paraText);
      }
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
      return obj.map(item => this.extractTextRecursive(item)).join(' ');
    }

    const parts: string[] = [];
    const record = obj as Record<string, unknown>;

    for (const [key, value] of Object.entries(record)) {
      // Skip attributes and metadata
      if (key.startsWith('_') || key === '$' || key === 'xmlns') {
        continue;
      }

      const text = this.extractTextRecursive(value);
      if (text.trim().length > 0) {
        parts.push(text);
      }
    }

    return parts.join(' ');
  }

  /**
   * Extract citations (minimal MVP - raw strings)
   * 
   * Looks for common citation patterns in text.
   */
  private extractCitations(parsed: unknown): string[] {
    const citations: string[] = [];
    const fullText = this.extractFullText(parsed);

    // Common citation patterns (simplified MVP)
    // ECLI citations
    const ecliPattern = /ECLI:[A-Z]{2}:[A-Z]{2,4}:\d{4}:\d+/g;
    const ecliMatches = fullText.match(ecliPattern);
    if (ecliMatches) {
      citations.push(...ecliMatches);
    }

    // Article citations (e.g., "Art. 1:1 BW", "Artikel 2:2 Awb")
    const articlePattern = /(?:Art\.|Artikel)\s+\d+[:\d]*\s+(?:BW|Awb|Wet|Besluit)/gi;
    const articleMatches = fullText.match(articlePattern);
    if (articleMatches) {
      citations.push(...articleMatches);
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

  /**
   * Find element by key
   */
  private findElement(obj: unknown, keys: string[]): unknown {
    if (typeof obj !== 'object' || obj === null) {
      return null;
    }

    for (const key of keys) {
      if (key in obj) {
        return (obj as Record<string, unknown>)[key];
      }

      // Case-insensitive match
      for (const [objKey, value] of Object.entries(obj)) {
        if (objKey.toLowerCase() === key.toLowerCase()) {
          return value;
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
        if (objKey.toLowerCase() === key.toLowerCase()) {
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

  /**
   * Check if element exists
   */
  private hasElement(obj: unknown, ...keys: string[]): boolean {
    return this.findElement(obj, keys) !== null;
  }
}

