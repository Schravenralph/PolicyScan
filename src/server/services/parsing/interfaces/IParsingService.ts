/**
 * IParsingService - Main parsing service interface
 * 
 * Defines the contract for the parsing layer orchestrator (PolicyParser).
 * This interface ensures clear separation of concerns and allows for
 * different parsing implementations.
 */

import type { CanonicalDocument } from '../../../contracts/types.js';
import type { ParsedDocument } from '../types/ParsedDocument.js';
import type { PolicyRule } from '../types/PolicyRule.js';
import type { Citation } from '../types/Citation.js';
import type { BaseEntity } from '../../../domain/ontology.js';

/**
 * Main parsing service interface
 * 
 * The PolicyParser implements this interface to provide unified parsing
 * functionality across all document formats.
 */
export interface IParsingService {
  /**
   * Parse a canonical document and extract all structured information
   * 
   * @param document - Canonical document to parse
   * @returns Parsed document with rules, entities, and citations
   */
  parse(document: CanonicalDocument): Promise<ParsedDocument>;

  /**
   * Extract policy rules from a document
   * 
   * @param document - Canonical document
   * @returns Array of extracted policy rules
   */
  extractRules(document: CanonicalDocument): Promise<PolicyRule[]>;

  /**
   * Extract entities from a document
   * 
   * @param document - Canonical document
   * @returns Array of extracted entities
   */
  extractEntities(document: CanonicalDocument): Promise<BaseEntity[]>;

  /**
   * Extract citations from a document
   * 
   * @param document - Canonical document
   * @returns Array of extracted citations
   */
  extractCitations(document: CanonicalDocument): Promise<Citation[]>;
}
