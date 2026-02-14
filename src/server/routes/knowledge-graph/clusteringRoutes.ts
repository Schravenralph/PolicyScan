/**
 * Clustering Routes for Knowledge Graph
 * 
 * Handles:
 * - GET /cluster/:id - Get details of a specific cluster including all entities
 * - POST /compute-gds-metrics - Compute GDS metrics (PageRank, Betweenness, Degree, Eigenvector)
 * - GET /labeling-usage - Get semantic labeling usage statistics and budget
 */

import express, { Router } from 'express';
import { asyncHandler } from '../../utils/errorHandling.js';
import { BadRequestError, NotFoundError } from '../../types/errors.js';
import { getNeo4jDriver } from '../../config/neo4j.js';
import { logger } from '../../utils/logger.js';
import type { KnowledgeGraphServiceType } from './shared/types.js';

/**
 * Create clustering router
 * 
 * @param getKGService - Function to get knowledge graph service instance
 * @param isGraphDB - Function to check if GraphDB backend is active
 * @param getClusteringService - Function to get clustering service instance
 * @param knowledgeBackend - Current knowledge graph backend ('graphdb' | 'neo4j')
 * @returns Express router with clustering routes
 */
export function createClusteringRouter(
    getKGService: () => KnowledgeGraphServiceType,
    isGraphDB: () => boolean,
    getClusteringService: () => any,
    _knowledgeBackend: 'graphdb' | 'neo4j'
): Router {
    const router = express.Router();

    // GET /api/knowledge-graph/cluster/:id
    // Get details of a specific cluster including all entities
    router.get('/cluster/:id', asyncHandler(async (req, res) => {
        const knowledgeGraphService = getKGService();
        // Ensure service is initialized
        await knowledgeGraphService.initialize();

        const { id } = req.params;
        const { strategy, minClusterSize, groupByDomain, groupByJurisdiction, maxIterations, tolerance } = req.query;

        const options = {
            strategy: (strategy as 'entity-type' | 'domain' | 'jurisdiction' | 'hybrid' | 'gds-louvain' | 'gds-lpa' | 'gds-leiden' | 'gds-wcc') || 'hybrid',
            minClusterSize: minClusterSize ? parseInt(minClusterSize as string) : 3,
            groupByDomain: groupByDomain !== 'false',
            groupByJurisdiction: groupByJurisdiction !== 'false',
            // Note: forceRelabel removed - label generation is done separately via script/endpoint
            ...(strategy?.toString().startsWith('gds-') && {
                gdsOptions: {
                    ...(maxIterations && { maxIterations: parseInt(maxIterations as string) }),
                    ...(tolerance && { tolerance: parseFloat(tolerance as string) })
                }
            })
        };

        const clusteringService = getClusteringService();
        if (!clusteringService) {
            throw new BadRequestError('Clustering service failed to initialize', {
                message: 'Clustering service failed to initialize'
            });
        }
        const metaGraph = await clusteringService.createMetaGraph(options);
        const cluster = metaGraph.clusters[id];

        if (!cluster) {
            // Log available cluster IDs for debugging
            const availableClusterIds = Object.keys(metaGraph.clusters).slice(0, 10);
            logger.warn({ 
                requestedClusterId: id, 
                availableClusterIds,
                totalClusters: Object.keys(metaGraph.clusters).length,
                strategy: options.strategy,
                minClusterSize: options.minClusterSize
            }, 'Cluster not found in meta-graph');
            throw new NotFoundError('Cluster', id, {
                availableClusterIds: availableClusterIds,
                totalClusters: Object.keys(metaGraph.clusters).length,
                suggestion: 'The cluster may have been filtered out or the clustering parameters may have changed. Try refreshing the meta-graph.'
            });
        }

        // Get pagination parameters
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
        const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

        // Get paginated entities directly (more efficient for large clusters)
        const paginatedEntities = await clusteringService.getClusterEntities(id, metaGraph, { limit, offset });

        // Calculate accurate entity count:
        // 1. If cluster has entityIds, use its length (already verified during cluster creation)
        // 2. Otherwise, use nodeCount (for entity-type clusters with lazy loading)
        // 3. As a fallback, if we have paginated entities and know the total, use that
        let entityCount = cluster.nodeCount || (cluster.entityIds?.length ?? 0);
        
        // If cluster has entityIds, prefer that count (it's already verified)
        if (cluster.entityIds && cluster.entityIds.length > 0) {
            entityCount = cluster.entityIds.length;
        } else if (cluster.metadata?.entityType) {
            // For entity-type clusters, nodeCount should be accurate (comes from typeDistribution query)
            // But we can verify by checking if paginated entities match expectations
            entityCount = cluster.nodeCount || 0;
        }

        res.json({
            cluster,
            entities: paginatedEntities,
            entityCount,
            limit,
            offset
        });
    }));

    // POST /api/knowledge-graph/compute-gds-metrics
    // Compute GDS metrics (PageRank, Betweenness, Degree, Eigenvector) and write to nodes
    // Note: GraphDB GDS metrics not yet implemented - returns basic metrics
    router.post('/compute-gds-metrics', asyncHandler(async (req, res) => {
        // GDS metrics are only available for Neo4j backend
        if (isGraphDB() || (process.env.NODE_ENV === 'test' && req.headers['x-test-force-backend'] === 'graphdb')) {
            throw new BadRequestError('GDS metrics computation is not available with GraphDB backend. This feature is not yet implemented for GraphDB.');
        }
        
        const knowledgeGraphService = getKGService();
        await knowledgeGraphService.initialize();

        const {
            includePageRank = true,
            includeBetweenness = true,
            includeDegree = true,
            includeEigenvector = false,
            pagerankOptions = {},
            eigenvectorOptions = {}
        } = req.body;

        // Neo4j GDS clustering service
        const driver = getNeo4jDriver();
        const kgService = knowledgeGraphService as import('../../services/knowledge-graph/core/KnowledgeGraph.js').KnowledgeGraphService;
        const { KnowledgeGraphGDSClusteringService } = await import('../../services/knowledge-graph/clustering/KnowledgeGraphGDSClusteringService.js');
        const gdsService = new KnowledgeGraphGDSClusteringService(driver, kgService);

        // Compute metrics
        const results = await gdsService.computeAllMetrics({
            includePageRank,
            includeBetweenness,
            includeDegree,
            includeEigenvector,
            pagerankOptions,
            eigenvectorOptions
        });

        res.json({
            success: true,
            message: 'GDS metrics computed and written to nodes',
            results,
            propertiesWritten: {
                pagerank: results.pagerank?.nodePropertiesWritten || 0,
                betweenness: results.betweenness?.nodePropertiesWritten || 0,
                degree: results.degree?.nodePropertiesWritten || 0,
                eigenvector: results.eigenvector?.nodePropertiesWritten || 0
            }
        });
    }));

    // POST /api/knowledge-graph/invalidate-cache
    // Invalidate clustering cache (useful after cleanup operations)
    router.post('/invalidate-cache', asyncHandler(async (_req, res) => {
        const clusteringService = getClusteringService();
        if (!clusteringService) {
            throw new BadRequestError('Clustering service failed to initialize', {
                message: 'Clustering service failed to initialize'
            });
        }

        // Invalidate clustering cache if method exists
        if (typeof clusteringService.invalidateCache === 'function') {
            clusteringService.invalidateCache();
            logger.info('Clustering cache invalidated via API endpoint');
        } else {
            logger.warn('Clustering service does not have invalidateCache method');
        }

        res.json({
            success: true,
            message: 'Clustering cache invalidated successfully'
        });
    }));

    // GET /api/knowledge-graph/labeling-usage
    // Get semantic labeling usage statistics and budget
    router.get('/labeling-usage', asyncHandler(async (_req, res) => {
        const { semanticLabelingService } = await import('../../services/semantic/SemanticLabelingService.js');

        if (!semanticLabelingService) {
            throw new BadRequestError('SemanticLabelingService is not available', {
                message: 'SemanticLabelingService is not available'
            });
        }

        const usage = semanticLabelingService.getUsageStats();
        const cache = semanticLabelingService.getCacheStats();

        if (!usage) {
            throw new BadRequestError('Failed to retrieve usage statistics', {
                message: 'Failed to retrieve usage statistics'
            });
        }

        if (!cache) {
            throw new BadRequestError('Failed to retrieve cache statistics', {
                message: 'Failed to retrieve cache statistics'
            });
        }

        res.json({
            ...usage,
            budgetLimitEUR: 5.0,
            percentageUsed: (usage.costEUR / 5.0) * 100,
            cache: {
                size: cache.size,
                filePath: cache.filePath
            }
        });
    }));

    return router;
}

