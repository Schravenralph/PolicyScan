/**
 * Workflow Completion Contract
 * 
 * Defines the mandatory contract for workflow completion that ensures:
 * 1. Results are saved to database
 * 2. Completion events are emitted (for queue updates)
 * 3. Both operations succeed or fail together
 */

export type WorkflowCompletionStatus = 'completed' | 'failed' | 'cancelled';

/**
 * Contract validation result
 */
export interface WorkflowCompletionContractResult {
  success: boolean;
  runId: string;
  workflowId: string;
  jobId: string;
  status: WorkflowCompletionStatus;
  stepsCompleted: {
    saveResults: boolean;
    emitCompletionEvent: boolean;
  };
  errors?: {
    saveResults?: string;
    emitCompletionEvent?: string;
  };
}

/**
 * Workflow completion contract parameters
 */
export interface WorkflowCompletionContract {
  runId: string;
  workflowId: string;
  jobId: string;
  result: Record<string, unknown>;
  status: WorkflowCompletionStatus;
  queryId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Contract validation schema
 * Ensures all mandatory steps are completed
 */
export interface WorkflowCompletionContractValidation {
  /**
   * All mandatory steps must be true
   */
  mandatorySteps: {
    saveResults: boolean;  // Must be true - results saved to database
    emitCompletionEvent: boolean;  // Must be true - event emitted for queue update
  };
  
  /**
   * Contract is valid only if all mandatory steps succeeded
   */
  isValid(): boolean;
}

/**
 * Create a contract validation object
 */
export function createContractValidation(
  saveResults: boolean,
  emitCompletionEvent: boolean
): WorkflowCompletionContractValidation {
  return {
    mandatorySteps: {
      saveResults,
      emitCompletionEvent,
    },
    isValid(): boolean {
      return this.mandatorySteps.saveResults && this.mandatorySteps.emitCompletionEvent;
    },
  };
}
