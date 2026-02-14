/**
 * Knowledge Graph Management Routes
 * 
 * Provides API endpoints for:
 * - SPARQL query execution
 * - Git-like versioning commands (branch, commit, stash, merge, etc.)
 * - Branch status and pending changes
 */

import express from 'express';
import { getGraphDBClient } from '../config/graphdb.js';
import { GraphDBQueryService } from '../services/knowledge-graph/core/GraphDBQueryService.js';
import { KnowledgeGraphVersionManager } from '../services/knowledge-graph/versioning/KnowledgeGraphVersionManager.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError, NotFoundError, ServiceUnavailableError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Health check endpoint to verify route is registered
router.get('/health', (_req, res) => {
  res.json({ 
    success: true, 
    message: 'Knowledge Graph Management API is available',
    timestamp: new Date().toISOString()
  });
});

// Initialize services
let queryService: GraphDBQueryService | null = null;
let versionManager: KnowledgeGraphVersionManager | null = null;

/**
 * Helper function to wrap GraphDB-dependent operations with proper error handling
 * Ensures ServiceUnavailableError is thrown when GraphDB is not available
 * Handles both synchronous and asynchronous errors
 */
function handleGraphDBOperation<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  try {
    return Promise.resolve(operation()).catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        error instanceof ServiceUnavailableError ||
        errorMessage.includes('GraphDB') ||
        errorMessage.includes('not initialized') ||
        errorMessage.includes('not available') ||
        errorMessage.includes('GraphDB client not initialized')
      ) {
        throw new ServiceUnavailableError(
          `GraphDB is not available. ${operationName} requires GraphDB to be connected.`,
          {
            error: errorMessage,
            suggestion: 'Please ensure GraphDB is running and connected.'
          }
        );
      }
      throw error;
    });
  } catch (error) {
    // Handle synchronous errors (e.g., when getVersionManager() throws immediately)
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      error instanceof ServiceUnavailableError ||
      errorMessage.includes('GraphDB') ||
      errorMessage.includes('not initialized') ||
      errorMessage.includes('not available') ||
      errorMessage.includes('GraphDB client not initialized')
    ) {
      return Promise.reject(new ServiceUnavailableError(
        `GraphDB is not available. ${operationName} requires GraphDB to be connected.`,
        {
          error: errorMessage,
          suggestion: 'Please ensure GraphDB is running and connected.'
        }
      ));
    }
    return Promise.reject(error);
  }
}

function getQueryService(): GraphDBQueryService {
  if (!queryService) {
    try {
      const client = getGraphDBClient();
      queryService = new GraphDBQueryService(client);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error }, 'GraphDB client not available for query service');
      throw new ServiceUnavailableError(
        'GraphDB is not available. SPARQL queries require GraphDB to be connected.',
        {
          error: errorMessage,
          suggestion: 'Please ensure GraphDB is running and connected.'
        }
      );
    }
  }
  return queryService;
}

function getVersionManager(): KnowledgeGraphVersionManager {
  if (!versionManager) {
    try {
      const client = getGraphDBClient();
      versionManager = new KnowledgeGraphVersionManager(client);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error }, 'GraphDB client not available for version manager');
      throw new ServiceUnavailableError(
        'GraphDB is not available. Knowledge graph management features require GraphDB to be connected.',
        {
          error: errorMessage,
          suggestion: 'Please ensure GraphDB is running and connected.'
        }
      );
    }
  }
  return versionManager;
}

// ============================================================================
// SPARQL Query Endpoints
// ============================================================================

/**
 * POST /api/kg/query
 * Execute a SPARQL query
 */
router.post('/query', asyncHandler(async (req, res) => {
  const { query, limit, timeout, queryType } = req.body;

  if (!query || typeof query !== 'string') {
    throw new BadRequestError('query is required and must be a string');
  }

  if (limit !== undefined && (typeof limit !== 'number' || limit < 1 || limit > 10000)) {
    throw new BadRequestError('limit must be a number between 1 and 10000');
  }

  if (timeout !== undefined && (typeof timeout !== 'number' || timeout < 1000 || timeout > 300000)) {
    throw new BadRequestError('timeout must be a number between 1000 and 300000 milliseconds');
  }

  const startTime = Date.now();
  
  const result = await handleGraphDBOperation(async () => {
    const service = getQueryService();
    return await service.executeQuery(query, {
      limit,
      timeout,
      queryType: queryType as 'SELECT' | 'ASK' | 'CONSTRUCT' | 'UPDATE' | undefined,
    });
  }, 'Executing SPARQL query');

  const executionTime = Date.now() - startTime;

  res.json({
    success: true,
    ...result,
    summary: {
      ...result.summary,
      executionTime,
    },
  });
}));

// ============================================================================
// Versioning Command Endpoints
// ============================================================================

/**
 * GET /api/kg/status
 * Get current branch status, pending changes, and stash info
 */
router.get('/status', asyncHandler(async (_req, res) => {
  try {
    const vm = getVersionManager();
    
    const currentBranch = await vm.getCurrentBranch();
    const stats = await vm.getBranchStats(currentBranch);
    
    // Get pending changes count (entities/relationships in pending-changes branch)
    const pendingStats = currentBranch === 'pending-changes' 
      ? stats 
      : await vm.getBranchStats('pending-changes').catch(() => ({ entityCount: 0, relationshipCount: 0 }));

    res.json({
      success: true,
      currentBranch,
      stats,
      pendingChanges: {
        branch: 'pending-changes',
        entityCount: pendingStats.entityCount,
        relationshipCount: pendingStats.relationshipCount,
      },
    });
  } catch (error) {
    // If GraphDB is not available, return a proper error response
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('GraphDB') || errorMessage.includes('not initialized')) {
      throw new ServiceUnavailableError(
        'GraphDB is not available. Knowledge graph management features require GraphDB to be connected.',
        {
          error: errorMessage,
          suggestion: 'Please ensure GraphDB is running and connected.'
        }
      );
    }
    // Re-throw other errors to be handled by asyncHandler
    throw error;
  }
}));

/**
 * GET /api/kg/branches
 * List all branches
 */
router.get('/branches', asyncHandler(async (_req, res) => {
  const branches = await handleGraphDBOperation(async () => {
    const vm = getVersionManager();
    return await vm.listBranches();
  }, 'Listing branches');

  res.json({
    success: true,
    branches,
  });
}));

/**
 * POST /api/kg/branches
 * Create a new branch
 */
router.post('/branches', asyncHandler(async (req, res) => {
  const { name, setAsCurrent, parentBranch } = req.body;

  if (!name || typeof name !== 'string') {
    throw new BadRequestError('name is required and must be a string');
  }

  await handleGraphDBOperation(async () => {
    const vm = getVersionManager();
    await vm.createBranch(name, setAsCurrent === true, parentBranch || null);
  }, 'Creating branch');

  res.json({
    success: true,
    message: `Branch '${name}' created`,
    branch: name,
  });
}));

/**
 * POST /api/kg/branches/:name/switch
 * Switch to a branch
 */
router.post('/branches/:name/switch', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { stashChanges } = req.body;

  await handleGraphDBOperation(async () => {
    const vm = getVersionManager();
    await vm.switchBranch(name, stashChanges !== false);
  }, 'Switching branch');

  res.json({
    success: true,
    message: `Switched to branch '${name}'`,
    branch: name,
  });
}));

/**
 * POST /api/kg/commit
 * Commit pending changes to current branch
 */
router.post('/commit', asyncHandler(async (req, res) => {
  const { message, workflowRunId, metadata } = req.body;

  const result = await handleGraphDBOperation(async () => {
    const vm = getVersionManager();
    const currentBranch = await vm.getCurrentBranch();

    // Create version snapshot
    const version = await vm.createVersionSnapshot(
      currentBranch,
      workflowRunId,
      {
        ...metadata,
        commitMessage: message || 'Committed pending changes',
      }
    );

    return { version, currentBranch };
  }, 'Committing changes');

  res.json({
    success: true,
    message: 'Changes committed',
    version: result.version.version,
    branch: result.currentBranch,
    entityCount: result.version.entityCount,
    relationshipCount: result.version.relationshipCount,
  });
}));

/**
 * POST /api/kg/stash
 * Stash current changes
 */
router.post('/stash', asyncHandler(async (req, res) => {
  const { description } = req.body;

  const result = await handleGraphDBOperation(async () => {
    const vm = getVersionManager();
    const currentBranch = await vm.getCurrentBranch();
    const stashId = await vm.stash(currentBranch, description);
    return { stashId, currentBranch };
  }, 'Stashing changes');

  res.json({
    success: true,
    message: 'Changes stashed',
    stashId: result.stashId,
    branch: result.currentBranch,
  });
}));

/**
 * GET /api/kg/stash
 * List all stashes (optionally filtered by branch)
 */
router.get('/stash', asyncHandler(async (req, res) => {
  const { branch } = req.query;
  
  const stashes = await handleGraphDBOperation(async () => {
    const vm = getVersionManager();
    return await vm.listStashes(branch as string | undefined);
  }, 'Listing stashes');
  
  res.json({
    success: true,
    stashes,
    count: stashes.length
  });
}));

/**
 * GET /api/kg/stash/:stashId
 * Get a specific stash
 */
router.get('/stash/:stashId', asyncHandler(async (req, res) => {
  const { stashId } = req.params;
  
  const stash = await handleGraphDBOperation(async () => {
    const vm = getVersionManager();
    return await vm.getStash(stashId);
  }, 'Getting stash');
  
  if (!stash) {
    throw new NotFoundError(`Stash ${stashId} not found`);
  }
  
  res.json({
    success: true,
    stash
  });
}));

/**
 * POST /api/kg/stash/pop
 * Apply stashed changes
 */
router.post('/stash/pop', asyncHandler(async (req, res) => {
  const { stashId, targetBranch } = req.body;
  
  if (!stashId) {
    throw new BadRequestError('stashId is required');
  }
  
  const result = await handleGraphDBOperation(async () => {
    const vm = getVersionManager();
    return await vm.stashPop(stashId, targetBranch);
  }, 'Applying stash');
  
  res.json({
    success: result.applied,
    message: result.message,
    stashId
  });
}));

/**
 * POST /api/kg/stash/drop
 * Discard stashed changes
 */
router.post('/stash/drop', asyncHandler(async (req, res) => {
  const { stashId } = req.body;
  
  if (!stashId) {
    throw new BadRequestError('stashId is required');
  }
  
  await handleGraphDBOperation(async () => {
    const vm = getVersionManager();
    await vm.stashDrop(stashId);
  }, 'Dropping stash');
  
  res.json({
    success: true,
    message: `Stash ${stashId} dropped successfully`
  });
}));

/**
 * POST /api/kg/merge
 * Merge one branch into another
 */
router.post('/merge', asyncHandler(async (req, res) => {
  const { sourceBranch, targetBranch } = req.body;

  if (!sourceBranch || !targetBranch) {
    throw new BadRequestError('sourceBranch and targetBranch are required');
  }

  const result = await handleGraphDBOperation(async () => {
    const vm = getVersionManager();
    return await vm.merge(sourceBranch, targetBranch);
  }, 'Merging branches');

  res.json({
    success: result.merged,
    message: result.merged ? '[i18n:apiMessages.branchesMerged]' : '[i18n:apiMessages.mergeCompletedWithConflicts]',
    ...result,
  });
}));

/**
 * GET /api/kg/diff/:branch1/:branch2
 * Get differences between two branches
 */
router.get('/diff/:branch1/:branch2', asyncHandler(async (req, res) => {
  const { branch1, branch2 } = req.params;

  const diff = await handleGraphDBOperation(async () => {
    const vm = getVersionManager();
    return await vm.getBranchDiff(branch1, branch2);
  }, 'Getting branch diff');
  
  res.json({
    success: true,
    branch1,
    branch2,
    entities: {
      added: diff.entities.added,
      removed: diff.entities.removed,
      modified: diff.entities.modified,
      addedCount: diff.entities.added.length,
      removedCount: diff.entities.removed.length,
      modifiedCount: diff.entities.modified.length
    },
    relationships: {
      added: diff.relationships.added,
      removed: diff.relationships.removed,
      modified: diff.relationships.modified,
      addedCount: diff.relationships.added.length,
      removedCount: diff.relationships.removed.length,
      modifiedCount: diff.relationships.modified.length
    }
  });
}));

/**
 * GET /api/kg/log
 * Get version history
 */
router.get('/log', asyncHandler(async (req, res) => {
  const { branch, limit } = req.query;
  const parsedLimit = limit ? parseInt(limit as string) : 10;

  if (limit && (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100)) {
     throw new BadRequestError('limit must be a number between 1 and 100');
  }

  const versions = await handleGraphDBOperation(async () => {
    const vm = getVersionManager();
    return await vm.getVersionHistory(branch as string | undefined, parsedLimit);
  }, 'Getting version history');

  res.json({
    success: true,
    versions,
  });
}));

/**
 * POST /api/kg/reset
 * Reset to a specific version
 */
router.post('/reset', asyncHandler(async (req, res) => {
  const { version } = req.body;

  if (!version) {
    throw new BadRequestError('version is required');
  }

  const result = await handleGraphDBOperation(async () => {
    const vm = getVersionManager();
    return await vm.resetToVersion(version);
  }, 'Resetting to version');

  res.json({
    success: result.success,
    message: result.message,
    entitiesRemoved: result.entitiesRemoved,
    entitiesRestored: result.entitiesRestored,
    relationshipsRemoved: result.relationshipsRemoved,
    relationshipsRestored: result.relationshipsRestored,
    errors: result.errors
  });
}));

export default router;

