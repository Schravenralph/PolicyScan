import { Db, ObjectId } from 'mongodb';
import { IPLOScraper } from './iploScraper.js';
import { GoogleSearchService } from '../external/googleSearch.js';
import { SourceMatchingService } from '../source/sourceMatching.js';
import { RelevanceScorerService } from '../query/relevanceScorer.js';
import { WebsiteScraper } from './websiteScraper.js';
import { ImborService } from '../external/imborService.js';
import { NavigationGraph, NavigationNode } from '../graphs/navigation/NavigationGraph.js';
import { RunManager } from '../workflow/RunManager.js';
import { getScraperForUrl } from '../scrapers/index.js';
import {
  ScanParameters,
  ScanResult,
  ScrapedDocument,
  ScrapedSource,
  WorkflowResult
} from '../infrastructure/types.js';
import type { CanonicalDocumentDraft } from '../../contracts/types.js';
import { getCanonicalDocumentService } from '../canonical/CanonicalDocumentService.js';
import { BronWebsiteCreateInput } from '../../types/index.js';
import { getNeo4jDriver } from '../../config/neo4j.js';
import { ServiceUnavailableError, BadRequestError, ExternalServiceError } from '../../types/errors.js';
import { WorkflowEngine } from '../workflow/WorkflowEngine.js';
import { POLICY_SCAN_WORKFLOW } from '../../workflows/policyScanWorkflow.js';
import { GraphClusteringService, ClusterNode } from '../graphs/navigation/GraphClusteringService.js';
import { LocalEmbeddingProvider } from '../query/VectorService.js';
import { KnowledgeBaseManager } from '../knowledgeBase/KnowledgeBaseManager.js';
import { MetadataExtractionService } from '../ingestion/metadata/MetadataExtractionService.js';
import { LearningService } from '../learning/LearningService.js';
import { RelationshipExtractionService } from '../extraction/RelationshipExtractionService.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { AdaptiveTraversalService } from './AdaptiveTraversalService.js';
import type { LinkContext } from './SemanticLinkScorer.js';
import { ChangeDetectionService } from '../knowledge-graph/maintenance/ChangeDetectionService.js';
import { GraphManager } from './GraphManager.js';
import { ScrapingWorkerPool } from './ScrapingWorkerPool.js';
import { NavigationPatternLearningService } from '../learning/NavigationPatternLearningService.js';
import { PatternRepository } from '../patternLearning/PatternRepository.js';
import { StructuralPatternMatcher } from '../patternLearning/matchers/StructuralPatternMatcher.js';
import { PatternValidator } from '../patternLearning/PatternValidator.js';
import { NavigationContext } from '../patternLearning/types.js';
import { getProgressStreamingService } from '../progress/ProgressStreamingService.js';
import { TIMEOUTS, DELAYS } from '../../config/constants.js';
import * as path from 'path';
import { logger } from '../../utils/logger.js';

// New components
import { DocumentProcessor } from './components/DocumentProcessor.js';
import { GraphAnalyzer } from './components/GraphAnalyzer.js';
import { ProductionScraper } from './strategies/ProductionScraper.js';
import { HybridScraper } from './strategies/HybridScraper.js';

/**
 * Sleep utility function - delays execution for specified milliseconds
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * ScraperOrchestrator - Coordinates scraping operations across multiple services
 * 
 * ## Naming Rationale
 * 
 * This class retains its current name because:
 * 
 * 1. **Semantic Accuracy**: The class truly "orchestrates" scraping operations by coordinating
 *    multiple services (IPLO scraper, Google Search, website scrapers, graph services, etc.)
 * 
 * 2. **Scope Beyond Actions**: While it registers workflow actions, it also manages:
 *    - Multiple scraper instances (IPLO, Google, Website, IMBOR)
 *    - Graph operations (NavigationGraph, GraphClustering, GraphManager)
 *    - Embedding providers and vector services
 *    - Metadata extraction and entity/relationship extraction
 *    - Adaptive traversal and change detection
 * 
 * 3. **Established Usage**: The name is used in 183 references across 58 files including:
 *    - Production code (QueueService, ScanService)
 *    - Architecture documentation
 *    - Test files
 *    - Scripts
 * 
 * 4. **Breaking Change Impact**: A rename would require:
 *    - Updating all imports across the codebase
 *    - Updating all documentation references
 *    - Updating test files
 *    - Potential breaking changes for external consumers
 * 
 * ## Future Considerations
 * 
 * If future refactoring reduces the class scope significantly (e.g., if it becomes
 * primarily a workflow action provider), a rename could be reconsidered. However,
 * given the comprehensive orchestration role, the current name remains appropriate.
 * 
 * ## Alternative Names Considered
 * 
 * - `ScrapingWorkflowActions`: Too narrow - class does more than provide actions
 * - `ScrapingActionProvider`: Too narrow - class manages services, not just actions
 * - `ScrapingCoordinator`: Less standard terminology than "Orchestrator"
 * 
 * **Note**: This documentation addresses naming debt tracking (WI-355). The class name is
 *            appropriate and no breaking changes are planned. The name accurately reflects
 *            the class's role as a comprehensive orchestrator of scraping operations.
 */
export class ScraperOrchestrator {
  private iploScraper: IPLOScraper;
  private googleSearch: GoogleSearchService;
  private sourceMatching: SourceMatchingService;
  private relevanceScorer: RelevanceScorerService;
  private websiteScraper: WebsiteScraper;
  private _imborService: ImborService;
  private navigationGraph: NavigationGraph;
  private runManager: RunManager;
  private workflowEngine: WorkflowEngine;
  private graphClustering: GraphClusteringService;
  private queryEmbeddingProvider: LocalEmbeddingProvider;
  // private clusterEmbeddingCache: Map<string, number[]>; // Moved to GraphAnalyzer
  // private embeddingReady: boolean = false; // Moved to GraphAnalyzer
  private metadataExtractionService: MetadataExtractionService;
  private relationshipExtractionService: RelationshipExtractionService | null = null;
  private adaptiveTraversalService: AdaptiveTraversalService | null = null;
  private changeDetectionService: ChangeDetectionService | null = null;
  private graphManager: GraphManager;
  private scrapingWorkerPool: ScrapingWorkerPool;
  private patternLearningService: NavigationPatternLearningService | null = null;

  // New components
  private documentProcessor: DocumentProcessor;
  private graphAnalyzer: GraphAnalyzer;
  private productionScraper: ProductionScraper;
  private hybridScraper: HybridScraper;

  constructor(private db: Db, learningService?: LearningService) {
    this.iploScraper = new IPLOScraper(2); // Depth-limited crawling with max depth 2
    this.googleSearch = new GoogleSearchService();
    this.sourceMatching = new SourceMatchingService(db);
    this.relevanceScorer = new RelevanceScorerService(learningService);
    this.websiteScraper = new WebsiteScraper();
    this._imborService = new ImborService();

    this.runManager = new RunManager(db);
    this.workflowEngine = new WorkflowEngine(this.runManager);
    this.queryEmbeddingProvider = new LocalEmbeddingProvider();
    // this.clusterEmbeddingCache = new Map(); // Moved
    this.metadataExtractionService = new MetadataExtractionService();
    
    // NavigationGraph REQUIRES Neo4j driver - no fallbacks
    const neo4jDriver = getNeo4jDriver();
    if (!neo4jDriver) {
      throw new ServiceUnavailableError('NavigationGraph requires Neo4j connection. Neo4j driver is not available.', {
        reason: 'neo4j_not_configured',
        operation: 'constructor'
      });
    }
    this.navigationGraph = new NavigationGraph(neo4jDriver);
    this.graphClustering = new GraphClusteringService(this.navigationGraph);
    
    // Initialize relationship extraction service if enabled
    // Note: EntityExtractionService is no longer needed - GraphManager uses PolicyParser internally
    if (FeatureFlag.isRelationshipExtractionEnabled()) {
      this.relationshipExtractionService = new RelationshipExtractionService();
    }
    
    // Initialize GraphManager with navigation graph and relationship extraction service
    // GraphManager uses PolicyParser internally for entity extraction
    this.graphManager = new GraphManager(
      this.navigationGraph,
      this.relationshipExtractionService || undefined
    );

    // Initialize adaptive traversal service if enabled (after GraphManager is initialized)
    if (AdaptiveTraversalService.isEnabled()) {
      this.adaptiveTraversalService = new AdaptiveTraversalService(this.graphManager.getKnowledgeGraphService());
      logger.info('Adaptive Traversal Service enabled');
    }

    // Initialize change detection service if enabled
    if (FeatureFlag.isEnabled(KGFeatureFlag.KG_CHANGE_DETECTION_ENABLED, false)) {
      this.changeDetectionService = new ChangeDetectionService(this.graphManager.getKnowledgeGraphService());
      logger.info('Change Detection Service enabled');
    }

    // Inject IMBOR service into Google Search for enhanced queries
    this.googleSearch.setImborService(this._imborService);

    // Initialize scraping worker pool for parallel execution
    // Increased from 5 to 8 for faster processing
    this.scrapingWorkerPool = new ScrapingWorkerPool({
      maxConcurrency: 8,
      maxMemoryMB: 1024,
      rateLimitPerSecond: 2,
      scraperTimeout: 60000,
    });

    // Initialize Navigation Pattern Learning Service
    try {
      const patternRepository = new PatternRepository(db);
      const patternMatcher = new StructuralPatternMatcher();
      const patternValidator = new PatternValidator();
      const learningServiceInstance = learningService || new LearningService();
      
      this.patternLearningService = new NavigationPatternLearningService(
        patternRepository,
        patternMatcher,
        patternValidator,
        this.runManager,
        learningServiceInstance
      );
      logger.info('Navigation Pattern Learning Service initialized');
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize Navigation Pattern Learning Service');
      // Service will remain null, and pattern learning will be skipped
    }

    // Initialize new components
    this.documentProcessor = new DocumentProcessor(this.metadataExtractionService, this.graphManager);
    this.graphAnalyzer = new GraphAnalyzer(this.graphClustering, this.queryEmbeddingProvider, this.runManager);
    this.productionScraper = new ProductionScraper(this.navigationGraph, this.runManager);
    this.hybridScraper = new HybridScraper(this.navigationGraph, this.runManager, this.iploScraper, this.productionScraper);

    // Register workflow actions
    this.registerWorkflowActions();
  }

  /**
   * Register actions for the Policy Scan Workflow
   */
  private registerWorkflowActions(): void {
    // 1. Initialize Scan
    this.workflowEngine.registerAction('initializeScan', async (params: Record<string, unknown>, runId: string) => {
      const scanParams = params as unknown as ScanParameters;
      const mode = scanParams.mode || 'dev'; // Default to dev mode for backward compatibility
      
      // US-010: Get mode-specific configuration
      const { scraperConfig } = await import('../../config/scraperConfig.js');
      const modeConfig = scraperConfig.modes[mode as keyof typeof scraperConfig.modes] || scraperConfig.modes.dev;
      
      await this.runManager.log(runId, `Scan initialiseren (${mode.toUpperCase()} modus)...`, 'info');
      await this.runManager.log(
        runId,
        `Mode config: ${modeConfig.loggingVerbosity} logging, ${modeConfig.errorHandling} error handling, exploration: ${modeConfig.explorationEnabled ? 'enabled' : 'disabled'}`,
        'debug'
      );
      
      // Initialize progress streaming
      const progressStreamingService = getProgressStreamingService();
      progressStreamingService.initializeRun(runId, 5); // 5 main steps
      progressStreamingService.updateProgress(runId, {
        status: 'running',
        progress: 0,
        currentStep: `Initializing scan in ${mode.toUpperCase()} mode...`,
        completedSteps: 0,
      });
      
      await this.navigationGraph.load();

      // Record mode in run metadata
      await this.runManager.updateRunParams(runId, { mode });

      // Enhance query with IMBOR
      const { enhancedTerms, context } = this._imborService.enhanceQuery(
        (scanParams.onderwerp as string) || '',
        (scanParams.thema as string) || ''
      );

      // Log mode-specific behavior
      if (mode === 'prod') {
        const allNodes = await this.navigationGraph.getAllNodes();
        await this.runManager.log(
          runId,
          `Production mode: Using navigation graph with ${allNodes.length} known nodes for efficient updates`,
          'info'
        );
      } else if (mode === 'hybrid') {
        await this.runManager.log(
          runId,
          `Hybrid mode: Will explore within specified patterns, use prod efficiency for known pages`,
          'info'
        );
      } else {
        await this.runManager.log(
          runId,
          `Development mode: Full exploration enabled, will build/update navigation graph`,
          'info'
        );
      }

      return {
        enhancedTerms,
        imborContext: context,
        documents: [],
        suggestedSources: []
      };
    });

    // 2. Search Web
    this.workflowEngine.registerAction('searchWeb', async (context: Record<string, unknown>, runId: string) => {
      const params = context as unknown as ScanParameters;
      const mode = params.mode || 'dev';
      await this.runManager.log(runId, `Initiële webzoekopdracht uitvoeren (${mode} modus)...`, 'info');

      const progressStreamingService = getProgressStreamingService();
      progressStreamingService.updateProgress(runId, {
        status: 'running',
        progress: 20,
        currentStep: `Performing web search (${mode} mode)...`,
        completedSteps: 1,
      });

      const documents: ScrapedDocument[] = [];
      const suggestedSources: ScrapedSource[] = [];

      // A. IPLO Scan - Mode-aware behavior
      if (mode === 'dev') {
        // US-010: Development Mode - Full Exploration
        await this.runManager.log(runId, 'Dev modus: IPLO structuur verkennen en navigatiegrafiek opbouwen...', 'info');
        progressStreamingService.updateProgress(runId, {
          currentStep: 'Exploring IPLO structure and building navigation graph...',
          progress: 25,
        });
        try {
          await this.iploScraper.explore(params.onderwerp, this.navigationGraph);
          await this.navigationGraph.save();
          await this.runManager.log(runId, 'Navigatiegrafiek bijgewerkt met nieuwe ontdekkingen', 'info');
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          
          // US-010: Dev mode user intervention support with learned pattern application
          const { scraperConfig } = await import('../../config/scraperConfig.js');
          const modeConfig = scraperConfig.modes.dev;
          
          // US-010 Enhancement: Try applying learned patterns before pausing
          let learnedPatternApplied = false;
          if (this.patternLearningService) {
            try {
              const url = params.customUrl || '';
              let domain = '';
              try {
                const urlObj = new URL(url);
                domain = urlObj.hostname;
              } catch {
                // If URL is invalid, use the URL as-is
                domain = url;
              }
              
              // Extract error type from error message
              const errorLower = errorMsg.toLowerCase();
              let errorType: string | undefined;
              if (errorLower.includes('element not found')) {
                errorType = 'element_not_found';
              } else if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
                errorType = 'timeout';
              } else if (errorLower.includes('navigation') || errorLower.includes('navigate')) {
                errorType = 'navigation_error';
              } else if (errorLower.includes('selector') || errorLower.includes('xpath')) {
                errorType = 'selector_error';
              }
              
              const context: NavigationContext = {
                url,
                domain,
                errorMessage: errorMsg,
                errorType,
                runId,
                timestamp: new Date(),
              };
              
              const result = await this.patternLearningService.findAndApplyPattern(context);
              learnedPatternApplied = result.applied;
              
              if (learnedPatternApplied && result.pattern) {
                await this.runManager.log(
                  runId,
                  `🎯 Applied learned pattern: ${result.pattern.id} (score: ${result.matchScore?.toFixed(2) ?? 'N/A'})`,
                  'info',
                  {
                    patternId: result.pattern.id,
                    pattern: result.pattern.pattern,
                    matchScore: result.matchScore,
                    sourceUrl: result.pattern.sourceUrl,
                  }
                );
                
                // Track the successful application
                await this.patternLearningService.trackApplicationResult(
                  result.pattern.id,
                  true,
                  context,
                  result.matchScore
                );
              } else if (result.reason) {
                // Log why pattern was not applied
                const details = (result.details || {}) as Record<string, unknown>;
                await this.runManager.log(
                  runId,
                  `🔍 Pattern learning: ${result.reason} (candidates: ${(details.candidateCount as number) ?? 0}, topScore: ${(details.topScore as number)?.toFixed(2) ?? 'N/A'})`,
                  'debug',
                  { reason: result.reason, details }
                );
              }
            } catch (patternError) {
              const patternErrorMsg = patternError instanceof Error ? patternError.message : String(patternError);
              await this.runManager.log(
                runId,
                `⚠️ Error applying learned patterns: ${patternErrorMsg}`,
                'warn'
              );
            }
          }
          
          if (learnedPatternApplied) {
            // If a learned pattern was successfully applied, retry the exploration
            await this.runManager.log(
              runId,
              '✅ Successfully applied learned pattern, retrying exploration...',
              'info'
            );
            try {
              await this.iploScraper.explore(params.onderwerp, this.navigationGraph);
              await this.navigationGraph.save();
              await this.runManager.log(runId, 'Navigatiegrafiek bijgewerkt met geleerd patroon', 'info');
            } catch (retryError) {
              // If retry still fails, proceed to pause/fallback
              const retryErrorMsg = retryError instanceof Error ? retryError.message : String(retryError);
              await this.runManager.log(
                runId,
                `⚠️ Retry with learned pattern failed: ${retryErrorMsg}. Proceeding to intervention.`,
                'warn'
              );
            }
          }
          
          if (modeConfig.pauseOnUnknownPattern && !learnedPatternApplied) {
            // Pause for human input/guidance in dev mode (only if no learned pattern worked)
            await this.runManager.log(
              runId,
              `Onbekend navigatiepatroon aangetroffen: ${errorMsg}. Run gepauzeerd voor beoordeling.`,
              'warn',
              { 
                error: errorMsg, 
                url: params.customUrl, 
                onderwerp: params.onderwerp,
                requiresIntervention: true,
                pausedAt: new Date().toISOString(),
                learnedPatternsAttempted: true
              }
            );
            
            // Update run status to paused
            await this.runManager.pauseRun(runId, {
              stepId: 'exploration',
              context: {
                error: errorMsg,
                url: params.customUrl,
                onderwerp: params.onderwerp,
                navigationGraph: await this.navigationGraph.getAllNodes()
              }
            });
            
            progressStreamingService.updateProgress(runId, {
              status: 'failed' as const,
              totalErrors: (progressStreamingService.getProgress(runId)?.totalErrors || 0) + 1,
            });
            
            // Log learning opportunity
            await this.runManager.log(
              runId,
              'Leermogelijkheid: Dit patroon kan worden toegevoegd aan navigatiegrafiek na beoordeling.',
              'info'
            );
          } else if (!learnedPatternApplied) {
            // Log and continue (fallback behavior)
            await this.runManager.log(
              runId,
              `Onbekend navigatiepatroon aangetroffen: ${errorMsg}. Run gepauzeerd voor beoordeling.`,
              'warn',
              { error: errorMsg, url: params.customUrl, onderwerp: params.onderwerp }
            );
            progressStreamingService.updateProgress(runId, {
              totalErrors: (progressStreamingService.getProgress(runId)?.totalErrors || 0) + 1,
            });
          }
        }
        progressStreamingService.updateProgress(runId, {
          currentStep: 'Scraping IPLO documents...',
          progress: 30,
        });
        const iploDocs = await this.iploScraper.scrapeByQuery(params.onderwerp, params.thema);
        documents.push(...iploDocs);
        progressStreamingService.updateProgress(runId, {
          totalDocumentsFound: documents.length,
          progress: 35,
        });
      } else if (mode === 'prod') {
        // US-010: Production Mode - Targeted Updates
        await this.runManager.log(runId, 'Prod modus: Navigatiegrafiek gebruiken voor gerichte updates...', 'info');
        progressStreamingService.updateProgress(runId, {
          currentStep: 'Using navigation graph for targeted updates...',
          progress: 30,
        });
        // Use delegated ProductionScraper
        const prodDocs = await this.productionScraper.scrape(params, runId);
        documents.push(...prodDocs);
        progressStreamingService.updateProgress(runId, {
          totalDocumentsFound: documents.length,
          progress: 35,
        });
      } else if (mode === 'hybrid') {
        // US-010: Hybrid Mode - Targeted Exploration
        await this.runManager.log(runId, 'Hybrid modus: Gerichte verkenning met productie-efficiëntie...', 'info');
        progressStreamingService.updateProgress(runId, {
          currentStep: 'Targeted exploration with production efficiency...',
          progress: 30,
        });
        // Use delegated HybridScraper
        const hybridDocs = await this.hybridScraper.scrape(params, runId);
        documents.push(...hybridDocs);
        progressStreamingService.updateProgress(runId, {
          totalDocumentsFound: documents.length,
          progress: 35,
        });
      } else {
        // Fallback to dev mode behavior
        const iploDocs = await this.iploScraper.scrapeByQuery(params.onderwerp, params.thema);
        documents.push(...iploDocs);
      }

      // B. Known Sources - Parallel Execution
      let matchingWebsites: Array<{ url: string; titel: string }> = [];

      if (params.selectedWebsites && params.selectedWebsites.length > 0) {
        // Use user-selected websites
        matchingWebsites = params.selectedWebsites.map(url => ({
          url,
          titel: new URL(url).hostname // Use domain as fallback title
        }));
        await this.runManager.log(
          runId,
          `Using ${matchingWebsites.length} user-selected websites for scanning`,
          'info'
        );
      } else {
        // Use smart source selection (Recommendation #4) if enabled
        // Pass query text for semantic matching
        const queryText = [params.onderwerp, params.thema].filter(Boolean).join(' ');
        matchingWebsites = await this.sourceMatching.getRankedMatchingWebsites(
          params.onderwerp,
          params.thema,
          params.overheidslaag,
          10,
          queryText // Pass query for semantic matching
        );
      }

      // Prepare tasks for parallel execution
      const scrapingTasks = await Promise.all(matchingWebsites.map(async (website) => {
        const siteSpecificScraper = await getScraperForUrl(website.url, website.titel, params.onderwerp);
        
        if (siteSpecificScraper) {
          const scraperName = siteSpecificScraper.constructor.name;
          logger.debug({ scraper: scraperName, url: website.url }, 'Selected scraper for website');
        }
        
        return {
          websiteUrl: website.url,
          websiteTitle: website.titel,
          scraper: siteSpecificScraper,
          onderwerp: params.onderwerp,
          thema: params.thema,
        };
      }));

      // Set up progress tracking with WebSocket streaming
      progressStreamingService.updateProgress(runId, {
        currentStep: `Starting parallel scraping of ${matchingWebsites.length} websites...`,
        progress: 40,
        totalSourcesFound: matchingWebsites.length,
      });
      
      // Cache scraper name promises to avoid repeated DB lookups during progress updates
      // Using Promise<string> handles concurrent requests correctly (thundering herd problem)
      const scraperNameCache = new Map<string, Promise<string>>();

      this.scrapingWorkerPool.setProgressCallback((progress) => {
        // Log progress updates
        const running = progress.filter(p => p.status === 'running').length;
        const completed = progress.filter(p => p.status === 'completed').length;
        const failed = progress.filter(p => p.status === 'failed').length;
        if (running > 0 || completed > 0 || failed > 0) {
          logger.debug(
            { running, completed, failed, total: progress.length },
            'Parallel scraping progress'
          );
        }

        // Emit WebSocket progress updates
        // Use Promise.all to ensure all async operations are handled properly
        Promise.all(progress.map(async (scraperProgress) => {
          const scraperId = scraperProgress.websiteUrl || 'unknown';
          let scraperName = 'WebsiteScraper';

          if (scraperProgress.websiteUrl) {
            let namePromise = scraperNameCache.get(scraperProgress.websiteUrl);

            if (!namePromise) {
              // Create a promise for this resolution and cache it immediately
              namePromise = (async () => {
                try {
                  const scraper = await getScraperForUrl(scraperProgress.websiteUrl!, '', params.onderwerp);
                  return scraper?.constructor.name || 'WebsiteScraper';
                } catch (error) {
                  // Fallback to default name if lookup fails, but don't crash
                  logger.warn({ error, url: scraperProgress.websiteUrl }, 'Failed to resolve scraper name for progress update');
                  return 'WebsiteScraper';
                }
              })();
              scraperNameCache.set(scraperProgress.websiteUrl, namePromise);
            }

            scraperName = await namePromise;
          }
          
          progressStreamingService.updateScraperProgress(
            runId,
            scraperId,
            scraperName,
            {
              status: scraperProgress.status === 'running' ? 'running' : 
                      scraperProgress.status === 'completed' ? 'completed' : 
                      scraperProgress.status === 'failed' ? 'failed' : 'pending',
              progress: scraperProgress.status === 'completed' ? 100 : scraperProgress.status === 'running' ? 50 : 0,
              documentsFound: scraperProgress.documentsFound || 0,
              errors: scraperProgress.error ? 1 : 0,
            }
          );
        })).catch(error => {
          logger.error({ error }, 'Error processing progress updates');
        });
      });

      // Execute scraping tasks in parallel
      await this.runManager.log(
        runId,
        `🚀 Starting parallel scraping of ${matchingWebsites.length} websites...`,
        'info'
      );

      const parallelResults = await this.scrapingWorkerPool.executeParallel(scrapingTasks);

      // Update progress: mark as completed
      progressStreamingService.updateProgress(runId, {
        status: 'completed',
        progress: 100,
        currentStep: 'Scraping completed',
        completedSteps: matchingWebsites.length,
      });

      // Process results and handle fallbacks
      for (const result of parallelResults.results) {
        const website = matchingWebsites.find(w => w.url === result.websiteUrl);
        
        if (result.success && result.documents.length > 0) {
          documents.push(...result.documents);
          if (website) {
            const scraper = result.websiteUrl ? 
              await getScraperForUrl(result.websiteUrl, website.titel, params.onderwerp) :
              null;
            const scraperName = scraper?.constructor.name || 'WebsiteScraper';
            await this.runManager.log(
              runId,
              `✅ Scraped ${result.documents.length} documents from ${result.websiteUrl} using ${scraperName || 'WebsiteScraper'}`,
              'info'
            );
          }
        } else if (!result.success && website) {
          // Fallback to WebsiteScraper if parallel scraping failed
          logger.warn(
            { error: result.error, url: result.websiteUrl },
            'Parallel scraping failed, attempting fallback'
          );
          try {
            const fallbackDocs = await this.websiteScraper.scrapeWebsite(
              result.websiteUrl,
              params.onderwerp,
              params.thema
            );
            if (fallbackDocs.length > 0) {
              documents.push(...fallbackDocs);
              await this.runManager.log(
                runId,
                `✅ Fallback scrape successful: ${fallbackDocs.length} documents from ${result.websiteUrl}`,
                'info'
              );
            }
          } catch (e) {
            logger.error({ error: e, url: result.websiteUrl }, 'Fallback scrape also failed');
            await this.runManager.log(
              runId,
              `❌ Failed to scrape ${result.websiteUrl}: ${result.error || 'Unknown error'}`,
              'warn'
            );
          }
        }
      }

      await this.runManager.log(
        runId,
        `✅ Parallel scraping completed: ${parallelResults.successfulTasks} successful, ${parallelResults.failedTasks} failed, ${parallelResults.totalDocuments} total documents`,
        'info'
      );

      // Reset worker pool for next use
      this.scrapingWorkerPool.reset();

      // C. Google Search
      if (this.googleSearch.isConfigured()) {
        progressStreamingService.updateProgress(runId, {
          currentStep: 'Searching Google for government sources...',
          progress: 70,
        });
        const googleDocs = await this.googleSearch.searchGovernmentSources(
          params.onderwerp,
          params.thema,
          params.overheidslaag
        );
        documents.push(...googleDocs);

        // Discover new sources using DocumentProcessor
        const newSources = this.documentProcessor.discoverNewSources(googleDocs, matchingWebsites);
        suggestedSources.push(...newSources);
        
        progressStreamingService.updateProgress(runId, {
          totalDocumentsFound: documents.length,
          totalSourcesFound: matchingWebsites.length + newSources.length,
          progress: 80,
        });
      } else {
        progressStreamingService.updateProgress(runId, {
          totalDocumentsFound: documents.length,
          totalSourcesFound: matchingWebsites.length,
          progress: 80,
        });
      }

      progressStreamingService.updateProgress(runId, {
        currentStep: 'Web search completed',
        progress: 85,
        completedSteps: 2,
      });

      const existingDocs = Array.isArray(context.documents) ? context.documents : [];
      const existingSources = Array.isArray(context.suggestedSources) ? context.suggestedSources : [];
      return {
        documents: [...existingDocs, ...documents],
        suggestedSources: [...existingSources, ...suggestedSources]
      };
    });

    // 3. Analyze Graph
    this.workflowEngine.registerAction('analyzeGraph', async (context: Record<string, unknown>, runId: string) => {
        const progressStreamingService = getProgressStreamingService();
        progressStreamingService.updateProgress(runId, {
          currentStep: 'Analyzing graph clusters (semantic similarity)...',
          progress: 50,
          completedSteps: 2,
        });

        // Delegate to GraphAnalyzer
        const { relevantClusters, frontier } = await this.graphAnalyzer.analyzeGraph(context, runId);

        progressStreamingService.updateProgress(runId, {
            currentStep: `Graph analysis completed: ${relevantClusters.length} relevant clusters, ${frontier.length} URLs in frontier`,
            progress: 60,
            completedSteps: 3,
        });

        return { relevantClusters, frontier };
    });

    // 4. Recursive Crawl
    this.workflowEngine.registerAction('recursiveCrawl', async (context: Record<string, unknown>, runId: string) => {
      const frontier = context.frontier as string[] || [];
      const maxDepth = 2; // Recursive depth
      const visited = new Set<string>();
      const newDocuments: ScrapedDocument[] = [];

      await this.runManager.log(runId, `Recursieve crawl starten met frontier van ${frontier.length} URLs`, 'info');

      const progressStreamingService = getProgressStreamingService();
      progressStreamingService.updateProgress(runId, {
        currentStep: `Starting recursive crawl with ${frontier.length} URLs...`,
        progress: 65,
        completedSteps: 3,
      });

      // Simple BFS / Recursive step
      // Note: In a real "Macro-Workflow", this might be a loop of steps, but here we encapsulate the recursion
      let currentFrontier = [...frontier];

      for (let depth = 0; depth < maxDepth; depth++) {
        if (currentFrontier.length === 0) break;

        const nextFrontier: string[] = [];
        await this.runManager.log(runId, `Diepte ${depth}: ${currentFrontier.length} URLs verwerken`, 'info');
        
        progressStreamingService.updateProgress(runId, {
          currentStep: `Depth ${depth}: Processing ${currentFrontier.length} URLs...`,
          progress: 65 + (depth * 10),
        });

        // Filter out visited URLs and duplicates
        const uniqueUrls = [...new Set(currentFrontier)].filter(url => !visited.has(url));
        uniqueUrls.forEach(url => visited.add(url));

        if (uniqueUrls.length > 0) {
          // Scrape URLs that haven't been visited/scraped in this session
          // Batch scraping with concurrency limit
          const BATCH_SIZE = 5;
          const existingDocs = Array.isArray(context.documents) ? context.documents as ScrapedDocument[] : [];

          for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
            const batch = uniqueUrls.slice(i, i + BATCH_SIZE);

            const batchPromises = batch.map(async (url) => {
              // Skip if we already have this document in context or newDocuments
              if (existingDocs.some(d => d.url === url) || newDocuments.some(d => d.url === url)) {
                return;
              }

              try {
                // Only scrape page content (depth 1), as links are handled by graph exploration
                const docs = await this.websiteScraper.scrapeWebsite(
                  url,
                  context.onderwerp as string,
                  context.thema as string,
                  1
                );

                if (docs && docs.length > 0) {
                  // Filter relevant docs (usually the first one matches the URL)
                  const relevantDocs = docs.filter(d => d.url === url || d.url === url + '/' || d.url === url.replace(/\/$/, ''));
                  if (relevantDocs.length > 0) {
                      newDocuments.push(...relevantDocs);
                  } else {
                      // Fallback: add all if exact URL match not found (e.g. redirects)
                      newDocuments.push(...docs);
                  }

                  await this.runManager.log(runId, `Document geschraapt: ${url}`, 'info');
                }
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.warn({ error, url }, 'Failed to scrape URL in recursive crawl');
                await this.runManager.log(runId, `Verwerken van ${url} mislukt: ${errorMsg}`, 'warn');
              }
            });

            await Promise.all(batchPromises);
          }

          try {
            // Batch fetch all nodes in the current frontier
            const nodes = await this.navigationGraph.getNodes(uniqueUrls);
            const nodesMap = new Map(nodes.map(node => [node.url, node]));

            // Batch fetch children if adaptive traversal is enabled
            const childrenMap = new Map<string, NavigationNode>();

            if (this.adaptiveTraversalService) {
              const allChildrenUrls = new Set<string>();
              nodes.forEach(node => {
                if (node.children) {
                  node.children.forEach(childUrl => allChildrenUrls.add(childUrl));
                }
              });

              if (allChildrenUrls.size > 0) {
                const childNodes = await this.navigationGraph.getNodes(Array.from(allChildrenUrls));
                childNodes.forEach(node => childrenMap.set(node.url, node));
              }
            }

            // Process each URL
            for (const url of uniqueUrls) {
              try {
                const node = nodesMap.get(url);

                // Use adaptive traversal if enabled, otherwise use navigation graph
                if (this.adaptiveTraversalService) {
                  if (node && node.children) {
                    // Convert children to LinkContext format
                    const linkContexts: LinkContext[] = [];
                    for (const childUrl of node.children) {
                      const childNode = childrenMap.get(childUrl);
                      linkContexts.push({
                        url: childUrl,
                        linkText: childNode?.title,
                        sourceUrl: url,
                        pageTitle: childNode?.title,
                      });
                    }

                    // Use adaptive traversal to prioritize links
                    const queryText = [context.onderwerp, context.thema].filter(Boolean).join(' ');
                    const traversalUrls = await this.adaptiveTraversalService.getTraversalUrls(
                      linkContexts,
                      url,
                      {
                        queryText,
                        strategy: 'hybrid',
                        maxDepth: maxDepth - depth - 1,
                        maxLinks: 20, // Limit links per page
                      }
                    );

                    nextFrontier.push(...traversalUrls);
                  }
                } else {
                  // Fallback to simple navigation graph traversal
                  if (node && node.children) {
                    nextFrontier.push(...node.children);
                  }
                }
              } catch (e) {
                logger.error({ error: e, url }, 'Error processing URL');
              }
            }
          } catch (e) {
             logger.error({ error: e }, 'Error processing batch of URLs');
          }
        }
        currentFrontier = nextFrontier;
      }

      progressStreamingService.updateProgress(runId, {
        currentStep: `Recursive crawl completed: ${newDocuments.length} documents found`,
        progress: 85,
        completedSteps: 4,
        totalDocumentsFound: (progressStreamingService.getProgress(runId)?.totalDocumentsFound || 0) + newDocuments.length,
      });

      // Merge new documents with existing documents to ensure they are available for finalizeScan
      const existingDocs = Array.isArray(context.documents) ? context.documents as ScrapedDocument[] : [];

      return {
        documents: [...existingDocs, ...newDocuments],
        crawledDocuments: newDocuments
      };
    });

    // 5. Finalize Scan
    this.workflowEngine.registerAction('finalizeScan', async (context: Record<string, unknown>, runId: string) => {
      await this.runManager.log(runId, 'Scan afronden...', 'info');

      const allDocs = (context.documents || []) as ScrapedDocument[];

      // Validate required context properties
      if (!context.onderwerp) {
        throw new BadRequestError('Missing required context property: onderwerp', {
          reason: 'missing_onderwerp',
          operation: 'processScrapedDocuments',
          runId
        });
      }
      if (!context.queryId) {
        throw new BadRequestError('Missing required context property: queryId', {
          reason: 'missing_query_id',
          operation: 'processScrapedDocuments',
          runId
        });
      }

      // Score and Filter (with optional LLM re-ranking)
      await this.runManager.log(runId, 'Documenten scoren en filteren...', 'info');
      const scoredDocuments = await this.relevanceScorer.scoreAndFilterDocuments(
        allDocs,
        (context.onderwerp as string) || '',
        (context.thema as string) || (context.onderwerp as string) || '',
        (context.overheidslaag as string) || 'onbekend',
        3,
        true // Enable re-ranking if available
      );
      await this.runManager.log(runId, `${scoredDocuments.length} documenten gescoord (na filtering)`, 'info');

      // Populate Knowledge Graph (with workflow context for provenance)
      await this.graphManager.populateKnowledgeGraph(scoredDocuments, {
        workflowRunId: runId,
        workflowId: context.workflowId as string | undefined,
        source: 'scraper-orchestrator'
      });

      // Re-rank documents using KG insights if enabled
      let finalDocuments = scoredDocuments;
      if (FeatureFlag.isRetrievalEnabled()) {
        try {
          await this.runManager.log(runId, 'Documenten opnieuw rangschikken met KG-inzichten...', 'info');
          // Use DocumentProcessor for reranking
          finalDocuments = await this.documentProcessor.rerankWithKG(scoredDocuments, context.onderwerp as string);
          await this.runManager.log(runId, `${finalDocuments.length} documenten opnieuw gerangschikt met KG-inzichten`, 'info');
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          await this.runManager.log(runId, `KG herrangschikking mislukt: ${errorMsg}, originele scores gebruiken`, 'warn');
          logger.warn({ error }, '[ScraperOrchestrator] KG re-ranking failed, using original scores');
          // Continue with original scores if re-ranking fails
        }
      }

      // Detect orphaned files (files no longer in navigation graph)
      await this.runManager.log(runId, 'Controleren op weesbestanden in kennisbank...', 'info');
      try {
        const allNodes = await this.navigationGraph.getAllNodes();
        const knownUrls = new Set<string>(allNodes.map(node => node.url));
        
        const kbBaseDir = path.join(process.cwd(), 'data/knowledge_base');
        const kbManager = new KnowledgeBaseManager(kbBaseDir);
        
        // Optionally archive orphaned files
        const archiveDir = process.env.ARCHIVE_ORPHANED_FILES === 'true' ? 'archive' : undefined;
        const { orphaned, archived } = await kbManager.detectOrphanedFiles(knownUrls, archiveDir);
        
        if (orphaned.length > 0) {
          await this.runManager.log(
            runId,
            `Detected ${orphaned.length} orphaned file(s)${archived.length > 0 ? `, archived ${archived.length}` : ''}`,
            'warn'
          );
        } else {
          await this.runManager.log(runId, 'Geen weesbestanden gedetecteerd', 'info');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await this.runManager.log(runId, `Fout bij detecteren weesbestanden: ${errorMsg}`, 'error');
        // Don't fail the workflow if orphaned file detection fails
      }

      // Convert queryId to ObjectId if it's a string
      let queryId: ObjectId;
      if (typeof context.queryId === 'string') {
        queryId = new ObjectId(context.queryId);
      } else if (context.queryId instanceof ObjectId) {
        queryId = context.queryId;
      } else {
        throw new BadRequestError('Invalid queryId in context', {
          reason: 'invalid_query_id',
          operation: 'processScrapedDocuments',
          runId,
          queryIdType: typeof context.queryId
        });
      }

      // Convert to canonical document format (use finalDocuments which may have been re-ranked)
      // Use DocumentProcessor
      const canonicalDrafts = await this.documentProcessor.convertToCanonicalDraft(finalDocuments, queryId, runId);

      await this.runManager.log(
        runId,
        `Converting ${finalDocuments.length} scraped documents to ${canonicalDrafts.length} canonical drafts`,
        'info'
      );

      // Persist documents to canonical storage
      const canonicalDocumentService = getCanonicalDocumentService();
      let persistedCount = 0;

      for (const draft of canonicalDrafts) {
        try {
          await canonicalDocumentService.upsertBySourceId(draft, { session: undefined });
          persistedCount++;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.warn({ error, url: draft.canonicalUrl || draft.sourceId }, 'Failed to persist canonical document');
          await this.runManager.log(runId, `Document ${draft.canonicalUrl || draft.sourceId} persistentie mislukt: ${errorMsg}`, 'warn');
        }
      }

      await this.runManager.log(runId, `${persistedCount} van ${canonicalDrafts.length} documenten opgeslagen`, 'info');

      const sourcesArray = Array.isArray(context.suggestedSources) ? context.suggestedSources : [];
      // Use DocumentProcessor
      const sources = this.documentProcessor.convertToWebsiteCreateInput(sourcesArray as ScrapedSource[], queryId);

      // Construct Result
      const workflowResult = {
        summary: {
          totalProcessed: allDocs.length,
          // NOTE: newlyDiscovered tracking is handled by CanonicalDocumentService during persistence.
          // Documents are persisted above using canonical pipeline (upsertBySourceId).
          // The summary here is for workflow reporting only.
          newlyDiscovered: 0,
          existing: 0,
          errors: 0
        },
        items: [],
        endpoints: []
      };

      return {
        documents: canonicalDrafts, // Return CanonicalDocumentDraft[] directly (no conversion needed)
        suggestedSources: sources,
        workflowResult
      };
    });
  }

  // Extracted methods removed:
  // - scrapeInProductionMode (delegated to ProductionScraper)
  // - processSingleNode (delegated to ProductionScraper)
  // - scrapeInHybridMode (delegated to HybridScraper)
  // - discoverNewSources (delegated to DocumentProcessor)
  // - extractDomain (delegated to DocumentProcessor)
  // - rerankWithKG (delegated to DocumentProcessor)
  // - convertToCanonicalDraft (delegated to DocumentProcessor)
  // - convertToWebsiteCreateInput (delegated to DocumentProcessor)
  // - ensureEmbeddingProvider (delegated to GraphAnalyzer)
  // - getClusterEmbedding (delegated to GraphAnalyzer)
  // - cosineSimilarity (delegated to GraphAnalyzer)
  // - slugify (removed as it was unused)
  // - generateLabel (removed as it was unused)
  // - generateRelevanceText (removed as it was unused)

  /**
   * Main orchestration method to scan for documents
   * Iteration 68: Enhanced scan method with validation and monitoring
   */
  async scan(params: ScanParameters): Promise<ScanResult> {
    // Sleep for 250ms
    await sleep(250);

    // Iteration 69: Parameter validation
    if (!params.queryId) {
      throw new BadRequestError('Missing required parameter: queryId', {
        reason: 'missing_query_id',
        operation: 'scanKnownSources',
        params: Object.keys(params)
      });
    }
    if (!params.onderwerp || !params.thema) {
      throw new BadRequestError('Missing required parameters: onderwerp and thema', {
        reason: 'missing_onderwerp_or_thema',
        operation: 'scanKnownSources',
        params: Object.keys(params)
      });
    }

    // Iteration 70: Start time tracking
    const scanStartTime = Date.now();
    
    // Iteration 71: Mode validation and defaulting
    const mode = params.mode || 'dev';
    if (!['dev', 'prod', 'hybrid'].includes(mode)) {
      throw new BadRequestError(`Invalid mode: ${mode}. Must be 'dev', 'prod', or 'hybrid'`, {
        reason: 'invalid_mode',
        operation: 'scanKnownSources',
        mode,
        validModes: ['dev', 'prod', 'hybrid']
      });
    }

    // Iteration 72: Enhanced workflow execution with error handling
    let runId: string;
    try {
      runId = await this.workflowEngine.startWorkflow(POLICY_SCAN_WORKFLOW, params as unknown as Record<string, unknown>);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new ExternalServiceError('WorkflowEngine', `Failed to start workflow: ${errorMsg}`, {
        reason: 'workflow_start_failed',
        operation: 'scanKnownSources',
        workflow: POLICY_SCAN_WORKFLOW,
        originalError: errorMsg
      });
    }

    // Iteration 73: Enhanced polling with timeout
    const maxWaitTime = 3600000; // 1 hour max
    const pollInterval = DELAYS.LONG; // 1 second polling interval
    const startPollTime = Date.now();
    
    let run = await this.runManager.getRun(runId);
    let pollCount = 0;
    
    // Iteration 74: Polling with progress updates
    while (run && run.status === 'running') {
      if (Date.now() - startPollTime > maxWaitTime) {
        throw new ExternalServiceError('WorkflowEngine', 'Workflow execution timeout exceeded', {
          reason: 'workflow_timeout',
          operation: 'scanKnownSources',
          runId,
          maxWaitTime,
          elapsedTime: Date.now() - startPollTime
        });
      }
      
      // Iteration 75: Periodic progress logging
      if (pollCount % 30 === 0 && pollCount > 0) {
        await this.runManager.log(runId, `Still running... (${Math.floor((Date.now() - startPollTime) / 1000)}s elapsed)`, 'info');
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      run = await this.runManager.getRun(runId);
      pollCount++;
    }

      // Iteration 76: Enhanced result validation
    if (run && run.status === 'completed' && run.result) {
      const scanTime = Date.now() - scanStartTime;
      const documents = (run.result.documents || []) as CanonicalDocumentDraft[];
      const sources = (run.result.suggestedSources || []) as unknown[];
      
      // Iteration 77: Result statistics logging
      await this.runManager.log(
        runId,
        `Scan completed: ${documents.length} documents, ${sources.length} sources in ${scanTime}ms`,
        'info'
      );
      
      return {
        documents: documents, // Return CanonicalDocumentDraft[] directly (no conversion needed)
        suggestedSources: sources as BronWebsiteCreateInput[],
        progress: {
          status: 'completed' as const,
          currentStep: 'Scan completed',
          documentsFound: documents.length,
          sourcesFound: sources.length
        },
        workflowResult: run.result.workflowResult as WorkflowResult | undefined
      };
    } else {
      // Iteration 78: Enhanced error reporting
      const errorMsg = run?.error || 'Workflow failed or did not return a result';
      const status = run?.status || 'unknown';
      throw new ExternalServiceError('WorkflowEngine', `Workflow ${status}: ${errorMsg}`, {
        reason: 'workflow_failed',
        operation: 'scanKnownSources',
        runId,
        status,
        error: errorMsg
      });
    }
  }
}
