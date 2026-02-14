/**
 * Graph-related workflow actions
 * 
 * Contains actions for:
 * - load_graph / init_graph - Load/initialize navigation graph
 * - save_graph / verify_graph - Save/verify navigation graph
 * - explore_iplo - Explore IPLO pages and build graph
 * - explore_external_links - Explore external links from IPLO pages
 */

import { WorkflowEngine } from '../../../services/workflow/WorkflowEngine.js';
import { RunManager } from '../../../services/workflow/RunManager.js';
import { NavigationGraph, type NavigationNode } from '../../../services/graphs/navigation/NavigationGraph.js';
import { GraphClusteringService } from '../../../services/graphs/navigation/GraphClusteringService.js';
import { IPLOScraper } from '../../../services/scraping/iploScraper.js';
import { asNumber, asString, asStringArray } from '../../workflowUtils.js';
import { logger } from '../../../utils/logger.js';
import { ServiceUnavailableError } from '../../../types/errors.js';
import { extractNavigationNodeTitle } from '../../../utils/navigationGraphUtils.js';

/**
 * Type for explore_iplo action parameters
 */
interface ExploreIploParams {
    maxDepth?: number;
    query?: string;
    randomness?: number;
}

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
                reason: 'neo4j_not_available'
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

/**
 * Register graph-related workflow actions
 * 
 * @param workflowEngine - Workflow engine instance
 * @param runManager - Run manager instance
 * @param navigationGraph - Optional NavigationGraph instance
 */
export function registerGraphActions(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    navigationGraph?: NavigationGraph | null
): void {
    const getGraph = createGetGraphFunction(navigationGraph || null);

    // load_graph / init_graph - Load/initialize navigation graph
    const loadGraphAction = async (_params: Record<string, unknown>, runId: string) => {
        const startTime = Date.now();
        const { graph } = await getGraph();
        
        // Get graph statistics with context
        const stats = await graph.getStatistics({ runId });
        const nodeCounts = await graph.getNodeCount();
        
        logger.info({
            runId,
            totalNodes: stats.totalNodes,
            totalEdges: stats.totalEdges,
            pageTypes: stats.pageTypes,
        }, 'Navigation graph initialized');
        
        const duration = Date.now() - startTime;
        // Log message removed per user request - detailed node counts are logged via logger.info above
        return { 
            graphLoaded: true,
            nodeCount: nodeCounts.total,
            nodeCounts,
            stats,
            duration
        };
    };

    workflowEngine.registerAction('load_graph', loadGraphAction);
    // Add alias for better naming (backward compatible)
    workflowEngine.registerAction('init_graph', loadGraphAction);

    // explore_iplo - Explore IPLO pages and build graph
    workflowEngine.registerAction('explore_iplo', async (params: ExploreIploParams, runId: string, signal?: AbortSignal) => {
        const { maxDepth = 2, query, randomness = 0 } = params;
        const { graph, clusteringService } = await getGraph();

        const scraper = new IPLOScraper(maxDepth);
        let targetScope: Set<string> | undefined;

        if (query) {
            await runManager.log(runId, `Semantische targeting actief voor zoekopdracht: "${query}"`, 'info');

            // Initialize SemanticMapper
            const { SemanticMapper } = await import('../../../services/semantic/SemanticMapper.js');
            const semanticMapper = new SemanticMapper(clusteringService);

            // Map query to clusters
            const targetClusterIds = await semanticMapper.mapQueryToClusters(query);

            if (targetClusterIds.length > 0) {
                // Get metaGraph to access cluster labels
                const metaGraph = await clusteringService.createMetaGraph();
                
                // Extract cluster labels for logging
                const clusterLabels = targetClusterIds
                    .map((clusterId: string) => {
                        const cluster = metaGraph.clusters[clusterId];
                        return cluster ? cluster.label : clusterId;
                    })
                    .filter((label: string | undefined) => label);

                await runManager.log(runId, `${targetClusterIds.length} relevante clusters geïdentificeerd: ${clusterLabels.join(', ')}`, 'info');

                // Resolve to URLs
                targetScope = new Set<string>();

                targetClusterIds.forEach((clusterId: string) => {
                    const cluster = metaGraph.clusters[clusterId];
                    if (cluster && cluster.children) {
                        cluster.children.forEach((url: string) => targetScope!.add(url));
                    }
                });

                await runManager.log(runId, `Doelbereik bevat ${targetScope.size} URLs`, 'info');
            } else {
                // Get graph stats for better diagnostic message
                const metaGraph = await clusteringService.createMetaGraph();
                const graphStats = await graph.getStatistics({ runId });
                
                if (graphStats.totalNodes === 0) {
                    await runManager.log(runId, 'Geen clusters gevonden: Navigatiegrafiek is leeg. IPLO eerst verkennen om grafiek op te bouwen. Volledige verkenning starten...', 'warn');
                } else if (metaGraph.totalClusters === 0) {
                    await runManager.log(runId, `Geen clusters gevonden: Grafiek heeft ${graphStats.totalNodes} nodes maar geen clusters voldoen aan minimum grootte drempel. Volledige verkenning starten...`, 'warn');
                } else {
                    await runManager.log(runId, `Geen clusters gevonden die overeenkomen met zoekopdracht "${query}". Grafiek heeft ${metaGraph.totalClusters} clusters maar geen match. Volledige verkenning starten...`, 'warn');
                }
                await runManager.log(runId, 'Geen relevante clusters gevonden. Volledige verkenning gestart.', 'warn');
            }
        }

        if (randomness > 0) {
            await runManager.log(runId, `Waarschijnlijkheidsverkenning ingeschakeld (Willekeur: ${randomness})`, 'info');
        }

        // Get graph statistics before exploration
        const statsBefore = await graph.getStatistics({ runId });
        logger.info({
            runId,
            totalNodes: statsBefore.totalNodes,
            totalEdges: statsBefore.totalEdges,
        }, 'Graph statistics before IPLO exploration');

        // Check for cancellation before long-running operation
        if (signal?.aborted) {
            throw new Error('Workflow cancelled');
        }

        // const extractionStats = await scraper.explore('', graph, runManager, runId, { targetScope, randomness, signal }); // Unused
        await scraper.explore('', graph, runManager, runId, { targetScope, randomness, signal });

        // Verify graph persistence after exploration
        const saveResult = await graph.save();
        
        // Get graph statistics after exploration
        const statsAfter = await graph.getStatistics({ runId });
        const nodesAdded = statsAfter.totalNodes - statsBefore.totalNodes;
        
        logger.info({
            runId,
            totalNodes: statsAfter.totalNodes,
            totalEdges: statsAfter.totalEdges,
            nodesAdded,
            nodesBefore: statsBefore.totalNodes,
        }, 'Graph statistics after IPLO exploration');
        
        await runManager.log(runId, `Navigatiegrafiek geverifieerd: ${saveResult.nodeCount} nodes opgeslagen in Neo4j${nodesAdded > 0 ? `+${nodesAdded}` : ''}`, 'info');

        return { 
            explored: true, 
            nodeCount: saveResult.nodeCount, 
            nodesAdded
        };
    });

    // save_graph / verify_graph - Save/verify navigation graph
    const saveGraphAction = async (_params: Record<string, unknown>, runId: string) => {
        const startTime = Date.now();
        const { graph } = await getGraph();
        
        // Get graph statistics before save
        const stats = await graph.getStatistics({ runId });
        logger.info({
            runId,
            totalNodes: stats.totalNodes,
            totalEdges: stats.totalEdges,
        }, 'Graph statistics before save/verify');
        
        // Ensure indexes are up to date (this is what save() actually does)
        const saveResult = await graph.save();
        const navGraphDuration = Date.now() - startTime;
        
        logger.info({
            runId,
            nodeCount: saveResult.nodeCount,
            duration: navGraphDuration,
        }, 'Navigation graph verified');
        
        await runManager.log(runId, `Navigatiegrafiek geverifieerd: ${saveResult.nodeCount} nodes opgeslagen in Neo4j [${navGraphDuration}ms]`, 'info');
        
        // Verify Knowledge Graph persistence (if enabled) - similar to save_scan_results
        let kgStats = null;
        try {
            const { FeatureFlag } = await import('../../../models/FeatureFlag.js');
            if (FeatureFlag.isKGEnabled()) {
                const { getGraphDBClient, connectGraphDB } = await import('../../../config/graphdb.js');
                const { GraphDBKnowledgeGraphService } = await import('../../../services/graphs/knowledge/GraphDBKnowledgeGraphService.js');
                
                await connectGraphDB();
                const kgClient = getGraphDBClient();
                const kgService = new GraphDBKnowledgeGraphService(kgClient);
                await kgService.initialize();
                
                kgStats = await kgService.getStats();
                
                await runManager.log(
                    runId,
                    `✅ Knowledge Graph persistence verified: ${kgStats.nodeCount} entities, ${kgStats.edgeCount} relationships`,
                    'info'
                );
            }
        } catch (kgError) {
            // Don't fail the workflow if KG verification fails (may not be configured)
            const kgErrorMsg = kgError instanceof Error ? kgError.message : String(kgError);
            const kgErrorType = kgError instanceof Error ? kgError.constructor.name : typeof kgError;
            
            // Build diagnostic information for better troubleshooting
            const diagnosticInfo = {
                error: kgErrorMsg,
                errorType: kgErrorType,
                graphdbUrl: process.env.GRAPHDB_URL || `${process.env.GRAPHDB_HOST || 'localhost'}:${process.env.GRAPHDB_PORT || '7200'}`,
                graphdbRepository: process.env.GRAPHDB_REPOSITORY || 'Beleidsscan_KG',
            };
            
            logger.warn({ 
                runId,
                ...diagnosticInfo
            }, 'KG persistence verification failed (may not be configured)');
            
            await runManager.log(
                runId,
                `⚠️ Knowledge Graph persistence verification skipped: ${kgErrorMsg}. Diagnostic: ${JSON.stringify(diagnosticInfo)}`,
                'warn'
            );
        }
        
        const totalDuration = Date.now() - startTime;
        
        return { 
            graphSaved: true,
            nodeCount: saveResult.nodeCount,
            stats,
            navGraphDuration,
            knowledgeGraph: kgStats ? {
                entityCount: kgStats.nodeCount,
                relationshipCount: kgStats.edgeCount
            } : null,
            duration: totalDuration
        };
    };

    workflowEngine.registerAction('save_graph', saveGraphAction);
    // Add alias for better naming (backward compatible)
    workflowEngine.registerAction('verify_graph', saveGraphAction);

    // explore_external_links - Explore external links from IPLO pages
    workflowEngine.registerAction('explore_external_links', async (params, runId) => {
        const startTime = Date.now();
        const maxExternalLinks = asNumber(params.maxExternalLinks) ?? 50;
        const { graph } = await getGraph();

        // Get initial state using optimized method
        const initialCounts = await graph.getNodeCount();
        const initialExternalCount = initialCounts.external;

        await runManager.log(runId, `Externe linkverkenning starten (max: ${maxExternalLinks})`, 'info');
        
        const scraper = new IPLOScraper(2); // Depth doesn't matter for external links
        const explorationStats = await scraper.exploreExternalLinks(graph, maxExternalLinks, runManager, runId);

        // Verify what was actually added using optimized method
        const finalCounts = await graph.getNodeCount();
        const finalExternalCount = finalCounts.external;
        const addedCount = finalExternalCount - initialExternalCount;

        const duration = Date.now() - startTime;

        if (addedCount > 0) {
            await runManager.log(runId, `Externe linkverkenning voltooid. ${addedCount} externe links toegevoegd (${finalExternalCount} totaal) [${duration}ms]`, 'info');
        } else if (explorationStats.totalCollected > 0) {
            await runManager.log(runId, `Externe linkverkenning voltooid maar geen nieuwe externe links toegevoegd. ${explorationStats.totalCollected} links verzameld maar mogelijk al bestaand (${finalExternalCount} totaal) [${duration}ms]`, 'warn');
        } else {
            await runManager.log(runId, `Externe linkverkenning voltooid maar geen externe links gevonden op IPLO-pagina's (${finalExternalCount} totaal) [${duration}ms]`, 'warn');
        }

        return { 
            externalLinksExplored: true,
            initialExternalCount,
            finalExternalCount,
            addedCount,
            explorationStats,
            duration
        };
    });

    // Helper function for safe fetch operations
    const createSafeFetch = (runManager: RunManager) => {
        return async (url: string, options: RequestInit, runId: string, warnPrefix = 'Fetch failed'): Promise<Response | null> => {
            try {
                return await fetch(url, options);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                await runManager.log(runId, `${warnPrefix}: ${url} (${message})`, 'warn');
                return null;
            }
        };
    };

    // Helper function to stream subgraph to frontend
    const streamSubgraphToFrontend = async (runId: string, nodes: { [url: string]: NavigationNode }): Promise<void> => {
        try {
            for (const [_url, node] of Object.entries(nodes)) {
                try {
                    const updateUrl = `http://localhost:${process.env.PORT || 4000}/api/graph/stream/${runId}/update`;
                    await fetch(updateUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            node: {
                                url: node.url,
                                type: node.type,
                                title: node.title,
                                children: node.children || []
                            }
                        })
                    });
                } catch (fetchError) {
                    logger.warn({ error: fetchError instanceof Error ? fetchError.message : String(fetchError), runId }, 'Could not stream subgraph node');
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } catch (error) {
            logger.warn({ error, runId }, 'Error streaming subgraph');
        }
    };

    // init_navigation_graph - Initialize navigation graph with stream endpoint
    workflowEngine.registerAction('init_navigation_graph', async (_params, runId) => {
        const { graph } = await getGraph();
        await graph.load();
        
        const safeFetch = createSafeFetch(runManager);
        
        // Initialize graph in stream router
        try {
            const streamUrl = `http://localhost:${process.env.PORT || 4000}/api/graph/stream/${runId}`;
            await safeFetch(streamUrl, {}, runId, 'Stream init failed');
            
            try {
                const allNodes = await graph.getAllNodes();
                for (const node of allNodes.slice(0, 50)) {
                    await safeFetch(`http://localhost:${process.env.PORT || 4000}/api/graph/stream/${runId}/update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            node: {
                                url: node.url,
                                type: node.type,
                                title: node.title,
                                children: node.children || []
                            }
                        })
                    }, runId, 'Stream update failed');
                }
            } catch (_err) {
                // Ignore bulk update errors
            }
        } catch (_error) {
            // Ignore - graph will be initialized when stream endpoint is first accessed
        }
        
        const nodeCounts = await graph.getNodeCount();
        await runManager.log(runId, `Navigatiegrafiek geïnitialiseerd met ${nodeCounts.total} bestaande nodes (${nodeCounts.iplo} IPLO, ${nodeCounts.external} extern)`, 'info');
        return { graphInitialized: true };
    });

    // find_relevant_nodes - Find relevant nodes in graph using semantic and keyword search
    workflowEngine.registerAction('find_relevant_nodes', async (params, runId) => {
        const onderwerp = asString(params.onderwerp) ?? '';
        const { graph } = await getGraph();
        
        await runManager.log(runId, `Relevante nodes zoeken voor zoekopdracht: ${onderwerp}`, 'info');
        
        const query = onderwerp || 'klimaatadaptatie';
        
        // Semantic search with keyword fallback
        const semanticResults = await graph.findSemanticallySimilar(query, 30);
        const semanticNodes = semanticResults.map(r => r.node);

        // Keyword fallback
        const keywordMatches: Array<{ node: NavigationNode; score: number }> = [];
        const queryLower = query.toLowerCase();
        const queryTerms = queryLower.split(/\s+/).filter((t: string) => t.length > 2);

        const allNodes = await graph.getAllNodes();
        for (const node of allNodes) {
            const title = (node.title || '').toLowerCase();
            const urlLower = node.url.toLowerCase();

            let score = 0;
            for (const term of queryTerms) {
                if (title.includes(term)) score += 0.5;
                if (urlLower.includes(term)) score += 0.3;
            }

            if (score > 0) {
                keywordMatches.push({ node, score });
            }
        }

        const keywordNodes = keywordMatches
            .sort((a, b) => b.score - a.score)
            .slice(0, 30)
            .map(r => r.node);

        // Merge semantic and keyword results, deduplicate
        const seen = new Set<string>();
        const relevantNodes = [...semanticNodes, ...keywordNodes].filter(n => {
            if (seen.has(n.url)) return false;
            seen.add(n.url);
            return true;
        }).slice(0, 30);
        
        const relevantUrls = relevantNodes.map(n => n.url);
        
        await runManager.log(runId, `${relevantNodes.length} relevante nodes gevonden in bestaande grafiek`, 'info');
        
        return {
            relevantNodes: relevantNodes,
            relevantUrls: relevantUrls,
            query: query
        };
    });

    // create_relevant_subgraph - Create subgraph from relevant nodes
    workflowEngine.registerAction('create_relevant_subgraph', async (params, runId) => {
        const relevantUrls = asStringArray(params.relevantUrls) ?? [];
        const { graph } = await getGraph();
        
        await runManager.log(runId, `Subnetwerk maken van ${relevantUrls.length} relevante nodes`, 'info');
        
        if (relevantUrls.length === 0) {
            await runManager.log(runId, 'Geen relevante nodes gevonden, starten vanaf root', 'warn');
            let root = '';
            try {
                root = await graph.getRoot();
            } catch (error) {
                logger.debug({ error, runId }, 'Failed to get root node, using fallback');
            }
            return {
                subgraphNodes: {},
                startNodes: [root || 'https://iplo.nl']
            };
        }
        
        const startNode = relevantUrls[0];
        const subgraph = await graph.getSubgraph({
            startNode,
            maxDepth: 2,
            maxNodes: 100
        });
        
        const subgraphNodes = { ...subgraph.nodes };
        for (const url of relevantUrls.slice(0, 10)) {
            const node = await graph.getNode(url);
            if (node) {
                subgraphNodes[url] = node;
            }
        }
        
        await streamSubgraphToFrontend(runId, subgraphNodes);
        
        await runManager.log(runId, `Subnetwerk gemaakt met ${Object.keys(subgraphNodes).length} nodes`, 'info');
        await runManager.log(runId, 'Relevante subnetwerk tonen vanuit bestaande navigatiegrafiek...', 'info');
        await runManager.log(runId, 'Uitbreiding starten vanaf relevante nodes...', 'info');
        
        return {
            subgraphNodes: subgraphNodes,
            startNodes: relevantUrls.slice(0, 5)
        };
    });

    // find_start_node - Find starting node for BFS exploration
    workflowEngine.registerAction('find_start_node', async (params, runId) => {
        const { graph } = await getGraph();
        const query = asString(params.onderwerp) || asString(params.query) || '';
        
        await runManager.log(runId, 'Startnode zoeken voor BFS...', 'info');
        
        // Optimized: Use Cypher query to find best start node
        const bestNodes = await graph.findStartNodes(query, 1);
        const bestNode = bestNodes.length > 0 ? bestNodes[0] : null;

        let root = '';
        try {
            root = await graph.getRoot();
        } catch (_error) {
            logger.debug({ error: _error, runId }, 'Failed to get root node, using fallback');
        }
        const startNodeUrl = bestNode ? bestNode.url : root || 'https://iplo.nl';
        
        await runManager.log(runId, `BFS starten vanaf: ${startNodeUrl}`, 'info');
        
        return { startNodeUrl };
    });

    // merge_into_main_graph - Merge expanded results into main graph
    workflowEngine.registerAction('merge_into_main_graph', async (_params, runId) => {
        const { graph } = await getGraph();
        
        await runManager.log(runId, 'Uitbreiding samenvoegen in hoofd-navigatienetwerk...', 'info');
        
        await graph.save();
        
        const stats = await graph.getStatistics();
        await runManager.log(runId, `Samenvoeging voltooid! Hoofdgrafiek heeft nu ${stats.totalNodes} nodes en ${stats.totalEdges} edges`, 'info');
        
        return { merged: true, stats };
    });

    // backfill_embeddings - Backfill embeddings for nodes without them
    workflowEngine.registerAction('backfill_embeddings', async (params, runId) => {
        const batchSize = asNumber(params.batchSize) ?? 50;
        const { graph } = await getGraph();
        
        await runManager.log(runId, `Embedding backfill starten (batchgrootte: ${batchSize})`, 'info');
        
        const result = await graph.backfillEmbeddings(batchSize, (processed, total) => {
            (async () => {
                try {
                    await runManager.log(runId, `Backfill voortgang: ${processed}/${total} nodes verwerkt`, 'info');
                } catch (err) {
                    logger.error({ error: err, runId }, 'Error logging backfill progress');
                }
            })();
        });
        
        await runManager.log(
            runId,
            `Backfill voltooid: ${result.processed} verwerkt, ${result.updated} bijgewerkt, ${result.errors} fouten`,
            'info'
        );
        
        return result;
    });

    // save_scan_results - Save scan results to graph
    workflowEngine.registerAction('save_scan_results', async (_params, runId) => {
        const { graph } = await getGraph();
        const startTime = Date.now();
        
        try {
            // Save and verify Navigation Graph persistence
            const saveResult = await graph.save();
            const nodeCounts = await graph.getNodeCount();
            const stats = await graph.getStatistics();
            const navGraphDuration = Date.now() - startTime;
            
            await runManager.log(
                runId,
                `Navigatiegrafiek opgeslagen: ${saveResult.nodeCount} nodes opgeslagen (${nodeCounts.iplo} IPLO, ${nodeCounts.external} extern, ${stats.totalEdges} edges) [${navGraphDuration}ms]`,
                'info'
            );
            
            // Verify Knowledge Graph persistence (if enabled)
            let kgStats = null;
            try {
                const { FeatureFlag } = await import('../../../models/FeatureFlag.js');
                if (FeatureFlag.isKGEnabled()) {
                    const { getGraphDBClient, connectGraphDB } = await import('../../../config/graphdb.js');
                    const { GraphDBKnowledgeGraphService } = await import('../../../services/graphs/knowledge/GraphDBKnowledgeGraphService.js');
                    
                    await connectGraphDB();
                    const kgClient = getGraphDBClient();
                    const kgService = new GraphDBKnowledgeGraphService(kgClient);
                    await kgService.initialize();
                    
                    kgStats = await kgService.getStats();
                    
                    await runManager.log(
                        runId,
                        `✅ Knowledge Graph persistence verified: ${kgStats.nodeCount} entities, ${kgStats.edgeCount} relationships`,
                        'info'
                    );

                    // Run PeriodicValidator for final integrity check (optional, non-blocking)
                    try {
                        const { PeriodicValidator } = await import('../../../services/knowledge-graph/PeriodicValidator.js');
                        // Note: PeriodicValidator expects KnowledgeGraphService, but GraphDBKnowledgeGraphService doesn't implement all methods
                        // Skip validation for GraphDB service for now
                        if (kgService instanceof (await import('../../../services/knowledge-graph/core/KnowledgeGraph.js')).KnowledgeGraphService) {
                            const periodicValidator = new PeriodicValidator(kgService);
                            const validationResult = await periodicValidator.runValidation();
                            
                            // Log validation results
                            if (validationResult.consistency.summary.totalViolations > 0) {
                                const errors = validationResult.consistency.summary.errors;
                                const warnings = validationResult.consistency.summary.warnings;
                                await runManager.log(
                                    runId,
                                    `⚠️ Knowledge Graph validation found ${validationResult.consistency.summary.totalViolations} violations (${errors} errors, ${warnings} warnings)`,
                                    'warn'
                                );
                            } else {
                                await runManager.log(runId, '✅ Knowledge Graph validation passed', 'info');
                            }
                        }
                    } catch (validationError) {
                        // Don't fail the workflow if validation fails
                        const validationErrorMsg = validationError instanceof Error ? validationError.message : String(validationError);
                        logger.warn({
                            error: validationErrorMsg,
                            runId
                        }, 'PeriodicValidator validation failed (non-blocking)');
                        
                        await runManager.log(
                            runId,
                            `⚠️ Knowledge Graph validation skipped: ${validationErrorMsg}`,
                            'warn'
                        );
                    }
                }
            } catch (kgError) {
                // Don't fail the workflow if KG verification fails (may not be configured)
                const kgErrorMsg = kgError instanceof Error ? kgError.message : String(kgError);
                const kgErrorType = kgError instanceof Error ? kgError.constructor.name : typeof kgError;
                
                // Build diagnostic information for better troubleshooting
                const diagnosticInfo = {
                    error: kgErrorMsg,
                    errorType: kgErrorType,
                    graphdbUrl: process.env.GRAPHDB_URL || `${process.env.GRAPHDB_HOST || 'localhost'}:${process.env.GRAPHDB_PORT || '7200'}`,
                    graphdbRepository: process.env.GRAPHDB_REPOSITORY || 'Beleidsscan_KG',
                };
                
                logger.warn({ 
                    runId,
                    ...diagnosticInfo
                }, 'KG persistence verification failed (may not be configured)');
                
                await runManager.log(
                    runId,
                    `⚠️ Knowledge Graph persistence verification skipped: ${kgErrorMsg}. Diagnostic: ${JSON.stringify(diagnosticInfo)}`,
                    'warn'
                );
            }
            
            const totalDuration = Date.now() - startTime;
            
            return { 
                resultsSaved: true,
                nodeCount: saveResult.nodeCount,
                nodeCounts,
                stats,
                navGraphDuration,
                knowledgeGraph: kgStats ? {
                    entityCount: kgStats.nodeCount,
                    relationshipCount: kgStats.edgeCount
                } : null,
                duration: totalDuration
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await runManager.log(runId, `Navigatiegrafiek opslaan mislukt: ${errorMsg}`, 'error');
            throw error;
        }
    });

    // expand_from_relevant_nodes - Expand graph from relevant nodes in subgraph
    workflowEngine.registerAction('expand_from_relevant_nodes', async (params, runId) => {
        const startNodes = asStringArray(params.startNodes) ?? [];
        const onderwerp = asString(params.onderwerp);
        const subgraphNodes =
            params.subgraphNodes && typeof params.subgraphNodes === 'object'
                ? (params.subgraphNodes as Record<string, NavigationNode>)
                : ({} as Record<string, NavigationNode>);
        const scraper = new IPLOScraper(2);
        const { graph } = await getGraph();
        
        await runManager.log(runId, `🎨 Visueel uitbreiden vanaf ${startNodes.length} relevante nodes in subnetwerk...`, 'info');
        
        // Stream node updates with visual delay
        const streamNodeUpdate = async (node: NavigationNode, delay: number = 300) => {
            try {
                const updateUrl = `http://localhost:${process.env.PORT || 4000}/api/graph/stream/${runId}/update`;
                try {
                    await fetch(updateUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ node })
                    });
                } catch (fetchError) {
                    logger.warn({ error: fetchError instanceof Error ? fetchError.message : String(fetchError), runId }, 'Could not stream graph update');
                }
                
                // Add delay for visual effect - nodes appear one by one
                if (delay > 0) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } catch (error) {
                logger.warn({ error, runId }, 'Error streaming graph update');
            }
        };
        
        // Track which nodes are in the subgraph (already displayed)
        const subgraphUrls = new Set(Object.keys(subgraphNodes));
        let newNodeCount = 0;

        // Wrapper to add nodes and stream without monkey-patching navigation graph
        const context = params as Record<string, unknown>;
        const workflowId = context.workflowId as string | undefined;
        const addNodeWithStreaming = async (node: NavigationNode): Promise<void> => {
            await graph.addNode(node, { runId, workflowId });

            if (!subgraphUrls.has(node.url)) {
                newNodeCount++;
                try {
                    await streamNodeUpdate({
                        url: node.url,
                        type: node.type || 'page',
                        title: node.title,
                        children: node.children || []
                    }, 200);
                } catch (err) {
                    logger.error({ error: err, runId }, 'Error in delayed stream update');
                }
            }
        };
        
        // Expand from each start node in the subgraph
        // This will visually grow the graph outward from the subgraph nodes
        const mockQuery = onderwerp || 'klimaatadaptatie';
        
        for (let i = 0; i < Math.min(startNodes.length, 3); i++) { // Expand from top 3 nodes
            const startUrl = startNodes[i];
            const startNode = await graph.getNode(startUrl);
            
            if (!startNode) {
                await runManager.log(runId, `Startnode niet gevonden: ${startUrl}`, 'warn');
                continue;
            }
            
            await runManager.log(runId, `Uitbreiden vanaf subnetwerknode: ${startNode.title || startUrl}`, 'info');
            
            // Explore from this specific node - this will discover new pages linked from it
            // The scraper will add new nodes as children, creating visual expansion
            try {
                // Use the scraper's explorePage method directly to start from this node
                // We need to access the private method, so we'll use a workaround
                // Create a custom exploration that starts from this node
                await exploreFromNode(scraper, startUrl, graph, runManager, runId, {
                    maxDepth: 2, // Expand 2 levels from each start node
                    query: mockQuery
                }, addNodeWithStreaming, workflowId);
            } catch (error) {
                await runManager.log(runId, `Fout bij uitbreiden vanaf ${startUrl}: ${error}`, 'error');
            }
            
            // Small delay between expanding from different nodes
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        await runManager.log(runId, `Uitbreiding voltooid! ${newNodeCount} nieuwe nodes toegevoegd verbonden met subnetwerk`, 'info');
        
        // Ensure graph is saved after adding nodes
        if (newNodeCount > 0) {
            try {
                await graph.save();
                const nodeCounts = await graph.getNodeCount();
                await runManager.log(runId, `Navigatiegrafiek opgeslagen: ${nodeCounts.total} totaal nodes na uitbreiding (${nodeCounts.iplo} IPLO, ${nodeCounts.external} extern)`, 'info');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                await runManager.log(runId, `Navigatiegrafiek opslaan mislukt: ${errorMsg}`, 'warn');
                // Don't fail the workflow if graph save fails
            }
        }
        
        return { expanded: true, newNodeCount };
    });
    
    // Helper function to explore from a specific node
    async function exploreFromNode(
        scraper: IPLOScraper,
        startUrl: string,
        graph: NavigationGraph,
        runManager: RunManager,
        runId: string,
        options: { maxDepth: number; query: string },
        addNode?: (node: NavigationNode) => Promise<void>,
        workflowId?: string
    ): Promise<void> {
        // Get the start node
        const startNode = await graph.getNode(startUrl);
        if (!startNode) return;
        // Create wrapper that ensures addNode returns the result and includes workflowId
        const addNodeFn = addNode || ((node: NavigationNode) => graph.addNode(node, { runId, workflowId }));
        
        // Use IPLO scraper's query functionality to find related pages
        // This will discover new documents related to the query
        const documents = await scraper.scrapeByQuery(options.query, options.query, runManager, runId);
        
        // Add discovered documents as children of the start node
        // This creates visual expansion - new nodes connected to the subgraph
        const newChildren: string[] = [];
        for (const doc of documents.slice(0, 8)) { // Limit to 8 new nodes per expansion for visual clarity
            // Map DocumentType to NavigationNode type
            const nodeType: 'page' | 'section' | 'document' = 
                doc.type_document === 'PDF' || doc.type_document === 'Rapport' || doc.type_document === 'Beleidsdocument' 
                    ? 'document' 
                    : 'page';
            
            // Canonically use doc.title if available, otherwise fall back to doc.titel
            const docTitle = ('title' in doc && typeof (doc as any).title === 'string') 
                ? (doc as any).title 
                : doc.titel;
            const newNode = {
                url: doc.url,
                type: nodeType,
                title: extractNavigationNodeTitle({ title: docTitle, canonicalUrl: doc.url }, doc.url),
                children: [],
                lastVisited: new Date().toISOString()
            };
            
            // Always call addNode - it will handle existing nodes and return 'added', 'updated', or 'unchanged'
            // This ensures nodes are properly persisted even if they already exist
            const addResult = await addNodeFn(newNode);
            
            // Only add to children list if node was actually added or updated (not just unchanged)
            if (addResult === 'added' || addResult === 'updated') {
                newChildren.push(doc.url);
            }
        }
        
        // Update start node with new children (this creates the visual connection)
        // The edges will show new nodes connected to the subgraph
        if (newChildren.length > 0) {
            startNode.children = [...(startNode.children || []), ...newChildren];
            await addNodeFn(startNode); // Update the node with new children
            
            // Also stream the updated start node so the frontend sees the new connections
            try {
                const updateUrl = `http://localhost:${process.env.PORT || 4000}/api/graph/stream/${runId}/update`;
                await fetch(updateUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        node: {
                            url: startNode.url,
                            type: startNode.type,
                            title: startNode.title,
                            children: startNode.children
                        }
                    })
                }).catch(() => {});
            } catch (_error) {
                // Ignore streaming errors
            }
        }
    }
}


