/**
 * Pipeline Result Type
 * 
 * Result type for pipeline execution.
 */

import type { ScoredDocument } from '../../scoring/types/ScoredDocument.js';
import type { Report } from '../../reporting/types/Report.js';

/**
 * Metadata for pipeline execution
 */
export interface PipelineMetadata {
  /** Pipeline name */
  pipelineName: string;
  /** Execution start time */
  startedAt: Date;
  /** Execution end time */
  completedAt: Date;
  /** Execution duration in milliseconds */
  duration: number;
  /** Number of documents processed */
  documentsProcessed?: number;
  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * Result of pipeline execution
 *
 * Generic type parameter TOut represents the type of output documents/data
 * produced by the pipeline (e.g., NormalizedDocument[], ScoredDocument[], Report).
 *
 * This eliminates metadata smuggling by ensuring pipelines return honest types.
 */
export interface PipelineResult<TOut = unknown> {
  /** Whether the pipeline execution was successful */
  success: boolean;
  /** Output documents/data produced by the pipeline */
  documents?: TOut[];
  /** Generated report (if pipeline includes reporting) */
  report?: Report;
  /** Pipeline execution metadata */
  metadata: PipelineMetadata;
  /** Errors encountered during execution (if any) */
  errors?: Array<{
    message: string;
    stack?: string;
    timestamp: Date;
  }>;
}

/**
 * Legacy type alias for backward compatibility during migration
 * @deprecated Use PipelineResult<ScoredDocument> instead
 */
export type LegacyPipelineResult = PipelineResult<ScoredDocument>;
