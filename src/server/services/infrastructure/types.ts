// Use type-only import to avoid runtime dependency on bson.mjs
import type { ObjectId } from 'mongodb';
import { BronWebsiteCreateInput } from '../../types/index.js';
import type { CanonicalDocumentDraft } from '../../contracts/types.js';

export interface ScanProgress {
  status: 'idle' | 'scanning_iplo' | 'scanning_known_sources' | 'scanning_google' | 'completed' | 'error';
  currentStep: string;
  documentsFound: number;
  sourcesFound: number;
  error?: string;
}

export interface ScanResult {
  documents: CanonicalDocumentDraft[];
  suggestedSources: BronWebsiteCreateInput[];
  progress: ScanProgress;
  workflowResult?: WorkflowResult;
}

/**
 * Strict union type for document types
 * Ensures type safety when creating/updating documents
 */
export type DocumentType = 
    | 'PDF'
    | 'Omgevingsvisie'
    | 'Omgevingsplan'
    | 'Bestemmingsplan'
    | 'Structuurvisie'
    | 'Beleidsregel'
    | 'Beleidsnota'
    | 'Verordening'
    | 'Visiedocument'
    | 'Rapport'
    | 'Besluit'
    | 'Beleidsdocument'
    | 'Webpagina';

/**
 * ISO 8601 date string (YYYY-MM-DD format)
 * Used for publication dates
 */
export type ISODateString = string;

/**
 * Relevance score: number between 0 and 1 (inclusive)
 * Represents how relevant a document is to the search query
 */
export type RelevanceScore = number;

/**
 * Validates and normalizes a relevance score to 0-1 range
 */
export function toRelevanceScore(score: number): RelevanceScore {
    if (score < 0) return 0;
    if (score > 1) return 1;
    return score;
}

/**
 * Validates ISO date string format (YYYY-MM-DD)
 * Returns null if invalid or empty
 */
export function toISODateString(date: string | null | undefined): string | null {
    if (!date || typeof date !== 'string') return null;
    const trimmed = date.trim();
    if (!trimmed) return null;
    
    // Validate ISO format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        // Try to parse and convert
        const parsed = new Date(trimmed);
        if (isNaN(parsed.getTime())) {
            return null;
        }
        // Convert to ISO string and extract date part
        return parsed.toISOString().split('T')[0];
    }
    
    return trimmed.split('T')[0]; // Extract date part if includes time
}

/**
 * Source type for multi-source scraping support
 */
export type SourceType = 'iplo' | 'rijksoverheid' | 'gemeente' | 'provincie' | 'other';

/**
 * Authority level for government sources
 */
export type AuthorityLevel = 'national' | 'provincial' | 'municipal' | 'unknown';

/**
 * Scraped document from a website
 * All fields are required except optional ones marked with ?
 */
export interface ScrapedDocument {
  /** Document title */
  titel: string;
  /** Full URL to the document */
  url: string;
  /** Base URL of the website where document was found */
  website_url: string;
  /** Optional title of the website */
  website_titel?: string;
  /** Optional label/category for UI */
  label?: string;
  /** Summary/description of the document */
  samenvatting: string;
  /** Optional relevance explanation text (legacy key) */
  'relevantie voor zoekopdracht'?: string;
  /** Type of document - must be one of the DocumentType values */
  type_document: DocumentType;
  /** Publication date in ISO format (YYYY-MM-DD) or null */
  publicatiedatum: string | null;
  /** Optional subject tags */
  subjects?: string[];
  /** Optional theme tags */
  themes?: string[];
  /** Optional moderation status */
  accepted?: boolean | null;
  /** Optional embedding vector (for semantic search) */
  embedding?: number[];
  /** Optional embedding model identifier */
  embeddingModel?: string;
  /** Optional embedding generation timestamp */
  embeddingGeneratedAt?: Date;
  /** Relevance score between 0 and 1, optional */
  relevanceScore?: RelevanceScore;
  /** Semantic similarity between query and title+summary (0-1), optional */
  semanticSimilarity?: number;
  /** Source type (iplo, rijksoverheid, gemeente, etc.) - optional for backward compatibility */
  sourceType?: SourceType;
  /** Authority level (national, provincial, municipal) - optional for backward compatibility */
  authorityLevel?: AuthorityLevel;
  /** Municipality name if source is municipal - optional */
  municipalityName?: string;
  /** Province name if source is provincial - optional */
  provinceName?: string;
  /** Domain classification result - optional */
  domain?: string;
  /** Domain classification confidence (0-1) - optional */
  domainConfidence?: number;
  /** Domain classification matched keywords - optional */
  domainKeywords?: string[];
  /** Content quality scores - optional */
  contentQuality?: {
    relevance: number;
    completeness: number;
    informativeness: number;
    overall: number;
  };
  /** Detected language code (e.g., 'nl', 'en') - optional */
  language?: string;
  /** Timestamp when classification was performed - optional */
  classificationTimestamp?: string;
}

export interface ScrapedSource {
  titel: string;
  url: string;
  samenvatting: string;
  website_types: string[];
  subjects?: string[];
  themes?: string[];
}

export interface ScanParameters {
  queryId: ObjectId;
  overheidslaag: string;
  onderwerp: string;
  thema: string;
  zoeklocaties?: string[];
  customUrl?: string;
  mode?: 'dev' | 'prod' | 'hybrid';
  hybridUrlPatterns?: string[]; // For hybrid mode: URL patterns to explore
  selectedWebsites?: string[]; // IDs or URLs of selected websites to scan
}

export interface GoogleSearchResult {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
}

export interface IPLOThemeMapping {
  [key: string]: string;
}

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused' | 'timeout' | 'completed_with_errors';

export interface RunLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface Run {
    createdBy?: string; // User ID who created this run (for resource-level authorization)
    userId?: string; // Legacy field - use createdBy instead
    workflowId?: string;
  _id?: ObjectId;
  type: string; // e.g., 'scan', 'exploration', 'workflow'
  status: RunStatus;
  startTime: Date;
  endTime?: Date;
  params: Record<string, unknown>;
  logs: RunLog[];
  result?: Record<string, unknown>;
  output?: Record<string, unknown>; // Intermediate workflow output
  context?: Record<string, unknown>; // Workflow execution context
  error?: string;
  pausedState?: {
    stepId: string;
    context: Record<string, unknown>;
  };
  outputPaths?: {
    jsonPath: string;
    markdownPath: string;
    txtPath: string;
    csvPath: string;
    htmlPath: string;
    xmlPath: string;
  };
}

export interface WorkflowStepRetryConfig {
  /** Maximum number of retry attempts (default: 0, meaning no retries) */
  maxAttempts?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Exponential backoff multiplier (default: 2) */
  multiplier?: number;
  /** Whether to use circuit breaker for this step (default: false) */
  useCircuitBreaker?: boolean;
  /** Circuit breaker configuration (only used if useCircuitBreaker is true) */
  circuitBreakerConfig?: {
    failureThreshold?: number;
    successThreshold?: number;
    timeout?: number;
    resetTimeout?: number;
  };
}

export interface WorkflowStep {
  id: string;
  name: string;
  action: string; // Name of the action to execute
  params?: Record<string, unknown>;
  next?: string; // ID of the next step
  reviewPoint?: boolean; // If true, workflow pauses here for review in review mode
  reviewTimeout?: number; // Timeout in milliseconds for review point (optional, default: 7 days)
  reviewTimeoutAction?: 'resume' | 'fail'; // Action to take when review timeout expires (optional, default: 'fail')
  condition?: string | boolean | ((context: Record<string, unknown>) => boolean); // Condition to evaluate before executing step
  elseNext?: string; // ID of the next step if condition is false (optional conditional branching)
  parallel?: string[]; // Array of step IDs to execute in parallel (mutually exclusive with action)
  timeout?: number; // Timeout in milliseconds (optional, default: 30 minutes)
  /** Retry configuration for step-level retries (optional, default: no retries) */
  retry?: WorkflowStepRetryConfig;
  /** If true, step failures won't fail the entire workflow - errors are logged and workflow continues */
  continueOnError?: boolean;
  // Navigation properties (optional, for wizard navigation support)
  prerequisites?: string[]; // Step IDs that must be completed before this step can be accessed
  canGoBack?: boolean; // Allow going back from this step (default: true if not specified)
  canJumpTo?: boolean; // Allow jumping directly to this step (default: false if not specified)
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  timeout?: number; // Overall workflow timeout in milliseconds (default: 2 hours)
}

export interface WorkflowResultItem {
  url: string;
  title?: string;
  type: 'page' | 'section' | 'document';
  status: 'new' | 'existing' | 'updated' | 'error';
  metadata?: Record<string, unknown>;
}

export interface WorkflowResultEndpoint {
  url: string;
  title: string;
  type: string; // e.g., 'pdf', 'html'
  sourceUrl: string; // The page where this link was found
  relevanceScore?: number;
}

export interface WorkflowResult {
  summary: {
    totalProcessed: number;
    newlyDiscovered: number;
    existing: number;
    errors: number;
  };
  items: WorkflowResultItem[]; // Detailed log of items processed
  endpoints: WorkflowResultEndpoint[]; // The "documents" found
}

/**
 * Extended workflow result with output file paths
 * Note: Now stores all 9 formats (JSON, Markdown, TXT, CSV, HTML, XML, PDF, XLSX, TSV).
 */
export interface WorkflowOutputResult extends WorkflowResult {
  outputFiles?: {
    jsonPath: string;
    markdownPath: string;
    txtPath: string;
    csvPath: string;
    htmlPath: string;
    xmlPath: string;
    pdfPath: string;
    xlsxPath: string;
    tsvPath: string;
  };
}

/**
 * Workflow subgraph: a subset of the navigation graph tied to a specific workflow
 */
export interface WorkflowSubgraph {
  id: string;
  name: string;
  description?: string;
  workflowId?: string;
  runId?: string;
  queryId?: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'archived' | 'draft';
  
  // The nodes included in this subgraph (URLs)
  includedNodes: string[];
  
  // Nodes explicitly excluded (rejected by user)
  excludedNodes: string[];
  
  // Endpoints that have been approved/rejected
  approvedEndpoints: Array<{
    url: string;
    title: string;
    type: string;
    approvedAt: Date;
    approvedBy?: string;
  }>;
  
  rejectedEndpoints: Array<{
    url: string;
    title: string;
    reason?: string;
    rejectedAt: Date;
    rejectedBy?: string;
  }>;
  
  // Metadata for display
  metadata: {
    totalNodes: number;
    totalEndpoints: number;
    approvedCount: number;
    rejectedCount: number;
    pendingCount: number;
    rootUrl?: string;
    maxDepth?: number;
  };
}

// ============================================================================
// Block-Based Workflow System
// ============================================================================

export type BlockType = 
  | 'explore_iplo'
  | 'scrape_websites'
  | 'score_relevance'
  | 'cross_reference_google'
  | 'cross_reference_commoncrawl'
  | 'ai_analyze'
  | 'ai_decide_loop'
  | 'filter_documents'
  | 'enhance_query';

export type BlockCategory = 
  | 'discovery'
  | 'scraping'
  | 'analysis'
  | 'filtering'
  | 'enhancement';

export interface BlockInput {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  defaultValue?: unknown;
  description?: string;
}

export interface BlockOutput {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
}

export interface WorkflowBlock {
  id: string;
  type: BlockType;
  name: string;
  description?: string;
  icon?: string;
  category: BlockCategory;
  inputs: BlockInput[];
  outputs: BlockOutput[];
  config?: Record<string, unknown>; // Block-specific configuration schema
}

export interface WorkflowBlockInstance {
  blockId: string;
  instanceId: string; // Unique ID for this instance in the workflow
  config: Record<string, unknown>; // Instance-specific config values
  position?: { x: number; y: number }; // For UI positioning
}

export interface BlockConnection {
  fromInstanceId: string;
  fromOutputId: string;
  toInstanceId: string;
  toInputId: string;
}

// Enhanced Workflow interface supporting blocks
export interface BlockBasedWorkflow extends Workflow {
  blocks: WorkflowBlockInstance[];
  connections: BlockConnection[];
  version?: string;
  createdBy?: string;
  createdAt?: Date;
  isCustom?: boolean; // True if user-created, false if predefined
}
