/**
 * Context Recovery Service
 * 
 * Recovers workflow context from backups and checkpoints.
 */

import { IRunManager } from './interfaces/IRunManager.js';
import { Run } from '../infrastructure/types.js';
import { ContextValidationService } from './ContextValidationService.js';
import { logger } from '../../utils/logger.js';
import { NotFoundError } from '../../types/errors.js';

export interface ContextBackup {
  context: Record<string, unknown>;
  version: number;
  stepId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ContextRecoveryResult {
  success: boolean;
  context?: Record<string, unknown>;
  version?: number;
  stepId?: string;
  error?: string;
  fromBackup?: boolean;
  fromCheckpoint?: boolean;
}

/**
 * Service for recovering workflow context
 */
export class ContextRecoveryService {
  private validationService: ContextValidationService;

  constructor(private runManager: IRunManager) {
    this.validationService = new ContextValidationService();
  }

  /**
   * Create a backup of context before modification
   */
  createBackup(
    context: Record<string, unknown>,
    stepId: string,
    version: number,
    metadata?: Record<string, unknown>
  ): ContextBackup {
    return {
      context: this.deepClone(context),
      version,
      stepId,
      timestamp: new Date().toISOString(),
      metadata,
    };
  }

  /**
   * Recover context from backup or checkpoint
   */
  async recoverContext(
    runId: string,
    currentContext: Record<string, unknown>,
    currentStepId: string
  ): Promise<ContextRecoveryResult> {
    try {
      const run = await this.runManager.getRun(runId);
      if (!run) {
        return {
          success: false,
          error: `Run ${runId} not found`,
        };
      }

      // Optimized: Try parallel recovery if enabled
      const { getRecoveryOptimizationService } = await import('./RecoveryOptimizationService.js');
      const recoveryOpt = getRecoveryOptimizationService();
      
      if (recoveryOpt['config'].enableParallelRecovery) {
        // Try all recovery methods in parallel
        const parallelResult = await recoveryOpt.attemptParallelRecovery(
          [
            () => this.recoverFromCheckpoint(run, currentStepId),
            () => this.recoverFromBackup(run, currentStepId),
            async () => this.recoverFromParams(run, currentStepId),
          ],
          5000 // 5 second timeout
        );
        
        if (parallelResult.success && parallelResult.result) {
          const result = parallelResult.result as ContextRecoveryResult;
          logger.info(
            { runId, stepId: currentStepId, source: parallelResult.source },
            'Context recovered via parallel recovery'
          );
          return {
            success: true,
            context: result.context,
            version: result.version,
            stepId: result.stepId,
            fromCheckpoint: parallelResult.source === 'method-0',
            fromBackup: parallelResult.source === 'method-1',
          };
        }
      } else {
        // Fallback to sequential recovery
        // Try to recover from latest checkpoint first
        const checkpointResult = await this.recoverFromCheckpoint(run, currentStepId);
        if (checkpointResult.success) {
          logger.info(
            { runId, stepId: currentStepId },
            'Context recovered from checkpoint'
          );
          return checkpointResult;
        }

        // Try to recover from backup
        const backupResult = await this.recoverFromBackup(run, currentStepId);
        if (backupResult.success) {
          logger.info(
            { runId, stepId: currentStepId },
            'Context recovered from backup'
          );
          return backupResult;
        }

        // Try to recover from run params
        const paramsResult = this.recoverFromParams(run, currentStepId);
        if (paramsResult.success) {
          logger.info(
            { runId, stepId: currentStepId },
            'Context recovered from run params'
          );
          return paramsResult;
        }
      }

      return {
        success: false,
        error: 'No valid backup or checkpoint found',
      };
    } catch (error) {
      logger.error(
        { runId, stepId: currentStepId, error },
        'Failed to recover context'
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Recover context from checkpoint
   * Includes validation to ensure checkpoint data is valid
   */
  private async recoverFromCheckpoint(
    run: Run,
    currentStepId: string
  ): Promise<ContextRecoveryResult> {
    // Validate checkpoint data exists and is valid
    const latestCheckpoint = run.params?.__latestCheckpoint;
    if (!latestCheckpoint) {
      return {
        success: false,
        error: 'No checkpoint found in run params',
      };
    }
    
    // Validate checkpoint structure
    if (typeof latestCheckpoint !== 'object' || Array.isArray(latestCheckpoint)) {
      logger.warn({ runId: run._id?.toString() }, 'Invalid checkpoint structure (not an object)');
      return {
        success: false,
        error: 'Invalid checkpoint structure',
      };
    }
    
    const checkpoint = latestCheckpoint as {
      stepId?: string;
      nextStepId?: string;
      context?: Record<string, unknown>;
      checkpointedAt?: string;
    };
    
    // Validate required fields
    if (!checkpoint.stepId || typeof checkpoint.stepId !== 'string') {
      logger.warn({ runId: run._id?.toString() }, 'Checkpoint missing or invalid stepId');
      return {
        success: false,
        error: 'Checkpoint missing stepId',
      };
    }
    
    if (!checkpoint.context || typeof checkpoint.context !== 'object' || Array.isArray(checkpoint.context)) {
      logger.warn({ runId: run._id?.toString() }, 'Checkpoint missing or invalid context');
      return {
        success: false,
        error: 'Checkpoint missing or invalid context',
      };
    }

    // Validate recovered context using validation service
    const validation = this.validationService.validateContext(
      checkpoint.context,
      { steps: [] } as any, // Minimal workflow for validation
      checkpoint.stepId || currentStepId,
      { strict: false }
    );

    if (!validation.valid) {
      logger.warn(
        { runId: run._id?.toString(), checkpoint: checkpoint.stepId },
        'Recovered context from checkpoint failed validation',
        { errors: validation.errors }
      );
      return {
        success: false,
        error: `Context validation failed: ${validation.errors?.join(', ') || 'Unknown validation error'}`,
      };
    }

    return {
      success: true,
      context: checkpoint.context,
      version: (checkpoint as any).version || 1,
      stepId: checkpoint.stepId,
      fromCheckpoint: true,
    };
  }

  /**
   * Recover context from backup
   */
  private async recoverFromBackup(
    run: Run,
    currentStepId: string
  ): Promise<ContextRecoveryResult> {
    const params = run.params || {};
    const backupHistory = (params.__backupHistory as ContextBackup[]) || [];

    if (backupHistory.length === 0) {
      return { success: false };
    }

    // Get most recent backup
    const backup = backupHistory[backupHistory.length - 1];

    if (!backup || !backup.context) {
      return { success: false };
    }

    // Validate recovered context
    const validation = this.validationService.validateContext(
      backup.context,
      { steps: [] } as any, // Minimal workflow for validation
      backup.stepId || currentStepId,
      { strict: false }
    );

    if (!validation.valid) {
      logger.warn(
        { runId: run._id?.toString(), backup: backup.stepId },
        'Recovered context from backup failed validation',
        { errors: validation.errors }
      );
      return { success: false };
    }

    return {
      success: true,
      context: backup.context,
      version: backup.version,
      stepId: backup.stepId,
      fromBackup: true,
    };
  }

  /**
   * Recover context from run params
   */
  private recoverFromParams(
    run: Run,
    currentStepId: string
  ): ContextRecoveryResult {
    const params = run.params || {};

    // Extract context from params (excluding internal fields)
    const context: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (!key.startsWith('__')) {
        context[key] = value;
      }
    }

    if (Object.keys(context).length === 0) {
      return { success: false };
    }

    // Validate recovered context
    const validation = this.validationService.validateContext(
      context,
      { steps: [] } as any, // Minimal workflow for validation
      currentStepId,
      { strict: false }
    );

    if (!validation.valid) {
      logger.warn(
        { runId: run._id?.toString() },
        'Recovered context from params failed validation',
        { errors: validation.errors }
      );
      return { success: false };
    }

    return {
      success: true,
      context,
      version: (params.__contextVersion as number) || 1,
      stepId: currentStepId,
    };
  }

  /**
   * Store backup in run params
   */
  async storeBackup(
    runId: string,
    backup: ContextBackup
  ): Promise<void> {
    const run = await this.runManager.getRun(runId);
    if (!run) {
      throw new NotFoundError('Workflow run', runId, {
        reason: 'run_not_found_for_context_restore'
      });
    }

    const params = run.params || {};
    const backupHistory = (params.__backupHistory as ContextBackup[]) || [];

    // Add backup to history
    backupHistory.push(backup);

    // Keep only last 10 backups to avoid unbounded growth
    if (backupHistory.length > 10) {
      backupHistory.shift();
    }

    params.__backupHistory = backupHistory;
    params.__latestBackup = backup;

    await this.runManager.updateRunParams(runId, params);
  }

  /**
   * Deep clone an object
   */
  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime()) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item)) as unknown as T;
    }

    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }

    return cloned;
  }
}


