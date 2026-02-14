/**
 * Analysis Result Type
 * 
 * Result type for document analysis operations.
 */

import type { ScoredDocument } from '../../scoring/types/ScoredDocument.js';

/**
 * Summary of analysis results
 */
export interface AnalysisSummary {
  /** Total number of documents analyzed */
  totalDocuments: number;
  /** Average score across all documents */
  averageScore: number;
  /** Minimum score */
  minScore: number;
  /** Maximum score */
  maxScore: number;
  /** Number of documents above threshold */
  aboveThreshold?: number;
  /** Score distribution */
  scoreDistribution?: Array<{
    range: string;
    count: number;
  }>;
}

/**
 * Metadata for analysis operations
 */
export interface AnalysisMetadata {
  /** Query used for analysis */
  query?: string;
  /** Analysis strategy used */
  strategy?: string;
  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * Result of document analysis operation
 */
export interface AnalysisResult {
  /** Analyzed and scored documents */
  documents: ScoredDocument[];
  /** Analysis summary */
  analysis: AnalysisSummary;
  /** Timestamp when analysis was completed */
  analyzedAt: Date;
  /** Analysis operation metadata */
  metadata: AnalysisMetadata;
}
