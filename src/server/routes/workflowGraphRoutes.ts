import express, { Request, Response } from 'express';
import { NavigationGraph, NavigationNode } from '../services/graphs/navigation/NavigationGraph.js';
import { GraphClusteringService } from '../services/graphs/navigation/GraphClusteringService.js';
import { GraphStructureBuilder } from '../services/graphs/navigation/GraphStructureBuilder.js';
import { RelationshipBuilderService } from '../services/graphs/navigation/RelationshipBuilderService.js';
import { LocalEmbeddingProvider } from '../services/query/VectorService.js';
import { getNeo4jDriver } from '../config/neo4j.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';
import { workflowSchemas } from '../validation/workflowSchemas.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { parseIntQueryParam } from '../utils/queryUtils.js';
import { NotFoundError, BadRequestError, ServiceUnavailableError } from '../types/errors.js';
import { parseDate } from '../utils/dateUtils.js';

/**
 * Creates a router for graph-related endpoints
 * @param navigationGraph - Optional NavigationGraph instance (must be initialized with Neo4j)
 * @returns Express router with graph routes
 */
export function createWorkflowGraphRouter(navigationGraph?: NavigationGraph) {
    const router = express.Router();

    // Navigation graph instance provided via dependency injection
    // Initialize clustering service immediately if graph is provided
    let clusteringService: GraphClusteringService | null = navigationGraph 
        ? new GraphClusteringService(navigationGraph)
        : null;

    // Register clustering service cache invalidator with the graph
    if (navigationGraph && clusteringService) {
        navigationGraph.registerClusteringServiceInvalidator(() => {
            clusteringService?.invalidateCache();
        });
    }

    const getGraph = async () => {
        // Graph MUST be provided via dependency injection (already initialized with Neo4j)
        if (!navigationGraph) {
            throw new ServiceUnavailableError('NavigationGraph must be initialized with Neo4j driver. Neo4j connection is required.');
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

    // GET /api/graph
    // Get navigation graph data (limited subset)
    // Supports multiple visualization modes: 'connected' (default), 'all', 'clustered'
    router.get('/graph', asyncHandler(async (req: Request, res: Response) => {
        const { graph, clusteringService } = await getGraph();

        // Parse query parameters
        // Ensure maxNodes is an integer (Neo4j LIMIT requires integer, not float)
        const maxNodes = parseIntQueryParam(req.query, 'maxNodes', 'limit', 500) ?? 500;
        const maxDepth = parseIntQueryParam(req.query, 'maxDepth', 'depth', 3) ?? 3;
        const startNode = req.query.startNode as string | undefined;
        const mode = (req.query.mode as 'connected' | 'all' | 'clustered') || 'connected';

        // Parse filter parameters
        const filters: {
            documentType?: string | string[];
            publishedAfter?: string;
            publishedBefore?: string;
            publisherAuthority?: string | string[];
            recentlyPublished?: string;
            recentlyVisited?: string;
            lastVisitedAfter?: string;
            lastVisitedBefore?: string;
        } = {};

        // Document type filter
        if (req.query.documentType) {
            const docType = req.query.documentType;
            filters.documentType = Array.isArray(docType) ? docType as string[] : docType as string;
        }

        // Publisher authority filter
        if (req.query.publisherAuthority) {
            const pubAuth = req.query.publisherAuthority;
            filters.publisherAuthority = Array.isArray(pubAuth) ? pubAuth as string[] : pubAuth as string;
        }

        // Published date filters
        if (req.query.publishedAfter) {
            filters.publishedAfter = req.query.publishedAfter as string;
        }
        if (req.query.publishedBefore) {
            filters.publishedBefore = req.query.publishedBefore as string;
        }
        if (req.query.recentlyPublished) {
            filters.recentlyPublished = req.query.recentlyPublished as string;
        }

        // Last visited date filters
        if (req.query.lastVisitedAfter) {
            filters.lastVisitedAfter = req.query.lastVisitedAfter as string;
        }
        if (req.query.lastVisitedBefore) {
            filters.lastVisitedBefore = req.query.lastVisitedBefore as string;
        }
        if (req.query.recentlyVisited) {
            filters.recentlyVisited = req.query.recentlyVisited as string;
        }

        // Only include filters object if it has at least one property
        const hasFilters = Object.keys(filters).length > 0;

        let subgraph: {
            nodes: { [url: string]: NavigationNode };
            rootUrl: string;
            mode?: string;
            metadata: {
                totalNodesInGraph: number;
                nodesReturned: number;
                totalEdgesInGraph?: number;
                edgesReturned?: number;
                depthLimit?: number;
                startNode?: string;
                visualizationMode?: string;
                totalClusters?: number;
            };
        };

        switch (mode) {
            case 'all': {
                // Return all nodes (flat view)
                const allNodes = await graph.getAllNodes();
                const stats = await graph.getStatistics();

                // Apply filters if provided
                let filteredNodes = allNodes;
                if (hasFilters) {
                    filteredNodes = allNodes.filter(node => {
                        // Document type filter
                        if (filters.documentType) {
                            const docTypes = Array.isArray(filters.documentType) ? filters.documentType : [filters.documentType];
                            if (!node.documentType || !docTypes.includes(node.documentType)) {
                                return false;
                            }
                        }

                        // Publisher authority filter
                        if (filters.publisherAuthority) {
                            const pubAuths = Array.isArray(filters.publisherAuthority) ? filters.publisherAuthority : [filters.publisherAuthority];
                            if (!node.publisherAuthority || !pubAuths.includes(node.publisherAuthority)) {
                                return false;
                            }
                        }

                        // Published date filters
                        if (filters.publishedAfter && node.publishedAt) {
                            if (node.publishedAt < filters.publishedAfter) {
                                return false;
                            }
                        }
                        if (filters.publishedBefore && node.publishedAt) {
                            if (node.publishedAt > filters.publishedBefore) {
                                return false;
                            }
                        }
                        if (filters.recentlyPublished && node.publishedAt) {
                            try {
                                const cutoffDate = parseDate(filters.recentlyPublished);
                                if (node.publishedAt < cutoffDate) {
                                    return false;
                                }
                            } catch {
                                // Skip filter if date parsing fails
                            }
                        }

                        // Last visited date filters
                        if (filters.lastVisitedAfter && node.lastVisited) {
                            if (node.lastVisited < filters.lastVisitedAfter) {
                                return false;
                            }
                        }
                        if (filters.lastVisitedBefore && node.lastVisited) {
                            if (node.lastVisited > filters.lastVisitedBefore) {
                                return false;
                            }
                        }
                        if (filters.recentlyVisited && node.lastVisited) {
                            try {
                                const cutoffDate = parseDate(filters.recentlyVisited);
                                if (node.lastVisited < cutoffDate) {
                                    return false;
                                }
                            } catch {
                                // Skip filter if date parsing fails
                            }
                        }

                        return true;
                    });
                }

                // Limit by maxNodes and order by updatedAt DESC (most recent first)
                interface NodeWithTime {
                    updatedAt?: string;
                    lastVisited?: string;
                }
                const limitedNodes = filteredNodes
                    .sort((a, b) => {
                        const aTime = (a as NodeWithTime).updatedAt || a.lastVisited || '';
                        const bTime = (b as NodeWithTime).updatedAt || b.lastVisited || '';
                        return bTime.localeCompare(aTime);
                    })
                    .slice(0, maxNodes);

                // Convert to nodes object format
                const nodes: { [url: string]: NavigationNode } = {};
                for (const node of limitedNodes) {
                    nodes[node.url] = node;
                }

                const rootUrl = await graph.getRoot();
                subgraph = {
                    nodes,
                    rootUrl,
                    mode: 'all',
                    metadata: {
                        totalNodesInGraph: stats.totalNodes,
                        nodesReturned: limitedNodes.length,
                        visualizationMode: 'all'
                    }
                };
                break;
            }

            case 'clustered': {
                // Return clustered view
                clusteringService.invalidateCache(); // Ensure fresh data
                const metaGraph = await clusteringService.createMetaGraph({
                    pathDepth: maxDepth,
                    minClusterSize: 1
                });

                // Convert meta-graph to subgraph format
                // Get all nodes from clusters
                const nodes: { [url: string]: NavigationNode } = {};
                const clusterNodeUrls = new Set<string>();

                // Collect all node URLs from clusters
                for (const cluster of Object.values(metaGraph.clusters)) {
                    for (const url of cluster.children) {
                        clusterNodeUrls.add(url);
                    }
                }

                // Fetch nodes up to maxNodes limit
                const urlsToFetch = Array.from(clusterNodeUrls).slice(0, maxNodes);
                const fetchedNodes = await graph.getNodes(urlsToFetch);

                for (const node of fetchedNodes) {
                    nodes[node.url] = node;
                }

                const rootUrl = await graph.getRoot();
                subgraph = {
                    nodes,
                    rootUrl,
                    mode: 'clustered',
                    metadata: {
                        totalNodesInGraph: metaGraph.totalNodes,
                        nodesReturned: Object.keys(nodes).length,
                        visualizationMode: 'clustered',
                        totalClusters: metaGraph.totalClusters
                    }
                };
                break;
            }

            case 'connected':
            default: {
                // Return connected graph (BFS from root) - existing behavior
                const connectedSubgraph = await graph.getSubgraph({
                    maxNodes,
                    maxDepth,
                    startNode,
                    ...(hasFilters && { filters })
                });
                subgraph = {
                    ...connectedSubgraph,
                    mode: 'connected',
                    metadata: {
                        ...connectedSubgraph.metadata,
                        visualizationMode: 'connected'
                    }
                };
                break;
            }
        }

        res.json(subgraph);
    }));

    // GET /api/graph/meta
    // Get meta-graph (clustered view of the navigation graph)
    router.get('/graph/meta', asyncHandler(async (req: Request, res: Response) => {
        logger.debug({ depth: req.query.depth, minSize: req.query.minSize }, 'GET /graph/meta request received');
        const startTime = Date.now();

        const { graph, clusteringService } = await getGraph();

        // Parse query parameters - adjusted for theme-level clustering
        const depth = parseIntQueryParam(req.query, 'pathDepth', undefined, 2) ?? 2; // Theme level (e.g., /thema/bodem)
        const minSize = parseIntQueryParam(req.query, 'minClusterSize', undefined, 20) ?? 20; // Filter small clusters

        // Check if graph has any nodes before generating meta-graph
        const nodeCount = await graph.getNodeCount();
        logger.debug({ totalNodes: nodeCount.total, depth, minSize }, 'Graph node count before meta-graph generation');

        // If graph is empty, return empty meta-graph immediately
        if (nodeCount.total === 0) {
            logger.info('Navigation graph is empty - returning empty meta-graph');
            const emptyMetaGraph = {
                clusters: {},
                edges: [],
                totalNodes: 0,
                totalClusters: 0
            };
            const elapsed = Date.now() - startTime;
            logger.debug({ elapsed }, 'Empty meta-graph returned');
            res.json(emptyMetaGraph);
            return;
        }

        // Invalidate cache to ensure fresh data (especially after workflow runs)
        clusteringService.invalidateCache();

        logger.debug({ depth, minSize }, 'Generating meta-graph');
        const metaGraph = await clusteringService.createMetaGraph({
            pathDepth: depth,
            minClusterSize: minSize
        });

        const elapsed = Date.now() - startTime;
        logger.debug({
            elapsed,
            depth,
            minSize,
            totalNodes: metaGraph.totalNodes,
            totalClusters: metaGraph.totalClusters
        }, 'Meta-graph generated');
        res.json(metaGraph);
    }));

    // GET /api/graph/cluster/:id
    // Get details of a specific cluster
    router.get('/graph/cluster/:id', validate(workflowSchemas.getCluster), asyncHandler(async (req: Request, res: Response) => {
        const { clusteringService } = await getGraph();
        // Use same parameters as meta endpoint to ensure cluster IDs match
        const pathDepth = parseIntQueryParam(req.query, 'pathDepth', undefined, 3) ?? 3;
        const minClusterSize = parseIntQueryParam(req.query, 'minClusterSize', undefined, 10) ?? 10;
        const metaGraph = await clusteringService.createMetaGraph({ pathDepth, minClusterSize });

        const cluster = metaGraph.clusters[req.params.id];

        if (!cluster) {
            throw new NotFoundError('Cluster', req.params.id);
        }

        res.json(cluster);
    }));

    // GET /api/graph/cluster/:id/expand
    // Expand a cluster to show its underlying nodes
    router.get('/graph/cluster/:id/expand', validate(workflowSchemas.expandCluster), asyncHandler(async (req: Request, res: Response) => {
        const { clusteringService } = await getGraph();
        // Use same parameters as meta endpoint to ensure cluster IDs match
        const pathDepth = parseIntQueryParam(req.query, 'pathDepth', undefined, 3) ?? 3;
        const minClusterSize = parseIntQueryParam(req.query, 'minClusterSize', undefined, 10) ?? 10;
        const metaGraph = await clusteringService.createMetaGraph({ pathDepth, minClusterSize });

        const cluster = metaGraph.clusters[req.params.id];

        if (!cluster) {
            throw new NotFoundError('Cluster', req.params.id);
        }

        // Parse query parameters for expansion options
        const maxNodes = parseIntQueryParam(req.query, 'maxNodes', undefined, 500) ?? 500;
        const maxDepth = parseIntQueryParam(req.query, 'maxDepth', undefined, 3) ?? 3;

        const subgraph = await clusteringService.getClusterSubgraph(cluster, {
            maxNodes,
            maxDepth
        });

        res.json(subgraph);
    }));

    // GET /api/graph/meta/visualization
    // Get visualization data with node positions for the meta-graph
    router.get('/graph/meta/visualization', validate(workflowSchemas.getMetaGraphVisualization), asyncHandler(async (req: Request, res: Response) => {
        const { clusteringService } = await getGraph();

        // Parse query parameters for meta-graph creation
        const pathDepth = parseIntQueryParam(req.query, 'pathDepth', undefined, 2) ?? 2;
        const minClusterSize = parseIntQueryParam(req.query, 'minClusterSize', undefined, 20) ?? 20;

        // Create meta-graph
        const metaGraph = await clusteringService.createMetaGraph({
            pathDepth,
            minClusterSize
        });

        // Parse query parameters for visualization
        const layout = (req.query.layout as 'grid' | 'force' | 'circular' | 'hierarchical') || 'grid';
        const width = parseIntQueryParam(req.query, 'width', undefined, 2000) ?? 2000;
        const height = parseIntQueryParam(req.query, 'height', undefined, 1500) ?? 1500;
        const nodeSpacing = parseIntQueryParam(req.query, 'nodeSpacing', undefined, 300) ?? 300;
        const iterations = parseIntQueryParam(req.query, 'iterations', undefined, 100) ?? 100;

        // Generate visualization data
        const visualization = clusteringService.generateVisualizationData(metaGraph, {
            layout,
            width,
            height,
            nodeSpacing,
            iterations
        });

        res.json(visualization);
    }));

    // GET /api/graph/meta/export
    // Export meta-graph in JSON or GraphML format
    router.get('/graph/meta/export', validate(workflowSchemas.exportMetaGraph), asyncHandler(async (req: Request, res: Response) => {
        const { clusteringService } = await getGraph();

        // Parse query parameters for meta-graph creation
        const pathDepth = parseIntQueryParam(req.query, 'pathDepth', undefined, 2) ?? 2;
        const minClusterSize = parseIntQueryParam(req.query, 'minClusterSize', undefined, 20) ?? 20;

        // Create meta-graph
        const metaGraph = await clusteringService.createMetaGraph({
            pathDepth,
            minClusterSize
        });

        // Parse export options (validation middleware transforms string 'true'/'false' to booleans)
        const format = (req.query.format as 'json' | 'graphml') || 'json';
        const includePositions = typeof req.query.includePositions === 'boolean'
            ? req.query.includePositions
            : req.query.includePositions === 'true';
        const includeMetadata = typeof req.query.includeMetadata === 'boolean'
            ? req.query.includeMetadata
            : req.query.includeMetadata !== 'false'; // Default to true if not specified

        // Export based on format
        if (format === 'json') {
            const json = clusteringService.exportToJSON(metaGraph, {
                includePositions,
                includeMetadata
            });
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename="meta-graph.json"');
            res.send(json);
        } else if (format === 'graphml') {
            const graphml = clusteringService.exportToGraphML(metaGraph, {
                includePositions
            });
            res.setHeader('Content-Type', 'application/xml');
            res.setHeader('Content-Disposition', 'attachment; filename="meta-graph.graphml"');
            res.send(graphml);
        } else {
            throw new BadRequestError('Invalid format. Use "json" or "graphml"');
        }
    }));

    // GET /api/graph/health
    // Get navigation graph health status
    router.get('/graph/health', asyncHandler(async (_req: Request, res: Response) => {
        // Handle case where graph is not initialized
        if (!navigationGraph) {
            return res.status(200).json({
                status: 'critical' as const,
                totalNodes: 0,
                totalEdges: 0,
                connectivity: {
                    hasRoot: false,
                    isolatedNodes: 0,
                    connectedNodes: 0,
                    connectivityRatio: 0
                },
                recommendations: ['NavigationGraph is not initialized. Neo4j connection may be required.']
            });
        }

        const { graph } = await getGraph();

        // Get graph statistics
        const stats = await graph.getStatistics();
        const totalNodes = stats.totalNodes;
        const totalEdges = stats.totalEdges;

        // Get root URL
        const rootUrl = await graph.getRoot();
        const hasRoot = !!rootUrl;

        // Get isolated nodes
        const isolatedNodeUrls = await graph.getIsolatedNodes();
        const isolatedNodes = isolatedNodeUrls.length;
        const connectedNodes = totalNodes - isolatedNodes;

        // Calculate connectivity ratio
        const connectivityRatio = totalNodes > 0 ? connectedNodes / totalNodes : 0;

        // Generate recommendations
        const recommendations: string[] = [];

        if (!hasRoot) {
            recommendations.push('Graph has no root node. Set a root node to establish a starting point for navigation.');
        }

        if (connectivityRatio < 0.3) {
            recommendations.push('Graph connectivity is below 30%. Consider running graph structure builder to improve connectivity.');
        } else if (connectivityRatio < 0.5) {
            recommendations.push('Graph connectivity is below 50%. Consider running relationship builder to link related nodes.');
        }

        if (isolatedNodes > totalNodes * 0.5) {
            recommendations.push(`More than 50% of nodes (${isolatedNodes}/${totalNodes}) are isolated. Consider running graph structure builder.`);
        } else if (isolatedNodes > totalNodes * 0.3) {
            recommendations.push(`More than 30% of nodes (${isolatedNodes}/${totalNodes}) are isolated. Consider running relationship builder to link related nodes.`);
        }

        if (totalNodes === 0) {
            recommendations.push('Graph is empty. Run a workflow to populate the graph.');
        }

        // Determine health status
        let status: 'healthy' | 'warning' | 'critical';
        let httpStatus = 200;

        if (connectivityRatio < 0.3 || isolatedNodes > totalNodes * 0.5 || !hasRoot) {
            status = 'critical';
            // Return 200 OK even for critical status so the frontend can display the health dashboard
            // instead of failing with a generic error
            httpStatus = 200;
        } else if (connectivityRatio < 0.5 || isolatedNodes > totalNodes * 0.3) {
            status = 'warning';
        } else {
            status = 'healthy';
        }

        const healthResponse = {
            status,
            totalNodes,
            totalEdges,
            connectivity: {
                hasRoot,
                isolatedNodes,
                connectedNodes,
                connectivityRatio: Math.round(connectivityRatio * 100) / 100
            },
            recommendations
        };

        res.status(httpStatus).json(healthResponse);
    }));

    // POST /api/graph/structure/build
    // Build graph structure from isolated nodes (admin only)
    // Request body: { strategy?: 'hierarchical' | 'clustered' | 'semantic', maxDepth?: number, minGroupSize?: number, setRootIfMissing?: boolean }
    const buildStructureSchema = z.object({
        strategy: z.enum(['hierarchical', 'clustered', 'semantic']).optional(),
        maxDepth: z.number().int().min(1).max(10).optional(),
        minGroupSize: z.number().int().min(1).max(100).optional(),
        setRootIfMissing: z.boolean().optional(),
    });

    router.post(
        '/graph/structure/build',
        authenticate,
        authorize(['admin']),
        validate({ body: buildStructureSchema }),
        asyncHandler(async (req: Request, res: Response) => {
            const startTime = Date.now();
            logger.info('POST /graph/structure/build request received');

            const { graph } = await getGraph();
            const driver = getNeo4jDriver();

            if (!driver) {
                throw new ServiceUnavailableError('Neo4j driver is not available. Cannot build graph structure.');
            }

            // Initialize services
            const embeddingProvider = new LocalEmbeddingProvider();
            const relationshipBuilder = new RelationshipBuilderService(
                driver,
                graph,
                embeddingProvider
            );
            const structureBuilder = new GraphStructureBuilder(graph, relationshipBuilder);

            // Extract options from request body
            const options = {
                strategy: req.body.strategy,
                maxDepth: req.body.maxDepth,
                minGroupSize: req.body.minGroupSize,
                setRootIfMissing: req.body.setRootIfMissing,
            };

            // Build structure
            logger.info({ options }, 'Starting graph structure building');
            const result = await structureBuilder.buildStructure(options);

            const duration = Date.now() - startTime;

            logger.info(
                {
                    nodesProcessed: result.nodesProcessed,
                    relationshipsCreated: result.relationshipsCreated,
                    groupsCreated: result.groupsCreated,
                    duration,
                },
                'Graph structure building completed'
            );

            res.json({
                success: true,
                result: {
                    nodesProcessed: result.nodesProcessed,
                    relationshipsCreated: result.relationshipsCreated,
                    groupsCreated: result.groupsCreated,
                    rootNodeSet: result.rootNodeSet,
                    groupNodeUrls: result.groupNodeUrls,
                },
                duration,
                timestamp: new Date().toISOString(),
            });
        })
    );

    return router;
}
