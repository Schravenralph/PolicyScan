/**
 * Common Crawl Discovery Service
 * 
 * Provides utilities for determining when Common Crawl discovery should run
 * and for discovering domains from Common Crawl.
 */

import { logger } from '../../utils/logger.js';

/**
 * Configuration for Common Crawl discovery conditional execution
 */
export interface CommonCrawlDiscoveryConfig {
  /** Minimum results threshold - discovery runs if result count is below this */
  minResultsThreshold?: number;
  /** Default minimum results threshold */
  readonly DEFAULT_MIN_RESULTS_THRESHOLD: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: CommonCrawlDiscoveryConfig = {
  DEFAULT_MIN_RESULTS_THRESHOLD: 10,
};

/**
 * Determines whether Common Crawl discovery should run based on result count and user preference
 * 
 * @param resultCount The number of documents found so far
 * @param enableDeepScan User preference flag for deep scanning (explicitly enables discovery)
 * @param config Optional configuration (uses defaults if not provided)
 * @returns true if Common Crawl discovery should run, false otherwise
 */
export function shouldRunCommonCrawlDiscovery(
  resultCount: number,
  enableDeepScan: boolean,
  config: Partial<CommonCrawlDiscoveryConfig> = {}
): boolean {
  const minThreshold = config.minResultsThreshold ?? DEFAULT_CONFIG.DEFAULT_MIN_RESULTS_THRESHOLD;

  // Always run if user explicitly enables deep scan
  if (enableDeepScan) {
    logger.debug(`Common Crawl discovery enabled: user preference (deep scan)`);
    return true;
  }

  // Run if result count is below threshold
  if (resultCount < minThreshold) {
    logger.debug(
      `Common Crawl discovery enabled: result count ${resultCount} below threshold ${minThreshold}`
    );
    return true;
  }

  // Don't run if results are sufficient
  logger.debug(
    `Common Crawl discovery disabled: result count ${resultCount} meets threshold ${minThreshold}`
  );
  return false;
}

/**
 * Gets the count of merged documents from workflow context
 * 
 * @param context The workflow context
 * @returns The count of merged documents, or 0 if not available
 */
export function getMergedDocumentCount(context: Record<string, unknown>): number {
  // Try different possible locations for merged documents
  const possibleKeys = [
    'documentsMerged',
    'mergedDocuments',
    'allDocuments',
    'scoredDocuments',
    'finalDocuments',
  ];

  for (const key of possibleKeys) {
    const documents = context[key];
    if (Array.isArray(documents)) {
      return documents.length;
    }
  }

  // Try to get from step results (e.g., merge_step.result.documentsMerged)
  if (context.merge_step && typeof context.merge_step === 'object') {
    const mergeStep = context.merge_step as Record<string, unknown>;
    if (mergeStep.result && typeof mergeStep.result === 'object') {
      const result = mergeStep.result as Record<string, unknown>;
      for (const key of possibleKeys) {
        const documents = result[key];
        if (Array.isArray(documents)) {
          return documents.length;
        }
      }
    }
  }

  // Try to count from rawDocumentsBySource
  if (context.rawDocumentsBySource && typeof context.rawDocumentsBySource === 'object') {
    const rawDocs = context.rawDocumentsBySource as Record<string, unknown>;
    let totalCount = 0;
    for (const key of Object.keys(rawDocs)) {
      const docs = rawDocs[key];
      if (Array.isArray(docs)) {
        totalCount += docs.length;
      }
    }
    if (totalCount > 0) {
      return totalCount;
    }
  }

  // Default to 0 if no documents found
  return 0;
}

/**
 * Determines whether Common Crawl discovery should run based on workflow context
 * 
 * This is a convenience function that extracts the document count from context
 * and calls shouldRunCommonCrawlDiscovery with the appropriate parameters.
 * 
 * @param context The workflow context
 * @param enableDeepScan User preference flag for deep scanning
 * @param config Optional configuration
 * @returns true if Common Crawl discovery should run, false otherwise
 */
export function shouldRunCommonCrawlDiscoveryFromContext(
  context: Record<string, unknown>,
  enableDeepScan: boolean,
  config: Partial<CommonCrawlDiscoveryConfig> = {}
): boolean {
  const resultCount = getMergedDocumentCount(context);
  return shouldRunCommonCrawlDiscovery(resultCount, enableDeepScan, config);
}

/**
 * Domain discovery result
 */
export interface DiscoveredDomain {
  domain: string;
  urlCount: number;
  relevanceScore?: number;
}

/**
 * Options for domain discovery
 */
export interface DomainDiscoveryOptions {
  /** Maximum number of domains to return (default: 5) */
  maxDomains?: number;
  /** Crawl ID to query (default: latest) */
  crawlId?: string;
  /** Maximum number of records to query (default: 1000) */
  queryLimit?: number;
  /** Whether to filter by authority patterns (default: true) */
  filterAuthorityPatterns?: boolean;
}

/**
 * Query options for Common Crawl Index Service
 * (Mirrored from CommonCrawlIndexService to avoid import issues in tests)
 */
interface QueryOptions {
  crawlId?: string;
  urlPattern?: string;
  domainPattern?: string;
  pathPattern?: string;
  statusCode?: string;
  mimeType?: string;
  limit?: number;
  skip?: number;
}

/**
 * Interface for Common Crawl Index Service
 * (Mirrored to avoid import issues in tests)
 */
interface CommonCrawlIndexServiceInterface {
  isCrawlLoaded(crawlId: string): Promise<boolean>;
  query(options: QueryOptions): Promise<Array<{ domain: string; url: string }>>;
}

/**
 * Authority patterns for filtering domains
 */
const AUTHORITY_PATTERNS = [
  'gemeente',
  'provincie',
  'ministerie',
  'rijksoverheid',
  'overheid',
  'waterschap',
  'omgevingsdienst',
  'antennebureau',
  'ruimtelijke-ordening',
];

/**
 * Extracts keywords from query parameters
 * 
 * @param onderwerp Subject/topic
 * @param thema Theme
 * @returns Array of keywords extracted from query
 */
function extractKeywords(onderwerp: string, thema: string): string[] {
  const query = `${onderwerp} ${thema}`.trim();
  if (!query) {
    return [];
  }

  // Split into words and filter out common stop words
  const stopWords = new Set([
    'de', 'het', 'een', 'van', 'voor', 'met', 'op', 'in', 'aan', 'is', 'zijn', 'was', 'waren',
    'en', 'of', 'te', 'bij', 'als', 'dat', 'die', 'dit', 'deze', 'zijn', 'haar', 'hun',
    'om', 'tot', 'naar', 'over', 'onder', 'tussen', 'door', 'tijdens', 'volgens', 'zonder',
    'met', 'bij', 'op', 'in', 'aan', 'voor', 'van', 'uit', 'naar', 'over', 'onder', 'tussen',
  ]);

  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.replace(/[^\w]/g, ''))
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Remove duplicates and return
  return [...new Set(words)];
}

/**
 * Filters domains by authority patterns
 * 
 * @param domain Domain name to check
 * @returns true if domain matches authority patterns
 */
function matchesAuthorityPattern(domain: string): boolean {
  const domainLower = domain.toLowerCase();
  return AUTHORITY_PATTERNS.some(pattern => domainLower.includes(pattern));
}

/**
 * Discovers domains from Common Crawl based on query keywords
 * 
 * @param onderwerp Subject/topic from query
 * @param thema Theme from query
 * @param indexService CommonCrawlIndexService instance (optional, creates new if not provided)
 * @param options Discovery options
 * @returns Array of discovered domains with URL counts
 */
export async function discoverDomainsFromCommonCrawl(
  onderwerp: string,
  thema: string,
  indexService?: CommonCrawlIndexServiceInterface,
  options: DomainDiscoveryOptions = {}
): Promise<DiscoveredDomain[]> {
  const {
    maxDomains = 5,
    crawlId = 'CC-MAIN-2025-47',
    queryLimit = 1000,
    filterAuthorityPatterns = true,
  } = options;

  // Extract keywords from query
  const keywords = extractKeywords(onderwerp, thema);
  
  if (keywords.length === 0) {
    logger.warn('No keywords extracted from query, skipping domain discovery');
    return [];
  }

  logger.info(`Discovering domains for keywords: ${keywords.join(', ')}`);

  // Use provided service or create new instance (lazy import to avoid MongoDB dependencies in tests)
  let service: CommonCrawlIndexServiceInterface;
  if (indexService) {
    service = indexService;
  } else {
    // Dynamic import to avoid loading MongoDB in test environment
    const { CommonCrawlIndexService } = await import('../common-crawl/CommonCrawlIndexService.js');
    service = new CommonCrawlIndexService();
  }

  // Check if crawl is loaded
  const isLoaded = await service.isCrawlLoaded(crawlId);
  if (!isLoaded) {
    logger.warn(`Crawl ${crawlId} not loaded in MongoDB, domain discovery may be limited`);
    // Continue anyway - might use API fallback in routes
  }

  // Query Common Crawl for each keyword
  const allRecords: Array<{ domain: string; url: string }> = [];

  for (const keyword of keywords) {
    try {
      const queryOptions: QueryOptions = {
        crawlId,
        domainPattern: '*.nl', // Filter for .nl domains
        urlPattern: `*${keyword}*`, // Search for keyword in URL
        statusCode: '200', // Only successful requests
        mimeType: 'text/html', // Only HTML pages
        limit: queryLimit,
      };

      const records = await service.query(queryOptions);
      
      // Extract domain and URL from records
      for (const record of records) {
        if (record.domain && record.url) {
          allRecords.push({
            domain: record.domain,
            url: record.url,
          });
        }
      }

      logger.debug(`Found ${records.length} records for keyword: ${keyword}`);
    } catch (error) {
      logger.error(
        { error, keyword, crawlId },
        `Error querying Common Crawl for keyword: ${keyword}`
      );
      // Continue with other keywords
    }
  }

  // Count URLs per domain
  const domainCounts = new Map<string, number>();
  const domainUrls = new Map<string, Set<string>>();

  for (const { domain, url } of allRecords) {
    const count = domainCounts.get(domain) || 0;
    domainCounts.set(domain, count + 1);

    if (!domainUrls.has(domain)) {
      domainUrls.set(domain, new Set());
    }
    domainUrls.get(domain)?.add(url);
  }

  // Convert to array and sort by URL count (descending)
  let domains: Array<{ domain: string; urlCount: number }> = Array.from(domainCounts.entries())
    .map(([domain, count]) => ({
      domain,
      urlCount: count,
    }))
    .sort((a, b) => b.urlCount - a.urlCount);

  // Filter by authority patterns if enabled
  if (filterAuthorityPatterns) {
    domains = domains.filter(d => matchesAuthorityPattern(d.domain));
    logger.debug(`Filtered to ${domains.length} domains matching authority patterns`);
  }

  // Limit to max domains
  const limitedDomains = domains.slice(0, maxDomains);

  logger.info(
    `Discovered ${limitedDomains.length} domains (from ${domains.length} total, ${allRecords.length} records)`
  );

  // Convert to DiscoveredDomain format
  return limitedDomains.map(d => ({
    domain: d.domain,
    urlCount: d.urlCount,
    relevanceScore: d.urlCount > 0 ? Math.min(d.urlCount / 100, 1.0) : 0, // Simple relevance score
  }));
}

