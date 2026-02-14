/**
 * AI-Guided Scraper
 * 
 * Extends BaseScraper with AI-powered navigation and site search capabilities.
 * Uses LLM and intelligent strategies to find relevant content on municipal websites.
 */

import { BaseScraper, ScraperOptions } from './baseScraper.js';
import { ScrapedDocument } from '../infrastructure/types.js';
import { AINavigationService } from '../ai-crawling/AINavigationService.js';
import { SiteSearchService } from '../query/SiteSearchService.js';
import { DocumentExtractionService } from '../ingestion/extraction/DocumentExtractionService.js';
import { LinkPrioritizationService } from '../scraping/LinkPrioritizationService.js';
import { AICrawlingTraceService } from '../ai-crawling/AICrawlingTraceService.js';
import type { AICrawlingStrategy } from '../../models/AICrawlingTrace.js';

export interface AIGuidedScraperOptions extends ScraperOptions {
  useSiteSearch?: boolean;
  useAINavigation?: boolean;
  aggressiveness?: 'low' | 'medium' | 'high';
  maxDepth?: number;
}

/**
 * AI-Guided Scraper that uses intelligent navigation and site search
 */
export class AIGuidedScraper extends BaseScraper {
  private navigationService: AINavigationService;
  private siteSearchService: SiteSearchService;
  private documentExtractionService: DocumentExtractionService;
  private linkPrioritizationService: LinkPrioritizationService;
  protected override options: Required<AIGuidedScraperOptions>;

  constructor(
    baseUrl: string,
    scraperOptions: AIGuidedScraperOptions = {}
  ) {
    super(baseUrl, scraperOptions);

    // Initialize services
    const cacheTTL = parseInt(process.env.AI_NAVIGATION_CACHE_TTL || '604800', 10);
    this.navigationService = new AINavigationService(cacheTTL);
    this.siteSearchService = new SiteSearchService();
    this.documentExtractionService = new DocumentExtractionService();
    this.linkPrioritizationService = new LinkPrioritizationService(this.navigationService);

    // Set options with defaults
    this.options = {
      maxDepth: scraperOptions.maxDepth ?? parseInt(process.env.AI_CRAWLING_MAX_DEPTH || '4', 10),
      followLinks: scraperOptions.followLinks ?? true,
      respectRateLimit: scraperOptions.respectRateLimit ?? true,
      useCache: scraperOptions.useCache ?? true,
      useSiteSearch: scraperOptions.useSiteSearch ?? (process.env.AI_CRAWLING_USE_SITE_SEARCH !== 'false'),
      useAINavigation: scraperOptions.useAINavigation ?? (process.env.AI_CRAWLING_ENABLED === 'true'),
      aggressiveness: scraperOptions.aggressiveness || (process.env.AI_CRAWLING_AGGRESSIVENESS as 'low' | 'medium' | 'high') || 'medium'
    };
  }

  /**
   * Main scrape method with AI guidance
   * @param traceSessionId - Optional trace session ID for explainability tracking
   */
  async scrape(
    query: string,
    onderwerp: string,
    thema: string,
    traceSessionId?: string
  ): Promise<ScrapedDocument[]> {
    console.log(`🤖 [AI-Guided] Starting intelligent crawl for: ${onderwerp} ${thema}`);
    
    const startTime = Date.now();
    const searchQuery = `${onderwerp} ${thema}`.trim();
    const documents: ScrapedDocument[] = [];
    let strategy: AICrawlingStrategy = 'traditional_crawl';

    // Log strategy selection if tracing is enabled
    if (traceSessionId) {
      const enabledStrategies = [];
      if (this.options.useSiteSearch) enabledStrategies.push('Site Search');
      if (this.options.useAINavigation) enabledStrategies.push('AI Navigation');
      if (this.options.aggressiveness !== 'low') enabledStrategies.push('Traditional Crawl (fallback)');
      
      await AICrawlingTraceService.logDecision(traceSessionId, 'strategy_selected', {
        reasoning: `Starting intelligent crawl for "${onderwerp} ${thema}" on ${this.baseUrl}.\n  • Enabled strategies: ${enabledStrategies.join(', ') || 'None (fallback only)'}\n  • Aggressiveness level: ${this.options.aggressiveness} (affects number of links followed: ${this.getMaxLinksForAggressiveness()} max)\n  • Approach: ${enabledStrategies.length > 1 ? 'Multi-strategy (will try site search first, then AI navigation if needed, then traditional crawl)' : enabledStrategies[0] || 'Traditional crawl only'}`,
        metadata: {
          useSiteSearch: this.options.useSiteSearch,
          useAINavigation: this.options.useAINavigation,
          aggressiveness: this.options.aggressiveness,
          maxLinks: this.getMaxLinksForAggressiveness(),
          baseUrl: this.baseUrl,
          query: `${onderwerp} ${thema}`,
          enabledStrategies: enabledStrategies,
        },
      });
    }

    // Strategy 1: Try site search first (if enabled and available)
    if (this.options.useSiteSearch) {
      const searchResults = await this.trySiteSearch(query, onderwerp, thema, traceSessionId);
      documents.push(...searchResults);
      
      if (searchResults.length > 0) {
        console.log(`✅ [AI-Guided] Found ${searchResults.length} documents via site search`);
        strategy = 'site_search';
        
        if (traceSessionId) {
          const confidence = Math.min(1.0, searchResults.length / 20);
          // Log the site search decision first
          await AICrawlingTraceService.logDecision(traceSessionId, 'site_search_performed', {
            reasoning: `Site search executed successfully for query "${searchQuery}". Found ${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}. ${searchResults.length >= 20 ? 'Result limit reached (20), showing top results.' : 'All results will be processed.'} ${confidence >= 0.7 ? 'High confidence - search returned substantial results.' : confidence >= 0.4 ? 'Moderate confidence - some results found.' : 'Low confidence - few results, may need alternative strategies.'}`,
            confidence: confidence,
            metadata: { 
              documentCount: searchResults.length,
              searchQuery: searchQuery,
              strategy: 'site_search',
              resultsLimited: searchResults.length >= 20
            },
          });
          
          // Get the trace to find the decision index we just added
          const trace = await AICrawlingTraceService.getTrace(traceSessionId);
          const searchDecisionIndex = trace ? trace.decisions.length - 1 : 0;
          
          // Log each document found - link to the site search decision
          for (let i = 0; i < searchResults.length; i++) {
            const doc = searchResults[i];
            await AICrawlingTraceService.logDocumentFound(
              traceSessionId,
              doc.url,
              doc.titel,
              'site_search',
              searchDecisionIndex
            );
          }
        }
      }
    }

    // Strategy 2: Use AI navigation to find relevant sections
    if (this.options.useAINavigation && documents.length < 10) {
      const navResults = await this.tryAINavigation(query, onderwerp, thema, traceSessionId);
      documents.push(...navResults);
      
      if (navResults.length > 0) {
        console.log(`✅ [AI-Guided] Found ${navResults.length} documents via AI navigation`);
        strategy = documents.length > 0 ? 'hybrid' : 'ai_navigation';
        
        if (traceSessionId) {
          // Log the analysis decision first
          await AICrawlingTraceService.logDecision(traceSessionId, 'ai_navigation_analysis', {
            reasoning: `AI navigation successfully found ${navResults.length} document${navResults.length !== 1 ? 's' : ''}. The LLM analyzed the website structure and identified relevant links based on semantic understanding of the query.`,
            confidence: Math.min(1.0, navResults.length / 15),
            metadata: { documentCount: navResults.length },
          });
          
          // Get the trace to find the decision index we just added
          const trace = await AICrawlingTraceService.getTrace(traceSessionId);
          const analysisDecisionIndex = trace ? trace.decisions.length - 1 : 0;
          
          // Log each document found - use the index of the AI navigation analysis decision
          for (let i = 0; i < navResults.length; i++) {
            const doc = navResults[i];
            await AICrawlingTraceService.logDocumentFound(
              traceSessionId,
              doc.url,
              doc.titel,
              'ai_navigation',
              analysisDecisionIndex
            );
          }
        }
      } else if (traceSessionId && this.options.useAINavigation) {
        // Log that AI navigation was attempted but found no documents
        await AICrawlingTraceService.logDecision(traceSessionId, 'ai_navigation_analysis', {
          reasoning: `AI navigation was attempted but did not find any relevant documents. This could mean:\n  • The website structure made it difficult to identify relevant links\n  • The LLM could not find clear semantic matches\n  • The analyzed links did not lead to documents matching the query\n  → Will try traditional crawl fallback if enabled`,
          confidence: 0.2,
          metadata: { documentCount: 0, outcome: 'no_results' },
        });
      }
    } else if (traceSessionId && !this.options.useAINavigation) {
      await AICrawlingTraceService.logDecision(traceSessionId, 'decision_explanation', {
        reasoning: `AI navigation was not attempted: ${documents.length >= 10 ? 'Already found 10+ documents via site search, skipping AI navigation' : 'AI navigation is disabled in configuration'}`,
        metadata: { skipped: true, reason: documents.length >= 10 ? 'sufficient_results' : 'disabled' },
      });
    }

    // Strategy 3: Fallback to traditional crawling if needed
    if (documents.length < 5 && this.options.aggressiveness !== 'low') {
      if (traceSessionId) {
        await AICrawlingTraceService.logDecision(traceSessionId, 'decision_explanation', {
          reasoning: `Traditional crawl fallback is being attempted because: ${documents.length < 5 ? `Only found ${documents.length} document${documents.length !== 1 ? 's' : ''} (target is 5+), need more results` : 'Aggressiveness is not set to low, allowing fallback strategies'}`,
          metadata: { currentDocumentCount: documents.length, reason: 'insufficient_results' },
        });
      }
      
      const crawlResults = await this.traditionalCrawl(query, onderwerp, thema, traceSessionId);
      documents.push(...crawlResults);
      
      if (crawlResults.length > 0) {
        console.log(`✅ [AI-Guided] Found ${crawlResults.length} documents via traditional crawl`);
        strategy = documents.length > 0 ? 'hybrid' : 'traditional_crawl';
        
        if (traceSessionId) {
          // Log the decision first
          await AICrawlingTraceService.logDecision(traceSessionId, 'decision_explanation', {
            reasoning: `Traditional crawl fallback successfully found ${crawlResults.length} additional document${crawlResults.length !== 1 ? 's' : ''}. This method uses keyword matching to find relevant links when AI methods are unavailable or insufficient.`,
            metadata: { documentCount: crawlResults.length, outcome: 'success' },
          });
          
          // Get the trace to find the decision index we just added
          const trace = await AICrawlingTraceService.getTrace(traceSessionId);
          const lastDecisionIndex = trace ? trace.decisions.length - 1 : 0;
          
          // Log each document found - use the index of the last decision
          for (let i = 0; i < crawlResults.length; i++) {
            const doc = crawlResults[i];
            await AICrawlingTraceService.logDocumentFound(
              traceSessionId,
              doc.url,
              doc.titel,
              'traditional_crawl',
              lastDecisionIndex
            );
          }
        }
      } else if (traceSessionId) {
        await AICrawlingTraceService.logDecision(traceSessionId, 'decision_explanation', {
          reasoning: `Traditional crawl fallback was attempted but found no additional documents. This concludes the crawling attempt.`,
          metadata: { documentCount: 0, outcome: 'no_results' },
        });
      }
    } else if (traceSessionId) {
      const reason = documents.length >= 5 
        ? `Already found ${documents.length} documents, exceeding the minimum threshold of 5`
        : `Aggressiveness is set to 'low', traditional crawl fallback is disabled`;
      
      await AICrawlingTraceService.logDecision(traceSessionId, 'decision_explanation', {
        reasoning: `Traditional crawl fallback was not attempted: ${reason}`,
        metadata: { skipped: true, reason: documents.length >= 5 ? 'sufficient_results' : 'low_aggressiveness' },
      });
    }

    // Deduplicate by URL
    const uniqueDocs = this.deduplicateDocuments(documents);
    
    console.log(`📊 [AI-Guided] Total unique documents found: ${uniqueDocs.length}`);
    
    // Update trace with final metrics
    if (traceSessionId) {
      const duration = Date.now() - startTime;
      await AICrawlingTraceService.updateStrategy(traceSessionId, strategy);
      await AICrawlingTraceService.updatePerformanceMetrics(traceSessionId, {
        totalDuration: duration,
      });
    }
    
    return uniqueDocs;
  }

  /**
   * Try site search to find relevant documents
   */
  private async trySiteSearch(
    query: string,
    onderwerp: string,
    thema: string,
    traceSessionId?: string
  ): Promise<ScrapedDocument[]> {
    try {
      // Check if site search is usable
      const isUsable = await this.siteSearchService.isUsable(this.baseUrl);
      if (!isUsable) {
        console.log(`ℹ️  [AI-Guided] Site search not available for ${this.baseUrl}`);
        
      if (traceSessionId) {
        await AICrawlingTraceService.logDecision(traceSessionId, 'site_search_detected', {
          reasoning: `Site search feature was checked but not found or not usable on ${this.baseUrl}. This could mean:\n  • The website does not have a search form\n  • The search form uses a non-standard format\n  • The search functionality is broken or requires JavaScript\n  → Falling back to alternative crawling strategies`,
          confidence: 0,
          metadata: { 
            baseUrl: this.baseUrl, 
            detected: false,
            strategy: 'fallback_to_ai_navigation_or_traditional'
          },
        });
      }
        
        return [];
      }

      if (traceSessionId) {
        await AICrawlingTraceService.logDecision(traceSessionId, 'site_search_detected', {
          reasoning: `Site search feature successfully detected on ${this.baseUrl}. The website has a search form that can be used to find relevant content directly. This is the preferred method as it typically yields the most relevant results.`,
          confidence: 0.9,
          metadata: { 
            baseUrl: this.baseUrl, 
            detected: true,
            strategy: 'proceeding_with_site_search'
          },
        });
      }

      // Perform search with combined query
      const searchQuery = `${onderwerp} ${thema}`.trim();
      const searchResults = await this.siteSearchService.search(this.baseUrl, searchQuery);

      // Convert search results to ScrapedDocument
      const documents: ScrapedDocument[] = [];
      for (const result of searchResults.slice(0, 20)) { // Limit to 20 results
        try {
          const doc = await this.scrapeDocumentFromUrl(result.url, onderwerp, thema);
          if (doc) {
            documents.push(doc);
          }
        } catch (error) {
          console.warn(`Failed to scrape document from ${result.url}:`, error);
        }
      }

      return documents;
    } catch (error) {
      console.error(`Site search failed:`, error);
      return [];
    }
  }

  /**
   * Try AI navigation to find relevant sections
   */
  private async tryAINavigation(
    query: string,
    onderwerp: string,
    thema: string,
    traceSessionId?: string
  ): Promise<ScrapedDocument[]> {
    try {
      const searchQuery = `${onderwerp} ${thema}`.trim();
      
      // Analyze site structure
      const analysis = await this.navigationService.analyzeSiteStructure(
        this.baseUrl,
        searchQuery
      );

      // Log link prioritization if tracing
      if (traceSessionId && analysis.relevantLinks.length > 0) {
        const topLink = analysis.relevantLinks[0];
        const top3Links = analysis.relevantLinks.slice(0, 3);
        const avgScore = analysis.relevantLinks.reduce((sum, link) => sum + link.relevanceScore, 0) / analysis.relevantLinks.length;
        
        await AICrawlingTraceService.logDecision(traceSessionId, 'ai_navigation_analysis', {
          reasoning: `AI navigation analyzed the website structure and prioritized ${analysis.relevantLinks.length} links based on relevance to query "${searchQuery}".\n  • Top link: ${topLink?.text || 'N/A'} (score: ${((topLink?.relevanceScore || 0) * 100).toFixed(0)}%)\n  • Top link reasoning: ${topLink?.reasoning || 'Link text and URL suggest relevance'}\n  • Average relevance score: ${(avgScore * 100).toFixed(0)}%\n  • Site structure: ${analysis.siteStructure?.hasSearch ? 'Has search' : 'No search detected'}, ${analysis.siteStructure?.hasSitemap ? 'has sitemap' : 'no sitemap'}`,
          confidence: topLink?.relevanceScore || 0.5,
          metadata: {
            totalLinks: analysis.relevantLinks.length,
            topLinkUrl: topLink?.url,
            topLinkScore: topLink?.relevanceScore,
            topLinkReasoning: topLink?.reasoning,
            top3Links: top3Links.map(l => ({ url: l.url, text: l.text, score: l.relevanceScore })),
            averageScore: avgScore,
            siteHasSearch: analysis.siteStructure?.hasSearch,
            siteHasSitemap: analysis.siteStructure?.hasSitemap,
            mainSections: analysis.siteStructure?.mainSections?.slice(0, 5),
          },
        });
      }

      // Follow suggested path
      const documents: ScrapedDocument[] = [];
      const maxLinks = this.getMaxLinksForAggressiveness();

      for (const link of analysis.relevantLinks.slice(0, maxLinks)) {
        try {
          const doc = await this.scrapeDocumentFromUrl(link.url, onderwerp, thema);
          if (doc) {
            documents.push(doc);
          }
        } catch (error) {
          console.warn(`Failed to scrape document from ${link.url}:`, error);
        }
      }

      return documents;
    } catch (error) {
      console.error(`AI navigation failed:`, error);
      return [];
    }
  }

  /**
   * Traditional crawling fallback
   */
  private async traditionalCrawl(
    query: string,
    onderwerp: string,
    thema: string,
    traceSessionId?: string
  ): Promise<ScrapedDocument[]> {
    // Basic implementation: fetch homepage and extract relevant links
    try {
      const html = await this.fetchPage(this.baseUrl);
      const $ = this.load(html);

      // Extract links
      const links = this.extractLinks($, 'a[href]', this.baseUrl);
      
      // Prioritize links
      const prioritized = await this.linkPrioritizationService.prioritizeLinks(
        links.map(url => ({
          url,
          text: '',
          depth: 0
        })),
        `${onderwerp} ${thema}`,
        this.baseUrl
      );

      // Log link prioritization if tracing
      if (traceSessionId && prioritized.length > 0) {
        const queryLower = `${onderwerp} ${thema}`.toLowerCase();
        const topLink = prioritized[0];
        
        await AICrawlingTraceService.logDecision(traceSessionId, 'link_prioritized', {
          reasoning: `Traditional crawl method analyzed ${links.length} links from the homepage and prioritized ${prioritized.length} links using keyword matching for query "${onderwerp} ${thema}".\n  • Method: Keyword-based scoring (text and URL matching)\n  • Top prioritized link: ${topLink?.url || 'N/A'}\n  • This is a fallback strategy when AI navigation or site search are not available or insufficient`,
          confidence: 0.6,
          metadata: {
            totalLinks: links.length,
            prioritizedLinks: prioritized.length,
            method: 'keyword_matching',
            queryTerms: queryLower.split(/\s+/).filter(t => t.length > 2),
            topLinkUrl: topLink?.url,
          },
        });
      }

      // Get top links
      const topLinks = this.linkPrioritizationService.getTopLinks(prioritized, 10);

      // Scrape documents
      const documents: ScrapedDocument[] = [];
      for (const link of topLinks) {
        try {
          const doc = await this.scrapeDocumentFromUrl(link.url, onderwerp, thema);
          if (doc) {
            documents.push(doc);
          }
        } catch (error) {
          console.warn(`Failed to scrape document from ${link.url}:`, error);
        }
      }

      return documents;
    } catch (error) {
      console.error(`Traditional crawl failed:`, error);
      return [];
    }
  }

  /**
   * Scrape a single document from URL
   */
  private async scrapeDocumentFromUrl(
    url: string,
    onderwerp: string,
    thema: string
  ): Promise<ScrapedDocument | null> {
    try {
      // Check if it's a document (PDF, DOCX) or HTML page
      if (url.toLowerCase().endsWith('.pdf') || url.toLowerCase().endsWith('.docx')) {
        return await this.scrapeDocumentFile(url, onderwerp, thema);
      } else {
        return await this.scrapeHTMLPage(url, onderwerp, thema);
      }
    } catch (error) {
      console.warn(`Failed to scrape ${url}:`, error);
      return null;
    }
  }

  /**
   * Scrape a document file (PDF, DOCX)
   */
  private async scrapeDocumentFile(
    url: string,
    _onderwerp: string,
    _thema: string
  ): Promise<ScrapedDocument | null> {
    try {
      const extracted = await this.documentExtractionService.extractFromUrl(url);
      
      if (!extracted.text || extracted.text.length < 50) {
        return null; // Skip empty or very short documents
      }

      return {
        titel: this.extractTitleFromUrl(url),
        url,
        website_url: this.baseUrl,
        website_titel: this.extractWebsiteTitle(),
        samenvatting: extracted.text.substring(0, 500),
        type_document: 'Beleidsdocument',
        publicatiedatum: new Date().toISOString()
      };
    } catch (error) {
      console.warn(`Failed to extract document from ${url}:`, error);
      return null;
    }
  }

  /**
   * Scrape an HTML page
   */
  private async scrapeHTMLPage(
    url: string,
    _onderwerp: string,
    _thema: string
  ): Promise<ScrapedDocument | null> {
    try {
      const html = await this.fetchPage(url);
      const $ = this.load(html);

      // Extract title
      const title = this.extractText($, 'h1, .page-title, .article-title, title') || 
                    this.extractTitleFromUrl(url);

      // Extract content
      const content = this.extractText($, 'main, #content, .content, article, .article-body') ||
                      this.extractText($, 'body');

      if (!content || content.length < 100) {
        return null; // Skip pages with too little content
      }

      // Extract summary (first paragraph)
      const summary = this.extractText($, '.intro, .lead, .summary, p') || 
                      content.substring(0, 500);

      // Extract date
      const dateText = this.extractText($, 'time, .publication-date, .date');
      const publicatiedatum = dateText ? this.parseDate(dateText) : new Date().toISOString();

      return {
        titel: title,
        url,
        website_url: this.baseUrl,
        website_titel: this.extractWebsiteTitle(),
        samenvatting: summary.substring(0, 500),
        type_document: 'Webpagina',
        publicatiedatum
      };
    } catch (error) {
      console.warn(`Failed to scrape HTML page ${url}:`, error);
      return null;
    }
  }

  /**
   * Extract title from URL
   */
  private extractTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      return pathParts[pathParts.length - 1] || urlObj.hostname;
    } catch {
      return url;
    }
  }

  /**
   * Extract website title
   */
  private extractWebsiteTitle(): string {
    try {
      const urlObj = new URL(this.baseUrl);
      return urlObj.hostname;
    } catch {
      return this.baseUrl;
    }
  }

  /**
   * Parse date from text
   */
  private parseDate(dateText: string): string {
    // Simple date parsing (can be enhanced)
    const date = new Date(dateText);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    return new Date().toISOString();
  }

  /**
   * Get max links based on aggressiveness setting
   */
  private getMaxLinksForAggressiveness(): number {
    switch (this.options.aggressiveness) {
      case 'high':
        return 30;
      case 'medium':
        return 15;
      case 'low':
        return 5;
      default:
        return 15;
    }
  }

  /**
   * Deduplicate documents by URL
   */
  private deduplicateDocuments(documents: ScrapedDocument[]): ScrapedDocument[] {
    const seen = new Set<string>();
    const unique: ScrapedDocument[] = [];

    for (const doc of documents) {
      if (!seen.has(doc.url)) {
        seen.add(doc.url);
        unique.push(doc);
      }
    }

    return unique;
  }
}

