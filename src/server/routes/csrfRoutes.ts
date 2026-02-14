import { Router, Request, Response } from 'express';
import { generateCsrfToken } from '../middleware/csrf.js';
import { asyncHandler } from '../utils/errorHandling.js';

const router = Router();

/**
 * GET /api/csrf-token
 * Generate and return a CSRF token for the client
 * This endpoint should be called before making mutation requests
 */
router.get('/csrf-token', asyncHandler(async (req: Request, res: Response) => {
    const token = generateCsrfToken(req, res);
    // Set token in response header for convenience
    res.setHeader('X-CSRF-Token', token);
    // Also return in response body
    res.json({
        csrfToken: token,
        message: 'CSRF token generated successfully'
    });
}));

export default router;
