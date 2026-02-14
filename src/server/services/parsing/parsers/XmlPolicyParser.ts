/**
 * XmlPolicyParser - XML document parser
 * 
 * Parses XML documents (primarily DSO STOP/TPOD XML) and extracts document structure.
 * This parser handles the XML parsing logic, while rule/entity/citation extraction
 * is handled by dedicated extractors.
 * 
 * Extracted from DsoAdapter to separate parsing concerns.
 */

import { parseStringPromise } from 'xml2js';
import { logger } from '../../../utils/logger.js';
import type { IParser } from '../interfaces/IParser.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import type { ParsedDocument } from '../types/ParsedDocument.js';
import type { NormalizedDocument } from '../../shared/types/DocumentModels.js';
import { DocumentMapper } from '../../../services/orchestration/mappers/DocumentMapper.js';

/**
 * XML Policy Parser
 * 
 * Parses XML documents and extracts document structure.
 * Rules, entities, and citations are extracted separately by extractors.
 */
export class XmlPolicyParser implements IParser {
  /**
   * Check if this parser can handle the given document
   * 
   * @param document - Canonical document to check
   * @returns true if this parser can parse the document
   */
  canParse(document: CanonicalDocument): boolean {
    // Extract parsing fields from CanonicalDocument
    const parsingFields = DocumentMapper.extractParsingFields(document);

    // Check if document is from DSO source
    if (document.source === 'DSO') {
      return true;
    }

    // Check MIME type
    if (parsingFields.mimeType === 'application/xml' || parsingFields.mimeType === 'text/xml') {
      return true;
    }

    // Check if document has XML content in sourceMetadata
    if (document.sourceMetadata && typeof document.sourceMetadata === 'object') {
      const metadata = document.sourceMetadata as Record<string, unknown>;
      if (metadata.xmlFiles && Array.isArray(metadata.xmlFiles) && metadata.xmlFiles.length > 0) {
        return true;
      }
    }

    // Check if rawData is XML
    if (parsingFields.rawData && typeof parsingFields.rawData === 'string') {
      const trimmed = parsingFields.rawData.trim();
      if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Parse the document structure
   * 
   * Extracts basic document information from XML structure.
   * Rules, entities, and citations are extracted separately by extractors.
   * 
   * @param document - Canonical document to parse
   * @returns Parsed document with structure (rules/entities/citations will be empty, extracted separately)
   */
  async parse(document: CanonicalDocument): Promise<ParsedDocument> {
    logger.debug(
      { sourceId: document.sourceId, source: document.source },
      '[XmlPolicyParser] Parsing XML document'
    );

    // Extract XML content
    const xmlContent = this.extractXmlContent(document);
    if (!xmlContent) {
      throw new Error('No XML content found in document');
    }

    // Parse XML structure
    const parsedXml = await this.parseXmlStructure(xmlContent);

    // Convert CanonicalDocument to NormalizedDocument for helper methods
    const normalizedDoc: NormalizedDocument = {
      sourceId: document.sourceId,
      sourceUrl: document.canonicalUrl || document.sourceId,
      source: document.source,
      title: document.title,
      content: document.fullText || '',
      mimeType: (document.sourceMetadata?.mimeType as string) || 'text/plain',
      rawData: document.sourceMetadata?.rawData,
      metadata: {
        ...document.sourceMetadata,
        documentType: document.documentType,
        documentFamily: document.documentFamily,
      },
    };

    // Extract basic document information
    const title = this.extractTitle(normalizedDoc, parsedXml);
    const documentType = this.extractDocumentType(normalizedDoc, parsedXml);
    const metadata = this.extractMetadata(normalizedDoc, parsedXml);

    // Extract parsing fields for sourceUrl
    const parsingFields = DocumentMapper.extractParsingFields(document);

    // Build ParsedDocument
    // Rules, entities, and citations will be extracted by extractors in later steps
    const parsedDocument: ParsedDocument = {
      sourceId: document.sourceId,
      sourceUrl: document.canonicalUrl || parsingFields.normalizedUrl || document.sourceId,
      title,
      content: document.fullText || '',
      documentType,
      rules: [], // Will be extracted by RuleExtractor
      entities: [], // Will be extracted by EntityExtractor
      citations: [], // Will be extracted by CitationExtractor
      metadata,
      parsedAt: new Date(),
    };

    logger.debug(
      {
        sourceId: document.sourceId,
        title,
        documentType,
        metadataKeys: Object.keys(metadata),
      },
      '[XmlPolicyParser] Successfully parsed XML document'
    );

    return parsedDocument;
  }

  /**
   * Extract XML content from document
   * 
   * @param document - Canonical document
   * @returns XML content as string, or null if not found
   */
  private extractXmlContent(document: CanonicalDocument): string | null {
    // Extract parsing fields
    const parsingFields = DocumentMapper.extractParsingFields(document);

    // Try rawData first
    if (parsingFields.rawData && typeof parsingFields.rawData === 'string') {
      return parsingFields.rawData;
    }

    // Try sourceMetadata for XML files (DSO case)
    if (document.sourceMetadata && typeof document.sourceMetadata === 'object') {
      const metadata = document.sourceMetadata as Record<string, unknown>;
      
      // Check for XML content in metadata
      if (metadata.xmlContent && typeof metadata.xmlContent === 'string') {
        return metadata.xmlContent;
      }

      // For DSO documents, XML structure is in enrichmentMetadata.xmlMetadata
      // But the actual XML content would be in the artifact or sourceMetadata
      // For now, we'll use fullText as a fallback (it contains extracted text from XML)
      if (document.fullText) {
        // Note: fullText is already extracted text, not raw XML
        // For proper XML parsing, we'd need access to the raw XML files
        // This is a limitation we'll address when we have access to raw XML
        return null; // Can't parse from fullText alone
      }
    }

    return null;
  }

  /**
   * Parse XML structure
   * 
   * @param xmlContent - XML content as string
   * @returns Parsed XML object
   */
  private async parseXmlStructure(xmlContent: string): Promise<unknown> {
    try {
      const parsed = await parseStringPromise(xmlContent, {
        explicitArray: false,
        mergeAttrs: true,
        trim: true,
        normalize: true,
      });
      return parsed;
    } catch (error) {
      logger.error({ error }, '[XmlPolicyParser] Failed to parse XML structure');
      throw new Error(`XML parsing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract title from document or XML
   * 
   * @param document - Normalized document
   * @param parsedXml - Parsed XML structure
   * @returns Document title
   */
  private extractTitle(document: NormalizedDocument, parsedXml: unknown): string {
    // Prefer document title
    if (document.title) {
      return document.title;
    }

    // Try to extract from XML structure
    if (typeof parsedXml === 'object' && parsedXml !== null) {
      const obj = parsedXml as Record<string, unknown>;
      
      // Common XML title fields
      const titleFields = ['titel', 'Titel', 'title', 'Title', 'naam', 'Naam'];
      for (const field of titleFields) {
        if (obj[field] && typeof obj[field] === 'string') {
          return obj[field];
        }
      }

      // Try nested paths
      const nestedPaths = [
        ['metadata', 'titel'],
        ['Metadata', 'titel'],
        ['regeling', 'titel'],
        ['Regeling', 'titel'],
      ];

      for (const path of nestedPaths) {
        let current: unknown = obj;
        for (const part of path) {
          if (typeof current === 'object' && current !== null) {
            current = (current as Record<string, unknown>)[part];
          } else {
            break;
          }
        }
        if (typeof current === 'string' && current) {
          return current;
        }
      }
    }

    // Fallback
    return 'XML Document';
  }

  /**
   * Extract document type from document or XML
   * 
   * @param document - Normalized document
   * @param parsedXml - Parsed XML structure
   * @returns Document type
   */
  private extractDocumentType(document: NormalizedDocument, parsedXml: unknown): string | undefined {
    // Prefer document type from metadata (if not empty)
    const docType = document.metadata?.documentType as string | undefined;
    if (docType && docType.trim().length > 0) {
      return docType;
    }

    // Try to extract from XML structure
    if (typeof parsedXml === 'object' && parsedXml !== null) {
      const obj = parsedXml as Record<string, unknown>;
      
      // Common XML type fields at root level
      const typeFields = ['type', 'Type', 'soortWork', 'soort', 'documentType'];
      for (const field of typeFields) {
        if (obj[field] && typeof obj[field] === 'string') {
          return obj[field];
        }
      }

      // Try nested paths (metadata.type, regeling.metadata.type, etc.)
      const nestedPaths = [
        ['metadata', 'type'],
        ['Metadata', 'type'],
        ['regeling', 'metadata', 'type'],
        ['Regeling', 'metadata', 'type'],
        ['regeling', 'Metadata', 'type'],
        ['Regeling', 'Metadata', 'type'],
      ];

      for (const path of nestedPaths) {
        let current: unknown = obj;
        for (const part of path) {
          if (typeof current === 'object' && current !== null) {
            current = (current as Record<string, unknown>)[part];
          } else {
            break;
          }
        }
        if (typeof current === 'string' && current.trim().length > 0) {
          return current;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract metadata from document and XML
   * 
   * @param document - Normalized document
   * @param parsedXml - Parsed XML structure
   * @returns Extracted metadata
   */
  private extractMetadata(document: NormalizedDocument, parsedXml: unknown): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      source: document.source,
      sourceId: document.sourceId,
      parsedBy: 'XmlPolicyParser',
    };

    // Add document metadata from NormalizedDocument.metadata
    // Note: NormalizedDocument doesn't have sourceMetadata/enrichmentMetadata directly,
    // but they may be in the metadata object
    if (document.metadata) {
      if (document.metadata.sourceMetadata) {
        metadata.sourceMetadata = document.metadata.sourceMetadata;
      }
      if (document.metadata.enrichmentMetadata) {
        metadata.enrichmentMetadata = document.metadata.enrichmentMetadata;
      }
    }

    // Add XML structure metadata (root element, namespaces, etc.)
    if (typeof parsedXml === 'object' && parsedXml !== null) {
      const obj = parsedXml as Record<string, unknown>;
      
      // Extract root element name (filter out xml2js internal keys)
      const rootKeys = Object.keys(obj).filter(k => !k.startsWith('_') && k !== '$' && k !== 'declaration');
      if (rootKeys.length > 0) {
        metadata.xmlRootElement = rootKeys[0];
      }

      // Extract namespaces
      // xml2js stores attributes (including xmlns) in $ on the element
      const rootElement = rootKeys.length > 0 ? obj[rootKeys[0]] : null;
      if (rootElement && typeof rootElement === 'object' && rootElement !== null) {
        const rootObj = rootElement as Record<string, unknown>;
        if (rootObj.$ && typeof rootObj.$ === 'object') {
          const attrs = rootObj.$ as Record<string, unknown>;
          // Extract xmlns attributes (namespaces)
          const namespaces: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(attrs)) {
            if (key.startsWith('xmlns') || key.includes(':')) {
              namespaces[key] = value;
            }
          }
          if (Object.keys(namespaces).length > 0) {
            metadata.xmlNamespaces = namespaces;
          }
        }
      }
    }

    return metadata;
  }
}
