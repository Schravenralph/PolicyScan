import express, { Router } from 'express';
import { RunManager } from '../services/workflow/RunManager.js';
import { WorkflowEngine } from '../services/workflow/WorkflowEngine.js';
import { validate } from '../middleware/validation.js';
import { workflowSchemas } from '../validation/workflowSchemas.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError, NotFoundError, RateLimitError, ServiceUnavailableError } from '../types/errors.js';
import { requireResourceAuthorization } from '../middleware/resourceAuthorizationMiddleware.js';
import type { RunStatus, RunLog } from '../services/infrastructure/types.js';
import type { NavigationContext, LearnedPatternInput } from '../services/patternLearning/types.js';
import { ServiceConfigurationValidator } from '../services/workflow/ServiceConfigurationValidator.js';
import { getWorkflowQuotaService } from '../services/workflow/WorkflowQuotaService.js';
import { workflowExecutionLimiter } from '../middleware/rateLimiter.js';
import { mapLegacyParams, standardWorkflowParamsSchema } from '../utils/workflowParamMapping.js';
import { 
    explorationWorkflow, 
    standardScanWorkflow, 
    quickIploScanWorkflow, 
    externalLinksWorkflow,
    beleidsscanGraphWorkflow,
    bfs3HopWorkflow,
    // horstAanDeMaasSimpleWorkflow removed - use horstAanDeMaasWorkflow instead
    horstAanDeMaasWorkflow, 
    horstLaborMigrationWorkflow,
    beleidsscanWizardWorkflow,
    beleidsscanStep1SearchDsoWorkflow,
    beleidsscanStep2EnrichDsoWorkflow,
    beleidsscanStep3SearchIploWorkflow,
    beleidsscanStep4ScanKnownSourcesWorkflow,
    beleidsscanStep5SearchOfficieleBekendmakingenWorkflow,
    beleidsscanStep6SearchRechtspraakWorkflow,
    beleidsscanStep7CommonCrawlWorkflow,
    beleidsscanStep9MergeScoreWorkflow,
    dsoLocationSearchWorkflow
} from '../workflows/predefinedWorkflows.js';

/**
 * Create router for workflow run management endpoints
 * Handles run lifecycle: list, get, cancel, pause, resume
 */
export function createWorkflowRunRouter(
    runManager: RunManager,
    workflowEngine: WorkflowEngine,
    patternLearningService?: import('../services/learning/NavigationPatternLearningService.js').NavigationPatternLearningService
): Router {
    const router = express.Router();

    // Helper to get workflow by ID
    const getWorkflowById = (id: string) => {
        switch (id) {
            case 'iplo-exploration':
                return explorationWorkflow;
            case 'standard-scan':
                return standardScanWorkflow;
            case 'quick-iplo-scan':
                return quickIploScanWorkflow;
            case 'external-links-exploration':
                return externalLinksWorkflow;
            case 'beleidsscan-graph':
                return beleidsscanGraphWorkflow;
            case 'bfs-3-hop':
                return bfs3HopWorkflow;
            case 'horst-aan-de-maas':
                return horstAanDeMaasWorkflow;
            case 'horst-labor-migration':
                return horstLaborMigrationWorkflow;
            case 'beleidsscan-wizard':
                return beleidsscanWizardWorkflow;
            case 'beleidsscan-wizard-step1-search-dso':
                return beleidsscanStep1SearchDsoWorkflow;
            case 'beleidsscan-wizard-step2-enrich-dso':
                return beleidsscanStep2EnrichDsoWorkflow;
            case 'beleidsscan-wizard-step3-search-iplo':
                return beleidsscanStep3SearchIploWorkflow;
            case 'beleidsscan-wizard-step4-scan-known-sources':
                return beleidsscanStep4ScanKnownSourcesWorkflow;
            case 'beleidsscan-wizard-step5-search-officielebekendmakingen':
                return beleidsscanStep5SearchOfficieleBekendmakingenWorkflow;
            case 'beleidsscan-wizard-step6-search-rechtspraak':
                return beleidsscanStep6SearchRechtspraakWorkflow;
            case 'beleidsscan-wizard-step7-search-common-crawl':
                return beleidsscanStep7CommonCrawlWorkflow;
            case 'beleidsscan-wizard-step9-merge-score':
                return beleidsscanStep9MergeScoreWorkflow;
            case 'dso-location-search':
                return dsoLocationSearchWorkflow;
            default:
                return null;
        }
    };

    /**
     * Validate parameters for beleidsscan step workflows
     * @param params Workflow parameters
     * @returns Validation result with errors and validated params
     */
    /**
     * Validate workflow parameters using shared validation schemas
     * Maps legacy parameters and validates using standardWorkflowParamsSchema
     * 
     * @param params - Raw workflow parameters (may contain legacy names)
     * @returns Validation result with errors and validated params
     */
    function validateBeleidsscanStepParams(params: Record<string, unknown>): {
        valid: boolean;
        errors: string[];
        validatedParams?: Record<string, unknown>;
    } {
        // Step 1: Map legacy parameters to standardized names
        const mappedParams = mapLegacyParams(params, logger);
        
        // Step 2: Validate using shared schema
        const validationResult = standardWorkflowParamsSchema.safeParse(mappedParams);
        
        if (!validationResult.success) {
            // Convert Zod errors to string array format
            const errors = validationResult.error.issues.map((err: any) => {
                const field = err.path.join('.');
                return `${field}: ${err.message}`;
            });
            
            return {
                valid: false,
                errors,
                validatedParams: undefined
            };
        }
        
        return {
            valid: true,
            errors: [],
            validatedParams: validationResult.data
        };
    }

    // POST /api/workflows/:id/run
    // Start a workflow execution
    // Protected with rate limiting to prevent DoS attacks and resource exhaustion
    router.post('/workflows/:id/run', workflowExecutionLimiter, validate(workflowSchemas.runWorkflow), asyncHandler(async (req, res) => {
        const { id } = req.params;
        let params = req.body as Record<string, unknown>;
        
        // Map legacy parameters to standardized names (e.g., 'query' -> 'onderwerp')
        // This is now handled by validateBeleidsscanStepParams via mapLegacyParams
        
        // Validate parameters for workflows that require onderwerp
        const workflowsRequiringOnderwerp = [
            'standard-scan',
            'bfs-3-hop',
            'beleidsscan-graph',
            'beleidsscan-wizard',
            'external-links-exploration',
            'horst-aan-de-maas',
            'horst-labor-migration'
        ];
        
        if (id.startsWith('beleidsscan-wizard-step') || workflowsRequiringOnderwerp.includes(id)) {
            const validation = validateBeleidsscanStepParams(params);
            if (!validation.valid) {
                throw new BadRequestError('Ongeldige parameters', {
                    details: validation.errors,
                    workflowId: id,
                });
            }
            // Use validated params (with trimmed values)
            params = validation.validatedParams!;
        }
        
        // Add userId to params if user is authenticated (for notifications)
        const userId = (req as { user?: { userId?: string } }).user?.userId;
        if (userId) {
            params.userId = userId;
        }

        // Get workflow by ID
        const workflow = getWorkflowById(id);
        if (!workflow) {
            throw new NotFoundError('Workflow', id);
        }

        // Validate external service configuration before starting workflow
        // Skip validation in test/E2E environments or when explicitly requested
        // Check both environment variables and request headers (for E2E tests)
        const skipServiceValidation = 
            process.env.NODE_ENV === 'test' ||
            process.env.SKIP_SERVICE_VALIDATION === 'true' ||
            process.env.E2E_TEST === 'true' ||
            process.env.PLAYWRIGHT_TEST === 'true' ||
            process.env.TEST_SUITE === 'e2e' ||
            req.headers['x-e2e-test'] === 'true' ||
            req.headers['x-skip-service-validation'] === 'true';
        
        const serviceValidator = new ServiceConfigurationValidator();
        const serviceValidation = serviceValidator.validateWorkflowServices(id, { 
            skipValidation: skipServiceValidation 
        });
        if (!serviceValidation.valid) {
            logger.warn(
                { workflowId: id, missingServices: serviceValidation.missingServices },
                'Workflow start blocked: required external services not configured'
            );
            throw new BadRequestError('External service configuration required', {
                message: serviceValidation.error,
                missingServices: serviceValidation.missingServices.map(s => ({
                    name: s.name,
                    error: s.error,
                    guidance: s.guidance,
                })),
                workflowId: id,
            });
        }

        // Check per-user workflow quota (only for authenticated users)
        if (userId) {
            const quotaService = getWorkflowQuotaService();
            const quotaCheck = await quotaService.checkQuota(userId);
            if (!quotaCheck.allowed) {
                logger.warn(
                    { userId, workflowId: id, quota: quotaCheck },
                    'Workflow start blocked: quota exceeded'
                );
                const retryAfter = quotaCheck.resetAt ? Math.ceil((new Date(quotaCheck.resetAt).getTime() - Date.now()) / 1000) : undefined;
                const rateLimitError = new RateLimitError(quotaCheck.error || 'Workflow execution quota exceeded', retryAfter);
                // Add quota details to context for error response
                (rateLimitError as { context?: Record<string, unknown> }).context = {
                    ...rateLimitError.context,
                    quota: {
                        period: quotaCheck.period,
                        current: quotaCheck.current,
                        limit: quotaCheck.limit,
                        remaining: quotaCheck.remaining,
                        resetAt: quotaCheck.resetAt,
                    },
                    workflowId: id,
                    userId,
                };
                throw rateLimitError;
            }
        }

        // Check if review mode is enabled
        const reviewMode = req.body.reviewMode === true;

        // In test environments or when Redis is unavailable, execute directly instead of queuing
        // This allows integration tests to run without Redis
        const shouldExecuteDirectly = 
            process.env.NODE_ENV === 'test' ||
            process.env.SKIP_QUEUE === 'true' ||
            req.headers['x-skip-queue'] === 'true';

        let runId: string;
        if (shouldExecuteDirectly) {
            // Direct execution mode (for tests): create run and execute immediately
            const run = await runManager.createRun('workflow', {
                workflowId: workflow.id,
                workflowName: workflow.name,
                ...params
            }, userId);
            runId = run._id!.toString();

            // Cancel previous active runs for this queryId or workflowId
            const queryId = params.queryId as string | undefined;
            const cancelledCount = await runManager.cancelPreviousActiveRuns(queryId, workflow.id, run._id);
            if (cancelledCount > 0) {
                logger.info(
                    { workflowId: workflow.id, queryId, cancelledCount, currentRunId: runId },
                    `Cancelled ${cancelledCount} previous active run(s) after starting new workflow`
                );
            }

            // Execute workflow directly in background (fire-and-forget)
            (async () => {
                try {
                    await workflowEngine.executeWorkflow(workflow, params, runId);
                } catch (err) {
                    logger.error({ error: err, workflowId: workflow.id, runId }, 'Error executing workflow directly');
                }
            })();
        } else {
            // Production mode: use queue-based execution
            // Use WorkflowEngine.startWorkflow() to create a run and queue the workflow
            // This ensures a runId is created before queuing, which the frontend needs
            // Pass userId for resource-level authorization (WI-SEC-005)
            try {
                runId = await workflowEngine.startWorkflow(workflow, params, { 
                    reviewMode,
                    createdBy: userId // Set ownership for resource-level authorization
                });
            } catch (error) {
                // Handle queue overflow errors
                if (error instanceof Error && error.message.includes('queue is full')) {
                    logger.warn(
                        { userId, workflowId: id, error: error.message },
                        'Workflow queue overflow: rejecting request'
                    );
                    throw new ServiceUnavailableError('Workflow queue is currently full. Please try again later.', {
                        retryAfter: 60, // Suggest retry after 60 seconds
                        workflowId: id,
                    });
                }
                // Handle queue service unavailable errors (PRD FR-1: mandatory queuing)
                if (error instanceof ServiceUnavailableError && error.message.includes('queue service')) {
                    logger.error(
                        { userId, workflowId: id, error: error.message },
                        'Workflow queue service unavailable: cannot execute workflow (PRD requirement: mandatory queuing)'
                    );
                    // Error message already contains PRD context from WorkflowEngine
                    throw error;
                }
                // Re-throw other errors (will be caught by asyncHandler)
                throw error;
            }
        }

        // Record workflow execution for quota tracking (fire-and-forget)
        if (userId) {
            const quotaService = getWorkflowQuotaService();
            quotaService.recordExecution(userId, id).catch(err => {
                logger.error(
                    { error: err, userId, workflowId: id },
                    'Failed to record workflow execution for quota tracking'
                );
            });
        }

        // Return 202 Accepted for async execution with runId
        res.status(202).json({ 
            message: 'Workflow queued for execution', 
            workflowId: id, 
            runId,
            reviewMode 
        });
    }));

    // GET /api/runs
    // List runs with optional filtering (US-005)
    // Query parameters: status, type, startDate, endDate, limit, page, skip
    // Backward compatible: returns array format by default, paginated format when 'page' parameter is provided
    router.get('/runs', validate(workflowSchemas.listRuns), asyncHandler(async (req, res) => {
        // Check if pagination parameters were explicitly provided
        // Only return paginated format when 'page' is explicitly provided
        // 'limit' and 'skip' alone are used for filtering/limiting, not pagination
        // This maintains backward compatibility with tests and frontend code
        const hasPaginationParams = req.query.page !== undefined;

        // Parse pagination parameters
        // Support both 'page' and 'skip' - 'skip' takes precedence if both provided
        // Validate and sanitize to prevent type confusion attacks
        const skipParam = req.query.skip !== undefined 
            ? (() => {
                const parsed = parseInt(req.query.skip as string, 10);
                if (isNaN(parsed) || parsed < 0) {
                    throw new BadRequestError('Invalid skip parameter: must be a non-negative integer', {
                        field: 'skip',
                        received: req.query.skip,
                    });
                }
                return parsed;
            })() 
            : undefined;
        const pageParam = req.query.page !== undefined 
            ? (() => {
                const parsed = parseInt(req.query.page as string, 10);
                if (isNaN(parsed) || parsed < 1) {
                    throw new BadRequestError('Invalid page parameter: must be a positive integer', {
                        field: 'page',
                        received: req.query.page,
                    });
                }
                return parsed;
            })() 
            : undefined;
        const limitParam = req.query.limit !== undefined 
            ? (() => {
                const parsed = parseInt(req.query.limit as string, 10);
                if (isNaN(parsed) || parsed < 1) {
                    throw new BadRequestError('Invalid limit parameter: must be a positive integer', {
                        field: 'limit',
                        received: req.query.limit,
                    });
                }
                return parsed;
            })() 
            : undefined;
        
        // Default values when no pagination params provided (for backward compatibility)
        const limit = limitParam !== undefined ? Math.min(limitParam, 1000) : 20; // Max 1000 items
        const page = pageParam || 1;
        
        // Calculate skip: use skipParam if provided, otherwise calculate from page
        const skip = skipParam !== undefined ? skipParam : (page - 1) * limit;
        
        // Parse status filter (can be single value or comma-separated)
        let status: string | string[] | undefined;
        if (req.query.status) {
            const statusStr = req.query.status as string;
            status = statusStr.includes(',') ? statusStr.split(',').map(s => s.trim()) : statusStr;
        }

        // Parse type filter (can be single value or comma-separated)
        let type: string | string[] | undefined;
        if (req.query.type) {
            const typeStr = req.query.type as string;
            type = typeStr.includes(',') ? typeStr.split(',').map(t => t.trim()) : typeStr;
        }

        // Parse date range
        let startDate: Date | undefined;
        let endDate: Date | undefined;
        if (req.query.startDate) {
            startDate = new Date(req.query.startDate as string);
            if (isNaN(startDate.getTime())) {
                throw new BadRequestError('Invalid startDate format. Use ISO 8601 format.', {
                    field: 'startDate',
                    received: req.query.startDate,
                });
            }
        }
        if (req.query.endDate) {
            endDate = new Date(req.query.endDate as string);
            if (isNaN(endDate.getTime())) {
                throw new BadRequestError('Invalid endDate format. Use ISO 8601 format.', {
                    field: 'endDate',
                    received: req.query.endDate,
                });
            }
        }

        // Build filter options for count and fetch
        // Note: status from query params is validated as string, but getRunHistory expects RunStatus
        // The validation schema ensures valid RunStatus values, so this cast is safe
        const filterOptions = {
            status: status as RunStatus | RunStatus[] | undefined,
            type,
            startDate,
            endDate
        };

        const [runs, total] = await Promise.all([
            runManager.getRunHistory({
                ...filterOptions,
                limit,
                skip
            }),
            runManager.countRuns(filterOptions)
        ]);

        // Backward compatibility: return array format by default
        // Only return paginated format if explicitly requested (when 'page' is provided)
        if (!hasPaginationParams) {
            res.json(runs);
            return;
        }

        // Calculate pagination metadata for paginated response
        // Recalculate page from skip if skip was used
        const actualPage = skipParam !== undefined ? Math.floor(skip / limit) + 1 : page;
        const totalPages = Math.ceil(total / limit);
        const hasMore = actualPage < totalPages;
        
        res.json({
            data: runs,
            pagination: {
                page: actualPage,
                limit,
                total,
                totalPages,
                hasMore,
            },
        });
    }));

    // GET /api/runs/:id
    // Get run details (requires resource authorization)
    router.get('/runs/:id',
        requireResourceAuthorization('workflowRun', 'id', 'view'),
        validate(workflowSchemas.getRun),
        asyncHandler(async (req, res) => {
        const { id } = req.params;
        
        let run;
        try {
            run = await runManager.getRun(id);
        } catch (error) {
            // Handle MongoDB connection errors
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isMongoError = errorMessage.includes('Mongo') ||
                               errorMessage.includes('mongo') ||
                               errorMessage.includes('ECONNREFUSED') ||
                               errorMessage.includes('connection') ||
                               errorMessage.includes('timeout') ||
                               errorMessage.includes('Mongoose');
            
            if (isMongoError) {
                const { ServiceUnavailableError } = await import('../types/errors.js');
                throw new ServiceUnavailableError(
                    `Failed to retrieve run. Database connection may be unavailable: ${errorMessage}`,
                    {
                        reason: 'database_connection_failed',
                        operation: 'getRun',
                        originalError: errorMessage
                    }
                );
            }
            
            // For other errors, re-throw
            throw error;
        }

        if (!run) {
            throw new NotFoundError('Run', id);
        }

        // ====================================================================
        // LOG FORMATTING: User-facing workflow thoughts vs Debugging logs
        // ====================================================================
        // This endpoint serves TWO types of logs:
        // 1. 'logs' (formatted): User-facing "workflow thoughts" with ChatGPT-style
        //    reasoning and decision-making explanations. These are formatted for
        //    display in the UI and explain WHY decisions are made.
        // 2. 'rawLogs': Original debugging/tracing logs stored in MongoDB/files.
        //    These remain unchanged and are for developers to debug issues.
        //
        // The raw logs in MongoDB and log files are NEVER modified - they remain
        // as technical debugging/tracing logs. Only the user-facing logs sent
        // to the frontend are formatted into workflow thoughts.
        // ====================================================================
        
        let formattedLogs: Array<{
            id: string;
            timestamp: string;
            level: string;
            message: string;
            formattedMessage: string;
            thoughtBubble?: string;
            metadata?: Record<string, unknown>;
            color: string;
            icon: string;
        }> = [];
        
        try {
            const { LogFormatter } = await import('../services/monitoring/LogFormatter.js');
            const formatter = new LogFormatter();
            
            // Set run params for context-aware formatting (e.g., query and location in workflow started message)
            if (run.params) {
                formatter.setRunParams(run.params);
            }

            // Ensure logs are properly formatted - handle MongoDB serialization
            let logsToFormat = run.logs || [];
            if (logsToFormat.length > 0) {
                // Convert any string timestamps back to Date objects if needed
                logsToFormat = logsToFormat.map((log: RunLog) => ({
                    ...log,
                    timestamp: log.timestamp instanceof Date 
                        ? log.timestamp 
                        : typeof log.timestamp === 'string' 
                        ? new Date(log.timestamp) 
                        : new Date()
                }));
            }
            
            // Format logs into user-facing "workflow thoughts" (ChatGPT-style)
            formattedLogs = logsToFormat.length > 0 ? formatter.formatLogs(logsToFormat) : [];
        } catch (error) {
            // If LogFormatter fails, log the error but continue with empty formatted logs
            // This allows the endpoint to still return the run data with raw logs
            logger.warn({ error, runId: id }, 'Failed to format logs, returning raw logs only');
            formattedLogs = [];
        }
        
        // Return run with both formatted (user-facing) and raw (debugging) logs
        res.json({
            ...run,
            logs: formattedLogs, // User-facing workflow thoughts (formatted for UI)
            rawLogs: run.logs     // Debugging/tracing logs (unchanged, for developers)
        });
    }));

    // GET /api/runs/:id/events
    // Server-Side Events (SSE) stream for real-time workflow updates
    // Streams: job_status, queue_position, progress, log, error, completed events
    router.get('/runs/:id/events',
        requireResourceAuthorization('workflowRun', 'id', 'view'),
        validate(workflowSchemas.getRun),
        asyncHandler(async (req, res) => {
        const { id } = req.params;
        
        logger.info({ runId: id, path: req.path, method: req.method }, '[SSE DEBUG] Starting SSE handler');
        
        // Verify run exists BEFORE setting any headers
        logger.debug({ runId: id }, '[SSE DEBUG] Getting run from database');
        const run = await runManager.getRun(id);
        logger.debug({ runId: id, hasRun: !!run, hasWorkflowId: !!run?.workflowId, status: run?.status }, '[SSE DEBUG] Got run from database');
        
        if (!run) {
            logger.warn({ runId: id }, '[SSE DEBUG] Run not found');
            throw new NotFoundError('Run', id);
        }

        // Validate run has required fields before setting headers
        // This prevents errors after headers are set
        if (run.workflowId === undefined || run.workflowId === null) {
            logger.warn({ runId: id, run }, '[SSE] Run missing workflowId');
            // workflowId is optional for some run types, use empty string if missing
        }

        // Get SSE service and register connection
        // WARNING: This sets headers! Any errors after this must be sent as SSE events
        logger.debug({ runId: id }, '[SSE DEBUG] Getting SSE service');
        const { getSSEService } = await import('../services/infrastructure/SSEService.js');
        const sseService = getSSEService();
        logger.debug({ runId: id }, '[SSE DEBUG] Got SSE service, registering connection');
        
        let connectionId: string;
        
        // Get Last-Event-ID header for reconnection support
        const lastEventId = req.headers['last-event-id'] as string | undefined;
        
        try {
            connectionId = sseService.registerConnection(id, res, lastEventId);
            logger.info({ 
                runId: id, 
                connectionId, 
                headersSent: res.headersSent,
                lastEventId: lastEventId || 'none',
                isReconnection: !!lastEventId
            }, '[SSE DEBUG] Connection registered successfully');
        } catch (registerError) {
            // If registration fails, we haven't set headers yet, so throw normally
            logger.error({ error: registerError, runId: id, errorMessage: registerError instanceof Error ? registerError.message : String(registerError), errorStack: registerError instanceof Error ? registerError.stack : undefined }, '[SSE] Failed to register connection');
            throw registerError;
        }

        // From this point on, headers are set - any errors must be sent as SSE events
        try {
            // Send initial status event
            logger.debug({ runId: id, connectionId, status: run.status, workflowId: run.workflowId || '' }, '[SSE DEBUG] Sending initial job status event');
            sseService.emitJobStatus(id, {
                status: run.status as 'queued' | 'active' | 'completed' | 'failed' | 'cancelled',
                runId: id,
                workflowId: run.workflowId || '', // Use empty string if missing
                timestamp: new Date().toISOString(),
                message: `Connected to workflow run ${id}`,
            });
            logger.debug({ runId: id, connectionId }, '[SSE DEBUG] Initial job status event sent');

            // Send current logs (last 50) as catch-up from MongoDB
            // Note: Buffered logs are already sent by registerConnection()
            // IMPORTANT: Use sendLogToConnection() to avoid re-buffering and re-broadcasting
            // to other connections. This is catch-up for THIS connection only.
            if (run.logs && run.logs.length > 0) {
                const recentLogs = run.logs.slice(-50);
                recentLogs.forEach((log: RunLog) => {
                    try {
                        // Generate log ID for deduplication
                        const logTimestamp = log.timestamp instanceof Date 
                            ? log.timestamp.getTime() 
                            : typeof log.timestamp === 'string' 
                                ? new Date(log.timestamp).getTime() 
                                : Date.now();
                        const logMessage = typeof log.message === 'string' 
                            ? log.message.substring(0, 50) 
                            : '';
                        const logId = `${id}-${logTimestamp}-${logMessage}`;
                        
                        // Send directly to this connection only (no re-buffering, no re-broadcast)
                        sseService.sendLogToConnection(connectionId, {
                            runId: id,
                            log,
                            timestamp: log.timestamp instanceof Date 
                                ? log.timestamp.toISOString() 
                                : typeof log.timestamp === 'string' 
                                    ? log.timestamp 
                                    : new Date().toISOString(),
                            logId,
                        });
                    } catch (logError) {
                        // Don't fail on individual log emission errors
                        logger.debug({ error: logError, runId: id }, '[SSE] Failed to send catch-up log');
                    }
                });
                
                // Send catch-up complete marker after MongoDB logs (to this connection only)
                const normalizedRunId = String(id);
                sseService.sendEventToConnection(connectionId, {
                    type: 'catchup_complete',
                    data: {
                        runId: normalizedRunId,
                        source: 'mongodb',
                        logsCount: recentLogs.length,
                        timestamp: new Date().toISOString(),
                    },
                });
            }

            logger.info({ runId: id, connectionId }, '[SSE] Client connected to workflow events stream');

            // Keep the connection alive by waiting for client disconnect
            // The connection will be cleaned up automatically when client disconnects
            // or when workflow completes (via SSEService.cleanupRun)
            // We wait for the 'close' event to ensure the handler doesn't return prematurely
            await new Promise<void>((resolve) => {
                res.on('close', () => {
                    logger.debug({ runId: id, connectionId }, '[SSE] Client disconnected, closing connection');
                    resolve();
                });
                
                // Also handle 'finish' event as a fallback
                res.on('finish', () => {
                    logger.debug({ runId: id, connectionId }, '[SSE] Response finished');
                    resolve();
                });
            });
        } catch (eventError) {
            // Error occurred after headers were set - must send SSE-formatted error
            logger.error({ 
                error: eventError, 
                runId: id, 
                connectionId,
                errorMessage: eventError instanceof Error ? eventError.message : String(eventError),
                errorStack: eventError instanceof Error ? eventError.stack : undefined,
                headersSent: res.headersSent,
                contentType: res.getHeader('Content-Type')
            }, '[SSE] Error after connection registered');
            
            const errorData = {
                error: 'INTERNAL_SERVER_ERROR',
                message: eventError instanceof Error ? eventError.message : 'Unknown error occurred',
                statusCode: 500,
                timestamp: new Date().toISOString(),
            };
            
            const sseMessage = `event: error\ndata: ${JSON.stringify(errorData)}\n\n`;
            
            try {
                if (!res.writableEnded && !res.destroyed) {
                    res.write(sseMessage);
                    res.end();
                }
            } catch (writeError) {
                logger.error({ error: writeError, runId: id }, '[SSE] Failed to send error event');
            }
            
            return; // Don't throw - we've already handled it
        }
    }));

    // GET /api/runs/:id/logs
    // Get raw logs for a run (for debugging/technical use) (requires resource authorization)
    // Returns raw logs array (not formatted, unlike /runs/:id which returns formatted logs)
    router.get('/runs/:id/logs',
        requireResourceAuthorization('workflowRun', 'id', 'view'),
        validate(workflowSchemas.getRun),
        asyncHandler(async (req, res) => {
        const { id } = req.params;
        const run = await runManager.getRun(id);

        if (!run) {
            throw new NotFoundError('Run', id);
        }

        // Return raw logs array (not formatted)
        // Handle MongoDB serialization - ensure timestamps are properly formatted as ISO strings
        const logs = (run.logs || []).map((log: RunLog) => ({
            timestamp: log.timestamp instanceof Date 
                ? log.timestamp.toISOString()
                : typeof log.timestamp === 'string'
                ? log.timestamp
                : new Date().toISOString(),
            level: log.level,
            message: log.message,
            ...(log.metadata && { metadata: log.metadata })
        }));

        res.json(logs);
    }));

    // GET /api/runs/history/results
    // Get past workflow runs with their results and output file information
    // Query parameters: status, type, startDate, endDate, limit, page, skip
    router.get('/runs/history/results', validate(workflowSchemas.listRuns), asyncHandler(async (req, res) => {
        // Parse pagination parameters
        const hasPaginationParams = req.query.page !== undefined;
        // Validate and sanitize to prevent type confusion attacks
        const skipParam = req.query.skip !== undefined 
            ? (() => {
                const parsed = parseInt(req.query.skip as string, 10);
                if (isNaN(parsed) || parsed < 0) {
                    throw new BadRequestError('Invalid skip parameter: must be a non-negative integer', {
                        field: 'skip',
                        received: req.query.skip,
                    });
                }
                return parsed;
            })() 
            : undefined;
        const pageParam = req.query.page !== undefined 
            ? (() => {
                const parsed = parseInt(req.query.page as string, 10);
                if (isNaN(parsed) || parsed < 1) {
                    throw new BadRequestError('Invalid page parameter: must be a positive integer', {
                        field: 'page',
                        received: req.query.page,
                    });
                }
                return parsed;
            })() 
            : undefined;
        const limitParam = req.query.limit !== undefined 
            ? (() => {
                const parsed = parseInt(req.query.limit as string, 10);
                if (isNaN(parsed) || parsed < 1) {
                    throw new BadRequestError('Invalid limit parameter: must be a positive integer', {
                        field: 'limit',
                        received: req.query.limit,
                    });
                }
                return parsed;
            })() 
            : undefined;
        
        const limit = limitParam !== undefined ? Math.min(limitParam, 1000) : 20;
        const page = pageParam || 1;
        const skip = skipParam !== undefined ? skipParam : (page - 1) * limit;
        
        // Parse filters
        let status: string | string[] | undefined;
        if (req.query.status) {
            const statusStr = req.query.status as string;
            status = statusStr.includes(',') ? statusStr.split(',').map(s => s.trim()) : statusStr;
        }

        let type: string | string[] | undefined;
        if (req.query.type) {
            const typeStr = req.query.type as string;
            type = typeStr.includes(',') ? typeStr.split(',').map(t => t.trim()) : typeStr;
        }

        let startDate: Date | undefined;
        let endDate: Date | undefined;
        if (req.query.startDate) {
            startDate = new Date(req.query.startDate as string);
            if (isNaN(startDate.getTime())) {
                throw new BadRequestError('Invalid startDate format. Use ISO 8601 format.', {
                    field: 'startDate',
                    received: req.query.startDate,
                });
            }
        }
        if (req.query.endDate) {
            endDate = new Date(req.query.endDate as string);
            if (isNaN(endDate.getTime())) {
                throw new BadRequestError('Invalid endDate format. Use ISO 8601 format.', {
                    field: 'endDate',
                    received: req.query.endDate,
                });
            }
        }

        const filterOptions = {
            status: status as RunStatus | RunStatus[] | undefined,
            type,
            startDate,
            endDate
        };

        const [runs, total] = await Promise.all([
            runManager.getRunHistory({
                ...filterOptions,
                limit,
                skip
            }),
            runManager.countRuns(filterOptions)
        ]);

        // Import path conversion utility
        const { pathToApiEndpoint } = await import('../services/workflow/WorkflowOutputService.js');

        // Enhance runs with output file API endpoints
        const runsWithResults = runs.map(run => {
            const enhancedRun: typeof run & {
                outputUrls?: {
                    jsonUrl: string;
                    markdownUrl: string;
                    txtUrl: string;
                    csvUrl: string;
                    htmlUrl: string;
                    xmlUrl: string;
                };
            } = { ...run };
            
            // Convert output paths to API endpoints if they exist
            if (run.outputPaths) {
                enhancedRun.outputUrls = {
                    jsonUrl: pathToApiEndpoint(run.outputPaths.jsonPath || '', 'json'),
                    markdownUrl: pathToApiEndpoint(run.outputPaths.markdownPath || '', 'md'),
                    txtUrl: pathToApiEndpoint(run.outputPaths.txtPath || '', 'txt'),
                    csvUrl: pathToApiEndpoint(run.outputPaths.csvPath || '', 'csv'),
                    htmlUrl: pathToApiEndpoint(run.outputPaths.htmlPath || '', 'html'),
                    xmlUrl: pathToApiEndpoint(run.outputPaths.xmlPath || '', 'xml')
                };
            }
            
            return enhancedRun;
        });

        // Return array format by default, paginated format when 'page' is provided
        if (!hasPaginationParams) {
            res.json(runsWithResults);
            return;
        }

        const actualPage = skipParam !== undefined ? Math.floor(skip / limit) + 1 : page;
        const totalPages = Math.ceil(total / limit);
        const hasMore = actualPage < totalPages;
        
        res.json({
            data: runsWithResults,
            pagination: {
                page: actualPage,
                limit,
                total,
                totalPages,
                hasMore,
            },
        });
    }));

    // GET /api/runs/query/:queryId
    // Get workflow runs by queryId (for result persistence and historical tracking)
    router.get('/runs/query/:queryId', asyncHandler(async (req, res) => {
        const { queryId } = req.params;
        const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
        const limit = limitParam && limitParam > 0 && limitParam <= 100 ? limitParam : 10;

        if (!queryId || typeof queryId !== 'string' || queryId.trim() === '') {
            throw new BadRequestError('queryId is required and must be a non-empty string', {
                field: 'queryId',
                received: queryId,
            });
        }

        // Validate queryId format (MongoDB ObjectId)
        if (!/^[0-9a-fA-F]{24}$/.test(queryId)) {
            throw new BadRequestError('queryId must be a valid MongoDB ObjectId (24 hex characters)', {
                field: 'queryId',
                format: 'MongoDB ObjectId',
                received: queryId,
            });
        }

            const runs = await runManager.getRunsByQueryId(queryId, limit);

            // Import path conversion utility for output URLs
            const { pathToApiEndpoint } = await import('../services/workflow/WorkflowOutputService.js');

            // Enhance runs with output file API endpoints
            const runsWithResults = runs.map(run => {
                const enhancedRun: typeof run & {
                    outputUrls?: {
                        jsonUrl: string;
                        markdownUrl: string;
                        txtUrl: string;
                        csvUrl: string;
                        htmlUrl: string;
                        xmlUrl: string;
                    };
                } = { ...run };
                
                // Convert output paths to API endpoints if they exist
                if (run.outputPaths) {
                    enhancedRun.outputUrls = {
                        jsonUrl: pathToApiEndpoint(run.outputPaths.jsonPath || '', 'json'),
                        markdownUrl: pathToApiEndpoint(run.outputPaths.markdownPath || '', 'md'),
                        txtUrl: pathToApiEndpoint(run.outputPaths.txtPath || '', 'txt'),
                        csvUrl: pathToApiEndpoint(run.outputPaths.csvPath || '', 'csv'),
                        htmlUrl: pathToApiEndpoint(run.outputPaths.htmlPath || '', 'html'),
                        xmlUrl: pathToApiEndpoint(run.outputPaths.xmlPath || '', 'xml')
                    };
                }
                
                return enhancedRun;
            });

        res.json({
            queryId,
            runs: runsWithResults,
            count: runsWithResults.length,
            limit
        });
    }));

    // POST /api/runs/:id/cancel (requires resource authorization)
    router.post('/runs/:id/cancel',
        requireResourceAuthorization('workflowRun', 'id', 'edit'),
        validate(workflowSchemas.cancelRun),
        asyncHandler(async (req, res) => {
        const { id } = req.params;
        
        // Debug logging for route matching
        if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'development') {
            logger.debug({ runId: id, path: req.path, method: req.method }, 'Cancel workflow run endpoint called');
        }
        
        // Use WorkflowEngine.cancel() for proper validation and state management
        // This ensures the run is in a cancellable state and handles cancellation correctly
        try {
            // Check if run exists first (for better error handling)
            const run = await runManager.getRun(id);
            if (!run) {
                throw new NotFoundError('Run', id);
            }
            
            // If already cancelled or in terminal state, return success (idempotent)
            if (run.status === 'cancelled' || run.status === 'completed') {
                res.json({ 
                    message: 'Run is already cancelled or completed',
                    runId: run._id?.toString(),
                    status: run.status
                });
                return;
            }
            
            // Check if run failed recently (within 5 seconds) - allow cancellation for race condition
            // Use endTime if available (when run actually failed), otherwise use startTime as fallback
            const failureTime = run.endTime ? new Date(run.endTime).getTime() : (run.startTime ? new Date(run.startTime).getTime() : Date.now());
            const isRecentlyFailed = run.status === 'failed' && 
                (Date.now() - failureTime) < 5000;
            
            // For recently failed runs, we need to handle them specially
            // WorkflowEngine.cancel() doesn't allow cancelling failed runs, so we handle it here
            if (isRecentlyFailed) {
                await runManager.updateStatus(id, 'cancelled');
                await runManager.log(id, 'Run geannuleerd (was recent mislukt)', 'warn');
                
                // Update progress streaming
                try {
                    const { getProgressStreamingService } = await import('../services/progress/ProgressStreamingService.js');
                    const progressStreamingService = getProgressStreamingService();
                    progressStreamingService.cancelRun(id);
                } catch (progressError) {
                    logger.error({ error: progressError }, 'Failed to update progress streaming on cancellation');
                }
                
                res.json({ 
                    message: 'Run cancelled',
                    runId: id,
                    previousStatus: run.status,
                    note: 'Run was recently failed and has been marked as cancelled'
                });
                return;
            }
            
            // Use WorkflowEngine.cancel() for standard cancellation
            const cancelledRun = await workflowEngine.cancel(id);
            
            res.json({ 
                message: 'Run cancelled',
                runId: cancelledRun._id?.toString() || id,
                previousStatus: run.status
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Handle specific error cases
            if (error instanceof NotFoundError) {
                throw error; // Let NotFoundError propagate (returns 404)
            }
            
            // If the run is already cancelled or completed, return success (idempotent operation)
            // Also handle paused and failed states for idempotency
            if (errorMessage.includes('status is') || errorMessage.includes('already completed') || errorMessage.includes('already cancelled')) {
                const run = await runManager.getRun(id);
                if (run && (run.status === 'cancelled' || run.status === 'completed' || run.status === 'paused' || run.status === 'failed')) {
                    // Return success for idempotent operation
                    res.json({ 
                        message: run.status === 'cancelled' || run.status === 'completed' 
                            ? 'Run is already cancelled or completed'
                            : `Run is already ${run.status}`,
                        runId: run._id?.toString() || id,
                        status: run.status
                    });
                    return;
                }
                
                // If status prevents cancellation, provide a clear error message
                if (run) {
                    throw new BadRequestError(`Cannot cancel run: current status is "${run.status}". Only "running" or "pending" runs can be cancelled.`, {
                        runId: id,
                        currentStatus: run.status,
                    });
                }
            }
            
            // Re-throw other errors
            throw error;
        }
    }));

    // POST /api/runs/:id/pause
    router.post('/runs/:id/pause',
        requireResourceAuthorization('workflowRun', 'id', 'edit'),
        validate(workflowSchemas.pauseRun),
        asyncHandler(async (req, res) => {
        const { id } = req.params;
        
        // Use WorkflowEngine.pause() for proper validation and state management
        // This ensures the run is in a pausable state and handles the pause correctly
        try {
            // Check if run exists first (for better error handling)
            const run = await runManager.getRun(id);
            if (!run) {
                throw new NotFoundError('Run', id);
            }
            
            // If already paused or in terminal state, return success (idempotent)
            if (run.status === 'paused' || run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
                res.json({ 
                    message: 'Run is already in a terminal or paused state',
                    runId: run._id?.toString(),
                    status: run.status
                });
                return;
            }
            
            const pausedRun = await workflowEngine.pause(id);
            res.json({ 
                message: 'Run pause requested',
                runId: pausedRun._id?.toString(),
                status: pausedRun.status
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Handle specific error cases
            if (error instanceof NotFoundError) {
                throw error; // Let NotFoundError propagate (returns 404)
            }
            
            // If the run status prevents pausing, provide a clear error message
            if (errorMessage.includes('status is') || errorMessage.includes('Cannot pause')) {
                const run = await runManager.getRun(id);
                if (run) {
                    throw new BadRequestError(`Cannot pause run: current status is "${run.status}". Only "running" or "pending" runs can be paused.`, {
                        runId: id,
                        currentStatus: run.status,
                    });
                }
            }
            
            // Re-throw other errors
            throw error;
        }
    }));

    // POST /api/runs/:id/resume
    // US-010: Enhanced to accept resolution data and apply learning from user intervention
    router.post('/runs/:id/resume',
        requireResourceAuthorization('workflowRun', 'id', 'run'),
        asyncHandler(async (req, res) => {
        const { id } = req.params;
        const resolution = req.body.resolution as {
            action?: string;
            pattern?: string;
            notes?: string;
            metadata?: Record<string, unknown>;
        } | undefined;

        const run = await runManager.getRun(id);

        if (!run) {
            throw new NotFoundError('Run', id);
        }

        // Support resuming both paused and failed workflows
        if (run.status !== 'paused' && run.status !== 'failed') {
            throw new BadRequestError('Run is not in a resumable state (must be paused or failed)', {
                runId: id,
                currentStatus: run.status,
            });
        }

            // US-010: Apply learning from resolution if provided
            // Use NavigationPatternLearningService to learn patterns from user intervention
            let learnedPatternId: string | undefined;
            let learnedPatternType: string | undefined;
            if (resolution && resolution.pattern) {
                const pausedState = run.pausedState as { stepId?: string; context?: Record<string, unknown> } | undefined;
                const pausedContext = pausedState?.context || {};
                const sourceUrl = pausedContext.url as string | undefined;
                const error = pausedContext.error as string | undefined;

                if (sourceUrl) {
                    try {
                        // Use NavigationPatternLearningService to learn patterns
                        if (!patternLearningService) {
                            logger.warn({ runId: id }, 'Pattern learning service not available, skipping pattern learning');
                        } else {
                            // Extract domain from URL
                            let domain: string;
                            try {
                                const urlObj = new URL(sourceUrl);
                                domain = urlObj.hostname;
                            } catch {
                                domain = 'unknown';
                            }

                            // Determine pattern type (default to xpath if not specified)
                            const patternType: 'xpath' | 'css' | 'url_pattern' | 'semantic' = 
                                resolution.pattern.startsWith('//') || resolution.pattern.startsWith('/') 
                                    ? 'xpath'
                                    : resolution.pattern.startsWith('#') || resolution.pattern.startsWith('.')
                                    ? 'css'
                                    : 'xpath'; // Default to xpath

                            // Create navigation context
                            const navigationContext: NavigationContext = {
                                url: sourceUrl,
                                domain,
                                errorMessage: error,
                                errorType: pausedContext.errorType as string | undefined,
                                runId: id,
                                timestamp: new Date(),
                            };

                            // Create pattern input
                            const patternInput: LearnedPatternInput = {
                                pattern: resolution.pattern,
                                patternType,
                                sourceUrl,
                                context: {
                                    domain,
                                    errorType: pausedContext.errorType as string | undefined,
                                    errorMessage: error,
                                },
                                metadata: {
                                    learnedFrom: 'user_intervention',
                                    runId: id,
                                    notes: resolution.notes,
                                },
                            };

                            // Learn pattern using the service
                            const learnedPattern = await patternLearningService.learnPattern(patternInput, navigationContext);
                            learnedPatternId = learnedPattern.id;
                            learnedPatternType = learnedPattern.patternType;

                            await runManager.log(
                                id,
                                `📚 Learned navigation pattern from user intervention: ${learnedPattern.id} (${learnedPattern.patternType}, applied to ${sourceUrl})`,
                                'info',
                                { patternId: learnedPattern.id, resolution, sourceUrl }
                            );

                            logger.info(
                                { runId: id, patternId: learnedPattern.id, pattern: resolution.pattern, sourceUrl },
                                'Learned navigation pattern from user intervention using NavigationPatternLearningService'
                            );
                        }
                    } catch (learnError) {
                        // Don't fail resume if learning fails, just log it
                        logger.warn(
                            { error: learnError, runId: id, resolution },
                            'Failed to learn from resolution, continuing with resume'
                        );
                        await runManager.log(
                            id,
                            `⚠️ Failed to learn from resolution: ${learnError instanceof Error ? learnError.message : String(learnError)}`,
                            'warn'
                        );
                    }
                } else {
                    logger.warn(
                        { runId: id, resolution },
                        'Pattern provided in resolution but no source URL in paused context, skipping pattern learning'
                    );
                }
            }

            // Save state context and stepId BEFORE resumeRun clears it
            let pausedContext: Record<string, unknown> = run.params || {};
            let resumeStepId: string | undefined;
            
            if (run.status === 'paused' && run.pausedState) {
                // For paused workflows, use pausedState
                const pausedState = run.pausedState as { stepId?: string; context?: Record<string, unknown> } | undefined;
                pausedContext = pausedState?.context || run.params;
                resumeStepId = pausedState?.stepId;
            } else if (run.status === 'failed') {
                // For failed workflows, try to restore from checkpoint
                const latestCheckpoint = run.params?.__latestCheckpoint as {
                    stepId: string;
                    nextStepId?: string;
                    context: Record<string, unknown>;
                    checkpointedAt: string;
                } | undefined;
                
                if (latestCheckpoint && latestCheckpoint.context) {
                    // Merge original input parameters with checkpoint context to preserve inputs like selectedWebsites
                    const originalParams = run.params || {};
                    const internalKeys = [
                        '__latestCheckpoint',
                        '__checkpointHistory',
                        '__currentStepId',
                        '__resumeStepId',
                        '__stepCheckpoints',
                        '__stepCheckpointHistory',
                        'workflowId',
                        'workflowName',
                        'userId',
                        'createdBy'
                    ];
                    
                    // Start with checkpoint context and merge in original params (excluding internal keys)
                    pausedContext = { ...latestCheckpoint.context };
                    for (const [key, value] of Object.entries(originalParams)) {
                        if (!internalKeys.includes(key) && !Object.prototype.hasOwnProperty.call(pausedContext, key)) {
                            pausedContext[key] = value;
                        }
                    }
                    
                    resumeStepId = latestCheckpoint.nextStepId || latestCheckpoint.stepId;
                    
                    await runManager.log(
                        id,
                        `Resuming failed workflow from checkpoint (step: ${latestCheckpoint.stepId}, next: ${resumeStepId}, checkpointed: ${latestCheckpoint.checkpointedAt})`,
                        'info'
                    );
                } else {
                    await runManager.log(
                        id,
                        'Warning: Resuming failed workflow but no checkpoint available. Will start from beginning.',
                        'warn'
                    );
                }
            }

            // Store stepId in context so initializeState can restore it even after state is cleared
            if (resumeStepId) {
                pausedContext.__resumeStepId = resumeStepId;
            }

            // US-010: Resume run with resolution context
            await runManager.resumeRun(id, resolution ? {
                action: resolution.action || 'resumed',
                pattern: resolution.pattern,
                notes: resolution.notes,
                metadata: resolution.metadata
            } : undefined);

            const workflowId = run.params.workflowId;
            const workflow = getWorkflowById(workflowId as string);

            if (!workflow) {
                throw new NotFoundError('Workflow definition', workflowId as string);
            }

            // Resume in background (fire-and-forget)
            // Use pausedContext instead of run.params to restore workflow state
            (async () => {
                try {
                    await workflowEngine.executeWorkflow(workflow, pausedContext, id);
                } catch (err) {
                    logger.error({ error: err, workflowId: id }, 'Error resuming workflow');
                }
            })();

            // Enhanced response format with pattern learning information
            const response: {
                message: string;
                runId: string;
                patternLearned?: {
                    patternId: string;
                    pattern: string;
                    patternType: string;
                };
            } = {
                message: 'Workflow resumed',
                runId: id,
            };

            if (learnedPatternId && learnedPatternType && resolution?.pattern) {
                response.patternLearned = {
                    patternId: learnedPatternId,
                    pattern: resolution.pattern,
                    patternType: learnedPatternType,
                };
            }

        res.json(response);
    }));

    return router;
}
