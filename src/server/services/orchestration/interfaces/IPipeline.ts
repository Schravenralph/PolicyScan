/**
 * Pipeline Interface
 * 
 * Defines the contract for workflow pipelines.
 * Pipelines coordinate multiple layers to execute a complete workflow.
 *
 * Generic type parameters:
 * - TIn: Input type (typically PipelineInput, but can be specialized)
 * - TOut: Output type (e.g., NormalizedDocument, ScoredDocument, Report)
 *
 * This generic design ensures type safety and eliminates metadata smuggling
 * by requiring pipelines to return honest types in the documents field.
 */

import type { PipelineInput } from '../types/PipelineInput.js';
import type { PipelineResult } from '../types/PipelineResult.js';

/**
 * Interface for workflow pipelines
 *
 * @template TIn - Input type (defaults to PipelineInput)
 * @template TOut - Output type (the type of documents/data produced)
 */
export interface IPipeline<TIn = PipelineInput, TOut = unknown> {
  /**
   * Get the name of this pipeline
   *
   * @returns Pipeline name
   */
  getName(): string;

  /**
   * Execute the pipeline
   *
   * @param input - Pipeline input
   * @returns Pipeline result with output documents/data
   */
  execute(input: TIn): Promise<PipelineResult<TOut>>;
}

/**
 * Legacy non-generic interface for backward compatibility during migration
 * @deprecated Use IPipeline<TIn, TOut> instead
 */
export interface ILegacyPipeline {
  /**
   * Get the name of this pipeline
   *
   * @returns Pipeline name
   */
  getName(): string;

  /**
   * Execute the pipeline
   *
   * @param input - Pipeline input
   * @returns Pipeline result
   */
  execute(input: PipelineInput): Promise<PipelineResult>;
}
