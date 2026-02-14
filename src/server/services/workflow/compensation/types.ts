/**
 * Compensation Types
 * 
 * Defines types and interfaces for workflow step compensation.
 * Compensation is used to undo or reverse the effects of external operations
 * when a workflow step fails.
 */

/**
 * Compensation action function
 * Should be idempotent and best-effort
 */
export type CompensationAction = (result: unknown, context: Record<string, unknown>) => Promise<void>;

/**
 * Compensation metadata
 */
export interface CompensationMetadata {
  /**
   * Step ID that was executed
   */
  stepId: string;
  
  /**
   * Step action name
   */
  action: string;
  
  /**
   * Step execution result (may contain resources to clean up)
   */
  result: unknown;
  
  /**
   * Execution context at time of step execution
   */
  context: Record<string, unknown>;
  
  /**
   * Timestamp when step was executed
   */
  executedAt: Date;
  
  /**
   * Whether compensation has been executed
   */
  compensated: boolean;
  
  /**
   * Timestamp when compensation was executed (if applicable)
   */
  compensatedAt?: Date;
  
  /**
   * Compensation error (if compensation failed)
   */
  compensationError?: Error;
}

/**
 * Compensatable step interface
 * Steps that perform external operations should implement this interface
 */
export interface CompensatableStep {
  /**
   * Step ID
   */
  stepId: string;
  
  /**
   * Compensation action
   * Should clean up any resources created during step execution
   */
  compensate: CompensationAction;
}


