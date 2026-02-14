/**
 * Route Configuration
 * 
 * Configures all Express routes for the application.
 * Extracted from index.ts for better organization.
 */

import type { Express } from 'express';
import type { AuthService } from '../services/auth/AuthService.js';
import type { RunManager } from '../services/workflow/RunManager.js';
import type { NavigationGraph } from '../services/graphs/navigation/NavigationGraph.js';
import { logger } from '../utils/logger.js';
import { mutationLimiter, authLimiter, workflowExecutionLimiter } from '../middleware/rateLimiter.js';
import { authenticate, optionalAuth } from '../middleware/authMiddleware.js';
import { csrfProtection } from '../middleware/csrf.js';
import { validate } from '../middleware/validation.js';
import { workflowSchemas } from '../validation/workflowSchemas.js';
import type { RunLog } from '../services/infrastructure/types.js';

// Import route modules
import queriesRouter from '../routes/queries.js';
import bronwebsitesRouter from '../routes/bronwebsites.js';
import canonicalDocumentsRouter from '../routes/canonical-documents.js';
import { createScanRouter } from '../routes/scan.js';
import searchRouter from '../routes/searchRoutes.js';
import unifiedSearchRouter from '../api/routes/search.js';
import qaRouter from '../routes/qaRoutes.js';
import summarizationRouter from '../routes/summarizationRoutes.js';
import stepRoutes from '../routes/stepRoutes.js';
import { createExportRoutes } from '../routes/exportRoutes.js';
import { createExportTemplateRoutes } from '../routes/exportTemplateRoutes.js';
import knowledgeGraphRouter from '../routes/knowledgeGraphRoutes.js';
import neo4jBloomRouter from '../routes/neo4jBloomRoutes.js';
import { createWorkflowRouter } from '../routes/workflowRoutes.js';
import { createWorkflowMetricsRouter } from '../routes/workflowMetricsRoutes.js';
import { createAuthRoutes } from '../routes/authRoutes.js';
import { createSubgraphRouter, createOutputRouter } from '../routes/subgraphRoutes.js';
import { createCommonCrawlRouter } from '../routes/commonCrawlRoutes.js';
import commonCrawlDatabaseRouter from '../routes/commonCrawlDatabaseRoutes.js';
import { createGraphStreamRouter } from '../routes/graphStreamRoutes.js';
import { createBlockRouter } from '../routes/blockRoutes.js';
import ontologyGPTRouter from '../routes/ontologyGPTRoutes.js';
import jurisdictionsRouter from '../routes/jurisdictions.js';
import { createBenchmarkRouter } from '../routes/benchmarkRoutes.js';
import { createProgressRouter } from '../routes/progress.js';
import queryPresetRoutes from '../routes/queryPresetRoutes.js';
import csrfRouter from '../routes/csrfRoutes.js';
import { createQueueRouter } from '../routes/queueRoutes.js';

interface RouteConfigDependencies {
  app: Express;
  authService: AuthService;
  runManager: RunManager;
  navigationGraph: NavigationGraph;
  requireAuth: ReturnType<typeof authenticate>;
  db: import('mongodb').Db;
  workflowEngine: import('../services/workflow/WorkflowEngine.js').WorkflowEngine;
  learningService?: import('../services/learning/LearningService.js').LearningService;
  feedbackService?: import('../services/feedback/FeedbackCollectionService.js').FeedbackCollectionService;
  analysisService?: import('../services/feedback/FeedbackAnalysisService.js').FeedbackAnalysisService;
}

/**
 * Setup all application routes
 */
export async function setupRoutes(deps: RouteConfigDependencies): Promise<void> {
  const { app, authService, runManager, navigationGraph, requireAuth, db, workflowEngine, learningService, feedbackService, analysisService } = deps;

  logger.debug('Setting up routes');

  // Test routes (public for dashboard access, but can be protected if needed)
  // MUST come BEFORE any catch-all /api routes with requireAuth to avoid authentication conflicts
  const testRoutes = await import('../routes/testRoutes.js');
  app.use('/api/tests', testRoutes.default);
  app.use('/api/steps', mutationLimiter, requireAuth, csrfProtection, stepRoutes);

  // CSRF token endpoint (public, no CSRF protection needed)
  app.use('/api', csrfRouter);

  // Authentication routes (public, with auth rate limiting)
  app.use('/api/auth', authLimiter, createAuthRoutes(authService));

  // Notification routes (authenticated)
  logger.debug('Setting up notification routes');
  const { createNotificationRoutes } = await import('../routes/notificationRoutes.js');
  app.use('/api/notifications', createNotificationRoutes(authService));


  // Public read-only routes (optional auth for personalization)
  app.use('/api', searchRouter);
  app.use('/api', unifiedSearchRouter);
  
  // Geoportaal API routes (require API key authentication for external services)
  logger.debug('Setting up Geoportaal routes');
  const { apiKeyAuth } = await import('../middleware/apiKeyAuth.js');
  const documentsWithGeometryRouter = await import('../routes/geoportaal/documentsWithGeometryRoutes.js');
  app.use('/api/documents', apiKeyAuth(), documentsWithGeometryRouter.default);
  // QA routes (require authentication and CSRF protection to prevent quota abuse)
  app.use('/api/qa', mutationLimiter, requireAuth, csrfProtection, qaRouter);
  // Summarization routes (require authentication and CSRF protection to prevent quota abuse)
  app.use('/api/summarization', mutationLimiter, requireAuth, csrfProtection, summarizationRouter);
  app.use('/api/jurisdictions', jurisdictionsRouter);
  app.use('/api/commoncrawl', createCommonCrawlRouter());
  app.use('/api/query-presets', requireAuth, csrfProtection, queryPresetRoutes);
  // Common Crawl database routes (require authentication and CSRF protection for mutations)
  app.use('/api/commoncrawl/db', requireAuth, csrfProtection, commonCrawlDatabaseRouter);
  app.use('/api/knowledge-graph', optionalAuth(authService), knowledgeGraphRouter);
  
  // Knowledge Graph Management routes (SPARQL queries, versioning commands)
  const knowledgeGraphManagementRouter = await import('../routes/knowledgeGraphManagementRoutes.js');
  app.use('/api/kg', optionalAuth(authService), knowledgeGraphManagementRouter.default);
  app.use('/api/neo4j', optionalAuth(authService), neo4jBloomRouter);
  app.use('/api/ontology', optionalAuth(authService), ontologyGPTRouter);

  // Register feedback routes (if available)
  if (feedbackService && learningService && analysisService) {
    logger.debug('Setting up feedback routes');
    const { createFeedbackRouter } = await import('../routes/feedbackRoutes.js');
    app.use('/api/feedback', requireAuth, csrfProtection, createFeedbackRouter(feedbackService, learningService, analysisService));
    
    // Register label feedback routes
    logger.debug('Setting up label feedback routes');
    const { createLabelFeedbackRouter } = await import('../routes/labelFeedbackRoutes.js');
    const { activeLearningService } = await import('../services/semantic/ActiveLearningService.js');
    await activeLearningService.initialize();
    app.use('/api/labels', requireAuth, csrfProtection, createLabelFeedbackRouter());
  }

  // Initialize wizard system
  logger.info('Initializing wizard system');
  try {
    // Register wizard definition
    const { beleidsscanWizardDefinitionV1 } = await import('../services/wizard/definitions/beleidsscanWizardDefinition.js');
    const { WizardSessionEngine } = await import('../services/wizard/WizardSessionEngine.js');
    WizardSessionEngine.registerWizardDefinition(beleidsscanWizardDefinitionV1);
    logger.info('Wizard definition registered: beleidsscan-wizard v1');

    // Register wizard API routes
    const { createBeleidsscanWizardRoutes } = await import('../routes/beleidsscanWizardRoutes.js');
    app.use('/api/wizard', createBeleidsscanWizardRoutes(authService));
    logger.info('Wizard API routes registered');

    // Register all wizard step actions
    const { registerAllActions } = await import('../services/wizard/steps/index.js');
    await registerAllActions();
    logger.info('All wizard step actions registered');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize wizard system');
    // Don't fail server startup - wizard is optional for now
  }

  // Setup benchmark router
  app.use('/api/benchmark', optionalAuth(authService), createBenchmarkRouter());

  // Module API routes (public read-only)
  const { createModuleRoutes } = await import('../routes/modules.js');
  app.use('/api/workflows/modules', optionalAuth(authService), createModuleRoutes());

  // Graph routes (require authentication and CSRF protection)
  // Must be mounted BEFORE graph stream router to avoid route conflicts
  logger.debug('Setting up workflow graph router');
  const { createWorkflowGraphRouter } = await import('../routes/workflowGraphRoutes.js');
  const workflowGraphRouter = createWorkflowGraphRouter(navigationGraph);

  // Conditional middleware: only apply auth/CSRF to graph routes, not public routes
  app.use('/api', (req, res, next) => {
    // Skip all middleware for public GET /api/workflows route - let it fall through to the route handler
    if (req.path === '/workflows' && req.method === 'GET') {
      return next(); // Continue to next middleware/route, router will pass through since it doesn't handle /workflows
    }
    // Skip auth for GET /api/graph/health - it's a public health check endpoint
    if (req.path === '/graph/health' && req.method === 'GET') {
      return next(); // Public health check, no auth required
    }
    // For graph routes handled by workflowGraphRouter, apply authentication, rate limiting, and CSRF
    if (req.path.startsWith('/graph')) {
      requireAuth(req, res, (err) => {
        if (err) return next(err);
        mutationLimiter(req, res, (err) => {
          if (err) return next(err);
          csrfProtection(req, res, next);
        });
      });
    } else {
      // For other routes, just continue (they'll be handled by their own middleware)
      next();
    }
  }, workflowGraphRouter);

  // Pass navigation graph instance to graph stream router
  logger.debug('Setting up graph stream router');
  app.use('/api/graph', requireAuth, csrfProtection, createGraphStreamRouter(runManager, () => navigationGraph));
  
  logger.debug('Setting up block router');
  app.use('/api/blocks', createBlockRouter(authService));

  // Workflow management routes (authenticated, CSRF protected)
  logger.debug('Setting up workflow management routes');
  const { createWorkflowManagementRouter } = await import('../routes/workflowManagementRoutes.js');
  app.use('/api/workflows', mutationLimiter, requireAuth, csrfProtection, createWorkflowManagementRouter(authService, runManager));

  // Scraper plugin routes (read-only, no auth required for discovery)
  logger.debug('Setting up scraper plugin routes');
  const { createScraperPluginRouter } = await import('../routes/scraperPluginRoutes.js');
  app.use('/api/scrapers', createScraperPluginRouter());

  // Workflow sharing routes (authenticated, CSRF protected)
  logger.debug('Setting up workflow sharing routes');
  const { createWorkflowSharingRouter } = await import('../routes/workflowSharingRoutes.js');
  app.use('/api/workflows', mutationLimiter, requireAuth, csrfProtection, createWorkflowSharingRouter(authService));

  // Queue management routes (authenticated)
  logger.debug('Setting up queue management routes');
  app.use('/api/queue', requireAuth, createQueueRouter());

  // GET /api/runs/:id/logs
  app.get('/api/runs/:id/logs', validate(workflowSchemas.getRun), async (req, res) => {
    try {
      const { id } = req.params;
      const run = await runManager.getRun(id);

      if (!run) {
        return res.status(404).json({ error: 'Run not found' });
      }

      // Return raw logs array
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
    } catch (error) {
      logger.error({ error, runId: req.params.id }, 'Error fetching run logs');
      res.status(500).json({ error: 'Failed to fetch run logs' });
    }
  });

  // Protected mutation routes (require authentication and CSRF protection)
  app.use('/api/queries', requireAuth, csrfProtection, queriesRouter);
  // Apply workflow execution rate limiter to scan endpoint (POST /api/queries/:id/scan)
  app.use('/api/queries', workflowExecutionLimiter, requireAuth, csrfProtection, createScanRouter(runManager, workflowEngine, db));

  app.use('/api/bronwebsites', mutationLimiter, requireAuth, csrfProtection, bronwebsitesRouter);

  // brondocumenten routes removed - fully migrated to canonical documents
  // Use /api/canonical-documents instead
  // Apply middleware conditionally: GET requests use optionalAuth, mutations require full auth
  logger.debug('Setting up canonical documents routes at /api/canonical-documents');
  app.use('/api/canonical-documents', (req, res, next) => {
    // For GET requests, use optional authentication (allows unauthenticated access)
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return optionalAuth(authService)(req, res, next);
    }
    // For mutations (POST, PATCH, PUT, DELETE), require full authentication and CSRF
    mutationLimiter(req, res, (err) => {
      if (err) return next(err);
      requireAuth(req, res, (err) => {
        if (err) return next(err);
        csrfProtection(req, res, next);
      });
    });
  }, canonicalDocumentsRouter);
  
  // Document tags routes (authenticated, CSRF protected)
  logger.debug('Setting up document tags routes');
  const documentTagsRouter = await import('../routes/document-tags.js');
  app.use('/api/document-tags', mutationLimiter, requireAuth, csrfProtection, documentTagsRouter.default);
  
  // Document collections routes (authenticated, CSRF protected)
  logger.debug('Setting up document collections routes');
  const documentCollectionsRouter = await import('../routes/document-collections.js');
  app.use('/api/document-collections', mutationLimiter, requireAuth, csrfProtection, documentCollectionsRouter.default);

  // Comparison routes (authenticated, CSRF protected)
  const comparisonRouter = await import('../api/routes/comparison.js');
  app.use('/api/comparisons', mutationLimiter, requireAuth, csrfProtection, comparisonRouter.default);

  app.use('/api/export', mutationLimiter, requireAuth, csrfProtection, createExportRoutes(authService));
  app.use('/api', requireAuth, csrfProtection, createExportTemplateRoutes(authService));

  // Note: Graph routes are now mounted earlier (before graph stream router) to avoid route conflicts

  // Pass navigation graph instance to workflow router (already initialized with Neo4j)
  // Get learningService from app.locals if available (fallback to parameter)
  const effectiveLearningService = learningService || (app.locals.learningService as import('../services/learning/LearningService.js').LearningService | undefined);
  
  // Apply middleware conditionally - skip public GET /api/workflows route
  app.use('/api', (req, res, next) => {
    // Skip auth/CSRF for public GET /api/workflows route
    if (req.path === '/workflows' && req.method === 'GET') {
      return next();
    }
    // Apply workflow execution rate limiter for POST /workflows/:id/run
    if (req.path.startsWith('/workflows/') && req.path.endsWith('/run') && req.method === 'POST') {
      return workflowExecutionLimiter(req, res, (err) => {
        if (err) return next(err);
        mutationLimiter(req, res, (err) => {
          if (err) return next(err);
          requireAuth(req, res, (err) => {
            if (err) return next(err);
            csrfProtection(req, res, next);
          });
        });
      });
    }
    // Apply auth/CSRF for other routes
    mutationLimiter(req, res, (err) => {
      if (err) return next(err);
      requireAuth(req, res, (err) => {
        if (err) return next(err);
        csrfProtection(req, res, next);
      });
    });
  }, createWorkflowRouter(runManager, workflowEngine, navigationGraph, effectiveLearningService));

  // Subgraph and workflow output routes (require authentication and CSRF protection)
  app.use('/api/subgraphs', requireAuth, csrfProtection, createSubgraphRouter(navigationGraph));
  app.use('/api/workflow-outputs', requireAuth, csrfProtection, createOutputRouter());

  // Progress tracking routes (require authentication)
  app.use('/api/progress', createProgressRouter(authService));

  // Admin routes (require authentication, admin role, and CSRF protection)
  const { createAdminRoutes } = await import('../routes/adminRoutes.js');
  app.use('/api/admin', mutationLimiter, requireAuth, csrfProtection, createAdminRoutes(authService));

  // Scheduler routes (authenticated, CSRF protected, admin only - handled by route middleware)
  logger.debug('Setting up scheduler routes');
  const schedulerRouter = await import('../routes/scheduler.js');
  app.use('/api/admin/scheduler', mutationLimiter, csrfProtection, schedulerRouter.default);

  // Feature flags routes (admin only, CSRF protected)
  const { createFeatureFlagsRoutes } = await import('../routes/featureFlags.js');
  app.use('/api/feature-flags', mutationLimiter, requireAuth, csrfProtection, createFeatureFlagsRoutes(authService));

  // Workflow configuration routes (authenticated users, CSRF protected)
  const { createWorkflowConfigurationRoutes } = await import('../routes/workflowConfigurationRoutes.js');
  app.use('/api/workflow-configuration', mutationLimiter, requireAuth, csrfProtection, createWorkflowConfigurationRoutes(authService));

  // AI Crawling configuration routes (CSRF protected)
  const { createAICrawlingRoutes } = await import('../routes/aiCrawlingRoutes.js');
  app.use('/api/ai-crawling', mutationLimiter, requireAuth, csrfProtection, createAICrawlingRoutes(authService));

  // Error monitoring routes (require authentication, admin role, and CSRF protection)
  const { createErrorMonitoringRoutes } = await import('../routes/errorMonitoringRoutes.js');
  app.use('/api/errors', mutationLimiter, requireAuth, csrfProtection, createErrorMonitoringRoutes(authService));

  // AI usage monitoring routes (require authentication, admin role, and CSRF protection)
  const { createAIUsageMonitoringRoutes } = await import('../routes/aiUsageMonitoringRoutes.js');
  app.use('/api/ai-usage', mutationLimiter, requireAuth, csrfProtection, createAIUsageMonitoringRoutes(authService));

  // Sustainability routes (public access for transparency)
  const { createSustainabilityRoutes } = await import('../routes/sustainability.js');
  app.use('/api/sustainability', createSustainabilityRoutes());

  // Workflow lifecycle routes (require authentication, developer/admin role, and CSRF protection)
  const { createWorkflowLifecycleRoutes } = await import('../routes/workflowLifecycleRoutes.js');
  app.use('/api/workflows', mutationLimiter, requireAuth, csrfProtection, createWorkflowLifecycleRoutes(authService));

  // Workflow monitoring routes (require authentication, admin role)
  const { createWorkflowMonitoringRouter } = await import('../routes/workflowMonitoringRoutes.js');
  const { authorize } = await import('../middleware/authMiddleware.js');
  app.use('/api/workflows', requireAuth, authorize(['admin', 'developer']), createWorkflowMonitoringRouter(runManager));

  // Workflow metrics routes (read-only, no CSRF needed)
  app.use('/api/workflows/metrics', optionalAuth(authService), createWorkflowMetricsRouter(authService));

  // Metadata quality routes (require authentication and CSRF protection)
  const { createMetadataQualityRoutes } = await import('../routes/metadataQualityRoutes.js');
  app.use('/api/metadata-quality', mutationLimiter, requireAuth, csrfProtection, createMetadataQualityRoutes(authService));

  logger.info('Routes setup complete');
}

