/**
 * Alert Configuration
 * 
 * Configuration for workflow timeout alerts including thresholds,
 * channels, and recipients.
 */

import { AlertConfiguration, type AlertConfigurationDocument } from '../models/AlertConfiguration.js';
import type { AlertConfig, AlertChannel, AlertSeverity } from '../types/AlertTypes.js';
import { logger } from '../utils/logger.js';

// Re-export types for backward compatibility
export type { AlertConfig, AlertChannel, AlertSeverity };

/**
 * Default alert configuration
 */
export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  timeoutThreshold: 80, // Alert at 80% of timeout
  timeoutRateThreshold: 10, // Alert if timeout rate > 10%
  channels: ['in-app'], // Default to in-app only
  enabled: true,
};

/**
 * Get alert configuration for a workflow/step
 * 
 * Returns the most specific configuration available, or default if none found.
 * 
 * @param workflowId - Workflow ID
 * @param stepId - Optional step ID
 * @returns Alert configuration
 */
export async function getAlertConfig(workflowId?: string, stepId?: string): Promise<AlertConfig> {
  try {
    // 1. Check specific config (workflow + step)
    if (workflowId && stepId) {
      const specificConfig = await AlertConfiguration.findByContext(workflowId, stepId);
      if (specificConfig) return mapDocumentToConfig(specificConfig);
    }

    // 2. Check workflow config (workflow only)
    if (workflowId) {
      const workflowConfig = await AlertConfiguration.findByContext(workflowId, undefined);
      if (workflowConfig) return mapDocumentToConfig(workflowConfig);
    }

    // 3. Check global default config (no workflow, no step)
    const globalConfig = await AlertConfiguration.findByContext(undefined, undefined);
    if (globalConfig) return mapDocumentToConfig(globalConfig);

  } catch (error) {
    logger.warn({ error, workflowId, stepId }, 'Failed to load alert config from database, using default');
  }
  
  return DEFAULT_ALERT_CONFIG;
}

/**
 * Check if alerts are enabled for a workflow/step
 */
export async function areAlertsEnabled(workflowId?: string, stepId?: string): Promise<boolean> {
  const config = await getAlertConfig(workflowId, stepId);
  return config.enabled;
}

/**
 * Helper to map DB document to AlertConfig interface
 */
function mapDocumentToConfig(doc: AlertConfigurationDocument): AlertConfig {
  return {
    workflowId: doc.workflowId || undefined,
    stepId: doc.stepId || undefined,
    timeoutThreshold: doc.timeoutThreshold,
    timeoutRateThreshold: doc.timeoutRateThreshold,
    slowExecutionThreshold: doc.slowExecutionThreshold,
    channels: doc.channels,
    recipients: doc.recipients,
    severity: doc.severity,
    enabled: doc.enabled,
  };
}
