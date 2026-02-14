/**
 * Service Initialization
 * 
 * Initializes all application services during server startup.
 * Extracted from index.ts for better organization.
 */

import type { Express } from 'express';
import type { RunManager } from '../services/workflow/RunManager.js';
import { logger } from '../utils/logger.js';
import { withTimeout } from '../utils/withTimeout.js';
import { registerKnowledgeGraphService } from '../routes/knowledgeGraphRoutes.js';
import { hybridSearchService } from '../services/query/HybridSearch.js';
import { ensureDBConnection } from './database.js';

interface ServiceInitializationDependencies {
  app: Express;
  db: Awaited<ReturnType<typeof ensureDBConnection>>;
  runManager: RunManager;
  neo4jDriver: any;
  graphdbConnected: boolean;
  graphdbResult?: { connected: boolean; error?: Error };
  requireAuth: ReturnType<typeof import('../middleware/authMiddleware.js').authenticate>;
  csrfProtection: ReturnType<typeof import('../middleware/csrf.js').csrfProtection>;
}

/**
 * Initialize all application services
 */
export async function initializeServices(deps: ServiceInitializationDependencies): Promise<{
  knowledgeGraphService: any;
  knowledgeBackend: 'graphdb' | 'neo4j';
}> {
  const { app, db, runManager: _runManager, neo4jDriver, graphdbConnected, graphdbResult, requireAuth, csrfProtection } = deps;

  // Initialize knowledge graph (GraphDB)
  // GraphDB connection was attempted via ConnectionManager
  // GraphDB is required for knowledge graph
  let knowledgeBackend: 'graphdb' | 'neo4j' = (process.env.KG_BACKEND || 'graphdb').toLowerCase() as 'graphdb' | 'neo4j';
  type KnowledgeGraphServiceType = import('../services/knowledge-graph/core/KnowledgeGraph.js').KnowledgeGraphService | import('../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService;
  let knowledgeGraphService: KnowledgeGraphServiceType | undefined;

  // Try GraphDB if it was requested and ConnectionManager successfully connected it
  if (knowledgeBackend === 'graphdb' && graphdbConnected) {
    logger.info('Initializing knowledge graph (GraphDB)');
    try {
      const { getGraphDBClient } = await import('../config/graphdb.js');
      const { GraphDBKnowledgeGraphService } = await import('../services/graphs/knowledge/GraphDBKnowledgeGraphService.js');

      // GraphDB is already connected via ConnectionManager, get the client
      // getGraphDBClient() will throw if client is not available, which is fine - we'll catch and fallback
      const graphdbClient = getGraphDBClient();
      knowledgeGraphService = new GraphDBKnowledgeGraphService(graphdbClient);
      // Add timeout to prevent startup hangs (30 seconds)
      await withTimeout(
        knowledgeGraphService.initialize(),
        30000,
        'Knowledge graph initialization (GraphDB)'
      );
      const stats = await knowledgeGraphService.getStats();
      logger.info({ nodeCount: stats.nodeCount, edgeCount: stats.edgeCount, backend: 'graphdb' }, 'Knowledge graph loaded');
    } catch (error) {
      logger.error({ error }, 'GraphDB knowledge graph initialization failed');
      throw new Error('GraphDB knowledge graph initialization failed. GraphDB is required for knowledge graph.');
    }
  } else if (knowledgeBackend === 'graphdb' && !graphdbConnected) {
    // GraphDB was requested but connection failed via ConnectionManager
    // ⚠️ ARCHITECTURE: GraphDB is required for knowledge graph. Neo4j is for Navigation Graph only.
    // According to docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md:
    // - GraphDB is for Knowledge Graph (semantic policy knowledge, entities)
    // - Neo4j is for Navigation Graph (website structure, hyperlinks) only
    // In production, we fail fast. In development/test, we allow Neo4j fallback with warning.
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      logger.error({
        error: graphdbResult?.error,
        requested: 'graphdb',
        architectureViolation: 'GraphDB is required for knowledge graph in production'
      }, '❌ CRITICAL: GraphDB connection failed in production. GraphDB is required for knowledge graph. Neo4j is for Navigation Graph only. See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md');
      throw new Error('GraphDB is required for knowledge graph in production. GraphDB connection failed. Ensure GraphDB is running and connected.');
    }
    
    // Development/test fallback with warning
    logger.warn({
      error: graphdbResult?.error,
      requested: 'graphdb',
      fallback: 'neo4j',
      architectureWarning: 'Neo4j fallback violates architecture - GraphDB is required for knowledge graph',
      environment: process.env.NODE_ENV
    }, '⚠️ ARCHITECTURE WARNING: GraphDB connection failed. Falling back to Neo4j knowledge graph (development/test only). This violates the architecture - GraphDB is required for knowledge graph. See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md');
    
    // Fallback to Neo4j knowledge graph service (development/test only)
    try {
      const { KnowledgeGraphService } = await import('../services/knowledge-graph/core/KnowledgeGraph.js');
      knowledgeGraphService = new KnowledgeGraphService(neo4jDriver);
      await withTimeout(
        knowledgeGraphService.initialize(),
        30000,
        'Knowledge graph initialization (Neo4j fallback)'
      );
      // Try to get stats, but don't fail if it's not available yet
      try {
        const stats = await knowledgeGraphService.getStats();
        logger.info({ nodeCount: stats.nodeCount, edgeCount: stats.edgeCount, backend: 'neo4j' }, 'Knowledge graph loaded (Neo4j fallback - DEV ONLY)');
      } catch (statsError) {
        logger.warn({ error: statsError }, 'Could not get knowledge graph stats during initialization (this is OK)');
        logger.info({ backend: 'neo4j' }, 'Knowledge graph initialized (Neo4j fallback - DEV ONLY)');
      }
      knowledgeBackend = 'neo4j'; // Update backend to reflect actual backend used
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Neo4j knowledge graph service as fallback');
      throw new Error('Failed to initialize knowledge graph service. Both GraphDB and Neo4j fallback failed.');
    }
  }

  if (!knowledgeGraphService) {
    // If no backend was specified, default to GraphDB (required for knowledge graph)
    // ⚠️ ARCHITECTURE: GraphDB is required for knowledge graph. Neo4j is for Navigation Graph only.
    // According to docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md:
    // - GraphDB is for Knowledge Graph (semantic policy knowledge, entities)
    // - Neo4j is for Navigation Graph (website structure, hyperlinks) only
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      logger.error({
        architectureViolation: 'GraphDB is required for knowledge graph in production'
      }, '❌ CRITICAL: No knowledge graph backend specified in production. GraphDB is required for knowledge graph. Neo4j is for Navigation Graph only. See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md');
      throw new Error('GraphDB is required for knowledge graph in production. Set KG_BACKEND=graphdb and ensure GraphDB is running and connected.');
    }
    
    // Development/test: Try GraphDB first, then fallback to Neo4j with warning
    logger.warn({
      architectureWarning: 'No backend specified, defaulting to GraphDB. Neo4j fallback available in dev/test only.'
    }, '⚠️ ARCHITECTURE WARNING: No knowledge graph backend specified. Attempting GraphDB first (required), Neo4j fallback available in development/test only. See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md');
    
    // Try GraphDB first
    if (graphdbConnected) {
      try {
        const { getGraphDBClient } = await import('../config/graphdb.js');
        const { GraphDBKnowledgeGraphService } = await import('../services/graphs/knowledge/GraphDBKnowledgeGraphService.js');
        const graphdbClient = getGraphDBClient();
        knowledgeGraphService = new GraphDBKnowledgeGraphService(graphdbClient);
        await withTimeout(
          knowledgeGraphService.initialize(),
          30000,
          'Knowledge graph initialization (GraphDB default)'
        );
        const stats = await knowledgeGraphService.getStats();
        logger.info({ nodeCount: stats.nodeCount, edgeCount: stats.edgeCount, backend: 'graphdb' }, 'Knowledge graph loaded (GraphDB default)');
        knowledgeBackend = 'graphdb';
      } catch (error) {
        logger.warn({ error }, 'GraphDB initialization failed, falling back to Neo4j (dev/test only)');
      }
    }
    
    // Fallback to Neo4j only if GraphDB failed (dev/test only)
    if (!knowledgeGraphService) {
      logger.warn({
        architectureWarning: 'Using Neo4j for knowledge graph violates architecture - GraphDB is required'
      }, '⚠️ ARCHITECTURE WARNING: Initializing knowledge graph with Neo4j fallback (DEV/TEST ONLY). This violates the architecture - GraphDB is required for knowledge graph. See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md');
      logger.info('Initializing knowledge graph (Neo4j fallback - DEV/TEST ONLY)');
      try {
        const { KnowledgeGraphService } = await import('../services/knowledge-graph/core/KnowledgeGraph.js');
        knowledgeGraphService = new KnowledgeGraphService(neo4jDriver);
        await withTimeout(
          knowledgeGraphService.initialize(),
          30000,
          'Knowledge graph initialization (Neo4j fallback)'
        );
        const stats = await knowledgeGraphService.getStats();
        logger.info({ nodeCount: stats.nodeCount, edgeCount: stats.edgeCount, backend: 'neo4j' }, 'Knowledge graph loaded (Neo4j fallback - DEV/TEST ONLY)');
        knowledgeBackend = 'neo4j';
      } catch (error) {
        logger.error({ error }, 'Failed to initialize Neo4j knowledge graph service');
        throw new Error('Failed to initialize knowledge graph service. Both GraphDB and Neo4j fallback failed.');
      }
    }
  }
  registerKnowledgeGraphService(knowledgeGraphService, knowledgeBackend);
  app.locals.knowledgeGraphService = knowledgeGraphService;
  app.locals.knowledgeBackend = knowledgeBackend;

  // Initialize search service (loads vector store and knowledge graph)
  logger.info('Initializing search service');
  // Add timeout to prevent startup hangs (30 seconds)
  await withTimeout(
    hybridSearchService.init(),
    30000,
    'Search service initialization'
  );
  logger.info('Search service initialized');

  // Initialize background job queue workers
  // Note: Redis connection is already established via ConnectionManager
  logger.info('Initializing background job queue workers');
  try {
    const { getQueueService } = await import('../services/infrastructure/QueueService.js');
    const queueService = getQueueService();
    
    // Start all job processors with detailed logging
    logger.info('Starting scan job processor...');
    await queueService.processScanJobs();
    logger.info('✅ Scan job processor started');
    
    logger.info('Starting embedding job processor...');
    await queueService.processEmbeddingJobs();
    logger.info('✅ Embedding job processor started');
    
    logger.info('Starting processing job processor...');
    await queueService.processProcessingJobs();
    logger.info('✅ Processing job processor started');
    
    logger.info('Starting export job processor...');
    await queueService.processExportJobs();
    logger.info('✅ Export job processor started');
    
    logger.info('Starting workflow job processor...');
    await queueService.processWorkflowJobs();
    logger.info('✅ Workflow job processor started');
    
    logger.info('✅ All background job queue workers initialized successfully');
  } catch (error) {
    logger.error(
      { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 
      '❌ Failed to initialize background job queue workers. Jobs will not be processed. Ensure Redis is running.'
    );
    // Don't fail server startup if Redis is not available
    // The queue will fail gracefully when jobs are queued
  }

  // Initialize queue monitoring service
  logger.info('Initializing queue monitoring service');
  try {
    const { getQueueMonitoringService } = await import('../services/monitoring/QueueMonitoringService.js');
    const queueMonitoringService = getQueueMonitoringService();
    queueMonitoringService.start();
    // Store in app.locals for graceful shutdown if needed
    app.locals.queueMonitoringService = queueMonitoringService;
    logger.info('Queue monitoring service initialized');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize queue monitoring service');
    // Don't fail server startup - monitoring is optional
  }

  // Initialize workflow timeout rate monitor
  try {
    const { getWorkflowTimeoutRateMonitor } = await import('../services/workflow/WorkflowTimeoutRateMonitor.js');
    const timeoutRateMonitor = getWorkflowTimeoutRateMonitor();
    timeoutRateMonitor.start();
    app.locals.workflowTimeoutRateMonitor = timeoutRateMonitor;
    logger.info('Workflow timeout rate monitor initialized');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize workflow timeout rate monitor');
    // Don't fail server startup - alerts can still be sent manually
  }

  // Initialize GeoOutboxWorker for PostGIS sync
  logger.info('Initializing GeoOutboxWorker');
  try {
    const { GeoOutboxWorker } = await import('../workers/GeoOutboxWorker.js');
    const geoOutboxWorker = new GeoOutboxWorker({
      pollIntervalMs: 5000, // Poll every 5 seconds
      batchSize: 10,
      maxRetries: 10,
      baseBackoffMs: 1000,
      maxBackoffMs: 300000, // 5 minutes
    });
    await geoOutboxWorker.start();
    app.locals.geoOutboxWorker = geoOutboxWorker;
    logger.info('GeoOutboxWorker initialized and started');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize GeoOutboxWorker. PostGIS sync will not work. Ensure PostgreSQL/PostGIS is running.');
    // Don't fail server startup - PostGIS is optional for some deployments
  }

  // Initialize threshold schedule background job
  logger.info('Initializing threshold schedule background job');
  try {
    const { getResourceThresholdService } = await import('../services/monitoring/ResourceThresholdService.js');
    const { ThresholdScheduleJob } = await import('../services/scheduling/ThresholdScheduleJob.js');
    const thresholdService = getResourceThresholdService();
    const scheduleJob = new ThresholdScheduleJob(thresholdService);
    scheduleJob.start();
    // Store in app.locals for graceful shutdown if needed
    app.locals.thresholdScheduleJob = scheduleJob;
    logger.info('Threshold schedule background job initialized');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize threshold schedule job');
    // Don't fail server startup - schedules can still be applied manually
  }

  // Initialize graph structure builder schedule job
  logger.info('Initializing graph structure builder schedule job');
  try {
    const { GraphStructureBuilderScheduleJob } = await import('../services/scheduling/GraphStructureBuilderScheduleJob.js');
    const graphStructureJob = new GraphStructureBuilderScheduleJob();
    await graphStructureJob.start();
    // Store in app.locals for graceful shutdown if needed
    app.locals.graphStructureBuilderScheduleJob = graphStructureJob;
    logger.info('Graph structure builder schedule job initialized');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize graph structure builder schedule job');
    // Don't fail server startup - graph structure building is optional
  }

  // Initialize test run consistency background job
  logger.info('Initializing test run consistency background job');
  try {
    const { getTestRunConsistencyJob } = await import('../services/testing/TestRunConsistencyJob.js');
    const consistencyJob = getTestRunConsistencyJob({
      checkIntervalMs: 60 * 60 * 1000, // Check every hour
      autoRepair: process.env.TEST_RUN_CONSISTENCY_AUTO_REPAIR === 'true', // Opt-in via env var
      maxRunsPerCheck: 100,
      enabled: process.env.TEST_RUN_CONSISTENCY_ENABLED !== 'false', // Enabled by default
    });
    consistencyJob.start();
    // Store in app.locals for graceful shutdown if needed
    app.locals.testRunConsistencyJob = consistencyJob;
    logger.info('Test run consistency background job initialized');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize test run consistency job');
    // Don't fail server startup - consistency checks can still be run manually
  }

  // Initialize continuous learning system
  logger.info('Initializing continuous learning system');
  let learningScheduler = null;
  try {
    const { FeedbackCollectionService } = await import('../services/feedback/FeedbackCollectionService.js');
    const { LearningService } = await import('../services/learning/LearningService.js');
    const { FeedbackAnalysisService } = await import('../services/feedback/FeedbackAnalysisService.js');
    const { LearningScheduler } = await import('../services/learning/LearningScheduler.js');
    const { QueryExpansionService } = await import('../services/query/QueryExpansionService.js');
    const { ImborService } = await import('../services/external/imborService.js');

    const feedbackService = new FeedbackCollectionService();
    const queryExpansion = new QueryExpansionService(new ImborService());
    const learningService = new LearningService(queryExpansion);
    const analysisService = new FeedbackAnalysisService();

    learningScheduler = new LearningScheduler(learningService);
    learningScheduler.start();
    app.locals.learningScheduler = learningScheduler;

    // Recover any stuck learning cycles on startup
    try {
      const recovered = learningService.recoverStuckCycles(10);
      if (recovered > 0) {
        logger.info({ recovered }, 'Recovered stuck learning cycles on startup');
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to recover stuck learning cycles on startup');
    }

    // Recover any stuck scheduled tasks on startup
    try {
      const recoveredTasks = learningScheduler.recoverStuckTasks(30);
      if (recoveredTasks > 0) {
        logger.info({ recoveredTasks }, 'Recovered stuck scheduled tasks on startup');
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to recover stuck scheduled tasks on startup');
    }

    // Ensure database indexes for learning cycle executions
    try {
      await db.collection('learning_cycle_executions').createIndexes([
        { key: { startTime: -1 }, name: 'startTime_desc' },
        { key: { status: 1 }, name: 'status_asc' },
        { key: { operationId: 1 }, name: 'operationId_asc' },
        { key: { createdAt: -1 }, name: 'createdAt_desc' },
      ]);
      logger.info('Learning cycle executions indexes created');
    } catch (error) {
      logger.warn({ error }, 'Failed to create learning cycle executions indexes');
    }

    // Register feedback routes (authenticated, CSRF protected - mutations modify state)
    // Note: Admin-only routes (quality, learn) have additional authorization middleware
    const { createFeedbackRouter } = await import('../routes/feedbackRoutes.js');
    app.use('/api/feedback', requireAuth, csrfProtection as any, createFeedbackRouter(feedbackService, learningService, analysisService));
    app.locals.feedbackService = feedbackService;
    app.locals.learningService = learningService;

    // Register label feedback routes (authenticated, CSRF protected)
    logger.debug('Setting up label feedback routes');
    const { createLabelFeedbackRouter } = await import('../routes/labelFeedbackRoutes.js');
    const { activeLearningService } = await import('../services/semantic/ActiveLearningService.js');
    await activeLearningService.initialize();
    app.use('/api/labels', requireAuth, csrfProtection as any, createLabelFeedbackRouter());

    logger.info('Continuous learning system initialized');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize continuous learning system');
    // Don't fail server startup - feedback collection is optional
  }

  // Initialize email digest service
  logger.info('Initializing email digest service');
  try {
    const { getEmailDigestService } = await import('../services/testing/EmailDigestService.js');
    const emailDigestService = getEmailDigestService();
    await emailDigestService.initialize();
    app.locals.emailDigestService = emailDigestService;
    logger.info('Email digest service initialized');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize email digest service');
    // Don't fail server startup - email notifications can still work without digests
  }

  return {
    knowledgeGraphService,
    knowledgeBackend,
  };
}

