import { ObjectId } from 'mongodb';
export interface QueryDocument {
    _id?: ObjectId;
    overheidstype?: string;
    overheidsinstantie?: string;
    onderwerp: string;
    websiteTypes: string[];
    websiteUrls?: string[];
    documentUrls?: string[];
    status?: 'draft' | 'completed';
    finalizedAt?: Date;
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
    qualityScore?: number;
    deprecated?: boolean;
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
    workflowRunId?: ObjectId;
    workflowId?: string;
    stepId?: string;
    source?: string;
    discoveredAt?: Date;
    embedding?: number[];
    embeddingModel?: string;
    embeddingGeneratedAt?: Date;
    issuingAuthority?: string | null;
    documentStatus?: string | null;
    metadataConfidence?: number;
    contentHash?: string;
    lastContentChange?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export interface QueryCreateInput {
    overheidstype?: string;
    overheidsinstantie?: string;
    onderwerp: string;
    websiteTypes: string[];
    websiteUrls?: string[];
    documentUrls?: string[];
    status?: 'draft' | 'completed';
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
    workflowRunId?: string;
    workflowId?: string;
    stepId?: string;
    source?: string;
    discoveredAt?: Date;
    embedding?: number[];
    embeddingModel?: string;
    embeddingGeneratedAt?: Date;
    issuingAuthority?: string | null;
    documentStatus?: string | null;
    metadataConfidence?: number;
    contentHash?: string;
    lastContentChange?: Date;
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
    effectiveness: {
        successCount: number;
        failureCount: number;
        lastUsed?: Date;
        lastSuccess?: Date;
        lastFailure?: Date;
        confidence: number;
        averageMatchScore?: number;
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
    testFilePath: string;
    testFileName: string;
    executionTimestamp: Date;
    duration: number;
    results: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        passRate: number;
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
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Input for creating a new test history record
 */
export type { WizardResult, WizardResultStatus, StepResult, StepResultStatus, WizardSummary, WizardDefinitionReference, } from './WizardResult.js';
export interface TestHistoryCreateInput {
    testFilePath: string;
    testFileName?: string;
    executionTimestamp?: Date;
    duration: number;
    results: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        passRate?: number;
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
