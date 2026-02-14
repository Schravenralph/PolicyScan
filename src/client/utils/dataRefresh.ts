/**
 * Data Refresh Utilities - Standardized data refresh mechanisms
 * 
 * Provides utilities for refreshing React Query data with consistent patterns.
 */

import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from './cacheInvalidation';

/**
 * Data refresh utilities
 */
export class DataRefresh {
  private queryClient: ReturnType<typeof useQueryClient>;

  constructor(queryClient: ReturnType<typeof useQueryClient>) {
    this.queryClient = queryClient;
  }

  /**
   * Refresh all queries for a specific query ID
   */
  async refreshQuery(queryId: string): Promise<void> {
    await Promise.all([
      this.queryClient.refetchQueries({ queryKey: QueryKeys.query(queryId) }),
      this.queryClient.refetchQueries({ queryKey: QueryKeys.canonicalDocumentsByQuery(queryId) }),
      this.queryClient.refetchQueries({ queryKey: QueryKeys.websitesByQuery(queryId) }),
    ]);
  }

  /**
   * Refresh all documents for a query
   */
  async refreshDocumentsForQuery(queryId: string): Promise<void> {
    await this.queryClient.refetchQueries({ queryKey: QueryKeys.canonicalDocumentsByQuery(queryId) });
  }

  /**
   * Refresh all documents for a workflow run
   */
  async refreshDocumentsForRun(runId: string): Promise<void> {
    await this.queryClient.refetchQueries({ queryKey: QueryKeys.canonicalDocumentsByRun(runId) });
  }

  /**
   * Refresh all websites for a query
   */
  async refreshWebsitesForQuery(queryId: string): Promise<void> {
    await this.queryClient.refetchQueries({ queryKey: QueryKeys.websitesByQuery(queryId) });
  }

  /**
   * Refresh workflow run data
   */
  async refreshWorkflowRun(runId: string): Promise<void> {
    await Promise.all([
      this.queryClient.refetchQueries({ queryKey: QueryKeys.workflowRun(runId) }),
      this.queryClient.refetchQueries({ queryKey: QueryKeys.workflowLogs(runId) }),
      this.queryClient.refetchQueries({ queryKey: QueryKeys.canonicalDocumentsByRun(runId) }),
    ]);
  }

  /**
   * Refresh all workflow-related data
   */
  async refreshAllWorkflows(): Promise<void> {
    await Promise.all([
      this.queryClient.refetchQueries({ queryKey: QueryKeys.workflowRuns }),
      this.queryClient.refetchQueries({ queryKey: QueryKeys.workflowOutputs }),
    ]);
  }

  /**
   * Refresh all query-related data
   */
  async refreshAllQueries(): Promise<void> {
    await this.queryClient.refetchQueries({ queryKey: QueryKeys.queries });
  }

  /**
   * Refresh all document-related data
   */
  async refreshAllDocuments(): Promise<void> {
    await this.queryClient.refetchQueries({ queryKey: QueryKeys.canonicalDocuments });
  }

  /**
   * Refresh all website-related data
   */
  async refreshAllWebsites(): Promise<void> {
    await this.queryClient.refetchQueries({ queryKey: QueryKeys.websites });
  }

  /**
   * Refresh all active queries
   */
  async refreshAllActive(): Promise<void> {
    await this.queryClient.refetchQueries({ type: 'active' });
  }
}

/**
 * Hook for data refresh utilities
 */
export function useDataRefresh(): DataRefresh {
  const queryClient = useQueryClient();
  return new DataRefresh(queryClient);
}


