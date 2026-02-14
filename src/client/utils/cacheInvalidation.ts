/**
 * Cache Invalidation Utilities - Standardized cache invalidation patterns
 * 
 * Provides utilities for invalidating React Query cache with consistent patterns.
 */

import { useQueryClient } from '@tanstack/react-query';

/**
 * Query key patterns for consistent cache management
 */
export const QueryKeys = {
  queries: ['queries'] as const,
  query: (id: string | null) => ['query', id] as const,
  canonicalDocuments: ['canonical-documents'] as const,
  canonicalDocumentsByQuery: (queryId: string | null, page?: number, limit?: number) =>
    ['canonical-documents', 'query', queryId, page, limit] as const,
  canonicalDocumentsByRun: (runId: string | null, page?: number, limit?: number) =>
    ['canonical-documents', 'run', runId, page, limit] as const,
  websites: ['websites'] as const,
  websitesByQuery: (queryId: string | null, page?: number, limit?: number) =>
    ['websites', 'query', queryId, page, limit] as const,
  workflowRuns: ['workflow-runs'] as const,
  workflowRun: (runId: string | null) => ['workflow-run', runId] as const,
  workflowOutputs: ['workflow-outputs'] as const,
  workflowLogs: (runId: string | null) => ['workflow-logs', runId] as const,
} as const;

/**
 * Cache invalidation patterns
 */
export class CacheInvalidation {
  private queryClient: ReturnType<typeof useQueryClient>;

  constructor(queryClient: ReturnType<typeof useQueryClient>) {
    this.queryClient = queryClient;
  }

  /**
   * Invalidate all queries for a specific query ID
   */
  invalidateQuery(queryId: string): void {
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.query(queryId) });
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.canonicalDocumentsByQuery(queryId) });
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.websitesByQuery(queryId) });
  }

  /**
   * Invalidate all documents for a query
   */
  invalidateDocumentsForQuery(queryId: string): void {
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.canonicalDocumentsByQuery(queryId) });
  }

  /**
   * Invalidate all documents for a workflow run
   */
  invalidateDocumentsForRun(runId: string): void {
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.canonicalDocumentsByRun(runId) });
  }

  /**
   * Invalidate all websites for a query
   */
  invalidateWebsitesForQuery(queryId: string): void {
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.websitesByQuery(queryId) });
  }

  /**
   * Invalidate workflow run data
   */
  invalidateWorkflowRun(runId: string): void {
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.workflowRun(runId) });
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.workflowLogs(runId) });
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.canonicalDocumentsByRun(runId) });
  }

  /**
   * Invalidate all workflow-related data
   */
  invalidateAllWorkflows(): void {
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.workflowRuns });
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.workflowOutputs });
  }

  /**
   * Invalidate all query-related data
   */
  invalidateAllQueries(): void {
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.queries });
  }

  /**
   * Invalidate all document-related data
   */
  invalidateAllDocuments(): void {
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.canonicalDocuments });
  }

  /**
   * Invalidate all website-related data
   */
  invalidateAllWebsites(): void {
    this.queryClient.invalidateQueries({ queryKey: QueryKeys.websites });
  }

  /**
   * Invalidate all cache (use with caution)
   */
  invalidateAll(): void {
    this.queryClient.invalidateQueries();
  }
}

/**
 * Hook for cache invalidation utilities
 */
export function useCacheInvalidation(): CacheInvalidation {
  const queryClient = useQueryClient();
  return new CacheInvalidation(queryClient);
}


