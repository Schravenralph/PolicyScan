/**
 * Basic CRUD Routes for Knowledge Graph
 * 
 * Handles:
 * - GET / - Get entire knowledge graph or subgraph
 * - GET /meta - Get meta-graph with clustered entities
 * - GET /backend - Get active backend information
 * - GET /entity/:id - Get detailed metadata for a specific entity
 * - GET /relationships - Get all relationships (triples) in the knowledge graph
 * - GET /stats - Get statistics about the knowledge graph
 */

import express, { Router } from 'express';
import { asyncHandler } from '../../utils/errorHandling.js';
import { BadRequestError, NotFoundError } from '../../types/errors.js';
import { logger } from '../../utils/logger.js';
import { PolicyDocument, Regulation, LandUse, BaseEntity, Relation } from '../../domain/ontology.js';
import {
    mapEntitiesToKGNodeDto,
    mapEdgesToKGEdgeDto,
    mapEnrichedTriplesToDto,
} from '../../utils/mappers.js';
import { LIMITS } from '../../config/constants.js';
import type { KnowledgeGraphServiceType } from './shared/types.js';
// Type-only imports for dynamic imports (for TypeScript type checking)

/**
 * Create basic CRUD router
 * 
 * @param getKGService - Function to get knowledge graph service instance
 * @param isGraphDB - Function to check if GraphDB backend is active
 * @param getClusteringService - Function to get clustering service instance
 * @param knowledgeBackend - Current knowledge graph backend ('graphdb' | 'neo4j')
 * @returns Express router with basic CRUD routes
 */
export function createBasicRouter(
    getKGService: () => KnowledgeGraphServiceType,
    isGraphDB: () => boolean,
    getClusteringService: () => any,
    knowledgeBackend: 'graphdb' | 'neo4j'
): Router {
    const router = express.Router();

    // GET /api/knowledge-graph
    // Returns the entire knowledge graph or a subgraph
    // Query params: limit (max nodes to return, default: 500 for visualization)
    // WI-KG-GAP-006: Uses branch-aware query to check both main and pending-changes branches
    router.get('/', asyncHandler(async (req, res) => {
        const knowledgeGraphService = getKGService();
        // Ensure service is initialized
        await knowledgeGraphService.initialize();

        // Enforce max limit to prevent large result sets
        const requestedLimit = req.query.limit ? parseInt(req.query.limit as string) : 500;
        const MAX_GRAPH_LIMIT = 10000; // Maximum nodes for knowledge graph visualization
        const limit = Math.min(requestedLimit, MAX_GRAPH_LIMIT);

        // Use branch-aware query if GraphDB backend
        let snapshot: { nodes: BaseEntity[]; edges: Relation[] };
        let branchInfo: { branch?: string; fallbackUsed?: boolean } | undefined;
        
        if (isGraphDB() && knowledgeBackend === 'graphdb') {
            try {
                const { executeBranchAwareQuery, isEntityArrayEmpty } = await import('./shared/branchAwareQuery.js');
                const { KnowledgeGraphVersionManager } = await import('../../services/knowledge-graph/versioning/KnowledgeGraphVersionManager.js');
                const { getGraphDBClient } = await import('../../config/graphdb.js');
                const vm = new KnowledgeGraphVersionManager(getGraphDBClient());
                await vm.initialize();
                
                const result = await executeBranchAwareQuery(
                    async (kgService) => {
                        // Get current branch and pass explicitly to getGraphSnapshot
                        const currentBranch = await vm.getCurrentBranch();
                        return await (kgService as any).getGraphSnapshot(limit, currentBranch);
                    },
                    (data) => isEntityArrayEmpty(data.nodes),
                    { 
                        fallbackToPending: true,
                        includeBranchInfo: req.query.includeBranchInfo === 'true'
                    }
                );
                
                snapshot = result.data;
                branchInfo = {
                    branch: result.branch,
                    fallbackUsed: result.fallbackUsed
                };
            } catch (error) {
                // Fall back to regular query if branch-aware query fails
                logger.warn({ error }, 'Branch-aware query failed, using regular query');
                // For non-GraphDB or fallback, query all entities (branch = null)
                snapshot = await (knowledgeGraphService as any).getGraphSnapshot(limit, null);
            }
        } else {
            // Regular query (non-GraphDB or fallback) - query all entities
            snapshot = await (knowledgeGraphService as any).getGraphSnapshot(limit, null);
        }

        // Limit nodes for visualization (too many nodes cause performance issues)
        const limitedNodes = snapshot.nodes?.slice(0, limit) || [];

        // Only include edges between the limited nodes
        // Defensive check: ensure edges array exists before filtering
        const limitedNodeIds = new Set(limitedNodes.map((n: BaseEntity) => n.id));
        const edges = snapshot.edges || [];
        const limitedEdges = edges.filter(
            (edge: Relation) => limitedNodeIds.has(edge.sourceId) && limitedNodeIds.has(edge.targetId)
        );

        // Transform nodes and edges for frontend
        // Frontend expects: { nodes: KGNode[], edges: KGEdge[] }
        const getDefaultName = (node: { type: string;[key: string]: unknown }) => {
            if (node.type === 'PolicyDocument') {
                return (node as unknown as PolicyDocument).documentType;
            }
            return undefined;
        };

        const getDefaultDescription = (node: { type: string;[key: string]: unknown }) => {
            if (node.type === 'Regulation' || node.type === 'LandUse') {
                return (node as unknown as Regulation | LandUse).category;
            }
            return undefined;
        };

        const transformedNodes = mapEntitiesToKGNodeDto(limitedNodes as Array<{ id: string; type: string; name?: string; description?: string;[key: string]: unknown }>, getDefaultName, getDefaultDescription);
        const transformedEdges = mapEdgesToKGEdgeDto(limitedEdges) || [];

        res.json({
            nodes: transformedNodes,
            edges: transformedEdges,
            metadata: {
                totalNodes: snapshot.nodes?.length || 0,
                totalEdges: edges.length,
                nodesReturned: transformedNodes.length,
                edgesReturned: transformedEdges.length,
                limit,
                ...(branchInfo && req.query.includeBranchInfo === 'true' && {
                    branch: branchInfo.branch,
                    fallbackUsed: branchInfo.fallbackUsed
                })
            }
        });
    }));

    // GET /api/knowledge-graph/meta
    // Returns a meta-graph with clustered entities
    router.get('/meta', asyncHandler(async (req, res) => {
        const knowledgeGraphService = getKGService();
        // Ensure service is initialized
        logger.debug({ backend: knowledgeBackend }, 'Initializing knowledge graph service for meta endpoint');
        await knowledgeGraphService.initialize();

        const { strategy, minClusterSize, groupByDomain, groupByJurisdiction } = req.query;

        const options = {
            strategy: (strategy as 'entity-type' | 'domain' | 'jurisdiction' | 'hybrid' | 'gds-louvain' | 'gds-lpa' | 'gds-leiden' | 'gds-wcc') || 'hybrid',
            minClusterSize: minClusterSize ? parseInt(minClusterSize as string) : 3,
            groupByDomain: groupByDomain !== 'false',
            groupByJurisdiction: groupByJurisdiction !== 'false'
            // Note: forceRelabel removed - label generation is done separately via script/endpoint
        };

        logger.debug({ options, backend: knowledgeBackend }, 'Creating meta-graph with clustering service');

        const clusteringService = getClusteringService();
        if (!clusteringService) {
            throw new BadRequestError('Clustering service failed to initialize', {
                message: 'Clustering service failed to initialize'
            });
        }

        let metaGraph;
        try {
            metaGraph = await clusteringService.createMetaGraph(options);
        } catch (error) {
            logger.error({ error, backend: knowledgeBackend }, 'Failed to create meta-knowledge-graph');
            throw error;
        }

        // Include evaluation metrics if available (for GDS algorithms)
        const response = {
            ...metaGraph,
            backend: knowledgeBackend, // Include backend info for frontend
            ...(options.strategy?.startsWith('gds-') && metaGraph.metadata.evaluationMetrics ? {
                evaluationMetrics: {
                    clusteringStrategy: options.strategy,
                    clusterCount: metaGraph.totalClusters,
                    nodeCount: metaGraph.totalNodes,
                    ...metaGraph.metadata.evaluationMetrics
                }
            } : {})
        };

        logger.debug({
            clusterCount: metaGraph.totalClusters,
            nodeCount: metaGraph.totalNodes,
            edgeCount: metaGraph.edges.length
        }, 'Meta-graph created successfully');

        res.json(response);
    }));

    // GET /api/knowledge-graph/backend
    // Returns the active knowledge graph backend type
    router.get('/backend', asyncHandler(async (_req, res) => {
        res.json({
            backend: knowledgeBackend,
            backendName: knowledgeBackend === 'graphdb' ? 'GraphDB' : 'Neo4j',
            description: knowledgeBackend === 'graphdb'
                ? 'RDF/SPARQL-based knowledge graph'
                : 'Property graph database (fallback)',
        });
    }));

    // GET /api/knowledge-graph/entity/:id
    // Get detailed metadata for a specific entity
    // WI-KG-GAP-006: Uses branch-aware query to check both main and pending-changes branches
    router.get('/entity/:id', asyncHandler(async (req, res) => {
        const knowledgeGraphService = getKGService();
        await knowledgeGraphService.initialize();

        const { id } = req.params;
        const decodedId = decodeURIComponent(id);

        // Use branch-aware query if GraphDB backend
        let entity: BaseEntity | undefined;
        let branchInfo: { branch?: string; fallbackUsed?: boolean } | undefined;
        
        if (isGraphDB() && knowledgeBackend === 'graphdb') {
            try {
                const { executeBranchAwareQuery } = await import('./shared/branchAwareQuery.js');
                const { KnowledgeGraphVersionManager } = await import('../../services/knowledge-graph/versioning/KnowledgeGraphVersionManager.js');
                const { getGraphDBClient } = await import('../../config/graphdb.js');
                const vm = new KnowledgeGraphVersionManager(getGraphDBClient());
                await vm.initialize();
                
                const result = await executeBranchAwareQuery(
                    async (kgService) => {
                        // getNode doesn't need branch parameter - it queries by ID across all branches
                        // The branch-aware query helper handles branch switching
                        return await kgService.getNode(decodedId);
                    },
                    (data) => !data, // Empty if entity is undefined
                    { 
                        fallbackToPending: true,
                        includeBranchInfo: req.query.includeBranchInfo === 'true'
                    }
                );
                
                entity = result.data;
                branchInfo = {
                    branch: result.branch,
                    fallbackUsed: result.fallbackUsed
                };
            } catch (error) {
                // Fall back to regular query if branch-aware query fails
                logger.warn({ error }, 'Branch-aware query failed, using regular query');
                entity = await knowledgeGraphService.getNode(decodedId);
            }
        } else {
            // Regular query (non-GraphDB or fallback)
            entity = await knowledgeGraphService.getNode(decodedId);
        }

        if (!entity) {
            throw new NotFoundError('Entity', decodedId, { message: 'Entity not found' });
        }

        // Get neighbors (outgoing and incoming) - these will use the same branch context
        const outgoingNeighbors = await knowledgeGraphService.getNeighbors(decodedId);
        const incomingNeighbors = await knowledgeGraphService.getIncomingNeighbors(decodedId);

        // Limit neighbors to 10 each
        const limitedOutgoing = outgoingNeighbors.slice(0, 10);
        const limitedIncoming = incomingNeighbors.slice(0, 10);

        // Enrich metadata with source information
        const enrichedMetadata = {
            ...entity,
            neighbors: {
                outgoing: limitedOutgoing,
                incoming: limitedIncoming,
            },
            metadata: {
                ...entity.metadata,
                // Add inferred source information
                source: entity.metadata?.source || ((entity as PolicyDocument).url ? 'IPLOScraper' : 'Unknown'),
                domainSource: entity.metadata?.domain ? 'entity metadata' : (entity.uri ? 'URI extraction' : 'not set'),
                // Include branch information if available
                ...(branchInfo && req.query.includeBranchInfo === 'true' && {
                    branch: branchInfo.branch,
                    fallbackUsed: branchInfo.fallbackUsed
                })
            }
        };

        res.json(enrichedMetadata);
    }));

    // GET /api/knowledge-graph/relationships
    // Get all relationships (triples) in the knowledge graph
    // Query params: type (filter by relation type), limit (max relationships to return)
    // WI-KG-GAP-006: Uses branch-aware query to check both main and pending-changes branches
    router.get('/relationships', asyncHandler(async (req, res) => {
        const knowledgeGraphService = getKGService();
        await knowledgeGraphService.initialize();

        const limit = req.query.limit ? parseInt(req.query.limit as string) : LIMITS.GRAPH_SNAPSHOT_DEFAULT;
        const relationType = req.query.type as string | undefined;

        // Use branch-aware query if GraphDB backend
        let snapshot: { nodes: BaseEntity[]; edges: Relation[] };
        let branchInfo: { branch?: string; fallbackUsed?: boolean } | undefined;
        
        if (isGraphDB() && knowledgeBackend === 'graphdb') {
            try {
                const { executeBranchAwareQuery, isEntityArrayEmpty } = await import('./shared/branchAwareQuery.js');
                const { KnowledgeGraphVersionManager } = await import('../../services/knowledge-graph/versioning/KnowledgeGraphVersionManager.js');
                const { getGraphDBClient } = await import('../../config/graphdb.js');
                const vm = new KnowledgeGraphVersionManager(getGraphDBClient());
                await vm.initialize();
                
                const result = await executeBranchAwareQuery(
                    async (kgService) => {
                        // Get current branch and pass explicitly to getGraphSnapshot
                        const currentBranch = await vm.getCurrentBranch();
                        return await (kgService as any).getGraphSnapshot(limit * 2, currentBranch);
                    },
                    (data) => isEntityArrayEmpty(data.edges),
                    { 
                        fallbackToPending: true,
                        includeBranchInfo: req.query.includeBranchInfo === 'true'
                    }
                );
                
                snapshot = result.data;
                branchInfo = {
                    branch: result.branch,
                    fallbackUsed: result.fallbackUsed
                };
            } catch (error) {
                // Fall back to regular query if branch-aware query fails
                logger.warn({ error }, 'Branch-aware query failed, using regular query');
                // For non-GraphDB or fallback, query all entities (branch = null)
                snapshot = await (knowledgeGraphService as any).getGraphSnapshot(limit * 2, null);
            }
        } else {
            // Regular query (non-GraphDB or fallback) - query all entities
            snapshot = await (knowledgeGraphService as any).getGraphSnapshot(limit * 2, null);
        }

        let edges = snapshot.edges;

        // Filter by relation type if specified
        if (relationType) {
            edges = edges.filter((edge: Relation) => edge.type === relationType);
        }

        // Limit results
        const limitedEdges = edges.slice(0, limit);

        // Enrich edges with node information
        const nodeMap = new Map<string, BaseEntity>(snapshot.nodes.map((n: BaseEntity) => [n.id, n]));
        const enrichedTriples = limitedEdges.map((edge: Relation) => {
            const source = nodeMap.get(edge.sourceId);
            const target = nodeMap.get(edge.targetId);

            return {
                source: source ? {
                    id: source.id,
                    type: source.type,
                    name: source.name
                } : null,
                target: target ? {
                    id: target.id,
                    type: target.type,
                    name: target.name
                } : null,
                relationship: edge.type,
                metadata: edge.metadata,
                sourceId: edge.sourceId,
                targetId: edge.targetId,
            };
        });

        const transformedTriples = mapEnrichedTriplesToDto(enrichedTriples);

        res.json({
            triples: transformedTriples,
            totalRelationships: snapshot.edges.length,
            returned: transformedTriples.length,
            limit,
            ...(relationType && { filteredBy: relationType }),
            ...(branchInfo && req.query.includeBranchInfo === 'true' && {
                branch: branchInfo.branch,
                fallbackUsed: branchInfo.fallbackUsed
            })
        });
    }));

    // GET /api/knowledge-graph/stats
    // Get statistics about the knowledge graph
    // WI-KG-GAP-006: Uses branch-aware query to check both main and pending-changes branches
    router.get('/stats', asyncHandler(async (req, res) => {
        const knowledgeGraphService = getKGService();
        await knowledgeGraphService.initialize();

        // Use branch-aware query if GraphDB backend
        if (isGraphDB() && knowledgeBackend === 'graphdb') {
            try {
                const { executeBranchAwareQuery, isStatsEmpty } = await import('./shared/branchAwareQuery.js');
                const result = await executeBranchAwareQuery(
                    async (kgService) => {
                        const stats = await kgService.getStats();
                        const entityTypeDistribution = await kgService.getEntityTypeDistribution();
                        return { 
                            totalEntities: stats.nodeCount,
                            totalRelationships: stats.edgeCount,
                            typeDistribution: stats.typeDistribution,
                            entityTypeDistribution 
                        };
                    },
                    (data) => isStatsEmpty(data),
                    { 
                        fallbackToPending: true,
                        includeBranchInfo: req.query.includeBranchInfo === 'true'
                    }
                );
                
                res.json({
                    ...result.data,
                    backend: knowledgeBackend,
                    ...(req.query.includeBranchInfo === 'true' && {
                        branch: result.branch,
                        fallbackUsed: result.fallbackUsed
                    })
                });
                return;
            } catch (error) {
                // Fall back to regular query if branch-aware query fails
                logger.warn({ error }, 'Branch-aware query failed, using regular query');
            }
        }

        // Regular query (non-GraphDB or fallback)
        const stats = await knowledgeGraphService.getStats();
        const entityTypeDistribution = await knowledgeGraphService.getEntityTypeDistribution();

        res.json({
            ...stats,
            entityTypeDistribution,
            backend: knowledgeBackend
        });
    }));

    return router;
}

