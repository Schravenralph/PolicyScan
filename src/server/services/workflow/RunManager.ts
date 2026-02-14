import { Db, Collection, ObjectId, Filter } from 'mongodb';
import { Run, RunStatus, RunLog } from '../infrastructure/types.js';
import { FileLogger } from '../monitoring/FileLogger.js';
import { fireAndForget } from '../../utils/initializationState.js';
import { logger } from '../../utils/logger.js';
import { IRunManager } from './interfaces/IRunManager.js';
import { validateEnv } from '../../config/env.js';
import { NotFoundError, BadRequestError } from '../../types/errors.js';

export class RunManager implements IRunManager {
    private runsCollection: Collection<Run>;
    private fileLogger: FileLogger;
    private logBuffer: Map<string, RunLog[]> = new Map();
    private lastFlushTime: number = Date.now();
    private readonly BATCH_SIZE = 100;
    private readonly FLUSH_INTERVAL_MS = 2000;

    constructor(private db: Db) {
        this.runsCollection = this.db.collection<Run>('runs');
        this.fileLogger = new FileLogger();

        // Start background flush to ensure logs are persisted even if no new logs arrive
        // Use unref() so this timer doesn't prevent the process from exiting
        setInterval(() => {
            if (this.logBuffer.size > 0) {
                this.flushLogs().catch(err => {
                    logger.error({ error: err }, 'Background flush failed');
                });
            }
        }, this.FLUSH_INTERVAL_MS).unref();
    }

    /**
     * Create a new run
     * US-010: Enhanced to properly record mode from params
     * WI-SEC-005: Enhanced to track ownership (createdBy)
     */
    async createRun(type: string, params: Record<string, unknown>, createdBy?: string): Promise<Run> {
        // Extract mode from params if present (US-010)
        const mode = params?.mode || 'dev';
        
        // Ensure mode is valid
        const validModes = ['dev', 'prod', 'hybrid'];
        const normalizedMode = (typeof mode === 'string' && validModes.includes(mode)) ? mode : 'dev';
        
        // Extract createdBy from params if not provided directly (for backward compatibility)
        const ownerId = createdBy || params?.createdBy as string | undefined || params?.userId as string | undefined;
        
        // Create run with mode recorded in params and ownership tracking
        const run: Run = {
            type,
            status: 'pending',
            startTime: new Date(),
            params: {
                ...params,
                mode: normalizedMode // Ensure mode is always set
            },
            logs: [],
            ...(ownerId && { createdBy: ownerId }), // Set createdBy if available
        };

        logger.info(
            { 
                type, 
                workflowId: params.workflowId, 
                queryId: params.queryId,
                hasParams: Object.keys(params).length > 0
            },
            'Creating workflow run in database'
        );

        try {
            const result = await this.runsCollection.insertOne(run);
            const insertedId = result.insertedId;
            
            logger.info(
                { 
                    runId: insertedId.toString(), 
                    type, 
                    workflowId: params.workflowId,
                    queryId: params.queryId,
                    collection: 'runs'
                },
                '✅ Workflow run created and persisted to database'
            );
            
            return { ...run, _id: insertedId };
        } catch (error) {
            logger.error(
                { 
                    error, 
                    type, 
                    workflowId: params.workflowId,
                    queryId: params.queryId,
                    collection: 'runs'
                },
                '❌ Failed to create workflow run in database'
            );
            throw error;
        }
    }

    /**
     * Start a run (update status to running)
     */
    async startRun(runId: string | ObjectId): Promise<void> {
        await this.updateStatus(runId, 'running');
        await this.log(runId, 'Run gestart', 'info');
        await this.flushLogs(runId.toString());
    }

    /**
     * Complete a run
     * Enhanced to include pages_scraped, files_created, total_size in result (US-005)
     * Now supports optional status for partial failures (completed_with_errors)
     */
    async completeRun(runId: string | ObjectId, result?: Record<string, unknown>, status: RunStatus = 'completed'): Promise<void> {
        const id = new ObjectId(runId);
        
        // Ensure result includes standard completion metrics if not provided
        // We set defaults first, then overwrite with provided result
        // This ensures that if result has these keys, they are preserved
        const defaults = {
            pages_scraped: 0,
            files_created: 0,
            total_size: 0,
        };

        // Handle context: if result is passed and doesn't have metrics, it's likely context
        // Store it both in result.context and in the context field of the run
        let context: Record<string, unknown> | undefined;
        let enhancedResult: Record<string, unknown>;
        
        if (result && !('pages_scraped' in result) && !('files_created' in result) && !('total_size' in result)) {
            // Result doesn't have metrics, so it's likely context being passed directly
            // This is the case when completeWorkflow calls completeRun with context
            context = result;
            enhancedResult = {
                ...defaults,
                context // Store context in result.context for backward compatibility
            };
        } else {
            // Normal result with metrics (or explicit result object)
            enhancedResult = {
                ...defaults,
                ...result
            };
            // If result has a context property, extract it for persistence
            if (result && 'context' in result && typeof result.context === 'object' && result.context !== null) {
                context = result.context as Record<string, unknown>;
            }
        }

        // Ensure metrics are valid numbers (if they were overwritten with non-numbers or if they are missing)
        // This is safer than using ?? on properties that might not be enumerable or present on the prototype in some edge cases
        if (typeof enhancedResult.pages_scraped !== 'number') enhancedResult.pages_scraped = 0;
        if (typeof enhancedResult.files_created !== 'number') enhancedResult.files_created = 0;
        if (typeof enhancedResult.total_size !== 'number') enhancedResult.total_size = 0;

        // Build update object
        const updateObj: {
            $set: Record<string, unknown>;
            $unset?: Record<string, 1 | true | ''>;
        } = {
            $set: {
                status,
                endTime: new Date(),
                result: enhancedResult
            },
            $unset: {
                'params.__resumeStepId': 1 // Clean up resume stepId on completion
            }
        };

        // Persist context field if available (for workflow execution context)
        if (context) {
            updateObj.$set.context = context;
        }

        await this.runsCollection.updateOne(
            { _id: id },
            updateObj
        );

        const logMessage = status === 'completed_with_errors'
            ? 'Run completed with errors'
            : 'Run completed successfully';
        const logLevel = status === 'completed_with_errors' ? 'warn' : 'info';

        await this.log(runId, logMessage, logLevel);
        await this.flushLogs(runId.toString());
        
        // Clean up WebSocket streaming for completed run (DEPRECATED - kept for backward compatibility)
        // NOTE: WebSocket log channel deprecated 2026-02-08, replaced with SSE
        // This cleanup call is safe to keep or remove (service handles missing initialization gracefully)
        fireAndForget(
            (async () => {
                try {
                    const { getWorkflowLogStreamingService } = await import('./WorkflowLogStreamingService.js');
                    const logStreamingService = getWorkflowLogStreamingService();
                    logStreamingService.cleanupRun(runId.toString());
                } catch (error) {
                    logger.debug({ error, runId: runId.toString() }, 'Failed to cleanup WebSocket logs (deprecated service)');
                }
            })(),
            {
                service: 'RunManager',
                operation: 'cleanupWebSocketLogs',
                logger
            }
        );

        // Clean up SSE connections for completed run
        fireAndForget(
            (async () => {
                try {
                    const { getSSEService } = await import('../infrastructure/SSEService.js');
                    const sseService = getSSEService();
                    sseService.setRunStatus(runId.toString(), 'completed');
                    sseService.cleanupRun(runId.toString());
                } catch (error) {
                    logger.debug({ error, runId: runId.toString() }, 'Failed to cleanup SSE connections');
                }
            })(),
            {
                service: 'RunManager',
                operation: 'cleanupSSEConnections',
                logger
            }
        );
    }

    /**
     * Fail a run
     */
    async failRun(runId: string | ObjectId, error: string, status: RunStatus = 'failed'): Promise<void> {
        const id = new ObjectId(runId);
        // Ensure status is a valid failure status
        const failureStatus: RunStatus = (status === 'timeout' || status === 'failed') ? status : 'failed';
        await this.runsCollection.updateOne(
            { _id: id },
            {
                $set: {
                    status: failureStatus,
                    endTime: new Date(),
                    error
                }
            }
        );
        const logMessage = failureStatus === 'timeout' ? `Run timed out: ${error}` : `Run failed: ${error}`;
        await this.log(runId, logMessage, 'error');
        await this.flushLogs(runId.toString());
        
        // Clean up WebSocket streaming for failed run (DEPRECATED - kept for backward compatibility)
        // NOTE: WebSocket log channel deprecated 2026-02-08, replaced with SSE
        // This cleanup call is safe to keep or remove (service handles missing initialization gracefully)
        fireAndForget(
            (async () => {
                try {
                    const { getWorkflowLogStreamingService } = await import('./WorkflowLogStreamingService.js');
                    const logStreamingService = getWorkflowLogStreamingService();
                    logStreamingService.cleanupRun(runId.toString());
                } catch (error) {
                    logger.debug({ error, runId: runId.toString() }, 'Failed to cleanup WebSocket logs (deprecated service)');
                }
            })(),
            {
                service: 'RunManager',
                operation: 'cleanupWebSocketLogs',
                logger
            }
        );

        // Clean up SSE connections for failed run
        fireAndForget(
            (async () => {
                try {
                    const { getSSEService } = await import('../infrastructure/SSEService.js');
                    const sseService = getSSEService();
                    sseService.setRunStatus(runId.toString(), 'failed');
                    sseService.cleanupRun(runId.toString());
                } catch (error) {
                    logger.debug({ error, runId: runId.toString() }, 'Failed to cleanup SSE connections');
                }
            })(),
            {
                service: 'RunManager',
                operation: 'cleanupSSEConnections',
                logger
            }
        );
    }

    /**
     * Flush buffered logs to MongoDB
     * @param runId Optional run ID to flush specific logs only
     */
    async flushLogs(runId?: string): Promise<void> {
        try {
            const updates: Promise<unknown>[] = [];
            const now = Date.now();

            // Helper to flush a single run
            const flushRun = async (rId: string, logs: RunLog[]) => {
                if (logs.length === 0) return;

                // Delete buffer entry to avoid unbounded Map growth and unnecessary iteration
                this.logBuffer.delete(rId);

                try {
                    await this.runsCollection.updateOne(
                        { _id: new ObjectId(rId) },
                        {
                            $push: { logs: { $each: logs } }
                        }
                    );
                } catch (error) {
                    // If write fails, try to restore logs to buffer?
                    // For now, just log error to avoid complexity and potential infinite loops
                    logger.error({ error, runId: rId }, 'Failed to flush logs to database');
                }
            };

            if (runId) {
                const logs = this.logBuffer.get(runId) || [];
                if (logs.length > 0) {
                    updates.push(flushRun(runId, logs));
                }
            } else {
                // Flush all runs
                for (const [rId, logs] of this.logBuffer.entries()) {
                    if (logs.length > 0) {
                        updates.push(flushRun(rId, logs));
                    }
                }
                this.lastFlushTime = now;
            }

            await Promise.all(updates);
        } catch (error) {
            logger.error({ error }, 'Error during log flushing');
        }
    }

    /**
     * Add a log entry to a run
     * 
     * IMPORTANT: This stores RAW, unformatted logs for debugging/tracing purposes.
     * - MongoDB: Stores raw logs exactly as provided (for debugging, tracing, analysis)
     * - File logs: Stores raw logs exactly as provided (for detailed debugging)
     * - Console: Outputs raw logs with minimal formatting (for dev visibility)
     * 
     * Formatting into "workflow thoughts" (ChatGPT-style) is ONLY applied when
     * logs are sent to the frontend via the API endpoint. The original raw logs
     * remain unchanged in storage for debugging purposes.
     * 
     * US-010: Enhanced with mode-specific logging verbosity
     */
    async log(
        runId: string | ObjectId,
        message: string,
        level: 'info' | 'warn' | 'error' | 'debug' = 'info',
        metadata?: Record<string, unknown>
    ): Promise<void> {
        const id = new ObjectId(runId);
        const runIdStr = id.toString();

        const logEntry: RunLog = {
            timestamp: new Date(),
            level,
            message,
            metadata
        };

        // DEBUG level logs: ONLY write to file, NEVER to MongoDB (user-facing workflow panel) or console
        // DEBUG is the highest detail level for system observability (function calls, inputs/outputs, etc.)
        if (level === 'debug') {
            // Write to file only - detailed system observability logs
            fireAndForget(
                this.fileLogger.writeLog(runIdStr, logEntry),
                {
                    service: 'RunManager',
                    operation: 'writeLog',
                    logger
                }
            );
            return; // Don't store in MongoDB or console - DEBUG is file-only
        }

        // US-010: Get mode from run params to determine logging verbosity (for info/warn/error)
        const run = await this.getRun(runId);
        const mode = (run?.params?.mode as string | undefined) || 'dev';
        const { scraperConfig } = await import('../../config/scraperConfig.js');
        const modeConfig = scraperConfig.modes[mode as keyof typeof scraperConfig.modes] || scraperConfig.modes.dev;
        const verbosity = modeConfig.loggingVerbosity;

        // US-010: Filter logs based on mode verbosity (info/warn/error only, debug already handled above)
        // verbose: log everything (dev mode)
        // normal: log info, warn, error (hybrid mode)
        // minimal: log only warn and error (prod mode)
        const shouldLog = 
            verbosity === 'verbose' || // Always log in verbose mode
            (verbosity === 'normal' && (level === 'info' || level === 'warn' || level === 'error')) || // Normal: skip debug (already handled)
            (verbosity === 'minimal' && (level === 'warn' || level === 'error')); // Minimal: only warnings/errors

        // Store in MongoDB - User-facing workflow panel logs (info/warn/error only)
        // Buffer logs to reduce DB write frequency
        const currentBuffer = this.logBuffer.get(runIdStr) || [];
        currentBuffer.push(logEntry);
        this.logBuffer.set(runIdStr, currentBuffer);

        // Check if we should flush
        const shouldFlush =
            currentBuffer.length >= this.BATCH_SIZE ||
            (Date.now() - this.lastFlushTime >= this.FLUSH_INTERVAL_MS);

        if (shouldFlush) {
            // Flush all logs if interval passed, or just this run if batch size reached?
            // Flushing all is safer to keep lastFlushTime meaningful
            await this.flushLogs();
        }

        // Write to file - All logs go to file for debugging/tracing
        await this.fileLogger.writeLog(runIdStr, logEntry).catch(err => {
            // Don't fail if file logging fails
            logger.warn({ error: err, runId: runIdStr }, 'Failed to write log to file');
        });

        // Console output - Only if verbosity allows (info/warn/error only, debug never)
        if (shouldLog) {
            const icon = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
            console.log(`${icon} [${runIdStr}] ${message}`);
        }

        // Emit SSE events for real-time log streaming (only for non-debug logs that pass verbosity filter)
        // Debug logs are file-only and should not be streamed to clients
        // NOTE: WebSocket log emission removed per TOOL-006 - SSE is the default transport for workflow logs
        // Migration date: 2026-02-08
        if (shouldLog) {
            // Emit via SSE (per TOOL-006 - SSE is the default for workflow logs)
            // Use fireAndForget but ensure runId is normalized to string
            fireAndForget(
                (async () => {
                    try {
                        const { getSSEService } = await import('../infrastructure/SSEService.js');
                        const sseService = getSSEService();
                        
                        // Ensure runId is a string (normalize ObjectId if needed)
                        const normalizedRunId = String(runIdStr);
                        
                        // Generate unique log ID for deduplication
                        const logTimestamp = logEntry.timestamp instanceof Date 
                            ? logEntry.timestamp.getTime() 
                            : Date.now();
                        const logMessage = typeof logEntry.message === 'string' 
                            ? logEntry.message.substring(0, 50) 
                            : '';
                        const logId = `${normalizedRunId}-${logTimestamp}-${logMessage}`;
                        
                        sseService.emitLog(normalizedRunId, {
                            runId: normalizedRunId,
                            log: logEntry,
                            timestamp: logEntry.timestamp instanceof Date 
                                ? logEntry.timestamp.toISOString() 
                                : new Date().toISOString(),
                            logId,
                        });
                    } catch (error) {
                        // Don't fail if SSE emission fails - logging should be resilient
                        logger.debug({ error, runId: runIdStr }, 'Failed to emit log via SSE');
                    }
                })(),
                {
                    service: 'RunManager',
                    operation: 'emitLogSSE',
                    logger
                }
            );
        }
    }

    /**
     * Pause a run and save state
     */
    async pauseRun(runId: string | ObjectId, state: { stepId: string; context: Record<string, unknown> }): Promise<void> {
        const id = new ObjectId(runId);
        await this.runsCollection.updateOne(
            { _id: id },
            {
                $set: {
                    status: 'paused',
                    pausedState: state
                }
            }
        );
        await this.log(runId, 'Run gepauzeerd en status opgeslagen', 'warn');
        await this.flushLogs(runId.toString());
    }

    /**
     * Resume a paused run with optional resolution context for learning
     * US-010: Enhanced to capture user resolution and enable learning from intervention
     * 
     * @param runId - The run ID to resume
     * @param resolution - Optional resolution context containing:
     *   - action: What action was taken (e.g., 'skip', 'retry', 'manual_navigation', 'add_pattern')
     *   - pattern?: Navigation pattern learned (e.g., XPath, CSS selector, URL pattern)
     *   - notes?: Human-readable notes about the resolution
     *   - metadata?: Additional context for learning
     */
    async resumeRun(
        runId: string | ObjectId,
        resolution?: {
            action: string;
            pattern?: string;
            notes?: string;
            metadata?: Record<string, unknown>;
        }
    ): Promise<void> {
        const id = new ObjectId(runId);
        const run = await this.getRun(runId);
        
        if (!run) {
            throw new NotFoundError('Workflow run', String(runId));
        }
        
        // Support resuming both paused and failed workflows
        if (run.status !== 'paused' && run.status !== 'failed') {
            throw new BadRequestError(`Cannot resume run ${runId}: status is "${run.status}", expected "paused" or "failed"`, {
                runId,
                currentStatus: run.status,
                expectedStatus: ['paused', 'failed']
            });
        }

        // US-010: Log resolution for learning if provided
        if (resolution) {
            await this.log(
                runId,
                `📚 Learning from user resolution: ${resolution.action}${resolution.pattern ? ` (pattern: ${resolution.pattern})` : ''}${resolution.notes ? ` - ${resolution.notes}` : ''}`,
                'info',
                {
                    resolution,
                    learnedAt: new Date().toISOString(),
                    pausedState: run.pausedState
                }
            );

            // Store resolution in run params for later learning processing
            await this.runsCollection.updateOne(
                { _id: id },
                {
                    $set: {
                        'params.lastResolution': resolution,
                        'params.lastResolvedAt': new Date()
                    }
                }
            );
        }

        // Preserve stepId in params before clearing pausedState
        // This ensures we can restore the step even if context doesn't have __resumeStepId
        let stepIdToPreserve: string | undefined;
        
        if (run.status === 'paused' && run.pausedState) {
            // For paused workflows, preserve stepId from pausedState
            stepIdToPreserve = run.pausedState.stepId;
        } else if (run.status === 'failed') {
            // For failed workflows, try to get stepId from checkpoint
            const latestCheckpoint = run.params?.__latestCheckpoint as {
                stepId: string;
                nextStepId?: string;
                context: Record<string, unknown>;
                checkpointedAt: string;
            } | undefined;
            
            if (latestCheckpoint) {
                stepIdToPreserve = latestCheckpoint.nextStepId || latestCheckpoint.stepId;
            }
        }
        
        const updateOperation: Record<string, unknown> = {
            status: 'running'
        };
        
        if (stepIdToPreserve) {
            updateOperation['params.__resumeStepId'] = stepIdToPreserve;
        }

        // Update status back to running and preserve stepId
        // Only clear pausedState if it exists (for paused workflows)
        const unsetOperation: Record<string, unknown> = {};
        if (run.pausedState) {
            unsetOperation.pausedState = '';
        }
        
        const updateFilter: Record<string, unknown> = {
            $set: updateOperation
        };
        if (Object.keys(unsetOperation).length > 0) {
            updateFilter.$unset = unsetOperation;
        }
        await this.runsCollection.updateOne(
            { _id: id },
            updateFilter as unknown as import('mongodb').UpdateFilter<Run>
        );
        
        await this.log(runId, 'Run hervat', 'info');
        await this.flushLogs(runId.toString());
    }

    /**
     * Update run status
     */
    async updateStatus(runId: string | ObjectId, status: RunStatus): Promise<void> {
        const id = new ObjectId(runId);
        await this.runsCollection.updateOne(
            { _id: id },
            { $set: { status } }
        );
        // Ensure logs are flushed when status changes
        await this.flushLogs(runId.toString());
    }

    /**
     * Get a run by ID
     */
    async getRun(runId: string | ObjectId): Promise<Run | null> {
        // Handle invalid ObjectId strings gracefully
        if (typeof runId === 'string' && !ObjectId.isValid(runId)) {
            return null;
        }
        const id = new ObjectId(runId);
        return this.runsCollection.findOne({ _id: id });
    }

    /**
     * Mark stale runs as failed
     * A run is considered stale if it has been pending or running for more than RUN_TIMEOUT_MS
     * Uses configurable timeout (default: 1 hour)
     * 
     * Can be called directly for periodic cleanup or is automatically called when fetching runs
     */
    async markStaleRunsAsFailed(): Promise<void> {
        const env = validateEnv();
        const STALE_THRESHOLD_MS = env.RUN_TIMEOUT_MS;
        const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);
        
        try {
            // Mark stale pending and running runs as failed
            const result = await this.runsCollection.updateMany(
                {
                    status: { $in: ['pending', 'running'] },
                    endTime: { $exists: false },
                    startTime: { $lt: staleThreshold }
                },
                {
                    $set: {
                        status: 'timeout' as RunStatus,
                        endTime: new Date(),
                        error: `Run timed out: execution exceeded ${Math.floor(STALE_THRESHOLD_MS / 1000 / 60)} minutes without completion`
                    }
                }
            );
            
            if (result.modifiedCount > 0) {
                logger.info(
                    { modifiedCount: result.modifiedCount, thresholdMinutes: Math.floor(STALE_THRESHOLD_MS / 1000 / 60) },
                    'Marked stale runs as timed out'
                );
            }
        } catch (error) {
            logger.error({ error }, 'Error marking stale runs as failed');
            // Don't throw - this is a cleanup operation that shouldn't break the main flow
        }
    }

    /**
     * Get recent runs
     * Automatically marks stale runs as failed before returning
     */
    async getRecentRuns(limit: number = 10): Promise<Run[]> {
        // Mark stale runs as failed before fetching
        await this.markStaleRunsAsFailed();
        
        return this.runsCollection
            .find()
            .sort({ startTime: -1 })
            .limit(limit)
            .toArray();
    }

    /**
     * Get run history with filtering support (US-005)
     * Supports filtering by status, type, and date range
     */
    async getRunHistory(options: {
        status?: RunStatus | RunStatus[];
        type?: string | string[];
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        skip?: number;
    } = {}): Promise<Run[]> {
        const {
            status,
            type,
            startDate,
            endDate,
            limit = 50,
            skip = 0
        } = options;

        // Build MongoDB query filter
        const filter: Filter<Run> = {};

        // Filter by status
        if (status) {
            if (Array.isArray(status)) {
                filter.status = { $in: status };
            } else {
                filter.status = status;
            }
        }

        // Filter by type
        if (type) {
            if (Array.isArray(type)) {
                filter.type = { $in: type };
            } else {
                filter.type = type;
            }
        }

        // Filter by date range
        if (startDate || endDate) {
            filter.startTime = {};
            if (startDate) {
                filter.startTime.$gte = startDate;
            }
            if (endDate) {
                filter.startTime.$lte = endDate;
            }
        }

        // Mark stale runs as failed before fetching
        await this.markStaleRunsAsFailed();
        
        return this.runsCollection
            .find(filter)
            .sort({ startTime: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
    }

    /**
     * Count runs with filtering support
     */
    async countRuns(options: {
        status?: RunStatus | RunStatus[];
        type?: string | string[];
        startDate?: Date;
        endDate?: Date;
    } = {}): Promise<number> {
        const {
            status,
            type,
            startDate,
            endDate
        } = options;

        // Build MongoDB query filter (same as getRunHistory)
        const filter: Filter<Run> = {};

        // Filter by status
        if (status) {
            if (Array.isArray(status)) {
                filter.status = { $in: status };
            } else {
                filter.status = status;
            }
        }

        // Filter by type
        if (type) {
            if (Array.isArray(type)) {
                filter.type = { $in: type };
            } else {
                filter.type = type;
            }
        }

        // Filter by date range
        if (startDate || endDate) {
            filter.startTime = {};
            if (startDate) {
                filter.startTime.$gte = startDate;
            }
            if (endDate) {
                filter.startTime.$lte = endDate;
            }
        }

        return this.runsCollection.countDocuments(filter);
    }

    /**
     * Update output file paths for a run
     * Note: Previously only stored JSON, Markdown, and TXT formats. Now stores all 6 formats (JSON, Markdown, TXT, CSV, HTML, XML).
     */
    async updateOutputPaths(runId: string | ObjectId, outputPaths: { jsonPath: string; markdownPath: string; txtPath: string; csvPath: string; htmlPath: string; xmlPath: string }): Promise<void> {
        const id = new ObjectId(runId);
        await this.runsCollection.updateOne(
            { _id: id },
            {
                $set: {
                    outputPaths
                }
            }
        );
    }

    /**
     * Get runs by workflow ID
     */
    async getRunsByWorkflowId(workflowId: string, limit: number = 10): Promise<Run[]> {
        return this.runsCollection
            .find({ 'params.workflowId': workflowId })
            .sort({ startTime: -1 })
            .limit(limit)
            .toArray();
    }

    /**
     * Get runs by query ID (for Beleidsscan integration)
     */
    async getRunsByQueryId(queryId: string, limit: number = 10): Promise<Run[]> {
        return this.runsCollection
            .find({ 'params.queryId': queryId })
            .sort({ startTime: -1 })
            .limit(limit)
            .toArray();
    }

    /**
     * Cancel previous active runs (pending or running) for a given queryId or workflowId
     * This is called when a new run starts to prevent multiple concurrent runs
     * 
     * @param queryId - Optional query ID to cancel runs for
     * @param workflowId - Optional workflow ID to cancel runs for
     * @param excludeRunId - Optional run ID to exclude from cancellation (the new run)
     * @returns Number of runs cancelled
     */
    async cancelPreviousActiveRuns(
        queryId?: string,
        workflowId?: string,
        excludeRunId?: string | ObjectId
    ): Promise<number> {
        if (!queryId && !workflowId) {
            return 0;
        }

        const filter: Filter<Run> = {
            status: { $in: ['pending', 'running'] },
            endTime: { $exists: false }
        };

        if (queryId) {
            filter['params.queryId'] = queryId;
        }
        if (workflowId) {
            filter['params.workflowId'] = workflowId;
        }
        if (excludeRunId) {
            filter._id = { $ne: new ObjectId(excludeRunId) };
        }

        try {
            const result = await this.runsCollection.updateMany(
                filter,
                {
                    $set: {
                        status: 'cancelled' as RunStatus,
                        endTime: new Date(),
                        error: 'Run cancelled: new run started or user left page'
                    }
                }
            );

            if (result.modifiedCount > 0) {
                logger.info(
                    { 
                        modifiedCount: result.modifiedCount, 
                        queryId, 
                        workflowId,
                        excludeRunId: excludeRunId?.toString() 
                    },
                    'Cancelled previous active runs'
                );
            }

            return result.modifiedCount;
        } catch (error) {
            logger.error({ error, queryId, workflowId }, 'Error cancelling previous active runs');
            // Don't throw - this is a cleanup operation that shouldn't break the main flow
            return 0;
        }
    }

    /**
     * Update run params safely without leaking DB access
     */
    async updateRunParams(runId: string | ObjectId, params: Record<string, unknown>): Promise<void> {
        const id = new ObjectId(runId);
        await this.runsCollection.updateOne(
            { _id: id },
            { $set: { params } }
        );
    }
}
