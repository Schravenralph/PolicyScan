import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { BadRequestError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Validation middleware factory
 * Validates request body, query, or params against a Zod schema
 * Throws BadRequestError if validation fails, ensuring errors go through centralized error handling
 */
type ValidationSchema =
    | { body: ZodSchema }
    | { query: ZodSchema }
    | { params: ZodSchema }
    | { body: ZodSchema; query?: ZodSchema }
    | { body: ZodSchema; params?: ZodSchema }
    | { query: ZodSchema; params?: ZodSchema }
    | { body: ZodSchema; query: ZodSchema; params?: ZodSchema }
    | { body: ZodSchema; query?: ZodSchema; params: ZodSchema }
    | { body?: ZodSchema; query: ZodSchema; params: ZodSchema }
    | { body: ZodSchema; query: ZodSchema; params: ZodSchema };

export function validate(schema: ValidationSchema) {
    return async (req: Request, _res: Response, next: NextFunction) => {
        try {
            if ('body' in schema && schema.body) {
                req.body = schema.body.parse(req.body) as typeof req.body;
            }
            if ('query' in schema && schema.query) {
                req.query = schema.query.parse(req.query) as typeof req.query;
            }
            if ('params' in schema && schema.params) {
                // Validate params (especially for /:id routes)
                // Only log in debug mode to reduce noise
                if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'development') {
                    logger.debug({ params: req.params, path: req.path }, 'Validating route params');
                }
                try {
                    req.params = schema.params.parse(req.params) as typeof req.params;
                } catch (parseError) {
                    // Log validation failure with context
                    logger.warn(
                        { 
                            params: req.params, 
                            path: req.path, 
                            error: parseError instanceof Error ? parseError.message : String(parseError)
                        }, 
                        'Route params validation failed'
                    );
                    throw parseError;
                }
            }
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                // Log validation failure with context
                logger.warn(
                    { 
                        path: req.path, 
                        method: req.method,
                        issues: error.issues.map((e) => ({
                            path: e.path.join('.'),
                            message: e.message,
                        }))
                    }, 
                    'Request validation failed'
                );
                // Create BadRequestError and pass it to error handler via next()
                const details = error.issues.map((e) => ({
                    path: e.path.join('.'),
                    message: e.message,
                }));
                next(new BadRequestError('Validation failed', {
                    details,
                }));
            } else {
                next(error);
            }
        }
    };
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
    mongoId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId'),
    url: z.string().url('Invalid URL format'),
    email: z.string().email('Invalid email format'),
    safeName: z.string().min(1, 'Name cannot be empty').regex(/^[\p{L}\p{N}\s'.-]+$/u, 'Name contains invalid characters'),
    nonEmptyString: z.string().min(1, 'String cannot be empty'),
    boolean: z.boolean(),
    optionalString: z.string().optional(),
    optionalBoolean: z.boolean().optional(),
};
