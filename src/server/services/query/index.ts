/**
 * Query Service Exports
 * 
 * Central export point for query-related services.
 */

import { QueryPresetRegistry } from './QueryPresetRegistry.js';

export { QueryPresetRegistry } from './QueryPresetRegistry.js';
export type { QueryPreset } from './types.js';

// Export Query Decomposition and Planning services
export { QueryDecompositionService } from './QueryDecompositionService.js';
export type { DecomposedQuery, QueryIntent, SubQuestion, EvidenceSet } from './QueryDecompositionService.js';

export { RetrievalQueryPlanner } from './RetrievalQueryPlanner.js';
export type { RetrievalPlan, RetrievalStep, PlannedRetrievalResult } from './RetrievalQueryPlanner.js';

// Singleton instance for QueryPresetRegistry
let registryInstance: QueryPresetRegistry | null = null;

/**
 * Get the singleton instance of QueryPresetRegistry
 * @returns QueryPresetRegistry instance
 */
export function getQueryPresetRegistry(): QueryPresetRegistry {
  if (!registryInstance) {
    registryInstance = new QueryPresetRegistry();
  }
  return registryInstance;
}
