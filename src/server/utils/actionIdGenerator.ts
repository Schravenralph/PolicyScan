/**
 * Action ID Generator - Generate deterministic action IDs for idempotency
 * 
 * This utility generates deterministic action IDs based on action type and parameters,
 * enabling idempotency checks across action executions.
 */

import type { ActionType } from '../models/ActionExecution.js';

/**
 * Generate deterministic action ID based on parameters
 * 
 * This enables idempotency checks by generating the same ID for the same parameters.
 * 
 * @param actionType - The type of action
 * @param params - Parameters that determine action uniqueness
 * @returns Deterministic action ID
 */
export function generateActionId(
  actionType: ActionType,
  params: Record<string, unknown>
): string {
  // For startScan, use queryId if available (primary idempotency key)
  if (actionType === 'startScan' && params.queryId) {
    return `startScan:${String(params.queryId)}`;
  }
  
  // For other actions, use sessionId + actionType (session-based idempotency)
  if (params.sessionId) {
    return `${actionType}:${String(params.sessionId)}`;
  }
  
  // For actions that can be idempotent by queryId (e.g., generateSuggestions)
  if (params.queryId) {
    return `${actionType}:${String(params.queryId)}`;
  }
  
  // Fallback: generate unique ID (non-idempotent)
  // This should be rare and indicates the action cannot be made idempotent
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${actionType}:${timestamp}:${random}`;
}

/**
 * Parse action ID to extract components
 * 
 * @param actionId - The action ID to parse
 * @returns Parsed components or null if invalid format
 */
export function parseActionId(actionId: string): {
  actionType: ActionType;
  key: string;
} | null {
  const parts = actionId.split(':');
  if (parts.length < 2) {
    return null;
  }
  
  const actionType = parts[0] as ActionType;
  const key = parts.slice(1).join(':');
  
  return { actionType, key };
}

