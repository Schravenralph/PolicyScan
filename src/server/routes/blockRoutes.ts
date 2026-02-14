import { Router, Request, Response } from 'express';
import { getBlockRegistry } from '../services/infrastructure/BlockRegistry.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { NotFoundError } from '../types/errors.js';
import type { AuthService } from '../services/auth/AuthService.js';
import type { BlockType, BlockCategory } from '../services/infrastructure/types.js';

/**
 * Block registry routes
 * Provides endpoints for managing workflow blocks
 */
export function createBlockRouter(authService: AuthService): Router {
    const router = Router();
    const requireAuth = authenticate(authService);
    const blockRegistry = getBlockRegistry();

    /**
     * GET /api/blocks
     * Get all available blocks
     */
    router.get('/', requireAuth, asyncHandler(async (_req: Request, res: Response) => {
        const blocks = blockRegistry.getAll();
        res.json(blocks);
    }));

    /**
     * GET /api/blocks/:type
     * Get a specific block by type
     */
    router.get('/:type', requireAuth, asyncHandler(async (req: Request, res: Response) => {
        const { type } = req.params;
        const block = blockRegistry.get(type as BlockType);
        if (!block) {
            throw new NotFoundError('Block', type);
        }
        res.json(block);
    }));

    /**
     * GET /api/blocks/category/:category
     * Get blocks by category
     */
    router.get('/category/:category', requireAuth, asyncHandler(async (req: Request, res: Response) => {
        const { category } = req.params;
        const blocks = blockRegistry.getByCategory(category as BlockCategory);
        res.json(blocks);
    }));

    return router;
}
