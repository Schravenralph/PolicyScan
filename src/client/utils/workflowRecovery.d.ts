/**
 * Workflow Recovery Utility
 *
 * Handles recovery of partial workflow results from checkpoints.
 * Extracts completed step results and enables workflow resume.
 */
import type { Run, WorkflowOutput } from '../services/api';
export interface WorkflowCheckpoint {
    stepId: string;
    nextStepId?: string;
    context: Record<string, unknown>;
    checkpointedAt: string;
    [key: string]: unknown;
}
export interface PartialWorkflowResult {
    runId: string;
    status: Run['status'];
    completedSteps: string[];
    checkpoint?: WorkflowCheckpoint;
    partialOutput?: Partial<WorkflowOutput>;
    documentsFound?: number;
    error?: string;
    canResume: boolean;
}
/**
 * Extract partial results from a failed or cancelled workflow
 */
export declare function extractPartialResults(runId: string): Promise<PartialWorkflowResult>;
/**
 * Save partial results to localStorage for recovery
 */
export declare function savePartialResultsForRecovery(runId: string, partialResults: PartialWorkflowResult): void;
/**
 * Load partial results from localStorage
 */
export declare function loadPartialResultsFromRecovery(runId: string): PartialWorkflowResult | null;
/**
 * Clear recovery data for a run
 */
export declare function clearRecoveryData(runId: string): void;
