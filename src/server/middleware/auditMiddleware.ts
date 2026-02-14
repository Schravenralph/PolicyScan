import { Request, Response, NextFunction } from 'express';
import { AuditLogService } from '../services/AuditLogService.js';
import { AuditActionType, AuditTargetType } from '../models/AuditLog.js';

/**
 * Middleware options for audit logging
 */
export interface AuditMiddlewareOptions {
    action: AuditActionType;
    targetType: AuditTargetType;
    getTargetId?: (req: Request) => string | undefined;
    getDetails?: (req: Request, res: Response) => Record<string, unknown> | undefined;
    skipLogging?: (req: Request, res: Response) => boolean;
}

/**
 * Create audit middleware for specific routes
 * 
 * @example
 * ```typescript
 * router.put('/users/:id/role', 
 *   auditMiddleware({ 
 *     action: 'user_role_changed', 
 *     targetType: 'user',
 *     getTargetId: (req) => req.params.id 
 *   }),
 *   updateUserRole
 * );
 * ```
 */
export function auditMiddleware(options: AuditMiddlewareOptions) {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Skip logging if condition is met
        if (options.skipLogging && options.skipLogging(req, res)) {
            return next();
        }

        // Store original res.end to intercept response
        const originalEnd = res.end;
        const originalJson = res.json;

        // Override res.json
        res.json = function (body: unknown) {
            return originalJson.call(this, body);
        };

        // Override res.end to log after response is sent
        res.end = function (chunk?: unknown, encodingOrCb?: BufferEncoding | (() => void), cb?: () => void) {
            // Log audit entry after response is sent (non-blocking)
            setImmediate(async () => {
                try {
                    const targetId = options.getTargetId ? options.getTargetId(req) : undefined;
                    const details = options.getDetails ? options.getDetails(req, res) : undefined;

                    // Only log successful requests (2xx status codes)
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        await AuditLogService.logAction(
                            req,
                            options.action,
                            options.targetType,
                            targetId,
                            details
                        );
                    }
                } catch (error) {
                    // Don't let audit logging errors break the response
                    console.error('[auditMiddleware] Error logging audit entry:', error);
                }
            });

            // Handle different overloads of res.end
            // Cast to flexible function type to handle multiple overloads
            const endFn = originalEnd as (
                chunk?: unknown,
                encodingOrCb?: BufferEncoding | (() => void),
                cb?: () => void
            ) => Response;
            
            if (typeof encodingOrCb === 'function') {
                // res.end(cb) or res.end(chunk, cb)
                if (chunk !== undefined) {
                    return endFn.call(this, chunk, encodingOrCb);
                } else {
                    return endFn.call(this, encodingOrCb);
                }
            } else if (cb) {
                // res.end(chunk, encoding, cb)
                return endFn.call(this, chunk, encodingOrCb as BufferEncoding, cb);
            } else if (encodingOrCb) {
                // res.end(chunk, encoding)
                return endFn.call(this, chunk, encodingOrCb as BufferEncoding);
            } else {
                // res.end() or res.end(chunk)
                return endFn.call(this, chunk);
            }
        };

        next();
    };
}

/**
 * Simple audit middleware that logs after successful response
 * Use this for routes that don't need custom target ID or details extraction
 */
export function simpleAuditMiddleware(action: AuditActionType, targetType: AuditTargetType) {
    return auditMiddleware({
        action,
        targetType,
    });
}
