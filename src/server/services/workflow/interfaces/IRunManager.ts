import { ObjectId } from 'mongodb';
import { Run, RunStatus } from '../../infrastructure/types.js';

/**
 * Interface for run management operations
 * 
 * This interface abstracts run management functionality to enable:
 * - Better testability (can mock IRunManager in tests)
 * - Flexibility (can swap implementations)
 * - Decoupling (WorkflowEngine doesn't depend on concrete RunManager)
 */
export interface IRunManager {
    /**
     * Create a new run
     * @param type - Type of run (e.g., 'workflow', 'scan')
     * @param params - Run parameters
     * @param createdBy - Optional user ID who created this run (for resource-level authorization)
     */
    createRun(type: string, params: Record<string, unknown>, createdBy?: string): Promise<Run>;

    /**
     * Start a run (update status to running)
     */
    startRun(runId: string | ObjectId): Promise<void>;

    /**
     * Complete a run
     */
    completeRun(runId: string | ObjectId, result?: Record<string, unknown>): Promise<void>;

    /**
     * Fail a run
     */
    failRun(runId: string | ObjectId, error: string, status?: RunStatus): Promise<void>;

    /**
     * Add a log entry to a run
     */
    log(
        runId: string | ObjectId,
        message: string,
        level?: 'info' | 'warn' | 'error' | 'debug',
        metadata?: Record<string, unknown>
    ): Promise<void>;

    /**
     * Flush buffered logs to MongoDB
     * @param runId Optional run ID to flush specific logs only
     */
    flushLogs(runId?: string): Promise<void>;

    /**
     * Pause a run and save state
     */
    pauseRun(runId: string | ObjectId, state: { stepId: string; context: Record<string, unknown> }): Promise<void>;

    /**
     * Resume a paused run
     */
    resumeRun(
        runId: string | ObjectId,
        resolution?: {
            action: string;
            pattern?: string;
            notes?: string;
            metadata?: Record<string, unknown>;
        }
    ): Promise<void>;

    /**
     * Update run status
     */
    updateStatus(runId: string | ObjectId, status: RunStatus): Promise<void>;

    /**
     * Get a run by ID
     */
    getRun(runId: string | ObjectId): Promise<Run | null>;

    /**
     * Get recent runs
     */
    getRecentRuns(limit?: number): Promise<Run[]>;

    /**
     * Get run history with filtering support
     */
    getRunHistory(options?: {
        status?: RunStatus | RunStatus[];
        type?: string | string[];
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        skip?: number;
    }): Promise<Run[]>;

    /**
     * Count runs with filtering support
     */
    countRuns(options?: {
        status?: RunStatus | RunStatus[];
        type?: string | string[];
        startDate?: Date;
        endDate?: Date;
    }): Promise<number>;

    /**
     * Update output file paths for a run
     */
    updateOutputPaths(
        runId: string | ObjectId,
        outputPaths: {
            jsonPath: string;
            markdownPath: string;
            txtPath: string;
            csvPath: string;
            htmlPath: string;
            xmlPath: string;
        }
    ): Promise<void>;

    /**
     * Get runs by workflow ID
     */
    getRunsByWorkflowId(workflowId: string, limit?: number): Promise<Run[]>;

    /**
     * Get runs by query ID
     */
    getRunsByQueryId(queryId: string, limit?: number): Promise<Run[]>;

    /**
     * Cancel previous active runs (pending or running) for a given queryId or workflowId
     * This is called when a new run starts to prevent multiple concurrent runs
     */
    cancelPreviousActiveRuns(
        queryId?: string,
        workflowId?: string,
        excludeRunId?: string | ObjectId
    ): Promise<number>;

    /**
     * Mark stale runs as failed/timed out
     * A run is considered stale if it has been pending or running for more than RUN_TIMEOUT_MS
     * Can be called directly for periodic cleanup
     */
    markStaleRunsAsFailed(): Promise<void>;

    /**
     * Update run params safely
     */
    updateRunParams(runId: string | ObjectId, params: Record<string, unknown>): Promise<void>;
}


