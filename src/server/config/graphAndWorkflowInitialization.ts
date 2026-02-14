/**
 * Graph and Workflow Initialization
 * 
 * Initializes NavigationGraph and WorkflowEngine during server startup.
 * Extracted from index.ts for better organization.
 */

import type { Express } from 'express';
import type { RunManager } from '../services/workflow/RunManager.js';
import { NavigationGraph } from '../services/graphs/navigation/NavigationGraph.js';
import { WorkflowEngine } from '../services/workflow/WorkflowEngine.js';
import { logger } from '../utils/logger.js';

interface GraphAndWorkflowInitializationDependencies {
  app: Express;
  runManager: RunManager;
  neo4jDriver: any;
}

/**
 * Initialize NavigationGraph and WorkflowEngine
 */
export async function initializeGraphAndWorkflow(deps: GraphAndWorkflowInitializationDependencies): Promise<{
  navigationGraph: NavigationGraph;
  workflowEngine: WorkflowEngine;
}> {
  const { app, runManager, neo4jDriver } = deps;

  // Create navigation graph instance using Neo4j (REQUIRED)
  logger.info('Initializing navigation graph with Neo4j');
  const navigationGraph = new NavigationGraph(neo4jDriver);
  await navigationGraph.load();
  const navStats = await navigationGraph.getStatistics();
  logger.info({ totalNodes: navStats.totalNodes, totalEdges: navStats.totalEdges }, 'Navigation graph initialized');

  // Auto-seed navigation graph if empty (only on first startup)
  if (navStats.totalNodes === 0 && process.env.AUTO_SEED_NAV_GRAPH !== 'false') {
    logger.info('Navigation graph is empty, running seed script...');
    try {
      const { seedNavigationGraph } = await import('../scripts/seed-navigation-graph.js');
      await seedNavigationGraph();
      const newStats = await navigationGraph.getStatistics();
      logger.info({ totalNodes: newStats.totalNodes }, 'Navigation graph seeded');
    } catch (error) {
      // Check if error is due to node already existing (race condition or partial seed)
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('already exists') || errorMsg.includes('ConstraintValidationFailed')) {
        logger.info('Navigation graph nodes already exist (seed may have partially completed)');
        // Verify graph has nodes now
        try {
          const verifyStats = await navigationGraph.getStatistics();
          if (verifyStats.totalNodes > 0) {
            logger.info({ totalNodes: verifyStats.totalNodes }, 'Navigation graph has nodes (seed succeeded despite error)');
          } else {
            logger.warn({ error }, 'Failed to auto-seed navigation graph (this is non-critical)');
          }
        } catch (statsError) {
          logger.warn({ error: statsError }, 'Failed to verify navigation graph statistics after partial seed');
        }
      } else {
        logger.warn({ error }, 'Failed to auto-seed navigation graph (this is non-critical)');
      }
      // Don't fail server startup - graph can be seeded manually later
    }
  }

  // Initialize graph structure building schedule job (requires navigationGraph)
  logger.info('Initializing graph structure building schedule job');
  try {
    const { RelationshipBuilderService } = await import('../services/graphs/navigation/RelationshipBuilderService.js');
    const { LocalEmbeddingProvider } = await import('../services/query/VectorService.js');
    const { GraphStructureScheduleJob } = await import('../services/scheduling/GraphStructureScheduleJob.js');

    if (neo4jDriver) {
      const embeddingProvider = new LocalEmbeddingProvider();
      const relationshipBuilder = new RelationshipBuilderService(neo4jDriver, navigationGraph, embeddingProvider);
      const graphStructureJob = new GraphStructureScheduleJob(navigationGraph, relationshipBuilder);
      graphStructureJob.start();
      // Store in app.locals for graceful shutdown if needed
      app.locals.graphStructureScheduleJob = graphStructureJob;
      logger.info('Graph structure building schedule job initialized');
    } else {
      logger.warn('Neo4j driver not available, skipping graph structure building schedule job');
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize graph structure building schedule job');
    // Don't fail server startup - structure building can still be triggered manually
  }

  // Initialize navigation graph integrity scheduler (requires navigationGraph)
  logger.info('Initializing navigation graph integrity scheduler');
  try {
    const { NavigationGraphIntegrityScheduler } = await import('../services/graphs/navigation/NavigationGraphIntegrityScheduler.js');
    
    if (neo4jDriver) {
      const integrityConfig = {
        enabled: process.env.NAV_GRAPH_INTEGRITY_ENABLED !== 'false',
        cronExpression: process.env.NAV_GRAPH_INTEGRITY_CRON || '0 2 * * *', // Daily at 2 AM
        timezone: process.env.NAV_GRAPH_INTEGRITY_TIMEZONE || 'Europe/Amsterdam',
        runOnStartup: process.env.NAV_GRAPH_INTEGRITY_RUN_ON_STARTUP === 'true',
        cleanupBrokenRelationships: process.env.NAV_GRAPH_INTEGRITY_CLEANUP !== 'false',
        validateOnSchedule: process.env.NAV_GRAPH_INTEGRITY_VALIDATE !== 'false',
      };
      
      const integrityScheduler = new NavigationGraphIntegrityScheduler(navigationGraph, integrityConfig);
      await integrityScheduler.start();
      // Store in app.locals for graceful shutdown if needed
      app.locals.navigationGraphIntegrityScheduler = integrityScheduler;
      logger.info('Navigation graph integrity scheduler initialized');
    } else {
      logger.warn('Neo4j driver not available, skipping navigation graph integrity scheduler');
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize navigation graph integrity scheduler');
    // Don't fail server startup - integrity checks can still be triggered manually
  }

  // Initialize workflow log cleanup service (aggressive cleanup to prevent disk bloat)
  // This must run early to prevent logs from accumulating
  logger.info('Initializing workflow log cleanup service');
  try {
    const { getWorkflowLogCleanupService } = await import('../services/monitoring/WorkflowLogCleanupService.js');
    const workflowLogCleanupService = getWorkflowLogCleanupService();
    workflowLogCleanupService.start();
    // Store in app.locals for graceful shutdown if needed
    app.locals.workflowLogCleanupService = workflowLogCleanupService;
    logger.info('Workflow log cleanup service initialized');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize workflow log cleanup service');
    // Don't fail server startup - cleanup is optional but recommended
  }

  // Create WorkflowEngine with NavigationGraph for monitoring
  const workflowEngine = new WorkflowEngine(runManager, navigationGraph);

  // Initialize and register default workflow modules (after workflowEngine is created)
  logger.info('Initializing workflow modules');
  try {
    const { registerDefaultModules } = await import('../services/workflowModules/index.js');
    registerDefaultModules();
    logger.info('Default workflow modules registered');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize workflow modules');
    // Don't fail server startup - modules are optional for now
  }

  // Register workflow modules with workflowEngine for benchmarking
  try {
    const { moduleRegistry } = await import('../services/workflow/WorkflowModuleRegistry.js');
    const allModules = moduleRegistry.getAll();
    for (const entry of allModules) {
      workflowEngine.registerModule(entry.metadata.id, entry.module);
    }
    logger.info('Workflow modules connected to workflowEngine');
  } catch (error) {
    logger.warn({ error }, 'Failed to connect workflow modules to workflowEngine');
  }

  return {
    navigationGraph,
    workflowEngine,
  };
}

