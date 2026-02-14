import express from 'express';
import { getKnowledgeGraphService } from '../services/knowledge-graph/core/KnowledgeGraph.js';
import { getNeo4jDriver } from '../config/neo4j.js';
import { KnowledgeGraphClusteringService } from '../services/knowledge-graph/clustering/KnowledgeGraphClusteringService.js';
import { FactFirstRetrievalService } from '../services/graphrag/FactFirstRetrievalService.js';
import { GraphRAGRetrievalService } from '../services/graphrag/GraphRAGRetrievalService.js';
import { HybridScorer } from '../services/graphrag/HybridScorer.js';
import { VectorService } from '../services/query/VectorService.js';
import { GraphTraversalService } from '../services/graphrag/GraphTraversalService.js';
import { ContextualEnrichmentService } from '../services/graphrag/ContextualEnrichmentService.js';
import { LLMAnswerGenerator } from '../services/graphrag/LLMAnswerGenerator.js';
import { SteinerTreeService } from '../services/graphrag/pathfinding/SteinerTreeService.js';
import { PolicyDocument, Regulation, LandUse, BaseEntity, EntityType, RelationType, Relation, HierarchyLevel } from '../domain/ontology.js';
import { ChangeDetectionService } from '../services/knowledge-graph/maintenance/ChangeDetectionService.js';
import { IncrementalUpdater } from '../services/knowledge-graph/maintenance/IncrementalUpdater.js';
import { ScrapedDocument } from '../services/infrastructure/types.js';
import { getFeatureFlagsService } from '../services/knowledge-graph/KnowledgeGraphFeatureFlags.js';
import { KGFeatureFlag } from '../models/FeatureFlag.js';
import { OntologyAlignmentService } from '../services/knowledge-graph/legal/OntologyAlignmentService.js';
import { KnowledgeClusterNode } from '../services/knowledge-graph/clustering/KnowledgeGraphClusteringService.js';
import { TraversalOptions } from '../services/graphrag/GraphTraversalService.js';
import { TraversalNode } from '../services/graphrag/traversal/BFSTraversal.js';
import { HierarchicalQueryOptions } from '../services/knowledge-graph/legal/HierarchicalStructureService.js';
import { CypherQueryOptions } from '../services/knowledge-graph/core/CypherQueryService.js';
import { InferenceOptions, InferenceRuleType } from '../services/knowledge-graph/inference/GraphInferenceEngine.js';
import { ChangeSet } from '../services/knowledge-graph/maintenance/ChangeSet.js';
import { LIMITS } from '../config/constants.js';
import {
  mapEntitiesToKGNodeDto,
  mapEdgesToKGEdgeDto,
  mapRelationshipsToDto,
  mapEnrichedTriplesToDto,
} from '../utils/mappers.js';
import { logger } from '../utils/logger.js';
import { BatchRelationshipDiscovery } from '../services/knowledge-graph/enrichment/BatchRelationshipDiscovery.js';

const router = express.Router();

type KnowledgeGraphServiceType = import('../services/knowledge-graph/core/KnowledgeGraph.js').KnowledgeGraphService | import('../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService;
type Neo4jKnowledgeGraphService = import('../services/knowledge-graph/core/KnowledgeGraph.js').KnowledgeGraphService;

let injectedService: KnowledgeGraphServiceType | null = null;
let knowledgeBackend: 'graphdb' | 'neo4j' = 'neo4j';

export function registerKnowledgeGraphService(service: KnowledgeGraphServiceType, backend: 'graphdb' | 'neo4j' = 'neo4j') {
    injectedService = service;
    knowledgeBackend = backend;
}

export function getKnowledgeGraphBackend(): 'graphdb' | 'neo4j' {
    return knowledgeBackend;
}

function isGraphDB(): boolean {
    return knowledgeBackend === 'graphdb';
}

// Get knowledge graph service instance (requires Neo4j connection)
function getKGService() {
    if (injectedService) {
        return injectedService;
    }
    try {
        const driver = getNeo4jDriver();
        return getKnowledgeGraphService(driver);
    } catch (_error) {
        throw new Error('Knowledge graph service requires Neo4j connection');
    }
}

// Initialize clustering service (lazy initialization)
let clusteringService: KnowledgeGraphClusteringService | null = null;
function getClusteringService(): KnowledgeGraphClusteringService {
    if (isGraphDB()) {
        throw new Error('Clustering service is not available for GraphDB backend');
    }
    if (!clusteringService) {
        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        clusteringService = new KnowledgeGraphClusteringService(kgService);
    }
    return clusteringService;
}

// Initialize fact-first retrieval service (lazy initialization)
let factFirstRetrievalService: FactFirstRetrievalService | null = null;
function getFactFirstRetrievalService(): FactFirstRetrievalService {
    if (!factFirstRetrievalService) {
        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        factFirstRetrievalService = new FactFirstRetrievalService(kgService);
    }
    return factFirstRetrievalService;
}

// Initialize GraphRAG retrieval service (lazy initialization)
let graphRAGRetrievalService: GraphRAGRetrievalService | null = null;
async function getGraphRAGRetrievalService(): Promise<GraphRAGRetrievalService> {
    if (!graphRAGRetrievalService) {
        if (isGraphDB()) {
            throw new Error('GraphRAG retrieval service is not available for GraphDB backend');
        }
        // Service is used indirectly through factFirstService
        // Ensure we have Neo4j service (not GraphDB)
        // Type assertion ensures we have Neo4j service, not GraphDB
        void (getKGService() as Neo4jKnowledgeGraphService);
        const factFirstService = getFactFirstRetrievalService();
        const vectorService = new VectorService();
        await vectorService.init();
        const hybridScorer = new HybridScorer(vectorService);
        const driver = getNeo4jDriver();
        const traversalService = new GraphTraversalService(driver);
        const contextualEnrichmentService = new ContextualEnrichmentService(vectorService);
        graphRAGRetrievalService = new GraphRAGRetrievalService(
            factFirstService,
            hybridScorer,
            vectorService,
            traversalService,
            contextualEnrichmentService
        );
    }
    return graphRAGRetrievalService;
}

// Initialize Steiner tree service (lazy initialization)
let steinerTreeService: SteinerTreeService | null = null;
async function getSteinerTreeService(): Promise<SteinerTreeService> {
    if (isGraphDB()) {
        throw new Error('Steiner tree service is not available for GraphDB backend');
    }
    if (!steinerTreeService) {
        const driver = getNeo4jDriver();
        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        steinerTreeService = new SteinerTreeService(driver, kgService);
    }
    return steinerTreeService;
}

// GET /api/knowledge-graph
// Returns the entire knowledge graph or a subgraph
// Query params: limit (max nodes to return, default: 500 for visualization)
router.get('/', async (req, res) => {
    try {
        const knowledgeGraphService = getKGService();
        // Ensure service is initialized
        await knowledgeGraphService.initialize();
        
        // Enforce max limit to prevent large result sets
        const requestedLimit = req.query.limit ? parseInt(req.query.limit as string) : 500;
        const MAX_GRAPH_LIMIT = 10000; // Maximum nodes for knowledge graph visualization
        const limit = Math.min(requestedLimit, MAX_GRAPH_LIMIT);
        const snapshot = isGraphDB() 
          ? await (knowledgeGraphService as import('../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService).getGraphSnapshot(limit, null)
          : await (knowledgeGraphService as import('../services/knowledge-graph/core/KnowledgeGraph.js').KnowledgeGraphService).getGraphSnapshot(limit);

        // Limit nodes for visualization (too many nodes cause performance issues)
        const limitedNodes = snapshot.nodes.slice(0, limit);
        
        // Only include edges between the limited nodes
        const limitedNodeIds = new Set(limitedNodes.map((n: BaseEntity) => n.id));
        const limitedEdges = snapshot.edges.filter(
            (edge: Relation) => limitedNodeIds.has(edge.sourceId) && limitedNodeIds.has(edge.targetId)
        );

        // Transform nodes and edges for frontend
        // Frontend expects: { nodes: KGNode[], edges: KGEdge[] }
        const getDefaultName = (node: { type: string; [key: string]: unknown }) => {
            if (node.type === 'PolicyDocument') {
                return (node as unknown as PolicyDocument).documentType;
            }
            return undefined;
        };

        const getDefaultDescription = (node: { type: string; [key: string]: unknown }) => {
            if (node.type === 'Regulation' || node.type === 'LandUse') {
                return (node as unknown as Regulation | LandUse).category;
            }
            return undefined;
        };

        const transformedNodes = mapEntitiesToKGNodeDto(limitedNodes as Array<{ id: string; type: string; name?: string; description?: string; [key: string]: unknown }>, getDefaultName, getDefaultDescription);
        const transformedEdges = mapEdgesToKGEdgeDto(limitedEdges);

        res.json({
            nodes: transformedNodes,
            edges: transformedEdges,
            metadata: {
                totalNodes: snapshot.nodes.length,
                totalEdges: snapshot.edges.length,
                nodesReturned: transformedNodes.length,
                edgesReturned: transformedEdges.length,
                limit
            }
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching knowledge graph');
        res.status(500).json({ error: 'Failed to fetch knowledge graph' });
    }
});

// GET /api/knowledge-graph/entity/:id
// Get a specific entity and its immediate neighbors
router.get('/entity/:id', async (req, res) => {
    try {
        const knowledgeGraphService = getKGService();
        // Ensure service is initialized
        await knowledgeGraphService.initialize();
        
        const { id } = req.params;
        const node = await knowledgeGraphService.getNode(id);

        if (!node) {
            return res.status(404).json({ error: 'Entity not found' });
        }

        // Get neighbors for context
        const incoming = await knowledgeGraphService.getIncomingNeighbors(id);
        const outgoing = await knowledgeGraphService.getNeighbors(id);

        res.json({
            ...node,
            neighbors: {
                incoming: incoming.slice(0, 10),
                outgoing: outgoing.slice(0, 10)
            }
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching entity');
        res.status(500).json({ error: 'Failed to fetch entity' });
    }
});

// GET /api/knowledge-graph/meta
// Returns a meta-graph with clustered entities
router.get('/meta', async (req, res) => {
    try {
        const knowledgeGraphService = getKGService();
        // Ensure service is initialized
        await knowledgeGraphService.initialize();
        
        if (isGraphDB()) {
            const snapshot = await (knowledgeGraphService as import('../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService).getGraphSnapshot(2000, null);
            const typeDistribution = await knowledgeGraphService.getEntityTypeDistribution();

            const clusters: Record<string, KnowledgeClusterNode> = {};
            Object.entries(typeDistribution).forEach(([type, count]) => {
                const clusterId = `graphdb-${type}`;
                // Deduplicate entityIds to prevent duplicate IDs in cluster metadata
                const entityIds = [...new Set(snapshot.nodes.filter((n: BaseEntity) => n.type === type).map((n: BaseEntity) => n.id))];
                clusters[clusterId] = {
                    id: clusterId,
                    label: type,
                    type: 'knowledge-cluster',
                    clusterType: 'category',
                    level: 1,
                    nodeCount: count,
                    entityIds,
                    metadata: { entityType: type as EntityType }
                };
            });

            return res.json({
                clusters,
                edges: [],
                totalNodes: snapshot.nodes.length,
                totalClusters: Object.keys(clusters).length,
                metadata: {
                    clusteringStrategy: 'graphdb-type',
                    entityTypeDistribution: typeDistribution
                }
            });
        }

        const { strategy, minClusterSize, groupByDomain, groupByJurisdiction } = req.query;

        const options = {
            strategy: (strategy as 'entity-type' | 'domain' | 'jurisdiction' | 'hybrid' | 'gds-louvain' | 'gds-lpa' | 'gds-leiden' | 'gds-wcc') || 'hybrid',
            minClusterSize: minClusterSize ? parseInt(minClusterSize as string) : 3,
            groupByDomain: groupByDomain !== 'false',
            groupByJurisdiction: groupByJurisdiction !== 'false'
            // Note: forceRelabel removed - label generation is done separately via script/endpoint
        };

        const metaGraph = await getClusteringService().createMetaGraph(options);

        // Include evaluation metrics if available (for GDS algorithms)
        const response = {
            ...metaGraph,
            ...(options.strategy?.startsWith('gds-') && metaGraph.metadata.evaluationMetrics ? {
                evaluationMetrics: {
                    clusteringStrategy: options.strategy,
                    clusterCount: metaGraph.totalClusters,
                    nodeCount: metaGraph.totalNodes,
                    ...metaGraph.metadata.evaluationMetrics
                }
            } : {})
        };

        res.json(response);
    } catch (error) {
        logger.error({ error }, 'Error creating meta-knowledge-graph');
        res.status(500).json({ error: 'Failed to create meta-knowledge-graph' });
    }
});

// GET /api/knowledge-graph/cluster/:id
// Get details of a specific cluster including all entities
router.get('/cluster/:id', async (req, res) => {
    try {
        const knowledgeGraphService = getKGService();
        // Ensure service is initialized
        await knowledgeGraphService.initialize();
        
        if (isGraphDB()) {
            const snapshot = await (knowledgeGraphService as import('../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService).getGraphSnapshot(2000, null);
            const typeDistribution = await knowledgeGraphService.getEntityTypeDistribution();
            const clusters: Record<string, KnowledgeClusterNode> = {};
            Object.entries(typeDistribution).forEach(([type, count]) => {
                const clusterId = `graphdb-${type}`;
                // Deduplicate entityIds to prevent duplicate IDs in cluster metadata
                const entityIds = [...new Set(snapshot.nodes.filter((n: BaseEntity) => n.type === type).map((n: BaseEntity) => n.id))];
                clusters[clusterId] = {
                    id: clusterId,
                    label: type,
                    type: 'knowledge-cluster',
                    clusterType: 'category',
                    level: 1,
                    nodeCount: count,
                    entityIds,
                    metadata: { entityType: type as EntityType }
                };
            });

            const cluster = clusters[req.params.id];
            if (!cluster) {
                return res.status(404).json({ error: 'Cluster not found' });
            }

            const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
            const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
            // Filter entities and deduplicate by ID (keep first occurrence of each unique ID)
            const filteredEntities = snapshot.nodes.filter((n: BaseEntity) => cluster.entityIds.includes(n.id));
            const entityMap = new Map<string, BaseEntity>();
            for (const entity of filteredEntities) {
                if (!entityMap.has(entity.id)) {
                    entityMap.set(entity.id, entity);
                }
            }
            const entities = Array.from(entityMap.values());

            return res.json({
                cluster,
                entities: entities.slice(offset, offset + limit),
                entityCount: entities.length,
                limit,
                offset
            });
        }

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

        const metaGraph = await getClusteringService().createMetaGraph(options);
        const cluster = metaGraph.clusters[id];

        if (!cluster) {
            return res.status(404).json({ error: 'Cluster not found' });
        }

        // Get paginated entities in the cluster
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
        const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
        
        // Get all entities (for count) and paginated subset
        const allEntities = await getClusteringService().getClusterEntities(id, metaGraph);
        const paginatedEntities = allEntities.slice(offset, offset + limit);

        res.json({
            cluster,
            entities: paginatedEntities,
            entityCount: allEntities.length,
            limit,
            offset
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching cluster');
        res.status(500).json({ error: 'Failed to fetch cluster' });
    }
});

// GET /api/knowledge-graph/entity/:id
// Get detailed metadata for a specific entity
router.get('/entity/:id', async (req, res) => {
    try {
        const knowledgeGraphService = getKGService();
        await knowledgeGraphService.initialize();
        
        const { id } = req.params;
        const decodedId = decodeURIComponent(id);
        
        // Get entity by ID
        const entity = await knowledgeGraphService.getNode(decodedId);
        
        if (!entity) {
            return res.status(404).json({ error: 'Entity not found' });
        }

            // Get relationships for this entity
            const relationships = await knowledgeGraphService.getRelationshipsForEntity(decodedId);
            
            // Enrich metadata with source information
            const enrichedMetadata = {
                ...entity,
                relationships: mapRelationshipsToDto(relationships),
                metadata: {
                    ...entity.metadata,
                    // Add inferred source information
                    source: entity.metadata?.source || ((entity as PolicyDocument).url ? 'IPLOScraper' : 'Unknown'),
                    domainSource: entity.metadata?.domain ? 'entity metadata' : (entity.uri ? 'URI extraction' : 'not set')
                }
            };

        res.json(enrichedMetadata);
    } catch (error) {
        logger.error({ error }, 'Error fetching entity');
        res.status(500).json({ error: 'Failed to fetch entity' });
    }
});

// GET /api/knowledge-graph/relationships
// Get all relationships (triples) in the knowledge graph
// Query params: type (filter by relation type), limit (max relationships to return)
router.get('/relationships', async (req, res) => {
    try {
        const knowledgeGraphService = getKGService();
        await knowledgeGraphService.initialize();
        
        const limit = req.query.limit ? parseInt(req.query.limit as string) : LIMITS.GRAPH_SNAPSHOT_DEFAULT;
        const relationType = req.query.type as string | undefined;

        const snapshot = isGraphDB()
          ? await (knowledgeGraphService as import('../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService).getGraphSnapshot(limit * 2, null)
          : await (knowledgeGraphService as import('../services/knowledge-graph/core/KnowledgeGraph.js').KnowledgeGraphService).getGraphSnapshot(limit * 2); // Get more nodes to ensure we have relationships
        
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
            ...(relationType && { filteredBy: relationType })
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching relationships');
        res.status(500).json({ error: 'Failed to fetch relationships' });
    }
});

// GET /api/knowledge-graph/stats
// Get statistics about the knowledge graph
router.get('/stats', async (_req, res) => {
    try {
        const knowledgeGraphService = getKGService();
        await knowledgeGraphService.initialize();
        
        const stats = await knowledgeGraphService.getStats();
        
        // Get relationship type distribution
        const snapshot = isGraphDB()
          ? await (knowledgeGraphService as import('../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService).getGraphSnapshot(10000, null)
          : await (knowledgeGraphService as import('../services/knowledge-graph/core/KnowledgeGraph.js').KnowledgeGraphService).getGraphSnapshot(10000);
        const relationshipTypeCounts: Record<string, number> = {};
        snapshot.edges.forEach((edge: Relation) => {
            relationshipTypeCounts[edge.type] = (relationshipTypeCounts[edge.type] || 0) + 1;
        });

        res.json({
            ...stats,
            relationshipTypeDistribution: relationshipTypeCounts
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching stats');
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// GET /api/knowledge-graph/labeling-usage
// Get semantic labeling usage statistics and budget
router.get('/labeling-usage', async (_req, res) => {
    try {
        const { semanticLabelingService } = await import('../services/semantic/SemanticLabelingService.js');
        const usage = semanticLabelingService.getUsageStats();
        const cache = semanticLabelingService.getCacheStats();
        
        res.json({
            ...usage,
            budgetLimitEUR: 5.0,
            percentageUsed: (usage.costEUR / 5.0) * 100,
            cache: {
                size: cache.size,
                filePath: cache.filePath
            }
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching labeling usage');
        res.status(500).json({ error: 'Failed to fetch labeling usage' });
    }
});

// POST /api/knowledge-graph/compute-gds-metrics
// Compute GDS metrics (PageRank, Betweenness, Degree, Eigenvector) and write to nodes
router.post('/compute-gds-metrics', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ error: 'GDS metrics are not available for GraphDB backend' });
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

        const { getNeo4jDriver } = await import('../config/neo4j.js');
        const { KnowledgeGraphGDSClusteringService } = await import('../services/knowledge-graph/clustering/KnowledgeGraphGDSClusteringService.js');
        const driver = getNeo4jDriver();
        const gdsService = new KnowledgeGraphGDSClusteringService(driver, knowledgeGraphService as Neo4jKnowledgeGraphService);

        // Check if GDS is available
        const isAvailable = await gdsService.isGDSAvailable();
        if (!isAvailable) {
            return res.status(503).json({ 
                error: 'GDS plugin not available',
                message: 'Neo4j Graph Data Science plugin is not installed or not available'
            });
        }

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
    } catch (error) {
        logger.error({ error }, 'Error computing GDS metrics');
        res.status(500).json({ 
            error: 'Failed to compute GDS metrics',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/knowledge-graph/fact-first-query
// Query the knowledge graph using fact-first retrieval pattern
router.post('/fact-first-query', async (req, res) => {
    try {
        const knowledgeGraphService = getKGService();
        await knowledgeGraphService.initialize();
        
        const { query, maxResults, maxHops, relationType } = req.body;
        
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Query parameter is required and must be a string' });
        }
        
        const factFirstService = getFactFirstRetrievalService();
        const result = await factFirstService.query(query, {
            maxResults: maxResults || 50,
            maxHops: maxHops || 2,
            relationType: relationType as RelationType | undefined
        });
        
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error({ error }, 'Error executing fact-first query');
        res.status(500).json({ 
            error: 'Failed to execute fact-first query',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/knowledge-graph/graphrag-query
// Execute a GraphRAG query that orchestrates fact-first retrieval, contextual enrichment, and hybrid scoring
router.post('/graphrag-query', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ error: 'GraphRAG retrieval is not available for GraphDB backend' });
        }

        const { query, strategy, maxResults, maxHops, kgWeight, vectorWeight, enableExplainability } = req.body;
        
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Query parameter is required and must be a string' });
        }
        
        const graphRAGService = await getGraphRAGRetrievalService();
        const result = await graphRAGService.query(query, {
            strategy,
            maxResults: maxResults || 50,
            maxHops: maxHops || 2,
            kgWeight,
            vectorWeight,
            enableExplainability: enableExplainability !== false,
        });
        
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error({ error }, 'Error executing GraphRAG query');
        res.status(500).json({ 
            error: 'Failed to execute GraphRAG query',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Initialize LLM answer generator (lazy initialization)
let llmAnswerGenerator: LLMAnswerGenerator | null = null;
function getLLMAnswerGenerator(): LLMAnswerGenerator {
    if (!llmAnswerGenerator) {
        llmAnswerGenerator = new LLMAnswerGenerator();
    }
    return llmAnswerGenerator;
}

// POST /api/knowledge-graph/generate-answer
// Generate natural language answer from KG facts and vector context
router.post('/generate-answer', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ error: 'LLM answer generation is not available for GraphDB backend' });
        }

        const { query, facts, vectorChunks, hybridScores, options } = req.body;
        
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Query parameter is required and must be a string' });
        }

        if (!facts || !Array.isArray(facts)) {
            return res.status(400).json({ error: 'Facts parameter is required and must be an array' });
        }
        
        const answerGenerator = getLLMAnswerGenerator();
        const result = await answerGenerator.generateAnswer({
            query,
            facts,
            vectorChunks,
            hybridScores,
            options,
        });
        
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error({ error }, 'Error generating answer');
        res.status(500).json({ 
            error: 'Failed to generate answer',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/knowledge-graph/traverse
// Perform graph traversal from a starting node
router.post('/traverse', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ error: 'Graph traversal is not available for GraphDB backend' });
        }

        const knowledgeGraphService = getKGService() as Neo4jKnowledgeGraphService;
        await knowledgeGraphService.initialize();

        const { startNodeId, maxDepth, maxNodes, relationshipTypes, entityTypes, direction, strategy, format } = req.body;

        // Validate required fields
        if (!startNodeId || typeof startNodeId !== 'string') {
            return res.status(400).json({ error: 'startNodeId is required and must be a string' });
        }

        // Validate optional fields
        if (maxDepth !== undefined && (typeof maxDepth !== 'number' || maxDepth < 1 || maxDepth > 10)) {
            return res.status(400).json({ error: 'maxDepth must be a number between 1 and 10' });
        }

        if (maxNodes !== undefined && (typeof maxNodes !== 'number' || maxNodes < 1 || maxNodes > 10000)) {
            return res.status(400).json({ error: 'maxNodes must be a number between 1 and 10000' });
        }

        if (strategy && !['bfs', 'dfs', 'hybrid'].includes(strategy)) {
            return res.status(400).json({ error: 'strategy must be one of: bfs, dfs, hybrid' });
        }

        if (direction && !['outgoing', 'incoming', 'both'].includes(direction)) {
            return res.status(400).json({ error: 'direction must be one of: outgoing, incoming, both' });
        }

        // Build traversal options
        const options: Partial<TraversalOptions> = {};
        if (maxDepth !== undefined) options.maxDepth = maxDepth;
        if (maxNodes !== undefined) options.maxNodes = maxNodes;
        if (relationshipTypes) options.relationshipTypes = Array.isArray(relationshipTypes) ? relationshipTypes : [relationshipTypes] as RelationType[];
        if (entityTypes) options.entityTypes = Array.isArray(entityTypes) ? entityTypes : [entityTypes] as string[];
        if (direction) options.direction = direction as 'outgoing' | 'incoming' | 'both';
        if (strategy) options.strategy = strategy as 'bfs' | 'dfs' | 'hybrid';

        const startTime = Date.now();
        const result = await knowledgeGraphService.traverseGraph(startNodeId, options);
        const duration = Date.now() - startTime;

        // Format response based on format parameter
        if (format === 'minimal') {
            return res.json({
                success: true,
                visitedCount: result.visitedCount,
                depthReached: result.depthReached,
                nodeCount: result.nodes.length,
                edgeCount: result.edges.length,
                duration: `${duration}ms`
            });
        } else if (format === 'summary') {
            return res.json({
                success: true,
                visitedCount: result.visitedCount,
                depthReached: result.depthReached,
                nodeCount: result.nodes.length,
                edgeCount: result.edges.length,
                duration: `${duration}ms`,
                nodes: result.nodes.map((n: TraversalNode) => ({
                    id: n.id,
                    type: 'unknown', // TraversalNode doesn't include type, would need to fetch entity
                    depth: n.depth
                })),
                edges: mapEdgesToKGEdgeDto(result.edges)
            });
        } else {
            // Full format (default)
            return res.json({
                success: true,
                ...result,
                metadata: {
                    startNodeId,
                    duration: `${duration}ms`,
                    options
                }
            });
        }
    } catch (error) {
        logger.error({ error }, 'Error performing graph traversal');
        res.status(500).json({
            error: 'Failed to perform graph traversal',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/knowledge-graph/path
// Find a path between two nodes
router.post('/path', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ error: 'Path finding is not available for GraphDB backend' });
        }

        const knowledgeGraphService = getKGService() as Neo4jKnowledgeGraphService;
        await knowledgeGraphService.initialize();

        const { startNodeId, endNodeId, maxDepth, maxNodes, relationshipTypes, entityTypes, direction, strategy } = req.body;

        // Validate required fields
        if (!startNodeId || typeof startNodeId !== 'string') {
            return res.status(400).json({ error: 'startNodeId is required and must be a string' });
        }

        if (!endNodeId || typeof endNodeId !== 'string') {
            return res.status(400).json({ error: 'endNodeId is required and must be a string' });
        }

        // Validate optional fields
        if (maxDepth !== undefined && (typeof maxDepth !== 'number' || maxDepth < 1 || maxDepth > 10)) {
            return res.status(400).json({ error: 'maxDepth must be a number between 1 and 10' });
        }

        if (maxNodes !== undefined && (typeof maxNodes !== 'number' || maxNodes < 1 || maxNodes > 10000)) {
            return res.status(400).json({ error: 'maxNodes must be a number between 1 and 10000' });
        }

        if (strategy && !['bfs', 'dfs', 'hybrid'].includes(strategy)) {
            return res.status(400).json({ error: 'strategy must be one of: bfs, dfs, hybrid' });
        }

        if (direction && !['outgoing', 'incoming', 'both'].includes(direction)) {
            return res.status(400).json({ error: 'direction must be one of: outgoing, incoming, both' });
        }

        // Build traversal options
        const options: Partial<TraversalOptions> = {};
        if (maxDepth !== undefined) options.maxDepth = maxDepth;
        if (maxNodes !== undefined) options.maxNodes = maxNodes;
        if (relationshipTypes) options.relationshipTypes = Array.isArray(relationshipTypes) ? relationshipTypes : [relationshipTypes] as RelationType[];
        if (entityTypes) options.entityTypes = Array.isArray(entityTypes) ? entityTypes : [entityTypes] as string[];
        if (direction) options.direction = direction as 'outgoing' | 'incoming' | 'both';
        if (strategy) options.strategy = strategy as 'bfs' | 'dfs' | 'hybrid';

        const startTime = Date.now();
        const result = await knowledgeGraphService.findPath(startNodeId, endNodeId, options);
        const duration = Date.now() - startTime;

        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'Path not found',
                message: `No path found between ${startNodeId} and ${endNodeId}`
            });
        }

        return res.json({
            success: true,
            ...result,
            metadata: {
                startNodeId,
                endNodeId,
                duration: `${duration}ms`,
                options
            }
        });
    } catch (error) {
        logger.error({ error }, 'Error finding path');
        res.status(500).json({
            error: 'Failed to find path',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/knowledge-graph/subgraph
// Extract a subgraph around a node
router.post('/subgraph', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ error: 'Subgraph extraction is not available for GraphDB backend' });
        }

        const knowledgeGraphService = getKGService() as Neo4jKnowledgeGraphService;
        await knowledgeGraphService.initialize();

        const { centerNodeId, radius, maxNodes, relationshipTypes, entityTypes, direction, strategy } = req.body;

        // Validate required fields
        if (!centerNodeId || typeof centerNodeId !== 'string') {
            return res.status(400).json({ error: 'centerNodeId is required and must be a string' });
        }

        // Validate optional fields
        if (radius !== undefined && (typeof radius !== 'number' || radius < 1 || radius > 5)) {
            return res.status(400).json({ error: 'radius must be a number between 1 and 5' });
        }

        if (maxNodes !== undefined && (typeof maxNodes !== 'number' || maxNodes < 1 || maxNodes > 10000)) {
            return res.status(400).json({ error: 'maxNodes must be a number between 1 and 10000' });
        }

        if (strategy && !['bfs', 'dfs', 'hybrid'].includes(strategy)) {
            return res.status(400).json({ error: 'strategy must be one of: bfs, dfs, hybrid' });
        }

        if (direction && !['outgoing', 'incoming', 'both'].includes(direction)) {
            return res.status(400).json({ error: 'direction must be one of: outgoing, incoming, both' });
        }

        // Build traversal options
        const options: Partial<TraversalOptions> = {};
        if (maxNodes !== undefined) options.maxNodes = maxNodes;
        if (relationshipTypes) options.relationshipTypes = Array.isArray(relationshipTypes) ? relationshipTypes : [relationshipTypes] as RelationType[];
        if (entityTypes) options.entityTypes = Array.isArray(entityTypes) ? entityTypes : [entityTypes] as string[];
        if (direction) options.direction = direction as 'outgoing' | 'incoming' | 'both';
        if (strategy) options.strategy = strategy as 'bfs' | 'dfs' | 'hybrid';

        const startTime = Date.now();
        const result = await knowledgeGraphService.extractSubgraph(centerNodeId, radius || 2, options);
        const duration = Date.now() - startTime;

        return res.json({
            success: true,
            ...result,
            metadata: {
                centerNodeId,
                duration: `${duration}ms`,
                options
            }
        });
    } catch (error) {
        logger.error({ error }, 'Error extracting subgraph');
        res.status(500).json({
            error: 'Failed to extract subgraph',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// GET /api/knowledge-graph/traversal/stats
// Get traversal statistics
router.get('/traversal/stats', async (_req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ error: 'Traversal statistics are not available for GraphDB backend' });
        }

        const knowledgeGraphService = getKGService() as Neo4jKnowledgeGraphService;
        await knowledgeGraphService.initialize();

        // Get feature flag status
        const { getFeatureFlagsService } = await import('../services/knowledge-graph/KnowledgeGraphFeatureFlags.js');
        const { KGFeatureFlag } = await import('../models/FeatureFlag.js');
        const featureFlagsService = getFeatureFlagsService();
        const traversalEnabled = featureFlagsService.isEnabled(KGFeatureFlag.KG_TRAVERSAL_ENABLED, false);

        // Get graph stats
        const stats = await knowledgeGraphService.getStats();
        const snapshot = isGraphDB()
          ? await (knowledgeGraphService as unknown as import('../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService).getGraphSnapshot(1000, null)
          : await knowledgeGraphService.getGraphSnapshot(1000);

        // Calculate relationship type distribution
        const relationshipTypeCounts: Record<string, number> = {};
        snapshot.edges.forEach((edge: Relation) => {
            relationshipTypeCounts[edge.type] = (relationshipTypeCounts[edge.type] || 0) + 1;
        });

        // Calculate entity type distribution
        const entityTypeCounts: Record<string, number> = {};
        snapshot.nodes.forEach((node: BaseEntity) => {
            entityTypeCounts[node.type] = (entityTypeCounts[node.type] || 0) + 1;
        });

        return res.json({
            success: true,
            traversalEnabled,
            graphStats: {
                totalNodes: stats.nodeCount,
                totalEdges: stats.edgeCount,
                entityTypeDistribution: entityTypeCounts,
                relationshipTypeDistribution: relationshipTypeCounts
            },
            capabilities: {
                traversal: traversalEnabled,
                strategies: ['bfs', 'dfs', 'hybrid'],
                maxDepth: 10,
                maxNodes: 10000
            }
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching traversal stats');
        res.status(500).json({
            error: 'Failed to fetch traversal statistics',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Initialize traversal service (lazy initialization)
let traversalService: GraphTraversalService | null = null;
function getTraversalService(): GraphTraversalService {
    if (isGraphDB()) {
        throw new Error('Graph traversal is not available for GraphDB backend');
    }
    if (!traversalService) {
        const driver = getNeo4jDriver();
        traversalService = new GraphTraversalService(driver);
    }
    return traversalService;
}

// POST /api/knowledge-graph/traverse
// Perform graph traversal from a starting node
router.post('/traverse', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ error: 'Graph traversal is not available for GraphDB backend' });
        }

        const { startNodeId, maxDepth, maxNodes, relationshipTypes, entityTypes, direction, strategy, format } = req.body;
        
        // Validation
        if (!startNodeId || typeof startNodeId !== 'string') {
            return res.status(400).json({ 
                error: 'startNodeId is required and must be a string',
                example: { startNodeId: 'https://schema.org/PolicyDocument/123' }
            });
        }

        if (maxDepth !== undefined && (typeof maxDepth !== 'number' || maxDepth < 1 || maxDepth > 10)) {
            return res.status(400).json({ 
                error: 'maxDepth must be a number between 1 and 10',
                provided: maxDepth
            });
        }

        if (maxNodes !== undefined && (typeof maxNodes !== 'number' || maxNodes < 1 || maxNodes > 10000)) {
            return res.status(400).json({ 
                error: 'maxNodes must be a number between 1 and 10000',
                provided: maxNodes
            });
        }

        if (strategy && !['bfs', 'dfs', 'hybrid'].includes(strategy)) {
            return res.status(400).json({ 
                error: 'strategy must be one of: bfs, dfs, hybrid',
                provided: strategy
            });
        }

        if (direction && !['outgoing', 'incoming', 'both'].includes(direction)) {
            return res.status(400).json({ 
                error: 'direction must be one of: outgoing, incoming, both',
                provided: direction
            });
        }

        const traversal = getTraversalService();
        const startTime = Date.now();
        
        const result = await traversal.traverse(startNodeId, {
            maxDepth: maxDepth || 3,
            maxNodes: maxNodes || 1000,
            relationshipTypes: relationshipTypes || undefined,
            entityTypes: entityTypes || undefined,
            direction: direction || 'both',
            strategy: strategy || 'bfs',
        });

        const duration = Date.now() - startTime;

        // Format response based on format parameter
        if (format === 'minimal') {
            return res.json({
                success: true,
                nodeCount: result.nodes.length,
                edgeCount: result.edges.length,
                visitedCount: result.visitedCount,
                depthReached: result.depthReached,
                duration: `${duration}ms`
            });
        } else if (format === 'summary') {
            return res.json({
                success: true,
                metadata: {
                    startNodeId,
                    visitedCount: result.visitedCount,
                    depthReached: result.depthReached,
                    nodeCount: result.nodes.length,
                    edgeCount: result.edges.length,
                    duration: `${duration}ms`
                },
                nodeTypes: {}, // TraversalNode doesn't include type information
                relationshipTypes: result.edges.reduce((acc, edge) => {
                    acc[edge.type] = (acc[edge.type] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>)
            });
        }

        // Full format (default)
        res.json({
            success: true,
            nodes: result.nodes,
            edges: result.edges,
            metadata: {
                startNodeId,
                visitedCount: result.visitedCount,
                depthReached: result.depthReached,
                nodeCount: result.nodes.length,
                edgeCount: result.edges.length,
                duration: `${duration}ms`,
                strategy: strategy || 'bfs'
            }
        });
    } catch (error) {
        logger.error({ error }, 'Error performing graph traversal');
        res.status(500).json({ 
            error: 'Failed to perform graph traversal',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/knowledge-graph/path
// Find path between two nodes
router.post('/path', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ error: 'Graph traversal is not available for GraphDB backend' });
        }

        const { startNodeId, endNodeId, maxDepth, maxNodes, relationshipTypes, entityTypes, direction, strategy } = req.body;
        
        // Validation
        if (!startNodeId || typeof startNodeId !== 'string') {
            return res.status(400).json({ 
                error: 'startNodeId is required and must be a string'
            });
        }

        if (!endNodeId || typeof endNodeId !== 'string') {
            return res.status(400).json({ 
                error: 'endNodeId is required and must be a string'
            });
        }

        if (maxDepth !== undefined && (typeof maxDepth !== 'number' || maxDepth < 1 || maxDepth > 10)) {
            return res.status(400).json({ 
                error: 'maxDepth must be a number between 1 and 10'
            });
        }

        if (maxNodes !== undefined && (typeof maxNodes !== 'number' || maxNodes < 1 || maxNodes > 10000)) {
            return res.status(400).json({ 
                error: 'maxNodes must be a number between 1 and 10000'
            });
        }

        const traversal = getTraversalService();
        const startTime = Date.now();
        
        const result = await traversal.findPath(startNodeId, endNodeId, {
            maxDepth: maxDepth || 5,
            maxNodes: maxNodes || 1000,
            relationshipTypes: relationshipTypes || undefined,
            entityTypes: entityTypes || undefined,
            direction: direction || 'both',
            strategy: strategy || 'bfs',
        });

        const duration = Date.now() - startTime;

        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'Path not found',
                message: `No path found between ${startNodeId} and ${endNodeId} within the specified constraints`
            });
        }

        res.json({
            success: true,
            path: result.path,
            nodes: result.nodes,
            edges: result.edges,
            metadata: {
                startNodeId,
                endNodeId,
                pathLength: result.path.length,
                depth: result.depth,
                duration: `${duration}ms`
            }
        });
    } catch (error) {
        logger.error({ error }, 'Error finding path');
        res.status(500).json({ 
            error: 'Failed to find path',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/knowledge-graph/subgraph
// Extract subgraph around a center node
router.post('/subgraph', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ error: 'Graph traversal is not available for GraphDB backend' });
        }

        const { centerNodeId, radius, maxNodes, relationshipTypes, entityTypes, direction, strategy } = req.body;
        
        // Validation
        if (!centerNodeId || typeof centerNodeId !== 'string') {
            return res.status(400).json({ 
                error: 'centerNodeId is required and must be a string'
            });
        }

        if (radius !== undefined && (typeof radius !== 'number' || radius < 1 || radius > 5)) {
            return res.status(400).json({ 
                error: 'radius must be a number between 1 and 5',
                provided: radius
            });
        }

        if (maxNodes !== undefined && (typeof maxNodes !== 'number' || maxNodes < 1 || maxNodes > 10000)) {
            return res.status(400).json({ 
                error: 'maxNodes must be a number between 1 and 10000'
            });
        }

        const traversal = getTraversalService();
        const startTime = Date.now();
        
        const result = await traversal.extractSubgraph(centerNodeId, radius || 2, {
            maxNodes: maxNodes || 1000,
            relationshipTypes: relationshipTypes || undefined,
            entityTypes: entityTypes || undefined,
            direction: direction || 'both',
            strategy: strategy || 'bfs',
        });

        const duration = Date.now() - startTime;

        res.json({
            success: true,
            nodes: result.nodes,
            edges: result.edges,
            metadata: {
                centerNodeId: result.centerNodeId,
                radius: result.radius,
                nodeCount: result.nodes.length,
                edgeCount: result.edges.length,
                duration: `${duration}ms`
            }
        });
    } catch (error) {
        logger.error({ error }, 'Error extracting subgraph');
        res.status(500).json({ 
            error: 'Failed to extract subgraph',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// GET /api/knowledge-graph/traversal/stats
// Get traversal statistics
router.get('/traversal/stats', async (_req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ error: 'Graph traversal is not available for GraphDB backend' });
        }

        const knowledgeGraphService = getKGService();
        await knowledgeGraphService.initialize();
        
        // Get basic graph stats
        const stats = await knowledgeGraphService.getStats();
        
        // Get relationship type distribution
        const snapshot = isGraphDB()
          ? await (knowledgeGraphService as import('../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService).getGraphSnapshot(10000, null)
          : await (knowledgeGraphService as import('../services/knowledge-graph/core/KnowledgeGraph.js').KnowledgeGraphService).getGraphSnapshot(10000);
        const relationshipTypeCounts: Record<string, number> = {};
        snapshot.edges.forEach((edge: Relation) => {
            relationshipTypeCounts[edge.type] = (relationshipTypeCounts[edge.type] || 0) + 1;
        });

        // Get entity type distribution
        const entityTypeCounts: Record<string, number> = {};
        snapshot.nodes.forEach((node: BaseEntity) => {
            entityTypeCounts[node.type] = (entityTypeCounts[node.type] || 0) + 1;
        });

        res.json({
            success: true,
            graphStats: {
                totalNodes: stats.nodeCount,
                totalRelationships: stats.edgeCount,
                entityTypeDistribution: entityTypeCounts,
                relationshipTypeDistribution: relationshipTypeCounts
            },
            traversal: {
                enabled: true, // Could check feature flag here
                supportedStrategies: ['bfs', 'dfs', 'hybrid'],
                maxDepth: 10,
                maxNodes: 10000,
                supportedDirections: ['outgoing', 'incoming', 'both']
            }
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching traversal stats');
        res.status(500).json({ 
            error: 'Failed to fetch traversal stats',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/knowledge-graph/steiner-tree
// Find Steiner tree connecting terminal nodes
// Body: { query?: string, terminalNodeIds?: string[], maxDepth?: number, maxNodes?: number, relationshipTypes?: string[], minWeight?: number }
router.post('/steiner-tree', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ 
                error: 'Steiner tree is not available for GraphDB backend' 
            });
        }

        const service = await getSteinerTreeService();
        const { query, terminalNodeIds, maxDepth, maxNodes, relationshipTypes, minWeight } = req.body;

        if (!query && (!terminalNodeIds || terminalNodeIds.length < 2)) {
            return res.status(400).json({ 
                error: 'Either query or at least 2 terminalNodeIds must be provided' 
            });
        }

        const result = await service.findSteinerTree({
            query,
            terminalNodeIds,
            maxDepth,
            maxNodes,
            relationshipTypes,
            minWeight,
        });

        if (!result) {
            return res.status(404).json({ 
                error: 'No Steiner tree found connecting the terminal nodes' 
            });
        }

        res.json({
            success: true,
            result: {
                nodes: result.nodes,
                edges: result.edges,
                totalCost: result.totalCost,
                terminalNodes: result.terminalNodes,
                steinerNodes: result.steinerNodes,
                pathFindingTime: result.pathFindingTime,
                averageConfidence: result.averageConfidence,
                explanation: result.explanation,
            },
        });
    } catch (error) {
        logger.error({ error }, 'Error finding Steiner tree');
        res.status(500).json({ 
            error: 'Failed to find Steiner tree',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Initialize change detection service (lazy initialization)
let changeDetectionService: ChangeDetectionService | null = null;
function getChangeDetectionService(): ChangeDetectionService {
    if (!changeDetectionService) {
        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        changeDetectionService = new ChangeDetectionService(kgService);
    }
    return changeDetectionService;
}

// Initialize incremental updater service (lazy initialization)
let incrementalUpdater: IncrementalUpdater | null = null;
function getIncrementalUpdater(): IncrementalUpdater {
    if (!incrementalUpdater) {
        if (isGraphDB()) {
            throw new Error('Incremental updater is not available for GraphDB backend');
        }
        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        const driver = getNeo4jDriver();
        incrementalUpdater = new IncrementalUpdater(kgService, driver);
    }
    return incrementalUpdater;
}

// POST /api/knowledge-graph/detect-changes
// Detect changes in a single document
// Body: { document: ScrapedDocument, options?: ChangeDetectionOptions }
router.post('/detect-changes', async (req, res) => {
    try {
        const { document, options } = req.body;

        if (!document || !document.url) {
            return res.status(400).json({ 
                error: 'Document with URL is required' 
            });
        }

        const service = getChangeDetectionService();
        const changeSet = await service.detectDocumentChanges(document as ScrapedDocument, options);

        res.json({
            success: true,
            changeSet,
            summary: {
                totalChanges: changeSet.totalChanges,
                newDocuments: changeSet.newDocuments.length,
                updatedDocuments: changeSet.updatedDocuments.length,
                deletedDocuments: changeSet.deletedDocuments.length,
                newEntities: changeSet.newEntities.length,
                updatedEntities: changeSet.updatedEntities.length,
                deletedEntities: changeSet.deletedEntities.length,
                newRelationships: changeSet.newRelationships.length,
                updatedRelationships: changeSet.updatedRelationships.length,
                deletedRelationships: changeSet.deletedRelationships.length,
                processingTimeMs: changeSet.processingTimeMs
            }
        });
    } catch (error) {
        logger.error({ error }, 'Error detecting changes');
        res.status(500).json({ 
            error: 'Failed to detect changes',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/knowledge-graph/detect-batch-changes
// Detect changes in multiple documents (batch processing)
// Body: { documents: ScrapedDocument[], options?: ChangeDetectionOptions }
router.post('/detect-batch-changes', async (req, res) => {
    try {
        const { documents, options } = req.body;

        if (!documents || !Array.isArray(documents) || documents.length === 0) {
            return res.status(400).json({ 
                error: 'Documents array is required and must not be empty' 
            });
        }

        const service = getChangeDetectionService();
        const result = await service.detectBatchChanges(documents as ScrapedDocument[], options);

        res.json({
            success: true,
            result,
            summary: {
                documentsProcessed: result.documentsProcessed,
                changesDetected: result.changesDetected,
                processingTimeMs: result.processingTimeMs,
                errors: result.errors?.length || 0,
                changeSetSummary: {
                    totalChanges: result.changeSet.totalChanges,
                    newDocuments: result.changeSet.newDocuments.length,
                    updatedDocuments: result.changeSet.updatedDocuments.length,
                    deletedDocuments: result.changeSet.deletedDocuments.length,
                    newEntities: result.changeSet.newEntities.length,
                    updatedEntities: result.changeSet.updatedEntities.length,
                    deletedEntities: result.changeSet.deletedEntities.length,
                    newRelationships: result.changeSet.newRelationships.length,
                    updatedRelationships: result.changeSet.updatedRelationships.length,
                    deletedRelationships: result.changeSet.deletedRelationships.length
                }
            }
        });
    } catch (error) {
        logger.error({ error }, 'Error detecting batch changes');
        res.status(500).json({ 
            error: 'Failed to detect batch changes',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/knowledge-graph/incremental-update
// Process a change set and apply incremental updates
// Body: { changeSet: ChangeSet, options?: IncrementalUpdateOptions }
router.post('/incremental-update', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ 
                error: 'Incremental updates are not available for GraphDB backend' 
            });
        }

        const { changeSet, options } = req.body;

        if (!changeSet) {
            return res.status(400).json({ 
                error: 'Change set is required' 
            });
        }

        const updater = getIncrementalUpdater();
        const result = await updater.processChangeSet(changeSet as ChangeSet, options);

        res.json({
            success: result.success,
            changeSetId: result.changeSetId,
            metrics: result.metrics,
            requiresManualReview: result.requiresManualReview,
            reviewItems: result.reviewItems,
            summary: {
                entitiesAdded: result.metrics.entitiesAdded,
                entitiesUpdated: result.metrics.entitiesUpdated,
                entitiesDeleted: result.metrics.entitiesDeleted,
                relationshipsAdded: result.metrics.relationshipsAdded,
                relationshipsUpdated: result.metrics.relationshipsUpdated,
                relationshipsDeleted: result.metrics.relationshipsDeleted,
                conflictsDetected: result.metrics.conflictsDetected,
                conflictsResolved: result.metrics.conflictsResolved,
                conflictsRequiringReview: result.metrics.conflictsRequiringReview,
                processingTimeMs: result.metrics.processingTimeMs,
                errors: result.metrics.errors.length
            }
        });
    } catch (error) {
        logger.error({ error }, 'Error processing incremental update');
        res.status(500).json({ 
            error: 'Failed to process incremental update',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// ============================================
// Hierarchical Structure API Endpoints
// ============================================

// Helper function to check hierarchical structure feature flag
function checkHierarchicalStructureEnabled(): boolean {
    try {
        const featureFlagsService = getFeatureFlagsService();
        return featureFlagsService.isEnabled(KGFeatureFlag.KG_HIERARCHICAL_STRUCTURE_ENABLED, false);
    } catch (_error) {
        return false;
    }
}

// GET /api/knowledge-graph/hierarchy/jurisdiction/:id/regulations
// Get regulations in jurisdiction and parent jurisdictions
router.get('/hierarchy/jurisdiction/:id/regulations', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ 
                error: 'Hierarchical structure is not available for GraphDB backend' 
            });
        }

        if (!checkHierarchicalStructureEnabled()) {
            return res.status(503).json({
                error: 'Hierarchical structure feature is disabled',
                message: 'Enable KG_HIERARCHICAL_STRUCTURE_ENABLED feature flag to use this endpoint',
            });
        }

        const { id } = req.params;
        const { includeChildren, includeParents, maxDepth, levelFilter } = req.query;

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        const options: HierarchicalQueryOptions = {
            includeChildren: includeChildren === 'true',
            includeParents: includeParents !== 'false', // Default to true
            maxDepth: maxDepth ? parseInt(maxDepth as string, 10) : undefined,
            levelFilter: levelFilter ? (levelFilter as string).split(',') as HierarchyLevel[] : undefined,
        };

        const regulations = await kgService.findRegulationsInJurisdictionAndParents(id, options);

        res.json({
            success: true,
            jurisdictionId: id,
            regulations,
            count: regulations.length,
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching regulations in jurisdiction');
        res.status(500).json({
            error: 'Failed to fetch regulations',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/hierarchy/jurisdiction/:id/children
// Get child jurisdictions
router.get('/hierarchy/jurisdiction/:id/children', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ 
                error: 'Hierarchical structure is not available for GraphDB backend' 
            });
        }

        if (!checkHierarchicalStructureEnabled()) {
            return res.status(503).json({
                error: 'Hierarchical structure feature is disabled',
                message: 'Enable KG_HIERARCHICAL_STRUCTURE_ENABLED feature flag to use this endpoint',
            });
        }

        const { id } = req.params;
        const { maxDepth, levelFilter } = req.query;

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        const options = {
            maxDepth: maxDepth ? parseInt(maxDepth as string, 10) : undefined,
            levelFilter: levelFilter ? (levelFilter as string).split(',') as HierarchyLevel[] : undefined,
        };

        const children = await kgService.findChildJurisdictions(id, options);

        res.json({
            success: true,
            jurisdictionId: id,
            children,
            count: children.length,
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching child jurisdictions');
        res.status(500).json({
            error: 'Failed to fetch child jurisdictions',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/hierarchy/level/:level
// Get regulations at specific hierarchy level
router.get('/hierarchy/level/:level', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ 
                error: 'Hierarchical structure is not available for GraphDB backend' 
            });
        }

        if (!checkHierarchicalStructureEnabled()) {
            return res.status(503).json({
                error: 'Hierarchical structure feature is disabled',
                message: 'Enable KG_HIERARCHICAL_STRUCTURE_ENABLED feature flag to use this endpoint',
            });
        }

        const { level } = req.params;

        if (!['municipality', 'province', 'national', 'european'].includes(level)) {
            return res.status(400).json({
                error: 'Invalid hierarchy level',
                message: 'Level must be one of: municipality, province, national, european',
            });
        }

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        const regulations = await kgService.findRegulationsAtLevel(level as HierarchyLevel);

        res.json({
            success: true,
            level,
            regulations,
            count: regulations.length,
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching regulations at level');
        res.status(500).json({
            error: 'Failed to fetch regulations',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/hierarchy/jurisdiction/:id/subtree
// Get jurisdiction subtree
router.get('/hierarchy/jurisdiction/:id/subtree', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ 
                error: 'Hierarchical structure is not available for GraphDB backend' 
            });
        }

        if (!checkHierarchicalStructureEnabled()) {
            return res.status(503).json({
                error: 'Hierarchical structure feature is disabled',
                message: 'Enable KG_HIERARCHICAL_STRUCTURE_ENABLED feature flag to use this endpoint',
            });
        }

        const { id } = req.params;
        const { includeChildren, includeParents, maxDepth, levelFilter } = req.query;

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        const options = {
            includeChildren: includeChildren !== 'false', // Default to true
            includeParents: includeParents !== 'false', // Default to true
            maxDepth: maxDepth ? parseInt(maxDepth as string, 10) : undefined,
            levelFilter: levelFilter ? (levelFilter as string).split(',') as HierarchyLevel[] : undefined,
        };

        const subtree = await kgService.findJurisdictionSubtree(id, options);

        if (!subtree) {
            return res.status(404).json({
                error: 'Jurisdiction not found',
                jurisdictionId: id,
            });
        }

        res.json({
            success: true,
            jurisdictionId: id,
            subtree,
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching jurisdiction subtree');
        res.status(500).json({
            error: 'Failed to fetch jurisdiction subtree',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /api/knowledge-graph/hierarchy/jurisdiction/:id/update
// Update hierarchy for entity
router.post('/hierarchy/jurisdiction/:id/update', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ 
                error: 'Hierarchical structure is not available for GraphDB backend' 
            });
        }

        if (!checkHierarchicalStructureEnabled()) {
            return res.status(503).json({
                error: 'Hierarchical structure feature is disabled',
                message: 'Enable KG_HIERARCHICAL_STRUCTURE_ENABLED feature flag to use this endpoint',
            });
        }

        const { id } = req.params;
        const { hierarchy } = req.body;

        if (!hierarchy || !hierarchy.level) {
            return res.status(400).json({
                error: 'Invalid hierarchy data',
                message: 'Hierarchy object with level is required',
            });
        }

        // Validate hierarchy level
        const validLevels = ['municipality', 'province', 'national', 'european'];
        if (!validLevels.includes(hierarchy.level)) {
            return res.status(400).json({
                error: 'Invalid hierarchy level',
                message: `Level must be one of: ${validLevels.join(', ')}`,
            });
        }

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        // Check if entity exists
        const entity = await kgService.getNode(id);
        if (!entity) {
            return res.status(404).json({
                error: 'Entity not found',
                entityId: id,
            });
        }

        // Update hierarchy
        await kgService.updateHierarchy(id, hierarchy);

        res.json({
            success: true,
            entityId: id,
            hierarchy,
            message: 'Hierarchy updated successfully',
        });
    } catch (error) {
        logger.error({ error }, 'Error updating hierarchy');
        res.status(500).json({
            error: 'Failed to update hierarchy',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/hierarchy/validate/:id
// Validate hierarchy for entity
router.get('/hierarchy/validate/:id', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ 
                error: 'Hierarchical structure is not available for GraphDB backend' 
            });
        }

        if (!checkHierarchicalStructureEnabled()) {
            return res.status(503).json({
                error: 'Hierarchical structure feature is disabled',
                message: 'Enable KG_HIERARCHICAL_STRUCTURE_ENABLED feature flag to use this endpoint',
            });
        }

        const { id } = req.params;
        const { includeParent } = req.query;

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        const entity = await kgService.getNode(id);

        if (!entity) {
            return res.status(404).json({
                error: 'Entity not found',
                entityId: id,
            });
        }

        if (entity.type !== 'PolicyDocument') {
            return res.status(400).json({
                error: 'Entity is not a PolicyDocument',
                entityId: id,
                entityType: entity.type,
            });
        }

        // Get parent entity if requested
        let parentEntity: PolicyDocument | undefined;
        const policyDoc = entity as PolicyDocument;
        if (includeParent === 'true' && policyDoc.hierarchy?.parentId) {
            const parent = await kgService.getNode(policyDoc.hierarchy.parentId);
            if (parent && parent.type === 'PolicyDocument') {
                parentEntity = parent as PolicyDocument;
            }
        }

        // Validate hierarchy
        const validation = kgService.validateHierarchy(entity as PolicyDocument, parentEntity);

        res.json({
            success: true,
            entityId: id,
            validation,
        });
    } catch (error) {
        logger.error({ error }, 'Error validating hierarchy');
        res.status(500).json({
            error: 'Failed to validate hierarchy',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// ============================================================================
// Temporal Query Endpoints
// ============================================================================

// GET /api/knowledge-graph/temporal/active?date=YYYY-MM-DD
// Get entities active on a specific date
router.get('/temporal/active', async (req, res) => {
    try {
        const { date } = req.query;

        if (!date || typeof date !== 'string') {
            return res.status(400).json({
                error: 'Invalid date parameter',
                message: 'Date parameter (YYYY-MM-DD) is required',
            });
        }

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        const entities = await kgService.getEntitiesActiveOnDate(date);

        res.json({
            success: true,
            date,
            entities,
            count: entities.length,
        });
    } catch (error) {
        logger.error({ error }, 'Error querying active entities');
        res.status(500).json({
            error: 'Failed to query active entities',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/temporal/range?start=YYYY-MM-DD&end=YYYY-MM-DD
// Get entities effective in a date range
router.get('/temporal/range', async (req, res) => {
    try {
        const { start, end } = req.query;

        if (!start || typeof start !== 'string' || !end || typeof end !== 'string') {
            return res.status(400).json({
                error: 'Invalid date range parameters',
                message: 'Both start and end date parameters (YYYY-MM-DD) are required',
            });
        }

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        const entities = await kgService.getEntitiesInDateRange(start, end);

        res.json({
            success: true,
            startDate: start,
            endDate: end,
            entities,
            count: entities.length,
        });
    } catch (error) {
        logger.error({ error }, 'Error querying entities in date range');
        res.status(500).json({
            error: 'Failed to query entities in date range',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/temporal/entity/:id/history
// Get entity history (all versions)
router.get('/temporal/entity/:id/history', async (req, res) => {
    try {
        const { id } = req.params;

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        const versions = await kgService.getEntityHistory(id);

        res.json({
            success: true,
            entityId: id,
            versions,
            count: versions.length,
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching entity history');
        res.status(500).json({
            error: 'Failed to fetch entity history',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/temporal/entity/:id/state?date=YYYY-MM-DD
// Get entity state at a specific date
router.get('/temporal/entity/:id/state', async (req, res) => {
    try {
        const { id } = req.params;
        const { date } = req.query;

        if (!date || typeof date !== 'string') {
            return res.status(400).json({
                error: 'Invalid date parameter',
                message: 'Date parameter (YYYY-MM-DD) is required',
            });
        }

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        const entity = await kgService.getEntityStateAtDate(id, date);

        if (!entity) {
            return res.status(404).json({
                error: 'Entity state not found',
                entityId: id,
                date,
            });
        }

        res.json({
            success: true,
            entityId: id,
            date,
            entity,
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching entity state');
        res.status(500).json({
            error: 'Failed to fetch entity state',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/temporal/entity/:id/compare?version1=N&version2=M
// Compare two versions of an entity
router.get('/temporal/entity/:id/compare', async (req, res) => {
    try {
        const { id } = req.params;
        const { version1, version2 } = req.query;

        if (!version1 || !version2) {
            return res.status(400).json({
                error: 'Invalid version parameters',
                message: 'Both version1 and version2 parameters are required',
            });
        }

        const v1 = parseInt(version1 as string, 10);
        const v2 = parseInt(version2 as string, 10);

        if (isNaN(v1) || isNaN(v2)) {
            return res.status(400).json({
                error: 'Invalid version numbers',
                message: 'Version parameters must be valid numbers',
            });
        }

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        const comparison = await kgService.compareEntityVersions(id, v1, v2);

        res.json({
            success: true,
            entityId: id,
            ...comparison,
        });
    } catch (error) {
        logger.error({ error }, 'Error comparing entity versions');
        res.status(500).json({
            error: 'Failed to compare entity versions',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/temporal/entity/:id/validate
// Validate temporal consistency for an entity
router.get('/temporal/entity/:id/validate', async (req, res) => {
    try {
        const { id } = req.params;

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        const validation = await kgService.validateTemporalConsistencyById(id);

        res.json({
            success: true,
            entityId: id,
            ...validation,
        });
    } catch (error) {
        logger.error({ error }, 'Error validating temporal consistency');
        res.status(500).json({
            error: 'Failed to validate temporal consistency',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// ============================================================================
// Document Dependency Tracking Endpoints
// ============================================================================

// Helper function to check document dependencies feature flag
function checkDocumentDependenciesEnabled(): boolean {
    try {
        const featureFlagsService = getFeatureFlagsService();
        return featureFlagsService.isEnabled(KGFeatureFlag.KG_DOCUMENT_DEPENDENCIES_ENABLED, false);
    } catch (_error) {
        return false;
    }
}

// POST /api/knowledge-graph/dependencies/extract
// Extract dependencies from a document
router.post('/dependencies/extract', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ 
                error: 'Document dependency tracking is not available for GraphDB backend' 
            });
        }

        if (!checkDocumentDependenciesEnabled()) {
            return res.status(503).json({
                error: 'Document dependency tracking feature is disabled',
                message: 'Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to use this endpoint',
            });
        }

        const { documentId, documentText, documentTitle } = req.body;

        if (!documentId || !documentText) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'documentId and documentText are required',
            });
        }

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        const result = await kgService.extractDocumentDependencies(documentId, documentText, documentTitle);

        res.json({
            ...result,
        });
    } catch (error) {
        logger.error({ error }, 'Error extracting document dependencies');
        res.status(500).json({
            error: 'Failed to extract document dependencies',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /api/knowledge-graph/dependencies/store
// Store dependencies in the knowledge graph
router.post('/dependencies/store', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ 
                error: 'Document dependency tracking is not available for GraphDB backend' 
            });
        }

        if (!checkDocumentDependenciesEnabled()) {
            return res.status(503).json({
                error: 'Document dependency tracking feature is disabled',
                message: 'Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to use this endpoint',
            });
        }

        const { dependencies } = req.body;

        if (!dependencies || !Array.isArray(dependencies)) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'dependencies array is required',
            });
        }

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        const result = await kgService.storeDocumentDependencies(dependencies);

        res.json({
            success: true,
            ...result,
        });
    } catch (error) {
        logger.error({ error }, 'Error storing document dependencies');
        res.status(500).json({
            error: 'Failed to store document dependencies',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/dependencies/document/:id
// Get dependencies for a document
router.get('/dependencies/document/:id', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ 
                error: 'Document dependency tracking is not available for GraphDB backend' 
            });
        }

        if (!checkDocumentDependenciesEnabled()) {
            return res.status(503).json({
                error: 'Document dependency tracking feature is disabled',
                message: 'Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to use this endpoint',
            });
        }

        const { id } = req.params;

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        const result = await kgService.getDocumentDependencies(id);

        res.json({
            success: true,
            ...result,
        });
    } catch (error) {
        logger.error({ error }, 'Error fetching document dependencies');
        res.status(500).json({
            error: 'Failed to fetch document dependencies',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/dependencies/validate
// Validate dependency integrity
router.get('/dependencies/validate', async (_req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ 
                error: 'Document dependency tracking is not available for GraphDB backend' 
            });
        }

        if (!checkDocumentDependenciesEnabled()) {
            return res.status(503).json({
                error: 'Document dependency tracking feature is disabled',
                message: 'Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to use this endpoint',
            });
        }

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        const result = await kgService.validateDependencyIntegrity();

        res.json({
            success: true,
            ...result,
        });
    } catch (error) {
        logger.error({ error }, 'Error validating dependency integrity');
        res.status(500).json({
            error: 'Failed to validate dependency integrity',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/dependencies/document/:id/impact
// Analyze impact of document changes
router.get('/dependencies/document/:id/impact', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ 
                error: 'Document dependency tracking is not available for GraphDB backend' 
            });
        }

        if (!checkDocumentDependenciesEnabled()) {
            return res.status(503).json({
                error: 'Document dependency tracking feature is disabled',
                message: 'Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to use this endpoint',
            });
        }

        const { id } = req.params;
        const { maxDepth } = req.query;

        const depth = maxDepth ? parseInt(maxDepth as string, 10) : 3;

        if (isNaN(depth) || depth < 1 || depth > 10) {
            return res.status(400).json({
                error: 'Invalid maxDepth parameter',
                message: 'maxDepth must be a number between 1 and 10',
            });
        }

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        const result = await kgService.analyzeDocumentImpact(id, depth);

        res.json({
            success: true,
            ...result,
            documentId: id,
        });
    } catch (error) {
        logger.error({ error }, 'Error analyzing document impact');
        res.status(500).json({
            error: 'Failed to analyze document impact',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/dependencies/document/:id/impact-report
// Generate impact report for a document
router.get('/dependencies/document/:id/impact-report', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({ 
                error: 'Document dependency tracking is not available for GraphDB backend' 
            });
        }

        if (!checkDocumentDependenciesEnabled()) {
            return res.status(503).json({
                error: 'Document dependency tracking feature is disabled',
                message: 'Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to use this endpoint',
            });
        }

        const { id } = req.params;
        const { maxDepth } = req.query;

        const depth = maxDepth ? parseInt(maxDepth as string, 10) : 3;

        if (isNaN(depth) || depth < 1 || depth > 10) {
            return res.status(400).json({
                error: 'Invalid maxDepth parameter',
                message: 'maxDepth must be a number between 1 and 10',
            });
        }

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        const result = await kgService.generateImpactReport(id, depth);

        res.json({
            success: true,
            ...result,
            documentId: id,
        });
    } catch (error) {
        logger.error({ error }, 'Error generating impact report');
        res.status(500).json({
            error: 'Failed to generate impact report',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// ============================================================================
// Ontology Alignment Endpoints
// ============================================================================

// Initialize ontology alignment service (lazy initialization)
let ontologyAlignmentService: OntologyAlignmentService | null = null;
function getOntologyAlignmentService(): OntologyAlignmentService {
    if (!ontologyAlignmentService) {
        ontologyAlignmentService = new OntologyAlignmentService();
    }
    return ontologyAlignmentService;
}

// Helper function to check ontology alignment feature flag
function checkOntologyAlignmentEnabled(): boolean {
    try {
        const featureFlagsService = getFeatureFlagsService();
        return featureFlagsService.isEnabled(KGFeatureFlag.KG_ONTOLOGY_ALIGNMENT_ENABLED, false);
    } catch (_error) {
        return false;
    }
}

// POST /api/knowledge-graph/ontology/align
// Align entities with IMBOR and EuroVoc ontologies
router.post('/ontology/align', async (req, res) => {
    try {
        if (!checkOntologyAlignmentEnabled()) {
            return res.status(503).json({
                error: 'Ontology alignment feature is disabled',
                message: 'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint',
            });
        }

        const { entityIds } = req.body;

        if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
            return res.status(400).json({
                error: 'Invalid entityIds parameter',
                message: 'entityIds array is required and must not be empty',
            });
        }

        const kgService = getKGService();
        await kgService.initialize();

        // Fetch entities from knowledge graph
        const entities: BaseEntity[] = [];
        for (const entityId of entityIds) {
            const entity = await kgService.getNode(entityId);
            if (entity) {
                entities.push(entity);
            }
        }

        if (entities.length === 0) {
            return res.status(404).json({
                error: 'No entities found',
                message: 'None of the provided entity IDs were found in the knowledge graph',
            });
        }

        // Align entities
        const alignmentService = getOntologyAlignmentService();
        if (!alignmentService.isEnabled()) {
            return res.status(503).json({
                error: 'Ontology alignment feature is disabled',
                message: 'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint',
            });
        }

        const result = await alignmentService.alignEntities(entities);

        res.json({
            success: true,
            ...result,
        });
    } catch (error) {
        logger.error({ error }, 'Error aligning entities with ontologies');
        res.status(500).json({
            error: 'Failed to align entities',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /api/knowledge-graph/ontology/align-entity/:id
// Align a single entity with ontologies
router.post('/ontology/align-entity/:id', async (req, res) => {
    try {
        if (!checkOntologyAlignmentEnabled()) {
            return res.status(503).json({
                error: 'Ontology alignment feature is disabled',
                message: 'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint',
            });
        }

        const { id } = req.params;

        const kgService = getKGService();
        await kgService.initialize();

        const entity = await kgService.getNode(id);
        if (!entity) {
            return res.status(404).json({
                error: 'Entity not found',
                entityId: id,
            });
        }

        const alignmentService = getOntologyAlignmentService();
        const alignment = await alignmentService.alignEntity(entity);

        res.json({
            success: true,
            alignment,
        });
    } catch (error) {
        logger.error({ error }, 'Error aligning entity with ontologies');
        res.status(500).json({
            error: 'Failed to align entity',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/ontology/query
// Query entities by ontology term
router.get('/ontology/query', async (req, res) => {
    try {
        if (!checkOntologyAlignmentEnabled()) {
            return res.status(503).json({
                error: 'Ontology alignment feature is disabled',
                message: 'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint',
            });
        }

        const { term, ontology } = req.query;

        if (!term || typeof term !== 'string') {
            return res.status(400).json({
                error: 'Invalid term parameter',
                message: 'term parameter is required and must be a string',
            });
        }

        const ontologyType = (ontology as 'imbor' | 'eurovoc' | 'both') || 'both';
        if (!['imbor', 'eurovoc', 'both'].includes(ontologyType)) {
            return res.status(400).json({
                error: 'Invalid ontology parameter',
                message: 'ontology must be one of: imbor, eurovoc, both',
            });
        }

        // For now, we need alignments to query. In a full implementation,
        // alignments would be stored in the database.
        // This endpoint would typically query stored alignments.
        res.json({
            success: true,
            message: 'Query functionality requires stored alignments. Use POST /ontology/align first.',
            term,
            ontology: ontologyType,
        });
    } catch (error) {
        logger.error({ error }, 'Error querying entities by ontology term');
        res.status(500).json({
            error: 'Failed to query entities',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /api/knowledge-graph/ontology/report
// Generate alignment report
router.post('/ontology/report', async (req, res) => {
    try {
        if (!checkOntologyAlignmentEnabled()) {
            return res.status(503).json({
                error: 'Ontology alignment feature is disabled',
                message: 'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint',
            });
        }

        const { entityIds } = req.body;

        if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
            return res.status(400).json({
                error: 'Invalid entityIds parameter',
                message: 'entityIds array is required and must not be empty',
            });
        }

        const kgService = getKGService();
        await kgService.initialize();

        // Fetch entities
        const entities: BaseEntity[] = [];
        for (const entityId of entityIds) {
            const entity = await kgService.getNode(entityId);
            if (entity) {
                entities.push(entity);
            }
        }

        if (entities.length === 0) {
            return res.status(404).json({
                error: 'No entities found',
            });
        }

        // Align and generate report
        const alignmentService = getOntologyAlignmentService();
        if (!alignmentService.isEnabled()) {
            return res.status(503).json({
                error: 'Ontology alignment feature is disabled',
                message: 'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint',
            });
        }

        const report = await alignmentService.generateAlignmentReport(entities);

        res.json({
            success: true,
            ...report,
        });
    } catch (error) {
        logger.error({ error }, 'Error generating alignment report');
        res.status(500).json({
            error: 'Failed to generate alignment report',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /api/knowledge-graph/ontology/validate
// Validate entity alignment
router.post('/ontology/validate', async (req, res) => {
    try {
        if (!checkOntologyAlignmentEnabled()) {
            return res.status(503).json({
                error: 'Ontology alignment feature is disabled',
                message: 'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint',
            });
        }

        const { entityId } = req.body;

        if (!entityId || typeof entityId !== 'string') {
            return res.status(400).json({
                error: 'Invalid entityId parameter',
                message: 'entityId is required and must be a string',
            });
        }

        const kgService = getKGService();
        await kgService.initialize();

        const entity = await kgService.getNode(entityId);
        if (!entity) {
            return res.status(404).json({
                error: 'Entity not found',
                entityId,
            });
        }

        const alignmentService = getOntologyAlignmentService();
        if (!alignmentService.isEnabled()) {
            return res.status(503).json({
                error: 'Ontology alignment feature is disabled',
                message: 'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint',
            });
        }

        const alignment = await alignmentService.alignEntity(entity);

        res.json({
            success: true,
            entityId,
            alignment,
            needsReview: alignment.needsManualReview,
            confidence: alignment.overallConfidence,
        });
    } catch (error) {
        logger.error({ error }, 'Error validating alignment');
        res.status(500).json({
            error: 'Failed to validate alignment',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /api/knowledge-graph/ontology/align
// Align entities with IMBOR and EuroVoc ontologies
router.post('/ontology/align', async (req, res) => {
    try {
        const { entityIds, includeIMBOR, includeEuroVoc, minConfidence } = req.body;

        if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'entityIds must be a non-empty array',
            });
        }

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        const alignmentService = getOntologyAlignmentService();

        // Get entities from knowledge graph
        const entities = [];
        for (const entityId of entityIds) {
            const entity = await kgService.getNode(entityId);
            if (entity) {
                entities.push(entity);
            }
        }

        if (entities.length === 0) {
            return res.status(404).json({
                error: 'Entities not found',
                message: 'No entities found for the provided IDs',
            });
        }

        const result = await alignmentService.alignEntities(entities, {
            includeIMBOR: includeIMBOR !== false,
            includeEuroVoc: includeEuroVoc !== false,
            minConfidence: minConfidence || 0.6,
            validateAlignments: true,
        });

        res.json({
            success: true,
            ...result,
        });
    } catch (error) {
        logger.error({ error }, 'Error aligning entities with ontologies');
        res.status(500).json({
            error: 'Failed to align entities with ontologies',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/ontology/entity/:id
// Get ontology alignments for a specific entity
router.get('/ontology/entity/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        const alignmentService = getOntologyAlignmentService();

        const entity = await kgService.getNode(id);
        if (!entity) {
            return res.status(404).json({
                error: 'Entity not found',
                message: `Entity with ID ${id} not found`,
            });
        }

        const alignment = await alignmentService.getEntityAlignments(id, entity);

        if (!alignment) {
            return res.status(400).json({
                error: 'Ontology alignment not enabled',
                message: 'Set KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to enable alignment',
            });
        }

        res.json({
            success: true,
            alignment,
        });
    } catch (error) {
        logger.error({ error }, 'Error getting entity ontology alignments');
        res.status(500).json({
            error: 'Failed to get entity ontology alignments',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /api/knowledge-graph/ontology/query
// Query entities by ontology term (IMBOR or EuroVoc)
router.post('/ontology/query', async (req, res) => {
    try {
        const { term, ontology, entityType } = req.body;

        if (!term || !ontology) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'term and ontology are required',
            });
        }

        if (ontology !== 'IMBOR' && ontology !== 'EuroVoc') {
            return res.status(400).json({
                error: 'Invalid ontology',
                message: 'ontology must be either "IMBOR" or "EuroVoc"',
            });
        }

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        const alignmentService = getOntologyAlignmentService();

        // Get entities (optionally filtered by type)
        let entities;
        if (entityType) {
            entities = await kgService.getNodesByType(entityType);
        } else {
            entities = await kgService.getAllNodes();
        }

        const matchingEntities = await alignmentService.queryByOntologyTerm(term, ontology, entities);

        res.json({
            success: true,
            term,
            ontology,
            entityType: entityType || 'all',
            matchingEntities: matchingEntities.map(e => ({
                id: e.id,
                name: e.name,
                type: e.type,
            })),
            count: matchingEntities.length,
        });
    } catch (error) {
        logger.error({ error }, 'Error querying entities by ontology term');
        res.status(500).json({
            error: 'Failed to query entities by ontology term',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/ontology/report
// Generate alignment report for all entities or entities of a specific type
router.get('/ontology/report', async (req, res) => {
    try {
        const { entityType } = req.query;

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        const alignmentService = getOntologyAlignmentService();

        // Get entities (optionally filtered by type)
        let entities;
        if (entityType) {
            entities = await kgService.getNodesByType(entityType as EntityType);
        } else {
            entities = await kgService.getAllNodes();
        }

        const report = await alignmentService.generateAlignmentReport(entities);

        res.json({
            success: true,
            entityType: entityType || 'all',
            ...report,
        });
    } catch (error) {
        logger.error({ error }, 'Error generating ontology alignment report');
        res.status(500).json({
            error: 'Failed to generate ontology alignment report',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/ontology/review
// Get entities needing manual review
router.get('/ontology/review', async (req, res) => {
    try {
        const { entityType } = req.query;

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        const alignmentService = getOntologyAlignmentService();

        // Get entities (optionally filtered by type)
        let entities;
        if (entityType) {
            entities = await kgService.getNodesByType(entityType as EntityType);
        } else {
            entities = await kgService.getAllNodes();
        }

        const entitiesNeedingReview = await alignmentService.getEntitiesNeedingReview(entities);

        res.json({
            success: true,
            entityType: entityType || 'all',
            entitiesNeedingReview,
            count: entitiesNeedingReview.length,
        });
    } catch (error) {
        logger.error({ error }, 'Error getting entities needing review');
        res.status(500).json({
            error: 'Failed to get entities needing review',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// ============================================================================
// Cypher Query Endpoints
// ============================================================================

// POST /api/knowledge-graph/cypher/validate
// Validate a Cypher query for safety and correctness
router.post('/cypher/validate', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({
                error: 'Cypher query validation is not available for GraphDB backend',
                message: 'Cypher queries are only supported for Neo4j backend',
            });
        }

        const { query, allowWriteOperations } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                error: 'Invalid query parameter',
                message: 'query is required and must be a string',
            });
        }

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        const validation = kgService.validateCypherQuery(query, allowWriteOperations === true);

        res.json({
            success: true,
            ...validation,
        });
    } catch (error) {
        logger.error({ error }, 'Error validating Cypher query');
        res.status(500).json({
            error: 'Failed to validate Cypher query',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /api/knowledge-graph/cypher/execute
// Execute a Cypher query against the knowledge graph
router.post('/cypher/execute', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({
                error: 'Cypher query execution is not available for GraphDB backend',
                message: 'Cypher queries are only supported for Neo4j backend',
            });
        }

        const { query, parameters, limit, timeout, allowWriteOperations } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                error: 'Invalid query parameter',
                message: 'query is required and must be a string',
            });
        }

        // Validate limit
        if (limit !== undefined && (typeof limit !== 'number' || limit < 1 || limit > 10000)) {
            return res.status(400).json({
                error: 'Invalid limit parameter',
                message: 'limit must be a number between 1 and 10000',
            });
        }

        // Validate timeout
        if (timeout !== undefined && (typeof timeout !== 'number' || timeout < 1000 || timeout > 300000)) {
            return res.status(400).json({
                error: 'Invalid timeout parameter',
                message: 'timeout must be a number between 1000 and 300000 milliseconds',
            });
        }

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        // Add allowWriteOperations to parameters if provided
        const queryOptions: CypherQueryOptions = {
            parameters: parameters || {},
            limit,
            timeout,
        };

        if (allowWriteOperations === true) {
            queryOptions.parameters = {
                ...queryOptions.parameters,
                allowWriteOperations: true,
            };
        }

        const result = await kgService.executeCypherQuery(query, queryOptions);

        res.json({
            success: true,
            ...result,
        });
    } catch (error) {
        logger.error({ error }, 'Error executing Cypher query');
        res.status(500).json({
            error: 'Failed to execute Cypher query',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// ============================================================================
// Inference Endpoints
// ============================================================================

// Helper function to check inference feature flag
function checkInferenceEnabled(): boolean {
    try {
        const featureFlagsService = getFeatureFlagsService();
        return featureFlagsService.isEnabled(KGFeatureFlag.KG_REASONING_ENABLED, false);
    } catch (_error) {
        return false;
    }
}

// POST /api/knowledge-graph/inference/run
// Run inference rules on the knowledge graph
router.post('/inference/run', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({
                error: 'Inference is not available for GraphDB backend',
                message: 'Inference is only supported for Neo4j backend',
            });
        }

        if (!checkInferenceEnabled()) {
            return res.status(503).json({
                error: 'Inference feature is disabled',
                message: 'Enable KG_REASONING_ENABLED feature flag to use this endpoint',
            });
        }

        const { ruleTypes, maxDepth, minConfidence, storeResults, entityIds } = req.body;

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        const options: InferenceOptions = {};
        if (ruleTypes !== undefined) {
            if (!Array.isArray(ruleTypes)) {
                return res.status(400).json({
                    error: 'Invalid ruleTypes parameter',
                    message: 'ruleTypes must be an array of: transitive, type-based, temporal, hierarchical, or all',
                });
            }
            const validTypes: InferenceRuleType[] = ['transitive', 'type-based', 'temporal', 'hierarchical', 'all'];
            const invalidTypes = ruleTypes.filter((t: string) => !validTypes.includes(t as InferenceRuleType));
            if (invalidTypes.length > 0) {
                return res.status(400).json({
                    error: 'Invalid rule types',
                    message: `Invalid rule types: ${invalidTypes.join(', ')}. Valid types are: ${validTypes.join(', ')}`,
                });
            }
            options.ruleTypes = ruleTypes as InferenceRuleType[];
        }

        if (maxDepth !== undefined) {
            if (typeof maxDepth !== 'number' || maxDepth < 1 || maxDepth > 10) {
                return res.status(400).json({
                    error: 'Invalid maxDepth parameter',
                    message: 'maxDepth must be a number between 1 and 10',
                });
            }
            options.maxDepth = maxDepth;
        }

        if (minConfidence !== undefined) {
            if (typeof minConfidence !== 'number' || minConfidence < 0 || minConfidence > 1) {
                return res.status(400).json({
                    error: 'Invalid minConfidence parameter',
                    message: 'minConfidence must be a number between 0 and 1',
                });
            }
            options.minConfidence = minConfidence;
        }

        if (storeResults !== undefined) {
            if (typeof storeResults !== 'boolean') {
                return res.status(400).json({
                    error: 'Invalid storeResults parameter',
                    message: 'storeResults must be a boolean',
                });
            }
            options.storeResults = storeResults;
        }

        if (entityIds !== undefined) {
            if (!Array.isArray(entityIds) || entityIds.length === 0) {
                return res.status(400).json({
                    error: 'Invalid entityIds parameter',
                    message: 'entityIds must be a non-empty array of entity IDs',
                });
            }
            options.entityIds = entityIds;
        }

        const result = await kgService.runInference(options);

        res.json({
            success: true,
            ...result,
            summary: {
                relationshipsInferred: result.relationshipsInferred,
                propertiesInferred: result.propertiesInferred,
                executionTime: `${result.executionTime}ms`,
                averageConfidence: result.relationships.length > 0
                    ? result.relationships.reduce((sum: number, r: { inference: { confidence: number } }) => sum + r.inference.confidence, 0) / result.relationships.length
                    : 0,
            },
        });
    } catch (error) {
        logger.error({ error }, 'Error running inference');
        res.status(500).json({
            error: 'Failed to run inference',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/knowledge-graph/entity/:id/inference
// Query an entity including inferred relationships
router.get('/entity/:id/inference', async (req, res) => {
    try {
        if (isGraphDB()) {
            return res.status(400).json({
                error: 'Inference is not available for GraphDB backend',
                message: 'Inference is only supported for Neo4j backend',
            });
        }

        if (!checkInferenceEnabled()) {
            return res.status(503).json({
                error: 'Inference feature is disabled',
                message: 'Enable KG_REASONING_ENABLED feature flag to use this endpoint',
            });
        }

        const { id } = req.params;
        const { includeInferred } = req.query;

        const kgService = getKGService() as Neo4jKnowledgeGraphService;
        await kgService.initialize();

        // Check if entity exists
        const entity = await kgService.getNode(id);
        if (!entity) {
            return res.status(404).json({
                error: 'Entity not found',
                entityId: id,
            });
        }

        const shouldIncludeInferred = includeInferred !== 'false'; // Default to true

        const result = await kgService.queryEntityWithInference(id, shouldIncludeInferred);

        // Separate explicit and inferred relationships for clarity
        const explicitRelationships = result.relationships.filter((r: { inferred: boolean }) => !r.inferred);
        const inferredRelationships = result.relationships.filter((r: { inferred: boolean }) => r.inferred);

        res.json({
            success: true,
            entity: {
                id: result.entity.id,
                type: result.entity.type,
                name: result.entity.name,
                description: result.entity.description,
                uri: result.entity.uri,
            },
            relationships: {
                total: result.relationships.length,
                explicit: explicitRelationships.length,
                inferred: inferredRelationships.length,
                all: result.relationships.map((r: { target: BaseEntity; type: RelationType; inferred: boolean; confidence?: number }) => ({
                    target: {
                        id: r.target.id,
                        type: r.target.type,
                        name: r.target.name,
                    },
                    type: r.type,
                    inferred: r.inferred,
                    confidence: r.confidence ?? undefined,
                })),
            },
            metadata: {
                entityId: id,
                includeInferred: shouldIncludeInferred,
            },
        });
    } catch (error) {
        logger.error({ error }, 'Error querying entity with inference');
        res.status(500).json({
            error: 'Failed to query entity with inference',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/knowledge-graph/discover-relationships
 * Discover relationships between entities in the knowledge graph
 */
router.post('/discover-relationships', async (req, res) => {
    try {
        const kgService = getKGService();
        await kgService.initialize();

        const {
            entityTypeFilter,
            relationshipTypeFilter,
            jurisdictionFilter,
            minConfidence = 0.6,
            maxRelationships = 1000,
            batchSize = 50,
            enableParallelProcessing = true,
            enableRuleBased = true,
            enableWebSearch = false,
            enableCoOccurrence = true,
            enableCitation = false,
            enableGraphPattern = true,
        } = req.body;

        // Get all entities or filter by type
        const entities: BaseEntity[] = [];
        if (entityTypeFilter && Array.isArray(entityTypeFilter) && entityTypeFilter.length > 0) {
            // Get entities by type
            for (const type of entityTypeFilter) {
                const nodes = await kgService.getNodesByType(type as EntityType);
                entities.push(...nodes);
            }
        } else {
            // Get all entities (this might be expensive, so we limit)
            // For now, we'll require entityTypeFilter to be specified
            return res.status(400).json({
                error: 'entityTypeFilter is required',
                message: 'Please specify entityTypeFilter to limit the scope of discovery',
            });
        }

        if (entities.length === 0) {
            return res.status(404).json({
                error: 'No entities found',
                message: 'No entities matching the specified filters were found',
            });
        }

        if (entities.length > 1000) {
            return res.status(400).json({
                error: 'Too many entities',
                message: `Discovery is limited to 1000 entities, but ${entities.length} were found. Please use entityTypeFilter to narrow the scope.`,
            });
        }

        logger.info({
            entityCount: entities.length,
            filters: {
                entityTypeFilter,
                relationshipTypeFilter,
                jurisdictionFilter,
            },
        }, 'Starting batch relationship discovery via API');

        const batchDiscovery = new BatchRelationshipDiscovery(kgService);
        const result = await batchDiscovery.discoverRelationships(entities, {
            minConfidence,
            maxRelationships,
            batchSize,
            enableParallelProcessing,
            enableRuleBased,
            enableWebSearch,
            enableCoOccurrence,
            enableCitation,
            enableGraphPattern,
            entityTypeFilter: entityTypeFilter as EntityType[],
            relationshipTypeFilter: relationshipTypeFilter as RelationType[],
            jurisdictionFilter: jurisdictionFilter as string[],
        });

        // Optionally add discovered relationships to graph
        const { addToGraph } = req.body;
        if (addToGraph === true) {
            logger.info({
                validCount: result.valid.length,
            }, 'Adding discovered relationships to knowledge graph');

            for (const rel of result.valid) {
                try {
                    await (kgService as any).addEdge(
                        rel.sourceId,
                        rel.targetId,
                        rel.type,
                        {
                            ...rel.metadata,
                            discoveredAt: new Date().toISOString(),
                            discoveryMethod: 'api_batch_discovery',
                        }
                    );
                } catch (error) {
                    logger.warn({
                        error: error instanceof Error ? error.message : String(error),
                        relationshipId: `${rel.sourceId}-${rel.targetId}-${rel.type}`,
                    }, 'Failed to add discovered relationship to graph');
                }
            }
        }

        res.json({
            success: true,
            discovered: result.discovered.map(rel => ({
                relationship: {
                    sourceId: rel.relationship.sourceId,
                    targetId: rel.relationship.targetId,
                    type: rel.relationship.type,
                    metadata: rel.relationship.metadata,
                },
                confidence: rel.confidence,
                discoveryMethod: rel.discoveryMethod,
                evidence: rel.evidence,
            })),
            valid: result.valid.map(rel => ({
                sourceId: rel.sourceId,
                targetId: rel.targetId,
                type: rel.type,
                metadata: rel.metadata,
            })),
            invalid: result.invalid.map(rel => ({
                relationship: {
                    sourceId: rel.relationship.sourceId,
                    targetId: rel.relationship.targetId,
                    type: rel.relationship.type,
                },
                confidence: rel.confidence,
                discoveryMethod: rel.discoveryMethod,
            })),
            statistics: result.statistics,
            addedToGraph: addToGraph === true,
        });
    } catch (error) {
        logger.error({ error }, 'Error in batch relationship discovery');
        res.status(500).json({
            error: 'Failed to discover relationships',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
