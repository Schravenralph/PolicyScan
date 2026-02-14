/**
 * Branch-Aware Query Helper
 * 
 * Helps query endpoints check both 'main' and 'pending-changes' branches
 * to ensure data is found even if it's only in pending-changes.
 * 
 * WI-KG-GAP-006: Addresses branch isolation issue where entities might
 * be in pending-changes but queries only check main.
 */

import { getGraphDBClient, connectGraphDB } from '../../../config/graphdb.js';
import { KnowledgeGraphVersionManager } from '../../../services/knowledge-graph/versioning/KnowledgeGraphVersionManager.js';
import { GraphDBKnowledgeGraphService } from '../../../services/graphs/knowledge/GraphDBKnowledgeGraphService.js';
import { logger } from '../../../utils/logger.js';

export interface BranchAwareQueryOptions {
  /**
   * If true, check pending-changes branch if main is empty
   * Default: true
   */
  fallbackToPending?: boolean;
  
  /**
   * If true, return branch information in result
   * Default: false
   */
  includeBranchInfo?: boolean;
}

export interface BranchAwareQueryResult<T> {
  data: T;
  branch: string;
  fallbackUsed?: boolean;
}

/**
 * Execute a query function with branch-aware fallback
 * 
 * Tries main branch first, then falls back to pending-changes if:
 * - fallbackToPending is true (default)
 * - main branch query returns empty/zero results
 * 
 * @param queryFn - Function that takes a KG service and returns query result
 * @param isEmptyFn - Function to check if result is empty (returns true if empty)
 * @param options - Query options
 * @returns Query result with branch information
 */
export async function executeBranchAwareQuery<T>(
  queryFn: (kgService: GraphDBKnowledgeGraphService) => Promise<T>,
  isEmptyFn: (result: T) => boolean,
  options: BranchAwareQueryOptions = {}
): Promise<BranchAwareQueryResult<T>> {
  const { fallbackToPending = true, includeBranchInfo = false } = options;
  
  try {
    await connectGraphDB();
    const client = getGraphDBClient();
    const vm = new KnowledgeGraphVersionManager(client);
    await vm.initialize();
    
    const originalBranch = await vm.getCurrentBranch();
    const kgService = new GraphDBKnowledgeGraphService(client);
    await kgService.initialize();
    
    // Try main branch first
    try {
      await vm.switchBranch('main', false);
      const mainResult = await queryFn(kgService);
      
      // If main has results, return them
      if (!isEmptyFn(mainResult)) {
        await vm.switchBranch(originalBranch, false);
        
        return {
          data: mainResult,
          branch: 'main',
          ...(includeBranchInfo && { fallbackUsed: false })
        };
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to query main branch, will try pending-changes');
    }
    
    // Main is empty or failed, try pending-changes if fallback is enabled
    if (fallbackToPending) {
      try {
        await vm.switchBranch('pending-changes', false);
        const pendingResult = await queryFn(kgService);
        
        await vm.switchBranch(originalBranch, false);
        
        return {
          data: pendingResult,
          branch: 'pending-changes',
          ...(includeBranchInfo && { fallbackUsed: true })
        };
      } catch (error) {
        logger.warn({ error }, 'Failed to query pending-changes branch');
        try {
          await vm.switchBranch(originalBranch, false);
        } catch {
          // Ignore switch back errors
        }
      }
    }
    
    // Both branches failed or empty, return empty result from main
    await vm.switchBranch(originalBranch, false);
    const emptyResult = await queryFn(kgService);
    
    return {
      data: emptyResult,
      branch: originalBranch,
      ...(includeBranchInfo && { fallbackUsed: false })
    };
  } catch (error) {
    logger.error({ error }, 'Failed to execute branch-aware query');
    throw error;
  }
}

/**
 * Check if stats result is empty
 */
export function isStatsEmpty(stats: { totalEntities?: number; totalRelationships?: number }): boolean {
  return (stats.totalEntities || 0) === 0 && (stats.totalRelationships || 0) === 0;
}

/**
 * Check if entity array is empty
 */
export function isEntityArrayEmpty(entities: unknown[]): boolean {
  return !entities || entities.length === 0;
}
