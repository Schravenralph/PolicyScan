/**
 * IParser - Format-specific parser interface
 * 
 * Defines the contract for format-specific parsers (XML, HTML, Text, PDF).
 * Each parser handles a specific document format and extracts the document structure.
 */

import type { CanonicalDocument } from '../../../contracts/types.js';
import type { ParsedDocument } from '../types/ParsedDocument.js';

/**
 * Format-specific parser interface
 * 
 * Implementations handle parsing of specific document formats (XML, HTML, Text, PDF).
 * The parser extracts the document structure but not the rules/entities/citations
 * (those are extracted by extractors).
 */
export interface IParser {
  /**
   * Check if this parser can handle the given document
   * 
   * @param document - Canonical document to check
   * @returns true if this parser can parse the document
   */
  canParse(document: CanonicalDocument): boolean;

  /**
   * Parse the document structure
   * 
   * @param document - Canonical document to parse
   * @returns Parsed document with structure (rules/entities/citations will be empty, extracted separately)
   */
  parse(document: CanonicalDocument): Promise<ParsedDocument>;
}
