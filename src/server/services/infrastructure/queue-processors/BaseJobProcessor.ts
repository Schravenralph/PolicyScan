import Bull from 'bull';
import type {
  ScanJobData,
  EmbeddingJobData,
  ProcessingJobData,
  ExportJobData,
  WorkflowJobData,
  ScrapingJobData,
  ScanJobResult,
  EmbeddingJobResult,
  ProcessingJobResult,
  ExportJobResult,
  WorkflowJobResult,
  ScrapingJobResult,
} from '../../../types/job-data.js';
import type {
  JobStartedEvent,
  JobProgressEvent,
  JobStepEvent,
  JobCompletedEvent,
  JobFailedEvent,
} from '../../../types/progress.js';

/**
 * Base interface for job processors
 * Each processor handles a specific job type
 */
export interface JobProcessor<TJobData, TJobResult> {
  /**
   * Process a single job
   * @param job - The Bull job to process
   * @returns The job result
   */
  process(job: Bull.Job<TJobData>): Promise<TJobResult>;
}

/**
 * Type definitions for each processor
 */
export type ScanJobProcessor = JobProcessor<ScanJobData, ScanJobResult>;
export type EmbeddingJobProcessor = JobProcessor<EmbeddingJobData, EmbeddingJobResult>;
export type ProcessingJobProcessor = JobProcessor<ProcessingJobData, ProcessingJobResult>;
export type ExportJobProcessor = JobProcessor<ExportJobData, ExportJobResult>;
export type WorkflowJobProcessor = JobProcessor<WorkflowJobData, WorkflowJobResult>;
export type ScrapingJobProcessor = JobProcessor<ScrapingJobData, ScrapingJobResult>;

/**
 * Progress event emitter interface
 * Used by processors to emit progress events
 */
export interface ProgressEventEmitter {
  emitProgressEvent(
    event: JobStartedEvent | JobProgressEvent | JobStepEvent | JobCompletedEvent | JobFailedEvent
  ): Promise<void>;
}

/**
 * Performance metrics updater interface
 * Used by processors to update performance metrics
 */
export interface PerformanceMetricsUpdater {
  updatePerformanceMetrics(
    jobType: 'scanJobs' | 'embeddingJobs' | 'processingJobs' | 'exportJobs' | 'workflowJobs' | 'scrapingJobs',
    processingTime: number
  ): void;
}




