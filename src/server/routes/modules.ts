/**
 * Module Discovery API Routes
 * 
 * Provides endpoints for discovering and querying workflow modules.
 * Supports filtering, searching, and retrieving module metadata.
 */

import express from 'express';
import { moduleRegistry } from '../services/workflow/WorkflowModuleRegistry.js';
import type { ModuleSearchFilters } from '../types/module-metadata.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { NotFoundError } from '../types/errors.js';

const router = express.Router();

/**
 * GET /api/modules
 * List all available modules with optional filtering
 * 
 * Query parameters:
 * - category: Filter by category
 * - tags: Comma-separated list of tags
 * - author: Filter by author name
 * - query: Search query (searches name, description, tags, keywords)
 * - published: Filter by published status (true/false)
 * - minVersion: Minimum version requirement
 */
router.get('/', asyncHandler(async (req, res) => {
    const filters: ModuleSearchFilters = {};
    
    if (req.query.category) {
        filters.category = req.query.category as string;
    }
    
    if (req.query.tags) {
        filters.tags = (req.query.tags as string).split(',').map(t => t.trim());
    }
    
    if (req.query.author) {
        filters.author = req.query.author as string;
    }
    
    if (req.query.query) {
        filters.query = req.query.query as string;
    }
    
    if (req.query.published !== undefined) {
        filters.published = req.query.published === 'true';
    }
    
    if (req.query.minVersion) {
        filters.minVersion = req.query.minVersion as string;
    }
    
    const result = moduleRegistry.search(filters);
    
    res.json({
        modules: result.modules.map((entry: import('../types/module-metadata.js').ModuleRegistryEntry) => {
            const metadata = entry.metadata;
            return {
                metadata: {
                    id: metadata.id,
                    name: metadata.name,
                    version: metadata.version,
                    description: metadata.description,
                    category: metadata.category,
                    tags: metadata.tags,
                    author: metadata.author,
                    published: metadata.published,
                    dependencies: metadata.dependencies,
                    keywords: metadata.keywords,
                    createdAt: metadata.createdAt,
                    updatedAt: metadata.updatedAt,
                },
                usageCount: entry.usageCount,
                registeredAt: entry.registeredAt,
                parameterSchema: entry.module.getParameterSchema(),
                defaultParams: entry.module.getDefaultParams(),
            };
        }),
        total: result.total,
        hasMore: result.hasMore,
    });
}));

/**
 * GET /api/modules/categories
 * Get all available module categories
 */
router.get('/categories', asyncHandler(async (_req, res) => {
    const categories = moduleRegistry.getCategories();
    res.json({ categories });
}));

/**
 * GET /api/modules/categories/list
 * Alias for /categories (backward compatibility)
 */
router.get('/categories/list', asyncHandler(async (_req, res) => {
    const categories = moduleRegistry.getCategories();
    res.json({ categories });
}));

/**
 * GET /api/modules/categories/:category
 * Get all modules in a specific category
 */
router.get('/categories/:category', asyncHandler(async (req, res) => {
    const { category } = req.params;
    const modules = moduleRegistry.getByCategory(category);
    
    res.json({
        category,
        modules: modules.map(entry => ({
            id: entry.metadata.id,
            name: entry.metadata.name,
            description: entry.metadata.description,
            version: entry.metadata.version,
            tags: entry.metadata.tags,
            published: entry.metadata.published,
            usageCount: entry.usageCount,
        })),
        total: modules.length,
    });
}));

/**
 * GET /api/modules/category/:category
 * Alias for /categories/:category (backward compatibility)
 */
router.get('/category/:category', asyncHandler(async (req, res) => {
    const { category } = req.params;
    const modules = moduleRegistry.getByCategory(category);
    
    res.json({
        category,
        modules: modules.map(entry => ({
            metadata: {
                id: entry.metadata.id,
                name: entry.metadata.name,
                description: entry.metadata.description,
                version: entry.metadata.version,
                category: entry.metadata.category,
                tags: entry.metadata.tags,
                published: entry.metadata.published,
            },
            usageCount: entry.usageCount,
        })),
        total: modules.length,
    });
}));

/**
 * GET /api/modules/tags
 * Get all available module tags
 */
router.get('/tags', asyncHandler(async (_req, res) => {
    const tags = moduleRegistry.getTags();
    res.json({ tags });
}));

/**
 * GET /api/modules/tags/list
 * Alias for /tags (backward compatibility)
 */
router.get('/tags/list', asyncHandler(async (_req, res) => {
    const tags = moduleRegistry.getTags();
    res.json({ tags });
}));

/**
 * GET /api/modules/tags/:tag
 * Get all modules with a specific tag
 */
router.get('/tags/:tag', asyncHandler(async (req, res) => {
    const { tag } = req.params;
    const modules = moduleRegistry.getByTag(tag);
    
    res.json({
        tag,
        modules: modules.map(entry => ({
            id: entry.metadata.id,
            name: entry.metadata.name,
            description: entry.metadata.description,
            version: entry.metadata.version,
            category: entry.metadata.category,
            published: entry.metadata.published,
            usageCount: entry.usageCount,
        })),
        total: modules.length,
    });
}));

/**
 * GET /api/modules/statistics
 * Get registry statistics
 */
router.get('/statistics', asyncHandler(async (_req, res) => {
    const stats = moduleRegistry.getStatistics();
    res.json(stats);
}));

/**
 * GET /api/modules/:moduleId/schema
 * Get the parameter schema for a module
 */
router.get('/:moduleId/schema', asyncHandler(async (req, res) => {
    const { moduleId } = req.params;
    const entry = moduleRegistry.get(moduleId);
    
    if (!entry) {
        throw new NotFoundError('Module', moduleId);
    }
    
    const parameterSchema = entry.module.getParameterSchema();
    res.json({
        moduleId: entry.metadata.id,
        parameters: parameterSchema,
        outputs: parameterSchema.outputs || [],
    });
}));

/**
 * GET /api/modules/:moduleId/dependencies
 * Get the dependency tree for a module
 */
router.get('/:moduleId/dependencies', asyncHandler(async (req, res) => {
    const { moduleId } = req.params;
    
    try {
        const tree = moduleRegistry.getDependencyTree(moduleId);
        res.json(tree);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('not found')) {
            throw new NotFoundError('Module', moduleId, { message: errorMessage });
        }
        throw error; // Re-throw to be handled by error middleware
    }
}));

/**
 * GET /api/modules/:moduleId/workflows
 * Get all workflows that use a specific module
 * This helps track module reuse across workflows (US-006 requirement)
 */
router.get('/:moduleId/workflows', asyncHandler(async (req, res) => {
    const { moduleId } = req.params;
    const entry = moduleRegistry.get(moduleId);
    
    if (!entry) {
        throw new NotFoundError('Module', moduleId);
    }

    // Import WorkflowModel dynamically to avoid circular dependencies
    const { WorkflowModel } = await import('../models/Workflow.js');
    const allWorkflows = await WorkflowModel.findAll();
    
    // Find workflows that use this module in any of their steps
    const workflowsUsingModule = allWorkflows.filter(workflow => {
        return workflow.steps.some(step => {
            // Check if step.action matches the module ID (case-insensitive)
            const stepAction = String(step.action || '').toLowerCase();
            const moduleIdLower = moduleId.toLowerCase();
            return stepAction === moduleIdLower || stepAction.includes(moduleIdLower);
        });
    });

    res.json({
        moduleId,
        moduleName: entry.metadata.name,
        workflows: workflowsUsingModule.map(workflow => ({
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            status: workflow.status,
            version: workflow.version,
            stepsUsingModule: workflow.steps
                .filter(step => {
                    const stepAction = String(step.action || '').toLowerCase();
                    const moduleIdLower = moduleId.toLowerCase();
                    return stepAction === moduleIdLower || stepAction.includes(moduleIdLower);
                })
                .map(step => ({
                    id: step.id,
                    name: step.name,
                    action: step.action,
                    params: step.params,
                })),
        })),
        total: workflowsUsingModule.length,
    });
}));

/**
 * GET /api/modules/:moduleId
 * Get detailed information about a specific module
 * This must be last to avoid matching /categories, /tags, /statistics, etc.
 */
router.get('/:moduleId', asyncHandler(async (req, res) => {
    const { moduleId } = req.params;
    const entry = moduleRegistry.get(moduleId);
    
    if (!entry) {
        throw new NotFoundError('Module', moduleId);
    }
    
    // Get dependency tree
    let dependencyTree;
    try {
        dependencyTree = moduleRegistry.getDependencyTree(moduleId);
    } catch (error) {
        // Log warning but don't fail the request if dependency tree can't be retrieved
        dependencyTree = null;
    }

    res.json({
        metadata: {
            id: entry.metadata.id,
            name: entry.metadata.name,
            version: entry.metadata.version,
            description: entry.metadata.description,
            category: entry.metadata.category,
            tags: entry.metadata.tags,
            author: entry.metadata.author,
            published: entry.metadata.published,
            dependencies: entry.metadata.dependencies,
            parameters: entry.module.getParameterSchema(),
            outputs: entry.module.getParameterSchema().outputs || [],
            keywords: entry.metadata.keywords,
            createdAt: entry.metadata.createdAt,
            updatedAt: entry.metadata.updatedAt,
        },
        registeredAt: entry.registeredAt,
        usageCount: entry.usageCount,
        parameterSchema: entry.module.getParameterSchema(),
        defaultParams: entry.module.getDefaultParams(),
        dependencyTree,
    });
}));


export function createModuleRoutes(): express.Router {
    return router;
}

export default router;
