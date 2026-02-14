/**
 * Data Refresh Utilities - Standardized data refresh mechanisms
 *
 * Provides utilities for refreshing React Query data with consistent patterns.
 */
import { useQueryClient } from '@tanstack/react-query';
/**
 * Data refresh utilities
 */
export declare class DataRefresh {
    private queryClient;
    constructor(queryClient: ReturnType<typeof useQueryClient>);
    /**
     * Refresh all queries for a specific query ID
     */
    refreshQuery(queryId: string): Promise<void>;
    /**
     * Refresh all documents for a query
     */
    refreshDocumentsForQuery(queryId: string): Promise<void>;
    /**
     * Refresh all documents for a workflow run
     */
    refreshDocumentsForRun(runId: string): Promise<void>;
    /**
     * Refresh all websites for a query
     */
    refreshWebsitesForQuery(queryId: string): Promise<void>;
    /**
     * Refresh workflow run data
     */
    refreshWorkflowRun(runId: string): Promise<void>;
    /**
     * Refresh all workflow-related data
     */
    refreshAllWorkflows(): Promise<void>;
    /**
     * Refresh all query-related data
     */
    refreshAllQueries(): Promise<void>;
    /**
     * Refresh all document-related data
     */
    refreshAllDocuments(): Promise<void>;
    /**
     * Refresh all website-related data
     */
    refreshAllWebsites(): Promise<void>;
    /**
     * Refresh all active queries
     */
    refreshAllActive(): Promise<void>;
}
/**
 * Hook for data refresh utilities
 */
export declare function useDataRefresh(): DataRefresh;
