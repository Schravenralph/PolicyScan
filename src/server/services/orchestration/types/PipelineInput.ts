/**
 * Pipeline Input Type
 * 
 * Input type for pipeline execution.
 */

import type { DocumentSource } from '../../../contracts/types.js';

/**
 * Options for pipeline execution
 */
export interface PipelineOptions {
  /** Maximum number of documents to process */
  limit?: number;
  /** Date range for filtering */
  dateRange?: { start: Date; end: Date };
  /** Additional pipeline-specific options */
  [key: string]: unknown;
}

/**
 * Input for pipeline execution
 */
export interface PipelineInput {
  /** Query string for document discovery */
  query?: string;
  /** Subject/topic (Dutch: onderwerp) */
  onderwerp?: string;
  /** Theme/topic refinement (Dutch: thema) */
  thema?: string;
  /** Data sources to use */
  sources?: DocumentSource[];
  /** Pipeline execution options */
  options?: PipelineOptions;
  /** Additional input parameters */
  [key: string]: unknown;
}
