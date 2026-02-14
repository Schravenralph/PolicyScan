/**
 * BFS (Breadth-First Search) related workflow actions
 * 
 * Contains actions for:
 * - bfs_explore_3_hops - BFS exploration 3 hops deep from a start node
 * - bfs_crawl_websites - BFS crawl from multiple starting URLs
 */

import { WorkflowEngine } from '../../../services/workflow/WorkflowEngine.js';
import { RunManager } from '../../../services/workflow/RunManager.js';
import { NavigationGraph, type NavigationNode } from '../../../services/graphs/navigation/NavigationGraph.js';
import { GraphClusteringService } from '../../../services/graphs/navigation/GraphClusteringService.js';
import { IPLOScraper } from '../../../services/scraping/iploScraper.js';
import { isAllowedDomain, asString } from '../../workflowUtils.js';
import { logger } from '../../../utils/logger.js';
import { ServiceUnavailableError, ExternalServiceError } from '../../../types/errors.js';
import { extractNavigationNodeTitle } from '../../../utils/navigationGraphUtils.js';

/**
 * Create a function to get graph and clustering service
 * This is a factory function that creates a closure over the navigation graph instance
 */
function createGetGraphFunction(
    navigationGraph: NavigationGraph | null
): () => Promise<{ graph: NavigationGraph; clusteringService: GraphClusteringService }> {
    let clusteringService: GraphClusteringService | null = navigationGraph 
        ? new GraphClusteringService(navigationGraph)
        : null;

    // Register clustering service cache invalidator with the graph
    if (navigationGraph && clusteringService) {
        navigationGraph.registerClusteringServiceInvalidator(() => {
            clusteringService?.invalidateCache();
        });
    }

    return async () => {
        // Graph MUST be provided via dependency injection (already initialized with Neo4j)
        if (!navigationGraph) {
            throw new ServiceUnavailableError('NavigationGraph must be initialized with Neo4j driver. Neo4j connection is required.', {
                service: 'Neo4j',
                action: 'bfs_explore_3_hops'
            });
        }
        // Initialize clustering service if not already done
        if (!clusteringService) {
            clusteringService = new GraphClusteringService(navigationGraph);
            // Register invalidator when service is created
            navigationGraph.registerClusteringServiceInvalidator(() => {
                clusteringService?.invalidateCache();
            });
        }
        return { graph: navigationGraph, clusteringService };
    };
}

interface BfsCrawlParams {
    horstUrls?: string[];
    googleUrls?: string[];
    onderwerp?: string;
}

/**
 * Register BFS-related workflow actions
 * 
 * @param workflowEngine - Workflow engine instance
 * @param runManager - Run manager instance
 * @param navigationGraph - Optional NavigationGraph instance
 */
export function registerBFSActions(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    navigationGraph?: NavigationGraph | null
): void {
    const getGraph = createGetGraphFunction(navigationGraph || null);

    // bfs_explore_3_hops - BFS exploration 3 hops deep from a start node
    workflowEngine.registerAction('bfs_explore_3_hops', async (params, runId) => {
        const { graph } = await getGraph();
        // Scraper instance created but not used in this action
        new IPLOScraper(3);
        let startNodeUrl = asString(params.startNodeUrl);
        if (!startNodeUrl) {
            try {
                startNodeUrl = await graph.getRoot();
            } catch (error) {
                // If getRoot fails, use default URL as fallback
                logger.debug({ error, runId }, 'Failed to get root node, using default URL');
                startNodeUrl = 'https://iplo.nl';
            }
        }
        
        // Get topic from params or pick random from Dutch urban planning topics
        const run = await runManager.getRun(runId);
        const context = (run?.params as Record<string, unknown>)?.context as Record<string, unknown> | undefined || {};
        const userTopic =
            asString(params.onderwerp) ||
            asString(params.query) ||
            asString(context.onderwerp) ||
            asString(context.query) ||
            '';
        
        // Dutch urban planning topics
        const urbanPlanningTopics = [
            'omgevingsvisie',
            'omgevingsplan',
            'bestemmingsplan',
            'structuurvisie',
            'ruimtelijke ordening',
            'woningbouw',
            'duurzaamheid',
            'klimaatadaptatie',
            'mobiliteit',
            'verkeer',
            'parkeren',
            'groen',
            'natuur',
            'water',
            'energie',
            'zonne-energie',
            'windenergie',
            'circulaire economie',
            'arbeidsmigranten',
            'toerisme',
            'recreatie',
            'cultuur',
            'erfgoed',
            'wijkontwikkeling',
            'stadsvernieuwing',
            'kwaliteit van leven',
            'gezondheid',
            'onderwijs',
            'zorg',
            'veiligheid'
        ];
        
        // Pick random topic if user didn't supply one
        const topic = userTopic || urbanPlanningTopics[Math.floor(Math.random() * urbanPlanningTopics.length)];
        const topicKeywords = topic.toLowerCase().split(/\s+/);
        
        await runManager.log(runId, `BFS verkenning starten 3 hops diep vanaf ${startNodeUrl} (onderwerp: ${topic})`, 'info');
        
        // Store start node and topic in run params.context for graph stream endpoint
        if (run) {
            const updatedParams = {
                ...(run.params || {}),
                context: {
                    ...((run.params as Record<string, unknown>)?.context as Record<string, unknown> | undefined || {}),
                    startNodeUrl,
                    topic
                }
            };
            // Update run params with context through RunManager
            await runManager.updateRunParams(runId, updatedParams);
        }
        
        // Stream graph update function
        const streamGraphUpdate = async (node: NavigationNode) => {
            try {
                const updateUrl = `http://localhost:${process.env.PORT || 4000}/api/graph/stream/${runId}/update`;
                await fetch(updateUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ node })
                }).catch(() => {
                    // Silently fail if endpoint not available
                });
            } catch (_error) {
                // Silently fail
            }
        };
        
        // Import cheerio
        const cheerioModule = await import('cheerio');
        const cheerio = ('default' in cheerioModule ? cheerioModule.default : cheerioModule);
        
        // Relevance scoring function
        // Returns a score from 0 to ~100+ indicating relevance to the topic
        const scoreRelevance = (url: string, linkText: string, title?: string): number => {
            const urlLower = url.toLowerCase();
            const linkTextLower = linkText.toLowerCase();
            const titleLower = (title || '').toLowerCase();
            const combinedText = `${urlLower} ${linkTextLower} ${titleLower}`;
            
            let score = 0;
            
            // Score based on keyword matches (higher weight for more specific matches)
            for (const keyword of topicKeywords) {
                if (urlLower.includes(keyword)) score += 10;
                if (linkTextLower.includes(keyword)) score += 8;
                if (titleLower.includes(keyword)) score += 6;
                if (combinedText.includes(keyword)) score += 2;
            }
            
            // Boost for policy-related terms (indicates relevant content type)
            const policyTerms = ['beleid', 'visie', 'plan', 'document', 'nota', 'strategie', 'kader'];
            for (const term of policyTerms) {
                if (combinedText.includes(term)) score += 3;
            }
            
            // Boost for same domain (prefer internal links - more likely to be relevant)
            try {
                const startDomain = new URL(startNodeUrl).hostname;
                const linkDomain = new URL(url).hostname;
                if (linkDomain === startDomain) score += 5;
            } catch {
                // Invalid URL, no boost
            }
            
            return score;
        };
        
        // Relevance threshold: links below this score are considered poor quality
        // This threshold is based on:
        // - Minimum score needed for at least one keyword match in URL or link text (10-18 points)
        // - Plus some policy term boost (3 points) or same-domain boost (5 points)
        // Links scoring below this are likely not relevant to the topic
        const RELEVANCE_THRESHOLD = 8; // Minimum score to be considered relevant
        
        // Implement BFS with queue
        const maxDepth = 3; // 3 layers deep as specified
        const visited = new Set<string>();
        const queue: Array<{ url: string; depth: number }> = [{ url: startNodeUrl, depth: 0 }];
        visited.add(startNodeUrl);
        
        await runManager.log(runId, `BFS: Starten vanaf ${startNodeUrl} (maxDiepte: ${maxDepth}, onderwerp: ${topic})`, 'info');
        
        // Import axios and config at the top level to avoid dynamic import issues
        const _axios = (await import('axios')).default;
        const { scraperConfig } = await import('../../../config/scraperConfig.js');
        
        // Fetch page helper - uses centralized HTTP client for connection pooling
        const fetchPage = async (url: string): Promise<string> => {
            // Use centralized HTTP client with scraper-specific configuration
            // Migrated from direct axios usage to centralized client (WI-377)
            const { createHttpClient } = await import('../../../config/httpClient.js');
            const httpClient = createHttpClient({
                timeout: scraperConfig.timeout || 30000,
                maxRedirects: 10,
            });

            const response = await httpClient.get(url, {
                headers: {
                    'User-Agent': scraperConfig.userAgent || 'Mozilla/5.0 (compatible; Beleidsscan/1.0; +https://beleidsscan.nl)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            });
            
            if (!response.data || typeof response.data !== 'string') {
                throw new ExternalServiceError('BFS', `Invalid response data type: ${typeof response.data}`, {
                    url: url,
                    responseDataType: typeof response.data,
                    reason: 'invalid_response_format'
                });
            }
            
            if (response.data.length < 100) {
                throw new ExternalServiceError('BFS', `Response too short: ${response.data.length} bytes`, {
                    url: url,
                    responseLength: response.data.length,
                    reason: 'response_too_short'
                });
            }
            
            return response.data;
        };
        
        while (queue.length > 0) {
            const current = queue.shift()!;
            
            if (current.depth > maxDepth) {
                continue;
            }
            
            await runManager.log(runId, `BFS: Verkennen ${current.url} (Diepte: ${current.depth})`, 'info');
            
            // Always add node to visited set first
            const nodeTimestamp = new Date().toISOString();
            
            // Check if node exists in graph first - use existing data if fetch fails
            // Node check performed but result not used
            await graph.getNode(current.url);
            
            try {
                // Fetch and process the page
                const html = await fetchPage(current.url);
                
                // If we got empty HTML, something went wrong - throw error to be caught below
                if (!html || html === '<html><body></body></html>' || html.length < 100) {
                    throw new ExternalServiceError('BFS', `Received empty or invalid HTML from ${current.url}`, {
                        url: current.url,
                        htmlLength: html?.length || 0,
                        reason: 'empty_or_invalid_html'
                    });
                }
                
                const $ = (cheerio as typeof import('cheerio')).load(html);
                const titleText = $('title').text().trim();
                
                // Extract links with their text for relevance scoring
                interface LinkWithScore {
                    url: string;
                    text: string;
                    score: number;
                }
                
                const linksWithScores: LinkWithScore[] = [];
                const seenLinks = new Set<string>();
                
                // Extract ALL links from the page - be very aggressive
                // Check multiple selectors to catch all links
                const linkSelectors = ['body a[href]', 'main a[href]', 'article a[href]', 'nav a[href]', 'a[href]'];
                
                for (const selector of linkSelectors) {
                    $(selector).each((_index: number, elem) => {
                        if (elem.type !== 'tag' || !('tagName' in elem)) return;
                        const href = $(elem).attr('href');
                        if (!href || href.trim() === '' || href.trim() === '#') return;
                        
                        const linkText = $(elem).text().trim() || $(elem).attr('title') || '';
                        
                        try {
                            // Convert to absolute URL
                            let absoluteUrl: string;
                            if (href.startsWith('http://') || href.startsWith('https://')) {
                                absoluteUrl = href;
                            } else if (href.startsWith('//')) {
                                absoluteUrl = `https:${href}`;
                            } else if (href.startsWith('/')) {
                                // Relative URL - resolve against current page domain
                                const currentDomain = new URL(current.url).origin;
                                absoluteUrl = `${currentDomain}${href}`;
                            } else {
                                // Relative path - resolve against current URL
                                absoluteUrl = new URL(href, current.url).href;
                            }
                            
                            // Normalize URL (remove fragments, query params, trailing slash)
                            absoluteUrl = absoluteUrl.split('#')[0].split('?')[0];
                            // Only remove trailing slash if it's not the root of a domain
                            try {
                                const urlObj = new URL(absoluteUrl);
                                if (absoluteUrl.endsWith('/') && urlObj.pathname !== '/') {
                                    absoluteUrl = absoluteUrl.slice(0, -1);
                                }
                            } catch {
                                // If URL parsing fails, just remove trailing slash if not root
                                if (absoluteUrl.endsWith('/') && absoluteUrl.match(/https?:\/\/[^/]+\/.+/)) {
                                    absoluteUrl = absoluteUrl.slice(0, -1);
                                }
                            }
                            
                            // Basic validation: must be HTTP/HTTPS, no binary files, no duplicates, no mailto/tel/etc
                            if ((absoluteUrl.startsWith('http://') || absoluteUrl.startsWith('https://')) &&
                                !absoluteUrl.match(/\.(pdf|jpg|jpeg|png|gif|zip|doc|docx|xls|xlsx|css|js|xml|rss|ico|svg|woff|woff2|ttf|eot)$/i) &&
                                !absoluteUrl.startsWith('mailto:') &&
                                !absoluteUrl.startsWith('tel:') &&
                                !absoluteUrl.startsWith('javascript:') &&
                                !absoluteUrl.startsWith('data:') &&
                                !seenLinks.has(absoluteUrl) &&
                                isAllowedDomain(absoluteUrl)) {
                                seenLinks.add(absoluteUrl);
                                
                                // Score relevance
                                const score = scoreRelevance(absoluteUrl, linkText, titleText || current.url);
                                linksWithScores.push({ url: absoluteUrl, text: linkText, score });
                            }
                        } catch (_e) {
                            // Invalid URL, skip silently
                        }
                    });
                }
                
                // Filter by relevance threshold - only keep links above quality threshold
                const relevantLinks = linksWithScores.filter(l => l.score >= RELEVANCE_THRESHOLD);
                const filteredCount = linksWithScores.length - relevantLinks.length;
                
                // Sort by relevance score (highest first)
                relevantLinks.sort((a, b) => b.score - a.score);
                
                // Extract just the URLs (sorted by relevance)
                const uniqueLinks = relevantLinks.map(l => l.url);
                
                // Log domain breakdown
                const domainCounts = new Map<string, number>();
                uniqueLinks.forEach(link => {
                    try {
                        const domain = new URL(link).hostname;
                        domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
                    } catch (_e) {
                        // Invalid URL
                    }
                });
                const domainBreakdown = Array.from(domainCounts.entries())
                    .map(([domain, count]) => `${domain}: ${count}`)
                    .join(', ');
                
                // Log relevance filtering results
                const topLinks = relevantLinks.slice(0, 5).map(l => `${l.url} (score: ${l.score.toFixed(1)})`).join(', ');
                await runManager.log(runId, `BFS: ${linksWithScores.length} links geëxtraheerd van ${current.url}, ${filteredCount} gefilterd onder relevantiedrempel (${RELEVANCE_THRESHOLD}), ${uniqueLinks.length} relevante links behouden (domeinen: ${domainBreakdown}). Top links: ${topLinks}`, 'info');
                
                // Add node to graph with all links (sorted by relevance)
                const nodeData = {
                    url: current.url,
                    type: 'page' as const,
                    title: extractNavigationNodeTitle({ title: titleText || undefined, canonicalUrl: current.url }, current.url),
                    children: uniqueLinks,
                    lastVisited: nodeTimestamp
                };
                
                await graph.addNode(nodeData, { runId });
                logger.debug({ url: current.url, depth: current.depth, links: uniqueLinks.length, topic, runId }, 'BFS: Added node');
                
                // Extract entities from the page and add to knowledge graph
                try {
                    const { GraphManager } = await import('../../../services/scraping/GraphManager.js');
                    const { RelationshipExtractionService } = await import('../../../services/extraction/RelationshipExtractionService.js');
                    const { FeatureFlag } = await import('../../../models/FeatureFlag.js');
                    
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
                    
                    // Extract entities from the page
                    const result = await graphManager.extractEntitiesFromPage(
                        current.url,
                        titleText,
                        html,
                        current.url // websiteUrl
                    );
                    
                    if (result.entitiesExtracted > 0 || result.relationshipsExtracted > 0) {
                        await runManager.log(
                            runId,
                            `${result.entitiesExtracted} entiteiten en ${result.relationshipsExtracted} relaties geëxtraheerd van ${current.url}`,
                            'info'
                        );
                    }
                } catch (entityError) {
                    // Log but don't fail the workflow if entity extraction fails
                    const errorMsg = entityError instanceof Error ? entityError.message : String(entityError);
                    logger.warn({ url: current.url, error: errorMsg }, 'Failed to extract entities from page');
                    await runManager.log(
                        runId,
                        `Entiteit extractie mislukt voor ${current.url}: ${errorMsg}`,
                        'warn'
                    );
                }
                
                // Stream update to frontend
                await streamGraphUpdate(nodeData);
                
                // Add children to queue if within depth limit (BFS - explore all at same depth)
                // Links are already sorted by relevance, so we add them in order
                if (current.depth < maxDepth) {
                    let addedToQueue = 0;
                    const externalDomains = new Set<string>();
                    
                    // Get current domain for tracking
                    let currentDomain: string;
                    try {
                        currentDomain = new URL(current.url).hostname;
                    } catch {
                        currentDomain = '';
                    }
                    
                    // Add links in relevance order (already sorted)
                    for (const link of uniqueLinks) {
                        if (visited.has(link) || !isAllowedDomain(link)) continue;
                        
                        visited.add(link);
                        queue.push({ url: link, depth: current.depth + 1 });
                        addedToQueue++;
                        
                        // Track external domains
                        try {
                            const linkDomain = new URL(link).hostname;
                            if (linkDomain !== currentDomain) {
                                externalDomains.add(linkDomain);
                            }
                        } catch (_e) {
                            // Invalid URL
                        }
                    }
                    
                    const externalDomainsList = Array.from(externalDomains).join(', ');
                    await runManager.log(runId, `BFS: ${addedToQueue} nieuwe URLs toegevoegd aan wachtrij (diepte ${current.depth + 1}, wachtrij grootte: ${queue.length})${externalDomains.size > 0 ? `, externe domeinen: ${externalDomainsList}` : ''}`, 'info');
                }
                
                // Small delay to prevent overwhelming (but not too slow)
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                const errorStack = error instanceof Error ? error.stack : String(error);
                await runManager.log(runId, `Fout bij verkennen ${current.url}: ${errorMsg}`, 'warn');
                logger.error({ url: current.url, error: errorStack, runId }, 'BFS: Error exploring URL');
                
                // Still add node even if fetch failed - use existing graph data if available
                const existingNode = await graph.getNode(current.url);
                const nodeData = {
                    url: current.url,
                    type: 'page' as const,
                    title: extractNavigationNodeTitle({ title: existingNode?.title || undefined, canonicalUrl: current.url }, current.url),
                    children: existingNode?.children || [],
                    lastVisited: nodeTimestamp
                };
                
                await graph.addNode(nodeData, { runId });
                await streamGraphUpdate(nodeData);
                
                // If node has children in graph, score and filter by relevance threshold, then add to queue
                if (current.depth < maxDepth && existingNode?.children && existingNode.children.length > 0) {
                    // Score and filter children by relevance threshold
                    const childrenWithScores = existingNode.children
                        .map(url => ({
                            url,
                            score: scoreRelevance(url, '', existingNode.title)
                        }))
                        .filter(item => item.score >= RELEVANCE_THRESHOLD)
                        .sort((a, b) => b.score - a.score);
                    
                    const filteredFromGraph = existingNode.children.length - childrenWithScores.length;
                    
                    let addedFromGraph = 0;
                    for (const { url } of childrenWithScores) {
                        if (!visited.has(url) && isAllowedDomain(url)) {
                            visited.add(url);
                            queue.push({ url, depth: current.depth + 1 });
                            addedFromGraph++;
                        }
                    }
                    if (addedFromGraph > 0 || filteredFromGraph > 0) {
                        await runManager.log(runId, `BFS: ${addedFromGraph} URLs toegevoegd vanuit bestaande grafiekdata (diepte ${current.depth + 1}, ${filteredFromGraph} gefilterd onder drempel, gesorteerd op relevantie)`, 'info');
                    }
                }
            }
        }
        
        await runManager.log(runId, `BFS verkenning voltooid. ${visited.size} nodes bezocht, wachtrij had ${queue.length} resterend.`, 'info');
        logger.debug({ visited: visited.size, remaining: queue.length, runId }, 'BFS: Completed');
        
        // Ensure graph is saved after adding nodes
        if (visited.size > 0) {
            try {
                await graph.save();
                const nodeCounts = await graph.getNodeCount();
                await runManager.log(runId, `Navigatiegrafiek opgeslagen: ${nodeCounts.total} totaal nodes na BFS verkenning (${nodeCounts.iplo} IPLO, ${nodeCounts.external} extern)`, 'info');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                await runManager.log(runId, `Navigatiegrafiek opslaan mislukt: ${errorMsg}`, 'warn');
                // Don't fail the workflow if graph save fails
            }
        }
        
        return { explored: true, nodesVisited: visited.size };
    });

    // bfs_crawl_websites - BFS crawl from multiple starting URLs
    workflowEngine.registerAction('bfs_crawl_websites', async (params: BfsCrawlParams, runId: string) => {
        const { horstUrls = [], googleUrls = [], onderwerp = 'arbeidsmigranten' } = params;
        const { graph, clusteringService } = await getGraph();
        // const context = params as Record<string, unknown>; // Unused
        // const workflowId = context.workflowId as string | undefined; // Unused
        
        await runManager.log(
            runId,
            `BFS crawl starten vanaf ${horstUrls.length} Horst URLs, ${googleUrls.length} Google URLs, en IPLO nodes`,
            'info'
        );
        
        // Get IPLO nodes related to the topic
        const { SemanticMapper } = await import('../../../services/semantic/SemanticMapper.js');
        const semanticMapper = new SemanticMapper(clusteringService);
        
        const targetClusterIds = await semanticMapper.mapQueryToClusters(onderwerp);
        const metaGraph = await clusteringService.createMetaGraph();
        
        const iploUrls: string[] = [];
        if (targetClusterIds.length > 0) {
            for (const clusterId of targetClusterIds) {
                const cluster = metaGraph.clusters[clusterId];
                if (cluster && cluster.children) {
                    iploUrls.push(...cluster.children.slice(0, 10)); // Top 10 per cluster
                }
            }
            await runManager.log(runId, `${iploUrls.length} relevante IPLO URLs gevonden van ${targetClusterIds.length} clusters voor BFS crawl`, 'info');
        } else {
            // No clusters found - will use other sources (Horst, Google) for BFS
            const graphStats = await graph.getStatistics({ runId });
            if (graphStats.totalNodes === 0) {
                await runManager.log(runId, 'Geen IPLO clusters gevonden: Navigatiegrafiek is leeg. Andere bronnen gebruiken (Horst, Google) voor BFS crawl.', 'warn');
            } else if (metaGraph.totalClusters === 0) {
                await runManager.log(runId, `Geen IPLO clusters gevonden: Grafiek heeft ${graphStats.totalNodes} nodes maar geen clusters voldoen aan minimum grootte drempel. Andere bronnen gebruiken voor BFS crawl.`, 'warn');
            } else {
                await runManager.log(runId, `Geen IPLO clusters gevonden die overeenkomen met "${onderwerp}". Grafiek heeft ${metaGraph.totalClusters} clusters maar geen match. Andere bronnen gebruiken voor BFS crawl.`, 'warn');
            }
        }
        
        // Combine all starting URLs
        const startUrls = [
            ...new Set([
                ...horstUrls.slice(0, 5),
                ...iploUrls.slice(0, 10),
                ...googleUrls.slice(0, 10)
            ])
        ].filter(isAllowedDomain);
        
        // BFS crawl with max depth 3
        const maxDepth = 3;
        const visited = new Set<string>();
        const queue: Array<{ url: string; depth: number }> = startUrls.map(url => ({ url, depth: 0 }));
        const discoveredUrls: string[] = [];
        
        await runManager.log(runId, `BFS starten vanaf ${startUrls.length} start-URLs (max diepte: ${maxDepth})`, 'info');
        
        // Import scraper utilities
        const axios = (await import('axios')).default;
        const cheerioModule = await import('cheerio');
        const cheerio = ('default' in cheerioModule && cheerioModule.default) || cheerioModule;
        const { scraperConfig } = await import('../../../config/scraperConfig.js');
        
        // Parallel BFS crawling with worker pool (max 4 workers)
        const MAX_WORKERS = 4;
        const MAX_DISCOVERED = 50;
        const executing = new Set<Promise<void>>();
        
        const processUrl = async (url: string, depth: number): Promise<void> => {
            if (visited.has(url) || depth > maxDepth || discoveredUrls.length >= MAX_DISCOVERED) {
                return;
            }
            
            // Use a lock to prevent race conditions
            if (visited.has(url)) return;
            visited.add(url);
            
            try {
                const response = await axios.get(url, {
                    timeout: scraperConfig.timeout || 30000,
                    maxRedirects: 10,
                    headers: { 'User-Agent': scraperConfig.userAgent || 'Mozilla/5.0' }
                });
                
                const $ = (cheerio as any).load(response.data);
                const links: string[] = [];
                
                $('a[href]').each((_: number, el: any): void => {
                    const href = $(el).attr('href');
                    if (!href) return;
                    
                    try {
                        const absoluteUrl = new URL(href, url).toString();
                        if (absoluteUrl.startsWith('http') && !visited.has(absoluteUrl)) {
                            links.push(absoluteUrl);
                        }
                    } catch {
                        // Invalid URL, skip
                    }
                });
                
                // Add discovered links to queue (thread-safe)
                const newLinks: Array<{ url: string; depth: number }> = [];
                for (const link of links.slice(0, 5)) { // Limit to 5 links per page
                    if (!visited.has(link) && depth < maxDepth && isAllowedDomain(link) && discoveredUrls.length < MAX_DISCOVERED) {
                        newLinks.push({ url: link, depth: depth + 1 });
                        discoveredUrls.push(link);
                    }
                }
                
                // Add new links to queue
                queue.push(...newLinks);
                
                // Add node to graph
                const workflowId = (params as Record<string, unknown>).workflowId as string | undefined;
                await graph.addNode({
                    url,
                    type: 'page',
                    title: $('title').text() || url,
                    children: links.slice(0, 10),
                    sourceUrl: url
                }, { runId, workflowId });
                
                if (discoveredUrls.length % 10 === 0) {
                    await runManager.log(runId, `BFS voortgang: ${discoveredUrls.length} URLs ontdekt`, 'info');
                }
            } catch (_error) {
                // Skip failed URLs
            }
        };
        
        // Worker pool pattern: process URLs in parallel
        while ((queue.length > 0 || executing.size > 0) && discoveredUrls.length < MAX_DISCOVERED) {
            // Start new workers if we have capacity and URLs to process
            while (executing.size < MAX_WORKERS && queue.length > 0 && discoveredUrls.length < MAX_DISCOVERED) {
                const item = queue.shift();
                if (!item) break;
                
                const { url, depth } = item;
                if (visited.has(url) || depth > maxDepth) continue;
                
                const promise = processUrl(url, depth).finally(() => {
                    executing.delete(promise);
                });
                executing.add(promise);
            }
            
            // Wait for at least one worker to finish before starting new ones
            if (executing.size > 0) {
                await Promise.race(executing);
            }
        }
        
        // Wait for all remaining workers to finish
        await Promise.all(executing);
        
        await runManager.log(runId, `BFS crawl voltooid. ${discoveredUrls.length} URLs ontdekt`, 'info');
        
        // Ensure graph is saved after adding nodes
        try {
            await graph.save();
            const nodeCounts = await graph.getNodeCount();
            await runManager.log(runId, `Navigatiegrafiek opgeslagen: ${nodeCounts.total} totaal nodes na BFS verkenning (${nodeCounts.iplo} IPLO, ${nodeCounts.external} extern)`, 'info');
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await runManager.log(runId, `Navigatiegrafiek opslaan mislukt: ${errorMsg}`, 'warn');
            // Don't fail the workflow if graph save fails
        }
        
        return { 
            discoveredUrls,
            totalVisited: visited.size
        };
    });
}

