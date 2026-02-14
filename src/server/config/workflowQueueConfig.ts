/**
 * Workflow Queue Configuration
 * 
 * Defines timeout and other configuration settings for workflow queue execution.
 */

/**
 * Default timeout for workflow execution in queue (60 minutes)
 * Increased from 30 minutes to allow longer-running workflows
 * This matches the progress tracking maxWaitTime to ensure consistency
 */
export const DEFAULT_WORKFLOW_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Workflow timeout configuration per workflow type
 * Can be extended to support different timeouts for different workflow types
 */
export interface WorkflowTimeoutConfig {
  /** Default timeout for all workflows */
  default: number;
  /** Optional: Per-workflow-type timeouts */
  perWorkflowType?: Record<string, number>;
}

/**
 * Get timeout for a specific workflow
 * 
 * @param workflowId - The workflow ID
 * @param workflowType - Optional workflow type identifier
 * @returns Timeout in milliseconds
 */
export function getWorkflowTimeout(
  _workflowId: string,
  _workflowType?: string
): number {
  // For now, use default timeout for all workflows
  // Can be extended to support per-workflow-type configuration
  return DEFAULT_WORKFLOW_TIMEOUT_MS;
}

/**
 * Validate timeout value
 * 
 * @param timeoutMs - Timeout value in milliseconds
 * @returns True if valid, false otherwise
 */
export function isValidTimeout(timeoutMs: number): boolean {
  return timeoutMs > 0 && Number.isFinite(timeoutMs);
}


