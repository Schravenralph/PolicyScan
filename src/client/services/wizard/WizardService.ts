/**
 * Wizard Service
 * 
 * High-level service layer for wizard operations that wraps multiple API services.
 * Provides a clean interface for Beleidsscan wizard operations.
 */

import { api } from '../api';
import type { QueryData } from '../api/QueryApiService';
import type { CanonicalDocument } from '../api/CanonicalDocumentApiService';
import { logError } from '../../utils/errorHandler';
import { validateWorkflowParams } from '../../utils/validation';

/**
 * Wizard Service
 * 
 * Provides high-level methods for wizard operations, wrapping multiple API services
 * to provide a cleaner interface and centralized error handling.
 */
export class WizardService {
  /**
   * Create a new query
   */
  async createQuery(data: QueryData): Promise<QueryData & { _id: string }> {
    try {
      return await api.query.createQuery(data);
    } catch (error) {
      logError(error as Error, 'wizard-service-create-query');
      throw error;
    }
  }

  /**
   * Get documents for a query
   * 
   * ✅ **MIGRATED** - Now uses canonical document API internally.
   * Returns canonical documents directly.
   * 
   * @see WI-413: Frontend Hooks & Components Migration
   */
  async getDocuments(queryId: string): Promise<CanonicalDocument[]> {
    try {
      // Use canonical document API with high limit to avoid capping at 50
      // Set limit to 20,000 to prevent crashes while allowing large document sets
      const response = await api.canonicalDocument.getCanonicalDocumentsByQuery(queryId, {
        limit: 20000,
      });
      return response.data || [];
    } catch (error) {
      logError(error as Error, 'wizard-service-get-documents');
      throw error;
    }
  }

  /**
   * Finalize a query (mark as completed)
   */
  async finalizeQuery(queryId: string): Promise<void> {
    try {
      await api.query.finalizeQuery(queryId);
    } catch (error) {
      logError(error as Error, 'wizard-service-finalize-query');
      throw error;
    }
  }

  /**
   * Update an existing query
   */
  async updateQuery(queryId: string, data: Partial<QueryData>): Promise<QueryData> {
    try {
      return await api.query.updateQuery(queryId, data);
    } catch (error) {
      logError(error as Error, 'wizard-service-update-query');
      throw error;
    }
  }

  /**
   * Duplicate a query
   */
  async duplicateQuery(queryId: string, data?: Partial<QueryData>): Promise<QueryData & { _id: string }> {
    try {
      return await api.query.duplicateQuery(queryId, data);
    } catch (error) {
      logError(error as Error, 'wizard-service-duplicate-query');
      throw error;
    }
  }

  /**
   * Update document acceptance status
   * 
   * ✅ **MIGRATED** - Now uses canonical document API internally.
   * Returns canonical document directly.
   * 
   * @see WI-413: Frontend Hooks & Components Migration
   */
  async updateDocumentAcceptance(documentId: string, accepted: boolean | null): Promise<CanonicalDocument> {
    try {
      // Use canonical document API
      return await api.canonicalDocument.updateCanonicalDocumentAcceptance(documentId, accepted);
    } catch (error) {
      logError(error as Error, 'wizard-service-update-document-acceptance');
      throw error;
    }
  }

  /**
   * Update multiple document acceptance statuses
   */
  async updateDocumentAcceptances(
    documentIds: string[],
    accepted: boolean | null
  ): Promise<CanonicalDocument[]> {
    try {
      const results = await Promise.all(
        documentIds.map(id => this.updateDocumentAcceptance(id, accepted))
      );
      return results;
    } catch (error) {
      logError(error as Error, 'wizard-service-update-document-acceptances');
      throw error;
    }
  }

  /**
   * Generate website suggestions for a query
   */
  async generateWebsiteSuggestions(queryId: string): Promise<{
    success: boolean;
    websites: Array<{
      _id?: string;
      url: string;
      titel: string;
      [key: string]: unknown;
    }>;
  }> {
    try {
      const result = await api.query.generateWebsiteSuggestions(queryId);
      return {
        success: result.success,
        websites: result.websites.map(w => ({
          ...w,
          _id: w._id,
          url: w.url,
          titel: w.titel,
        })),
      };
    } catch (error) {
      logError(error as Error, 'wizard-service-generate-website-suggestions');
      throw error;
    }
  }

  /**
   * Start workflow execution
   * 
   * Validates required parameters (like onderwerp) before sending to API.
   * Provides early feedback if validation fails.
   * 
   * @param workflowId - The workflow ID to run
   * @param params - Workflow parameters (flexible - backend accepts any parameters via passthrough)
   *                 Common parameters: mode, query, queryId, selectedWebsites, onderwerp, overheidsinstantie, etc.
   *                 For workflows requiring onderwerp, must include non-empty onderwerp or query parameter.
   * 
   * @throws Error if validation fails (e.g., missing required onderwerp)
   */
  async startWorkflow(
    workflowId: string,
    params: {
      mode?: string;
      reviewMode?: boolean;
      query?: string;
      queryId?: string;
      selectedWebsites?: string[];
      overheidstype?: string;
      overheidsinstantie?: string;
      onderwerp?: string;
      thema?: string;
      [key: string]: unknown; // Allow any additional workflow-specific parameters
    }
  ): Promise<{
    message: string;
    workflowId: string;
    runId: string;
    reviewMode?: boolean;
  }> {
    try {
      // Validate workflow parameters before sending to API
      const validation = validateWorkflowParams(workflowId, params);
      if (!validation.isValid) {
        throw new Error(validation.error || 'Invalid workflow parameters');
      }

      const result = await api.workflow.runWorkflow(workflowId, params);
      return {
        message: 'Workflow started successfully',
        workflowId,
        runId: result.runId,
        reviewMode: params.mode === 'review' || params.reviewMode === true,
      };
    } catch (error) {
      logError(error as Error, 'wizard-service-start-workflow');
      throw error;
    }
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(runId: string): Promise<{
    _id: string;
    status: string;
    [key: string]: unknown;
  }> {
    try {
      const run = await api.workflow.getRun(runId);
      if (!run) {
        throw new Error('Run not found');
      }
      return {
        ...run,
        _id: run._id,
        status: run.status,
      };
    } catch (error) {
      logError(error as Error, 'wizard-service-get-workflow-status');
      throw error;
    }
  }
}

/**
 * Singleton instance of WizardService
 */
export const wizardService = new WizardService();

