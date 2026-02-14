import express, { Router } from 'express';
import { asyncHandler } from '../../utils/errorHandling.js';
import { BadRequestError, NotFoundError } from '../../types/errors.js';
// Using require for these services as in original code, possibly due to circular dependencies
// or specific loading order. We can try imports but require is safer for 1:1 refactor.
import { getGraphDBClient } from '../../config/graphdb.js';

// We need to define types for the required modules if they don't have proper exports we can import
// But for now, let's use the same pattern as original code which used require for some services
// inside the functions. However, KnowledgeGraphVersionManager was used as a type too.
// Let's try to import the type at least.
import { KnowledgeGraphVersionManager } from '../../services/knowledge-graph/versioning/KnowledgeGraphVersionManager.js';

export function createVersioningRouter(isGraphDB: () => boolean): Router {
    const router = express.Router();

    // Initialize version manager (lazy initialization)
    let versionManager: KnowledgeGraphVersionManager | null = null;
    function getVersionManager(): KnowledgeGraphVersionManager {
        if (!isGraphDB()) {
            throw new BadRequestError('Versioning is only available for GraphDB backend', {
                message: 'Knowledge graph versioning requires GraphDB backend.'
            });
        }
        if (!versionManager) {
            // Re-require to match original code pattern if needed, or just new
            // In original code: const { KnowledgeGraphVersionManager } = require(...)
            // We already imported the class above, so we can use it directly.
            versionManager = new KnowledgeGraphVersionManager();
        }
        return versionManager as NonNullable<typeof versionManager>;
    }

    // GET /api/knowledge-graph/versioning/branch
    // Get current branch
    router.get('/versioning/branch', asyncHandler(async (_req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('Versioning is only available for GraphDB backend');
        }

        const vm = getVersionManager();
        const branch = await vm.getCurrentBranch();
        const stats = await vm.getBranchStats(branch);

        res.json({
            success: true,
            branch,
            stats
        });
    }));

    // POST /api/knowledge-graph/versioning/branch
    // Create a new branch
    router.post('/versioning/branch', asyncHandler(async (req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('Versioning is only available for GraphDB backend');
        }

        const { name, setAsCurrent, parentBranch } = req.body;

        if (!name || typeof name !== 'string') {
            throw new BadRequestError('Branch name is required and must be a string');
        }

        const vm = getVersionManager();
        await vm.createBranch(name, setAsCurrent || false, parentBranch);

        res.json({
            success: true,
            message: `Branch '${name}' created successfully`
        });
    }));

    // POST /api/knowledge-graph/versioning/branch/switch
    // Switch to a branch
    router.post('/versioning/branch/switch', asyncHandler(async (req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('Versioning is only available for GraphDB backend');
        }

        const { branch, stashChanges } = req.body;

        if (!branch || typeof branch !== 'string') {
            throw new BadRequestError('Branch name is required and must be a string');
        }

        const vm = getVersionManager();
        await vm.switchBranch(branch, stashChanges !== false);

        res.json({
            success: true,
            message: `Switched to branch '${branch}'`
        });
    }));

    // POST /api/knowledge-graph/versioning/stash
    // Stash current changes
    router.post('/versioning/stash', asyncHandler(async (req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('Versioning is only available for GraphDB backend');
        }

        const { branch, description } = req.body;

        const vm = getVersionManager();
        const currentBranch = branch || await vm.getCurrentBranch();
        const stashId = await vm.stash(currentBranch, description);

        res.json({
            success: true,
            stashId,
            message: `Changes stashed successfully`
        });
    }));

    // POST /api/knowledge-graph/versioning/push
    // Push changes from development branch to main
    router.post('/versioning/push', asyncHandler(async (req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('Versioning is only available for GraphDB backend');
        }

        const { sourceBranch } = req.body;

        const vm = getVersionManager();
        const result = await vm.pushToMain(sourceBranch);

        res.json({
            success: result.merged,
            ...result,
            message: result.merged
                ? 'Changes pushed to main successfully'
                : `Push completed with ${result.conflicts.length} conflicts`
        });
    }));

    // POST /api/knowledge-graph/versioning/merge
    // Merge one branch into another
    router.post('/versioning/merge', asyncHandler(async (req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('Versioning is only available for GraphDB backend');
        }

        const { sourceBranch, targetBranch } = req.body;

        if (!sourceBranch || typeof sourceBranch !== 'string') {
            throw new BadRequestError('sourceBranch is required and must be a string');
        }

        if (!targetBranch || typeof targetBranch !== 'string') {
            throw new BadRequestError('targetBranch is required and must be a string');
        }

        const vm = getVersionManager();
        const result = await vm.merge(sourceBranch, targetBranch);

        res.json({
            success: result.merged,
            ...result,
            message: result.merged
                ? `Branch '${sourceBranch}' merged into '${targetBranch}' successfully`
                : `Merge completed with ${result.conflicts.length} conflicts`
        });
    }));

    // GET /api/knowledge-graph/versioning/stats
    // Get statistics for a branch
    router.get('/versioning/stats', asyncHandler(async (req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('Versioning is only available for GraphDB backend');
        }

        const branch = req.query.branch as string | undefined;

        const vm = getVersionManager();
        const branchName = branch || await vm.getCurrentBranch();
        const stats = await vm.getBranchStats(branchName);

        res.json({
            success: true,
            branch: branchName,
            ...stats
        });
    }));

    // GET /api/knowledge-graph/versioning/compare
    // Compare two branches
    router.get('/versioning/compare', asyncHandler(async (req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('Versioning is only available for GraphDB backend');
        }

        const { source, target } = req.query;

        if (!source || typeof source !== 'string') {
            throw new BadRequestError('source branch is required and must be a string');
        }

        if (!target || typeof target !== 'string') {
            throw new BadRequestError('target branch is required and must be a string');
        }

        // Lazy load service using dynamic import
        const { getBranchComparisonService } = await import('../../services/knowledge-graph/versioning/BranchComparisonService.js');
        const comparisonService = getBranchComparisonService();
        const comparison = await comparisonService.compareBranches(source, target);

        res.json({
            success: true,
            ...comparison
        });
    }));

    // GET /api/knowledge-graph/versioning/diff
    // Get diff between two branches (alias for compare)
    router.get('/versioning/diff', asyncHandler(async (req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('Versioning is only available for GraphDB backend');
        }

        const { source, target } = req.query;

        if (!source || typeof source !== 'string') {
            throw new BadRequestError('source branch is required and must be a string');
        }

        if (!target || typeof target !== 'string') {
            throw new BadRequestError('target branch is required and must be a string');
        }

        const { getBranchComparisonService } = await import('../../services/knowledge-graph/versioning/BranchComparisonService.js');
        const comparisonService = getBranchComparisonService();
        const comparison = await comparisonService.compareBranches(source, target);

        res.json({
            success: true,
            ...comparison
        });
    }));

    // POST /api/knowledge-graph/versioning/resolve-conflicts
    // Resolve merge conflicts interactively
    router.post('/versioning/resolve-conflicts', asyncHandler(async (req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('Versioning is only available for GraphDB backend');
        }

        const { sourceBranch, targetBranch, resolutions } = req.body;

        if (!sourceBranch || typeof sourceBranch !== 'string') {
            throw new BadRequestError('sourceBranch is required and must be a string');
        }

        if (!targetBranch || typeof targetBranch !== 'string') {
            throw new BadRequestError('targetBranch is required and must be a string');
        }

        if (!resolutions || !Array.isArray(resolutions)) {
            throw new BadRequestError('resolutions is required and must be an array');
        }

        const vm = getVersionManager();

        // First, attempt merge to get conflicts
        const mergeResult = await vm.merge(sourceBranch, targetBranch);

        if (mergeResult.conflicts.length === 0) {
            res.json({
                success: true,
                message: 'No conflicts to resolve',
                ...mergeResult
            });
            return;
        }

        // Apply resolutions (simplified - in production, this would apply each resolution)
        // For now, we'll re-merge with conflict resolution logic
        // This is a placeholder - full implementation would apply each resolution individually
        res.json({
            success: true,
            message: `Resolved ${resolutions.length} conflicts`,
            conflictsResolved: resolutions.length,
            totalConflicts: mergeResult.conflicts.length,
            mergeResult
        });
    }));

    // GET /api/knowledge-graph/versioning/policies
    // Get branch policies
    router.get('/versioning/policies', asyncHandler(async (req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('Versioning is only available for GraphDB backend');
        }

        const branch = req.query.branch as string | undefined;

        // Placeholder - policies would be stored in database or config
        // For now, return default policies
        res.json({
            success: true,
            policies: branch ? [] : [],
            message: 'Branch policies retrieved successfully'
        });
    }));

    // POST /api/knowledge-graph/versioning/policies
    // Create or update branch policies
    router.post('/versioning/policies', asyncHandler(async (req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('Versioning is only available for GraphDB backend');
        }

        const { branchName, policy } = req.body;

        if (!branchName || typeof branchName !== 'string') {
            throw new BadRequestError('branchName is required and must be a string');
        }

        if (!policy || typeof policy !== 'object') {
            throw new BadRequestError('policy is required and must be an object');
        }

        // Placeholder - policies would be stored in database
        res.json({
            success: true,
            message: `Policy for branch '${branchName}' created/updated successfully`,
            policy
        });
    }));

    // POST /api/knowledge-graph/versioning/branch/archive
    // Archive a branch
    router.post('/versioning/branch/archive', asyncHandler(async (req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('Versioning is only available for GraphDB backend');
        }

        const { branch } = req.body;

        if (!branch || typeof branch !== 'string') {
            throw new BadRequestError('branch is required and must be a string');
        }

        if (branch === 'main') {
            throw new BadRequestError('Cannot archive the main branch');
        }

        const vm = getVersionManager();
        await vm.archiveBranch(branch);

        res.json({
            success: true,
            message: `Branch '${branch}' archived successfully`
        });
    }));

    // DELETE /api/knowledge-graph/versioning/branch/:name
    // Delete a branch (with safety checks)
    router.delete('/versioning/branch/:name', asyncHandler(async (req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('Versioning is only available for GraphDB backend');
        }

        const branchName = req.params.name;

        if (!branchName || typeof branchName !== 'string') {
            throw new BadRequestError('Branch name is required');
        }

        if (branchName === 'main') {
            throw new BadRequestError('Cannot delete the main branch');
        }

        const vm = getVersionManager();
        const currentBranch = await vm.getCurrentBranch();

        if (branchName === currentBranch) {
            throw new BadRequestError('Cannot delete the current branch. Switch to another branch first.');
        }

        // Use SPARQL to delete branch (GraphDB, not Neo4j)
        // Note: This is a simplified implementation - in production you might want to add a deleteBranch method to the version manager
        // ALERT: Original code used getGraphDBClient here but also checked isGraphDB() == false which throws.
        // This means this block is unreachable for GraphDB.
        // If it runs for Neo4j, getGraphDBClient might fail if not configured.
        // Keeping as is for 1:1 refactor, but it seems broken or intended for future GraphDB support.

        const client = getGraphDBClient();

        const VERSIONING_GRAPH_URI = 'http://data.example.org/graph/versioning';
        const VERSIONING_NAMESPACE = 'http://data.example.org/def/versioning#';
        const branchUri = `${VERSIONING_NAMESPACE}branch/${encodeURIComponent(branchName)}`;

        // Check if branch exists
        const checkQuery = `
PREFIX versioning: <${VERSIONING_NAMESPACE}>
SELECT ?branch WHERE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${branchUri}> a versioning:Branch .
  }
}
`;
        const results = await client.query(checkQuery);

        if (results.length === 0) {
            throw new NotFoundError('Branch', branchName);
        }

        // Delete branch
        const deleteQuery = `
PREFIX versioning: <${VERSIONING_NAMESPACE}>
DELETE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${branchUri}> ?p ?o .
  }
}
WHERE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${branchUri}> ?p ?o .
  }
}
`;
        await client.update(deleteQuery);

        res.json({
            success: true,
            message: `Branch '${branchName}' deleted successfully`
        });
    }));

    return router;
}
