/**
 * StepState - Persists the state of a wizard step
 * 
 * This model enables:
 * - Step state persistence across sessions
 * - Step state recovery
 * - Step state history/audit trail
 */

import { ObjectId } from 'mongodb';

/**
 * Step state status
 */
export type StepStateStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

/**
 * StepState document structure
 */
export interface StepStateDocument {
  _id?: ObjectId;
  
  /** Workflow run ID this step belongs to */
  runId: string;
  
  /** Step definition ID */
  stepId: string;
  
  /** Current status */
  status: StepStateStatus;
  
  /** Step parameters/input */
  params: Record<string, unknown>;
  
  /** Step execution result/output */
  result?: Record<string, unknown>;
  
  /** Error message if failed */
  error?: string;
  
  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  
  /** Optional: User who initiated the step */
  userId?: string;
  
  /** Optional: Execution context */
  context?: Record<string, unknown>;
  
  /** Optional: Retry count */
  retryCount?: number;
  
  /** Optional: Step execution metadata */
  metadata?: {
    duration?: number;
    attempts?: number;
    [key: string]: unknown;
  };
}

/**
 * StepState creation input
 */
export interface StepStateCreateInput {
  runId: string;
  stepId: string;
  params: Record<string, unknown>;
  userId?: string;
  context?: Record<string, unknown>;
}

/**
 * StepState update input
 */
export interface StepStateUpdateInput {
  status?: StepStateStatus;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}


