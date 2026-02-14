import { Router, Request, Response } from 'express';
import { parseIntQueryParam } from '../utils/queryUtils.js';
import { NavigationGraph, type NavigationNode } from '../services/graphs/navigation/NavigationGraph.js';
import { RunManager } from '../services/workflow/RunManager.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { NotFoundError, ServiceUnavailableError } from '../types/errors.js';
import type { Run } from '../services/infrastructure/types.js';
import type { GraphUpdateEventData } from '../services/infrastructure/SSEService.js';

/**
 * Real-time graph streaming routes
 * Provides endpoints for streaming navigation graph updates during crawling
 */
export function createGraphStreamRouter(
    runManager: RunManager,
    navigationGraphGetter?: (() => NavigationGraph | null) | NavigationGraph | null
): Router {
    const router = Router();
    
    // Store active graph instances per run (fallback if no navigation graph)
    const activeGraphs: Map<string, NavigationGraph> = new Map();
    
    // Throttling for graph_update emissions: max 1 update per 1000ms per run
    const graphUpdateThrottles: Map<string, NodeJS.Timeout | null> = new Map();
    const GRAPH_UPDATE_THROTTLE_MS = 1000; // 1 second
    
    /**
     * Helper to check if NavigationGraph is available
     * @returns NavigationGraph instance or null if unavailable
     */
    const checkNavigationGraphAvailability = (): NavigationGraph | null => {
        let navigationGraph: NavigationGraph | null = null;
        if (navigationGraphGetter) {
            if (typeof navigationGraphGetter === 'function') {
                navigationGraph = navigationGraphGetter();
            } else {
                navigationGraph = navigationGraphGetter;
            }
        }
        return navigationGraph;
    };
    
    // Helper to get graph instance for a run
    const getGraphForRun = async (_runId: string): Promise<NavigationGraph> => {
        const navigationGraph = checkNavigationGraphAvailability();
        
        // Navigation graph MUST be provided - no fallbacks
        if (!navigationGraph) {
            throw new ServiceUnavailableError('NavigationGraph instance must be provided. Neo4j connection is required.', {
                reason: 'neo4j_not_configured',
                operation: 'getNavigationGraph'
            });
        }
        
        return navigationGraph;
    };

    /**
     * Helper function to build graph data for a run
     * Reused by both GET /stream/:runId (polling) and SSE graph_update events
     */
    const buildGraphData = async (runId: string): Promise<GraphUpdateEventData | null> => {
        try {
            const run = await runManager.getRun(runId);
            if (!run) {
                return null;
            }

            const graph = await getGraphForRun(runId);
            const runParams = run.params || {};
            const runContext = (runParams as Record<string, unknown>).context as Record<string, unknown> | undefined || {};
            const startNodeUrl = typeof runContext.startNodeUrl === 'string' ? runContext.startNodeUrl : (runContext.startNodeUrl !== undefined ? String(runContext.startNodeUrl) : null);
            
            let startNode: { url: string; node: NavigationNode } | null = null;
            
            if (startNodeUrl) {
                const node = await graph.getNode(startNodeUrl);
                if (node) {
                    startNode = { url: startNodeUrl, node };
                }
            }
            
            if (!startNode) {
                const rootUrl = await graph.getRoot();
                if (rootUrl) {
                    const rootNode = await graph.getNode(rootUrl);
                    if (rootNode) {
                        startNode = { url: rootUrl, node: rootNode };
                    }
                }
            }

            if (!startNode) {
                const subgraph = await graph.getSubgraph({ maxNodes: 100, maxDepth: 2 });
                const nodesWithChildren = Object.values(subgraph.nodes).filter(n => n.children && n.children.length > 0);
                if (nodesWithChildren.length > 0) {
                    const firstNode = nodesWithChildren[0];
                    startNode = { url: firstNode.url, node: firstNode };
                }
            }

            if (!startNode) {
                const nodeCount = await graph.getNodeCount();
                return {
                    runId,
                    timestamp: new Date().toISOString(),
                    nodes: [],
                    edges: [],
                    stats: {
                        totalNodes: nodeCount.total,
                        totalEdges: 0
                    },
                    message: 'No starting node found'
                };
            }

            // Get visited nodes from run logs
            const visitedUrls = new Set<string>();
            const runLogs = run.logs || [];
            
            for (const log of runLogs) {
                const message = log.message || '';
                const urlMatch = message.match(/(?:BFS:\s*)?(?:Exploring|Crawling|Visiting):\s*(https?:\/\/[^\s)]+)/i);
                if (urlMatch && urlMatch[1]) {
                    visitedUrls.add(urlMatch[1]);
                }
                const generalUrls = message.match(/(https?:\/\/[^\s)]+)/g);
                if (generalUrls) {
                    generalUrls.forEach((url: string) => {
                        if (url.startsWith('http://') || url.startsWith('https://')) {
                            visitedUrls.add(url);
                        }
                    });
                }
            }
            
            visitedUrls.add(startNode.url);

            const nodesToReturn: Array<{
                id: string;
                url: string;
                title: string;
                type: 'page' | 'section' | 'document';
                children: string[];
                lastVisited?: string;
                depth: number;
            }> = [];
            const edgesToReturn: Array<{ source: string; target: string }> = [];
            
            const nodeDepths = new Map<string, number>();
            nodeDepths.set(startNode.url, 0);
            
            interface QueueItem {
                url: string;
                depth: number;
            }
            
            const queue: QueueItem[] = [{ url: startNode.url, depth: 0 }];
            const processed = new Set<string>();
            const nodeCache = new Map<string, NavigationNode>();
            nodeCache.set(startNode.url, startNode.node);
            
            // BFS to calculate depths and collect edges
            while (queue.length > 0) {
                const current = queue.shift()!;
                if (processed.has(current.url)) continue;
                
                processed.add(current.url);
                
                let currentNode = nodeCache.get(current.url);
                if (!currentNode) {
                    currentNode = await graph.getNode(current.url);
                    if (!currentNode) continue;
                    nodeCache.set(current.url, currentNode);
                }
                
                nodeDepths.set(current.url, current.depth);
                
                if (currentNode.children) {
                    for (const childUrl of currentNode.children) {
                        if (visitedUrls.has(childUrl)) {
                            edgesToReturn.push({
                                source: current.url,
                                target: childUrl
                            });
                        }
                        
                        if (!processed.has(childUrl)) {
                            queue.push({ url: childUrl, depth: current.depth + 1 });
                        }
                    }
                }
            }
            
            // Fetch all visited nodes
            const allVisitedUrls = Array.from(visitedUrls);
            const nodeFetchPromises = allVisitedUrls.map(async (url) => {
                if (nodeCache.has(url)) {
                    return { url, node: nodeCache.get(url)! };
                }
                const node = await graph.getNode(url);
                if (node) {
                    nodeCache.set(url, node);
                    return { url, node };
                }
                return null;
            });
            
            const fetchedNodes = (await Promise.all(nodeFetchPromises)).filter((item): item is { url: string; node: NavigationNode } => item !== null);
            
            for (const { url, node } of fetchedNodes) {
                const depth = nodeDepths.has(url) ? nodeDepths.get(url)! : -1;
                
                nodesToReturn.push({
                    id: url,
                    url: url,
                    title: node.title || url.split('/').pop() || url,
                    type: node.type,
                    children: node.children || [],
                    lastVisited: node.lastVisited,
                    depth: depth
                });
            }
            
            const startNodeIncluded = nodesToReturn.some(n => n.url === startNode.url);
            if (!startNodeIncluded) {
                nodesToReturn.unshift({
                    id: startNode.url,
                    url: startNode.url,
                    title: startNode.node.title || startNode.url.split('/').pop() || startNode.url,
                    type: startNode.node.type,
                    children: startNode.node.children || [],
                    lastVisited: startNode.node.lastVisited,
                    depth: 0
                });
            }
            
            const nodeUrlsInResponseFinal = new Set(nodesToReturn.map(n => n.url));
            const filteredEdgesFinal = edgesToReturn.filter(edge => 
                nodeUrlsInResponseFinal.has(edge.source) && nodeUrlsInResponseFinal.has(edge.target)
            );

            const nodeCount = await graph.getNodeCount();
            let totalEdges = 0;
            try {
                const graphStats = await graph.getStatistics();
                totalEdges = graphStats.totalEdges || 0;
            } catch (error) {
                totalEdges = filteredEdgesFinal.length;
            }
            
            return {
                runId,
                timestamp: new Date().toISOString(),
                nodes: nodesToReturn,
                edges: filteredEdgesFinal,
                stats: {
                    totalNodes: nodeCount.total,
                    totalEdges: totalEdges,
                    displayedNodeCount: nodesToReturn.length,
                    displayedEdgeCount: filteredEdgesFinal.length,
                    visitedNodes: visitedUrls.size,
                    startNodeUrl: startNodeUrl,
                    runStartTime: run.startTime ? new Date(run.startTime).getTime() : Date.now(),
                }
            };
        } catch (error) {
            // Log error but don't throw - allow polling fallback
            console.error(`[Graph Stream] Error building graph data for run ${runId}:`, error);
            return null;
        }
    };

    /**
     * Throttled function to emit graph_update events via SSE
     * Limits emissions to max 1 per GRAPH_UPDATE_THROTTLE_MS per run
     */
    const emitThrottledGraphUpdate = async (runId: string): Promise<void> => {
        // Clear existing throttle
        const existingThrottle = graphUpdateThrottles.get(runId);
        if (existingThrottle) {
            clearTimeout(existingThrottle);
        }

        // Set new throttle
        const throttleTimeout = setTimeout(async () => {
            graphUpdateThrottles.delete(runId);
            
            try {
                const graphData = await buildGraphData(runId);
                if (graphData) {
                    const { getSSEService } = await import('../services/infrastructure/SSEService.js');
                    const sseService = getSSEService();
                    sseService.emitGraphUpdate(runId, graphData);
                }
            } catch (error) {
                console.error(`[Graph Stream] Error emitting graph_update for run ${runId}:`, error);
            }
        }, GRAPH_UPDATE_THROTTLE_MS);

        graphUpdateThrottles.set(runId, throttleTimeout);
    };

    /**
     * GET /api/graph
     * Get navigation graph with optional visualization mode
     * Supports query parameters: mode, maxNodes, maxDepth, startNode
     */
    router.get('/', asyncHandler(async (req: Request, res: Response) => {
        // Get navigation graph instance
        const navigationGraph = checkNavigationGraphAvailability();
        
        if (!navigationGraph) {
            throw new ServiceUnavailableError('NavigationGraph instance must be provided. Neo4j connection is required.', {
                reason: 'neo4j_not_configured',
                operation: 'getGraph'
            });
        }

        // Parse query parameters
        const mode = req.query.mode as 'connected' | 'all' | 'clustered' | undefined;
        const maxNodes = parseIntQueryParam(req.query, 'maxNodes', 'limit');
        const maxDepth = parseIntQueryParam(req.query, 'maxDepth', 'depth');
        const startNode = req.query.startNode as string | undefined;

        try {
            // Get subgraph with specified parameters
            const subgraphData = await navigationGraph.getSubgraph({
                startNode,
                maxDepth,
                maxNodes
            });

            // Get graph statistics for accurate metadata
            let graphStats;
            try {
                graphStats = await navigationGraph.getStatistics();
            } catch (error) {
                // Fallback if statistics fail (e.g., in test environment)
                try {
                    const nodeCount = await navigationGraph.getNodeCount();
                    graphStats = {
                        totalNodes: nodeCount.total,
                        totalEdges: 0,
                    };
                } catch (nodeCountError) {
                    // If both statistics and nodeCount fail, Neo4j is likely unavailable
                    const errorMessage = nodeCountError instanceof Error ? nodeCountError.message : String(nodeCountError);
                    throw new ServiceUnavailableError(
                        `Failed to retrieve graph data. Neo4j connection may be unavailable: ${errorMessage}`,
                        {
                            reason: 'neo4j_connection_failed',
                            operation: 'getGraphStatistics',
                            originalError: errorMessage
                        }
                    );
                }
            }

            // Use actual node count from subgraph metadata, or calculate from nodes object
            const nodesReturned = subgraphData.metadata.nodesReturned ?? Object.keys(subgraphData.nodes).length;
            const edgesReturned = subgraphData.metadata.edgesReturned ?? 0;
            
            // Use depthLimit from subgraph metadata, or fallback to requested maxDepth, or default 3
            const depthLimit = subgraphData.metadata.depthLimit ?? maxDepth ?? 3;
            
            // Use startNode from subgraph metadata, or fallback to requested startNode
            const actualStartNode = subgraphData.metadata.startNode || startNode || '';

            // Transform to NavigationGraphResponse format
            const response = {
                nodes: subgraphData.nodes,
                rootUrl: subgraphData.rootUrl || '',
                mode,
                metadata: {
                    totalNodesInGraph: subgraphData.metadata.totalNodesInGraph ?? graphStats.totalNodes ?? 0,
                    nodesReturned,
                    totalEdgesInGraph: subgraphData.metadata.totalEdgesInGraph ?? graphStats.totalEdges ?? 0,
                    edgesReturned,
                    depthLimit,
                    startNode: actualStartNode,
                    visualizationMode: mode
                }
            };

            res.json(response);
        } catch (error) {
            // Handle Neo4j connection errors and other graph operation failures
            if (error instanceof ServiceUnavailableError) {
                throw error; // Re-throw ServiceUnavailableError as-is (already has 503 status)
            }
            
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isNeo4jError = errorMessage.includes('Neo4j') || 
                                errorMessage.includes('neo4j') ||
                                errorMessage.includes('ECONNREFUSED') ||
                                errorMessage.includes('connection') ||
                                errorMessage.includes('timeout');
            
            if (isNeo4jError) {
                throw new ServiceUnavailableError(
                    `Failed to retrieve graph data. Neo4j connection may be unavailable: ${errorMessage}`,
                    {
                        reason: 'neo4j_connection_failed',
                        operation: 'getSubgraph',
                        originalError: errorMessage
                    }
                );
            }
            
            // For other errors, re-throw as-is (will be handled by error handler as 500)
            throw error;
        }
    }));

    /**
     * GET /api/graph/stream/:runId
     * Stream real-time graph updates for a specific run
     * Returns only the most promising endpoint node to avoid browser crashes
     */
    router.get('/stream/:runId', asyncHandler(async (req: Request, res: Response) => {
        // Ensure runId is a string (Express params are strings, but be explicit)
        const runId = String(req.params.runId);
        
        // Check if run exists with retry logic to handle timing window
        // (run might not be immediately queryable after creation due to MongoDB write concern/indexing)
        let run: Run | null = null;
        let attempts = 0;
        const maxAttempts = 3;
        const retryDelay = 100; // 100ms
        
        while (attempts < maxAttempts && !run) {
            run = await runManager.getRun(runId);
            if (!run && attempts < maxAttempts - 1) {
                // Exponential backoff: 100ms, 200ms
                await new Promise(resolve => setTimeout(resolve, retryDelay * (attempts + 1)));
            }
            attempts++;
        }
        
        if (!run) {
            throw new NotFoundError('Run', runId);
        }

        try {
            // Get graph instance for this run (uses navigation graph if available)
            const graph = await getGraphForRun(runId);

            // Get starting node from run params.context or find most promising endpoint
            const runParams = run.params || {};
            const runContext = (runParams as Record<string, unknown>).context as Record<string, unknown> | undefined || {};
            // Extract startNodeUrl from context (keep original value even if null for stats)
            const startNodeUrl = typeof runContext.startNodeUrl === 'string' ? runContext.startNodeUrl : (runContext.startNodeUrl !== undefined ? String(runContext.startNodeUrl) : null);
            
            let startNode: { url: string; node: NavigationNode } | null = null;
            
            try {
                if (startNodeUrl) {
                    // Try to get the specified start node from Neo4j
                    const node = await graph.getNode(startNodeUrl);
                    if (node) {
                        startNode = {
                            url: startNodeUrl,
                            node
                        };
                    }
                }
                
                // If no start node specified or found, use root node or get a node with children
                if (!startNode) {
                    const rootUrl = await graph.getRoot();
                    if (rootUrl) {
                        const rootNode = await graph.getNode(rootUrl);
                        if (rootNode) {
                            startNode = {
                                url: rootUrl,
                                node: rootNode
                            };
                        }
                    }
                }

                // If still no start node, try to find any node with children (for fallback)
                if (!startNode) {
                    // Get a subgraph to find a node with children
                    const subgraph = await graph.getSubgraph({ maxNodes: 100, maxDepth: 2 });
                    const nodesWithChildren = Object.values(subgraph.nodes).filter(n => n.children && n.children.length > 0);
                    if (nodesWithChildren.length > 0) {
                        const firstNode = nodesWithChildren[0];
                        startNode = {
                            url: firstNode.url,
                            node: firstNode
                        };
                    }
                }
            } catch (graphError) {
                // Handle Neo4j connection errors when getting nodes
                if (graphError instanceof ServiceUnavailableError) {
                    throw graphError; // Re-throw ServiceUnavailableError as-is
                }
                
                const errorMessage = graphError instanceof Error ? graphError.message : String(graphError);
                const isNeo4jError = errorMessage.includes('Neo4j') || 
                                    errorMessage.includes('neo4j') ||
                                    errorMessage.includes('ECONNREFUSED') ||
                                    errorMessage.includes('connection') ||
                                    errorMessage.includes('timeout');
                
                if (isNeo4jError) {
                    throw new ServiceUnavailableError(
                        `Failed to retrieve graph nodes. Neo4j connection may be unavailable: ${errorMessage}`,
                        {
                            reason: 'neo4j_connection_failed',
                            operation: 'getGraphNodes',
                            originalError: errorMessage
                        }
                    );
                }
                
                // For other errors, re-throw
                throw graphError;
            }

            if (!startNode) {
                // Get total node count for stats
                try {
                    const nodeCount = await graph.getNodeCount();
                    return res.json({
                        runId,
                        timestamp: new Date().toISOString(),
                        nodes: [],
                        edges: [],
                        stats: {
                            totalNodes: nodeCount.total,
                            totalEdges: 0
                        },
                        message: 'No starting node found'
                    });
                } catch (nodeCountError) {
                    const errorMessage = nodeCountError instanceof Error ? nodeCountError.message : String(nodeCountError);
                    throw new ServiceUnavailableError(
                        `Failed to retrieve graph node count. Neo4j connection may be unavailable: ${errorMessage}`,
                        {
                            reason: 'neo4j_connection_failed',
                            operation: 'getNodeCount',
                            originalError: errorMessage
                        }
                    );
                }
            }

            // Get visited nodes - nodes visited DURING this run
            const visitedUrls = new Set<string>();
            const runLogs = run.logs || [];
            const runStartTime = run.startTime ? new Date(run.startTime).getTime() : Date.now();
            // Removed runEndTime - not used in current implementation
            
            // Extract visited URLs from logs (match various log formats)
            for (const log of runLogs) {
                const message = log.message || '';
                // Match: "BFS: Exploring URL", "Exploring: URL", "Crawling: URL", etc.
                const urlMatch = message.match(/(?:BFS:\s*)?(?:Exploring|Crawling|Visiting):\s*(https?:\/\/[^\s)]+)/i);
                if (urlMatch && urlMatch[1]) {
                    visitedUrls.add(urlMatch[1]);
                }
                // Also match URLs in general (any HTTP/HTTPS URL)
                const generalUrls = message.match(/(https?:\/\/[^\s)]+)/g);
                if (generalUrls) {
                    generalUrls.forEach((url: string) => {
                        // Include all HTTP/HTTPS URLs, not just IPLO
                        if (url.startsWith('http://') || url.startsWith('https://')) {
                            visitedUrls.add(url);
                        }
                    });
                }
            }
            
            // Always include the start node
            visitedUrls.add(startNode.url);
            
            console.log(`[Graph Stream] Found ${visitedUrls.size} visited nodes from logs for run ${runId}`);
            console.log(`[Graph Stream] Sample visited URLs:`, Array.from(visitedUrls).slice(0, 5));
            
            // Return ALL discovered pages that have been visited during this run
            // Don't limit by depth or connection - show everything that was discovered
            const nodesToReturn: Array<{
                id: string;
                url: string;
                title: string;
                type: 'page' | 'section' | 'document';
                children: string[];
                lastVisited?: string;
                depth: number; // BFS depth from start node (if connected), or -1 if not connected
            }> = [];
            const edgesToReturn: Array<{ source: string; target: string }> = [];
            
            // Track depth for each node (calculated via BFS for connected nodes)
            const nodeDepths = new Map<string, number>();
            nodeDepths.set(startNode.url, 0);
            
            // First, do BFS to calculate depths for connected nodes and collect edges
            interface QueueItem {
                url: string;
                depth: number;
            }
            
            const queue: QueueItem[] = [{ url: startNode.url, depth: 0 }];
            const processed = new Set<string>();
            const nodeCache = new Map<string, NavigationNode>();
            nodeCache.set(startNode.url, startNode.node);
            
            // BFS to calculate depths and collect edges (no depth limit - traverse all connected nodes)
            while (queue.length > 0) {
                const current = queue.shift()!;
                if (processed.has(current.url)) continue;
                
                processed.add(current.url);
                
                // Get node from cache or fetch from Neo4j
                let currentNode = nodeCache.get(current.url);
                if (!currentNode) {
                    currentNode = await graph.getNode(current.url);
                    if (!currentNode) continue;
                    nodeCache.set(current.url, currentNode);
                }
                
                // Track depth for connected nodes
                nodeDepths.set(current.url, current.depth);
                
                // Process children to collect edges and continue BFS
                if (currentNode.children) {
                    for (const childUrl of currentNode.children) {
                        // Add edge if child was visited during this run
                        if (visitedUrls.has(childUrl)) {
                            edgesToReturn.push({
                                source: current.url,
                                target: childUrl
                            });
                        }
                        
                        // Queue child if not processed
                        if (!processed.has(childUrl)) {
                            queue.push({ url: childUrl, depth: current.depth + 1 });
                        }
                    }
                }
            }
            
            // Now fetch ALL visited nodes (including disconnected ones)
            const allVisitedUrls = Array.from(visitedUrls);

            // Filter out URLs already in cache to minimize DB hits
            const urlsToFetch = allVisitedUrls.filter(url => !nodeCache.has(url));

            // Batch fetch missing nodes using optimized getNodes()
            if (urlsToFetch.length > 0) {
                const fetchedNodesBatch = await graph.getNodes(urlsToFetch);
                for (const node of fetchedNodesBatch) {
                    nodeCache.set(node.url, node);
                }
                // Fallback: if a queried URL is not in cache (e.g., node.url differs due to
                // URL normalization), fetch individually and cache under the queried URL
                // (consistent with BFS cache key convention above)
                for (const url of urlsToFetch) {
                    if (!nodeCache.has(url)) {
                        const node = await graph.getNode(url);
                        if (node) {
                            nodeCache.set(url, node);
                        }
                    }
                }
            }
            
            // Reconstruct the result from cache
            const fetchedNodes = allVisitedUrls
                .map(url => {
                    const node = nodeCache.get(url);
                    return node ? { url, node } : null;
                })
                .filter((item): item is { url: string; node: NavigationNode } => item !== null);
            
            // NOTE: We only use nodes from run logs, not lastVisited timestamps
            // This ensures we only show nodes that were actually visited during THIS run,
            // not nodes that were visited by other runs that happened to update lastVisited
            // after this run started. The run logs are the source of truth for this run.
            
            // Build nodes array from all visited nodes
            for (const { url, node } of fetchedNodes) {
                // Calculate depth: use BFS depth if available, otherwise -1 (disconnected)
                const depth = nodeDepths.has(url) ? nodeDepths.get(url)! : -1;
                
                nodesToReturn.push({
                    id: url,
                    url: url,
                    title: node.title || url.split('/').pop() || url,
                    type: node.type,
                    children: node.children || [],
                    lastVisited: node.lastVisited,
                    depth: depth
                });
            }
            
            // Always include start node if not already included
            const startNodeIncluded = nodesToReturn.some(n => n.url === startNode.url);
            if (!startNodeIncluded) {
                nodesToReturn.unshift({
                    id: startNode.url,
                    url: startNode.url,
                    title: startNode.node.title || startNode.url.split('/').pop() || startNode.url,
                    type: startNode.node.type,
                    children: startNode.node.children || [],
                    lastVisited: startNode.node.lastVisited,
                    depth: 0 // Start node is always depth 0
                });
            }
            
            // Filter edges to only include those between nodes we're returning
            const nodeUrlsInResponseFinal = new Set(nodesToReturn.map(n => n.url));
            const filteredEdgesFinal = edgesToReturn.filter(edge => 
                nodeUrlsInResponseFinal.has(edge.source) && nodeUrlsInResponseFinal.has(edge.target)
            );
            
            console.log(`[Graph Stream] Built subgraph: ${nodesToReturn.length} nodes (all discovered), ${filteredEdgesFinal.length} edges (filtered from ${edgesToReturn.length})`);
            
            // Log domain breakdown of returned nodes
            const domainBreakdown = new Map<string, number>();
            nodesToReturn.forEach(node => {
                try {
                    const domain = new URL(node.url).hostname;
                    domainBreakdown.set(domain, (domainBreakdown.get(domain) || 0) + 1);
                } catch (_e) {
                    // Invalid URL
                }
            });
            const domainStats = Array.from(domainBreakdown.entries())
                .map(([domain, count]) => `${domain}: ${count}`)
                .join(', ');
            console.log(`[Graph Stream] Returning ${nodesToReturn.length} nodes (all discovered pages), ${filteredEdgesFinal.length} edges (filtered from ${edgesToReturn.length}) for run ${runId}`);
            console.log(`[Graph Stream] Domain breakdown: ${domainStats}`);

            // Get total node count and edge count for stats
            let nodeCount;
            let totalEdges = 0;
            try {
                nodeCount = await graph.getNodeCount();
                try {
                    const graphStats = await graph.getStatistics();
                    totalEdges = graphStats.totalEdges || 0;
                } catch (error) {
                    // If getStatistics fails (e.g., in test environment), use displayed edge count as fallback
                    console.warn(`[Graph Stream] Failed to get graph statistics for run ${runId}, using displayed edge count:`, error);
                    totalEdges = filteredEdgesFinal.length;
                }
            } catch (nodeCountError) {
                const errorMessage = nodeCountError instanceof Error ? nodeCountError.message : String(nodeCountError);
                throw new ServiceUnavailableError(
                    `Failed to retrieve graph statistics. Neo4j connection may be unavailable: ${errorMessage}`,
                    {
                        reason: 'neo4j_connection_failed',
                        operation: 'getGraphStatistics',
                        originalError: errorMessage
                    }
                );
            }
            
            res.json({
                runId,
                timestamp: new Date().toISOString(),
                nodes: nodesToReturn,
                edges: filteredEdgesFinal, // Only forward navigation edges
                stats: {
                    totalNodes: nodeCount.total,
                    totalEdges: totalEdges,
                    displayedNodeCount: nodesToReturn.length,
                    displayedEdgeCount: filteredEdgesFinal.length,
                    visitedNodes: visitedUrls.size,
                    startNodeUrl: startNodeUrl,
                    runStartTime: runStartTime,
                    domainBreakdown: Object.fromEntries(domainBreakdown),
                    note: 'All discovered pages are shown, including disconnected nodes'
                }
            });
        } catch (error) {
            // Handle errors from getGraphForRun and graph operations
            if (error instanceof ServiceUnavailableError || error instanceof NotFoundError) {
                throw error; // Re-throw as-is (already has correct status code)
            }
            
            // For unexpected errors, wrap in ServiceUnavailableError if it's a connection issue
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isNeo4jError = errorMessage.includes('Neo4j') || 
                                errorMessage.includes('neo4j') ||
                                errorMessage.includes('ECONNREFUSED') ||
                                errorMessage.includes('connection') ||
                                errorMessage.includes('timeout');
            
            if (isNeo4jError) {
                throw new ServiceUnavailableError(
                    `Failed to retrieve graph stream data. Neo4j connection may be unavailable: ${errorMessage}`,
                    {
                        reason: 'neo4j_connection_failed',
                        operation: 'getGraphStream',
                        originalError: errorMessage
                    }
                );
            }
            
            // For other errors, re-throw as-is (will be handled by error handler as 500)
            throw error;
        }
    }));

    /**
     * POST /api/graph/stream/:runId/update
     * Update graph for a run (called by scrapers during execution)
     */
    router.post('/stream/:runId/update', asyncHandler(async (req: Request, res: Response) => {
        // Ensure runId is a string
        const runId = String(req.params.runId);
        const { node } = req.body;

        // Check if run exists
        const run = await runManager.getRun(runId);
        if (!run) {
            throw new NotFoundError('Run', runId);
        }

            // Get graph instance for this run (uses navigation graph if available)
            const graph = await getGraphForRun(runId);

            // Update graph with new node
            if (node && node.url) {
                await graph.addNode({
                    url: node.url,
                    type: node.type || 'page',
                    title: node.title,
                    children: node.children || [],
                    lastVisited: node.lastVisited || new Date().toISOString()
                });
                
                // Broadcast node count update via Socket.IO
                try {
                    const { getWebSocketService } = await import('../services/infrastructure/WebSocketService.js');
                    const webSocketService = getWebSocketService();
                    const io = webSocketService.getIO();
                    
                    if (io) {
                        const stats = await graph.getStatistics();
                        const nodeCount = await graph.getNodeCount();
                        
                        // Broadcast to run-specific room
                        io.to(`run:${runId}`).emit('graph:node-count', {
                            type: 'graph:node-count',
                            runId,
                            totalNodes: stats.totalNodes,
                            totalEdges: stats.totalEdges,
                            nodeCounts: nodeCount,
                            timestamp: new Date().toISOString()
                        });
                        
                        // Also broadcast globally for GraphPage listeners
                        io.emit('graph:node-count', {
                            type: 'graph:node-count',
                            runId,
                            totalNodes: stats.totalNodes,
                            totalEdges: stats.totalEdges,
                            nodeCounts: nodeCount,
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (error) {
                    // Silently fail if WebSocket service not available
                    // This is non-critical - graph updates still work
                }
                
                // Emit throttled graph_update event via SSE
                // This will build the full graph data and emit it to connected clients
                // Throttled to max 1 update per GRAPH_UPDATE_THROTTLE_MS
                emitThrottledGraphUpdate(runId).catch(error => {
                    // Log but don't fail the request if SSE emission fails
                    console.error(`[Graph Stream] Error emitting throttled graph update for run ${runId}:`, error);
                });
            }

        res.json({ success: true, runId });
    }));

    /**
     * GET /api/graph/stream/:runId/events
     * Server-Side Events (SSE) stream for real-time graph updates
     * Streams: graph_update events when nodes are added to the graph
     */
    router.get('/stream/:runId/events', asyncHandler(async (req: Request, res: Response) => {
        const runId = String(req.params.runId);
        
        // Verify run exists BEFORE setting any headers
        let run: Run | null = null;
        let attempts = 0;
        const maxAttempts = 3;
        const retryDelay = 100;
        
        while (attempts < maxAttempts && !run) {
            run = await runManager.getRun(runId);
            if (!run && attempts < maxAttempts - 1) {
                await new Promise(resolve => setTimeout(resolve, retryDelay * (attempts + 1)));
            }
            attempts++;
        }
        
        if (!run) {
            throw new NotFoundError('Run', runId);
        }

        // Get SSE service and register connection
        // WARNING: This sets headers! Any errors after this must be sent as SSE events
        const { getSSEService } = await import('../services/infrastructure/SSEService.js');
        const sseService = getSSEService();
        
        // Get Last-Event-ID header for reconnection support
        const lastEventId = req.headers['last-event-id'] as string | undefined;
        
        // If registration fails, we haven't set headers yet, so throw normally
        const connectionId = sseService.registerConnection(runId, res, lastEventId);

        // From this point on, headers are set - any errors must be sent as SSE events
        // Send initial ping to confirm connection
        sseService.emitEvent(runId, {
            type: 'ping',
            data: {
                message: 'Connected to graph stream',
                connectionId,
                timestamp: new Date().toISOString()
            }
        });

        // Send initial graph_update with current graph state
        // This allows clients to get the current state immediately without polling
        try {
            const initialGraphData = await buildGraphData(runId);
            if (initialGraphData) {
                sseService.emitGraphUpdate(runId, initialGraphData);
            }
        } catch (error) {
            // Log error but don't fail the connection - client can fall back to polling
            console.error(`[Graph Stream] Error sending initial graph_update for run ${runId}:`, error);
        }

        // Note: graph_update events will also be emitted by POST /stream/:runId/update
        // when nodes are added to the graph. This endpoint maintains the SSE connection.
    }));

    /**
     * DELETE /api/graph/stream/:runId
     * Clean up graph instance when run completes
     * Note: If using navigation graph, this only cleans up the run mapping, not the graph itself
     */
    router.delete('/stream/:runId', asyncHandler(async (req: Request, res: Response) => {
        const { runId } = req.params;
        // Get current navigation graph to check if we're using it
        const navigationGraph = checkNavigationGraphAvailability();
        // Only delete from activeGraphs if not using navigation graph
        if (!navigationGraph) {
            activeGraphs.delete(runId);
        }
        res.json({ success: true, message: '[i18n:apiMessages.graphStreamCleanedUp]' });
    }));

    /**
     * GET /api/graph/health
     * Health check endpoint for graph stream service
     * Returns status of navigation graph availability
     */
    router.get('/health', asyncHandler(async (_req: Request, res: Response) => {
        try {
            // Try to get navigation graph instance
            const navigationGraph = checkNavigationGraphAvailability();
            const healthy = navigationGraph !== null;
            
            res.status(healthy ? 200 : 503).json({
                healthy,
                available: healthy,
                initialized: healthy,
                timestamp: new Date().toISOString(),
                ...(healthy ? {} : { error: 'NavigationGraph instance not available. Neo4j connection required.' }),
            });
        } catch (error) {
            res.status(503).json({
                healthy: false,
                available: false,
                initialized: false,
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }));

    return router;
}

