import { Router, Request, Response } from 'express';
import { hybridSearchService } from '../services/query/HybridSearch.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError } from '../types/errors.js';
import { PAGINATION } from '../config/constants.js';

const router = Router();

// GET /api/search?q=...&location=...&jurisdiction=...
router.get('/search', asyncHandler(async (req: Request, res: Response) => {
    const query = req.query.q;
    if (!query) {
        throw new BadRequestError('Query parameter "q" is required');
    }

    // Enforce max limit to prevent large result sets
    let requestedLimit = 10; // Default limit
    if (req.query.limit) {
        const parsed = parseInt(req.query.limit as string, 10);
        if (isNaN(parsed) || parsed < 1) {
            throw new BadRequestError('Invalid limit parameter: must be a positive integer');
        }
        requestedLimit = parsed;
    }

    const limit = Math.min(requestedLimit, PAGINATION.MAX_LIMIT);
    const location = req.query.location as string | undefined;
    const jurisdiction = req.query.jurisdiction as string | undefined;
    const areaId = req.query.areaId;

    if (areaId && typeof areaId !== 'string') {
        throw new BadRequestError('Invalid areaId parameter: must be a string');
    }

    // Parse areaIds (can be array or single value)
    let areaIds: string[] | undefined;
    if (req.query.areaIds) {
        if (Array.isArray(req.query.areaIds)) {
            areaIds = req.query.areaIds as string[];
        } else {
            areaIds = [req.query.areaIds as string];
        }
    }

    let validFrom: Date | undefined;
    if (req.query.validFrom) {
        validFrom = new Date(req.query.validFrom as string);
        if (isNaN(validFrom.getTime())) {
            throw new BadRequestError('Invalid validFrom parameter: must be a valid date');
        }
    }

    let validTo: Date | undefined;
    if (req.query.validTo) {
        validTo = new Date(req.query.validTo as string);
        if (isNaN(validTo.getTime())) {
            throw new BadRequestError('Invalid validTo parameter: must be a valid date');
        }
    }

    const results = await hybridSearchService.search(query as string, limit, {
        location,
        jurisdiction: jurisdiction === 'all' ? undefined : (jurisdiction as 'national' | 'provincial' | 'municipal' | undefined),
        validFrom,
        validTo,
        areaId: areaId as string | undefined,
        areaIds,
    });

    res.json(results);
}));

export default router;
