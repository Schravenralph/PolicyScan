/**
 * Action-Specific Timeout Configuration
 * 
 * Defines timeout values for different types of workflow actions.
 * These timeouts are used to configure HTTP clients and monitor API call durations.
 */

import { HTTP_TIMEOUTS } from './httpClient.js';

/**
 * Timeout configuration for different action types
 * Values are in milliseconds
 */
export const ACTION_TIMEOUTS = {
  // LLM-related actions
  llm_call: HTTP_TIMEOUTS.LONG, // 2 minutes for LLM calls
  llm_extraction: HTTP_TIMEOUTS.LONG, // 2 minutes for entity extraction
  llm_labeling: HTTP_TIMEOUTS.LONG, // 2 minutes for semantic labeling
  gemini_call: HTTP_TIMEOUTS.VERY_LONG, // 5 minutes for Gemini API calls (can be increased via GEMINI_TIMEOUT env var)
  
  // Scraping operations
  scrape_page: HTTP_TIMEOUTS.STANDARD, // 30 seconds for single page scraping
  scrape_website: HTTP_TIMEOUTS.LONG, // 2 minutes for full website scraping
  scrape_parallel: HTTP_TIMEOUTS.LONG, // 2 minutes for parallel scraping operations
  
  // Graph database queries
  graph_query: HTTP_TIMEOUTS.STANDARD, // 30 seconds for graph queries
  graph_stream: HTTP_TIMEOUTS.LONG, // 2 minutes for streaming graph queries
  
  // External API calls
  dso_api_call: HTTP_TIMEOUTS.STANDARD, // 30 seconds for DSO API calls
  dso_download: HTTP_TIMEOUTS.VERY_LONG, // 5 minutes for DSO file downloads
  external_api_call: HTTP_TIMEOUTS.STANDARD, // 30 seconds for general external API calls
  
  // Internal operations (typically faster)
  internal_api_call: HTTP_TIMEOUTS.SHORT, // 5 seconds for internal API calls
  database_query: HTTP_TIMEOUTS.SHORT, // 5 seconds for database queries
  
  // Default timeout for unknown action types
  default: HTTP_TIMEOUTS.STANDARD, // 30 seconds default
} as const;

/**
 * Get timeout value for a specific action type
 * 
 * @param actionType - The type of action (e.g., 'llm_call', 'scrape_page')
 * @returns Timeout value in milliseconds
 */
export function getActionTimeout(actionType: string): number {
  return ACTION_TIMEOUTS[actionType as keyof typeof ACTION_TIMEOUTS] || ACTION_TIMEOUTS.default;
}

/**
 * Check if an action type has a custom timeout configured
 * 
 * @param actionType - The type of action
 * @returns True if a custom timeout is configured, false otherwise
 */
export function hasCustomTimeout(actionType: string): boolean {
  return actionType in ACTION_TIMEOUTS && actionType !== 'default';
}

/**
 * Get all configured action timeout types
 * 
 * @returns Array of action type names
 */
export function getConfiguredActionTypes(): string[] {
  return Object.keys(ACTION_TIMEOUTS).filter(key => key !== 'default');
}


