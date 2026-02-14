/**
 * Progress Event Types for Queue Jobs
 * 
 * These types define the structure of progress events emitted during job execution
 */

/**
 * Job progress status
 */
export type JobProgressStatus = 
  | 'queued'
  | 'active'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

/**
 * Progress event types
 */
export type ProgressEventType = 
  | 'job_started'
  | 'job_progress'
  | 'job_step'
  | 'job_completed'
  | 'job_failed'
  | 'job_cancelled';

/**
 * Base progress event structure
 */
export interface BaseProgressEvent {
  type: ProgressEventType;
  jobId: string;
  jobType: 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping';
  timestamp: Date;
  queryId?: string;
}

/**
 * Job started event
 */
export interface JobStartedEvent extends BaseProgressEvent {
  type: 'job_started';
  data: {
    status: 'active';
    message: string;
  };
}

/**
 * Job progress event (percentage-based)
 */
export interface JobProgressEvent extends BaseProgressEvent {
  type: 'job_progress';
  data: {
    progress: number; // 0-100
    message?: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Job step event (step-by-step progress)
 */
export interface JobStepEvent extends BaseProgressEvent {
  type: 'job_step';
  data: {
    step: string;
    stepNumber?: number;
    totalSteps?: number;
    message: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Job completed event
 */
export interface JobCompletedEvent extends BaseProgressEvent {
  type: 'job_completed';
  data: {
    status: 'completed' | 'completed_with_errors';
    message: string;
    result?: unknown;
    metadata?: Record<string, unknown>;
    error?: string;
    errorDetails?: unknown;
  };
}

/**
 * Job failed event
 */
export interface JobFailedEvent extends BaseProgressEvent {
  type: 'job_failed';
  data: {
    status: 'failed';
    error: string;
    errorDetails?: unknown;
  };
}

/**
 * Job cancelled event
 */
export interface JobCancelledEvent extends BaseProgressEvent {
  type: 'job_cancelled';
  data: {
    status: 'cancelled';
    message: string;
  };
}

/**
 * Union type for all progress events
 */
export type ProgressEvent = 
  | JobStartedEvent
  | JobProgressEvent
  | JobStepEvent
  | JobCompletedEvent
  | JobFailedEvent
  | JobCancelledEvent;

/**
 * Progress document stored in MongoDB
 */
export interface ProgressDocument {
  _id?: string;
  jobId: string;
  jobType: 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping';
  queryId?: string;
  status: JobProgressStatus;
  progress: number; // 0-100
  currentStep?: string;
  stepNumber?: number;
  totalSteps?: number;
  message?: string;
  metadata?: Record<string, unknown>;
  error?: string;
  errorDetails?: unknown;
  result?: unknown;
  events: ProgressEvent[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/**
 * Progress query filters
 */
export interface ProgressQueryFilters {
  jobId?: string;
  jobType?: 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping';
  queryId?: string;
  status?: JobProgressStatus | JobProgressStatus[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  skip?: number;
}










