/**
 * Performance Configuration Utilities
 * 
 * Provides utilities for retrieving and applying performance configuration
 * from workflow context, run metadata, or defaults.
 */

import type { 
  WorkflowPerformanceConfig, 
  StepPerformanceConfig, 
  StepIdentifier,
} from '../types/performanceConfig.js';
import { 
  DEFAULT_PERFORMANCE_CONFIG as DEFAULT_CONFIG, 
  getStepPerformanceConfig as getStepConfig, 
  applyMaxResultsCap as applyCap,
  mergePerformanceConfig,
} from '../types/performanceConfig.js';
import { logger } from './logger.js';

/**
 * Get performance configuration from workflow run context
 * 
 * @param runContext - Workflow run context (may contain performanceConfig)
 * @param stepIdentifier - Step identifier (e.g., 'step1', 'step2')
 * @returns Step performance config with defaults applied
 */
export function getPerformanceConfigFromContext(
  runContext: Record<string, unknown>,
  stepIdentifier: StepIdentifier
): StepPerformanceConfig {
  // Try to get performance config from context
  const workflowConfig = runContext.performanceConfig as WorkflowPerformanceConfig | undefined;
  
  if (workflowConfig) {
    return getStepConfig(workflowConfig, stepIdentifier);
  }
  
  // Fall back to default config
  return getStepConfig(DEFAULT_CONFIG, stepIdentifier);
}

/**
 * Get maxResults with performance caps applied
 * 
 * @param requested - Requested maxResults value (from params or undefined)
 * @param runContext - Workflow run context
 * @param stepIdentifier - Step identifier
 * @returns Capped maxResults value
 */
export function getCappedMaxResults(
  requested: number | undefined,
  runContext: Record<string, unknown>,
  stepIdentifier: StepIdentifier
): number {
  const stepConfig = getPerformanceConfigFromContext(runContext, stepIdentifier);
  const workflowConfig = (runContext.performanceConfig as WorkflowPerformanceConfig | undefined) || DEFAULT_CONFIG;
  
  return applyCap(requested, stepConfig, workflowConfig);
}

/**
 * Log performance cap application
 * 
 * @param stepIdentifier - Step identifier
 * @param requested - Requested maxResults
 * @param capped - Capped maxResults
 * @param runId - Workflow run ID
 */
export function logPerformanceCap(
  stepIdentifier: StepIdentifier,
  requested: number | undefined,
  capped: number,
  runId: string
): void {
  if (requested !== undefined && requested !== capped) {
    logger.info(
      { stepIdentifier, requested, capped, runId },
      `[Performance] Applied cap: ${stepIdentifier} maxResults ${requested} → ${capped}`
    );
  }
}

/**
 * Get or create performance configuration for workflow execution
 * 
 * Merges performance config from params (if provided) with defaults.
 * This allows workflows to override performance settings per execution.
 * 
 * @param params - Workflow execution parameters (may contain performanceConfig)
 * @returns Merged performance configuration
 */
export function getWorkflowPerformanceConfig(
  params: Record<string, unknown>
): WorkflowPerformanceConfig {
  const providedConfig = params.performanceConfig as WorkflowPerformanceConfig | undefined;
  
  if (providedConfig) {
    // Merge provided config with defaults
    return mergePerformanceConfig(providedConfig, DEFAULT_CONFIG);
  }
  
  // Use default config if none provided
  return DEFAULT_CONFIG;
}

/**
 * Initialize performance configuration in workflow context
 * 
 * Adds performance config to the workflow context so it's available
 * to all workflow steps. This should be called during workflow initialization.
 * 
 * @param context - Workflow context (will be modified)
 * @param params - Workflow execution parameters
 * @returns The performance config that was added to context
 */
export function initializePerformanceConfigInContext(
  context: Record<string, unknown>,
  params: Record<string, unknown>
): WorkflowPerformanceConfig {
  const perfConfig = getWorkflowPerformanceConfig(params);
  context.performanceConfig = perfConfig;
  return perfConfig;
}

