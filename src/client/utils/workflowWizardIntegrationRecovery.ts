/**
 * Workflow-Wizard Integration Recovery Utility
 * 
 * Handles recovery from integration failures between workflow and wizard services.
 */

import { WorkflowWizardIntegrationService } from '../services/wizard/WorkflowWizardIntegrationService';
import { api } from '../services/api';
import { logError } from './errorHandler';
import type { Run } from '../services/api';

export interface IntegrationRecoveryOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  onRecoveryAttempt?: (attempt: number) => void;
  onRecoverySuccess?: () => void;
  onRecoveryFailure?: (error: Error) => void;
}

export interface IntegrationState {
  sessionId?: string;
  queryId?: string;
  runId?: string;
  lastKnownStatus?: Run['status'];
  timestamp: string;
}

/**
 * Recover from integration failure
 */
export async function recoverFromIntegrationFailure(
  state: IntegrationState,
  options: IntegrationRecoveryOptions = {}
): Promise<{ recovered: boolean; error?: Error }> {
  const {
    maxRetries = 3,
    retryDelayMs = 1000,
    onRecoveryAttempt,
    onRecoverySuccess,
    onRecoveryFailure,
  } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (onRecoveryAttempt) {
      onRecoveryAttempt(attempt);
    }

    try {
      // Check integration health
      const health = await WorkflowWizardIntegrationService.checkHealth();
      
      if (!health.healthy) {
        const error = new Error('Integration services are not healthy');
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs * Math.pow(2, attempt)));
          continue;
        }
        if (onRecoveryFailure) {
          onRecoveryFailure(error);
        }
        return { recovered: false, error };
      }

      // If we have a runId, verify it still exists and get its status
      if (state.runId) {
        try {
          const run = await api.getRun(state.runId);
          
          // Validate the run result
          const validation = WorkflowWizardIntegrationService.validateResult(run);
          if (!validation.valid && validation.errors) {
            logError(new Error(`Run validation errors during recovery: ${JSON.stringify(validation.errors)}`), 'workflow-wizard-recovery-validation');
          }

          if (onRecoverySuccess) {
            onRecoverySuccess();
          }
          return { recovered: true };
        } catch (error) {
          // Run might not exist anymore, that's okay
          logError(error instanceof Error ? error : new Error('Run not found during recovery'), 'workflow-wizard-recovery-run-not-found');
        }
      }

      // If we have a sessionId, verify it still exists
      if (state.sessionId) {
        try {
          await api.wizard.getSessionState(state.sessionId);
          if (onRecoverySuccess) {
            onRecoverySuccess();
          }
          return { recovered: true };
        } catch (error) {
          // Session might not exist anymore, that's okay
          logError(error instanceof Error ? error : new Error('Session not found during recovery'), 'workflow-wizard-recovery-session-not-found');
        }
      }

      // If we get here, health check passed but we couldn't verify state
      // This is still considered a recovery success
      if (onRecoverySuccess) {
        onRecoverySuccess();
      }
      return { recovered: true };
    } catch (error) {
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * Math.pow(2, attempt)));
        continue;
      }

      const recoveryError = error instanceof Error ? error : new Error('Recovery failed');
      if (onRecoveryFailure) {
        onRecoveryFailure(recoveryError);
      }
      return { recovered: false, error: recoveryError };
    }
  }

  const error = new Error('Recovery failed after all retries');
  if (onRecoveryFailure) {
    onRecoveryFailure(error);
  }
  return { recovered: false, error };
}

/**
 * Save integration state for recovery
 */
export function saveIntegrationState(state: IntegrationState): void {
  try {
    const key = `workflow_wizard_integration_state_${state.runId || state.sessionId || 'unknown'}`;
    localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to save integration state'), 'save-integration-state');
  }
}

/**
 * Load integration state for recovery
 */
export function loadIntegrationState(runId?: string, sessionId?: string): IntegrationState | null {
  try {
    const key = `workflow_wizard_integration_state_${runId || sessionId || 'unknown'}`;
    const stored = localStorage.getItem(key);
    if (!stored) {
      return null;
    }

    const state = JSON.parse(stored) as IntegrationState;
    
    // Check if state is still valid (not older than 1 hour)
    const stateTime = new Date(state.timestamp).getTime();
    const ageMs = Date.now() - stateTime;
    const maxAgeMs = 60 * 60 * 1000; // 1 hour

    if (ageMs > maxAgeMs) {
      localStorage.removeItem(key);
      return null;
    }

    return state;
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to load integration state'), 'load-integration-state');
    return null;
  }
}

/**
 * Clear integration state
 */
export function clearIntegrationState(runId?: string, sessionId?: string): void {
  try {
    const key = `workflow_wizard_integration_state_${runId || sessionId || 'unknown'}`;
    localStorage.removeItem(key);
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to clear integration state'), 'clear-integration-state');
  }
}


