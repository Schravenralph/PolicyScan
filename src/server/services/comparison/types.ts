/**
 * Types for Document Comparison Service
 * 
 * @see docs/21-issues/WI-COMPARISON-001-structured-document-comparison.md
 */

import type { CanonicalDocument } from '../../contracts/types.js';

/**
 * Evidence bundle with citations
 */
export interface EvidenceBundle {
  documentId: string;
  chunks: ChunkEvidence[];
  citations: Citation[];
  confidence: number;
}

/**
 * Chunk evidence with relevance scoring
 */
export interface ChunkEvidence {
  chunkId: string;
  text: string;
  offsets: { start: number; end: number };
  relevanceScore: number;
}

/**
 * Citation reference
 */
export interface Citation {
  chunkId: string;
  text: string;
  offsets: { start: number; end: number };
  pageNumber?: number;
  section?: string;
}

/**
 * Concept delta (change description)
 */
export interface ConceptDelta {
  type: 'added' | 'removed' | 'modified' | 'conflicting';
  oldValue?: string;
  newValue?: string;
  changeDescription: string;
}

/**
 * Matched concept between two documents
 */
export interface MatchedConcept {
  concept: string; // e.g., "building height limit"
  normType: 'regulation' | 'requirement' | 'policy' | 'procedure';
  evidenceA: EvidenceBundle;
  evidenceB: EvidenceBundle;
  status: 'identical' | 'changed' | 'conflicting' | 'a-only' | 'b-only';
  delta?: ConceptDelta;
  confidence: number; // 0-1
  impact?: string;
}

/**
 * Document difference
 */
export interface DocumentDifference {
  category: 'regulation' | 'requirement' | 'policy' | 'procedure' | 'metadata';
  concept: string;
  status: 'a-only' | 'b-only' | 'changed' | 'conflicting';
  evidenceA?: EvidenceBundle;
  evidenceB?: EvidenceBundle;
  delta?: ConceptDelta;
  confidence: number; // 0-1
  impact: string;
}

/**
 * Comparison summary
 */
export interface ComparisonSummary {
  totalConcepts: number;
  identical: number;
  changed: number;
  conflicting: number;
  aOnly: number;
  bOnly: number;
  overallSimilarity: number; // 0-1
  keyDifferences: string[]; // Top 5 differences
}

/**
 * Comparison metadata
 */
export interface ComparisonMetadata {
  comparisonDate: Date;
  comparisonStrategy: 'semantic' | 'structured' | 'hybrid';
  extractionMethod: 'llm' | 'rule-based' | 'hybrid';
  processingTime: number; // milliseconds
}

/**
 * Document comparison result
 */
export interface DocumentComparison {
  documentA: CanonicalDocument;
  documentB: CanonicalDocument;
  comparisonId: string;
  matchedConcepts: MatchedConcept[];
  differences: DocumentDifference[];
  summary: ComparisonSummary;
  confidence: number; // Overall confidence (0-1)
  metadata: ComparisonMetadata;
}

/**
 * Extracted concept from a document
 */
export interface ExtractedConcept {
  concept: string;
  normType: 'regulation' | 'requirement' | 'policy' | 'procedure';
  value?: string; // The actual value/claim (e.g., "15 meters", "required", "prohibited")
  context: string; // Surrounding text context
  chunkIds: string[]; // Chunk IDs where this concept appears
  confidence: number; // 0-1
  metadata?: {
    section?: string;
    pageNumber?: number;
    legalReference?: string;
  };
}

/**
 * Concept matching result
 */
export interface ConceptMatch {
  conceptA: ExtractedConcept;
  conceptB?: ExtractedConcept; // undefined if A-only
  matchType: 'identical' | 'similar' | 'changed' | 'conflicting' | 'a-only' | 'b-only';
  similarity: number; // 0-1
  confidence: number; // 0-1
}

