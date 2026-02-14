/**
 * Shared Middleware for Admin Routes
 * 
 * Common middleware functions used across admin route handlers.
 * These are thin wrappers around existing middleware to ensure consistency.
 */

import { Request, Response } from 'express';
import { sanitizeInput } from '../../../middleware/sanitize.js';
import { auditMiddleware } from '../../../middleware/auditMiddleware.js';
import { asyncHandler } from '../../../utils/errorHandling.js';

/**
 * Re-export commonly used middleware for convenience
 */
export { sanitizeInput, auditMiddleware, asyncHandler };

/**
 * Admin route handler wrapper
 * Combines asyncHandler with common error handling
 */
export function adminRouteHandler(
    handler: (req: Request, res: Response) => Promise<void>
) {
    return asyncHandler(handler);
}



