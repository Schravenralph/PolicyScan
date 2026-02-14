/**
 * Job Data Interfaces for QueueService
 * 
 * These interfaces define the data structure for different job types
 * that can be processed by the queue system.
 */

/**
 * Job Priority Levels
 * Higher numbers = higher priority
 */
export enum JobPriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 10,
  URGENT = 20,
}

/**
 * Schedule configuration for jobs
 */
export interface JobSchedule {
  /**
   * Delay in milliseconds before job starts (for one-time delayed jobs)
   */
  delay?: number;
  /**
   * Cron expression for recurring jobs (e.g., "0 9 * * *" for daily at 9 AM)
   * Supports standard cron format: minute hour day month dayOfWeek
   */
  cron?: string;
  /**
   * Start date/time for the schedule (ISO string)
   * For delayed jobs, this is when the delay starts counting
   * For recurring jobs, this is when the schedule becomes active
   */
  startDate?: string;
  /**
   * End date/time for the schedule (ISO string)
   * Recurring jobs will stop after this date
   */
  endDate?: string;
  /**
   * Number of times to repeat (for recurring jobs)
   * If not specified, job repeats indefinitely until endDate
   */
  repeatCount?: number;
}

/**
 * Scan Job Data
 * Used for website/document scanning operations
 */
export interface ScanJobData {
  queryId: string;
  onderwerp?: string;
  thema?: string;
  overheidslaag?: string;
  priority?: JobPriority;
  schedule?: JobSchedule;
}

/**
 * Embedding Job Data
 * Used for generating vector embeddings for documents
 */
export interface EmbeddingJobData {
  documentIds: string[];
  queryId?: string;
  priority?: JobPriority;
  schedule?: JobSchedule;
  options?: {
    model?: string;
    batchSize?: number;
    forceRegenerate?: boolean;
  };
}

/**
 * Processing Job Data
 * Used for document processing operations (e.g., metadata extraction, content analysis)
 */
export interface ProcessingJobData {
  documentIds: string[];
  queryId?: string;
  processingType: 'metadata' | 'content-analysis' | 'chunking' | 'full';
  priority?: JobPriority;
  schedule?: JobSchedule;
  options?: {
    extractMetadata?: boolean;
    analyzeContent?: boolean;
    chunkDocuments?: boolean;
    chunkSize?: number;
  };
}

/**
 * Export Job Data
 * Used for exporting documents/workflows in various formats
 */
export interface ExportJobData {
  queryId?: string;
  runId?: string;
  documentIds?: string[];
  /**
   * Direct documents array for async export (alternative to queryId/documentIds)
   * Documents are stored temporarily and processed asynchronously
   */
  documents?: Array<{
    _id?: string;
    url: string;
    title?: string;
    content?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  format: 'csv' | 'json' | 'markdown' | 'pdf' | 'xlsx' | 'tsv' | 'html' | 'xml';
  priority?: JobPriority;
  schedule?: JobSchedule;
  options?: {
    includeMetadata?: boolean;
    includeContent?: boolean;
    includeCitations?: boolean;
    citationFormat?: 'apa' | 'custom';
    emailRecipient?: string;
    searchParams?: {
      topic?: string;
      location?: string;
      jurisdiction?: string;
      [key: string]: unknown;
    };
    templateId?: string;
  };
}

/**
 * Workflow Job Data
 * Used for queuing workflow executions with modules
 */
export interface WorkflowJobData {
  workflowId: string;
  params: Record<string, unknown>;
  userId?: string;
  runId?: string; // Optional: if provided, use this runId instead of creating a new one
  priority?: JobPriority;
  schedule?: JobSchedule;
  options?: {
    reviewMode?: boolean;
  };
}

/**
 * Learning Job Data
 * Used for queuing learning cycle operations with progressive processing
 */
export interface LearningJobData {
  operation: 'full-cycle' | 'ranking-boosts' | 'discover-terms' | 'update-sources' | 'pattern-analysis';
  resumeFromProgressId?: string; // Resume from a previous progress state
  priority?: JobPriority;
  schedule?: JobSchedule;
  options?: {
    minFrequency?: number;
    batchSize?: number;
    maxDocuments?: number;
    maxInteractions?: number;
  };
}

/**
 * Scraping Job Data
 * Used for queuing individual website scraping operations
 */
export interface ScrapingJobData {
  websiteUrl: string;
  websiteTitle?: string;
  onderwerp: string;
  thema: string;
  queryId?: string;
  maxPages?: number;
  priority?: JobPriority;
  schedule?: JobSchedule;
  options?: {
    scraperType?: string;
    followLinks?: boolean;
    extractMetadata?: boolean;
  };
}

/**
 * Union type for all job data types
 */
export type JobData = ScanJobData | EmbeddingJobData | ProcessingJobData | ExportJobData | WorkflowJobData | LearningJobData | ScrapingJobData;

/**
 * Job type identifiers
 */
export type JobType = 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'learning' | 'scraping';

/**
 * Job result interfaces
 */

export interface ScanJobResult {
  success: boolean;
  documents: unknown[];
  suggestedSources: unknown[];
  progress?: unknown;
  error?: string;
}

export interface EmbeddingJobResult {
  success: boolean;
  documentsProcessed: number;
  embeddingsGenerated: number;
  errors?: Array<{ documentId: string; error: string }>;
}

export interface ProcessingJobResult {
  success: boolean;
  documentsProcessed: number;
  results: unknown[];
  errors?: Array<{ documentId: string; error: string }>;
}

export interface ExportJobResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  format: string;
  documentsExported: number;
  emailSent?: boolean;
  error?: string;
}

export interface WorkflowJobResult {
  success: boolean;
  runId: string;
  results?: unknown;
  error?: string;
}

export interface LearningJobResult {
  success: boolean;
  operation: string;
  progressId?: string; // ID for resuming if incomplete
  results?: {
    rankingBoosts?: unknown[];
    dictionaryUpdates?: unknown[];
    sourceUpdates?: unknown[];
    metrics?: unknown;
    patternEffectiveness?: unknown;
  };
  partial?: boolean; // True if operation was partially completed and can be resumed
  error?: string;
}

export interface ScrapingJobResult {
  success: boolean;
  websiteUrl: string;
  documents: unknown[];
  documentsFound: number;
  error?: string;
}

/**
 * Union type for all job results
 */
export type JobResult = ScanJobResult | EmbeddingJobResult | ProcessingJobResult | ExportJobResult | WorkflowJobResult | LearningJobResult | ScrapingJobResult;

