import { ObjectId } from 'mongodb';

export interface QueryDocument {
  _id?: ObjectId;
  overheidstype?: string;       // Government type (e.g., "Gemeente", "Provincie")
  overheidsinstantie?: string;  // Government instance (e.g., "Amsterdam", "Huizen")
  onderwerp: string;             // Subject/topic - what user is searching for
  websiteTypes: string[];        // Types of websites to search
  websiteUrls?: string[];        // URLs of selected websites
  documentUrls?: string[];       // URLs of found documents
  status?: 'draft' | 'completed'; // Draft or completed query set
  finalizedAt?: Date;            // Timestamp when draft was finalized
  createdAt: Date;
  updatedAt: Date;
}

export interface BronWebsiteDocument {
  _id?: ObjectId;
  titel: string;
  url: string;
  label: string;
  samenvatting: string;
  'relevantie voor zoekopdracht': string;
  accepted: boolean | null;
  subjects?: string[];
  themes?: string[];
  website_types?: string[];
  queryId?: ObjectId;
  qualityScore?: number; // Quality score from LearningService (0-1)
  deprecated?: boolean; // Whether the source is deprecated
  createdAt: Date;
  updatedAt: Date;
}

export interface BronDocumentDocument {
  _id?: ObjectId;
  titel: string;
  url: string;
  website_url: string;
  website_titel?: string;
  label: string;
  samenvatting: string;
  'relevantie voor zoekopdracht': string;
  type_document: string;
  publicatiedatum?: string | null;
  subjects?: string[];
  themes?: string[];
  accepted: boolean | null;
  queryId?: ObjectId;
  // Workflow metadata fields (for result persistence)
  workflowRunId?: ObjectId; // Workflow run ID that discovered this document
  workflowId?: string; // Workflow ID (e.g., 'beleidsscan-step-1-search-dso')
  stepId?: string; // Step ID within the workflow
  source?: string; // Source identifier (e.g., 'dso', 'iplo', 'officielebekendmakingen')
  discoveredAt?: Date; // Timestamp when document was discovered
  embedding?: number[]; // Vector embedding (384 dimensions for all-MiniLM-L6-v2)
  embeddingModel?: string; // Model that generated the embedding (e.g., "Xenova/all-MiniLM-L6-v2")
  embeddingGeneratedAt?: Date; // When the embedding was generated
  // Structured metadata fields (from metadata extraction)
  issuingAuthority?: string | null; // Issuing authority (municipality, province, etc.)
  documentStatus?: string | null; // Document status (draft, final, archived)
  metadataConfidence?: number; // Confidence score for extracted metadata (0-1)
  // Content change detection
  contentHash?: string; // SHA-256 hash of document content (title + summary + URL) for change detection
  lastContentChange?: Date; // Timestamp of last detected content change
  createdAt: Date;
  updatedAt: Date;
}

export interface QueryCreateInput {
  overheidstype?: string;       // Government type (e.g., "Gemeente", "Provincie")
  overheidsinstantie?: string;  // Government instance (e.g., "Amsterdam", "Huizen")
  onderwerp: string;             // Subject/topic - what user is searching for
  websiteTypes: string[];        // Types of websites to search
  websiteUrls?: string[];        // URLs of selected websites
  documentUrls?: string[];       // URLs of found documents
  status?: 'draft' | 'completed'; // Draft or completed query set
}

export interface BronWebsiteCreateInput {
  titel: string;
  url: string;
  label: string;
  samenvatting: string;
  'relevantie voor zoekopdracht': string;
  accepted?: boolean | null;
  subjects?: string[];
  themes?: string[];
  website_types?: string[];
  queryId?: string;
}

export interface BronDocumentCreateInput {
  titel: string;
  url: string;
  website_url: string;
  website_titel?: string;
  label: string;
  samenvatting: string;
  'relevantie voor zoekopdracht': string;
  type_document: string;
  publicatiedatum?: string | null;
  subjects?: string[];
  themes?: string[];
  accepted?: boolean | null;
  queryId?: string;
  // Workflow metadata fields (for result persistence)
  workflowRunId?: string; // Workflow run ID that discovered this document
  workflowId?: string; // Workflow ID (e.g., 'beleidsscan-step-1-search-dso')
  stepId?: string; // Step ID within the workflow
  source?: string; // Source identifier (e.g., 'dso', 'iplo', 'officielebekendmakingen')
  discoveredAt?: Date; // Timestamp when document was discovered
  embedding?: number[]; // Optional: for migration purposes
  embeddingModel?: string; // Optional: for migration purposes
  embeddingGeneratedAt?: Date; // Optional: for migration purposes
  // Structured metadata fields (from metadata extraction)
  issuingAuthority?: string | null; // Issuing authority (municipality, province, etc.)
  documentStatus?: string | null; // Document status (draft, final, archived)
  metadataConfidence?: number; // Confidence score for extracted metadata (0-1)
  // Content change detection
  contentHash?: string; // SHA-256 hash of document content for change detection
  lastContentChange?: Date; // Timestamp of last detected content change
}

export interface CommonCrawlQueryDocument {
  _id?: ObjectId;
  query: string;
  domainFilter: string;
  crawlId: string;
  status: 'pending' | 'approved' | 'rejected';
  userId?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommonCrawlQueryCreateInput {
  query: string;
  domainFilter?: string;
  crawlId: string;
  status?: 'pending' | 'approved' | 'rejected';
  userId?: string;
}

export interface CommonCrawlResultDocument {
  _id?: ObjectId;
  queryId: ObjectId;
  urlkey: string;
  timestamp: string;
  url: string;
  mime: string;
  status: string;
  digest: string;
  length: string;
  offset: string;
  filename: string;
  approved: boolean;
  bronDocumentId?: ObjectId;
  createdAt: Date;
}

export interface CommonCrawlResultCreateInput {
  queryId: string;
  urlkey: string;
  timestamp: string;
  url: string;
  mime: string;
  status: string;
  digest: string;
  length: string;
  offset: string;
  filename: string;
  approved?: boolean;
  bronDocumentId?: string;
}

export interface LearnedPatternDocument {
  _id?: ObjectId;
  pattern: string; // XPath, CSS selector, URL pattern, etc.
  patternType: 'xpath' | 'css' | 'url_pattern' | 'semantic';
  sourceUrl: string; // Where pattern was learned
  context: {
    domain: string;
    urlPattern?: string; // Regex pattern for matching URLs
    pageStructureHash?: string; // DOM structure hash for similarity
    errorType?: string; // Type of error that triggered learning
    errorMessage?: string; // Original error message
  };
  effectiveness: {
    successCount: number;
    failureCount: number;
    lastUsed?: Date;
    lastSuccess?: Date;
    lastFailure?: Date;
    confidence: number; // Calculated: successCount / (successCount + failureCount)
    averageMatchScore?: number; // Average similarity score when matched
  };
  metadata: {
    learnedAt: Date;
    learnedFrom: 'user_intervention' | 'auto_discovery' | 'manual';
    userId?: string;
    runId?: string;
    notes?: string;
  };
  status: 'active' | 'deprecated' | 'experimental';
  deprecatedAt?: Date;
  deprecatedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LearnedPatternCreateInput {
  pattern: string;
  patternType: 'xpath' | 'css' | 'url_pattern' | 'semantic';
  sourceUrl: string;
  context: {
    domain: string;
    urlPattern?: string;
    pageStructureHash?: string;
    errorType?: string;
    errorMessage?: string;
  };
  effectiveness?: {
    successCount?: number;
    failureCount?: number;
    lastUsed?: Date;
    lastSuccess?: Date;
    lastFailure?: Date;
    confidence?: number;
    averageMatchScore?: number;
  };
  metadata: {
    learnedFrom: 'user_intervention' | 'auto_discovery' | 'manual';
    userId?: string;
    runId?: string;
    notes?: string;
  };
  status?: 'active' | 'deprecated' | 'experimental';
  deprecatedAt?: Date;
  deprecatedReason?: string;
}

/**
 * Test History Document - Stores test run history in MongoDB
 * 
 * This schema tracks comprehensive test execution history including:
 * - Test file information
 * - Execution results and timing
 * - Environment details
 * - Git and CI/CD information
 * - Failure details and stack traces
 */
export interface TestHistoryDocument {
  _id?: ObjectId;
  // Test file information
  testFilePath: string; // Full path to the test file (e.g., "tests/e2e/login.test.ts")
  testFileName: string; // Just the filename (e.g., "login.test.ts")
  
  // Execution information
  executionTimestamp: Date; // When the test run started
  duration: number; // Duration in milliseconds
  
  // Test results
  results: {
    total: number; // Total number of tests
    passed: number; // Number of passed tests
    failed: number; // Number of failed tests
    skipped: number; // Number of skipped tests
    passRate: number; // Percentage of passed tests (0-100)
  };
  
  // Environment information
  environment: {
    os: string; // Operating system (e.g., "linux", "darwin", "win32")
    osVersion?: string; // OS version
    nodeVersion: string; // Node.js version (e.g., "v20.10.0")
    playwrightVersion?: string; // Playwright version if applicable
    jestVersion?: string; // Jest version if applicable
    architecture?: string; // CPU architecture (e.g., "x64", "arm64")
  };
  
  // Git information
  git?: {
    commitHash: string; // Git commit hash (full SHA)
    commitHashShort?: string; // Short commit hash (first 7 chars)
    branch: string; // Git branch name
    author?: string; // Commit author
    commitMessage?: string; // Commit message
    remoteUrl?: string; // Git remote URL
  };
  
  // CI/CD information
  ciCd?: {
    provider?: string; // CI/CD provider (e.g., "github-actions", "gitlab-ci", "jenkins")
    runId?: string; // CI/CD run ID
    workflowName?: string; // Workflow/job name
    buildNumber?: string; // Build number
    jobUrl?: string; // URL to the CI/CD job
    triggeredBy?: string; // Who/what triggered the run (e.g., "push", "pull_request", "schedule")
  };
  
  // Failure details
  failures?: Array<{
    testName: string; // Name of the failed test
    testFile: string; // File path of the failed test
    error: string; // Error message
    stackTrace?: string; // Full stack trace
    duration?: number; // Duration of this specific test in milliseconds
    screenshotPath?: string; // Path to screenshot if available
    videoPath?: string; // Path to video if available
  }>;
  
  // Additional metadata
  metadata?: {
    testRunner?: string; // Test runner used (e.g., "jest", "playwright", "vitest")
    shard?: string; // Test shard identifier if sharding was used
    parallel?: boolean; // Whether tests ran in parallel
    coverageEnabled?: boolean; // Whether coverage was collected
    coverageData?: {
      statements?: number;
      branches?: number;
      functions?: number;
      lines?: number;
    };
    tags?: string[]; // Test tags/categories
    [key: string]: unknown; // Allow additional metadata
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new test history record
 */
// Export WizardResult types
export type {
  WizardResult,
  WizardResultStatus,
  StepResult,
  StepResultStatus,
  WizardSummary,
  WizardDefinitionReference,
} from './WizardResult.js';

export interface TestHistoryCreateInput {
  testFilePath: string;
  testFileName?: string; // Optional, will be extracted from testFilePath if not provided
  executionTimestamp?: Date; // Optional, defaults to now
  duration: number;
  results: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate?: number; // Optional, will be calculated if not provided
  };
  environment: {
    os: string;
    osVersion?: string;
    nodeVersion: string;
    playwrightVersion?: string;
    jestVersion?: string;
    architecture?: string;
  };
  git?: {
    commitHash: string;
    commitHashShort?: string;
    branch: string;
    author?: string;
    commitMessage?: string;
    remoteUrl?: string;
  };
  ciCd?: {
    provider?: string;
    runId?: string;
    workflowName?: string;
    buildNumber?: string;
    jobUrl?: string;
    triggeredBy?: string;
  };
  failures?: Array<{
    testName: string;
    testFile: string;
    error: string;
    stackTrace?: string;
    duration?: number;
    screenshotPath?: string;
    videoPath?: string;
  }>;
  metadata?: {
    testRunner?: string;
    shard?: string;
    parallel?: boolean;
    coverageEnabled?: boolean;
    coverageData?: {
      statements?: number;
      branches?: number;
      functions?: number;
      lines?: number;
    };
    tags?: string[];
    [key: string]: unknown;
  };
}
