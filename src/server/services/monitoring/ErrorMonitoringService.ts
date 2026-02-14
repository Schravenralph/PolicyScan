import { Request } from 'express';
import { ErrorLog, ErrorLogCreateInput, ErrorSeverity, ErrorComponent, type ErrorStatus, type ErrorLogDocument } from '../../models/ErrorLog.js';
import { AlertingService } from './AlertingService.js';
import crypto from 'crypto';
import type { Filter } from 'mongodb';

export interface ErrorContext {
    user_id?: string;
    request?: Request;
    component: ErrorComponent;
    test_run_id?: string; // Test run ID for correlation with test executions
    metadata?: Record<string, unknown>;
}

export interface ErrorGroup {
    group_id: string;
    fingerprint: string;
    message_pattern: string;
    stack_trace_pattern: string;
    component: ErrorComponent;
    severity: ErrorSeverity;
    total_occurrences: number;
    unique_users: number;
    first_seen: Date;
    last_seen: Date;
    affected_endpoints: string[];
    sample_error_id: string;
    status: ErrorStatus;
}

export interface ErrorGroupAnalytics {
    group_id: string;
    occurrence_trend: Array<{ date: string; count: number }>;
    user_impact: {
        total_users: number;
        affected_user_ids: string[];
    };
    endpoint_impact: {
        total_endpoints: number;
        most_affected: Array<{ endpoint: string; count: number }>;
    };
    time_distribution: {
        peak_hour: number;
        peak_day: string;
    };
}

export interface TrendDataPoint {
    timestamp: Date;
    count: number;
    severity?: ErrorSeverity;
    component?: ErrorComponent;
}

export interface TrendAnalysis {
    direction: 'increasing' | 'decreasing' | 'stable';
    rate_of_change: number; // Percentage change per period
    slope: number; // Linear regression slope
    confidence: number; // 0-1, confidence in trend
    period_count: number;
    average: number;
    peak: number;
    trough: number;
    data_points: Array<{ date: string; count: number }>;
}

export interface TrendAlert {
    alert_id: string;
    timestamp: Date;
    trend_type: 'spike' | 'surge' | 'decline' | 'anomaly';
    severity: 'critical' | 'warning' | 'info';
    message: string;
    metric: string;
    current_value: number;
    threshold: number;
    period: string;
    component?: ErrorComponent;
    group_id?: string;
}

/**
 * Error Monitoring Service
 * Captures, stores, and manages error logs with aggregation and alerting
 */
export class ErrorMonitoringService {
    private alertingService: AlertingService;

    constructor() {
        this.alertingService = new AlertingService();
    }

    /**
     * Generate improved error fingerprint with context-aware grouping
     */
    private generateErrorFingerprint(
        error: Error,
        context: ErrorContext
    ): string {
        // Normalize error message (remove dynamic values)
        const normalizedMessage = this.normalizeErrorMessage(error.message || 'Unknown error');
        
        // Extract stack trace pattern (first 3 relevant lines)
        const stackPattern = this.extractStackPattern(error.stack);
        
        // Extract context pattern (normalized request path, component)
        const contextPattern = this.extractContextPattern(context);
        
        // Combine into fingerprint
        const fingerprintData = `${normalizedMessage}|${stackPattern}|${contextPattern}|${context.component}`;
        
        // Generate hash for consistent grouping
        return crypto.createHash('sha256').update(fingerprintData).digest('hex').substring(0, 16);
    }

    /**
     * Normalize error message by removing dynamic values
     */
    private normalizeErrorMessage(message: string): string {
        return message
            // Remove timestamps
            .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, '[timestamp]')
            // Remove UUIDs
            .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[uuid]')
            // Remove ObjectIds
            .replace(/[a-f0-9]{24}/gi, '[objectid]')
            // Remove ports
            .replace(/:\d+/g, ':[port]')
            // Remove file paths (keep filename)
            .replace(/\/[^\s]+?\/([^/\s]+\.(ts|js|tsx|jsx))/g, '/[path]/$1')
            // Remove line numbers
            .replace(/:\d+:\d+/g, ':[line]:[col]')
            // Normalize whitespace
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Extract stack trace pattern (first 3 relevant lines)
     */
    private extractStackPattern(stackTrace?: string): string {
        if (!stackTrace) return '';
        
        const lines = stackTrace.split('\n').slice(0, 10);
        const relevantLines = lines
            .filter(line => 
                !line.includes('node_modules') && 
                !line.includes('at process') &&
                !line.includes('at Object.<anonymous>')
            )
            .slice(0, 3)
            .map(line => 
                line
                    .replace(/:\d+:\d+/g, ':[line]:[col]')
                    .replace(/\/[^\s]+?\/([^/\s]+\.(ts|js|tsx|jsx))/g, '/[path]/$1')
                    .trim()
            );
        
        return relevantLines.join('|');
    }

    /**
     * Extract file path and line number from stack trace
     * Returns the first relevant file location (not from node_modules)
     */
    private extractFileLocation(stackTrace?: string): { file?: string; line?: number; column?: number } {
        if (!stackTrace) return {};
        
        const lines = stackTrace.split('\n');
        for (const line of lines) {
            // Skip node_modules and internal Node.js lines
            if (line.includes('node_modules') || 
                line.includes('at process') ||
                line.includes('at Object.<anonymous>')) {
                continue;
            }
            
            // Match patterns like: at functionName (/path/to/file.ts:123:45)
            // or: at /path/to/file.ts:123:45
            const match = line.match(/at\s+(?:\w+\.)*\w+\s*\(?([^:]+):(\d+):(\d+)\)?/);
            if (match) {
                const file = match[1].trim();
                const lineNum = parseInt(match[2], 10);
                const column = parseInt(match[3], 10);
                
                // Only return if it's not from node_modules
                if (!file.includes('node_modules')) {
                    return { file, line: lineNum, column };
                }
            }
        }
        
        return {};
    }

    /**
     * Get process name from environment or process info
     */
    private getProcessName(): string {
        // Check for explicit process name in environment
        if (process.env.PROCESS_NAME) {
            return process.env.PROCESS_NAME;
        }
        
        // Try to infer from script path and process title
        const scriptPath = process.argv[1] || '';
        const processTitle = process.title || '';
        
        // Check script path first (most reliable)
        if (scriptPath.includes('server/index') || scriptPath.includes('server\\index') || scriptPath.endsWith('server')) {
            return 'backend-server';
        }
        if (scriptPath.includes('worker') || scriptPath.includes('queue')) {
            return 'worker';
        }
        if (scriptPath.includes('scheduler') || scriptPath.includes('cron')) {
            return 'scheduler';
        }
        if (scriptPath.includes('test') || scriptPath.includes('spec')) {
            return 'test-runner';
        }
        
        // Check process title as fallback
        if (processTitle.includes('node')) {
            // Extract service name from common patterns
            if (processTitle.includes('server')) {
                return 'backend-server';
            }
            if (processTitle.includes('worker')) {
                return 'worker';
            }
            if (processTitle.includes('scheduler')) {
                return 'scheduler';
            }
        }
        
        // Check if running in Docker container
        if (process.env.HOSTNAME) {
            // Docker containers often have hostname like "container-name-1"
            const hostname = process.env.HOSTNAME;
            if (hostname.includes('server') || hostname.includes('backend')) {
                return 'backend-server';
            }
            if (hostname.includes('worker')) {
                return 'worker';
            }
        }
        
        // Default based on environment
        const env = process.env.NODE_ENV || 'development';
        return `${env}-process`;
    }

    /**
     * Get ISO week number for a date
     */
    private getWeekNumber(date: Date): number {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    }

    /**
     * Extract context pattern (normalized request path, component)
     */
    private extractContextPattern(context: ErrorContext): string {
        if (!context.request) {
            return `component:${context.component}`;
        }
        
        // Normalize request path (remove IDs, parameters)
        const path = context.request.path
            .replace(/\/[a-f0-9]{24}/g, '/[id]') // ObjectIds
            .replace(/\/[a-f0-9-]{36}/g, '/[uuid]') // UUIDs
            .replace(/\/\d+/g, '/[id]') // Numeric IDs
            .replace(/\?.*$/, ''); // Remove query params
        
        return `${context.request.method}:${path}`;
    }

    /**
     * Capture and log an error with full context and improved grouping
     */
    async captureError(
        error: Error,
        context: ErrorContext
    ): Promise<void> {
        try {
            // Determine severity based on error type and context
            const severity = this.determineSeverity(error, context);

            // Generate improved fingerprint
            const fingerprint = this.generateErrorFingerprint(error, context);

            // Extract request details if available
            const requestDetails = context.request
                ? {
                      request_method: context.request.method,
                      request_path: context.request.path,
                      user_agent: context.request.get('user-agent'),
                      ip: context.request.ip || context.request.socket.remoteAddress,
                  }
                : {};

            // Extract test run ID from context or metadata
            const testRunId = context.test_run_id || 
                context.request?.headers['x-test-run-id'] as string ||
                context.request?.cookies?.test_run_id as string ||
                context.metadata?.testRunId as string;

            // Extract file location from stack trace
            const fileLocation = this.extractFileLocation(error.stack);
            
            // Get process name
            const processName = this.getProcessName();

            // Build error input with fingerprint in metadata
            const errorInput: ErrorLogCreateInput = {
                severity,
                component: context.component,
                message: error.message || 'Unknown error',
                stack_trace: error.stack,
                user_id: context.user_id,
                request_id: context.request?.headers['x-request-id'] as string,
                test_run_id: testRunId,
                metadata: {
                    ...requestDetails,
                    ...context.metadata,
                    error_name: error.name,
                    error_fingerprint: fingerprint, // Store fingerprint for grouping
                    // Keep testRunId in metadata for backward compatibility
                    ...(testRunId && { testRunId }),
                    // Add process and file location context
                    process_name: processName,
                    ...(fileLocation.file && { file_path: fileLocation.file }),
                    ...(fileLocation.line !== undefined && { file_line: fileLocation.line }),
                    ...(fileLocation.column !== undefined && { file_column: fileLocation.column }),
                },
            };

            // Check if database is available before attempting to capture error
            const { isDBConnected } = await import('../../config/database.js');
            if (!isDBConnected()) {
                // Database not initialized in test environment - skip error logging
                if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                    return; // Silently skip in test mode
                }
                // In non-test mode, log warning but don't throw
                console.warn('[ErrorMonitoringService] Database not initialized, skipping error capture');
                return;
            }

            // Capture error (will create new or update existing)
            // Wrap in try-catch to handle MongoDB client closure gracefully
            let errorLog;
            try {
                errorLog = await ErrorLog.captureError(errorInput);
            } catch (captureError) {
                // Check if it's a MongoDB client closed error (common in tests)
                const errorMsg = captureError instanceof Error ? captureError.message : String(captureError);
                if ((errorMsg.includes('MongoClientClosed') || errorMsg.includes('client was closed')) &&
                    (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true')) {
                    // Silently skip in test mode
                    return;
                }
                // Re-throw if not a client closure error or not in test mode
                throw captureError;
            }

            // Alert on critical errors
            if (severity === 'critical') {
                await this.alertingService.sendCriticalErrorAlert(errorLog);
            }

            // Check if resolved error has reoccurred
            if (errorLog.occurrence_count === 1) {
                // New error - check if it's a reoccurrence of a resolved error
                const hasReoccurred = await ErrorLog.checkResolvedErrorReoccurrence(
                    errorLog.error_signature
                );
                if (hasReoccurred) {
                    await this.alertingService.sendResolvedErrorReoccurrenceAlert(errorLog);
                }
            }
        } catch (monitoringError) {
            // Don't let monitoring errors break the application
            // Check if it's a MongoDB client closed error (common in tests)
            const errorMsg = monitoringError instanceof Error ? monitoringError.message : String(monitoringError);
            if (errorMsg.includes('MongoClientClosed') || errorMsg.includes('client was closed')) {
                // Silently skip in test mode - don't log errors
                if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                    return;
                }
            }
            // Only log non-client-closed errors, or client-closed errors in non-test mode
            if (!(process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true')) {
                console.error('[ErrorMonitoringService] Failed to capture error:', monitoringError);
            }
        }
    }

    /**
     * Determine error severity based on error type and context
     */
    private determineSeverity(error: Error, context: ErrorContext): ErrorSeverity {
        // Database connection errors are critical
        if (
            error.message.includes('MongoServerError') ||
            error.message.includes('connection') ||
            error.message.includes('database')
        ) {
            return 'critical';
        }

        // Workflow crashes are critical
        if (context.component === 'workflow' && error.message.includes('crash')) {
            return 'critical';
        }

        // Authentication/Authorization errors are errors (not critical)
        if (
            error.name === 'AuthenticationError' ||
            error.name === 'AuthorizationError' ||
            error.message.includes('authentication') ||
            error.message.includes('authorization')
        ) {
            return 'error';
        }

        // Validation errors are warnings
        if (error.name === 'ValidationError' || error.message.includes('validation')) {
            return 'warning';
        }

        // Default to error for unknown types
        return 'error';
    }

    /**
     * Get error statistics
     */
    async getStatistics(options: {
        startDate?: Date;
        endDate?: Date;
        component?: ErrorComponent;
    } = {}) {
        return await ErrorLog.getStatistics(options);
    }

    /**
     * Get errors with pagination
     */
    async getErrors(filters: {
        severity?: ErrorSeverity;
        component?: ErrorComponent;
        status?: ErrorStatus;
        user_id?: string;
        startDate?: Date;
        endDate?: Date;
        testRunId?: string;
        limit?: number;
        skip?: number;
        sort?: Record<string, 1 | -1>;
    }) {
        return await ErrorLog.find(filters);
    }

    /**
     * Mark error as resolved with optional note
     */
    async markErrorResolved(errorId: string, resolvedBy: string, note?: string) {
        return await ErrorLog.markResolved(errorId, resolvedBy, note);
    }

    /**
     * Mark multiple errors as resolved
     */
    async markErrorsResolved(errorIds: string[], resolvedBy: string, note?: string) {
        return await ErrorLog.markResolvedMany(errorIds, resolvedBy, note);
    }

    /**
     * Update error status with history tracking
     */
    async updateErrorStatus(
        errorId: string,
        status: ErrorStatus,
        changedBy: string,
        note?: string
    ) {
        return await ErrorLog.updateStatus(errorId, status, changedBy, note);
    }

    /**
     * Get resolution history for an error
     */
    async getResolutionHistory(errorId: string) {
        return await ErrorLog.getResolutionHistory(errorId);
    }

    /**
     * Get error by ID
     */
    async getErrorById(errorId: string) {
        return await ErrorLog.findById(errorId);
    }

    /**
     * Get error groups (grouped by fingerprint)
     */
    async getErrorGroups(filters: {
        severity?: ErrorSeverity;
        component?: ErrorComponent;
        status?: ErrorStatus;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        skip?: number;
    } = {}): Promise<ErrorGroup[]> {
        const { getDB } = await import('../../config/database.js');
        const db = getDB();
        const { severity, component, status, startDate, endDate, limit = 50, skip = 0 } = filters;

        const matchStage: Record<string, unknown> = {};
        if (severity) matchStage.severity = severity;
        if (component) matchStage.component = component;
        if (status) matchStage.status = status;
        if (startDate || endDate) {
            matchStage.timestamp = {
                ...(startDate ? { $gte: startDate } : {}),
                ...(endDate ? { $lte: endDate } : {}),
            };
        }

        const pipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: '$metadata.error_fingerprint',
                    fingerprint: { $first: '$metadata.error_fingerprint' },
                    message_pattern: { $first: '$message' },
                    stack_trace_pattern: { $first: '$stack_trace' },
                    component: { $first: '$component' },
                    severity: { $first: '$severity' },
                    total_occurrences: { $sum: '$occurrence_count' },
                    unique_users: { $addToSet: '$user_id' },
                    first_seen: { $min: '$first_seen' },
                    last_seen: { $max: '$last_seen' },
                    affected_endpoints: { $addToSet: '$metadata.request_path' },
                    sample_error_id: { $first: '$_id' },
                    status: { $first: '$status' },
                },
            },
            {
                $project: {
                    group_id: { $toString: '$_id' },
                    fingerprint: 1,
                    message_pattern: 1,
                    stack_trace_pattern: 1,
                    component: 1,
                    severity: 1,
                    total_occurrences: 1,
                    unique_users: { $size: '$unique_users' },
                    first_seen: 1,
                    last_seen: 1,
                    affected_endpoints: {
                        $filter: {
                            input: '$affected_endpoints',
                            as: 'endpoint',
                            cond: { $ne: ['$$endpoint', null] },
                        },
                    },
                    sample_error_id: { $toString: '$sample_error_id' },
                    status: 1,
                },
            },
            { $sort: { total_occurrences: -1 } },
            { $skip: skip },
            { $limit: limit },
        ];

        const groups = await db.collection<ErrorLogDocument>('error_logs').aggregate(pipeline).toArray();
        return groups as ErrorGroup[];
    }

    /**
     * Collect time-series data for error trends
     * @param options Configuration for time-series collection
     * @returns Array of data points with timestamps and counts
     */
    async collectTimeSeriesData(options: {
        startDate: Date;
        endDate: Date;
        granularity: 'hour' | 'day' | 'week' | 'month';
        component?: ErrorComponent;
        severity?: ErrorSeverity;
        groupId?: string;
    }): Promise<TrendDataPoint[]> {
        const { getDB } = await import('../../config/database.js');
        const db = getDB();
        const { startDate, endDate, granularity, component, severity, groupId } = options;

        // Build match stage
        const matchStage: Record<string, unknown> = {
            timestamp: {
                $gte: startDate,
                $lte: endDate,
            },
        };
        if (component) matchStage.component = component;
        if (severity) matchStage.severity = severity;
        if (groupId) matchStage['metadata.error_fingerprint'] = groupId;

        // Determine date grouping format
        let dateFormat: Record<string, unknown>;
        switch (granularity) {
            case 'hour':
                dateFormat = {
                    year: { $year: '$timestamp' },
                    month: { $month: '$timestamp' },
                    day: { $dayOfMonth: '$timestamp' },
                    hour: { $hour: '$timestamp' },
                };
                break;
            case 'day':
                dateFormat = {
                    year: { $year: '$timestamp' },
                    month: { $month: '$timestamp' },
                    day: { $dayOfMonth: '$timestamp' },
                };
                break;
            case 'week':
                dateFormat = {
                    year: { $year: '$timestamp' },
                    week: { $week: '$timestamp' },
                };
                break;
            case 'month':
                dateFormat = {
                    year: { $year: '$timestamp' },
                    month: { $month: '$timestamp' },
                };
                break;
        }

        const pipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: dateFormat,
                    timestamp: { $min: '$timestamp' },
                    count: { $sum: '$occurrence_count' },
                    severity: { $first: '$severity' },
                    component: { $first: '$component' },
                },
            },
            { $sort: { timestamp: 1 } },
            { $limit: parseInt(process.env.MAX_ERROR_MONITORING_TREND_DATA || '10000', 10) },
        ];

        const results = await db.collection<ErrorLogDocument>('error_logs').aggregate(pipeline).toArray();

        return results.map((r) => ({
            timestamp: r.timestamp,
            count: r.count,
            severity: r.severity,
            component: r.component,
        }));
    }

    /**
     * Calculate trend analysis from time-series data
     * Uses linear regression to determine trend direction and rate of change
     */
    calculateTrend(dataPoints: TrendDataPoint[]): TrendAnalysis {
        if (dataPoints.length < 2) {
            return {
                direction: 'stable',
                rate_of_change: 0,
                slope: 0,
                confidence: 0,
                period_count: dataPoints.length,
                average: dataPoints.length > 0 ? dataPoints[0].count : 0,
                peak: dataPoints.length > 0 ? dataPoints[0].count : 0,
                trough: dataPoints.length > 0 ? dataPoints[0].count : 0,
                data_points: dataPoints.map((dp) => ({
                    date: dp.timestamp.toISOString(),
                    count: dp.count,
                })),
            };
        }

        // Calculate linear regression (y = mx + b)
        const n = dataPoints.length;
        const xValues = dataPoints.map((_, i) => i);
        const yValues = dataPoints.map((dp) => dp.count);

        const sumX = xValues.reduce((a, b) => a + b, 0);
        const sumY = yValues.reduce((a, b) => a + b, 0);
        const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
        const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Calculate R-squared for confidence
        const yMean = sumY / n;
        const ssTotal = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
        const ssResidual = yValues.reduce(
            (sum, y, i) => sum + Math.pow(y - (slope * xValues[i] + intercept), 2),
            0
        );
        const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;
        const confidence = Math.max(0, Math.min(1, rSquared));

        // Determine direction
        let direction: 'increasing' | 'decreasing' | 'stable';
        const threshold = 0.05; // 5% change threshold
        if (Math.abs(slope) < threshold) {
            direction = 'stable';
        } else {
            direction = slope > 0 ? 'increasing' : 'decreasing';
        }

        // Calculate rate of change (percentage)
        const firstValue = yValues[0];
        const lastValue = yValues[yValues.length - 1];
        const rate_of_change = firstValue > 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0;

        // Calculate statistics
        const average = sumY / n;
        const peak = Math.max(...yValues);
        const trough = Math.min(...yValues);

        return {
            direction,
            rate_of_change,
            slope,
            confidence,
            period_count: n,
            average,
            peak,
            trough,
            data_points: dataPoints.map((dp) => ({
                date: dp.timestamp.toISOString(),
                count: dp.count,
            })),
        };
    }

    /**
     * Get trend analysis for a specific error group or overall errors
     */
    async getTrendAnalysis(options: {
        startDate: Date;
        endDate: Date;
        granularity?: 'hour' | 'day' | 'week' | 'month';
        component?: ErrorComponent;
        severity?: ErrorSeverity;
        groupId?: string;
    }): Promise<TrendAnalysis> {
        const { granularity = 'day' } = options;
        const dataPoints = await this.collectTimeSeriesData({
            ...options,
            granularity,
        });
        return this.calculateTrend(dataPoints);
    }

    /**
     * Get trend visualization data formatted for charts
     */
    async getTrendVisualizationData(options: {
        startDate: Date;
        endDate: Date;
        granularity?: 'hour' | 'day' | 'week' | 'month';
        component?: ErrorComponent;
        severity?: ErrorSeverity;
        groupId?: string;
    }): Promise<{
        labels: string[];
        datasets: Array<{
            label: string;
            data: number[];
            backgroundColor?: string;
            borderColor?: string;
        }>;
        trend: TrendAnalysis;
    }> {
        const { granularity = 'day' } = options;
        const dataPoints = await this.collectTimeSeriesData({
            ...options,
            granularity,
        });
        const trend = this.calculateTrend(dataPoints);

        // Format for chart libraries (Chart.js, Recharts, etc.)
        const labels = dataPoints.map((dp) => {
            const date = new Date(dp.timestamp);
            switch (granularity) {
                case 'hour':
                    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
                case 'day':
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                case 'week': {
                    const weekNumber = this.getWeekNumber(date);
                    return `Week ${weekNumber}, ${date.getFullYear()}`;
                }
                case 'month':
                    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                default:
                    return date.toISOString();
            }
        });

        const data = dataPoints.map((dp) => dp.count);

        // Color based on trend direction
        const backgroundColor = trend.direction === 'increasing' ? 'rgba(255, 99, 132, 0.2)' : 'rgba(54, 162, 235, 0.2)';
        const borderColor = trend.direction === 'increasing' ? 'rgba(255, 99, 132, 1)' : 'rgba(54, 162, 235, 1)';

        return {
            labels,
            datasets: [
                {
                    label: 'Error Count',
                    data,
                    backgroundColor,
                    borderColor,
                },
            ],
            trend,
        };
    }

    /**
     * Check for trend alerts based on thresholds
     */
    async checkTrendAlerts(options: {
        startDate: Date;
        endDate: Date;
        component?: ErrorComponent;
        severity?: ErrorSeverity;
        groupId?: string;
        spikeThreshold?: number; // Percentage increase to trigger spike alert
        surgeThreshold?: number; // Percentage increase to trigger surge alert
        declineThreshold?: number; // Percentage decrease to trigger decline alert
    }): Promise<TrendAlert[]> {
        const {
            spikeThreshold = 50, // 50% increase
            surgeThreshold = 100, // 100% increase
            declineThreshold = -30, // 30% decrease
        } = options;

        const trend = await this.getTrendAnalysis({
            ...options,
            granularity: 'day',
        });

        const alerts: TrendAlert[] = [];

        // Check for spike (moderate increase)
        if (trend.rate_of_change >= spikeThreshold && trend.rate_of_change < surgeThreshold) {
            alerts.push({
                alert_id: `trend-spike-${Date.now()}`,
                timestamp: new Date(),
                trend_type: 'spike',
                severity: 'warning',
                message: `Error trend shows ${trend.rate_of_change.toFixed(1)}% increase over the period`,
                metric: 'error_count',
                current_value: trend.data_points[trend.data_points.length - 1]?.count || 0,
                threshold: spikeThreshold,
                period: `${options.startDate.toISOString()} to ${options.endDate.toISOString()}`,
                component: options.component,
                group_id: options.groupId,
            });
        }

        // Check for surge (significant increase)
        if (trend.rate_of_change >= surgeThreshold) {
            alerts.push({
                alert_id: `trend-surge-${Date.now()}`,
                timestamp: new Date(),
                trend_type: 'surge',
                severity: 'critical',
                message: `Error trend shows critical ${trend.rate_of_change.toFixed(1)}% surge over the period`,
                metric: 'error_count',
                current_value: trend.data_points[trend.data_points.length - 1]?.count || 0,
                threshold: surgeThreshold,
                period: `${options.startDate.toISOString()} to ${options.endDate.toISOString()}`,
                component: options.component,
                group_id: options.groupId,
            });
        }

        // Check for decline (significant decrease - could be good or bad)
        if (trend.rate_of_change <= declineThreshold) {
            alerts.push({
                alert_id: `trend-decline-${Date.now()}`,
                timestamp: new Date(),
                trend_type: 'decline',
                severity: 'info',
                message: `Error trend shows ${Math.abs(trend.rate_of_change).toFixed(1)}% decline over the period`,
                metric: 'error_count',
                current_value: trend.data_points[trend.data_points.length - 1]?.count || 0,
                threshold: declineThreshold,
                period: `${options.startDate.toISOString()} to ${options.endDate.toISOString()}`,
                component: options.component,
                group_id: options.groupId,
            });
        }

        // Check for anomalies (unusual patterns)
        if (trend.confidence < 0.3 && trend.period_count >= 5) {
            alerts.push({
                alert_id: `trend-anomaly-${Date.now()}`,
                timestamp: new Date(),
                trend_type: 'anomaly',
                severity: 'warning',
                message: `Error trend shows irregular pattern (low confidence: ${(trend.confidence * 100).toFixed(1)}%)`,
                metric: 'error_count',
                current_value: trend.data_points[trend.data_points.length - 1]?.count || 0,
                threshold: 0.3,
                period: `${options.startDate.toISOString()} to ${options.endDate.toISOString()}`,
                component: options.component,
                group_id: options.groupId,
            });
        }

        return alerts;
    }

    /**
     * Send trend alerts via AlertingService
     */
    async sendTrendAlerts(alerts: TrendAlert[]): Promise<void> {
        for (const alert of alerts) {
            if (alert.severity === 'critical' || alert.severity === 'warning') {
                // Create a synthetic error log for alerting
                const syntheticError: ErrorLogDocument = {
                    error_id: alert.alert_id,
                    timestamp: alert.timestamp,
                    severity: alert.severity === 'critical' ? 'critical' : 'error',
                    component: alert.component || 'other',
                    message: alert.message,
                    status: 'open',
                    occurrence_count: 1,
                    first_seen: alert.timestamp,
                    last_seen: alert.timestamp,
                    error_signature: `trend-alert-${alert.trend_type}`,
                    createdAt: alert.timestamp,
                    updatedAt: alert.timestamp,
                };

                await this.alertingService.sendCriticalErrorAlert(syntheticError);
            }
        }
    }

    /**
     * Get analytics for a specific error group
     */
    async getErrorGroupAnalytics(groupId: string): Promise<ErrorGroupAnalytics | null> {
        const { getDB } = await import('../../config/database.js');
        const db = getDB();

        // Get all errors in this group (with limit to prevent memory exhaustion)
        const maxErrorGroupAnalytics = parseInt(process.env.MAX_ERROR_GROUP_ANALYTICS || '10000', 10);
        const errors = await db
            .collection<ErrorLogDocument>('error_logs')
            .find({ 'metadata.error_fingerprint': groupId })
            .limit(maxErrorGroupAnalytics)
            .toArray();
        
        if (errors.length >= maxErrorGroupAnalytics) {
            const { logger } = await import('../../utils/logger.js');
            logger.warn(
                { groupId, limit: maxErrorGroupAnalytics },
                'Error group analytics query reached limit, results may be truncated'
            );
        }

        if (errors.length === 0) {
            return null;
        }

        // Calculate occurrence trend (by day)
        const occurrenceByDate = new Map<string, number>();
        errors.forEach((error) => {
            const date = error.timestamp.toISOString().split('T')[0];
            occurrenceByDate.set(date, (occurrenceByDate.get(date) || 0) + error.occurrence_count);
        });

        const occurrence_trend = Array.from(occurrenceByDate.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Calculate user impact
        const userSet = new Set<string>();
        errors.forEach((error) => {
            if (error.user_id) {
                userSet.add(error.user_id.toString());
            }
        });

        // Calculate endpoint impact
        const endpointCounts = new Map<string, number>();
        errors.forEach((error) => {
            const endpoint = error.metadata?.request_path;
            if (endpoint) {
                endpointCounts.set(endpoint, (endpointCounts.get(endpoint) || 0) + error.occurrence_count);
            }
        });

        const most_affected = Array.from(endpointCounts.entries())
            .map(([endpoint, count]) => ({ endpoint, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Calculate time distribution
        const hourCounts = new Array(24).fill(0);
        const dayCounts = new Array(7).fill(0);
        errors.forEach((error) => {
            const date = new Date(error.timestamp);
            hourCounts[date.getHours()]++;
            dayCounts[date.getDay()]++;
        });

        const peak_hour = hourCounts.indexOf(Math.max(...hourCounts));
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const peak_day = dayNames[dayCounts.indexOf(Math.max(...dayCounts))];

        return {
            group_id: groupId,
            occurrence_trend,
            user_impact: {
                total_users: userSet.size,
                affected_user_ids: Array.from(userSet),
            },
            endpoint_impact: {
                total_endpoints: endpointCounts.size,
                most_affected,
            },
            time_distribution: {
                peak_hour,
                peak_day,
            },
        };
    }

    /**
     * Assign error to a user
     */
    async assignError(errorId: string, assignedTo: string, assignedBy: string) {
        return await ErrorLog.assignError(errorId, assignedTo, assignedBy);
    }

    /**
     * Unassign error
     */
    async unassignError(errorId: string) {
        return await ErrorLog.unassignError(errorId);
    }

    /**
     * Get errors assigned to a user
     */
    async getAssignedErrors(userId: string, filters: {
        status?: ErrorStatus;
        severity?: ErrorSeverity;
        component?: ErrorComponent;
        limit?: number;
        skip?: number;
    } = {}) {
        const { getDB } = await import('../../config/database.js');
        const db = getDB();
        const { status, severity, component, limit = 50, skip = 0 } = filters;

        const mongodb = await import('mongodb');
        const MongoObjectId = mongodb.ObjectId;
        const query: Filter<ErrorLogDocument> = {
            assigned_to: new MongoObjectId(userId),
        };

        if (status) query.status = status;
        if (severity) query.severity = severity;
        if (component) query.component = component;

        return await db
            .collection<ErrorLogDocument>('error_logs')
            .find(query)
            .sort({ last_seen: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
    }

    /**
     * Get resolution analytics
     */
    async getResolutionAnalytics(options: {
        startDate?: Date;
        endDate?: Date;
        component?: ErrorComponent;
    } = {}): Promise<{
        total_resolved: number;
        total_open: number;
        total_ignored: number;
        average_resolution_time_hours: number;
        resolution_rate: number;
        by_resolver: Array<{ resolver_id: string; count: number }>;
        by_component: Record<ErrorComponent, {
            resolved: number;
            open: number;
            average_resolution_time_hours: number;
        }>;
        reoccurrence_rate: number;
    }> {
        const { getDB } = await import('../../config/database.js');
        const db = getDB();
        const { startDate, endDate, component } = options;

        const mongodb = await import('mongodb');
        const query: Filter<ErrorLogDocument> = {};
        if (component) query.component = component;
        if (startDate || endDate) {
            query.timestamp = {
                ...(startDate ? { $gte: startDate } : {}),
                ...(endDate ? { $lte: endDate } : {}),
            };
        }

        // Get errors with limit to prevent memory exhaustion
        const maxErrorStatistics = parseInt(process.env.MAX_ERROR_STATISTICS || '50000', 10);
        const errors = await db
            .collection<ErrorLogDocument>('error_logs')
            .find(query)
            .limit(maxErrorStatistics)
            .toArray();
        
        if (errors.length >= maxErrorStatistics) {
            const { logger } = await import('../../utils/logger.js');
            logger.warn(
                { component, limit: maxErrorStatistics },
                'Error statistics query reached limit, results may be truncated'
            );
        }

        const resolvedErrors = errors.filter(e => e.status === 'resolved' && e.resolved_at && e.first_seen);
        const openErrors = errors.filter(e => e.status === 'open');
        const ignoredErrors = errors.filter(e => e.status === 'ignored');

        // Calculate average resolution time
        let totalResolutionTime = 0;
        let resolvedCount = 0;
        resolvedErrors.forEach(error => {
            if (error.resolved_at && error.first_seen) {
                const resolutionTime = error.resolved_at.getTime() - error.first_seen.getTime();
                totalResolutionTime += resolutionTime;
                resolvedCount++;
            }
        });
        const averageResolutionTimeHours = resolvedCount > 0
            ? totalResolutionTime / (resolvedCount * 1000 * 60 * 60)
            : 0;

        // Calculate resolution rate
        const totalErrors = errors.length;
        const resolutionRate = totalErrors > 0 ? (resolvedErrors.length / totalErrors) * 100 : 0;

        // Group by resolver
        const resolverCounts = new Map<string, number>();
        resolvedErrors.forEach(error => {
            if (error.resolved_by) {
                const resolverId = error.resolved_by.toString();
                resolverCounts.set(resolverId, (resolverCounts.get(resolverId) || 0) + 1);
            }
        });
        const by_resolver = Array.from(resolverCounts.entries())
            .map(([resolver_id, count]) => ({ resolver_id, count }))
            .sort((a, b) => b.count - a.count);

        // Group by component
        const by_component: Record<ErrorComponent, {
            resolved: number;
            open: number;
            average_resolution_time_hours: number;
        }> = {
            scraper: { resolved: 0, open: 0, average_resolution_time_hours: 0 },
            workflow: { resolved: 0, open: 0, average_resolution_time_hours: 0 },
            api: { resolved: 0, open: 0, average_resolution_time_hours: 0 },
            frontend: { resolved: 0, open: 0, average_resolution_time_hours: 0 },
            database: { resolved: 0, open: 0, average_resolution_time_hours: 0 },
            other: { resolved: 0, open: 0, average_resolution_time_hours: 0 },
        };

        errors.forEach(error => {
            const comp = by_component[error.component];
            if (error.status === 'resolved') {
                comp.resolved += error.occurrence_count;
            } else if (error.status === 'open') {
                comp.open += error.occurrence_count;
            }
        });

        // Calculate average resolution time by component
        Object.keys(by_component).forEach(comp => {
            const componentErrors = resolvedErrors.filter(e => e.component === comp);
            let compTotalTime = 0;
            let compResolvedCount = 0;
            componentErrors.forEach(error => {
                if (error.resolved_at && error.first_seen) {
                    const resolutionTime = error.resolved_at.getTime() - error.first_seen.getTime();
                    compTotalTime += resolutionTime;
                    compResolvedCount++;
                }
            });
            by_component[comp as ErrorComponent].average_resolution_time_hours = compResolvedCount > 0
                ? compTotalTime / (compResolvedCount * 1000 * 60 * 60)
                : 0;
        });

        // Calculate reoccurrence rate (errors that were resolved and then reoccurred)
        const reoccurredCount = errors.filter(error => {
            if (error.status === 'open' && error.resolution_history) {
                // Check if this error was previously resolved
                return error.resolution_history.some(entry => entry.status === 'resolved');
            }
            return false;
        }).length;
        const reoccurrenceRate = resolvedErrors.length > 0
            ? (reoccurredCount / resolvedErrors.length) * 100
            : 0;

        return {
            total_resolved: resolvedErrors.length,
            total_open: openErrors.length,
            total_ignored: ignoredErrors.length,
            average_resolution_time_hours: averageResolutionTimeHours,
            resolution_rate: resolutionRate,
            by_resolver,
            by_component,
            reoccurrence_rate: reoccurrenceRate,
        };
    }
}

// Singleton instance
let errorMonitoringService: ErrorMonitoringService | null = null;

export function getErrorMonitoringService(): ErrorMonitoringService {
    if (!errorMonitoringService) {
        errorMonitoringService = new ErrorMonitoringService();
    }
    return errorMonitoringService;
}
