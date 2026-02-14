import { BaseApiService } from './BaseApiService';
import type { BronDocument } from '../../utils/transformations';
import type { BronWebsite } from './BronWebsiteApiService';
export interface WorkflowDocument {
    _id?: string;
    id: string;
    name: string;
    description?: string;
    steps: Array<{
        id: string;
        name: string;
        action: string;
        params?: Record<string, unknown>;
        next?: string;
    }>;
    status: 'Draft' | 'Testing' | 'Tested' | 'Published' | 'Unpublished' | 'Deprecated';
    version: number;
    statusHistory: Array<{
        status: string;
        timestamp: string;
        userId?: string;
        comment?: string;
    }>;
    publishedBy?: string;
    publishedAt?: string;
    testMetrics?: {
        runCount: number;
        acceptanceRate: number;
        errorRate: number;
        lastTestRun?: string;
    };
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
}
export interface WorkflowOutput {
    metadata: {
        runId: string;
        workflowId: string;
        workflowName: string;
        startTime: string;
        endTime?: string;
        status: string;
        version: string;
    };
    parameters: Record<string, unknown>;
    trace: {
        workflowId: string;
        workflowName: string;
        runId: string;
        startTime: string;
        endTime?: string;
        status: string;
        steps: Array<{
            stepId: string;
            stepName: string;
            action: string;
            startTime: string;
            endTime?: string;
            status: string;
            urls?: string[];
        }>;
        totalUrlsVisited: number;
        totalDocumentsFound: number;
    };
    results: {
        summary: {
            totalPages: number;
            totalDocuments: number;
            newlyDiscovered: number;
            existing: number;
            errors: number;
        };
        webPages: Array<{
            url: string;
            title: string;
            type: string;
            status: string;
            visitedAt: string;
            depth: number;
            parentUrl?: string;
            filePath?: string;
        }>;
        documents: Array<{
            url: string;
            title: string;
            type: string;
            sourceUrl: string;
            relevanceScore?: number;
            discoveredAt: string;
            metadata?: Record<string, unknown>;
        }>;
        endpoints: Array<{
            url: string;
            title: string;
            type: string;
            sourceUrl: string;
            relevanceScore?: number;
        }>;
    };
    errors: Array<{
        timestamp: string;
        message: string;
        url?: string;
        stepId?: string;
    }>;
}
export interface Run {
    _id: string;
    type: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused' | 'completed_with_errors';
    startTime: string;
    endTime?: string;
    params: Record<string, unknown>;
    logs: Array<{
        id?: string;
        timestamp: string;
        level: string;
        message: string;
        formattedMessage?: string;
        thoughtBubble?: string;
        icon?: string;
        color?: string;
        metadata?: Record<string, unknown>;
    }>;
    result?: unknown;
    error?: string;
    outputPaths?: {
        jsonPath: string;
        markdownPath: string;
        txtPath: string;
        csvPath: string;
        htmlPath: string;
        xmlPath: string;
    };
}
/**
 * Workflow API service
 */
export declare class WorkflowApiService extends BaseApiService {
    getWorkflowOutputs(): Promise<{
        name: string;
        jsonPath: string;
        markdownPath: string;
        txtPath: string;
        createdAt: string;
    }[]>;
    downloadWorkflowOutput(name: string, format: 'json' | 'md' | 'txt'): Promise<void>;
    getWorkflowOutput(name: string): Promise<WorkflowOutput>;
    convertWorkflowOutputToDocuments(name: string, queryId: string): Promise<{
        message: string;
        documentsCreated: number;
        websitesCreated: number;
        documents: BronDocument[];
        websites: BronWebsite[];
    }>;
    getWorkflows(): Promise<WorkflowDocument[]>;
    getWorkflowById(id: string): Promise<WorkflowDocument>;
    getManagedWorkflows(status?: string): Promise<WorkflowDocument[]>;
    getManagedWorkflow(id: string): Promise<WorkflowDocument>;
    createWorkflow(workflow: {
        id: string;
        name: string;
        description?: string;
        steps: Array<{
            id: string;
            name: string;
            action: string;
            params?: Record<string, unknown>;
            next?: string;
        }>;
    }): Promise<WorkflowDocument>;
    updateWorkflow(id: string, updates: {
        name?: string;
        description?: string;
        steps?: Array<{
            id: string;
            name: string;
            action: string;
            params?: Record<string, unknown>;
            next?: string;
        }>;
    }): Promise<WorkflowDocument>;
    updateWorkflowStatus(id: string, status: string, comment?: string, runningInstanceBehavior?: 'complete' | 'cancel'): Promise<WorkflowDocument & {
        runningInstancesHandled?: {
            total: number;
            cancelled: number;
            completed: number;
        };
    }>;
    getRunningInstances(workflowId: string): Promise<{
        _id: string;
        status: string;
        startTime: string;
        params: Record<string, unknown>;
    }[]>;
    checkQualityGates(id: string): Promise<{
        passed: boolean;
        reasons: string[];
    }>;
    updateTestMetrics(id: string, metrics: {
        runCount: number;
        acceptanceRate: number;
        errorRate: number;
    }): Promise<WorkflowDocument>;
    getWorkflowHistory(id: string): Promise<{
        id: string;
        name: string;
        version: number;
        statusHistory: Array<{
            status: string;
            timestamp: string;
            userId?: string;
            comment?: string;
        }>;
        publishedBy?: string;
        publishedAt?: string;
        testMetrics?: {
            runCount: number;
            acceptanceRate: number;
            errorRate: number;
            lastTestRun?: string;
        };
    }>;
    previewRollback(id: string, version: number): Promise<{
        currentVersion: number;
        targetVersion: number;
        changes: Array<{
            field: string;
            current: unknown;
            previous: unknown;
        }>;
        warnings: string[];
    }>;
    rollbackWorkflow(id: string, version: number, comment?: string): Promise<{
        message: string;
        workflow: WorkflowDocument;
    }>;
    getVersionHistory(id: string, options?: {
        limit?: number;
        skip?: number;
    }): Promise<{
        versions: {
            version: number;
            status: string;
            publishedBy?: string;
            publishedAt?: string;
            changes?: string[];
        }[];
        total: number;
        hasMore: boolean;
    }>;
    deleteWorkflow(id: string): Promise<{
        message: string;
        workflow: WorkflowDocument;
    }>;
    getWorkflowModules(filters?: {
        query?: string;
        category?: string;
        tags?: string[];
        author?: string;
        published?: boolean;
        minVersion?: string;
    }): Promise<{
        modules: Array<{
            metadata: {
                id: string;
                name: string;
                version: string;
                description: string;
                category: string;
                author: {
                    name: string;
                    email?: string;
                    url?: string;
                };
                license: string;
                repository?: string;
                tags: string[];
                dependencies: Array<{
                    moduleId: string;
                    version?: string;
                    required?: boolean;
                }>;
                keywords?: string[];
                homepage?: string;
                icon?: string;
                published: boolean;
                createdAt: string;
                updatedAt: string;
                compatibility?: {
                    minEngineVersion?: string;
                    maxEngineVersion?: string;
                };
            };
            registeredAt: string;
            usageCount: number;
        }>;
        total: number;
        hasMore: boolean;
    }>;
    getWorkflowModule(id: string): Promise<{
        metadata: {
            id: string;
            name: string;
            version: string;
            description: string;
            category: string;
            author: {
                name: string;
                email?: string;
                url?: string;
            };
            license: string;
            repository?: string;
            tags: string[];
            dependencies: Array<{
                moduleId: string;
                version?: string;
                required?: boolean;
            }>;
            keywords?: string[];
            homepage?: string;
            icon?: string;
            published: boolean;
            createdAt: string;
            updatedAt: string;
            compatibility?: {
                minEngineVersion?: string;
                maxEngineVersion?: string;
            };
        };
        registeredAt: string;
        usageCount: number;
    }>;
    getWorkflowModuleSchema(id: string): Promise<Record<string, {
        type: "string" | "number" | "boolean" | "array" | "object";
        label: string;
        description?: string;
        required?: boolean;
        default?: unknown;
        options?: Array<{
            value: string | number;
            label: string;
        }>;
        validation?: {
            min?: number;
            max?: number;
            pattern?: string;
        };
    }>>;
    getWorkflowModulesByCategory(category: string): Promise<{
        modules: Array<{
            metadata: {
                id: string;
                name: string;
                version: string;
                description: string;
                category: string;
                author: {
                    name: string;
                    email?: string;
                    url?: string;
                };
                license: string;
                repository?: string;
                tags: string[];
                dependencies: Array<{
                    moduleId: string;
                    version?: string;
                    required?: boolean;
                }>;
                keywords?: string[];
                homepage?: string;
                icon?: string;
                published: boolean;
                createdAt: string;
                updatedAt: string;
                compatibility?: {
                    minEngineVersion?: string;
                    maxEngineVersion?: string;
                };
            };
            registeredAt: string;
            usageCount: number;
        }>;
        total: number;
        hasMore: boolean;
    }>;
    getModuleCategories(): Promise<{
        categories: string[];
    }>;
    getModuleTags(): Promise<{
        tags: string[];
    }>;
    getModuleStatistics(): Promise<{
        totalModules: number;
        publishedModules: number;
        categories: number;
        tags: number;
        authors: number;
        totalUsage: number;
    }>;
    /**
     * Get all workflows that use a specific module
     * This helps track module reuse across workflows (US-006 requirement)
     */
    getWorkflowsUsingModule(moduleId: string): Promise<{
        moduleId: string;
        moduleName: string;
        workflows: Array<{
            id: string;
            name: string;
            description?: string;
            status: string;
            version: number;
            stepsUsingModule: Array<{
                id: string;
                name: string;
                action: string;
                params?: Record<string, unknown>;
            }>;
        }>;
        total: number;
    }>;
    shareWorkflow(workflowId: string, userId?: string, teamId?: string, level?: 'owner' | 'editor' | 'runner' | 'viewer'): Promise<{
        workflowId: string;
        ownerId: string;
        visibility: "private" | "team" | "public";
        permissions: Array<{
            userId?: string;
            teamId?: string;
            level: string;
            grantedBy: string;
            grantedAt: string;
        }>;
    }>;
    removeWorkflowAccess(workflowId: string, userId: string): Promise<{
        message: string;
    }>;
    updateWorkflowPermission(workflowId: string, userId: string, level: 'owner' | 'editor' | 'runner' | 'viewer'): Promise<{
        workflowId: string;
        ownerId: string;
        visibility: "private" | "team" | "public";
        permissions: Array<{
            userId?: string;
            teamId?: string;
            level: string;
            grantedBy: string;
            grantedAt: string;
        }>;
    }>;
    transferWorkflowOwnership(workflowId: string, newOwnerId: string): Promise<{
        workflowId: string;
        ownerId: string;
        visibility: "private" | "team" | "public";
        permissions: Array<{
            userId?: string;
            teamId?: string;
            level: string;
            grantedBy: string;
            grantedAt: string;
        }>;
    }>;
    getWorkflowActivity(workflowId: string): Promise<{
        timestamp: string;
        userId: string;
        userName?: string;
        action: string;
        details?: string;
    }[]>;
    getSharedWorkflows(): Promise<{
        id: string;
        name: string;
        description?: string;
        myPermission?: "owner" | "editor" | "runner" | "viewer" | null;
    }[]>;
    getWorkflowPermissions(workflowId: string): Promise<{
        workflowId: string;
        ownerId: string;
        visibility: "private" | "team" | "public";
        permissions: Array<{
            userId?: string;
            teamId?: string;
            level: string;
            grantedBy: string;
            grantedAt: string;
            userName?: string;
            userEmail?: string;
        }>;
    }>;
    updateWorkflowVisibility(workflowId: string, visibility: 'private' | 'team' | 'public'): Promise<{
        workflowId: string;
        ownerId: string;
        visibility: "private" | "team" | "public";
        permissions: Array<{
            userId?: string;
            teamId?: string;
            level: string;
            grantedBy: string;
            grantedAt: string;
        }>;
    }>;
    runWorkflow(workflowId: string, params: {
        mode?: string;
        reviewMode?: boolean;
        query?: string;
        queryId?: string;
        selectedWebsites?: string[];
        overheidstype?: string;
        overheidsinstantie?: string;
        onderwerp?: string;
        thema?: string;
        randomness?: number;
        [key: string]: unknown;
    }): Promise<{
        runId: string;
    }>;
    getRecentRuns(limit?: number): Promise<Run[]>;
    getWorkflowQueueJobs(): Promise<{
        jobs: Array<{
            jobId: string;
            workflowId: string;
            runId?: string;
            status: "waiting" | "active" | "paused";
            createdAt: string;
            startedAt?: string;
            params: Record<string, unknown>;
        }>;
        count: number;
        waiting: number;
        active: number;
    }>;
    pauseQueueJob(jobId: string): Promise<{
        message: string;
        jobId: string;
    }>;
    resumeQueueJob(jobId: string): Promise<{
        message: string;
        jobId: string;
    }>;
    removeQueueJob(jobId: string): Promise<{
        message: string;
        jobId: string;
    }>;
    getRun(runId: string): Promise<Run>;
    getGraphStream(runId: string): Promise<{
        runId: string;
        timestamp: string;
        nodes: Array<{
            id: string;
            url: string;
            title: string;
            type: "page" | "section" | "document";
            children: string[];
            lastVisited?: string;
            hasChildren?: boolean;
            childCount?: number;
            score?: number;
            depth?: number;
        }>;
        childNodes?: Array<{
            id: string;
            url: string;
            title: string;
            type: "page" | "section" | "document";
            children: string[];
            lastVisited?: string;
            hasChildren?: boolean;
            childCount?: number;
            score?: number;
            depth?: number;
        }>;
        edges: Array<{
            source: string;
            target: string;
        }>;
        stats: {
            totalNodes: number;
            totalEdges: number;
            displayedNode?: string;
            childCount?: number;
            navigatedCount?: number;
        };
        message?: string;
    }>;
    pauseRun(runId: string): Promise<Run>;
    resumeRun(runId: string): Promise<Run>;
    cancelRun(runId: string): Promise<Run>;
    exportResults(documents: Array<{
        id: string;
        content: string;
        sourceUrl?: string;
        metadata?: Record<string, unknown>;
    }>, format: 'csv' | 'pdf', options?: {
        includeCitations?: boolean;
        citationFormat?: 'apa' | 'custom';
        searchParams?: {
            topic?: string;
            location?: string;
            jurisdiction?: string;
        };
    }): Promise<Blob>;
    emailExport(documents: Array<{
        id: string;
        content: string;
        sourceUrl?: string;
        metadata?: Record<string, unknown>;
    }>, recipients: string[], searchParams?: {
        topic?: string;
        location?: string;
        jurisdiction?: string;
    }, options?: {
        includeCitations?: boolean;
        citationFormat?: 'apa' | 'custom';
    }): Promise<{
        message: string;
        recipients: number;
    }>;
    getBenchmarkConfig(workflowId: string): Promise<{
        featureFlags?: Record<string, boolean>;
        params?: Record<string, unknown>;
        timeout?: number;
        maxRetries?: number;
        maxMemoryMB?: number;
        maxConcurrentRequests?: number;
        _source?: "custom" | "default" | null;
    }>;
    setBenchmarkConfig(workflowId: string, config: {
        featureFlags?: Record<string, boolean>;
        params?: Record<string, unknown>;
        timeout?: number;
        maxRetries?: number;
        maxMemoryMB?: number;
        maxConcurrentRequests?: number;
    }): Promise<{
        success: boolean;
        benchmarkConfig: {
            featureFlags?: Record<string, boolean>;
            params?: Record<string, unknown>;
            timeout?: number;
            maxRetries?: number;
            maxMemoryMB?: number;
            maxConcurrentRequests?: number;
        };
    }>;
}
