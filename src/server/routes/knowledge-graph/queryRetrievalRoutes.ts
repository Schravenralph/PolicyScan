/**
 * Query and Retrieval Routes for Knowledge Graph
 * 
 * Handles:
 * - Fact-first queries
 * - GraphRAG queries
 * - Answer generation
 * - Graph traversal
 * - Path finding
 * - Subgraph extraction
 * - Steiner tree computation
 * - Traversal statistics
 */

import express, { Router } from 'express';
import { asyncHandler } from '../../utils/errorHandling.js';
import { BadRequestError, NotFoundError, ServiceUnavailableError, ExternalServiceError } from '../../types/errors.js';
import { RelationType } from '../../domain/ontology.js';
import { TraversalOptions, TraversalResult } from '../../services/graphrag/GraphTraversalService.js';
import { TraversalNode } from '../../services/graphrag/traversal/BFSTraversal.js';
import { mapEdgesToKGEdgeDto } from '../../utils/mappers.js';
import { BaseEntity, Relation } from '../../domain/ontology.js';
import { logger } from '../../utils/logger.js';
import type { KnowledgeGraphServiceType } from './shared/types.js';
import {
    getFactFirstRetrievalService,
    getGraphRAGRetrievalService,
    getLLMAnswerGenerator,
    getTraversalService,
    getSteinerTreeService,
} from './shared/services.js';

/**
 * Create query and retrieval router
 * 
 * @param getKGService - Function to get knowledge graph service instance
 * @param isGraphDB - Function to check if GraphDB backend is active
 * @returns Express router with query/retrieval routes
 */
export function createQueryRetrievalRouter(
    getKGService: () => KnowledgeGraphServiceType,
    isGraphDB: () => boolean
): Router {
    const router = express.Router();

    // POST /fact-first-query
    // Execute a fact-first retrieval query
    router.post('/fact-first-query', asyncHandler(async (req, res) => {
        const knowledgeGraphService = getKGService();
        await knowledgeGraphService.initialize();

        const { query, maxResults, maxHops, relationType } = req.body;

        if (!query || typeof query !== 'string') {
            throw new BadRequestError('Query parameter is required and must be a string');
        }

        const factFirstService = getFactFirstRetrievalService(getKGService);
        const result = await factFirstService.query(query, {
            maxResults: maxResults || 50,
            maxHops: maxHops || 2,
            relationType: relationType as RelationType | undefined
        });

        res.json({
            success: true,
            ...result
        });
    }));

    // POST /graphrag-query
    // Execute a GraphRAG query that orchestrates fact-first retrieval, contextual enrichment, and hybrid scoring
    router.post('/graphrag-query', asyncHandler(async (req, res) => {
        const { query, strategy, maxResults, maxHops, kgWeight, vectorWeight, enableExplainability } = req.body;

        if (!query || typeof query !== 'string') {
            throw new BadRequestError('Query parameter is required and must be a string');
        }

        const shouldEnableExplainability = enableExplainability !== false;

        const graphRAGService = await getGraphRAGRetrievalService(getKGService, isGraphDB);
        const result = await graphRAGService.query(query, {
            strategy,
            maxResults: maxResults || 50,
            maxHops: maxHops || 2,
            kgWeight,
            vectorWeight,
            enableExplainability: shouldEnableExplainability,
        });

        // Transform results to frontend format
        const facts = result.results.map((enriched) => ({
            entity: {
                id: enriched.fact.entity.id,
                name: enriched.fact.entity.name,
                type: enriched.fact.entity.type,
                properties: enriched.fact.entity.metadata || {},
            },
            score: enriched.hybridScore.finalScore,
            path: enriched.fact.relationships?.map((rel) => rel.targetId) || [],
        }));

        // Extract unique chunks from vector results
        const chunkMap = new Map<string, { text: string; score: number; source: string }>();
        for (const enriched of result.results) {
            if (enriched.vectorChunks) {
                for (const chunk of enriched.vectorChunks) {
                    const source = (chunk.metadata?.source as string) || (chunk.metadata?.url as string) || 'Unknown';
                    const existing = chunkMap.get(chunk.id);
                    if (!existing || chunk.similarity > existing.score) {
                        chunkMap.set(chunk.id, {
                            text: chunk.content,
                            score: chunk.similarity,
                            source,
                        });
                    }
                }
            }
        }
        const chunks = Array.from(chunkMap.values()).sort((a, b) => b.score - a.score);

        // Generate explanation if enabled
        let explanation: string | undefined;
        if (shouldEnableExplainability && facts.length > 0) {
            try {
                const answerGenerator = getLLMAnswerGenerator();
                const answerResult = await answerGenerator.generateAnswer({
                    query,
                    facts: result.results.map((r) => r.fact),
                    vectorChunks: chunks.map((c) => ({
                        id: '',
                        content: c.text,
                        similarity: c.score,
                        metadata: { source: c.source },
                    })),
                    hybridScores: result.results.map((r) => r.hybridScore),
                    options: {
                        answerType: 'explanatory',
                    },
                });
                explanation = answerResult.answer;
            } catch (error) {
                // Log error but don't fail the request
                logger.warn({ error }, '[GraphRAG] Failed to generate explanation');
                // explanation remains undefined
            }
        }

        res.json({
            success: true,
            facts,
            chunks,
            explanation,
            metrics: {
                retrievalTime: result.metrics.kgRetrievalTime + result.metrics.vectorRetrievalTime,
                rankingTime: result.metrics.scoringTime,
                totalTime: result.metrics.queryTime,
            },
        });
    }));

    // POST /generate-answer
    // Generate natural language answer from KG facts and vector context
    router.post('/generate-answer', asyncHandler(async (req, res) => {
        const { query, facts, vectorChunks, hybridScores, options } = req.body;

        if (!query || typeof query !== 'string') {
            throw new BadRequestError('Query parameter is required and must be a string');
        }

        if (!facts || !Array.isArray(facts)) {
            throw new BadRequestError('Facts parameter is required and must be an array');
        }

        const answerGenerator = getLLMAnswerGenerator();
        let result;
        try {
            result = await answerGenerator.generateAnswer({
                query,
                facts,
                vectorChunks,
                hybridScores,
                options,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new ExternalServiceError('LLM Answer Generator', `Failed to generate answer: ${errorMessage}`, {
                reason: 'answer_generation_failed',
                operation: 'generateAnswer',
                originalError: errorMessage
            });
        }

        res.json({
            success: true,
            ...result
        });
    }));

    // POST /traverse
    // Perform graph traversal from a starting node
    router.post('/traverse', asyncHandler(async (req, res) => {
        // Check if request body exists
        if (!req.body || typeof req.body !== 'object') {
            throw new BadRequestError('Request body is required and must be a JSON object', {
                received: req.body,
                receivedType: typeof req.body,
                contentType: req.headers['content-type']
            });
        }

        const knowledgeGraphService = getKGService();
        await knowledgeGraphService.initialize();

        const { startNodeId, maxDepth, maxNodes, relationshipTypes, entityTypes, direction, strategy, format } = req.body;

        // Validate required fields
        if (startNodeId === undefined || startNodeId === null || startNodeId === '') {
            throw new BadRequestError('startNodeId is required and must be a non-empty string', {
                provided: startNodeId,
                providedType: typeof startNodeId,
                parameter: 'startNodeId',
                help: 'Provide a valid entity ID from the knowledge graph. Use GET /api/knowledge-graph/entities to find available entities.'
            });
        }

        if (typeof startNodeId !== 'string') {
            throw new BadRequestError('startNodeId must be a string', {
                provided: startNodeId,
                providedType: typeof startNodeId,
                parameter: 'startNodeId',
                help: 'startNodeId must be a string value, not a number or object'
            });
        }

        const trimmedStartNodeId = startNodeId.trim();
        if (trimmedStartNodeId === '') {
            throw new BadRequestError('startNodeId cannot be empty', {
                provided: startNodeId,
                providedType: typeof startNodeId,
                parameter: 'startNodeId',
                help: 'startNodeId must contain a non-empty string value'
            });
        }

        // Validate optional fields
        if (maxDepth !== undefined && (typeof maxDepth !== 'number' || maxDepth < 1 || maxDepth > 10)) {
            throw new BadRequestError('maxDepth must be a number between 1 and 10');
        }

        if (maxNodes !== undefined && (typeof maxNodes !== 'number' || maxNodes < 1 || maxNodes > 10000)) {
            throw new BadRequestError('maxNodes must be a number between 1 and 10000');
        }

        // Normalize and validate strategy
        let normalizedStrategy: 'bfs' | 'dfs' | 'hybrid' | undefined;
        if (strategy !== undefined && strategy !== null && strategy !== '') {
            if (typeof strategy !== 'string') {
                throw new BadRequestError('strategy must be a string', {
                    provided: strategy,
                    providedType: typeof strategy,
                    parameter: 'strategy'
                });
            }
            const strategyLower = strategy.toLowerCase().trim();
            if (!['bfs', 'dfs', 'hybrid'].includes(strategyLower)) {
                throw new BadRequestError('strategy must be one of: bfs, dfs, hybrid', {
                    provided: strategy,
                    providedType: typeof strategy,
                    parameter: 'strategy',
                    allowedValues: ['bfs', 'dfs', 'hybrid']
                });
            }
            normalizedStrategy = strategyLower as 'bfs' | 'dfs' | 'hybrid';
        }

        // Normalize and validate direction
        let normalizedDirection: 'outgoing' | 'incoming' | 'both' | undefined;
        if (direction !== undefined && direction !== null && direction !== '') {
            const directionLower = String(direction).toLowerCase().trim();
            if (!['outgoing', 'incoming', 'both'].includes(directionLower)) {
                throw new BadRequestError('direction must be one of: outgoing, incoming, both');
            }
            normalizedDirection = directionLower as 'outgoing' | 'incoming' | 'both';
        }

        // Build traversal options
        const options: Partial<TraversalOptions> = {};
        if (maxDepth !== undefined) options.maxDepth = maxDepth;
        if (maxNodes !== undefined) options.maxNodes = maxNodes;
        if (relationshipTypes) options.relationshipTypes = Array.isArray(relationshipTypes) ? relationshipTypes : [relationshipTypes] as RelationType[];
        if (entityTypes) options.entityTypes = Array.isArray(entityTypes) ? entityTypes : [entityTypes] as string[];
        if (normalizedDirection) options.direction = normalizedDirection;
        if (normalizedStrategy) options.strategy = normalizedStrategy;

        const startTime = Date.now();
        const kgService = knowledgeGraphService as import('../../services/knowledge-graph/core/KnowledgeGraph.js').KnowledgeGraphService;
        // Debug: Log in test environment to verify service and method
        if (process.env.NODE_ENV === 'test') {
            const serviceWithTraverse = kgService as KnowledgeGraphServiceType & { traverseGraph?: unknown };
            console.error('[POST /traverse] About to call traverseGraph');
            console.error('[POST /traverse] kgService.traverseGraph type:', typeof serviceWithTraverse.traverseGraph);
            console.error('[POST /traverse] kgService.traverseGraph === mockTraverseGraph:', serviceWithTraverse.traverseGraph === (global as any).mockTraverseGraph);
        }
        let result: TraversalResult;
        try {
            if (process.env.NODE_ENV === 'test') {
                console.error('[POST /traverse] Calling traverseGraph with:', trimmedStartNodeId, options);
            }
            // Type assertion: both KnowledgeGraphService and GraphDBKnowledgeGraphService have traverseGraph
            const serviceWithTraverse = kgService as { traverseGraph: (startNodeId: string, options?: Partial<TraversalOptions>) => Promise<TraversalResult> };
            result = await serviceWithTraverse.traverseGraph(trimmedStartNodeId, options);
            if (process.env.NODE_ENV === 'test') {
                console.error('[POST /traverse] traverseGraph returned:', JSON.stringify(result, null, 2));
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new ServiceUnavailableError(`Failed to perform graph traversal: ${errorMessage}`, {
                reason: 'graph_traversal_failed',
                operation: 'traverseGraph',
                originalError: errorMessage
            });
        }
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
                    startNodeId: trimmedStartNodeId,
                    duration: `${duration}ms`,
                    options
                }
            });
        }
    }));

    // POST /path
    // Find a path between two nodes
    router.post('/path', asyncHandler(async (req, res) => {
        // Check if request body exists
        if (!req.body || typeof req.body !== 'object') {
            throw new BadRequestError('Request body is required and must be a JSON object', {
                received: req.body,
                receivedType: typeof req.body,
                contentType: req.headers['content-type']
            });
        }

        const knowledgeGraphService = getKGService();
        await knowledgeGraphService.initialize();

        const { startNodeId, endNodeId, maxDepth, maxNodes, relationshipTypes, entityTypes, direction, strategy } = req.body;

        // Validate required fields
        if (startNodeId === undefined || startNodeId === null) {
            throw new BadRequestError('startNodeId is required', {
                provided: startNodeId,
                providedType: typeof startNodeId,
                parameter: 'startNodeId'
            });
        }

        if (typeof startNodeId !== 'string') {
            throw new BadRequestError('startNodeId must be a string', {
                provided: startNodeId,
                providedType: typeof startNodeId,
                parameter: 'startNodeId'
            });
        }

        const trimmedStartNodeId = startNodeId.trim();
        if (trimmedStartNodeId === '') {
            throw new BadRequestError('startNodeId cannot be empty', {
                provided: startNodeId,
                providedType: typeof startNodeId,
                parameter: 'startNodeId'
            });
        }

        if (endNodeId === undefined || endNodeId === null || endNodeId === '') {
            throw new BadRequestError('endNodeId is required and must be a non-empty string', {
                provided: endNodeId,
                providedType: typeof endNodeId,
                parameter: 'endNodeId',
                help: 'Provide a valid entity ID from the knowledge graph. Use GET /api/knowledge-graph/entities to find available entities.'
            });
        }

        if (typeof endNodeId !== 'string') {
            throw new BadRequestError('endNodeId must be a string', {
                provided: endNodeId,
                providedType: typeof endNodeId,
                parameter: 'endNodeId',
                help: 'endNodeId must be a string value, not a number or object'
            });
        }

        const trimmedEndNodeId = endNodeId.trim();
        if (trimmedEndNodeId === '') {
            throw new BadRequestError('endNodeId cannot be empty', {
                provided: endNodeId,
                providedType: typeof endNodeId,
                parameter: 'endNodeId',
                help: 'endNodeId must contain a non-empty string value'
            });
        }

        // Validate optional fields
        if (maxDepth !== undefined && (typeof maxDepth !== 'number' || maxDepth < 1 || maxDepth > 10)) {
            throw new BadRequestError('maxDepth must be a number between 1 and 10');
        }

        if (maxNodes !== undefined && (typeof maxNodes !== 'number' || maxNodes < 1 || maxNodes > 10000)) {
            throw new BadRequestError('maxNodes must be a number between 1 and 10000');
        }

        // Normalize and validate strategy
        let normalizedStrategy: 'bfs' | 'dfs' | 'hybrid' | undefined;
        if (strategy !== undefined && strategy !== null && strategy !== '') {
            if (typeof strategy !== 'string') {
                throw new BadRequestError('strategy must be a string', {
                    provided: strategy,
                    providedType: typeof strategy,
                    parameter: 'strategy'
                });
            }
            const strategyLower = strategy.toLowerCase().trim();
            if (!['bfs', 'dfs', 'hybrid'].includes(strategyLower)) {
                throw new BadRequestError('strategy must be one of: bfs, dfs, hybrid', {
                    provided: strategy,
                    providedType: typeof strategy,
                    parameter: 'strategy',
                    allowedValues: ['bfs', 'dfs', 'hybrid']
                });
            }
            normalizedStrategy = strategyLower as 'bfs' | 'dfs' | 'hybrid';
        }

        // Normalize and validate direction
        let normalizedDirection: 'outgoing' | 'incoming' | 'both' | undefined;
        if (direction !== undefined && direction !== null && direction !== '') {
            if (typeof direction !== 'string') {
                throw new BadRequestError('direction must be a string', {
                    provided: direction,
                    providedType: typeof direction,
                    parameter: 'direction'
                });
            }
            const directionLower = direction.toLowerCase().trim();
            if (!['outgoing', 'incoming', 'both'].includes(directionLower)) {
                throw new BadRequestError('direction must be one of: outgoing, incoming, both', {
                    provided: direction,
                    providedType: typeof direction,
                    parameter: 'direction',
                    allowedValues: ['outgoing', 'incoming', 'both']
                });
            }
            normalizedDirection = directionLower as 'outgoing' | 'incoming' | 'both';
        }

        // Build traversal options
        const options: Partial<TraversalOptions> = {};
        if (maxDepth !== undefined) options.maxDepth = maxDepth;
        if (maxNodes !== undefined) options.maxNodes = maxNodes;
        if (relationshipTypes) options.relationshipTypes = Array.isArray(relationshipTypes) ? relationshipTypes : [relationshipTypes] as RelationType[];
        if (entityTypes) options.entityTypes = Array.isArray(entityTypes) ? entityTypes : [entityTypes] as string[];
        if (normalizedDirection) options.direction = normalizedDirection;
        if (normalizedStrategy) options.strategy = normalizedStrategy;

        const startTime = Date.now();
        const kgService = knowledgeGraphService as import('../../services/knowledge-graph/core/KnowledgeGraph.js').KnowledgeGraphService;
        let result;
        try {
            result = await kgService.findPath(trimmedStartNodeId, trimmedEndNodeId, options);
        } catch (error) {
            // Preserve NotFoundError if it's already a NotFoundError
            if (error instanceof NotFoundError) {
                throw error;
            }
            // Preserve other AppError instances
            if (error && typeof error === 'object' && 'statusCode' in error && typeof (error as { statusCode: number }).statusCode === 'number') {
                throw error;
            }
            // For other errors, wrap with more context
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new ServiceUnavailableError(`Failed to find path: ${errorMessage}`, {
                reason: 'path_finding_failed',
                operation: 'findPath',
                originalError: errorMessage
            });
        }
        const duration = Date.now() - startTime;

        if (!result) {
            throw new NotFoundError('Path', `${trimmedStartNodeId} to ${trimmedEndNodeId}`, {
                message: `No path found between ${trimmedStartNodeId} and ${trimmedEndNodeId}`,
                suggestions: [
                    'Verify both nodes exist in the knowledge graph',
                    'Check if nodes are connected via relationships',
                    'Try increasing maxDepth if nodes are far apart',
                    'Verify the node IDs are correct',
                    'Use GET /api/knowledge-graph/entity/:id to check if nodes exist'
                ],
                help: 'Nodes may not be connected, or the path exceeds the maximum depth'
            });
        }

        return res.json({
            success: true,
            ...result,
            metadata: {
                startNodeId: trimmedStartNodeId,
                endNodeId: trimmedEndNodeId,
                duration: `${duration}ms`,
                options
            }
        });
    }));

    // POST /subgraph
    // Extract subgraph around a center node
    router.post('/subgraph', asyncHandler(async (req, res) => {
        // Check if request body exists
        if (!req.body || typeof req.body !== 'object') {
            throw new BadRequestError('Request body is required and must be a JSON object', {
                received: req.body,
                receivedType: typeof req.body,
                contentType: req.headers['content-type']
            });
        }

        const { centerNodeId, radius, maxNodes, relationshipTypes, entityTypes, direction, strategy } = req.body;

        // Validation - check centerNodeId with more specific error messages
        if (centerNodeId === undefined || centerNodeId === null || centerNodeId === '') {
            throw new BadRequestError('centerNodeId is required and must be a non-empty string', {
                provided: centerNodeId,
                providedType: typeof centerNodeId,
                parameter: 'centerNodeId',
                requestBodyKeys: Object.keys(req.body || {}),
                help: 'Provide a valid entity ID from the knowledge graph. Use GET /api/knowledge-graph/entities to find available entities.'
            });
        }

        if (typeof centerNodeId !== 'string') {
            throw new BadRequestError('centerNodeId must be a string', {
                provided: centerNodeId,
                providedType: typeof centerNodeId,
                parameter: 'centerNodeId',
                requestBodyKeys: Object.keys(req.body || {}),
                help: 'centerNodeId must be a string value, not a number or object'
            });
        }

        const trimmedCenterNodeId = centerNodeId.trim();
        if (trimmedCenterNodeId === '') {
            throw new BadRequestError('centerNodeId cannot be empty', {
                provided: centerNodeId,
                providedType: typeof centerNodeId,
                parameter: 'centerNodeId',
                requestBodyKeys: Object.keys(req.body || {}),
                help: 'centerNodeId must contain a non-empty string value'
            });
        }

        if (radius !== undefined && radius !== null) {
            if (typeof radius !== 'number' || isNaN(radius)) {
                throw new BadRequestError('radius must be a number between 1 and 5', {
                    provided: radius,
                    providedType: typeof radius,
                    help: 'radius must be a number (1-5), representing the number of hops from the center node'
                });
            }
            if (radius < 1 || radius > 5) {
                throw new BadRequestError('radius must be a number between 1 and 5', {
                    provided: radius,
                    min: 1,
                    max: 5,
                    help: 'radius determines how many relationship hops to include in the subgraph (1-5)'
                });
            }
        }

        if (maxNodes !== undefined && (typeof maxNodes !== 'number' || maxNodes < 1 || maxNodes > 10000)) {
            throw new BadRequestError('maxNodes must be a number between 1 and 10000');
        }

        const traversal = await getTraversalService(getKGService, isGraphDB);
        const startTime = Date.now();

        let result;
        try {
            result = await traversal.extractSubgraph(centerNodeId, radius || 2, {
                maxNodes: maxNodes || 1000,
                relationshipTypes: relationshipTypes || undefined,
                entityTypes: entityTypes || undefined,
                direction: direction || 'both',
                strategy: strategy || 'bfs',
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new ServiceUnavailableError(`Failed to extract subgraph: ${errorMessage}`, {
                reason: 'subgraph_extraction_failed',
                operation: 'extractSubgraph',
                originalError: errorMessage
            });
        }

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
    }));

    // GET /traversal/stats
    // Get traversal statistics
    // Note: GraphDB traversal stats are now supported
    router.get('/traversal/stats', asyncHandler(async (_req, res) => {
        const knowledgeGraphService = getKGService();
        await knowledgeGraphService.initialize();

        // Get basic graph stats
        const stats = await knowledgeGraphService.getStats();

        // Get relationship type distribution
        const snapshot = await knowledgeGraphService.getGraphSnapshot(10000, null);
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
            capabilities: {
                traversal: true, // Could check feature flag here
                strategies: ['bfs', 'dfs', 'hybrid'],
                maxDepth: 10,
                maxNodes: 10000,
                supportedDirections: ['outgoing', 'incoming', 'both']
            }
        });
    }));

    // POST /steiner-tree
    // Find Steiner tree connecting terminal nodes
    // Uses GraphDBSteinerTreeService for GraphDB backend (SPARQL), Neo4j fallback for development only
    router.post('/steiner-tree', asyncHandler(async (req, res) => {
        if (isGraphDB()) {
            throw new BadRequestError('Steiner tree search is not available for GraphDB backend', {
                message: 'Steiner tree search is not yet implemented for GraphDB'
            });
        }
        const service = await getSteinerTreeService(getKGService, isGraphDB);
        if (!service) {
            throw new BadRequestError('Steiner tree service is not available for GraphDB backend', {
                message: 'Steiner tree computation is not yet implemented for GraphDB'
            });
        }
        const { query, terminalNodeIds, maxDepth, maxNodes, relationshipTypes, minWeight } = req.body;

        if (!query && (!terminalNodeIds || terminalNodeIds.length < 2)) {
            throw new BadRequestError('Either query or at least 2 terminalNodeIds must be provided');
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
            throw new NotFoundError('Steiner tree', 'terminal nodes', {
                message: 'No Steiner tree found connecting the terminal nodes'
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
    }));

    return router;
}

