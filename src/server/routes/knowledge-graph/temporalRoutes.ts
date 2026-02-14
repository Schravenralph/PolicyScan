import express, { Router } from 'express';
import { asyncHandler } from '../../utils/errorHandling.js';
import { BadRequestError, NotFoundError } from '../../types/errors.js';
import { KnowledgeGraphService } from '../../services/knowledge-graph/core/KnowledgeGraph.js';

export function createTemporalRouter(
    getKGService: () => KnowledgeGraphService | import('../../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService
): Router {
    const router = express.Router();

    // GET /active?date=YYYY-MM-DD
    // Get entities active on a specific date
    router.get('/active', asyncHandler(async (req, res) => {
        const { date } = req.query;

        if (!date || typeof date !== 'string') {
            throw new BadRequestError('Date parameter (YYYY-MM-DD) is required', {
                received: { date, type: typeof date }
            });
        }

        const kgService = getKGService();
        if (!('getEntitiesActiveOnDate' in kgService) || typeof kgService.getEntitiesActiveOnDate !== 'function') {
            throw new BadRequestError('Temporal queries are not supported by the current knowledge graph service');
        }
        const entities = await (kgService as any).getEntitiesActiveOnDate(date);

        res.json({
            success: true,
            date,
            entities,
            count: entities.length,
        });
    }));

    // GET /range?start=YYYY-MM-DD&end=YYYY-MM-DD
    // Get entities effective in a date range
    router.get('/range', asyncHandler(async (req, res) => {
        const { start, end } = req.query;

        if (!start || typeof start !== 'string' || !end || typeof end !== 'string') {
            throw new BadRequestError('Both start and end date parameters (YYYY-MM-DD) are required', {
                received: { start, end, startType: typeof start, endType: typeof end }
            });
        }

        const kgService = getKGService();
        if (!('getEntitiesInDateRange' in kgService) || typeof kgService.getEntitiesInDateRange !== 'function') {
            throw new BadRequestError('Temporal queries are not supported by the current knowledge graph service');
        }
        const entities = await (kgService as any).getEntitiesInDateRange(start, end);

        res.json({
            success: true,
            startDate: start,
            endDate: end,
            entities,
            count: entities.length,
        });
    }));

    // GET /entity/:id/history
    // Get entity history (all versions)
    router.get('/entity/:id/history', asyncHandler(async (req, res) => {
        const { id } = req.params;

        const kgService = getKGService();
        if (!('getEntityHistory' in kgService) || typeof kgService.getEntityHistory !== 'function') {
            throw new BadRequestError('Entity history queries are not supported by the current knowledge graph service');
        }
        const versions = await (kgService as any).getEntityHistory(id);

        res.json({
            success: true,
            entityId: id,
            versions,
            count: versions.length,
        });
    }));

    // GET /entity/:id/state?date=YYYY-MM-DD
    // Get entity state at a specific date
    router.get('/entity/:id/state', asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { date } = req.query;

        if (!date || typeof date !== 'string') {
            throw new BadRequestError('Date parameter (YYYY-MM-DD) is required', {
                received: { date, type: typeof date }
            });
        }

        const kgService = getKGService();
        if (!('getEntityStateAtDate' in kgService) || typeof kgService.getEntityStateAtDate !== 'function') {
            throw new BadRequestError('Entity state queries are not supported by the current knowledge graph service');
        }
        const entity = await (kgService as any).getEntityStateAtDate(id, date);

        if (!entity) {
            throw new NotFoundError('Entity state', `${id} at ${date}`);
        }

        res.json({
            success: true,
            entityId: id,
            date,
            entity,
        });
    }));

    // GET /entity/:id/compare?version1=N&version2=M
    // Compare two versions of an entity
    router.get('/entity/:id/compare', asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { version1, version2 } = req.query;

        if (!version1 || !version2) {
            throw new BadRequestError('Both version1 and version2 parameters are required', {
                received: { version1, version2 }
            });
        }

        const v1 = parseInt(version1 as string, 10);
        const v2 = parseInt(version2 as string, 10);

        if (isNaN(v1) || isNaN(v2)) {
            throw new BadRequestError('Version parameters must be valid numbers', {
                received: { version1, version2, v1, v2 }
            });
        }

        const kgService = getKGService();
        if (!('compareEntityVersions' in kgService) || typeof kgService.compareEntityVersions !== 'function') {
            throw new BadRequestError('Entity version comparison is not supported by the current knowledge graph service');
        }
        const comparison = await (kgService as any).compareEntityVersions(id, v1, v2);

        res.json({
            success: true,
            entityId: id,
            ...comparison,
        });
    }));

    // GET /entity/:id/validate
    // Validate temporal consistency for an entity
    router.get('/entity/:id/validate', asyncHandler(async (req, res) => {
        const { id } = req.params;

        const kgService = getKGService();
        if (!('validateTemporalConsistencyById' in kgService) || typeof kgService.validateTemporalConsistencyById !== 'function') {
            throw new BadRequestError('Temporal consistency validation is not supported by the current knowledge graph service');
        }
        const validation = await (kgService as any).validateTemporalConsistencyById(id);

        res.json({
            success: true,
            entityId: id,
            ...validation,
        });
    }));

    return router;
}
