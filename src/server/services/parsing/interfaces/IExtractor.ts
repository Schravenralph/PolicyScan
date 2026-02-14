/**
 * IExtractor - Extractor interface
 * 
 * Defines the contract for extractors that extract specific types of information
 * from documents (rules, entities, citations, metadata).
 */

import type { CanonicalDocument } from '../../../contracts/types.js';

/**
 * Generic extractor interface
 * 
 * Extractors extract specific types of information from documents.
 * Examples: RuleExtractor, EntityExtractor, CitationExtractor
 * 
 * @template T - Type of item being extracted (PolicyRule, BaseEntity, Citation, etc.)
 */
export interface IExtractor<T> {
  /**
   * Extract items from a document
   * 
   * @param document - Canonical document to extract from
   * @returns Array of extracted items
   */
  extract(document: CanonicalDocument): Promise<T[]>;
}
