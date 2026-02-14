/**
 * Query Preset API Routes
 *
 * REST API endpoints for query preset management:
 * - GET /api/query-presets - List all presets (with optional filtering)
 * - GET /api/query-presets/:id - Get specific preset
 * - POST /api/query-presets/combine - Combine multiple presets
 */

import { Router, Request, Response } from 'express';
import { getQueryPresetRegistry } from '../services/query/index.js';
import { asyncHandler, throwIfNotFound } from '../utils/errorHandling.js';
import { BadRequestError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/query-presets
 *
 * List all presets with optional filtering by category or source
 *
 * Query Parameters:
 * - category (optional): Filter by category
 * - source (optional): Filter by source ('scraper', 'iplo', 'website', 'manual')
 *
 * Response:
 * {
 *   presets: QueryPreset[],
 *   total: number
 * }
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const registry = getQueryPresetRegistry();
    const { category, source } = req.query;
    let presets;

    if (category && typeof category === 'string') {
        logger.debug({ category }, 'Filtering presets by category');
        presets = await registry.getPresetsByCategory(category);
    } else if (source && typeof source === 'string') {
        logger.debug({ source }, 'Filtering presets by source');
        if (source !== 'scraper' && source !== 'iplo' && source !== 'website' && source !== 'manual') {
            throw new BadRequestError('Invalid source parameter', {
                message: `Source must be one of: scraper, iplo, website, manual`,
                received: source,
                field: 'source',
            });
        }
        presets = await registry.getPresetsBySource(source);
    } else {
        logger.debug('Retrieving all presets');
        presets = await registry.getAllPresets();
    }

    res.json({
        presets: presets.map(preset => ({
            ...preset,
            queryCount: preset.queries.length,
        })),
        total: presets.length,
    });
}));

/**
 * GET /api/query-presets/:id
 *
 * Get a specific preset by ID
 *
 * Response:
 * QueryPreset object or 404 if not found
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const registry = getQueryPresetRegistry();
    const preset = await registry.getPreset(req.params.id);
    throwIfNotFound(preset, 'Query preset', req.params.id);
    res.json(preset);
}));

/**
 * POST /api/query-presets/combine
 *
 * Combine multiple presets and optional manual queries
 *
 * Request Body:
 * {
 *   presetIds: string[],
 *   manualQueries?: string[],
 *   deduplicate?: boolean,
 *   combineMode?: 'union' | 'intersection'
 * }
 *
 * Response:
 * {
 *   queries: string[],
 *   sources: Record<string, number>
 * }
 */
router.post('/combine', asyncHandler(async (req: Request, res: Response) => {
    const { presetIds, manualQueries, deduplicate, combineMode } = req.body;

    // Validate request body
    if (!Array.isArray(presetIds)) {
        throw new BadRequestError('presetIds must be an array', {
            field: 'presetIds',
            received: presetIds,
        });
    }

    if (presetIds.length === 0) {
        throw new BadRequestError('presetIds must contain at least one preset ID', {
            field: 'presetIds',
            received: presetIds,
        });
    }

    if (manualQueries !== undefined && !Array.isArray(manualQueries)) {
        throw new BadRequestError('manualQueries must be an array if provided', {
            field: 'manualQueries',
            received: manualQueries,
        });
    }

    if (deduplicate !== undefined && typeof deduplicate !== 'boolean') {
        throw new BadRequestError('deduplicate must be a boolean if provided', {
            field: 'deduplicate',
            received: deduplicate,
        });
    }

    if (combineMode !== undefined && combineMode !== 'union' && combineMode !== 'intersection') {
        throw new BadRequestError('combineMode must be "union" or "intersection" if provided', {
            field: 'combineMode',
            received: combineMode,
            validValues: ['union', 'intersection'],
        });
    }

    const registry = getQueryPresetRegistry();
    logger.debug({ presetIds, manualQueriesCount: manualQueries?.length || 0, deduplicate, combineMode }, 'Combining presets');
    const result = await registry.combinePresets(presetIds, manualQueries || [], { deduplicate, combineMode });
    res.json(result);
}));

export default router;
