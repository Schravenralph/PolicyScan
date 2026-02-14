/**
 * Document Normalization Service
 * 
 * Normalizes CanonicalDocument objects to a consistent format for deduplication.
 * Handles URL normalization (canonicalUrl or sourceId), field standardization, and stable ID extraction.
 * 
 * Stable ID Priority:
 * 1. contentFingerprint (primary - SHA256 hash of normalized fullText)
 * 2. Normalized canonicalUrl (fallback)
 * 3. sourceId (fallback if canonicalUrl missing)
 */

import type { CanonicalDocument } from '../../contracts/types.js';
import { logger } from '../../utils/logger.js';

/**
 * Normalized document with stable identifiers
 */
export interface NormalizedDocument extends CanonicalDocument {
  /** Normalized URL for comparison (from canonicalUrl or sourceId) */
  normalizedUrl: string;
  /** Stable identifier extracted from document (contentFingerprint or normalized URL) */
  stableId?: string;
  /** Normalized title for comparison */
  normalizedTitle?: string;
}

/**
 * Service for normalizing documents for deduplication
 */
export class DocumentNormalizationService {
  /**
   * Normalizes a single document
   * 
   * @param document - Document to normalize
   * @returns Normalized document with stable identifiers
   */
  normalizeDocument(document: CanonicalDocument): NormalizedDocument {
    // Use canonicalUrl, fallback to sourceId if canonicalUrl is missing
    const urlToNormalize = document.canonicalUrl || document.sourceId || '';
    const normalizedUrl = this.normalizeUrl(urlToNormalize);
    const normalizedTitle = this.normalizeTitle(document.title || '');
    const stableId = this.extractStableId(document, normalizedUrl);

    return {
      ...document,
      normalizedUrl,
      normalizedTitle,
      stableId,
    };
  }

  /**
   * Normalizes multiple documents
   * 
   * @param documents - Array of documents to normalize
   * @returns Array of normalized documents
   */
  normalizeDocuments(documents: CanonicalDocument[]): NormalizedDocument[] {
    return documents.map(doc => this.normalizeDocument(doc));
  }

  /**
   * Normalizes URL for comparison
   * 
   * Strategy:
   * - Remove trailing slashes
   * - Convert to lowercase
   * - Remove common tracking parameters (utm_*, ref, source)
   * - Normalize protocol and hostname
   * 
   * @param url - URL to normalize
   * @returns Normalized URL
   */
  normalizeUrl(url: string): string {
    if (!url) {
      return '';
    }

    try {
      // Remove trailing slash and trim
      const trimmed = url.trim().replace(/\/$/, '');

      // Only try to parse as URL if it looks like a valid URL (case-insensitive)
      const lowerTrimmed = trimmed.toLowerCase();
      if (lowerTrimmed.startsWith('http://') || lowerTrimmed.startsWith('https://')) {
        // Parse URL first (before lowercasing, as URL constructor is case-sensitive)
        const urlObj = new URL(trimmed);

        // Normalize: lowercase protocol, hostname, pathname
        const protocol = urlObj.protocol.toLowerCase();
        const hostname = urlObj.hostname.toLowerCase();
        // Remove trailing slash from pathname, but keep root path as empty (not '/')
        const pathname = urlObj.pathname.toLowerCase().replace(/\/$/, '') || '';

        // Remove common URL parameters that don't affect content
        const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source', 'fbclid', 'gclid'];
        for (const param of paramsToRemove) {
          urlObj.searchParams.delete(param);
        }

        // Sort query parameters for consistent comparison
        const sortedParams = Array.from(urlObj.searchParams.entries())
          .sort(([a], [b]) => a.localeCompare(b));
        
        // Reconstruct normalized URL
        const search = sortedParams.length > 0
          ? '?' + sortedParams.map(([key, value]) => `${key}=${value}`).join('&')
          : '';
        
        const normalized = `${protocol}//${hostname}${pathname}${search}${urlObj.hash}`;
        return normalized;
      }

      // If not a full URL, return normalized lowercase version
      return trimmed.toLowerCase();
    } catch (error) {
      // If URL parsing fails, return normalized lowercase version
      logger.debug({ url, error }, 'URL normalization failed, using fallback');
      return url.trim().toLowerCase().replace(/\/$/, '');
    }
  }

  /**
   * Normalizes title for comparison
   * 
   * Strategy:
   * - Trim whitespace
   * - Convert to lowercase
   * - Remove extra spaces
   * - Remove common punctuation variations
   * 
   * @param title - Title to normalize
   * @returns Normalized title
   */
  normalizeTitle(title: string): string {
    if (!title) {
      return '';
    }

    return title
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s-]/g, '') // Remove punctuation except hyphens
      .trim();
  }

  /**
   * Extracts a stable identifier from a document
   * 
   * Strategy (in priority order):
   * 1. contentFingerprint (primary - SHA256 hash of normalized fullText, most reliable)
   * 2. Normalized canonicalUrl (fallback - consistent URL representation)
   * 3. sourceId (fallback if canonicalUrl missing)
   * 
   * @param document - Document to extract stable ID from
   * @param normalizedUrl - Pre-normalized URL (to avoid re-normalizing)
   * @returns Stable identifier or undefined
   */
  extractStableId(document: CanonicalDocument, normalizedUrl: string): string | undefined {
    // Priority 1: contentFingerprint (most reliable - SHA256 hash of normalized fullText)
    if (document.contentFingerprint) {
      return document.contentFingerprint;
    }

    // Priority 2: Normalized canonicalUrl (consistent URL representation)
    if (normalizedUrl) {
      return normalizedUrl;
    }

    // Priority 3: sourceId (fallback if canonicalUrl missing)
    if (document.sourceId) {
      return document.sourceId;
    }

    return undefined;
  }

  /**
   * Standardizes document fields
   * 
   * Ensures consistent format for:
   * - Dates (ISO format)
   * - Titles (trimmed)
   * - URLs (normalized canonicalUrl)
   * 
   * @param document - Document to standardize
   * @returns Standardized document
   */
  standardizeFields(document: CanonicalDocument): CanonicalDocument {
    const standardized = { ...document };

    // Standardize title (trim whitespace)
    if (standardized.title) {
      standardized.title = standardized.title.trim();
    }

    // Standardize dates.publishedAt (convert to ISO string if Date object)
    if (standardized.dates?.publishedAt) {
      const pubDate = standardized.dates.publishedAt;
      // Check if it's a Date object at runtime
      const toStringCall = Object.prototype.toString.call(pubDate);
      
      if (toStringCall === '[object Date]') {
        // If it's already a Date object, ensure it's valid
        const date = pubDate as Date;
        if (!isNaN(date.getTime())) {
          standardized.dates.publishedAt = date;
        }
      } else if (typeof pubDate === 'string') {
        // If it's a string, try to parse and validate
        try {
          const date = new Date(pubDate);
          if (!isNaN(date.getTime())) {
            standardized.dates.publishedAt = date;
          }
        } catch {
          // If parsing fails, keep original
        }
      }
    }

    // Standardize canonicalUrl (normalize if present)
    if (standardized.canonicalUrl) {
      standardized.canonicalUrl = this.normalizeUrl(standardized.canonicalUrl);
    }

    return standardized;
  }
}


