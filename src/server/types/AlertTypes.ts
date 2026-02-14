/**
 * Alert Types
 *
 * Shared types for alert configuration and notification.
 */

export type AlertChannel = 'email' | 'slack' | 'in-app';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Alert configuration for a workflow or step
 */
export interface AlertConfig {
  workflowId?: string; // If undefined, applies to all workflows
  stepId?: string; // If undefined, applies to all steps in workflow
  timeoutThreshold: number; // Percentage (e.g., 80) - alert when this percentage of timeout is reached
  timeoutRateThreshold: number; // Percentage (e.g., 10) - alert when timeout rate exceeds this
  slowExecutionThreshold?: number; // Duration in ms - alert when execution exceeds this
  channels: AlertChannel[];
  recipients?: string[]; // User IDs or email addresses
  severity?: AlertSeverity; // Default severity for alerts
  enabled: boolean;
}
