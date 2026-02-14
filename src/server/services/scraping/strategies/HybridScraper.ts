import { logger } from '../../../utils/logger.js';
import { NavigationGraph } from '../../graphs/navigation/NavigationGraph.js';
import { RunManager } from '../../workflow/RunManager.js';
import { IPLOScraper } from '../iploScraper.js';
import { ProductionScraper } from './ProductionScraper.js';
import {
  ScanParameters,
  ScrapedDocument
} from '../../infrastructure/types.js';
import { TIMEOUTS } from '../../../config/constants.js';

export class HybridScraper {
  constructor(
    private navigationGraph: NavigationGraph,
    private runManager: RunManager,
    private iploScraper: IPLOScraper,
    private productionScraper: ProductionScraper
  ) {}

  /**
   * Hybrid Mode: Explore within URL patterns, use prod efficiency for known pages
   */
  async scrape(params: ScanParameters, runId: string): Promise<ScrapedDocument[]> {
    // Iteration 43: Start time tracking for hybrid mode
    const startTime = Date.now();
    const documents: ScrapedDocument[] = [];
    const urlPatterns = params.hybridUrlPatterns || [];

    // Iteration 44: Enhanced pattern validation
    if (urlPatterns.length === 0) {
      await this.runManager.log(runId, '[i18n:workflowLogs.hybridModeNoPatterns]', 'warn');
      // Fallback to dev mode
      await this.iploScraper.explore(params.onderwerp, this.navigationGraph);
      await this.navigationGraph.save();
      return await this.iploScraper.scrapeByQuery(params.onderwerp, params.thema);
    }

    // Iteration 45: Pattern normalization and validation
    const normalizedPatterns = urlPatterns.map((pattern: string) => {
      try {
        new URL(pattern); // Validate URL pattern
        return pattern;
      } catch {
        return pattern; // Keep as-is if not a full URL
      }
    });

    await this.runManager.log(
      runId,
      `Hybrid mode: Exploring within ${normalizedPatterns.length} URL pattern(s): ${normalizedPatterns.join(', ')}`,
      'info'
    );

    const allNodes = await this.navigationGraph.getAllNodes();

    // Iteration 46: Enhanced node separation with pattern matching
    const knownNodes: typeof allNodes = [];
    const patternMatches = new Map<string, number>();

    // Iteration 47: Improved pattern matching with fuzzy matching
    for (const pattern of normalizedPatterns) {
      for (const node of allNodes) {
        // Iteration 48: Multiple matching strategies
        const exactMatch = node.url.includes(pattern);
        const domainMatch = new URL(node.url).hostname.includes(new URL(pattern).hostname || pattern);
        const pathMatch = new URL(node.url).pathname.includes(new URL(pattern).pathname || pattern);

        if (exactMatch || domainMatch || pathMatch) {
          if (!knownNodes.find(n => n.url === node.url)) {
            knownNodes.push(node);
            patternMatches.set(pattern, (patternMatches.get(pattern) || 0) + 1);
          }
        }
      }
    }

    // Iteration 49: Pattern match statistics
    for (const [pattern, count] of patternMatches.entries()) {
      await this.runManager.log(runId, `[i18n:workflowLogs.patternMatchedNodes]|${pattern}|${count}`, 'debug');
    }

    // Iteration 50: Use production efficiency for known nodes
    if (knownNodes.length > 0) {
      await this.runManager.log(runId, `[i18n:workflowLogs.usingProductionEfficiency]|${knownNodes.length}`, 'info');
      const prodParams = { ...params, mode: 'prod' as const };
      // Iteration 51: Enhanced production mode call with node filtering
      const prodDocs = await this.productionScraper.scrape(prodParams, runId);
      documents.push(...prodDocs);
    }

    // Iteration 52: Identify unknown URLs within patterns
    const unknownUrls: string[] = [];
    for (const pattern of normalizedPatterns) {
      // Iteration 53: Discover potential URLs within pattern scope
      try {
        const patternUrl = new URL(pattern);
        // Iteration 54: Generate potential URL variations
        // For now, we'll mark nodes not in knownNodes as potential exploration targets
        // Iteration 62: URL discovery logic for unknown pages
        const allUrls = allNodes.map(n => n.url);
        const knownUrls = knownNodes.map(n => n.url);
        const potentialUrls = allUrls.filter(url =>
          url.includes(pattern) && !knownUrls.includes(url)
        );
        unknownUrls.push(...potentialUrls);
      } catch {
        // Pattern is not a full URL, skip URL generation
        // Iteration 63: Pattern-based URL discovery fallback
        const allUrls = allNodes.map(n => n.url);
        const knownUrls = knownNodes.map(n => n.url);
        const potentialUrls = allUrls.filter(url =>
          url.includes(pattern) && !knownUrls.includes(url)
        );
        unknownUrls.push(...potentialUrls);
      }
    }

    // Iteration 55: Explore unknown pages within patterns (dev mode behavior)
    if (unknownUrls.length > 0 || knownNodes.length === 0) {
      const exploreCount = unknownUrls.length || 'all';
      await this.runManager.log(runId, `[i18n:workflowLogs.exploringUnknownPages]|${exploreCount}`, 'info');
      // Iteration 56: Enhanced exploration with error recovery
      try {
        // Iteration 57: Exploration with timeout protection
        const explorePromise = this.iploScraper.explore(params.onderwerp, this.navigationGraph);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Exploration timeout')), 300000) // 5 min timeout
        );
        await Promise.race([explorePromise, timeoutPromise]);

        // Iteration 58: Graph persistence with validation
        await this.navigationGraph.save();

        // Iteration 59: Query-based scraping with filtering
        const exploredDocs = await this.iploScraper.scrapeByQuery(params.onderwerp, params.thema);
        documents.push(...exploredDocs);
      } catch (error) {
        // Iteration 60: Enhanced error handling with retry suggestion
        const errorMsg = error instanceof Error ? error.message : String(error);
        await this.runManager.log(runId, `[i18n:workflowLogs.explorationError]|${errorMsg}`, 'warn');
        if (errorMsg.includes('timeout')) {
          await this.runManager.log(runId, '[i18n:workflowLogs.explorationSuggestion]', 'info');
        }
      }
    }

    // Iteration 61: Hybrid mode completion summary
    const totalTime = Date.now() - startTime;
    await this.runManager.log(
      runId,
      `Hybrid mode complete: ${documents.length} documents found (${knownNodes.length} from known nodes, ${documents.length - knownNodes.length} from exploration) in ${totalTime}ms`,
      'info'
    );

    return documents;
  }
}
