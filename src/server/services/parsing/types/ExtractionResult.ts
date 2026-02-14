/**
 * ExtractionResult - Result of an extraction operation
 * 
 * Generic type for results from extractors (rules, entities, citations).
 */

/**
 * Result of an extraction operation
 */
export interface ExtractionResult<T> {
  /** Extracted items */
  items: T[];
  /** Confidence score (0-1) */
  confidence: number;
  /** Extraction method used */
  extractionMethod: 'llm' | 'rule-based' | 'hybrid';
  /** Additional metadata about the extraction */
  metadata: Record<string, unknown>;
}
