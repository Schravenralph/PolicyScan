/**
 * Workflow Service
 *
 * High-level service layer for workflow operations.
 * Wraps WorkflowApiService to provide a cleaner interface.
 */
/**
 * Workflow Service
 *
 * Provides high-level methods for workflow operations, wrapping WorkflowApiService
 * to provide a cleaner interface and centralized error handling.
 */
export declare class WorkflowService {
    /**
     * Run a workflow
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
        message: string;
        workflowId: string;
        runId: string;
        reviewMode?: boolean;
    }>;
    /**
     * Get workflow run status
     */
    getRunStatus(runId: string): Promise<{
        _id: string;
        status: string;
        [key: string]: unknown;
    }>;
    /**
     * Get all workflow runs
     */
    getRuns(params?: {
        status?: string;
        type?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
        page?: number;
        skip?: number;
    }): Promise<Array<{
        _id: string;
        status: string;
        [key: string]: unknown;
    }>>;
    /**
     * Cancel a workflow run
     */
    cancelRun(runId: string): Promise<void>;
    /**
     * Pause a workflow run
     */
    pauseRun(runId: string): Promise<void>;
    /**
     * Resume a paused workflow run
     */
    resumeRun(runId: string): Promise<void>;
}
/**
 * Singleton instance of WorkflowService
 */
export declare const workflowService: WorkflowService;
