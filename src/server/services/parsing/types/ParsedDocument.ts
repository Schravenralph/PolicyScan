/**
 * ParsedDocument - Document with extracted structured information
 * 
 * This type represents a document after parsing has extracted rules, entities, and citations.
 * It is the output of the parsing layer and input to subsequent layers (evaluation, scoring).
 */

import type { BaseEntity } from '../../../domain/ontology.js';
import type { PolicyRule } from './PolicyRule.js';
import type { Citation } from './Citation.js';

/**
 * Parsed document with extracted structured information
 */
export interface ParsedDocument {
  /** Source identifier (from NormalizedDocument) */
  sourceId: string;
  /** Source URL (from NormalizedDocument) */
  sourceUrl: string;
  /** Document title */
  title: string;
  /** Document content/text */
  content: string;
  /** Document type (e.g., 'Omgevingsvisie', 'Verordening') */
  documentType?: string;
  /** Extracted policy rules */
  rules: PolicyRule[];
  /** Extracted entities (regulations, spatial units, land uses, etc.) */
  entities: BaseEntity[];
  /** Extracted citations */
  citations: Citation[];
  /** Additional metadata */
  metadata: Record<string, unknown>;
  /** Timestamp when parsing occurred */
  parsedAt: Date;
}
