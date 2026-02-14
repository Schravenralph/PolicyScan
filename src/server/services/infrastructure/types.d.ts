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
export type DocumentType = 'PDF' | 'Omgevingsvisie' | 'Omgevingsplan' | 'Bestemmingsplan' | 'Structuurvisie' | 'Beleidsregel' | 'Beleidsnota' | 'Verordening' | 'Visiedocument' | 'Rapport' | 'Besluit' | 'Beleidsdocument' | 'Webpagina';
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
export declare function toRelevanceScore(score: number): RelevanceScore;
/**
 * Validates ISO date string format (YYYY-MM-DD)
 * Returns null if invalid or empty
 */
export declare function toISODateString(date: string | null | undefined): string | null;
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
    hybridUrlPatterns?: string[];
    selectedWebsites?: string[];
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
    createdBy?: string;
    userId?: string;
    workflowId?: string;
    _id?: ObjectId;
    type: string;
    status: RunStatus;
    startTime: Date;
    endTime?: Date;
    params: Record<string, unknown>;
    logs: RunLog[];
    result?: Record<string, unknown>;
    output?: Record<string, unknown>;
    context?: Record<string, unknown>;
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
    action: string;
    params?: Record<string, unknown>;
    next?: string;
    reviewPoint?: boolean;
    reviewTimeout?: number;
    reviewTimeoutAction?: 'resume' | 'fail';
    condition?: string | boolean | ((context: Record<string, unknown>) => boolean);
    elseNext?: string;
    parallel?: string[];
    timeout?: number;
    /** Retry configuration for step-level retries (optional, default: no retries) */
    retry?: WorkflowStepRetryConfig;
    /** If true, step failures won't fail the entire workflow - errors are logged and workflow continues */
    continueOnError?: boolean;
    prerequisites?: string[];
    canGoBack?: boolean;
    canJumpTo?: boolean;
}
export interface Workflow {
    id: string;
    name: string;
    description?: string;
    steps: WorkflowStep[];
    timeout?: number;
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
    type: string;
    sourceUrl: string;
    relevanceScore?: number;
}
export interface WorkflowResult {
    summary: {
        totalProcessed: number;
        newlyDiscovered: number;
        existing: number;
        errors: number;
    };
    items: WorkflowResultItem[];
    endpoints: WorkflowResultEndpoint[];
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
    includedNodes: string[];
    excludedNodes: string[];
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
export type BlockType = 'explore_iplo' | 'scrape_websites' | 'score_relevance' | 'cross_reference_google' | 'cross_reference_commoncrawl' | 'ai_analyze' | 'ai_decide_loop' | 'filter_documents' | 'enhance_query';
export type BlockCategory = 'discovery' | 'scraping' | 'analysis' | 'filtering' | 'enhancement';
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
    config?: Record<string, unknown>;
}
export interface WorkflowBlockInstance {
    blockId: string;
    instanceId: string;
    config: Record<string, unknown>;
    position?: {
        x: number;
        y: number;
    };
}
export interface BlockConnection {
    fromInstanceId: string;
    fromOutputId: string;
    toInstanceId: string;
    toInputId: string;
}
export interface BlockBasedWorkflow extends Workflow {
    blocks: WorkflowBlockInstance[];
    connections: BlockConnection[];
    version?: string;
    createdBy?: string;
    createdAt?: Date;
    isCustom?: boolean;
}
