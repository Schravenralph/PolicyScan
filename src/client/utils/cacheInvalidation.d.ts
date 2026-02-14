/**
 * Cache Invalidation Utilities - Standardized cache invalidation patterns
 *
 * Provides utilities for invalidating React Query cache with consistent patterns.
 */
import { useQueryClient } from '@tanstack/react-query';
/**
 * Query key patterns for consistent cache management
 */
export declare const QueryKeys: {
    readonly queries: readonly ["queries"];
    readonly query: (id: string | null) => readonly ["query", string | null];
    readonly canonicalDocuments: readonly ["canonical-documents"];
    readonly canonicalDocumentsByQuery: (queryId: string | null, page?: number, limit?: number) => readonly ["canonical-documents", "query", string | null, number | undefined, number | undefined];
    readonly canonicalDocumentsByRun: (runId: string | null, page?: number, limit?: number) => readonly ["canonical-documents", "run", string | null, number | undefined, number | undefined];
    readonly websites: readonly ["websites"];
    readonly websitesByQuery: (queryId: string | null, page?: number, limit?: number) => readonly ["websites", "query", string | null, number | undefined, number | undefined];
    readonly workflowRuns: readonly ["workflow-runs"];
    readonly workflowRun: (runId: string | null) => readonly ["workflow-run", string | null];
    readonly workflowOutputs: readonly ["workflow-outputs"];
    readonly workflowLogs: (runId: string | null) => readonly ["workflow-logs", string | null];
};
/**
 * Cache invalidation patterns
 */
export declare class CacheInvalidation {
    private queryClient;
    constructor(queryClient: ReturnType<typeof useQueryClient>);
    /**
     * Invalidate all queries for a specific query ID
     */
    invalidateQuery(queryId: string): void;
    /**
     * Invalidate all documents for a query
     */
    invalidateDocumentsForQuery(queryId: string): void;
    /**
     * Invalidate all documents for a workflow run
     */
    invalidateDocumentsForRun(runId: string): void;
    /**
     * Invalidate all websites for a query
     */
    invalidateWebsitesForQuery(queryId: string): void;
    /**
     * Invalidate workflow run data
     */
    invalidateWorkflowRun(runId: string): void;
    /**
     * Invalidate all workflow-related data
     */
    invalidateAllWorkflows(): void;
    /**
     * Invalidate all query-related data
     */
    invalidateAllQueries(): void;
    /**
     * Invalidate all document-related data
     */
    invalidateAllDocuments(): void;
    /**
     * Invalidate all website-related data
     */
    invalidateAllWebsites(): void;
    /**
     * Invalidate all cache (use with caution)
     */
    invalidateAll(): void;
}
/**
 * Hook for cache invalidation utilities
 */
export declare function useCacheInvalidation(): CacheInvalidation;
