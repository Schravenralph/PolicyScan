/**
 * PolicyRule - Extracted policy rule from a document
 * 
 * Represents a policy rule that has been extracted from a document during parsing.
 */

/**
 * Policy rule extracted from a document
 */
export interface PolicyRule {
  /** Unique identifier for the rule */
  id: string;
  /** Official identification (e.g., from XML) */
  identificatie?: string;
  /** Rule title */
  titel?: string;
  /** Rule type */
  type?: string;
  /** Rule content/text */
  content?: string;
  /** Source document identifier */
  sourceDocument: string;
  /** Timestamp when rule was extracted */
  extractedAt: Date;
}
