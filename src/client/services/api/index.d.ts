import { BaseApiService } from './BaseApiService';
import { AuthApiService } from './AuthApiService';
import { QueryApiService } from './QueryApiService';
import { BronWebsiteApiService } from './BronWebsiteApiService';
import { CanonicalDocumentApiService } from './CanonicalDocumentApiService';
import { FeedbackApiService } from './FeedbackApiService';
import { WorkflowApiService } from './WorkflowApiService';
import { NotificationApiService } from './NotificationApiService';
import { SubgraphApiService } from './SubgraphApiService';
import { CommonCrawlApiService } from './CommonCrawlApiService';
import { ReviewApiService } from './ReviewApiService';
import { AICrawlingApiService } from './AICrawlingApiService';
import { HierarchyApiService } from './HierarchyApiService';
import { ErrorMonitoringApiService } from './ErrorMonitoringApiService';
import { GraphApiService } from './GraphApiService';
import { SustainabilityApiService } from './SustainabilityApiService';
import { WizardApiService } from './WizardApiService';
import { ExportTemplateApiService } from './ExportTemplateApiService';
import { WorkflowConfigurationApiService } from './WorkflowConfigurationApiService';
import { KnowledgeGraphManagementApiService } from './KnowledgeGraphManagementApiService';
import type { QueryData } from './QueryApiService';
import type { BronWebsite } from './BronWebsiteApiService';
import type { User } from './AuthApiService';
import type { BronDocument } from '../../utils/transformations';
import type { UserInteraction, DocumentFeedback, QAFeedback } from '../../types/feedback';
import type { CanonicalDocument } from './CanonicalDocumentApiService';
export type { QueryData } from './QueryApiService';
export type { BronWebsite } from './BronWebsiteApiService';
export type { User } from './AuthApiService';
export type { BronDocument } from '../../utils/transformations';
export type { SustainabilityMetrics } from './SustainabilityApiService';
export type { SustainabilityKPI } from './SustainabilityApiService';
export type { MetaGraphResponse } from './GraphApiService';
export type { ClusterNode } from './GraphApiService';
export type { NavigationGraphResponse } from './GraphApiService';
export type { NavigationNode } from './GraphApiService';
export type { GraphHealthResponse } from './GraphApiService';
export type { GraphRAGQueryOptions } from './GraphApiService';
export type { GraphRAGResponse } from './GraphApiService';
export type { CanonicalDocument, CanonicalDocumentWithExtensions, CanonicalDocumentDraft, ArtifactRef, ArtifactProvenance, BundleFileEntry, ExtensionType, PaginationParams, DocumentFilterParams } from './CanonicalDocumentApiService';
export type { WorkflowDocument, WorkflowOutput, Run, } from './WorkflowApiService';
export type { Subgraph, SubgraphMetadata } from './SubgraphApiService';
export type { WorkflowComparison } from '../../hooks/useWorkflowComparison';
export type { ExportTemplate, ExportFormat, ExportTemplateCreateInput, ExportTemplateUpdateInput, TemplateValidationResult, } from './ExportTemplateApiService';
export type { WorkflowConfiguration, AvailableBeleidsscanWorkflow, ConfigurableFeatureFlag, WorkflowConfigurationCreateInput, WorkflowConfigurationUpdateInput, } from './WorkflowConfigurationApiService';
/**
 * Main API Service that composes all domain-specific services
 * Maintains backward compatibility with the original monolithic ApiService
 */
export declare class ApiService extends BaseApiService {
    patch<T>(endpoint: string, data?: unknown): Promise<T>;
    put<T>(endpoint: string, data?: unknown): Promise<T>;
    delete<T>(endpoint: string): Promise<T>;
    getCsrfToken(): Promise<string>;
    readonly auth: AuthApiService;
    readonly query: QueryApiService;
    readonly bronWebsite: BronWebsiteApiService;
    readonly canonicalDocument: CanonicalDocumentApiService;
    readonly feedback: FeedbackApiService;
    readonly workflow: WorkflowApiService;
    readonly notification: NotificationApiService;
    readonly subgraph: SubgraphApiService;
    readonly commonCrawl: CommonCrawlApiService;
    readonly review: ReviewApiService;
    readonly aiCrawling: AICrawlingApiService;
    readonly hierarchy: HierarchyApiService;
    readonly errorMonitoring: ErrorMonitoringApiService;
    readonly graph: GraphApiService;
    readonly sustainability: SustainabilityApiService;
    readonly wizard: WizardApiService;
    readonly exportTemplate: ExportTemplateApiService;
    readonly workflowConfiguration: WorkflowConfigurationApiService;
    readonly kgManagement: KnowledgeGraphManagementApiService;
    constructor();
    login(email: string, password: string): Promise<{
        message: string;
        user: User;
        token: string;
    }>;
    register(name: string, email: string, password: string, role: string): Promise<{
        message: string;
        user: User;
    }>;
    getMe(): Promise<{
        user: User;
    }>;
    logout(): Promise<{
        message: string;
    }>;
    createQuery(data: QueryData): Promise<{
        _id: string;
    } & QueryData>;
    getQueries(params?: {
        limit?: number;
        skip?: number;
    }): Promise<QueryData[]>;
    getQuery(id: string): Promise<QueryData>;
    triggerScan(queryId: string): Promise<{
        success: boolean;
        documentsFound: number;
        sourcesFound: number;
        progress: {
            status: string;
            currentStep: string;
            documentsFound: number;
            sourcesFound: number;
        };
        documents: BronDocument[];
        suggestedSources: BronWebsite[];
    }>;
    getScanStatus(queryId: string): Promise<{
        status: string;
        documentsFound: number;
        sourcesFound: number;
    }>;
    generateWebsiteSuggestions(queryId: string): Promise<{
        success: boolean;
        websites: BronWebsite[];
        metadata?: {
            aiSuggestionsCount: number;
            municipalityWebsiteIncluded: boolean;
            onlyMunicipalityWebsite: boolean;
        } | undefined;
    }>;
    getQueryProgress(queryId: string): Promise<{
        queryId: string;
        progress: number;
        status: "analyzing" | "searching" | "evaluating" | "generating" | "completed" | "error";
        estimatedSecondsRemaining?: number;
        currentStep?: string;
        totalSteps?: number;
        startedAt: number;
        lastUpdated: number;
        error?: string;
    }>;
    generateMockWebsiteSuggestions(queryId: string): Promise<{
        success: boolean;
        websites: BronWebsite[];
        isMock: boolean;
    }>;
    scrapeSelectedWebsites(queryId: string, websiteIds: string[]): Promise<{
        success: boolean;
        documents: BronDocument[];
        documentsFound: number;
    }>;
    getJurisdictions(): Promise<{
        municipalities: string[];
        waterschappen: string[];
        provincies: string[];
        signature: string;
        timestamp: string;
    }>;
    createBronWebsite(data: BronWebsite): Promise<BronWebsite>;
    createBronWebsites(data: BronWebsite[]): Promise<BronWebsite[]>;
    getBronWebsitesByQuery(queryId: string): Promise<BronWebsite[]>;
    getAllBronWebsites(): Promise<BronWebsite[]>;
    updateBronWebsiteAcceptance(id: string, accepted: boolean | null): Promise<BronWebsite>;
    /**
     * @deprecated Use canonicalDocument.createCanonicalDocument instead
     * This method converts legacy BronDocument format to canonical format
     */
    createBronDocument(data: BronDocument): Promise<CanonicalDocument>;
    /**
     * @deprecated Use canonicalDocument.createCanonicalDocument in a loop instead
     * This method converts legacy BronDocument[] format to canonical format
     */
    createBronDocuments(data: BronDocument[]): Promise<CanonicalDocument[]>;
    /**
     * @deprecated Use canonicalDocument.getCanonicalDocumentsByQuery instead
     */
    getBronDocumentsByQuery(queryId: string): Promise<CanonicalDocument[]>;
    /**
     * @deprecated Use canonicalDocument.updateCanonicalDocumentAcceptance instead
     */
    updateBronDocumentAcceptance(id: string, accepted: boolean | null): Promise<CanonicalDocument>;
    /**
     * @deprecated Use canonicalDocument.deleteCanonicalDocument instead
     */
    deleteBronDocument(id: string): Promise<void>;
    recordInteraction(interaction: UserInteraction): Promise<{
        success: boolean;
        feedbackId: string;
    }>;
    recordDocumentFeedback(feedback: DocumentFeedback): Promise<{
        success: boolean;
        feedbackId: string;
    }>;
    recordQAFeedback(feedback: QAFeedback): Promise<{
        success: boolean;
        feedbackId: string;
    }>;
    getDocumentFeedbackStats(documentId: string): Promise<import("../../types/feedback").DocumentFeedbackStats>;
    getQualityMetrics(minInteractions?: number, minDocuments?: number): Promise<{
        documentQuality: {
            documentId: string;
            clicks: number;
            accepts: number;
            rejects: number;
            rating: number;
            qualityScore: number;
        }[];
        sourceQuality: {
            sourceUrl: string;
            documentCount: number;
            averageRating: number;
            acceptanceRate: number;
            clickThroughRate: number;
            qualityScore: number;
        }[];
        termImportance: {
            term: string;
            frequency: number;
            averageRating: number;
            associatedAcceptRate: number;
            importanceScore: number;
        }[];
        overallCTR: number;
        overallAcceptanceRate: number;
    }>;
    runLearningCycle(): Promise<{
        success: boolean;
        result: {
            rankingBoosts: {
                documentId: string;
                boost: number;
                reason: string;
            }[];
            dictionaryUpdates: {
                term: string;
                synonyms: string[];
                confidence: number;
            }[];
            sourceUpdates: {
                sourceUrl: string;
                qualityScore: number;
                deprecated: boolean;
            }[];
            metrics: {
                documentQuality: {
                    documentId: string;
                    clicks: number;
                    accepts: number;
                    rejects: number;
                    rating: number;
                    qualityScore: number;
                }[];
                sourceQuality: {
                    sourceUrl: string;
                    documentCount: number;
                    averageRating: number;
                    acceptanceRate: number;
                    clickThroughRate: number;
                    qualityScore: number;
                }[];
                termImportance: {
                    term: string;
                    frequency: number;
                    averageRating: number;
                    associatedAcceptRate: number;
                    importanceScore: number;
                }[];
                overallCTR: number;
                overallAcceptanceRate: number;
            };
        };
        message: string;
    }>;
    getLearningCycleStatus(): Promise<{
        status: "idle" | "running" | "completed" | "failed" | "disabled";
        enabled?: boolean;
        message?: string;
        currentCycle?: {
            operationId: string;
            startTime: string;
        } | undefined;
        lastCycle?: {
            operationId: string;
            status: "completed" | "failed";
            completedAt: string;
            error?: string;
        } | undefined;
    }>;
    recoverLearningCycle(timeoutMinutes?: number): Promise<{
        success: boolean;
        recovered: number;
        message: string;
    }>;
    getLearningSchedulerStatus(): Promise<{
        enabled: boolean;
        tasks: Array<{
            id: string;
            name: string;
            enabled: boolean;
            lastRun?: string;
            nextRun?: string;
            status: "idle" | "running" | "failed";
            runningSince?: string;
            lastError?: string;
        }>;
    }>;
    recoverLearningScheduler(timeoutMinutes?: number): Promise<{
        success: boolean;
        recovered: number;
        message: string;
    }>;
    triggerScheduledTask(taskId: 'rankings' | 'dictionaries' | 'sources' | 'monthly-review'): Promise<{
        success: boolean;
        message: string;
        taskId: string;
    }>;
    getLearningCycleHistory(limit?: number, offset?: number): Promise<{
        cycles: {
            operationId: string;
            status: "completed" | "failed";
            startTime: string;
            endTime: string;
            duration: number;
            result?: {
                rankingBoostsCount: number;
                dictionaryUpdatesCount: number;
                sourceUpdatesCount: number;
                sourcesDeprecated: number;
                termsAdded: number;
                synonymsAdded: number;
                overallCTR: number;
                overallAcceptanceRate: number;
            } | undefined;
            error?: string;
        }[];
        total: number;
    }>;
    cancelLearningCycle(operationId?: string): Promise<{
        success: boolean;
        message: string;
        operationId: string;
    }>;
    getWorkflowOutputs(): Promise<{
        name: string;
        jsonPath: string;
        markdownPath: string;
        txtPath: string;
        createdAt: string;
    }[]>;
    downloadWorkflowOutput(name: string, format: 'json' | 'md' | 'txt'): Promise<void>;
    getWorkflowOutput(name: string): Promise<import("./WorkflowApiService").WorkflowOutput>;
    convertWorkflowOutputToDocuments(name: string, queryId: string): Promise<{
        message: string;
        documentsCreated: number;
        websitesCreated: number;
        documents: BronDocument[];
        websites: BronWebsite[];
    }>;
    getWorkflows(): Promise<import("./WorkflowApiService").WorkflowDocument[]>;
    getManagedWorkflows(status?: string): Promise<import("./WorkflowApiService").WorkflowDocument[]>;
    getManagedWorkflow(id: string): Promise<import("./WorkflowApiService").WorkflowDocument>;
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
    }): Promise<import("./WorkflowApiService").WorkflowDocument>;
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
    }): Promise<import("./WorkflowApiService").WorkflowDocument>;
    updateWorkflowStatus(id: string, status: string, comment?: string, runningInstanceBehavior?: 'complete' | 'cancel'): Promise<import("./WorkflowApiService").WorkflowDocument & {
        runningInstancesHandled?: {
            total: number;
            cancelled: number;
            completed: number;
        } | undefined;
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
    getWorkflowModules(filters?: {
        query?: string;
        category?: string;
        tags?: string[];
        author?: string;
        published?: boolean;
        minVersion?: string;
    }): Promise<{
        modules: {
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
                dependencies: {
                    moduleId: string;
                    version?: string;
                    required?: boolean;
                }[];
                keywords?: string[];
                homepage?: string;
                icon?: string;
                published: boolean;
                createdAt: string;
                updatedAt: string;
                compatibility?: {
                    minEngineVersion?: string;
                    maxEngineVersion?: string;
                } | undefined;
            };
            registeredAt: string;
            usageCount: number;
        }[];
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
            dependencies: {
                moduleId: string;
                version?: string;
                required?: boolean;
            }[];
            keywords?: string[];
            homepage?: string;
            icon?: string;
            published: boolean;
            createdAt: string;
            updatedAt: string;
            compatibility?: {
                minEngineVersion?: string;
                maxEngineVersion?: string;
            } | undefined;
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
        options?: {
            value: string | number;
            label: string;
        }[] | undefined;
        validation?: {
            min?: number;
            max?: number;
            pattern?: string;
        } | undefined;
    }>>;
    getWorkflowModulesByCategory(category: string): Promise<{
        modules: {
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
                dependencies: {
                    moduleId: string;
                    version?: string;
                    required?: boolean;
                }[];
                keywords?: string[];
                homepage?: string;
                icon?: string;
                published: boolean;
                createdAt: string;
                updatedAt: string;
                compatibility?: {
                    minEngineVersion?: string;
                    maxEngineVersion?: string;
                } | undefined;
            };
            registeredAt: string;
            usageCount: number;
        }[];
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
    getWorkflowsUsingModule(moduleId: string): Promise<{
        moduleId: string;
        moduleName: string;
        workflows: {
            id: string;
            name: string;
            description?: string;
            status: string;
            version: number;
            stepsUsingModule: {
                id: string;
                name: string;
                action: string;
                params?: Record<string, unknown>;
            }[];
        }[];
        total: number;
    }>;
    shareWorkflow(workflowId: string, userId?: string, teamId?: string, level?: 'owner' | 'editor' | 'runner' | 'viewer'): Promise<{
        workflowId: string;
        ownerId: string;
        visibility: "private" | "team" | "public";
        permissions: {
            userId?: string;
            teamId?: string;
            level: string;
            grantedBy: string;
            grantedAt: string;
        }[];
    }>;
    removeWorkflowAccess(workflowId: string, userId: string): Promise<{
        message: string;
    }>;
    updateWorkflowPermission(workflowId: string, userId: string, level: 'owner' | 'editor' | 'runner' | 'viewer'): Promise<{
        workflowId: string;
        ownerId: string;
        visibility: "private" | "team" | "public";
        permissions: {
            userId?: string;
            teamId?: string;
            level: string;
            grantedBy: string;
            grantedAt: string;
        }[];
    }>;
    transferWorkflowOwnership(workflowId: string, newOwnerId: string): Promise<{
        workflowId: string;
        ownerId: string;
        visibility: "private" | "team" | "public";
        permissions: {
            userId?: string;
            teamId?: string;
            level: string;
            grantedBy: string;
            grantedAt: string;
        }[];
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
        permissions: {
            userId?: string;
            teamId?: string;
            level: string;
            grantedBy: string;
            grantedAt: string;
            userName?: string;
            userEmail?: string;
        }[];
    }>;
    updateWorkflowVisibility(workflowId: string, visibility: 'private' | 'team' | 'public'): Promise<{
        workflowId: string;
        ownerId: string;
        visibility: "private" | "team" | "public";
        permissions: {
            userId?: string;
            teamId?: string;
            level: string;
            grantedBy: string;
            grantedAt: string;
        }[];
    }>;
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
    updateTestMetrics(id: string, metrics: {
        runCount: number;
        acceptanceRate: number;
        errorRate: number;
    }): Promise<import("./WorkflowApiService").WorkflowDocument>;
    getWorkflowHistory(id: string): Promise<{
        id: string;
        name: string;
        version: number;
        statusHistory: {
            status: string;
            timestamp: string;
            userId?: string;
            comment?: string;
        }[];
        publishedBy?: string;
        publishedAt?: string;
        testMetrics?: {
            runCount: number;
            acceptanceRate: number;
            errorRate: number;
            lastTestRun?: string;
        } | undefined;
    }>;
    previewRollback(id: string, version: number): Promise<{
        currentVersion: number;
        targetVersion: number;
        changes: {
            field: string;
            current: unknown;
            previous: unknown;
        }[];
        warnings: string[];
    }>;
    rollbackWorkflow(id: string, version: number, comment?: string): Promise<{
        message: string;
        workflow: import("./WorkflowApiService").WorkflowDocument;
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
        workflow: import("./WorkflowApiService").WorkflowDocument;
    }>;
    getRecentRuns(limit?: number): Promise<import("./WorkflowApiService").Run[]>;
    /**
     * Run a workflow
     *
     * @param workflowId - The workflow ID to run
     * @param params - Workflow parameters (flexible - backend accepts any parameters via passthrough)
     *                 Common parameters: mode, query, queryId, selectedWebsites, onderwerp, overheidsinstantie, etc.
     */
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
    getRun(runId: string): Promise<import("./WorkflowApiService").Run>;
    pauseRun(runId: string): Promise<import("./WorkflowApiService").Run>;
    resumeRun(runId: string): Promise<import("./WorkflowApiService").Run>;
    cancelRun(runId: string): Promise<import("./WorkflowApiService").Run>;
    getNotifications(options?: {
        limit?: number;
        skip?: number;
        read?: boolean;
    }): Promise<{
        notification_id: string;
        user_id: string;
        type: "workflow_complete" | "workflow_failed" | "workflow_shared" | "system_maintenance" | "new_relevant_documents";
        title: string;
        message: string;
        link?: string;
        read: boolean;
        created_at: string;
        metadata?: Record<string, unknown>;
    }[]>;
    getUnreadNotificationCount(): Promise<{
        count: number;
    }>;
    markNotificationAsRead(notificationId: string): Promise<{
        notification_id: string;
        user_id: string;
        type: string;
        title: string;
        message: string;
        link?: string;
        read: boolean;
        created_at: string;
        metadata?: Record<string, unknown>;
    }>;
    markAllNotificationsAsRead(): Promise<{
        message: string;
        count: number;
    }>;
    deleteNotification(notificationId: string): Promise<{
        message: string;
    }>;
    getSubgraphs(options?: {
        limit?: number;
        skip?: number;
        status?: string;
    }): Promise<{
        subgraphs: import("./SubgraphApiService").Subgraph[];
        total: number;
    }>;
    getCurrentSubgraph(): Promise<import("./SubgraphApiService").Subgraph>;
    getSubgraph(id: string): Promise<import("./SubgraphApiService").Subgraph>;
    getSubgraphNodes(id: string): Promise<{
        subgraphId: string;
        name: string;
        nodes: {
            url: string;
            exists: boolean;
            title?: string;
            type?: string;
            filePath?: string;
            childCount?: number;
            status: "approved" | "rejected" | "pending";
        }[];
        metadata: import("./SubgraphApiService").SubgraphMetadata;
    }>;
    createSubgraph(data: {
        name: string;
        description?: string;
        workflowId?: string;
        runId?: string;
        queryId?: string;
        includedNodes?: string[];
        rootUrl?: string;
        maxDepth?: number;
    }): Promise<import("./SubgraphApiService").Subgraph>;
    createSubgraphFromGraph(data: {
        name: string;
        description?: string;
        startNode?: string;
        maxDepth?: number;
        maxNodes?: number;
        urlPattern?: string;
        queryId?: string;
    }): Promise<{
        subgraph: import("./SubgraphApiService").Subgraph;
        metadata: {
            totalNodesInGraph: number;
            nodesSelected: number;
            startNode: string;
        };
    }>;
    updateSubgraph(id: string, data: {
        name?: string;
        description?: string;
        status?: string;
    }): Promise<import("./SubgraphApiService").Subgraph>;
    addNodesToSubgraph(id: string, urls: string[]): Promise<import("./SubgraphApiService").Subgraph>;
    removeNodesFromSubgraph(id: string, urls: string[]): Promise<import("./SubgraphApiService").Subgraph>;
    approveEndpoint(subgraphId: string, endpoint: {
        url: string;
        title: string;
        type?: string;
    }): Promise<import("./SubgraphApiService").Subgraph>;
    rejectEndpoint(subgraphId: string, endpoint: {
        url: string;
        title: string;
        reason?: string;
    }): Promise<import("./SubgraphApiService").Subgraph>;
    resetEndpoint(subgraphId: string, url: string): Promise<import("./SubgraphApiService").Subgraph>;
    activateSubgraph(id: string): Promise<import("./SubgraphApiService").Subgraph>;
    archiveSubgraph(id: string): Promise<import("./SubgraphApiService").Subgraph>;
    deleteSubgraph(id: string): Promise<{
        message: string;
    }>;
    getSubgraphsByQuery(queryId: string): Promise<import("./SubgraphApiService").Subgraph[]>;
    queryCommonCrawl(params: {
        query: string;
        domainFilter?: string;
        crawlId?: string;
        limit?: number;
    }): Promise<{
        results: {
            urlkey: string;
            timestamp: string;
            url: string;
            mime: string;
            status: string;
            digest: string;
            length: string;
            offset: string;
            filename: string;
        }[];
        total: number;
        crawlId: string;
        query: string;
    }>;
    getCommonCrawlCrawls(): Promise<{
        id: string;
        name: string;
        date: string;
    }[]>;
    validateCrawlId(crawlId: string): Promise<{
        isValid: boolean;
        suggestions?: string[];
    }>;
    saveCommonCrawlQuery(params: {
        query: string;
        domainFilter?: string;
        crawlId: string;
        status?: 'pending' | 'approved' | 'rejected';
    }): Promise<{
        _id: string;
        query: string;
        domainFilter: string;
        crawlId: string;
        status: string;
        createdAt: string;
        updatedAt: string;
    }>;
    getCommonCrawlQueries(params?: {
        status?: 'pending' | 'approved' | 'rejected';
        page?: number;
        limit?: number;
        skip?: number;
    }): Promise<{
        _id: string;
        query: string;
        domainFilter: string;
        crawlId: string;
        status: string;
        resultCount: number;
        createdAt: string;
        updatedAt: string;
    }[]>;
    getCommonCrawlQuery(queryId: string): Promise<{
        _id: string;
        query: string;
        domainFilter: string;
        crawlId: string;
        status: string;
        resultCount: number;
        createdAt: string;
        updatedAt: string;
    }>;
    saveCommonCrawlResults(queryId: string, results: Array<{
        urlkey: string;
        timestamp: string;
        url: string;
        mime: string;
        status: string;
        digest: string;
        length: string;
        offset: string;
        filename: string;
    }>): Promise<{
        message: string;
        saved: number;
        skipped: number;
    }>;
    getCommonCrawlResults(queryId: string, params?: {
        approved?: boolean;
        limit?: number;
        skip?: number;
    }): Promise<{
        _id: string;
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
        approved: boolean;
        createdAt: string;
    }[]>;
    approveCommonCrawlResult(resultId: string): Promise<{
        _id: string;
        approved: boolean;
    }>;
    approveCommonCrawlResults(resultIds: string[]): Promise<{
        message: string;
        approved: number;
    }>;
    deleteCommonCrawlQuery(queryId: string): Promise<{
        message: string;
    }>;
    getReview(runId: string, moduleId?: string): Promise<unknown>;
    getAllReviews(runId: string): Promise<unknown[]>;
    reviewCandidate(reviewId: string, candidateId: string, status: 'accepted' | 'rejected', notes?: string): Promise<{
        message: string;
    }>;
    reviewCandidates(reviewId: string, decisions: Array<{
        candidateId: string;
        status: 'accepted' | 'rejected';
    }>): Promise<{
        message: string;
    }>;
    completeReview(reviewId: string, workflowId: string): Promise<{
        message: string;
    }>;
    getReviewStatistics(workflowId: string): Promise<{
        totalReviews: number;
        totalAccepted: number;
        totalRejected: number;
        acceptanceRate: number;
        patterns: {
            urlPattern: string;
            acceptanceRate: number;
            count: number;
        }[];
    }>;
    getReviewHistory(workflowId: string, limit?: number): Promise<unknown[]>;
    getReviewStats(reviewId: string): Promise<{
        total: number;
        accepted: number;
        rejected: number;
        pending: number;
    }>;
    getPendingReviews(runId: string): Promise<unknown[]>;
    deleteReview(reviewId: string): Promise<{
        message: string;
    }>;
    deleteReviewsByRun(runId: string): Promise<{
        message: string;
        deletedCount: number;
    }>;
    getAICrawlingConfig(siteUrl?: string, queryConfig?: Record<string, unknown>): Promise<{
        scope: string;
        aggressiveness: "low" | "medium" | "high";
        strategy: "site_search" | "ai_navigation" | "traditional" | "auto";
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: "traditional" | "skip";
        enabled: boolean;
    }>;
    getAICrawlingConfigs(filters?: {
        scope?: 'global' | 'site' | 'query';
        siteUrl?: string;
        enabled?: boolean;
        limit?: number;
        skip?: number;
    }): Promise<{
        _id?: string;
        scope: "global" | "site" | "query";
        siteUrl?: string;
        aggressiveness: "low" | "medium" | "high";
        strategy: "site_search" | "ai_navigation" | "traditional" | "auto";
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: "traditional" | "skip";
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
        createdBy?: string;
    }[]>;
    getAICrawlingConfigById(id: string): Promise<{
        _id?: string;
        scope: "global" | "site" | "query";
        siteUrl?: string;
        aggressiveness: "low" | "medium" | "high";
        strategy: "site_search" | "ai_navigation" | "traditional" | "auto";
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: "traditional" | "skip";
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
        createdBy?: string;
    }>;
    createAICrawlingConfig(config: {
        scope: 'global' | 'site' | 'query';
        siteUrl?: string;
        aggressiveness: 'low' | 'medium' | 'high';
        strategy: 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: 'traditional' | 'skip';
        enabled?: boolean;
    }): Promise<{
        _id?: string;
        scope: "global" | "site" | "query";
        siteUrl?: string;
        aggressiveness: "low" | "medium" | "high";
        strategy: "site_search" | "ai_navigation" | "traditional" | "auto";
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: "traditional" | "skip";
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
        createdBy?: string;
    }>;
    updateAICrawlingConfig(id: string, updates: {
        aggressiveness?: 'low' | 'medium' | 'high';
        strategy?: 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        enabled?: boolean;
    }): Promise<{
        _id?: string;
        scope: "global" | "site" | "query";
        siteUrl?: string;
        aggressiveness: "low" | "medium" | "high";
        strategy: "site_search" | "ai_navigation" | "traditional" | "auto";
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: "traditional" | "skip";
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
        createdBy?: string;
    }>;
    deleteAICrawlingConfig(id: string): Promise<void>;
    getGlobalAICrawlingConfig(): Promise<{
        scope: "global";
        aggressiveness: "low" | "medium" | "high";
        strategy: "site_search" | "ai_navigation" | "traditional" | "auto";
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: "traditional" | "skip";
        enabled: boolean;
    }>;
    getDocumentExplanation(documentUrl: string): Promise<{
        explanation: string;
        detailedExplanation: string;
        strategy: string;
        confidence?: number;
        reasoning?: string;
        traceId?: string;
        baseUrl?: string;
        query?: string;
        crawlDate?: Date;
        decisionPath?: Array<{
            step: number;
            decisionType: string;
            reasoning?: string;
            timestamp?: Date;
        }>;
    } | null>;
    getAICrawlingTrace(sessionId: string): Promise<{
        trace: {
            _id?: string;
            sessionId: string;
            baseUrl: string;
            query: string;
            strategy: "site_search" | "ai_navigation" | "traditional_crawl" | "hybrid";
            decisions: Array<{
                decisionType: string;
                timestamp: Date;
                confidence?: number;
                reasoning?: string;
                metadata?: Record<string, unknown>;
            }>;
            documentsFound: Array<{
                documentUrl: string;
                documentTitle?: string;
                foundVia: string;
                decisionIndex: number;
            }>;
            performanceMetrics: {
                totalDuration?: number;
                llmCalls?: number;
                llmLatency?: number;
                cacheHits?: number;
                cacheMisses?: number;
            };
            createdAt: Date;
            updatedAt: Date;
        };
        explanation: string;
        summary?: {
            strategy: string;
            documentsFound: number;
            decisionsMade: number;
            duration?: number;
            llmCalls?: number;
        };
    }>;
    listAICrawlingTraces(filters?: {
        baseUrl?: string;
        query?: string;
        strategy?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
        skip?: number;
    }): Promise<{
        traces: Array<{
            _id?: string;
            sessionId: string;
            baseUrl: string;
            query: string;
            strategy: "site_search" | "ai_navigation" | "traditional_crawl" | "hybrid";
            decisions: Array<{
                decisionType: string;
                timestamp: Date;
                confidence?: number;
                reasoning?: string;
                metadata?: Record<string, unknown>;
            }>;
            documentsFound: Array<{
                documentUrl: string;
                documentTitle?: string;
                foundVia: string;
                decisionIndex: number;
            }>;
            performanceMetrics: {
                totalDuration?: number;
                llmCalls?: number;
                llmLatency?: number;
                cacheHits?: number;
                cacheMisses?: number;
            };
            createdAt: Date;
            updatedAt: Date;
        }>;
        total: number;
        limit: number;
        skip: number;
    }>;
    getHierarchyRegulations(jurisdictionId: string, options?: {
        includeChildren?: boolean;
        includeParents?: boolean;
        maxDepth?: number;
        levelFilter?: string[];
    }): Promise<{
        success: boolean;
        jurisdictionId: string;
        regulations: unknown[];
        count: number;
    }>;
    getHierarchyChildren(jurisdictionId: string, options?: {
        maxDepth?: number;
        levelFilter?: string[];
    }): Promise<{
        success: boolean;
        jurisdictionId: string;
        children: unknown[];
        count: number;
    }>;
    getHierarchyByLevel(level: 'municipality' | 'province' | 'national' | 'european'): Promise<{
        success: boolean;
        level: string;
        regulations: unknown[];
        count: number;
    }>;
    getHierarchySubtree(jurisdictionId: string, options?: {
        includeChildren?: boolean;
        includeParents?: boolean;
        maxDepth?: number;
        levelFilter?: string[];
    }): Promise<{
        success: boolean;
        jurisdictionId: string;
        subtree: unknown;
    }>;
    updateHierarchy(jurisdictionId: string, hierarchy: {
        level: 'municipality' | 'province' | 'national' | 'european';
        parentId?: string;
    }): Promise<{
        success: boolean;
        entityId: string;
        hierarchy: unknown;
        message: string;
    }>;
    validateHierarchy(jurisdictionId: string, includeParent?: boolean): Promise<{
        success: boolean;
        entityId: string;
        validation: {
            valid: boolean;
            errors: string[];
            warnings: string[];
            hasCycles?: boolean;
            bidirectionalConsistency?: boolean;
        };
    }>;
    runBenchmark(params: {
        name?: string;
        query?: string;
        queries?: string[];
        benchmarkTypes: string[];
    }): Promise<{
        runId: string;
    }>;
    getBenchmarkStatus(runId: string): Promise<{
        id: string;
        status: "pending" | "running" | "completed" | "failed" | "cancelled";
        results?: unknown;
    }>;
    getBenchmarkRun(runId: string): Promise<{
        id: string;
        name: string;
        query: string;
        benchmarkTypes: string[];
        status: "pending" | "running" | "completed" | "failed" | "cancelled";
        createdAt: string;
        completedAt?: string;
        cancelledAt?: string;
        results: Array<{
            id: string;
            benchmarkType: string;
            configName: string;
            documents: Array<{
                url: string;
                titel: string;
                samenvatting: string;
                score: number;
                rank: number;
            }>;
            metrics: {
                documentsFound: number;
                averageScore: number;
            };
        }>;
    }>;
    cancelBenchmark(runId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    compareWorkflows(workflowIds: string[], query?: string): Promise<{
        workflowId: string;
        workflowName: string;
        query: string;
        runs: number;
        metrics: {
            avgExecutionTime: number;
            avgDocumentsFound: number;
            avgScore: number;
            minExecutionTime: number;
            maxExecutionTime: number;
            stdDevExecutionTime: number;
            medianExecutionTime: number;
        };
        results: Array<{
            id: string;
            benchmarkRunId: string;
            workflowId: string;
            configName: string;
            documents: Array<{
                url: string;
                titel: string;
                samenvatting: string;
                score: number;
                rank: number;
            }>;
            metrics: {
                documentsFound: number;
                averageScore: number;
            };
        }>;
    }[]>;
    startWorkflowComparison(params: {
        name: string;
        description?: string;
        workflowA: {
            workflowId: string;
            label?: string;
            runtimeSettings?: {
                featureFlags?: Record<string, boolean>;
                params?: Record<string, unknown>;
                timeout?: number;
                maxRetries?: number;
                maxMemoryMB?: number;
                maxConcurrentRequests?: number;
            };
        };
        workflowB: {
            workflowId: string;
            label?: string;
            runtimeSettings?: {
                featureFlags?: Record<string, boolean>;
                params?: Record<string, unknown>;
                timeout?: number;
                maxRetries?: number;
                maxMemoryMB?: number;
                maxConcurrentRequests?: number;
            };
        };
        query?: string;
        queries?: string[];
        runsPerQuery?: number;
    }): Promise<{
        success: boolean;
        comparisonId: string;
        message: string;
    }>;
    listWorkflowComparisons(options?: {
        limit?: number;
        skip?: number;
        status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    }): Promise<{
        _id: string;
        name: string;
        description?: string;
        status: "pending" | "running" | "completed" | "failed" | "cancelled";
        workflowA: {
            workflowId: string;
            label?: string;
        };
        workflowB: {
            workflowId: string;
            label?: string;
        };
        createdAt: string;
        startedAt?: string;
        completedAt?: string;
        error?: string;
    }[]>;
    /**
     * Compare two documents
     * @param documentAId - ID of first document
     * @param documentBId - ID of second document
     * @param options - Comparison options (strategy, extractionMethod, etc.)
     */
    compareDocuments(documentAId: string, documentBId: string, options?: {
        strategy?: 'semantic' | 'structured' | 'hybrid';
        extractionMethod?: 'llm' | 'rule-based' | 'hybrid';
        includeMetadata?: boolean;
        maxConcepts?: number;
        minConfidence?: number;
    }): Promise<{
        documentA: CanonicalDocument;
        documentB: CanonicalDocument;
        comparisonId: string;
        matchedConcepts: Array<{
            concept: string;
            normType: "regulation" | "requirement" | "policy" | "procedure";
            evidenceA: {
                documentId: string;
                chunks: Array<{
                    chunkId: string;
                    text: string;
                    offsets: {
                        start: number;
                        end: number;
                    };
                    relevanceScore: number;
                }>;
                citations: Array<{
                    chunkId: string;
                    text: string;
                    offsets: {
                        start: number;
                        end: number;
                    };
                    pageNumber?: number;
                    section?: string;
                }>;
                confidence: number;
            };
            evidenceB: {
                documentId: string;
                chunks: Array<{
                    chunkId: string;
                    text: string;
                    offsets: {
                        start: number;
                        end: number;
                    };
                    relevanceScore: number;
                }>;
                citations: Array<{
                    chunkId: string;
                    text: string;
                    offsets: {
                        start: number;
                        end: number;
                    };
                    pageNumber?: number;
                    section?: string;
                }>;
                confidence: number;
            };
            status: "identical" | "changed" | "conflicting" | "a-only" | "b-only";
            delta?: {
                type: "added" | "removed" | "modified" | "conflicting";
                oldValue?: string;
                newValue?: string;
                changeDescription: string;
            };
            confidence: number;
            impact?: string;
        }>;
        differences: Array<{
            category: "regulation" | "requirement" | "policy" | "procedure" | "metadata";
            concept: string;
            status: "a-only" | "b-only" | "changed" | "conflicting";
            evidenceA?: {
                documentId: string;
                chunks: Array<{
                    chunkId: string;
                    text: string;
                    offsets: {
                        start: number;
                        end: number;
                    };
                    relevanceScore: number;
                }>;
                citations: Array<{
                    chunkId: string;
                    text: string;
                    offsets: {
                        start: number;
                        end: number;
                    };
                    pageNumber?: number;
                    section?: string;
                }>;
                confidence: number;
            };
            evidenceB?: {
                documentId: string;
                chunks: Array<{
                    chunkId: string;
                    text: string;
                    offsets: {
                        start: number;
                        end: number;
                    };
                    relevanceScore: number;
                }>;
                citations: Array<{
                    chunkId: string;
                    text: string;
                    offsets: {
                        start: number;
                        end: number;
                    };
                    pageNumber?: number;
                    section?: string;
                }>;
                confidence: number;
            };
            delta?: {
                type: "added" | "removed" | "modified" | "conflicting";
                oldValue?: string;
                newValue?: string;
                changeDescription: string;
            };
            confidence: number;
            impact: string;
        }>;
        summary: {
            totalConcepts: number;
            identical: number;
            changed: number;
            conflicting: number;
            aOnly: number;
            bOnly: number;
            overallSimilarity: number;
            keyDifferences: string[];
        };
        confidence: number;
        metadata: {
            comparisonDate: string;
            comparisonStrategy: "semantic" | "structured" | "hybrid";
            extractionMethod: "llm" | "rule-based" | "hybrid";
            processingTime: number;
        };
    }>;
    /**
     * Get comparison result by ID
     * @param comparisonId - Comparison ID
     */
    getComparison(comparisonId: string): Promise<{
        documentA: CanonicalDocument;
        documentB: CanonicalDocument;
        comparisonId: string;
        matchedConcepts: unknown[];
        differences: unknown[];
        summary: unknown;
        confidence: number;
        metadata: unknown;
    }>;
    get<T>(endpoint: string, options?: {
        responseType?: 'json' | 'blob';
    }): Promise<T>;
    post<T>(endpoint: string, data?: unknown): Promise<T>;
}
export declare const api: ApiService;
