/**
 * StepTimeoutConfig
 * 
 * Provides step-type-specific default timeout configurations.
 * Different step types (scraping, API calls, processing) may require
 * different timeout values based on their typical execution times.
 */

import { validateEnv } from '../../config/env.js';

/**
 * Step type categories for timeout configuration
 */
export type StepType = 
  | 'api_call'           // External API calls (DSO, Google Search, etc.)
  | 'scraping'           // Web scraping operations
  | 'processing'         // Data processing, merging, scoring
  | 'database'           // Database operations
  | 'llm'                // LLM API calls
  | 'default';           // Default for unknown step types

/**
 * Map action names to step types for timeout configuration
 */
const ACTION_TYPE_MAP: Record<string, StepType> = {
  // API calls
  'enrich_dso_documents_optional': 'api_call',
  'search_officielebekendmakingen': 'api_call',
  'search_rechtspraak': 'api_call',
  'search_common_crawl_optional': 'api_call',
  
  // Scraping
  'scan_known_sources': 'scraping',
  'scrape_website': 'scraping',
  'explore_iplo': 'scraping',
  'bfs_crawl_websites': 'scraping',
  'scrape_horst_municipality': 'scraping',
  
  // Processing
  'merge_score_categorize': 'processing',
  'search_iplo_documents': 'processing',
  
  // Database
  'query_documents': 'database',
  'save_results': 'database',
  
  // LLM
  'generate_summary': 'llm',
  'analyze_document': 'llm',
};

/**
 * Default timeout values by step type (in milliseconds)
 */
const STEP_TYPE_TIMEOUTS: Record<StepType, number> = {
  api_call: 2 * 60 * 1000,      // 2 minutes - API calls should be relatively fast
  scraping: 30 * 60 * 1000,    // 30 minutes - Scraping/exploration operations can take longer
  processing: 5 * 60 * 1000,    // 5 minutes - Processing operations
  database: 1 * 60 * 1000,      // 1 minute - Database operations should be fast
  llm: 3 * 60 * 1000,           // 3 minutes - LLM calls can take time
  default: 5 * 60 * 1000,        // 5 minutes - Default fallback
};

/**
 * Get step type from action name
 */
export function getStepTypeFromAction(action: string): StepType {
  return ACTION_TYPE_MAP[action] || 'default';
}

/**
 * Get default timeout for a step type
 */
export function getDefaultTimeoutForStepType(stepType: StepType): number {
  return STEP_TYPE_TIMEOUTS[stepType];
}

/**
 * Get recommended timeout for a workflow step
 * 
 * Returns the appropriate timeout based on:
 * 1. Step-specific timeout (if configured)
 * 2. Step-type-specific default (based on action)
 * 3. Global default (from environment variable)
 * 
 * @param step - The workflow step
 * @param action - The action name (for determining step type)
 * @returns Recommended timeout in milliseconds
 */
export function getRecommendedTimeout(step: { timeout?: number }, action: string): number {
  // If step has explicit timeout, use it
  if (step.timeout !== undefined) {
    return step.timeout;
  }
  
  // Get step type from action
  const stepType = getStepTypeFromAction(action);
  
  // Use step-type-specific default
  const typeDefault = getDefaultTimeoutForStepType(stepType);
  
  // Fall back to global default if type default is not available
  const env = validateEnv();
  const globalDefault = env.WORKFLOW_STEP_DEFAULT_TIMEOUT_MS;
  
  // If the step type is 'default' (unknown action), prefer the global default configuration
  if (stepType === 'default') {
    return globalDefault;
  }

  // Use the more specific timeout (type default) if it's different from global,
  // otherwise use global default
  return typeDefault !== globalDefault ? typeDefault : globalDefault;
}

