/**
 * Health & Monitoring Admin Routes
 * 
 * Routes for system health checks and monitoring in the admin interface.
 */

import { Router, Request, Response } from 'express';
import { getDB, getConnectionPoolStatus } from '../../config/database.js';
import { getPostgresPoolStats, checkPostgresHealth } from '../../config/postgres.js';
import { getNeo4jDriver } from '../../config/neo4j.js';
import { getQueueService } from '../../services/infrastructure/QueueService.js';
import { getErrorMonitoringService } from '../../services/monitoring/ErrorMonitoringService.js';
import { getPerformanceMonitoringService } from '../../services/monitoring/PerformanceMonitoringService.js';
import { getOptimizationMetricsService } from '../../services/monitoring/OptimizationMetricsService.js';
import { getCircuitBreakerManager } from '../../config/httpClient.js';
import { asyncHandler } from './shared/middleware.js';
import { handleDatabaseOperation } from '../../utils/databaseErrorHandler.js';
import { logger } from '../../utils/logger.js';
import { AuthService } from '../../services/auth/AuthService.js';
import { getKnowledgeGraphBackend } from '../knowledgeGraphRoutes.js';
import path from 'path';
import fs from 'fs/promises';

import { DatabaseHealthService } from '../../services/infrastructure/DatabaseHealthService.js';
import { QueueHealthService } from '../../services/infrastructure/QueueHealthService.js';
import { DsoApiHealthService } from '../../services/external/DsoApiHealthService.js';
import { GoogleApiHealthService } from '../../services/external/GoogleApiHealthService.js';
import { OpenAIApiHealthService } from '../../services/external/OpenAIApiHealthService.js';
import { getPipelineHealthService } from '../../services/ingestion/PipelineHealthService.js';
import { IploScraperHealthService } from '../../services/scraping/IploScraperHealthService.js';
import { RechtspraakApiHealthService } from '../../services/external/RechtspraakApiHealthService.js';
import { GraphHealthService } from '../../services/graphs/navigation/GraphHealthService.js';
import { NavigationGraph } from '../../services/graphs/navigation/NavigationGraph.js';
import { ArchitectureComplianceHealthService } from '../../services/infrastructure/ArchitectureComplianceHealthService.js';

/**
 * Register health and monitoring routes
 * 
 * @param router - Express router instance
 * @param authService - AuthService instance for health checks
 */
export function registerHealthRoutes(router: Router, authService: AuthService): void {
    /**
     * GET /api/admin/health/database
     * Get database health status
     */
    router.get('/health/database', asyncHandler(async (_req: Request, res: Response) => {
        const health = await DatabaseHealthService.checkHealth();
        
        // Include cleanup status (non-blocking - don't fail health check if cleanup status unavailable)
        let cleanupStatus: any = null;
        try {
            const { getDatabaseCleanupOrchestrator } = await import('../../services/monitoring/DatabaseCleanupOrchestrator.js');
            const orchestrator = getDatabaseCleanupOrchestrator();
            cleanupStatus = await orchestrator.getCleanupStatus();
        } catch (error) {
            // Cleanup status is optional - don't fail health check
            cleanupStatus = { error: error instanceof Error ? error.message : 'Failed to get cleanup status' };
        }
        
        res.json({
            ...health,
            cleanup: cleanupStatus,
        });
    }));

    /**
     * GET /api/admin/health/queue
     * Get queue health status
     */
    router.get('/health/queue', asyncHandler(async (_req: Request, res: Response) => {
        const health = await QueueHealthService.checkHealth();
        res.json(health);
    }));

    /**
     * GET /api/admin/health/dso
     * Get DSO API health status
     */
    router.get('/health/dso', asyncHandler(async (_req: Request, res: Response) => {
        const health = await DsoApiHealthService.checkHealth();
        res.json(health);
    }));

    /**
     * GET /api/admin/health/google
     * Get Google API health status
     */
    router.get('/health/google', asyncHandler(async (_req: Request, res: Response) => {
        const health = await GoogleApiHealthService.checkHealth();
        res.json(health);
    }));

    /**
     * GET /api/admin/health/openai
     * Get OpenAI API health status
     */
    router.get('/health/openai', asyncHandler(async (_req: Request, res: Response) => {
        const health = await OpenAIApiHealthService.checkHealth();
        res.json(health);
    }));

    /**
     * GET /api/admin/health/pipeline
     * Get pipeline health status
     */
    router.get('/health/pipeline', asyncHandler(async (_req: Request, res: Response) => {
        const service = getPipelineHealthService();
        const health = await service.checkHealth();
        res.json(health);
    }));

    /**
     * GET /api/admin/health/iplo
     * Get IPLO scraper health status
     */
    const iploService = new IploScraperHealthService();
    router.get('/health/iplo', asyncHandler(async (_req: Request, res: Response) => {
        const health = await iploService.checkHealth();
        res.json(health);
    }));

    /**
     * GET /api/admin/health/rechtspraak
     * Get Rechtspraak API health status
     */
    router.get('/health/rechtspraak', asyncHandler(async (_req: Request, res: Response) => {
        const health = await RechtspraakApiHealthService.checkHealth();
        res.json(health);
    }));

    /**
     * GET /api/admin/health/graph
     * Get Navigation Graph health status
     */
    router.get('/health/graph', asyncHandler(async (_req: Request, res: Response) => {
        try {
            const neo4jDriver = getNeo4jDriver();
            const graph = new NavigationGraph(neo4jDriver);
            const service = new GraphHealthService(graph);
            const health = await service.checkHealth();
            res.json(health);
        } catch (error) {
            // Handle case where Neo4j might not be available
            res.status(503).json({
                healthy: false,
                available: false,
                initialized: false,
                connectivity: false,
                queryCapable: false,
                errors: [error instanceof Error ? error.message : String(error)],
                warnings: [],
                lastChecked: new Date().toISOString(),
            });
        }
    }));

    /**
     * GET /api/admin/health/architecture-compliance
     * Get Knowledge Graph architecture compliance status
     * 
     * Verifies that the knowledge graph service is using GraphDB (not Neo4j)
     * according to the architecture: docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md
     */
    router.get('/health/architecture-compliance', asyncHandler(async (_req: Request, res: Response) => {
        const health = await ArchitectureComplianceHealthService.checkHealth();
        
        if (!health.healthy) {
            res.status(503).json({
                ...health,
                lastChecked: health.timestamp
            });
        } else {
            res.json({
                ...health,
                lastChecked: health.timestamp
            });
        }
    }));

    /**
     * GET /api/admin/health
     * Get system health indicators with component breakdown
     */
    router.get('/health', asyncHandler(async (_req: Request, res: Response) => {
        const db = getDB();
        const timestamp = new Date().toISOString();
        const components: Record<string, Record<string, any>> = {};

        // Check API status (if we're responding, API is up)
        components.api = {
            status: 'healthy',
            lastChecked: timestamp,
        };

        // Check database connection with pool metrics
        try {
            await db.admin().ping();
            const poolStatus = getConnectionPoolStatus();
            (components as any).database = {
                status: 'healthy',
                lastChecked: timestamp,
                pool: {
                    connected: poolStatus.connected,
                    minPoolSize: poolStatus.minPoolSize,
                    maxPoolSize: poolStatus.maxPoolSize,
                    isReconnecting: poolStatus.isReconnecting,
                    metrics: poolStatus.metrics,
                },
            } as any;
        } catch (error) {
            const poolStatus = getConnectionPoolStatus();
            (components as any).database = {
                status: 'unhealthy',
                message: error instanceof Error ? error.message : 'Database connection failed',
                lastChecked: timestamp,
                pool: {
                    connected: poolStatus.connected,
                    minPoolSize: poolStatus.minPoolSize,
                    maxPoolSize: poolStatus.maxPoolSize,
                    isReconnecting: poolStatus.isReconnecting,
                    metrics: poolStatus.metrics,
                },
            } as any;
        }

        // Check Neo4j connection
        try {
            const neo4jDriver = getNeo4jDriver();
            await neo4jDriver.verifyConnectivity();
            components.neo4j = {
                status: 'healthy',
                lastChecked: timestamp,
            };
        } catch (error) {
            components.neo4j = {
                status: 'unhealthy',
                message: error instanceof Error ? error.message : 'Neo4j connection failed',
                lastChecked: timestamp,
            };
        }

        // Check Redis connection (via QueueService)
        try {
            const queueService = getQueueService();
            // Try to get queue stats to verify Redis connection
            await queueService.getQueueStats();
            components.redis = {
                status: 'healthy',
                lastChecked: timestamp,
            };
        } catch (error) {
            components.redis = {
                status: 'unhealthy',
                message: error instanceof Error ? error.message : 'Redis connection failed',
                lastChecked: timestamp,
            };
        }

        // Check PostgreSQL connection pool (optional)
        try {
            const postgresHealth = await checkPostgresHealth();
            const postgresPoolStats = getPostgresPoolStats();
            
            (components as any).postgresql = {
                status: postgresHealth.healthy ? 'healthy' : (postgresPoolStats.lastError ? 'unhealthy' : 'unavailable'),
                lastChecked: timestamp,
                health: {
                    healthy: postgresHealth.healthy,
                    latency: postgresHealth.latency,
                    error: postgresHealth.error,
                },
                pool: {
                    connected: postgresPoolStats.isConnected,
                    total: postgresPoolStats.poolTotal,
                    idle: postgresPoolStats.poolIdle,
                    waiting: postgresPoolStats.poolWaiting,
                    successfulQueries: postgresPoolStats.successfulQueries,
                    failedQueries: postgresPoolStats.failedQueries,
                    connectionAttempts: postgresPoolStats.connectionAttempts,
                    lastError: postgresPoolStats.lastError,
                },
            } as any;
        } catch (error) {
            // PostgreSQL is optional, so mark as unavailable rather than unhealthy
            (components as any).postgresql = {
                status: 'unavailable',
                message: error instanceof Error ? error.message : 'PostgreSQL check failed',
                lastChecked: timestamp,
            } as any;
        }

        // Check GraphDB connection (optional)
        try {
            const { checkGraphDBHealth } = await import('../../config/graphdb.js');
            const graphdbHealth = await checkGraphDBHealth();
            (components as any).graphdb = {
                status: graphdbHealth.healthy ? 'healthy' : 'unhealthy',
                message: graphdbHealth.error,
                lastChecked: timestamp,
                latency: graphdbHealth.latency,
            } as any;
        } catch (error) {
            // GraphDB is optional, so mark as unavailable rather than unhealthy
            components.graphdb = {
                status: 'unavailable',
                message: error instanceof Error ? error.message : 'GraphDB check failed',
                lastChecked: timestamp,
            };
        }

        // Add knowledge graph backend information
        try {
            const kgBackend = getKnowledgeGraphBackend();
            (components as any).knowledge_graph = {
                status: 'configured',
                backend: kgBackend,
                backendName: kgBackend === 'graphdb' ? 'GraphDB' : 'Neo4j',
                description: kgBackend === 'graphdb' 
                    ? 'RDF/SPARQL-based knowledge graph (default)'
                    : 'Property graph database (fallback)',
                lastChecked: timestamp,
            } as any;
        } catch (error) {
            (components as any).knowledge_graph = {
                status: 'unknown',
                message: error instanceof Error ? error.message : 'Could not determine knowledge graph backend',
                lastChecked: timestamp,
            } as any;
        }

        // Check file system
        try {
            const knowledgeBasePath = path.join(process.cwd(), 'data', 'knowledge_base');
            await fs.access(knowledgeBasePath);
            components.file_system = {
                status: 'healthy',
                lastChecked: timestamp,
            };
        } catch (error) {
            components.file_system = {
                status: 'unhealthy',
                message: error instanceof Error ? error.message : 'File system access failed',
                lastChecked: timestamp,
            };
        }

        // Check critical services are initialized
        const services: Record<string, { status: string; message?: string; lastChecked: string }> = {};
        
        // Check QueueService (Redis)
        try {
            const queueService = getQueueService();
            await queueService.getQueueStats();
            services.queue = {
                status: 'ready',
                lastChecked: timestamp,
            };
        } catch (error) {
            services.queue = {
                status: 'not_ready',
                message: error instanceof Error ? error.message : 'QueueService not available',
                lastChecked: timestamp,
            };
        }

        // Check ErrorMonitoringService
        try {
            const errorMonitoringService = getErrorMonitoringService();
            // Try to get statistics to verify service is ready
            await errorMonitoringService.getStatistics({ startDate: new Date(Date.now() - 24 * 60 * 60 * 1000) });
            services.error_monitoring = {
                status: 'ready',
                lastChecked: timestamp,
            };
        } catch (error) {
            services.error_monitoring = {
                status: 'not_ready',
                message: error instanceof Error ? error.message : 'ErrorMonitoringService not available',
                lastChecked: timestamp,
            };
        }

        // Check PerformanceMonitoringService
        try {
            const performanceMonitoringService = getPerformanceMonitoringService();
            // Service is a singleton, just verify it exists
            if (performanceMonitoringService) {
                services.performance_monitoring = {
                    status: 'ready',
                    lastChecked: timestamp,
                };
            } else {
                services.performance_monitoring = {
                    status: 'not_ready',
                    message: 'PerformanceMonitoringService not initialized',
                    lastChecked: timestamp,
                };
            }
        } catch (error) {
            services.performance_monitoring = {
                status: 'not_ready',
                message: error instanceof Error ? error.message : 'PerformanceMonitoringService not available',
                lastChecked: timestamp,
            };
        }

        // Check AuthService (passed to route, so it's available)
        try {
            if (authService) {
                services.auth = {
                    status: 'ready',
                    lastChecked: timestamp,
                };
            } else {
                services.auth = {
                    status: 'not_ready',
                    message: 'AuthService not available',
                    lastChecked: timestamp,
                };
            }
        } catch (error) {
            services.auth = {
                status: 'not_ready',
                message: error instanceof Error ? error.message : 'AuthService check failed',
                lastChecked: timestamp,
            };
        }

        // Add aggregate services status to components
        const allServicesReady = Object.values(services).every(s => s.status === 'ready');
        (components as any).services = {
            status: allServicesReady ? 'healthy' : 'degraded',
            lastChecked: timestamp,
            details: services
        };

        // Calculate overall health status
        // GraphDB is optional, so exclude it from critical health checks
        // Check circuit breakers status
        try {
            const circuitBreakerManager = getCircuitBreakerManager();
            const allStats = circuitBreakerManager.getAllStats();
            const openBreakers = Array.from(allStats.values()).filter(
                stats => stats.state === 'open'
            ).length;
            const halfOpenBreakers = Array.from(allStats.values()).filter(
                stats => stats.state === 'half-open'
            ).length;
            
            (components as any).circuitBreakers = {
                status: openBreakers > 0 ? 'degraded' : 'healthy',
                lastChecked: timestamp,
                totalBreakers: allStats.size,
                openBreakers,
                halfOpenBreakers,
                closedBreakers: allStats.size - openBreakers - halfOpenBreakers,
            } as any;
        } catch (error) {
            (components as any).circuitBreakers = {
                status: 'unknown',
                message: error instanceof Error ? error.message : 'Failed to check circuit breakers',
                lastChecked: timestamp,
            } as any;
        }

        const criticalComponents = Object.entries(components)
            .filter(([key]) => key !== 'graphdb')
            .map(([, value]) => value);
        const allCriticalHealthy = criticalComponents.every(c => c.status === 'healthy');
        const overallStatus = allCriticalHealthy ? 'healthy' : 'degraded';

        // Store health check in database for history (optional)
        try {
            await handleDatabaseOperation(
                async () => {
                    return await db.collection('health_checks').insertOne({
                        timestamp: new Date(),
                        status: overallStatus,
                        components,
                    });
                },
                'HealthRoutes.storeHealthCheckHistory'
            );
        } catch (error) {
            // Non-critical - health check storage failed
            logger.debug({ error }, '[HealthRoutes] Failed to store health check history');
        }

        res.json({
            status: overallStatus,
            database: components.database,
            components,
            timestamp,
        });
    }));

    /**
     * GET /api/admin/health/pool
     * Get MongoDB connection pool metrics
     */
    router.get('/health/pool', asyncHandler(async (_req: Request, res: Response) => {
        const poolStatus = getConnectionPoolStatus();
        const dbHealth = await import('../../config/database.js').then(m => m.checkDatabaseHealth()).catch(() => ({ healthy: false, error: 'Failed to check health' }));
        
        res.json({
            ...poolStatus,
            health: dbHealth,
            timestamp: new Date().toISOString(),
        });
    }));

    /**
     * GET /api/admin/health/queue-processor
     * Get queue processor status for all job types
     */
    router.get('/health/queue-processor', asyncHandler(async (_req: Request, res: Response) => {
        const timestamp = new Date().toISOString();
        const processors: Record<string, {
            initialized: boolean;
            processing: boolean;
            queueAvailable: boolean;
            error?: string;
        }> = {};

        try {
            const queueService = getQueueService();
            const queueManager = (queueService as any).queueManager;
            
            // Check if queue manager is initialized
            const isInitialized = queueManager?.isInitialized() || false;
            
            if (!isInitialized) {
                // Queue service not initialized
                ['scan', 'embedding', 'processing', 'export', 'workflow', 'scraping'].forEach(type => {
                    processors[type] = {
                        initialized: false,
                        processing: false,
                        queueAvailable: false,
                        error: 'Queue service not initialized. Redis may not be available.',
                    };
                });
            } else {
                // Check each processor type
                const processorTypes = [
                    { name: 'scan', queue: queueManager?.getScanQueue() },
                    { name: 'embedding', queue: queueManager?.getEmbeddingQueue() },
                    { name: 'processing', queue: queueManager?.getProcessingQueue() },
                    { name: 'export', queue: queueManager?.getExportQueue() },
                    { name: 'workflow', queue: queueManager?.getWorkflowQueue() },
                    { name: 'scraping', queue: queueManager?.getScrapingQueue() },
                ];

                for (const { name, queue } of processorTypes) {
                    if (queue) {
                        try {
                            // Check if queue is active (has active workers)
                            const [_waiting, active, _completed, _failed] = await Promise.all([
                                queue.getWaitingCount(),
                                queue.getActiveCount(),
                                queue.getCompletedCount(),
                                queue.getFailedCount(),
                            ]);

                            processors[name] = {
                                initialized: true,
                                processing: active > 0,
                                queueAvailable: true,
                            };
                        } catch (error) {
                            processors[name] = {
                                initialized: true,
                                processing: false,
                                queueAvailable: false,
                                error: error instanceof Error ? error.message : 'Failed to check queue status',
                            };
                        }
                    } else {
                        processors[name] = {
                            initialized: false,
                            processing: false,
                            queueAvailable: false,
                            error: 'Queue not available',
                        };
                    }
                }
            }

            // Determine overall status
            const allInitialized = Object.values(processors).every(p => p.initialized);
            const allHealthy = Object.values(processors).every(p => p.initialized && p.queueAvailable && !p.error);
            
            const overallStatus = allHealthy 
                ? 'healthy' 
                : allInitialized 
                    ? 'degraded' 
                    : 'unhealthy';

            res.json({
                status: overallStatus,
                processors,
                timestamp,
                summary: {
                    total: Object.keys(processors).length,
                    initialized: Object.values(processors).filter(p => p.initialized).length,
                    processing: Object.values(processors).filter(p => p.processing).length,
                    healthy: Object.values(processors).filter(p => p.initialized && p.queueAvailable && !p.error).length,
                },
            });
        } catch (error) {
            logger.error({ error }, 'Failed to check queue processor status');
            res.status(500).json({
                status: 'error',
                message: error instanceof Error ? error.message : 'Failed to check queue processor status',
                timestamp,
            });
        }
    }));

    /**
     * GET /api/admin/health/history
     * Get health check history
     */
    router.get('/health/history', asyncHandler(async (req: Request, res: Response) => {
        const db = getDB();
        const limit = parseInt(req.query.limit as string) || 100;
        const hours = parseInt(req.query.hours as string) || 24;

        const startDate = new Date();
        startDate.setHours(startDate.getHours() - hours);

        const history = await handleDatabaseOperation(
            async () => {
                return await db
                    .collection('health_checks')
                    .find({
                        timestamp: { $gte: startDate },
                    })
                    .sort({ timestamp: -1 })
                    .limit(limit)
                    .toArray();
            },
            'HealthRoutes.getHealthHistory'
        );

        res.json({
            history,
            count: history.length,
            period_hours: hours,
        });
    }));

    /**
     * GET /api/admin/health/optimizations
     * Get optimization metrics
     */
    router.get('/health/optimizations', asyncHandler(async (_req: Request, res: Response) => {
        const optimizationMetrics = getOptimizationMetricsService();
        const metrics = optimizationMetrics.getMetricsSummary();
        
        res.json({
            metrics,
            timestamp: new Date().toISOString(),
        });
    }));
}



