/**
 * Workflow-Wizard Integration Recovery Utility
 *
 * Handles recovery from integration failures between workflow and wizard services.
 */
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
export declare function recoverFromIntegrationFailure(state: IntegrationState, options?: IntegrationRecoveryOptions): Promise<{
    recovered: boolean;
    error?: Error;
}>;
/**
 * Save integration state for recovery
 */
export declare function saveIntegrationState(state: IntegrationState): void;
/**
 * Load integration state for recovery
 */
export declare function loadIntegrationState(runId?: string, sessionId?: string): IntegrationState | null;
/**
 * Clear integration state
 */
export declare function clearIntegrationState(runId?: string, sessionId?: string): void;
