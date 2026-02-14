/**
 * Workflow Recovery Utility
 * 
 * Handles recovery of partial workflow results from checkpoints.
 * Extracts completed step results and enables workflow resume.
 */

import { api } from '../services/api';
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
export async function extractPartialResults(runId: string): Promise<PartialWorkflowResult> {
  try {
    const run = await api.getRun(runId);
    
    // Extract checkpoint from run params
    const checkpoint = run.params?.__latestCheckpoint as WorkflowCheckpoint | undefined;
    const checkpointHistory = (run.params?.__checkpointHistory as WorkflowCheckpoint[] | undefined) || [];
    
    // Determine completed steps from checkpoint history
    const completedSteps = checkpointHistory.map(cp => cp.stepId).filter((id, index, arr) => arr.indexOf(id) === index);
    
    // Try to get workflow output if available
    let partialOutput: Partial<WorkflowOutput> | undefined;
    try {
      // Check if there's a workflow output name in the run
      const outputName = run.params?.workflowOutputName as string | undefined;
      if (outputName) {
        const output = await api.getWorkflowOutput(outputName);
        partialOutput = output;
      }
    } catch (error) {
      // Output might not exist yet, that's okay
      console.debug('No workflow output available for recovery:', error);
    }

    // Extract documents found from context or output
    let documentsFound: number | undefined;
    if (partialOutput?.results?.summary) {
      documentsFound = partialOutput.results.summary.totalDocuments;
    } else if (checkpoint?.context) {
      // Try to extract from context
      const context = checkpoint.context;
      if (typeof context.totalDocuments === 'number') {
        documentsFound = context.totalDocuments;
      } else if (Array.isArray(context.documents)) {
        documentsFound = context.documents.length;
      }
    }

    // Determine if workflow can be resumed
    const canResume = !!checkpoint && 
                      (run.status === 'failed' || run.status === 'cancelled') &&
                      completedSteps.length > 0;

    return {
      runId,
      status: run.status,
      completedSteps,
      checkpoint,
      partialOutput,
      documentsFound,
      error: run.error || undefined,
      canResume,
    };
  } catch (error) {
    console.error('Failed to extract partial results:', error);
    throw new Error(`Failed to extract partial results: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Save partial results to localStorage for recovery
 */
export function savePartialResultsForRecovery(runId: string, partialResults: PartialWorkflowResult): void {
  try {
    const key = `workflow_recovery_${runId}`;
    const data = {
      ...partialResults,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to save partial results to localStorage:', error);
    // Don't throw - this is a best-effort operation
  }
}

/**
 * Load partial results from localStorage
 */
export function loadPartialResultsFromRecovery(runId: string): PartialWorkflowResult | null {
  try {
    const key = `workflow_recovery_${runId}`;
    const stored = localStorage.getItem(key);
    if (!stored) {
      return null;
    }
    
    const data = JSON.parse(stored) as PartialWorkflowResult & { savedAt: string };
    
    // Check if recovery data is still valid (not older than 7 days)
    const savedAt = new Date(data.savedAt);
    const ageMs = Date.now() - savedAt.getTime();
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    if (ageMs > maxAgeMs) {
      localStorage.removeItem(key);
      return null;
    }
    
    return data;
  } catch (error) {
    console.warn('Failed to load partial results from localStorage:', error);
    return null;
  }
}

/**
 * Clear recovery data for a run
 */
export function clearRecoveryData(runId: string): void {
  try {
    const key = `workflow_recovery_${runId}`;
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('Failed to clear recovery data:', error);
  }
}


