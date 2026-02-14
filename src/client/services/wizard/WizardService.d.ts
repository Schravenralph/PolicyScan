/**
 * Wizard Service
 *
 * High-level service layer for wizard operations that wraps multiple API services.
 * Provides a clean interface for Beleidsscan wizard operations.
 */
import type { QueryData } from '../api/QueryApiService';
import type { CanonicalDocument } from '../api/CanonicalDocumentApiService';
/**
 * Wizard Service
 *
 * Provides high-level methods for wizard operations, wrapping multiple API services
 * to provide a cleaner interface and centralized error handling.
 */
export declare class WizardService {
    /**
     * Create a new query
     */
    createQuery(data: QueryData): Promise<QueryData & {
        _id: string;
    }>;
    /**
     * Get documents for a query
     *
     * ✅ **MIGRATED** - Now uses canonical document API internally.
     * Returns canonical documents directly.
     *
     * @see WI-413: Frontend Hooks & Components Migration
     */
    getDocuments(queryId: string): Promise<CanonicalDocument[]>;
    /**
     * Finalize a query (mark as completed)
     */
    finalizeQuery(queryId: string): Promise<void>;
    /**
     * Update an existing query
     */
    updateQuery(queryId: string, data: Partial<QueryData>): Promise<QueryData>;
    /**
     * Duplicate a query
     */
    duplicateQuery(queryId: string, data?: Partial<QueryData>): Promise<QueryData & {
        _id: string;
    }>;
    /**
     * Update document acceptance status
     *
     * ✅ **MIGRATED** - Now uses canonical document API internally.
     * Returns canonical document directly.
     *
     * @see WI-413: Frontend Hooks & Components Migration
     */
    updateDocumentAcceptance(documentId: string, accepted: boolean | null): Promise<CanonicalDocument>;
    /**
     * Update multiple document acceptance statuses
     */
    updateDocumentAcceptances(documentIds: string[], accepted: boolean | null): Promise<CanonicalDocument[]>;
    /**
     * Generate website suggestions for a query
     */
    generateWebsiteSuggestions(queryId: string): Promise<{
        success: boolean;
        websites: Array<{
            _id?: string;
            url: string;
            titel: string;
            [key: string]: unknown;
        }>;
    }>;
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
    startWorkflow(workflowId: string, params: {
        mode?: string;
        reviewMode?: boolean;
        query?: string;
        queryId?: string;
        selectedWebsites?: string[];
        overheidstype?: string;
        overheidsinstantie?: string;
        onderwerp?: string;
        thema?: string;
        [key: string]: unknown;
    }): Promise<{
        message: string;
        workflowId: string;
        runId: string;
        reviewMode?: boolean;
    }>;
    /**
     * Get workflow status
     */
    getWorkflowStatus(runId: string): Promise<{
        _id: string;
        status: string;
        [key: string]: unknown;
    }>;
}
/**
 * Singleton instance of WizardService
 */
export declare const wizardService: WizardService;
