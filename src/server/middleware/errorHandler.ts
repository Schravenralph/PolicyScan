import { Request, Response, NextFunction } from 'express';
import { getErrorMonitoringService } from '../services/monitoring/ErrorMonitoringService.js';
import type { ErrorComponent } from '../models/ErrorLog.js';
import { logger } from '../utils/logger.js';
import { transformErrorToResponse } from '../utils/errorTransformation.js';
import { NotFoundError } from '../types/errors.js';

/**
 * Check if the request is for an SSE endpoint
 * SSE endpoints typically have /events in the path or Accept: text/event-stream header
 */
function isSSERequest(req: Request): boolean {
    // Check Accept header for SSE (most reliable indicator)
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
    for (const path of pathChecks) {
        if (path.endsWith('/events')) {
            return true;
        }
    }
    
    return false;
}

/**
 * Send SSE-formatted error response
 */
function sendSSEError(res: Response, statusCode: number, errorResponse: { error: string; code?: string; message: string; statusCode: number; [key: string]: unknown }): void {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Send error as SSE event
    const errorData = {
        error: errorResponse.error,
        code: errorResponse.code,
        message: errorResponse.message,
        statusCode: errorResponse.statusCode,
        timestamp: new Date().toISOString(),
    };
    
    const sseMessage = `event: error\ndata: ${JSON.stringify(errorData)}\n\n`;
    res.status(statusCode);
    res.write(sseMessage);
    res.end();
}

/**
 * Centralized error handling middleware
 * Must be registered LAST in Express app
 * 
 * This middleware:
 * - Transforms all errors to standardized ErrorResponse format
 * - Logs errors with appropriate context
 * - Captures errors in monitoring system
 * - Returns consistent error responses to clients
 */
export async function errorHandler(
    err: Error | unknown,
    req: Request,
    res: Response,
    _next: NextFunction
) {
    try {
        // Log error with context
        // NotFoundError is often an expected scenario (e.g., stale progress IDs), so log at info level
        const isNotFoundError = err instanceof NotFoundError;

        if (isNotFoundError) {
            logger.info({
                error: err,
                message: err instanceof Error ? err.message : String(err),
                path: req.path,
                method: req.method,
                query: req.query,
            }, 'Resource not found (expected scenario)');
        } else {
            logger.error({
                error: err,
                message: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined,
                path: req.path,
                method: req.method,
                query: req.query,
                body: req.body ? JSON.stringify(req.body).substring(0, 500) : undefined,
            }, 'Unhandled error');
        }

        // Determine error component from request path
        let component: ErrorComponent = 'api';
        if (req.path.includes('/workflow')) {
            component = 'workflow';
        } else if (req.path.includes('/scraper') || req.path.includes('/scrape')) {
            component = 'scraper';
        } else if (req.path.includes('/api')) {
            component = 'api';
        }

        // Get user ID from request if available
        const userId = req.user?.userId;

        // Extract test run ID from request headers or cookies for error-test correlation
        // E2E tests can annotate requests with run_id via:
        // - X-Test-Run-Id header
        // - test_run_id cookie
        let testRunId: string | undefined;
        const headerRunId = req.headers['x-test-run-id'];
        if (headerRunId && typeof headerRunId === 'string') {
            testRunId = headerRunId;
        } else {
            const cookieRunId = req.cookies?.test_run_id;
            if (cookieRunId && typeof cookieRunId === 'string') {
                testRunId = cookieRunId;
            }
        }

        // Capture error in monitoring system (async, don't block response)
        // Skip capturing test-related errors in production (unless explicitly in a test run)
        const errorMessage = err instanceof Error ? err.message : String(err);
        const isTestError = errorMessage.includes('invalid-workflow-id') ||
            errorMessage.includes('invalid-') ||
            errorMessage.includes('test-') ||
            errorMessage.includes('nonexistent-');
        const shouldCaptureError = testRunId || !isTestError || process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';

        try {
            const errorMonitoringService = getErrorMonitoringService();
            if (err instanceof Error && shouldCaptureError) {
                errorMonitoringService
                    .captureError(err, {
                        user_id: userId,
                        request: req,
                        component,
                        test_run_id: testRunId, // Pass test run ID in context for correlation
                        metadata: {
                            request_method: req.method,
                            request_path: req.path,
                            request_query: req.query,
                            request_body: req.body ? JSON.stringify(req.body).substring(0, 500) : undefined,
                            ...(testRunId && { testRunId }), // Also keep in metadata for backward compatibility
                        },
                    })
                    .catch((monitoringError) => {
                        logger.error({ error: monitoringError }, 'Failed to capture error in monitoring system');
                    });
            } else if (isTestError && !shouldCaptureError) {
                // Log test errors at debug level in production but don't capture them
                logger.debug({
                    error: err,
                    message: errorMessage,
                    path: req.path,
                    method: req.method,
                }, 'Skipping test-related error in production');
            }
        } catch (monitoringInitError) {
            // If error monitoring service fails to initialize, log but don't fail
            logger.error({ error: monitoringInitError }, 'Failed to initialize error monitoring service');
        }

        // Transform error to standardized response format
        const includeStack = process.env.NODE_ENV === 'development';
        let errorResponse;
        try {
            errorResponse = transformErrorToResponse(err, req, includeStack);
            if (process.env.NODE_ENV === 'test') {
                console.error('[errorHandler] Transforming error:', err);
                console.error('[errorHandler] Resulting response:', JSON.stringify(errorResponse));
            }
        } catch (transformError) {
            // If error transformation fails, use a basic error response
            logger.error({ error: transformError }, 'Failed to transform error response');
            errorResponse = {
                error: 'Internal Server Error',
                code: 'INTERNAL_SERVER_ERROR',
                message: err instanceof Error ? err.message : 'An unexpected error occurred',
                statusCode: 500,
                timestamp: new Date().toISOString(),
                path: req.path,
            };
        }

        // Return error response
        // Check if response has already been sent and socket is still writable
        const isConnectionError = err instanceof Error && (
            err.message.includes('EPIPE') ||
            err.message.includes('ECONNRESET') ||
            err.message.includes('socket hang up') ||
            err.message.includes('write after end')
        );

        // For connection errors, client has already disconnected - don't try to send response
        if (isConnectionError) {
            // Just log and return - client is gone
            logger.debug({
                error: err instanceof Error ? err.message : String(err),
                path: req.path
            }, 'Client disconnected before response could be sent');
            return;
        }

        // Check if response has already been sent or is already in SSE mode
        const isAlreadySSE = res.getHeader('Content-Type') === 'text/event-stream';
        const canSendResponse = !res.headersSent && res.socket?.writable !== false && !res.socket?.destroyed;
        
        if (canSendResponse || isAlreadySSE) {
            try {
                // Check if this is an SSE request
                const isSSE = isSSERequest(req) || isAlreadySSE;
                
                if (isSSE) {
                    if (isAlreadySSE) {
                        // Headers already set, send SSE error event directly
                        const errorData = {
                            error: errorResponse.error,
                            code: errorResponse.code,
                            message: errorResponse.message,
                            statusCode: errorResponse.statusCode,
                            timestamp: new Date().toISOString(),
                        };
                        const sseMessage = `event: error\ndata: ${JSON.stringify(errorData)}\n\n`;
                        
                        if (!res.writableEnded && !res.destroyed) {
                            res.write(sseMessage);
                            res.end();
                        }
                    } else {
                        // Headers not set yet, use sendSSEError
                        sendSSEError(res, errorResponse.statusCode, errorResponse);
                    }
                } else {
                    res.status(errorResponse.statusCode).json(errorResponse);
                }
            } catch (writeError) {
                // If writing fails (e.g., client disconnected), just log it
                const writeErrorMessage = writeError instanceof Error ? writeError.message : String(writeError);
                if (!writeErrorMessage.includes('EPIPE') && !writeErrorMessage.includes('ECONNRESET')) {
                    logger.error({ error: writeError }, 'Failed to send error response');
                }
            }
        }
    } catch (handlerError) {
        // If the error handler itself fails, send a basic error response
        logger.error({ error: handlerError, originalError: err }, 'Error handler failed');
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Internal Server Error',
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An error occurred while processing the error',
                timestamp: new Date().toISOString(),
                path: req.path,
            });
        }
    }
}
