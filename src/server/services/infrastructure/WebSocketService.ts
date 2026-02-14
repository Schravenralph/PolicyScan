import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { getResourceThresholdService, ResourceMetrics } from '../monitoring/ResourceThresholdService.js';
import { getDB } from '../../config/database.js';
import { getPerformanceMonitoringService } from '../monitoring/PerformanceMonitoringService.js';
import { logger } from '../../utils/logger.js';
import { AuthService } from '../auth/AuthService.js';
import { getEnv } from '../../config/env.js';
import { isOriginAllowed } from '../../config/corsConfig.js';
import fs from 'fs/promises';
import path from 'path';
export interface MetricsUpdate {
    type: 'metrics';
    data: {
        users: { total: number; active_today: number };
        workflows: { total: number; automated: number; running: number };
        runs: { today: number; success_rate: number };
        storage: { 
            knowledge_base_size_mb: number; 
            database_size_mb: number; 
            breakdown?: { 
                total_mb?: number; 
                top_collections?: Array<{ name: string; size_mb: number }> 
            } 
        };
        cleanup?: {
            isRunning: boolean;
            startTime?: string;
            elapsedMinutes?: number;
            currentProgress?: Array<{
                collection: string;
                deletedCount: number;
                truncatedCount: number;
                status: 'pending' | 'in_progress' | 'completed' | 'failed';
                error?: string;
            }>;
            lastCleanupTime?: string;
            lastCleanupDeleted?: number;
        };
        errors: { last_24h: number; critical: number };
        threshold_alerts?: Array<{
            metric: string;
            current_value: number;
            threshold: number;
            severity: 'warning' | 'critical';
            timestamp: Date;
        }>;
    };
}
export interface ThresholdAlertUpdate {
    type: 'threshold_alert';
    data: {
        metric: string;
        current_value: number;
        threshold: number;
        severity: 'warning' | 'critical';
        timestamp: Date;
    };
}
export type WebSocketMessage = MetricsUpdate | ThresholdAlertUpdate;
/**
 * WebSocket Service for real-time admin dashboard updates
 */
export class WebSocketService {
    private io: SocketIOServer | null = null;
    private metricsInterval: NodeJS.Timeout | null = null;
    private readonly METRICS_UPDATE_INTERVAL = 30000; // 30 seconds
    /**
     * Initialize WebSocket server
     */
    initialize(httpServer: HttpServer): void {
        // Use the same CORS logic as Express server for consistency
        // Socket.IO CORS format: origin can be a function that returns true/false
        const getSocketIOCorsOrigin = (origin: string | undefined): boolean => {
            const env = getEnv();
            const defaultOrigins = [
                'http://localhost:5173',
                'http://localhost:3000',
                'http://localhost:8080',
                'http://localhost:8888',
                'http://127.0.0.1:5173',
                'http://127.0.0.1:8080',
                'http://127.0.0.1:8888',
            ];
            
            const allowedOrigins = (env.ALLOWED_ORIGINS && env.ALLOWED_ORIGINS.trim())
                ? env.ALLOWED_ORIGINS.split(',').map((o: string) => o.trim()).filter((o: string) => o.length > 0)
                : defaultOrigins;

            if (isOriginAllowed(origin, allowedOrigins)) {
                return true;
            }

            // Log rejected origins for debugging (only in development to avoid log spam)
            if (env.NODE_ENV === 'development') {
                logger.warn({ origin, allowedOrigins }, 'WebSocket CORS: Origin not allowed');
            }
            return false;
        };
        this.io = new SocketIOServer(httpServer, {
            path: '/api/socket.io/', // Match API base path for consistency
            cors: {
                origin: getSocketIOCorsOrigin,
                methods: ['GET', 'POST'],
                credentials: true,
            },
            transports: ['websocket', 'polling'],
            // Connection timeout settings to prevent premature disconnections
            // These are especially important when behind proxies/load balancers
            pingTimeout: 60000, // 60 seconds - time to wait for pong response (default: 20s)
            pingInterval: 25000, // 25 seconds - interval between pings (default: 25s)
            // Allow up to 3 missed pings before disconnecting (pingTimeout / pingInterval ≈ 2.4)
            // This gives more tolerance for network hiccups
            connectTimeout: 45000, // 45 seconds - time to wait for connection (default: 45s)
            // Upgrade timeout for WebSocket upgrade from polling
            upgradeTimeout: 10000, // 10 seconds - time to wait for upgrade (default: 10s)
            // Maximum number of HTTP buffer emissions per socket before closing
            maxHttpBufferSize: 1e6, // 1MB - prevent memory issues
        });
        this.io.on('connection', (socket: Socket) => {
            logger.debug({ socketId: socket.id }, '[WebSocket] Client connected');
            // Send initial metrics on connection
            this.sendMetricsUpdate();
            // Handle room joins for job and query subscriptions
            socket.on('join', (room: string) => {
                socket.join(room);
                logger.debug({ socketId: socket.id, room }, '[WebSocket] Client joined room');
            });
            // Handle room leaves
            socket.on('leave', (room: string) => {
                socket.leave(room);
                logger.debug({ socketId: socket.id, room }, '[WebSocket] Client left room');
            });
            // Handle run subscriptions (for scraper progress)
            socket.on('subscribe_run', (runId: string) => {
                const room = `run:${runId}`;
                socket.join(room);
                logger.debug({ socketId: socket.id, runId, room }, '[WebSocket] Client subscribed to run');
            });
            // Handle run unsubscriptions
            socket.on('unsubscribe_run', (runId: string) => {
                const room = `run:${runId}`;
                socket.leave(room);
                logger.debug({ socketId: socket.id, runId, room }, '[WebSocket] Client unsubscribed from run');
            });
            // Handle disconnection
            socket.on('disconnect', () => {
                logger.debug({ socketId: socket.id }, '[WebSocket] Client disconnected');
            });
            // Handle admin authentication
            socket.on('authenticate', (token: string) => {
                try {
                    const db = getDB();
                    const authService = new AuthService(db);
                    const payload = authService.verifyToken(token);

                    // Security: Ensure token is intended for authentication
                    if (payload.scope && payload.scope !== 'auth') {
                        throw new Error('Invalid token scope');
                    }

                    socket.data.user = payload;
                    logger.debug({ socketId: socket.id, userId: payload.userId }, '[WebSocket] Client authenticated');
                    socket.emit('authenticated', { success: true });
                } catch (error) {
                    logger.warn({ socketId: socket.id, error }, '[WebSocket] Authentication failed');
                    socket.emit('authenticated', { success: false, error: 'Authentication failed' });
                }
            });
        });
        // Start periodic metrics updates
        this.startMetricsBroadcast();
        logger.info('WebSocket server initialized');
    }
    /**
     * Start broadcasting metrics at regular intervals
     */
    private startMetricsBroadcast(): void {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }
        this.metricsInterval = setInterval(() => {
            this.sendMetricsUpdate();
        }, this.METRICS_UPDATE_INTERVAL);
    }
    /**
     * Send metrics update to all connected clients
     */
    async sendMetricsUpdate(): Promise<void> {
        if (!this.io) return;
        try {
            const metrics = await this.collectMetrics();
            this.io.emit('metrics_update', metrics);
        } catch (error) {
            logger.error({ error }, '[WebSocket] Error sending metrics update');
        }
    }
    /**
     * Collect current system metrics
     */
    private async collectMetrics(): Promise<MetricsUpdate['data']> {
        const db = getDB();
        const now = new Date();
        const todayStart = new Date(now.setHours(0, 0, 0, 0));
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        // User metrics
        const totalUsers = await db.collection('users').countDocuments({});
        const activeToday = await db.collection('users').countDocuments({
            lastLogin: { $gte: todayStart },
        });
        // Workflow metrics
        const { WorkflowModel } = await import('../../models/Workflow.js');
        const workflows = await WorkflowModel.findAll();
        const totalWorkflows = workflows.length;
        const automatedWorkflows = workflows.filter(w => w.status === 'Published').length;
        const runningRuns = await db.collection('runs').countDocuments({
            status: 'running',
        });
        // Run metrics
        const runsToday = await db.collection('runs').countDocuments({
            createdAt: { $gte: todayStart },
        });
        const completedRuns = await db.collection('runs').countDocuments({
            status: 'completed',
            createdAt: { $gte: todayStart },
        });
        const successRate = runsToday > 0 ? completedRuns / runsToday : 0;
        // Error metrics
        const { getErrorMonitoringService } = await import('../monitoring/ErrorMonitoringService.js');
        const errorMonitoringService = getErrorMonitoringService();
        const errorStats = await errorMonitoringService.getStatistics({
            startDate: last24h,
        });
        const errorsLast24h = errorStats?.total_errors || 0;
        const criticalErrors = errorStats?.by_severity?.critical || 0;
        // Storage metrics
        const knowledgeBasePath = path.join(process.cwd(), 'data', 'knowledge_base');
        let knowledgeBaseSize = 0;
        try {
            const stats = await fs.stat(knowledgeBasePath);
            if (stats.isDirectory()) {
                knowledgeBaseSize = stats.size;
            }
        } catch {
            // Knowledge base directory might not exist
        }
        const dbStats = await db.stats();
        const databaseSize = dbStats.dataSize || 0;
        const knowledgeBaseSizeMb = Math.round(knowledgeBaseSize / 1024 / 1024);
        const databaseSizeMb = Math.round(databaseSize / 1024 / 1024);
        // Get collection size breakdown (for monitoring)
        let collectionBreakdown: { total_mb?: number; top_collections?: Array<{ name: string; size_mb: number }> } = {};
        try {
            const { getCollectionSizeMonitoringService } = await import('../monitoring/CollectionSizeMonitoringService.js');
            const collectionMonitoringService = getCollectionSizeMonitoringService();
            const summary = await collectionMonitoringService.getSummary();
            const report = await collectionMonitoringService.getCollectionSizes();
            collectionBreakdown = {
                total_mb: Math.round(summary.totalSizeGB * 1024),
                top_collections: report.topCollections.slice(0, 5).map((c) => ({
                    name: c.collection,
                    size_mb: Math.round(c.storageSize / 1024 / 1024),
                })),
            };
        } catch (error) {
            logger.debug({ error }, '[WebSocket] Collection size monitoring not available');
        }
        // Get cleanup status (non-blocking)
        let cleanupStatus: {
            isRunning: boolean;
            startTime?: string;
            elapsedMinutes?: number;
            currentProgress?: Array<{
                collection: string;
                deletedCount: number;
                truncatedCount: number;
                status: 'pending' | 'in_progress' | 'completed' | 'failed';
                error?: string;
            }>;
            lastCleanupTime?: string;
            lastCleanupDeleted?: number;
        } | undefined;
        try {
            const { getDatabaseCleanupOrchestrator } = await import('../monitoring/DatabaseCleanupOrchestrator.js');
            const cleanupOrchestrator = getDatabaseCleanupOrchestrator();
            const status = await cleanupOrchestrator.getCleanupStatus();
            cleanupStatus = {
                isRunning: status.isRunning,
                startTime: status.startTime?.toISOString(),
                elapsedMinutes: status.elapsedMinutes ?? undefined,
                currentProgress: status.currentProgress?.map(p => ({
                    collection: p.collection,
                    deletedCount: p.deletedCount,
                    truncatedCount: p.truncatedCount,
                    status: p.status,
                    error: p.error || undefined,
                })),
                lastCleanupTime: status.lastCleanupTime?.toISOString() || undefined,
                lastCleanupDeleted: status.lastCleanupDeleted || undefined,
            };
        } catch (error) {
            // Cleanup status is optional - don't fail metrics collection
            logger.debug({ error }, '[WebSocket] Cleanup status not available');
        }
        // Get API response time metrics
        let apiResponseTimeP95: number | undefined;
        try {
            const performanceService = getPerformanceMonitoringService();
            const perfStats = await performanceService.getStats();
            apiResponseTimeP95 = perfStats.p95;
        } catch (error) {
            // Performance monitoring might not be available
            logger.debug({ error }, '[WebSocket] Performance stats not available');
        }
        // Prepare resource metrics for threshold checking
        const resourceMetrics: ResourceMetrics = {
            database_size_mb: databaseSizeMb,
            knowledge_base_size_mb: knowledgeBaseSizeMb,
            error_rate_24h: errorsLast24h,
            api_response_time_p95_ms: apiResponseTimeP95,
        };
        // Check thresholds and get alerts
        const thresholdService = getResourceThresholdService();
        const thresholdAlerts = await thresholdService.checkThresholds(resourceMetrics);
        return {
            users: {
                total: totalUsers,
                active_today: activeToday,
            },
            workflows: {
                total: totalWorkflows,
                automated: automatedWorkflows,
                running: runningRuns,
            },
            runs: {
                today: runsToday,
                success_rate: successRate,
            },
            storage: {
                knowledge_base_size_mb: knowledgeBaseSizeMb,
                database_size_mb: databaseSizeMb,
                breakdown: collectionBreakdown,
            },
            ...(cleanupStatus ? { cleanup: cleanupStatus } : {}),
            errors: {
                last_24h: errorsLast24h,
                critical: criticalErrors,
            },
            threshold_alerts: thresholdAlerts,
        };
    }
    /**
     * Broadcast threshold alert to all connected clients
     */
    broadcastThresholdAlert(alert: ThresholdAlertUpdate['data']): void {
        if (!this.io) return;
        this.io.emit('threshold_alert', {
            type: 'threshold_alert',
            data: alert,
        } as ThresholdAlertUpdate);
    }
    /**
     * Get number of connected clients
     */
    getConnectedClients(): number {
        if (!this.io) return 0;
        return this.io.sockets.sockets.size;
    }
    /**
     * Get the Socket.IO server instance
     * Used by other services that need to emit custom events
     */
    getIO(): SocketIOServer | null {
        return this.io;
    }
    /**
     * Cleanup and close WebSocket server
     */
    cleanup(): void {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
        }
        if (this.io) {
            this.io.close();
            this.io = null;
        }
    }
    /**
     * Close WebSocket server (alias for cleanup for shutdown coordination)
     */
    async close(): Promise<void> {
        this.cleanup();
    }
}
// Singleton instance
let webSocketService: WebSocketService | null = null;
export function getWebSocketService(): WebSocketService {
    if (!webSocketService) {
        webSocketService = new WebSocketService();
    }
    return webSocketService;
}
