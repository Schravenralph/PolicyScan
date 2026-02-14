import express, { Request, Response } from 'express';
import { validate } from '../middleware/validation.js';
import { workflowSchemas } from '../validation/workflowSchemas.js';
import { asyncHandler, throwIfNotFound } from '../utils/errorHandling.js';

/**
 * Workflow Module Routes
 * 
 * Handles routes for workflow module discovery and configuration.
 * Extracted from workflowRoutes.ts as part of Phase 3 refactoring.
 * 
 * @returns Express router with module routes
 */
export function createWorkflowModuleRouter(): express.Router {
    const router = express.Router();

    // ============================================
    // Workflow Module Endpoints (US-006)
    // ============================================

    // GET /api/workflows/modules
    // Get all available workflow modules
    router.get('/modules', asyncHandler(async (_req: Request, res: Response) => {
        const { moduleRegistry } = await import('../services/workflow/WorkflowModuleRegistry.js');
        const registry = moduleRegistry;
        const modules = registry.getAll();

        // Return module metadata (without execute functions)
        const moduleMetadata = modules.map(entry => ({
            id: entry.metadata.id,
            name: entry.metadata.name,
            description: entry.metadata.description,
            category: entry.metadata.category,
            defaultParams: entry.module.getDefaultParams(),
            parameterSchema: entry.module.getParameterSchema(),
        }));

        res.json(moduleMetadata);
    }));

    // GET /api/workflows/modules/:id
    // Get a specific module by ID
    router.get('/modules/:id', validate(workflowSchemas.getModule), asyncHandler(async (req: Request, res: Response) => {
        const { moduleRegistry } = await import('../services/workflow/WorkflowModuleRegistry.js');
        const registry = moduleRegistry;
        const module = registry.get(req.params.id);

        throwIfNotFound(module, 'Module', req.params.id);

        res.json({
            id: module.metadata.id,
            name: module.metadata.name,
            description: module.metadata.description,
            category: module.metadata.category,
            defaultParams: module.module.getDefaultParams(),
            parameterSchema: module.module.getParameterSchema(),
        });
    }));

    // GET /api/workflows/modules/category/:category
    // Get modules by category
    router.get('/workflows/modules/category/:category', validate(workflowSchemas.getModuleByCategory), asyncHandler(async (req: Request, res: Response) => {
        const { moduleRegistry } = await import('../services/workflow/WorkflowModuleRegistry.js');
        const registry = moduleRegistry;
        const modules = registry.getByCategory(req.params.category);

        const moduleMetadata = modules.map(entry => ({
            id: entry.metadata.id,
            name: entry.metadata.name,
            description: entry.metadata.description,
            category: entry.metadata.category,
            defaultParams: entry.module.getDefaultParams(),
            parameterSchema: entry.module.getParameterSchema(),
        }));

        res.json(moduleMetadata);
    }));

    return router;
}

