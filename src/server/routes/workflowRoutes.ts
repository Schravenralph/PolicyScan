import express from 'express';
import type * as cheerioType from 'cheerio';
import type { Element } from 'domhandler';
import axios from 'axios';
import { RunManager } from '../services/workflow/RunManager.js';
import { WorkflowEngine } from '../services/workflow/WorkflowEngine.js';
import { pLimit } from '../utils/concurrency.js';
import { NavigationGraph, type NavigationNode } from '../services/graphs/navigation/NavigationGraph.js';
import { GraphClusteringService } from '../services/graphs/navigation/GraphClusteringService.js';
import { createWorkflowGraphRouter } from './workflowGraphRoutes.js';
import { createWorkflowRunRouter } from './workflowRunRoutes.js';
import { createWorkflowModuleRouter } from './workflows/workflowModuleRoutes.js';
import { createWorkflowExecutionRouter } from './workflows/workflowExecutionRoutes.js';
import { 
    explorationWorkflow, 
    standardScanWorkflow, 
    quickIploScanWorkflow, 
    horstAanDeMaasWorkflow, 
    horstLaborMigrationWorkflow,
    externalLinksWorkflow,
    beleidsscanGraphWorkflow,
    bfs3HopWorkflow
} from '../workflows/predefinedWorkflows.js';
import { getScraperForUrl } from '../services/scrapers/index.js';
import { WebsiteScraper } from '../services/scraping/websiteScraper.js';
import { validate } from '../middleware/validation.js';
import { workflowSchemas } from '../validation/workflowSchemas.js';
import { BronWebsite } from '../models/BronWebsite.js';
import { BronDocument } from '../models/BronDocument.js';

import { IPLOScraper } from '../services/scraping/iploScraper.js';
import { GoogleSearchService } from '../services/external/googleSearch.js';
import { QueryExpansionService } from '../services/query/QueryExpansionService.js';
import { ImborService } from '../services/external/imborService.js';
import { QueryEmbeddingService } from '../services/ingestion/embeddings/QueryEmbeddingService.js';
import { RelevanceScorerService } from '../services/query/relevanceScorer.js';
import { RerankerService } from '../services/retrieval/RerankerService.js';
import type { DiscoveredDocument } from '../services/external/DSOOntsluitenService.js';
// Note: documentMappers functions moved to action files - no longer needed here
// Note: Services moved to action files - imports removed:
// - OfficieleBekendmakingenService, RechtspraakService → externalActions.ts
// - DocumentMergingService, DocumentScoringService, DocumentCategorizationService → processingActions.ts
// - shouldRunCommonCrawlDiscoveryFromContext, discoverDomainsFromCommonCrawl → commonCrawlActions.ts
import { getQueryPersistenceService } from '../services/workflow/QueryPersistenceService.js';
// Note: WorkflowParameterValidator, InputValidationService, validateWorkflowActionParams moved to action files
import { ServiceConfigurationValidator } from '../services/workflow/ServiceConfigurationValidator.js';
import { ScrapedDocument, RunLog, type RunStatus } from '../services/infrastructure/types.js';
import { logger } from '../utils/logger.js';
import type { LearnedPatternInput, NavigationContext } from '../services/patternLearning/types.js';
import { moduleRegistry } from '../services/workflow/WorkflowModuleRegistry.js';
import { createReviewRoutes } from './workflowReviewRoutes.js';
import { registerDSOActions } from './workflows/actions/dso/index.js';
import { registerIPLOActions } from './workflows/actions/iploActions.js';
import { registerScrapingActions } from './workflows/actions/scrapingActions.js';
import { registerProcessingActions } from './workflows/actions/processingActions.js';
import { registerExternalActions } from './workflows/actions/externalActions.js';
import { registerCommonCrawlActions } from './workflows/actions/commonCrawlActions.js';
import { registerQueryActions } from './workflows/actions/queryActions.js';
import { registerGoogleActions } from './workflows/actions/googleActions.js';
import { registerGraphActions } from './workflows/actions/graphActions.js';
import { registerBFSActions } from './workflows/actions/bfsActions.js';
import { registerExplorationActions } from './workflows/actions/explorationActions.js';
import {
    asString,
    asNumber,
    asStringArray,
    toDocumentType
} from './workflowUtils.js';

// Typed params for key workflow actions
interface ExploreIploParams {
    maxDepth?: number;
    query?: string;
    randomness?: number;
}

interface ScanIploParams {
    query?: string;
    theme?: string;
}

interface GoogleSearchTopicParams {
    query?: string;
    siteRestrict?: string[];
    numResults?: number;
    onderwerp?: string;
    thema?: string;
}



export function createWorkflowRouter(
    runManager: RunManager,
    workflowEngine: WorkflowEngine,
    navigationGraph?: NavigationGraph,
    learningService?: import('../services/learning/LearningService.js').LearningService,
    patternLearningService?: import('../services/learning/NavigationPatternLearningService.js').NavigationPatternLearningService
) {
    const router = express.Router();

    // Shared graph instance to prevent reloading from disk on every request
    // If provided via dependency injection, use it; otherwise create lazily
    const sharedGraph: NavigationGraph | null = navigationGraph || null;
    // Initialize clustering service immediately if graph is provided
    let sharedClusteringService: GraphClusteringService | null = sharedGraph 
        ? new GraphClusteringService(sharedGraph)
        : null;
    const googleSearch = new GoogleSearchService();

    // Register clustering service cache invalidator with the graph
    if (sharedGraph && sharedClusteringService) {
        sharedGraph.registerClusteringServiceInvalidator(() => {
            sharedClusteringService?.invalidateCache();
        });
    }

    // Use the NavigationPatternLearningService passed as parameter
    // Store it in a local variable for use in route handlers
    const localPatternLearningService = patternLearningService;

    const getGraph = async () => {
        // Graph MUST be provided via dependency injection (already initialized with Neo4j)
        if (!sharedGraph) {
            throw new Error('NavigationGraph must be initialized with Neo4j driver. Neo4j connection is required.');
        }
        // Initialize clustering service if not already done
        if (!sharedClusteringService) {
            sharedClusteringService = new GraphClusteringService(sharedGraph);
            // Register invalidator when service is created
            sharedGraph.registerClusteringServiceInvalidator(() => {
                sharedClusteringService?.invalidateCache();
            });
        }
        return { graph: sharedGraph, clusteringService: sharedClusteringService };
    };

    // Resilient fetch helper that logs failures instead of swallowing them
    const safeFetch = async (url: string, options: RequestInit, runId: string, warnPrefix = 'Fetch failed'): Promise<Response | null> => {
        try {
            return await fetch(url, options);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            await runManager.log(runId, `${warnPrefix}: ${url} (${message})`, 'warn');
            return null;
        }
    };


    // Register all modules from the registry as workflow actions
    // Modules are registered by their ID so workflows can reference them directly
    try {
        const allModules = moduleRegistry.getAll();
        for (const entry of allModules) {
            // Register module using its ID as the action name
            // This allows workflows to reference modules by ID (e.g., "DiscoverSources")
            workflowEngine.registerModule(entry.metadata.id, entry.module);
            logger.debug({ moduleId: entry.metadata.id }, `Registered module ${entry.metadata.id} as workflow action`);
        }
        logger.info({ count: allModules.length }, `Registered ${allModules.length} modules as workflow actions`);
    } catch (_error) {
        logger.warn({ error: _error }, 'Failed to register modules from registry (modules may not be initialized yet)');
        // Don't fail - legacy actions will still work
    }

    // Graph actions are now in workflows/actions/graphActions.ts
    registerGraphActions(workflowEngine, runManager, sharedGraph);

    // BFS actions are now in workflows/actions/bfsActions.ts
    registerBFSActions(workflowEngine, runManager, sharedGraph);

    // Exploration actions are now in workflows/actions/explorationActions.ts
    registerExplorationActions(workflowEngine, runManager, sharedGraph);

    // Register compensation actions for workflow steps
    (async () => {
        try {
            const { registerCompensationActions } = await import('../services/workflow/compensation/compensationActions.js');
            registerCompensationActions(workflowEngine);
        } catch (error) {
            logger.warn({ error }, 'Failed to register compensation actions (compensation may not be available)');
        }
    })();

    // Register scan actions
    // 
    // QUERY EXPANSION IMPLEMENTATION (Issue #3)
    // 
    // This action implements comprehensive query expansion as specified in:
    // docs/improvements/03-query-expansion.md
    // 
    // The QueryExpansionService:
    // 1. Expands queries with synonyms from domain-specific dictionaries
    // 2. Integrates with IMBOR service for ontology-based terms
    // 3. Generates multi-query variations for different document types
    // 4. Optionally uses LLM for expansion (disabled by default)
    // 
    // HOW IT WORKS:
    // - Takes onderwerp (subject) and thema (theme) from params
    // - Detects domain (planning, housing, policy, general)
    // - Loads relevant synonym dictionaries
    // - Combines IMBOR terms with synonyms
    // - Generates query variations (policy, news, official, general)
    // - Returns expanded terms that improve recall
    // Old enhance_with_imbor action removed - now in workflows/actions/queryActions.ts
    // See: src/server/routes/workflows/actions/queryActions.ts

    // Old scan_iplo and scan_iplo_known_subjects actions removed - now in workflows/actions/iploActions.ts

    // Old scan_known_sources action removed - now in workflows/actions/scrapingActions.ts

    // Register DSO actions (moved to workflows/actions/dsoActions.ts)
    registerDSOActions(workflowEngine, runManager);

    // Register IPLO actions (moved to workflows/actions/iploActions.ts)
    registerIPLOActions(workflowEngine, runManager, navigationGraph);

    // Register scraping actions (moved to workflows/actions/scrapingActions.ts)
    registerScrapingActions(workflowEngine, runManager);

    // Register processing actions (moved to workflows/actions/processingActions.ts)
    registerProcessingActions(workflowEngine, runManager);

    // Register external actions (moved to workflows/actions/externalActions.ts)
    registerExternalActions(workflowEngine, runManager);

    // Register Common Crawl actions (moved to workflows/actions/commonCrawlActions.ts)
    registerCommonCrawlActions(workflowEngine, runManager);

    // Register query enhancement actions (moved to workflows/actions/queryActions.ts)
    registerQueryActions(workflowEngine, runManager);

    // Register Google search actions (moved to workflows/actions/googleActions.ts)
    registerGoogleActions(workflowEngine, runManager, navigationGraph);

    // Old Common Crawl action registration removed - now in workflows/actions/commonCrawlActions.ts

    // Old merge_score_categorize action removed - now in workflows/actions/processingActions.ts

    // Old search_common_crawl_optional action removed - now in workflows/actions/commonCrawlActions.ts

    // Old enhance_with_imbor action removed - now in workflows/actions/queryActions.ts

    // Old scan_google and google_search_topic actions removed - now in workflows/actions/googleActions.ts

    // Old score_documents action removed - now in workflows/actions/processingActions.ts

    // Graph actions (init_navigation_graph, find_relevant_nodes, create_relevant_subgraph, etc.) 
    // are now registered via registerGraphActions from workflows/actions/graphActions.ts

    // BFS actions (bfs_explore_3_hops, bfs_crawl_websites) are now registered via registerBFSActions
    // from workflows/actions/bfsActions.ts

    // expand_from_relevant_nodes is now registered via registerGraphActions from workflows/actions/graphActions.ts

    // Exploration actions (explore_discovered_websites, scrape_horst_municipality) are now registered via 
    // registerExplorationActions from workflows/actions/explorationActions.ts

    // All duplicate graph actions (expand_from_relevant_nodes, merge_into_main_graph, backfill_embeddings, 
    // save_scan_results) are now registered via registerGraphActions from workflows/actions/graphActions.ts

    // Helper functions (exploreFromNode, streamSubgraphToFrontend) are now in workflows/actions/graphActions.ts

    // Note: GET /api/workflows is now handled in server/index.ts as a public route
    // This router only handles protected mutation endpoints

    // Mount run management routes
    router.use('/', createWorkflowRunRouter(runManager, workflowEngine, patternLearningService));

    // Run management routes are now in workflowRunRoutes.ts
    // Routes removed: POST /workflows/:id/run, POST /workflows/:id/queue, GET /runs, GET /runs/:id, POST /runs/:id/cancel, POST /runs/:id/pause, POST /runs/:id/resume

    // Run management routes are now in workflowRunRoutes.ts
    // Routes removed: POST /workflows/:id/run, POST /workflows/:id/queue, GET /runs, GET /runs/:id, POST /runs/:id/cancel, POST /runs/:id/pause, POST /runs/:id/resume

    // Execution routes are now in workflowExecutionRoutes.ts
    // Mount execution routes
    router.use('/', createWorkflowExecutionRouter(runManager, workflowEngine));

    // Run management routes (GET /runs/:id, POST /runs/:id/cancel, POST /runs/:id/pause, POST /runs/:id/resume)
    // are now handled by workflowRunRoutes.ts (mounted at line 2191 via createWorkflowRunRouter)
    // These duplicate routes have been removed to avoid conflicts

    // Note: The resume route with pattern learning is now handled by workflowRunRoutes.ts
    // The duplicate route above has been removed

    // Graph routes are now in workflowGraphRoutes.ts
    // Mount the graph router
    router.use('/', createWorkflowGraphRouter(navigationGraph));

    // Module routes are now in workflowModuleRoutes.ts
    // Mount module routes
    router.use('/', createWorkflowModuleRouter());

    // Review routes are now in workflowReviewRoutes.ts
    // Mount review routes
    router.use(createReviewRoutes(runManager, workflowEngine));

    return router;
}
