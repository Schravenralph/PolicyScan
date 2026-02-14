/**
 * Document Normalizer
 * 
 * Normalizes RawDocument objects from adapters into NormalizedDocument objects.
 * This is part of the ingestion layer and works with RawDocument -> NormalizedDocument.
 * 
 * For workflow-level normalization of CanonicalDocument, see DocumentNormalizationService
 * in the workflow layer.
 */

import type { RawDocument } from '../types/RawDocument.js';
import type { NormalizedDocument } from '../types/NormalizedDocument.js';
import type { DocumentSource } from '../../../contracts/types.js';
import { logger } from '../../../utils/logger.js';

/**
 * Document normalizer for ingestion layer
 * 
 * Converts RawDocument (from adapters) to NormalizedDocument (for deduplication/parsing).
 */
export class DocumentNormalizer {
  /**
   * Normalize a single raw document
   * 
   * @param document - Raw document to normalize
   * @returns Normalized document
   */
  normalize(document: RawDocument): NormalizedDocument {
    const source = this.detectSource(document.url);
    const mimeType = this.detectMimeType(document);

    return {
      sourceId: document.id,
      sourceUrl: document.url,
      source,
      title: document.title || 'Untitled',
      content: document.content || '',
      mimeType,
      rawData: document,
      metadata: document.metadata || {},
    };
  }

  /**
   * Normalize multiple raw documents
   * 
   * @param documents - Array of raw documents to normalize
   * @returns Array of normalized documents
   */
  normalizeDocuments(documents: RawDocument[]): NormalizedDocument[] {
    return documents.map(doc => this.normalize(doc));
  }

  /**
   * Detect document source from URL
   * 
   * @param url - Document URL
   * @returns Detected document source
   */
  private detectSource(url: string): DocumentSource {
    if (!url) {
      return 'Web';
    }

    const lowerUrl = url.toLowerCase();

    // DSO detection
    if (lowerUrl.includes('ontsluiten.omgevingswet.overheid.nl') || 
        lowerUrl.includes('stelselcatalogus.omgevingswet.overheid.nl')) {
      return 'DSO';
    }

    // IPLO detection
    if (lowerUrl.includes('iplo.nl') || lowerUrl.includes('iplo')) {
      return 'IPLO';
    }

    // Rechtspraak detection
    if (lowerUrl.includes('rechtspraak.nl') || lowerUrl.includes('ecli')) {
      return 'Rechtspraak';
    }

    // Wetgeving detection
    if (lowerUrl.includes('wetten.nl') || lowerUrl.includes('officielebekendmakingen.nl')) {
      return 'Wetgeving';
    }

    // Gemeente detection
    if (lowerUrl.includes('gemeente') || lowerUrl.includes('.nl/gemeente')) {
      return 'Gemeente';
    }

    // PDOK detection
    if (lowerUrl.includes('pdok.nl') || lowerUrl.includes('pdok')) {
      return 'PDOK';
    }

    // Default to Web
    return 'Web';
  }

  /**
   * Detect MIME type from document
   * 
   * @param document - Raw document
   * @returns Detected MIME type
   */
  private detectMimeType(document: RawDocument): string {
    // Check metadata first
    if (document.metadata?.mimeType && typeof document.metadata.mimeType === 'string') {
      return document.metadata.mimeType;
    }

    // Detect from URL extension
    const url = document.url || '';
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.endsWith('.pdf')) {
      return 'application/pdf';
    }
    if (lowerUrl.endsWith('.xml') || lowerUrl.includes('.xml')) {
      return 'application/xml';
    }
    if (lowerUrl.endsWith('.html') || lowerUrl.endsWith('.htm')) {
      return 'text/html';
    }
    if (lowerUrl.endsWith('.json')) {
      return 'application/json';
    }
    if (lowerUrl.endsWith('.docx')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (lowerUrl.endsWith('.geojson')) {
      return 'application/geo+json';
    }

    // Default to text/html for web content
    return 'text/html';
  }
}
