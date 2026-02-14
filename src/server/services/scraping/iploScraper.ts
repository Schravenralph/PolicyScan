import { AxiosError } from 'axios';
import { createHttpClient, HTTP_TIMEOUTS } from '../../config/httpClient.js';
import * as cheerio from 'cheerio';
import { ScrapedDocument, DocumentType, IPLOThemeMapping } from '../infrastructure/types.js';
import { computeContentHash, hasContentChanged } from '../../utils/contentHash.js';
import { rateLimiter } from '../infrastructure/rateLimiter.js';
import { htmlCache } from '../infrastructure/cache.js';
import { scraperConfig } from '../../config/scraperConfig.js';
import { NavigationGraph, type NavigationNode } from '../graphs/navigation/NavigationGraph.js';
import { MarkdownConverter } from '../ingestion/processing/MarkdownConverter.js';
import { KnowledgeBaseManager } from '../knowledgeBase/KnowledgeBaseManager.js';
import type { RunManager } from '../workflow/RunManager.js';
import * as path from 'path';
import { SemanticSimilarityService } from '../semantic/SemanticSimilarityService.js';
import { ThemeEmbeddingService } from '../ingestion/embeddings/ThemeEmbeddingService.js';
import type { AnyNode, Element } from 'domhandler';
import { logger } from '../../utils/logger.js';
import { extractNavigationNodeTitle } from '../../utils/navigationGraphUtils.js';

// Mapping of common themes to IPLO theme URLs
const IPLO_THEME_MAPPING: IPLOThemeMapping = {
  'ruimtelijke ordening': 'ruimtelijke-ontwikkelingen',
  'bouwen': 'bouw',
  'wonen': 'bouw',
  'water': 'water',
  'milieu': 'lucht',
  'bodem': 'bodem',
  'geluid': 'geluid',
  'externe veiligheid': 'externe-veiligheid',
  'energie': 'energiebesparing',
  'natuur': 'natuur',
  'klimaat': 'klimaat',
  'duurzaamheid': 'klimaat'
};

export class IPLOScraper {
  private baseUrl = 'https://iplo.nl';
  private visitedUrls: Set<string> = new Set();
  private maxDepth: number;
  private markdownConverter: MarkdownConverter;
  private kbManager: KnowledgeBaseManager;
  private semanticService: SemanticSimilarityService;
  private themeEmbeddingService: ThemeEmbeddingService;

  constructor(maxDepth: number = 2, kbBaseDir?: string) {
    this.maxDepth = maxDepth;
    this.markdownConverter = new MarkdownConverter();
    const basePath = kbBaseDir || path.join(process.cwd(), 'data/knowledge_base');
    this.kbManager = new KnowledgeBaseManager(basePath);
    this.semanticService = new SemanticSimilarityService();
    this.themeEmbeddingService = new ThemeEmbeddingService();
  }

  /**
   * Scrape IPLO based on query parameters
   * 
   * @param onderwerp - Subject/topic for search
   * @param thema - Theme/topic refinement
   * @param runManager - Optional run manager for logging
   * @param runId - Optional run ID for logging
   * @param overheidsinstantie - Optional government institution filter (filters documents by municipality/institution name)
   */
  async scrapeByQuery(onderwerp: string, thema: string, runManager?: RunManager, runId?: string, overheidsinstantie?: string): Promise<ScrapedDocument[]> {
    const documents: ScrapedDocument[] = [];
    this.visitedUrls.clear(); // Reset for each query

    const log = async (msg: string) => {
      console.log(msg);
      if (runManager && runId) {
        await runManager.log(runId, msg, 'info');
      }
    };

    // Overall timeout protection (5 minutes max per query)
    const QUERY_TIMEOUT_MS = 5 * 60 * 1000;
    const startTime = Date.now();

    const checkTimeout = async () => {
      const elapsed = Date.now() - startTime;
      if (elapsed > QUERY_TIMEOUT_MS) {
        await log(`Zoekopdracht timeout bereikt (${Math.round(elapsed / 1000)}s). ${documents.length} documenten tot nu toe gevonden teruggeven.`);
        throw new Error(`Scraping timeout after ${Math.round(elapsed / 1000)}s`);
      }
    };

    try {
      const searchQuery = `${onderwerp} ${thema}`.trim();

      // Build / load theme embeddings once and route query semantically
      await this.themeEmbeddingService.init(IPLO_THEME_MAPPING);
      await log(`Semantische themarouting: ${searchQuery}`);

      const semanticThemes = await this.themeEmbeddingService.searchThemes(searchQuery, 3);
      const similarityThreshold = 0.25;
      const selectedThemes = semanticThemes.filter((t: { score: number; slug?: string }) => t.score >= similarityThreshold);

      if (selectedThemes.length > 0) {
        const summary = selectedThemes
          .map((t: { slug?: string; score: number }) => `${t.slug || 'unknown'} (${t.score.toFixed(2)})`)
          .join(', ');
        await log(`Thema's geselecteerd via vectoren: ${summary}`);
      } else {
        await log(`Geen betrouwbare semantische themamatch (drempel: ${similarityThreshold})`);
      }

      // Fallback to mapped theme if semantic routing found nothing
      if (selectedThemes.length === 0) {
        const fallbackSlug = IPLO_THEME_MAPPING[thema.toLowerCase()];
        if (fallbackSlug) {
          await log(`Gebruik gemapt thema als fallback: ${fallbackSlug}`);
          selectedThemes.push({ slug: fallbackSlug, score: 0, url: `${this.baseUrl}/thema/${fallbackSlug}/` });
        }
      }

      // Theme-based scraping (can scrape top-N semantic matches)
      for (const themeHit of selectedThemes.slice(0, 2)) {
        await checkTimeout(); // Check timeout before each theme
        await log(`Themagebaseerd scrapen starten: ${themeHit.slug}`);
        try {
          const themeDocuments = await this.scrapeByTheme(thema, onderwerp, runManager, runId, themeHit.slug);
          documents.push(...themeDocuments);
          await log(`Thema "${themeHit.slug}" voltooid: ${themeDocuments.length} documenten gevonden (totaal: ${documents.length})`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          await log(`Fout bij scrapen thema "${themeHit.slug}": ${errorMsg}. Doorgaan met volgend thema.`);
          // Continue with next theme instead of failing completely
        }
      }

      await checkTimeout(); // Check timeout before search fallback
      const shouldFallbackToSearch = selectedThemes.length === 0 || selectedThemes[0].score < similarityThreshold;
      if (shouldFallbackToSearch) {
        await log(`Zoekgebaseerd scrapen starten (semantische score onder drempelwaarde ${similarityThreshold}) voor: ${searchQuery}`);
        const searchDocuments = await this.scrapeBySearch(searchQuery, runManager, runId);
        documents.push(...searchDocuments);
      } else {
        await log('IPLO HTML-zoekopdracht overslaan omdat semantische themamatch betrouwbaar was.');
      }

      await log(`${documents.length} documenten verwerken na themagebaseerd scrapen...`);

      // Remove duplicates based on URL
      const uniqueDocuments = this.removeDuplicates(documents);
      await log(`Duplicaten verwijderd: ${documents.length} → ${uniqueDocuments.length} unieke documenten`);

      // Add semantic similarity scores (embeddings) to capture synonyms/semantic overlap
      // Use timeout protection to prevent hanging on embedding operations
      if (uniqueDocuments.length > 0) {
          await log(`Zoeken naar vergelijkbare documenten voor ${uniqueDocuments.length} documenten...`);
        try {
          const { withTimeout } = await import('../../utils/withTimeout.js');
          const SEMANTIC_SIMILARITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes for all documents
          
          await withTimeout(
            this.semanticService.addSemanticSimilarity(uniqueDocuments, searchQuery),
            SEMANTIC_SIMILARITY_TIMEOUT_MS,
            `Adding semantic similarity to ${uniqueDocuments.length} documents`
          );
          await log('Vergelijkbare documenten gevonden');
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          const isTimeout = errorMsg.includes('timed out');
          await log(`Zoeken naar vergelijkbare documenten mislukt: ${isTimeout ? 'Timeout na 10 minuten' : errorMsg}. Doorgaan zonder vergelijking.`);
          // Continue without similarity scores - documents will still be processed
        }
      }

      // Re-rank and trim to the most semantically relevant hits
      // Only trim if we have similarity scores, otherwise keep all documents
      let trimmed = uniqueDocuments;
      const hasSimilarityScores = uniqueDocuments.some(doc => doc.semanticSimilarity !== undefined);
      if (hasSimilarityScores) {
        await log('✂️ Selecteren van meest relevante documenten...');
        trimmed = this.trimBySemanticSimilarity(uniqueDocuments, 30, runManager, runId);
        await log(`Bijgesneden naar ${trimmed.length} documenten`);
      } else {
        await log(`Geen vergelijkingsscores beschikbaar, alle ${uniqueDocuments.length} documenten behouden`);
      }

      // NOTE: IPLO is governed by "rijksoverheid" (national government), so all IPLO documents
      // are inherently from rijksoverheid regardless of the overheidsinstantie parameter.
      // Geographic filtering is not applied to IPLO documents as they are general-purpose
      // guidance documents that may not mention specific municipalities.

      await log(`${trimmed.length} IPLO documenten gevonden`);
      return trimmed;
    } catch (error) {
      console.error('Error scraping IPLO:', error);
      if (runManager && runId) {
        await runManager.log(runId, `Fout bij scrapen IPLO: ${error}`, 'error');
      }
      return documents;
    }
  }

  /**
   * Explore external links from IPLO pages (adds to navigation graph only, not knowledge graph)
   * Processes links in batches to prevent UI freezing and allow incremental updates
   */
  async exploreExternalLinks(
    graph: NavigationGraph,
    maxExternalLinks: number = 50,
    runManager?: RunManager,
    runId?: string
  ): Promise<{
    processedCount: number;
    totalCollected: number;
    iploPagesScanned: number;
    failedPages: number;
    filteredLinksCount: number;
  }> {
    const log = async (msg: string) => {
      console.log(msg);
      if (runManager && runId) {
        await runManager.log(runId, msg, 'info');
      }
    };

    const BATCH_SIZE = 1000; // Process 1000 links per batch
    const BATCH_DELAY_MS = 100; // Small delay between batches to allow UI updates

    await log('Externe linkverkenning starten vanaf IPLO...');
    
    // Get all IPLO nodes from the graph
    const allNodes = await graph.getAllNodes();
    const iploNodes = allNodes.filter((node: NavigationNode) => node.url?.startsWith(this.baseUrl) ?? false);
    
    await log(`${iploNodes.length} IPLO pagina's gevonden om te scannen voor externe links`);
    
    // First pass: Collect all external links
    const externalLinksToProcess: Array<{
      url: string;
      title: string;
      sourceUrl: string;
      iploNode: NavigationNode;
    }> = [];
    const visitedExternalUrls = new Set<string>();

    await log('Externe links verzamelen van IPLO pagina\'s...');
    
    const failedPages: Array<{ url: string; error: string }> = [];
    let filteredLinksCount = 0;
    
    for (const iploNode of iploNodes) {
      if (externalLinksToProcess.length >= maxExternalLinks) {
        break;
      }

      try {
        const html = await this.fetchPage(iploNode.url);
        const $ = cheerio.load(html);

        // Find external links
        $('a').each((_index: number, element: AnyNode) => {
          if (externalLinksToProcess.length >= maxExternalLinks) return false; // Stop iteration

          const link = $(element);
          const href = link.attr('href');
          const text = link.text().trim();

          if (href) {
            if (!this.isValidDocumentLink(href)) {
              // Track filtered links for logging
              if (!visitedExternalUrls.has(`filtered:${href}`)) {
                visitedExternalUrls.add(`filtered:${href}`);
              }
              return; // Skip invalid links
            }
            
            const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;

            // Only process external links (not IPLO)
            if (!fullUrl.startsWith(this.baseUrl) && !visitedExternalUrls.has(fullUrl)) {
              visitedExternalUrls.add(fullUrl);
              externalLinksToProcess.push({
                url: fullUrl,
                title: text || 'External Link',
                sourceUrl: iploNode.url,
                iploNode: iploNode
              });
            }
          }
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Error fetching ${iploNode.url} for external links:`, errorMsg);
        failedPages.push({ url: iploNode.url, error: errorMsg });
      }
    }

    // Count filtered links (subtract the "filtered:" prefixed entries)
    filteredLinksCount = Array.from(visitedExternalUrls).filter(u => u.startsWith('filtered:')).length;

    await log(`${externalLinksToProcess.length} externe links verzameld om te verwerken`);
    if (filteredLinksCount > 0) {
      await log(`   ${filteredLinksCount} ongeldige links uitgefilterd`);
    }
    if (failedPages.length > 0) {
      await log(`   Mislukt om ${failedPages.length} IPLO pagina's op te halen (zal opnieuw proberen als workflow opnieuw wordt uitgevoerd)`);
    }

    // Second pass: Process links in batches
    let processedCount = 0;
    const iploNodeUpdates = new Map<string, Set<string>>(); // Track new children per IPLO node URL

    for (let i = 0; i < externalLinksToProcess.length; i += BATCH_SIZE) {
      const batch = externalLinksToProcess.slice(i, Math.min(i + BATCH_SIZE, externalLinksToProcess.length));
      
      // Process batch: add external links and track IPLO node updates
      const batchPromises: Promise<void>[] = [];

      for (const linkData of batch) {
        // Add external link node with error handling
        batchPromises.push(
          graph.addNode({
            url: linkData.url,
            type: 'page',
            title: extractNavigationNodeTitle({ title: linkData.title, canonicalUrl: linkData.url }, linkData.url),
            children: [],
            sourceUrl: linkData.sourceUrl,
            lastVisited: new Date().toISOString()
          }).catch(async (err: unknown) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(`Failed to add external link ${linkData.url}:`, errorMessage);
            if (runManager && runId) {
              await runManager.log(runId, `Fout bij toevoegen externe link ${linkData.url}: ${errorMessage}`, 'warn');
            }
            // Don't re-throw - continue processing other links
          }).then(() => {}) // Convert to Promise<void>
        );

        // Track new children for IPLO node (will update after batch)
        if (!iploNodeUpdates.has(linkData.sourceUrl)) {
          iploNodeUpdates.set(linkData.sourceUrl, new Set<string>());
        }
        iploNodeUpdates.get(linkData.sourceUrl)!.add(linkData.url);
      }

      // Wait for all batch operations to complete
      await Promise.all(batchPromises);
      processedCount += batch.length;

      // Update IPLO nodes with their new children (read current state first)
      const iploUpdatePromises: Promise<void>[] = [];
      for (const [iploUrl, newChildren] of iploNodeUpdates.entries()) {
        iploUpdatePromises.push(
          (async () => {
            try {
              // Read current node from graph to preserve existing children
              const currentNode = await graph.getNode(iploUrl);
              const existingChildren = new Set(currentNode?.children || []);
              
              // Merge with new children
              for (const childUrl of newChildren) {
                existingChildren.add(childUrl);
              }

              // Update node with merged children
              await graph.addNode({
                url: iploUrl,
                type: currentNode?.type || 'page',
                title: currentNode?.title,
                children: Array.from(existingChildren),
                sourceUrl: currentNode?.sourceUrl || iploUrl,
                lastVisited: currentNode?.lastVisited || new Date().toISOString(),
                ...(currentNode?.filePath && { filePath: currentNode.filePath }),
                ...(currentNode?.schemaType && { schemaType: currentNode.schemaType }),
                ...(currentNode?.uri && { uri: currentNode.uri })
              });
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : String(err);
              console.error(`Failed to update IPLO node ${iploUrl}:`, errorMessage);
              if (runManager && runId) {
                await runManager.log(runId, `Fout bij bijwerken IPLO node ${iploUrl}: ${errorMessage}`, 'warn');
              }
            }
          })()
        );
      }
      await Promise.all(iploUpdatePromises);
      iploNodeUpdates.clear(); // Clear after processing

      // Log progress
      await log(`${processedCount}/${externalLinksToProcess.length} externe links verwerkt (${Math.round((processedCount / externalLinksToProcess.length) * 100)}%)`);

      // Small delay to allow UI to update
      if (i + BATCH_SIZE < externalLinksToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    await log(`Externe linkverkenning voltooid. ${processedCount} externe links verwerkt.`);
    
    // Return stats for verification
    return {
      processedCount,
      totalCollected: externalLinksToProcess.length,
      iploPagesScanned: iploNodes.length,
      failedPages: failedPages.length,
      filteredLinksCount
    };
  }

  /**
   * Explore IPLO to build navigation graph (Dev Mode)
   */
  async explore(
    onderwerp: string,
    graph: NavigationGraph,
    runManager?: RunManager,
    runId?: string,
    options: { targetScope?: Set<string>, randomness?: number, signal?: AbortSignal } = {}
  ): Promise<void> {
    const log = async (msg: string) => {
      console.log(msg);
      if (runManager && runId) {
        await runManager.log(runId, msg, 'info');
      }
    };

    await log('Verkenning van IPLO starten...');
    if (options.targetScope) {
      await log(`Gerichte verkenning actief. Scope grootte: ${options.targetScope.size}`);
    }
    if (options.randomness) {
      await log(`Waarschijnlijkheidsverkenning actief. Willekeur: ${options.randomness}`);
    }

    // Check for cancellation
    if (options.signal?.aborted) {
      throw new Error('Workflow cancelled');
    }

    this.visitedUrls.clear();

    // Start with the main theme page if possible
    const startUrl = `${this.baseUrl}/thema/`;
    await graph.setRoot(startUrl);

    await this.explorePage(startUrl, graph, 0, runManager, runId, options);
    await log('Verkenning voltooid.');
  }

  /**
   * Extract entities from a page with retry logic for transient failures
   * Returns extraction results, or zero stats if all retries fail
   */
  private async extractEntitiesWithRetry(
    url: string,
    title: string,
    html: string,
    graph: NavigationGraph,
    log: (msg: string) => Promise<void>
  ): Promise<{ entitiesExtracted: number; relationshipsExtracted: number }> {
    const maxRetries = 2;
    const baseDelay = 1000; // 1 second
    const heartbeatThreshold = 5000; // 5 seconds - log heartbeat if extraction takes longer
    const retryableErrors = [
      'timeout',
      'connection',
      'network',
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'not initialized',
      'temporary',
      'rate limit'
    ];

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { GraphManager } = await import('../scraping/GraphManager.js');
        const { RelationshipExtractionService } = await import('../extraction/RelationshipExtractionService.js');
        const { FeatureFlag } = await import('../../models/FeatureFlag.js');
        
        // Initialize relationship extraction service if enabled
        // Note: EntityExtractionService is no longer needed - GraphManager uses PolicyParser internally
        const relationshipExtractionService = FeatureFlag.isRelationshipExtractionEnabled()
          ? new RelationshipExtractionService()
          : undefined;
        
        // Create GraphManager (uses PolicyParser internally for entity extraction)
        const graphManager = new GraphManager(
          graph,
          relationshipExtractionService
        );
        
        // Start heartbeat timer for long-running extractions
        const extractionStartTime = Date.now();
        let heartbeatLogged = false;
        const heartbeatTimer = setTimeout(async () => {
          if (!heartbeatLogged) {
            heartbeatLogged = true;
            await log(`Entiteiten extraheren van ${url} (nog bezig...)`);
          }
        }, heartbeatThreshold);
        
        try {
          // Extract entities from the page
          const result = await graphManager.extractEntitiesFromPage(
            url,
            title,
            html,
            url // websiteUrl
          );
          
          clearTimeout(heartbeatTimer);
          
          // Log timing if extraction took significant time
          const extractionDuration = Date.now() - extractionStartTime;
          if (extractionDuration > 3000) {
            logger.debug({ url, duration: extractionDuration }, 'Entity extraction completed with timing info');
          }
          
          // Success - return result
          return result;
        } catch (extractionError) {
          clearTimeout(heartbeatTimer);
          throw extractionError;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMsg = lastError.message.toLowerCase();
        
        // Check if error is retryable
        const isRetryable = retryableErrors.some(retryableError => 
          errorMsg.includes(retryableError.toLowerCase())
        );
        
        // If not retryable or max retries reached, return zero stats
        if (!isRetryable || attempt >= maxRetries) {
          logger.warn({ 
            url, 
            error: lastError.message,
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
            retryable: isRetryable
          }, 'Failed to extract entities for knowledge graph during IPLO exploration');
          return { entitiesExtracted: 0, relationshipsExtracted: 0 };
        }
        
        // Retry with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        logger.debug({ 
          url, 
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          delay,
          error: lastError.message
        }, 'Retrying entity extraction after transient failure');
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Should not reach here, but return zero stats as fallback
    return { entitiesExtracted: 0, relationshipsExtracted: 0 };
  }

  /**
   * Recursively explore pages and build graph
   * Returns extraction statistics for this page and its children
   */
  private async explorePage(
    url: string,
    graph: NavigationGraph,
    depth: number,
    runManager?: RunManager,
    runId?: string,
    options: { targetScope?: Set<string>, randomness?: number, signal?: AbortSignal } = {}
  ): Promise<{ entitiesExtracted: number; relationshipsExtracted: number; pagesExplored: number }> {
    // Check for cancellation
    if (options.signal?.aborted) {
      throw new Error('Workflow cancelled');
    }

    // Initialize stats
    let entitiesExtracted = 0;
    let relationshipsExtracted = 0;
    let pagesExplored = 0;

    if (depth > this.maxDepth || this.visitedUrls.has(url)) {
      return { entitiesExtracted: 0, relationshipsExtracted: 0, pagesExplored: 0 };
    }

    const log = async (msg: string) => {
      console.log(msg);
      if (runManager && runId) {
        await runManager.log(runId, msg, 'info');
      }
    };

    // Check if we should skip this page based on targeting
    // But always explore the root and shallow levels to find the target
    if (depth > 1 && options.targetScope && !options.targetScope.has(url)) {
      // If outside scope, apply randomness check
      const randomness = options.randomness || 0;
      if (Math.random() > randomness) {
        // Skip this page (it's outside scope and didn't win the lottery)
        return { entitiesExtracted: 0, relationshipsExtracted: 0, pagesExplored: 0 };
      }
      await log(`Buiten-bereik pagina verkennen: ${url}`);
    } else {
      this.visitedUrls.add(url);
      await log(`Verkennen: ${url} (Diepte: ${depth})`);
    }

    try {
      const html = await this.fetchPage(url);
      const $ = cheerio.load(html);
      const title = $('title').text().trim();

      // Convert to Markdown and save
      const metadata = this.markdownConverter.extractMetadata(html, url);
      
      // Extract parent_topic from URL if it's a theme page
      // Example: https://iplo.nl/thema/water/ -> parent_topic: "Water"
      const themeMatch = url.match(/\/thema\/([^/]+)/);
      if (themeMatch) {
        const themeSlug = themeMatch[1];
        // Map slug back to readable theme name
        const themeName = Object.entries(IPLO_THEME_MAPPING).find(
          ([, slug]) => slug === themeSlug
        )?.[0];
        if (themeName) {
          // Capitalize first letter
          metadata.parent_topic = themeName.charAt(0).toUpperCase() + themeName.slice(1);
        } else {
          // Fallback: capitalize slug
          metadata.parent_topic = themeSlug.charAt(0).toUpperCase() + themeSlug.slice(1);
        }
      }
      
      const markdown = this.markdownConverter.convert(html);
      const { filePath } = await this.kbManager.savePage(metadata, markdown);

      // Add current node to graph with error handling
      try {
        await graph.addNode({
          url,
          type: String(this.determineDocumentType(url)) === 'Webpagina' ? 'page' : 'document',
          title: extractNavigationNodeTitle({ title: title || undefined, canonicalUrl: url }, url),
          filePath,
          children: [],
          lastVisited: new Date().toISOString()
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await log(`Toevoegen node ${url} aan navigatiegrafiek mislukt: ${errorMsg}`);
        throw error; // Re-throw to ensure error is not silently swallowed
      }

      // Extract links from the page
      const currentNode = await graph.getNode(url);
      const links: string[] = [];
      const linkData: Array<{ url: string; text: string; xpath: string }> = [];
      
      // Standard link extraction
      // Note: Pattern learning is now handled by NavigationPatternLearningService in ScraperOrchestrator
      $('a').each((_index: number, element: AnyNode) => {
        const link = $(element);
        const href = link.attr('href');
        const text = link.text().trim();

        if (href && this.isValidDocumentLink(href)) {
          const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;

          // Only follow internal links
          if (fullUrl.startsWith(this.baseUrl)) {
            // Avoid duplicates
            if (!links.includes(fullUrl)) {
              links.push(fullUrl);
              linkData.push({
                url: fullUrl,
                text: text || 'Untitled',
                xpath: this.generateXPath(element)
              });
            }
          }
        }
      });

      // US-010: Add child nodes to graph with XPath information
      for (const linkInfo of linkData) {
        try {
          const existingNode = await graph.getNode(linkInfo.url);
          if (!existingNode) {
            await graph.addNode({
              url: linkInfo.url,
              type: String(this.determineDocumentType(linkInfo.url)) === 'Webpagina' ? 'page' : 'document',
              title: extractNavigationNodeTitle({ title: linkInfo.text || undefined, canonicalUrl: linkInfo.url }, linkInfo.url),
              children: [],
              xpaths: {
                link: linkInfo.xpath
              }
            });
          } else {
            // US-010: Merge XPaths if node already exists (preserve existing, add new)
            const existingXpaths = existingNode.xpaths || {};
            await graph.addNode({
              ...existingNode,
              xpaths: {
                ...existingXpaths,
                link: linkInfo.xpath // Update with latest XPath
              }
            });
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          await log(`Toevoegen kindnode ${linkInfo.url} aan navigatiegrafiek mislukt: ${errorMsg}`);
          // Continue processing other links even if one fails
        }
      }

      // US-010: Update current node with children and navigation XPaths
      if (currentNode) {
        try {
          // Store XPaths for navigation elements found on this page
          const navigationXpaths: Record<string, string> = {};
          linkData.forEach((linkInfo, index) => {
            // Store XPath with a key that identifies the link
            const linkKey = `child_${index}`;
            navigationXpaths[linkKey] = linkInfo.xpath;
          });
          
          currentNode.children = links;
          currentNode.xpaths = {
            ...(currentNode.xpaths || {}),
            ...navigationXpaths
          };
          const result = await graph.addNode(currentNode);
          if (result === 'added' || result === 'updated') {
            await log(`Node ${url} opgeslagen met ${links.length} kinderen in navigatiegrafiek`);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          await log(`Updaten node ${url} met kinderen in navigatiegrafiek mislukt: ${errorMsg}`);
          throw error; // Re-throw to ensure error is not silently swallowed
        }
      }

      // Extract entities from the page and add to knowledge graph
      // Use retry logic for transient failures (network issues, timeouts, etc.)
      // Optimization: Skip extraction for index/navigation pages with many children but likely little content
      // Pages with 50+ children are typically index pages and extraction may be slow/not valuable
      const shouldSkipExtraction = links.length > 50;
      
      const extractionStartTime = Date.now();
      let extractionResult = { entitiesExtracted: 0, relationshipsExtracted: 0 };
      
      if (shouldSkipExtraction) {
        logger.debug({ url, childCount: links.length }, 'Skipping entity extraction for index page with many children');
        // Still log that we're skipping to show progress
        await log(`Entiteiten extractie overgeslagen voor indexpagina ${url} (${links.length} kinderen)`);
      } else {
        await log(`Entiteiten extraheren van ${url}...`);
        
        extractionResult = await this.extractEntitiesWithRetry(
          url,
          title,
          html,
          graph,
          log
        );
      }
      
      const extractionDuration = Date.now() - extractionStartTime;
      
      // Track extraction stats for this page
      entitiesExtracted += extractionResult.entitiesExtracted;
      relationshipsExtracted += extractionResult.relationshipsExtracted;
      pagesExplored += 1;
      
      // Always log extraction result (even if 0 entities or skipped) to show progress
      if (extractionResult.entitiesExtracted > 0 || extractionResult.relationshipsExtracted > 0) {
        await log(`${extractionResult.entitiesExtracted} entiteiten en ${extractionResult.relationshipsExtracted} relaties geëxtraheerd van ${url}`);
      } else if (!shouldSkipExtraction) {
        // Log completion even if no entities extracted, with timing info
        await log(`Entiteiten extractie voltooid voor ${url} (${extractionDuration}ms)`);
      }

      // Prioritize links:
      // 1. In-scope links
      // 2. Out-of-scope links (if randomness allows)

      const linksToFollow = links.filter(link => {
        if (!options.targetScope) return true; // No targeting, follow all
        const inScope = options.targetScope.has(link);
        if (inScope) return true; // In scope

        const randomVal = Math.random();
        const threshold = options.randomness || 0;
        const lucky = randomVal < threshold;

        // console.log(`Filter: ${link} | Scope: ${inScope} | Random: ${randomVal} < ${threshold} = ${lucky}`);
        return lucky; // Chance to follow out of scope
      });

      // Recursively explore children and accumulate stats
      if (linksToFollow.length > 0) {
        await log(`Verkennen van ${linksToFollow.length} kinderen van ${url}...`);
        
        const explorationStartTime = Date.now();
        for (let index = 0; index < linksToFollow.length; index++) {
          const link = linksToFollow[index];
          
          // Check for cancellation before each recursive call
          if (options.signal?.aborted) {
            throw new Error('Workflow cancelled');
          }
          
          // Log progress every 10 children or for the first/last child
          if (index === 0 || (index + 1) % 10 === 0 || index === linksToFollow.length - 1) {
            await log(`Kind ${index + 1}/${linksToFollow.length} verkennen...`);
          }
          
          const childStats = await this.explorePage(link, graph, depth + 1, runManager, runId, options);
          entitiesExtracted += childStats.entitiesExtracted;
          relationshipsExtracted += childStats.relationshipsExtracted;
          pagesExplored += childStats.pagesExplored;
        }
        
        const explorationDuration = Date.now() - explorationStartTime;
        if (explorationDuration > 5000) {
          await log(`Verkennen van ${linksToFollow.length} kinderen voltooid voor ${url} (${explorationDuration}ms)`);
        }
      }

      // Return accumulated stats
      return { entitiesExtracted, relationshipsExtracted, pagesExplored };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`Error exploring ${url}:`, error);
      if (runManager && runId) {
        await runManager.log(runId, `Fout bij verkennen ${url}: ${errorMsg}`, 'error');
        if (errorStack) {
          await runManager.log(runId, `Stack trace: ${errorStack}`, 'debug');
        }
      }
      // Return stats collected so far even on error (don't lose progress)
      return { entitiesExtracted, relationshipsExtracted, pagesExplored };
    }
  }

  /**
   * Generate XPath for an element (US-010: Extract and store XPaths for navigation)
   * 
   * This method generates XPath selectors for navigation elements to enable
   * efficient navigation in production mode. The XPaths are stored in the
   * navigation graph for later use.
   */
  private generateXPath(element: AnyNode): string {
    // US-010: Enhanced XPath generation for navigation patterns
    // This is a simplified XPath generator for Cheerio elements
    // In a real browser context, we'd use a more robust method
    try {
      // Check if element is an Element type (has attribs)
      if (element.type !== 'tag' || !('attribs' in element)) {
        return '';
      }
      
      const elementWithAttribs = element as Element;
      const attribs = elementWithAttribs.attribs as Record<string, string> | undefined;
      if (!attribs) return '';
      
      // Priority 1: ID attribute (most specific)
      if (attribs.id) {
        return `//*[@id="${attribs.id}"]`;
      }
      
      // Priority 2: Class attribute (if unique enough)
      if (attribs.class) {
        const classes = attribs.class.split(/\s+/).filter(c => c);
        if (classes.length > 0) {
          // Use the first class, or combine if multiple
          const classSelector = classes.length === 1 
            ? `@class="${classes[0]}"` 
            : `contains(@class, "${classes[0]}")`;
          return `//*[${classSelector}]`;
        }
      }
      
      // Priority 3: Href attribute for links
      if (attribs.href) {
        // For links, try to create a more specific XPath
        const tagName = elementWithAttribs.name || 'a';
        if (attribs.class) {
          const classes = attribs.class.split(/\s+/).filter(c => c);
          if (classes.length > 0) {
            return `//${tagName}[contains(@class, "${classes[0]}") and @href="${attribs.href}"]`;
          }
        }
        return `//${tagName}[@href="${attribs.href}"]`;
      }
      
      // Priority 4: Tag name with text content (if available)
      const tagName = elementWithAttribs.name;
      if (tagName) {
        return `//${tagName}`;
      }
      
      return '';
    } catch {
      return '';
    }
  }

  /**
   * Scrape IPLO theme pages with depth-limited crawling
   */
  private async scrapeByTheme(
    thema: string,
    onderwerp: string,
    runManager?: RunManager,
    runId?: string,
    slugOverride?: string
  ): Promise<ScrapedDocument[]> {
    const documents: ScrapedDocument[] = [];

    // Map theme to IPLO URL
    const themaKey = thema.toLowerCase();
    const iploTheme = slugOverride || IPLO_THEME_MAPPING[themaKey];

    if (!iploTheme) {
      const msg = `No IPLO theme mapping found for: ${thema}`;
      console.log(msg);
      if (runManager && runId) await runManager.log(runId, msg, 'warn');
      return documents;
    }

    const themeUrl = `${this.baseUrl}/thema/${iploTheme}/`;

    // Add timeout protection (2 minutes max per theme)
    const THEME_CRAWL_TIMEOUT_MS = 2 * 60 * 1000;
    const startTime = Date.now();

    // Crawl with depth limit and timeout
    const crawledDocs = await this.crawlPage(themeUrl, onderwerp, 0, runManager, runId, {
      startTime,
      maxCrawlTime: THEME_CRAWL_TIMEOUT_MS
    });
    documents.push(...crawledDocs);

    const elapsed = Date.now() - startTime;
    const msg = `Found ${documents.length} documents from IPLO theme: ${iploTheme} (took ${Math.round(elapsed / 1000)}s)`;
    console.log(msg);
    if (runManager && runId) await runManager.log(runId, msg, 'info');

    return documents;
  }

  /**
   * Crawl a page and follow links up to maxDepth
   */
  private async crawlPage(
    url: string,
    onderwerp: string,
    depth: number,
    runManager?: RunManager,
    runId?: string,
    options: { targetScope?: Set<string>, randomness?: number, startTime?: number, maxCrawlTime?: number } = {}
  ): Promise<ScrapedDocument[]> {
    // Check timeout if provided
    if (options.startTime && options.maxCrawlTime) {
      const elapsed = Date.now() - options.startTime;
      if (elapsed > options.maxCrawlTime) {
        const log = async (msg: string) => {
          console.log(msg);
          if (runManager && runId) {
            await runManager.log(runId, msg, 'warn');
          }
        };
        await log(`Crawl timeout bereikt (${Math.round(elapsed / 1000)}s). Crawl stoppen op diepte ${depth}.`);
        return [];
      }
    }

    if (depth > this.maxDepth || this.visitedUrls.has(url)) {
      return [];
    }

    // Targeting check
    if (depth > 1 && options.targetScope && !options.targetScope.has(url)) {
      if (Math.random() > (options.randomness || 0)) {
        return [];
      }
    }

    this.visitedUrls.add(url);
    const documents: ScrapedDocument[] = [];

    if (runManager && runId) {
      await runManager.log(runId, `Crawlen: ${url} (Diepte: ${depth})`, 'info');
    }

    try {
      const html = await this.fetchPage(url);
      const $ = cheerio.load(html);

      // Extract documents from current page
      const pageDocs = this.extractDocuments($, url, onderwerp);
      documents.push(...pageDocs);

      if (runManager && runId && pageDocs.length > 0) {
        await runManager.log(runId, `${pageDocs.length} documenten gevonden op ${url}`, 'info');
      }

      // If we haven't reached max depth, follow relevant links
      if (depth < this.maxDepth) {
        const links = this.extractRelevantLinks($, url, onderwerp);

        // Limit links per page to avoid explosion
        const limitedLinks = links.slice(0, 5);

        if (runManager && runId && limitedLinks.length > 0) {
          await runManager.log(runId, `${limitedLinks.length} links volgen van ${url}`, 'info');
        }

        for (const link of limitedLinks) {
          // Check timeout before each recursive call
          if (options.startTime && options.maxCrawlTime) {
            const elapsed = Date.now() - options.startTime;
            if (elapsed > options.maxCrawlTime) {
              break; // Stop following links if timeout reached
            }
          }
          const childDocs = await this.crawlPage(link, onderwerp, depth + 1, runManager, runId, options);
          documents.push(...childDocs);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Error crawling ${url}:`, errorMsg);
      if (runManager && runId) {
        await runManager.log(runId, `Fout bij crawlen ${url}: ${errorMsg}`, 'warn');
      }
    }

    return documents;
  }

  /**
   * Extract documents from a page
   */
  private extractDocuments($: cheerio.CheerioAPI, pageUrl: string, onderwerp: string): ScrapedDocument[] {
    const documents: ScrapedDocument[] = [];

    // Extract PDF links (improved selector coverage)
    $('a[href$=".pdf"], a[href*=".pdf?"], a[href*=".pdf#"]').each((_index: number, element: AnyNode) => {
      const link = $(element);
      const href = link.attr('href');
      const text = link.text().trim();

      if (href) {
        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
        // Improved context extraction with more parent selectors
        const context = link.closest('p, li, div, article, section, .content, .summary, .document').text().trim().substring(0, 250);

        const doc = {
          titel: text || 'PDF Document',
          url: fullUrl,
          website_url: this.baseUrl,
          website_titel: 'IPLO - Informatiepunt Leefomgeving',
          samenvatting: context || text,
          type_document: 'PDF' as DocumentType,
          publicatiedatum: this.extractDate($, link),
          sourceType: 'iplo' as const,
          authorityLevel: 'national' as const
        };

        // Validate document before adding
        if (this.isValidDocument(doc)) {
          documents.push(doc);
        }
      }
    });

    // Extract article/page links (potential documents)
    // Improved selectors for better coverage
    $('article a, .content a, main a, .main-content a, section a, .article-content a, [role="article"] a').each((_index: number, element: AnyNode) => {
      const link = $(element);
      const href = link.attr('href');
      const text = link.text().trim();

      if (href && text && this.isValidDocumentLink(href) && this.isRelevant(text, onderwerp)) {
        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;

        // Skip if already added as PDF
        if (fullUrl.endsWith('.pdf')) return;

        // Improved context extraction with more parent selectors
        const context = link.closest('p, li, div, article, section, .content, .summary').text().trim().substring(0, 200);

        const doc = {
          titel: text,
          url: fullUrl,
          website_url: this.baseUrl,
          website_titel: 'IPLO - Informatiepunt Leefomgeving',
          samenvatting: context || text,
          type_document: this.determineDocumentType(fullUrl),
          publicatiedatum: this.extractDate($, link),
          sourceType: 'iplo' as const,
          authorityLevel: 'national' as const
        };

        // Validate document before adding
        if (this.isValidDocument(doc)) {
          documents.push(doc);
        }
      }
    });

    return documents;
  }

  /**
   * Extract relevant links for crawling
   * Improved selectors for better coverage
   */
  private extractRelevantLinks($: cheerio.CheerioAPI, baseUrl: string, onderwerp: string): string[] {
    const links: string[] = [];

    // Improved selectors for better link extraction
    $('article a, .content a, main a, .main-content a, section a, .article-content a, [role="article"] a').each((_index: number, element: AnyNode) => {
      const link = $(element);
      const href = link.attr('href');
      const text = link.text().trim();

      if (href && this.isValidDocumentLink(href) && this.isRelevant(text, onderwerp)) {
        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;

        // Only follow IPLO links
        if (fullUrl.startsWith(this.baseUrl) && !fullUrl.endsWith('.pdf')) {
          links.push(fullUrl);
        }
      }
    });

    return Array.from(new Set(links)); // Deduplicate
  }

  /**
   * Add content hash to scraped documents for change detection
   * Computes SHA-256 hash based on document title, summary, and URL
   * 
   * @param documents Scraped documents to enrich with content hashes
   * @returns Documents with contentHash field added
   */
  addContentHashes(documents: ScrapedDocument[]): Array<ScrapedDocument & { contentHash: string }> {
    return documents.map(doc => ({
      ...doc,
      contentHash: computeContentHash(doc.titel, doc.samenvatting, doc.url)
    }));
  }

  /**
   * Detect content changes by comparing new document hashes with existing documents
   * 
   * @param newDocuments Documents with content hashes
   * @param existingDocuments Existing documents from database (with contentHash field)
   * @param runManager Optional run manager for logging
   * @param runId Optional run ID for logging
   * @returns Array of documents that have changed, with change notifications logged
   */
  async detectContentChanges(
    newDocuments: Array<ScrapedDocument & { contentHash: string }>,
    existingDocuments: Array<{ url: string; contentHash?: string | null; titel?: string }>,
    runManager?: RunManager,
    runId?: string
  ): Promise<Array<ScrapedDocument & { contentHash: string; changed: boolean }>> {
    const log = async (msg: string) => {
      logger.info({ runId }, msg);
      if (runManager && runId) {
        await runManager.log(runId, msg, 'info');
      }
    };

    // Create a map of existing documents by URL for fast lookup
    const existingByUrl = new Map<string, { contentHash?: string | null; titel?: string }>();
    existingDocuments.forEach(doc => {
      existingByUrl.set(doc.url, doc);
    });

    const results: Array<ScrapedDocument & { contentHash: string; changed: boolean }> = [];
    let changeCount = 0;

    for (const newDoc of newDocuments) {
      const existing = existingByUrl.get(newDoc.url);
      const changed = hasContentChanged(newDoc.contentHash, existing?.contentHash);
      
      if (changed && existing) {
        changeCount++;
        await log(`Inhoudswijziging gedetecteerd voor document: ${newDoc.titel} (${newDoc.url})`);
      }

      results.push({
        ...newDoc,
        changed
      });
    }

    if (changeCount > 0) {
      await log(`Totaal documenten met inhoudswijzigingen: ${changeCount}`);
    }

    return results;
  }

  /**
   * Check if text is relevant to onderwerp
   * Handles multi-word queries by checking if any significant word matches
   */
  private isRelevant(text: string, onderwerp: string): boolean {
    const textLower = text.toLowerCase();
    const onderwerpLower = onderwerp.toLowerCase().trim();

    // Exact phrase match (highest priority)
    if (textLower.includes(onderwerpLower)) {
      return true;
    }

    // For multi-word queries, check if any significant word matches
    // Split query into words and filter out common stop words
    const stopWords = ['algemeen', 'de', 'het', 'een', 'van', 'voor', 'met', 'op', 'in', 'aan', 'bij', 'over', 'onder'];
    const queryWords = onderwerpLower
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));

    // If any significant word from the query appears in the text, consider it relevant
    if (queryWords.length > 0) {
      const hasMatchingWord = queryWords.some(word => textLower.includes(word));
      if (hasMatchingWord) {
        return true;
      }
    }

    // Check against relevant keywords (policy document terms)
    return scraperConfig.relevantKeywords.some(keyword => textLower.includes(keyword));
  }

  /**
   * Extract date from context
   */
  private extractDate($: cheerio.CheerioAPI, element: cheerio.Cheerio<AnyNode>): string | null {
    const timeEl = element.closest('article, div').find('time');
    if (timeEl.length > 0) {
      return timeEl.attr('datetime') || timeEl.text().trim() || null;
    }
    return null;
  }

  /**
   * Fetch page with rate limiting and caching
   */
  private async fetchPage(url: string, retries: number = 3): Promise<string> {
    // Check cache
    const cached = htmlCache.getSync(url);
    if (cached !== undefined) {
      return cached;
    }

    // Rate limit
    await rateLimiter.acquire(url);

    const startTime = Date.now();
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Fetch with exponential backoff
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10s
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Migrated from direct axios usage to centralized client (WI-377)
        const httpClient = createHttpClient({
          timeout: scraperConfig.timeout || HTTP_TIMEOUTS.STANDARD,
        });
        const response = await httpClient.get(url, {
          headers: {
            'User-Agent': scraperConfig.userAgent
          }
        });

        const responseTime = Date.now() - startTime;
        
        // Record successful request for adaptive rate limiting
        rateLimiter.recordResult({
          url,
          success: true,
          statusCode: response.status,
          responseTime
        });

        // Cache successful response
        void htmlCache.set(url, response.data);
        rateLimiter.release(url);
        return response.data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const statusCode = error instanceof AxiosError ? error.response?.status : undefined;
        const responseTime = Date.now() - startTime;
        
        // Don't retry on 4xx errors (except 429)
        if (statusCode !== undefined && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
          // Record failed request for adaptive rate limiting
          rateLimiter.recordResult({
            url,
            success: false,
            statusCode,
            responseTime,
            error: lastError
          });
          
          rateLimiter.release(url);
          throw lastError;
        }
        
        // Log retry attempt
        if (attempt < retries - 1) {
          console.warn(`Retry ${attempt + 1}/${retries} for ${url}: ${lastError.message}`);
        }
      }
    }

    // Record final failure if all retries exhausted
    const responseTime = Date.now() - startTime;
    const finalStatusCode = lastError instanceof AxiosError ? lastError.response?.status : undefined;
    rateLimiter.recordResult({
      url,
      success: false,
      statusCode: finalStatusCode,
      responseTime,
      error: lastError || new Error(`Failed to fetch ${url} after ${retries} attempts`)
    });

    rateLimiter.release(url);
    throw lastError || new Error(`Failed to fetch ${url} after ${retries} attempts`);
  }

  /**
   * Scrape IPLO using search functionality
   * Improved to handle multiple selector patterns and filter by relevance
   */
  private async scrapeBySearch(query: string, runManager?: RunManager, runId?: string): Promise<ScrapedDocument[]> {
    const documents: ScrapedDocument[] = [];

    try {
      // IPLO search URL
      const searchUrl = `${this.baseUrl}/zoeken/?q=${encodeURIComponent(query)}`;

      if (runManager && runId) {
        await runManager.log(runId, `IPLO doorzoeken: ${searchUrl}`, 'info');
      }

      const html = await this.fetchPage(searchUrl);
      const $ = cheerio.load(html);

      // Try multiple selector patterns for IPLO search results
      // IPLO may use different structures, so we try common patterns
      // Improved selectors for better coverage and accuracy
      const selectors = [
        // Specific IPLO search result patterns (most specific first)
        '.search-result',
        '.result-item',
        '.search-results article',
        '.search-results .result',
        '.search-results li',
        'article.search-result',
        'li.search-result',
        // Content area patterns
        '.content article',
        '.content .result',
        'main article',
        'main .result',
        // Generic patterns (fallback)
        'article',
        '.result',
        // List-based patterns
        'ul.search-results li',
        'ol.search-results li',
        '.results-list li',
        // Card/container patterns
        '.card',
        '.item',
        '[class*="result"]',
        '[class*="search"]'
      ];

      const seenUrls = new Set<string>();

      for (const selector of selectors) {
        $(selector).each((_index: number, element: AnyNode) => {
          const result = $(element);
          
          // Try multiple ways to find the title link (improved with more patterns)
          let titleLink: cheerio.Cheerio<AnyNode> = result.find('a').first();
          if (titleLink.length === 0) {
            titleLink = result.find('h1 a, h2 a, h3 a, h4 a').first();
          }
          if (titleLink.length === 0) {
            titleLink = result.closest('a');
          }
          if (titleLink.length === 0) {
            // Try finding any link within the result
            titleLink = result.find('[href]').first();
          }

          // Improved title extraction with multiple fallbacks
          const title = titleLink.text().trim() || 
                       result.find('h1, h2, h3, h4, h5').first().text().trim() ||
                       result.find('.title, .heading, [class*="title"]').first().text().trim() ||
                       result.text().trim().split('\n')[0].trim() ||
                       result.text().trim().substring(0, 100).trim();
          
          // Improved URL extraction with more fallback patterns
          let url = titleLink.attr('href');
          if (!url) {
            // Try to find URL in parent link or data attributes
            url = result.closest('a').attr('href') || 
                  result.attr('data-url') || 
                  result.attr('data-href') ||
                  result.find('[data-url]').attr('data-url') ||
                  result.find('[data-href]').attr('data-href') ||
                  result.find('[href]').first().attr('href');
          }

          // Improved snippet/description extraction with more patterns
          const snippet = result.find('.snippet, .description, .summary, .excerpt, .intro, .lead').first().text().trim() ||
                         result.find('p').first().text().trim() ||
                         result.find('.content p').first().text().trim() ||
                         result.text().trim().substring(title.length).trim().substring(0, 200);

          if (url && title && title.length > 0) {
            const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;

            // Skip duplicates
            if (seenUrls.has(fullUrl)) {
              return;
            }
            seenUrls.add(fullUrl);

            // Filter by relevance - only include documents that match the query
            // Use the query itself for relevance check (it may contain multiple words)
            const combinedText = `${title} ${snippet}`.toLowerCase();
            if (this.isRelevant(combinedText, query)) {
              const doc = {
                titel: title,
                url: fullUrl,
                website_url: this.baseUrl,
                website_titel: 'IPLO - Informatiepunt Leefomgeving',
                samenvatting: snippet || title,
                type_document: this.determineDocumentType(fullUrl),
                publicatiedatum: this.extractDate($, result),
                sourceType: 'iplo' as const,
                authorityLevel: 'national' as const
              };

              // Validate document before adding
              if (this.isValidDocument(doc)) {
                documents.push(doc);
              }
            }
          }
        });

        // If we found results with this selector, break (avoid duplicates)
        if (documents.length > 0) {
          break;
        }
      }

      // Fallback: if no results found with specific selectors, try extracting all links
      // that might be search results (less precise but catches more)
      if (documents.length === 0) {
        $('a[href*="/thema/"], a[href*="/regelgeving/"], a[href*="/documenten/"]').each((_index: number, element: AnyNode) => {
          const link = $(element);
          const href = link.attr('href');
          const title = link.text().trim();
          const parent = link.closest('li, div, article');
          const snippet = parent.find('p').first().text().trim() || title;

          if (href && title && title.length > 5) {
            const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
            
            if (seenUrls.has(fullUrl)) {
              return;
            }
            seenUrls.add(fullUrl);

            const combinedText = `${title} ${snippet}`.toLowerCase();
            if (this.isRelevant(combinedText, query)) {
              const doc = {
                titel: title,
                url: fullUrl,
                website_url: this.baseUrl,
                website_titel: 'IPLO - Informatiepunt Leefomgeving',
                samenvatting: snippet || title,
                type_document: this.determineDocumentType(fullUrl),
                publicatiedatum: null,
                sourceType: 'iplo' as const,
                authorityLevel: 'national' as const
              };

              // Validate document before adding
              if (this.isValidDocument(doc)) {
                documents.push(doc);
              }
            }
          }
        });
      }

      const msg = `Found ${documents.length} relevant documents from IPLO search: ${query}`;
      console.log(msg);
      if (runManager && runId) await runManager.log(runId, msg, 'info');

    } catch (error) {
      console.error('Error scraping IPLO search:', error);
      if (runManager && runId) await runManager.log(runId, `Fout bij scrapen IPLO zoekopdracht: ${error}`, 'error');
    }

    return documents;
  }

  /**
   * Determine if a link is a valid document link
   */
  private isValidDocumentLink(href: string): boolean {
    // Exclude navigation, internal anchors, and non-content links
    const excludePatterns = [
      '#',
      'javascript:',
      'mailto:',
      ...scraperConfig.excludeKeywords.map(k => `/${k}/`)
    ];

    return !excludePatterns.some(pattern => href.includes(pattern));
  }

  /**
   * Validate extracted document data
   * Ensures minimum quality requirements are met
   */
  private isValidDocument(doc: Partial<ScrapedDocument>): boolean {
    // Must have URL and title
    if (!doc.url || !doc.titel || doc.titel.trim().length === 0) {
      return false;
    }

    // Title should be meaningful (at least 3 characters)
    if (doc.titel.trim().length < 3) {
      return false;
    }

    // URL should be valid
    try {
      new URL(doc.url);
    } catch {
      return false;
    }

    // URL should be from IPLO domain
    if (!doc.url.startsWith(this.baseUrl)) {
      return false;
    }

    return true;
  }

  /**
   * Determine document type based on URL
   */
  private determineDocumentType(url: string): DocumentType {
    if (url.includes('.pdf')) return 'PDF';
    if (url.includes('/regelgeving/')) return 'Beleidsdocument';
    if (url.includes('/thema/')) return 'Beleidsdocument';
    if (url.includes('/nieuws/')) return 'Beleidsdocument';
    return 'Beleidsdocument';
  }

  /**
   * Keep only the top-N documents by semantic similarity (descending).
   */
  private trimBySemanticSimilarity(
    documents: ScrapedDocument[],
    limit: number,
    runManager?: RunManager,
    runId?: string
  ): ScrapedDocument[] {
    if (documents.length <= limit) {
      return documents;
    }

    const sorted = [...documents].sort(
      (a, b) => (b.semanticSimilarity || 0) - (a.semanticSimilarity || 0)
    );
    const trimmed = sorted.slice(0, limit);
    const dropped = documents.length - trimmed.length;

    logger.debug({ dropped, limit }, `[IPLO] Trimmed ${dropped} documents by semantic similarity (limit ${limit})`);
    if (runManager && runId) {
      runManager
        .log(runId, `Selecteerde ${dropped} documenten op basis van relevantie (limiet ${limit})`, 'info')
        .catch(err => logger.error({ error: err, runId }, 'Failed to log trimBySemanticSimilarity'));
    }

    return trimmed;
  }

  /**
   * Remove duplicate documents
   */
  private removeDuplicates(documents: ScrapedDocument[]): ScrapedDocument[] {
    const seen = new Set<string>();
    return documents.filter(doc => {
      if (seen.has(doc.url)) {
        return false;
      }
      seen.add(doc.url);
      return true;
    });
  }

  /**
   * Filter documents by geographic location (municipality/government institution)
   * Checks if the overheidsinstantie appears in document title or summary
   * 
   * @param documents - Documents to filter
   * @param overheidsinstantie - Government institution name to filter by
   * @param runManager - Optional run manager for logging
   * @param runId - Optional run ID for logging
   * @returns Filtered documents
   */
  private filterByGeographicLocation(
    documents: ScrapedDocument[],
    overheidsinstantie: string,
    runManager?: RunManager,
    runId?: string
  ): ScrapedDocument[] {
    const log = async (msg: string) => {
      if (runManager && runId) {
        await runManager.log(runId, msg, 'debug');
      }
    };

    // Normalize the filter term (case-insensitive, trim whitespace)
    const filterTerm = overheidsinstantie.trim().toLowerCase();
    if (filterTerm.length === 0) {
      return documents;
    }

    // Split filter term into words for more flexible matching
    const filterWords = filterTerm.split(/\s+/).filter(word => word.length > 2);

    const filtered = documents.filter(doc => {
      // Check title and summary for geographic matches
      const title = (doc.titel || '').toLowerCase();
      const summary = (doc.samenvatting || '').toLowerCase();
      const combinedText = `${title} ${summary}`;

      // Match if any significant word from filter term appears in document
      const matches = filterWords.some(word => combinedText.includes(word));
      
      // Also check for exact match (useful for common municipality names)
      const exactMatch = combinedText.includes(filterTerm);

      return matches || exactMatch;
    });

    return filtered;
  }

  /**
   * Add a new theme mapping (useful for expanding coverage)
   */
  addThemeMapping(theme: string, iploPath: string): void {
    IPLO_THEME_MAPPING[theme.toLowerCase()] = iploPath;
  }
}
