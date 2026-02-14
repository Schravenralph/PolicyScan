import { Request, Response, NextFunction } from 'express';
import { getResourceAuthorizationService, ResourceType, ResourceAction } from '../services/security/ResourceAuthorizationService.js';
import { AuthorizationError, NotFoundError } from '../types/errors.js';
import { AuditLogService } from '../services/AuditLogService.js';
import { logger } from '../utils/logger.js';

/**
 * Check if the request is for an SSE endpoint
 * SSE endpoints typically have /events in the path or Accept: text/event-stream header
 * Checks multiple path sources to handle different Express routing scenarios
 * 
 * Note: EventSource API doesn't always send Accept: text/event-stream header,
 * so we primarily rely on path detection for /events endpoints
 */
function isSSERequest(req: Request): boolean {
    // Check Accept header for SSE (most reliable indicator when present)
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('text/event-stream')) {
        return true;
    }
    
    // Check multiple path sources to handle different Express routing scenarios
    // req.path - path portion without query string (relative to router mount point)
    // req.url - full URL path with query string (relative to router mount point)
    // req.originalUrl - original URL before any rewriting (full path from root)
    const pathChecks = [
        req.path,
        req.url?.split('?')[0], // URL without query string
        req.originalUrl?.split('?')[0], // Original URL without query string
    ].filter(Boolean) as string[];
    
    // Check if any path ends with /events (SSE endpoint pattern)
    // This is the primary detection method since EventSource may not send Accept header
    for (const path of pathChecks) {
        if (path && path.endsWith('/events')) {
            return true;
        }
    }
    
    return false;
}

/**
 * Send SSE-formatted error response
 * This ensures EventSource can properly parse the error instead of receiving JSON
 */
function sendSSEError(res: Response, statusCode: number, error: string, message: string): void {
    // Don't send if headers already sent
    if (res.headersSent) {
        logger.warn({ statusCode, error, message }, '[SSE] Cannot send SSE error - headers already sent');
        return;
    }
    
    // Set SSE headers (must be set before writing)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.status(statusCode);
    
    // Send error as SSE event
    // Format: event: error\ndata: {...}\n\n
    const errorData = {
        error,
        message,
        statusCode,
        timestamp: new Date().toISOString(),
    };
    
    const sseMessage = `event: error\ndata: ${JSON.stringify(errorData)}\n\n`;
    
    try {
        res.write(sseMessage);
        res.end();
        logger.debug({ statusCode, error, message }, '[SSE] Sent SSE-formatted error response');
    } catch (writeError) {
        logger.error({ error: writeError, statusCode, error, message }, '[SSE] Failed to write SSE error response');
    }
}

/**
 * Middleware to check resource-level authorization
 * 
 * @param resourceType - Type of resource being accessed
 * @param resourceIdParam - Name of the route parameter containing the resource ID (default: 'id')
 * @param action - Action being performed (default: 'view')
 * @returns Express middleware function
 */
export function requireResourceAuthorization(
    resourceType: ResourceType,
    resourceIdParam: string = 'id',
    action: ResourceAction = 'view'
) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                await AuditLogService.logAuthorizationDecision(
                    req,
                    resourceType === 'query' ? 'other' : resourceType === 'workflowRun' || resourceType === 'workflowConfiguration' ? 'workflow' : resourceType === 'document' ? 'other' : resourceType,
                    req.params[resourceIdParam] || 'unknown',
                    action,
                    false,
                    undefined,
                    { reason: 'Authentication required' }
                ).catch((error) => {
                    logger.error({ error }, 'Failed to log authorization decision');
                });
                throw new AuthorizationError('Authentication required');
            }

            const resourceId = req.params[resourceIdParam];
            if (!resourceId) {
                throw new AuthorizationError(`Resource ID parameter '${resourceIdParam}' not found in request`);
            }

            const authService = getResourceAuthorizationService();
            const result = await authService.checkFromRequest(req, resourceType, resourceId, action);

            if (!result.allowed) {
                // Check if the reason indicates the resource was not found
                // In this case, return 404 (Not Found) instead of 403 (Forbidden)
                const notFoundReasons = [
                    'Workflow run not found',
                    'Query not found',
                    'Workflow not found',
                    'Workflow configuration not found',
                    'Document not found',
                ];
                
                const isNotFound = result.reason && notFoundReasons.some(reason => result.reason?.includes(reason));
                
                // For SSE requests with "not found" errors, log additional context for debugging
                const isSSE = isSSERequest(req);
                if (isNotFound && isSSE && resourceType === 'workflowRun') {
                    logger.warn(
                        {
                            runId: resourceId,
                            userId: req.user?.userId,
                            reason: result.reason,
                            path: req.path,
                            url: req.url,
                            originalUrl: req.originalUrl,
                            method: req.method,
                            acceptHeader: req.headers.accept,
                            isSSEDetected: isSSE,
                        },
                        '[SSE Auth] Run not found when trying to connect to SSE - may be timing issue or run was cancelled'
                    );
                }
                
                if (isNotFound) {
                    // Return 404 for non-existent resources
                    const resourceName = resourceType === 'workflowRun' ? 'Run' :
                                       resourceType === 'query' ? 'Query' :
                                       resourceType === 'workflow' ? 'Workflow' :
                                       resourceType === 'workflowConfiguration' ? 'Workflow configuration' :
                                       resourceType === 'document' ? 'Document' : 'Resource';
                    
                    await AuditLogService.logAuthorizationDecision(
                        req,
                        resourceType === 'query' ? 'other' : resourceType === 'workflowRun' || resourceType === 'workflowConfiguration' ? 'workflow' : resourceType === 'document' ? 'other' : resourceType,
                        resourceId,
                        action,
                        false,
                        undefined,
                        { reason: result.reason, permissionLevel: result.permissionLevel, notFound: true }
                    ).catch((error) => {
                        logger.error({ error }, 'Failed to log authorization decision');
                    });
                    
                    throw new NotFoundError(resourceName, resourceId);
                }
                
                // For other authorization failures, return 403
                await AuditLogService.logAuthorizationDecision(
                    req,
                    resourceType === 'query' ? 'other' : resourceType === 'workflowRun' || resourceType === 'workflowConfiguration' ? 'workflow' : resourceType === 'document' ? 'other' : resourceType,
                    resourceId,
                    action,
                    false,
                    undefined,
                    { reason: result.reason, permissionLevel: result.permissionLevel }
                ).catch((error) => {
                    logger.error({ error }, 'Failed to log authorization decision');
                });
                throw new AuthorizationError(result.reason || 'Insufficient permissions');
            }

            // Log successful authorization
            await AuditLogService.logAuthorizationDecision(
                req,
                resourceType === 'query' ? 'other' : resourceType === 'workflowRun' || resourceType === 'workflowConfiguration' ? 'workflow' : resourceType === 'document' ? 'other' : resourceType,
                resourceId,
                action,
                true,
                result.permissionLevel ? String(result.permissionLevel) : undefined,
                { permissionLevel: result.permissionLevel }
            ).catch((error) => {
                logger.error({ error }, 'Failed to log authorization decision');
            });

            next();
        } catch (error) {
            // Check if this is an SSE request
            const isSSE = isSSERequest(req);
            
            // Log SSE detection for debugging (always log for workflowRun to help diagnose)
            if (resourceType === 'workflowRun') {
                logger.warn(
                    {
                        runId: req.params[resourceIdParam],
                        path: req.path,
                        url: req.url,
                        originalUrl: req.originalUrl,
                        acceptHeader: req.headers.accept,
                        isSSEDetected: isSSE,
                        errorType: error instanceof Error ? error.constructor.name : typeof error,
                        errorMessage: error instanceof Error ? error.message : String(error),
                    },
                    '[SSE Auth] Error in authorization middleware - checking if SSE request'
                );
            }
            
            // Check if response has already been sent (shouldn't happen, but safety check)
            if (res.headersSent) {
                logger.warn(
                    {
                        runId: req.params[resourceIdParam],
                        path: req.path,
                        isSSE,
                    },
                    '[SSE Auth] Response already sent, cannot send SSE error'
                );
                return;
            }
            
            if (error instanceof NotFoundError) {
                // Return 404 for not found errors
                if (isSSE) {
                    logger.warn(
                        {
                            runId: req.params[resourceIdParam],
                            path: req.path,
                            url: req.url,
                            originalUrl: req.originalUrl,
                            message: error.message,
                        },
                        '[SSE Auth] Sending SSE-formatted 404 error'
                    );
                    sendSSEError(res, 404, 'NOT_FOUND', error.message);
                    return; // Don't call next() - response already sent
                } else {
                    res.status(404).json({ error: error.message });
                    return; // Don't call next() - response already sent
                }
            } else if (error instanceof AuthorizationError) {
                if (isSSE) {
                    logger.warn(
                        {
                            runId: req.params[resourceIdParam],
                            path: req.path,
                            message: error.message,
                        },
                        '[SSE Auth] Sending SSE-formatted 403 error'
                    );
                    sendSSEError(res, 403, 'FORBIDDEN', error.message);
                    return; // Don't call next() - response already sent
                } else {
                    res.status(403).json({ error: error.message });
                    return; // Don't call next() - response already sent
                }
            } else {
                logger.error({ error }, 'Error in resource authorization middleware');
                if (isSSE) {
                    sendSSEError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
                    return; // Don't call next() - response already sent
                } else {
                    res.status(500).json({ error: 'Internal server error' });
                    return; // Don't call next() - response already sent
                }
            }
        }
    };
}

