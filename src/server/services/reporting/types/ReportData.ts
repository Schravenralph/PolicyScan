/**
 * Report Data Type
 * 
 * Represents input data for report generation.
 */

import type { ScoredDocument } from '../../scoring/types/ScoredDocument.js';

/**
 * Score data for reporting
 */
export interface ScoreData {
  /** Document ID */
  documentId: string;
  /** Final score */
  finalScore: number;
  /** Factor scores */
  factorScores: {
    authority: number;
    semantic: number;
    keyword: number;
    recency: number;
    type: number;
    rules: number;
  };
  /** Timestamp when scored */
  scoredAt: Date;
}

/**
 * Category data for reporting
 */
export interface CategoryData {
  /** Category name */
  category: string;
  /** Documents in this category */
  documents: string[]; // Document IDs
  /** Count of documents */
  count: number;
}

/**
 * Input data for report generation
 */
export interface ReportData {
  /** Documents to include in report */
  documents?: ScoredDocument[];
  /** Score data (if documents not provided) */
  scores?: ScoreData[];
  /** Category data */
  categories?: CategoryData[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}
