/**
 * Shared service initialization helpers for Knowledge Graph routes
 */

import { FactFirstRetrievalService } from '../../../services/graphrag/FactFirstRetrievalService.js';
import { GraphRAGRetrievalService } from '../../../services/graphrag/GraphRAGRetrievalService.js';
import { GraphDBGraphRAGRetrievalService } from '../../../services/graphrag/GraphDBGraphRAGRetrievalService.js';
import { GraphTraversalService } from '../../../services/graphrag/GraphTraversalService.js';
import { GraphDBGraphTraversalService } from '../../../services/graphrag/GraphDBGraphTraversalService.js';
import { HybridScorer } from '../../../services/graphrag/HybridScorer.js';
import { VectorService } from '../../../services/query/VectorService.js';
import { ContextualEnrichmentService } from '../../../services/graphrag/ContextualEnrichmentService.js';
import { LLMAnswerGenerator } from '../../../services/graphrag/LLMAnswerGenerator.js';
import { SteinerTreeService } from '../../../services/graphrag/pathfinding/SteinerTreeService.js';
import { GraphDBSteinerTreeService } from '../../../services/graphrag/pathfinding/GraphDBSteinerTreeService.js';
import { KnowledgeGraphService } from '../../../services/knowledge-graph/core/KnowledgeGraph.js';
import { GraphDBInferenceEngine } from '../../../services/knowledge-graph/inference/GraphDBInferenceEngine.js';
import { GraphInferenceEngine } from '../../../services/knowledge-graph/inference/GraphInferenceEngine.js';
import { GraphDBIncrementalUpdater } from '../../../services/knowledge-graph/maintenance/GraphDBIncrementalUpdater.js';
import { IncrementalUpdater } from '../../../services/knowledge-graph/maintenance/IncrementalUpdater.js';
import { getGraphDBClient } from '../../../config/graphdb.js';
import { ServiceUnavailableError } from '../../../types/errors.js';
import type { KnowledgeGraphServiceType, GraphDBKnowledgeGraphServiceType } from './types.js';

/**
 * Service initialization state
 */
interface ServiceState {
    factFirstRetrievalService: FactFirstRetrievalService | null;
    graphRAGRetrievalService: GraphRAGRetrievalService | GraphDBGraphRAGRetrievalService | null;
    traversalService: GraphTraversalService | GraphDBGraphTraversalService | null;
    steinerTreeService: SteinerTreeService | GraphDBSteinerTreeService | null;
    llmAnswerGenerator: LLMAnswerGenerator | null;
    inferenceEngine: GraphInferenceEngine | GraphDBInferenceEngine | null;
    incrementalUpdater: IncrementalUpdater | GraphDBIncrementalUpdater | null;
}

let serviceState: ServiceState = {
    factFirstRetrievalService: null,
    graphRAGRetrievalService: null,
    traversalService: null,
    steinerTreeService: null,
    llmAnswerGenerator: null,
    inferenceEngine: null,
    incrementalUpdater: null,
};

/**
 * Reset all service instances (useful for testing)
 */
export function resetServices(): void {
    serviceState = {
        factFirstRetrievalService: null,
        graphRAGRetrievalService: null,
        traversalService: null,
        steinerTreeService: null,
        llmAnswerGenerator: null,
        inferenceEngine: null,
        incrementalUpdater: null,
    };
}

/**
 * Get FactFirstRetrievalService instance (lazy initialization)
 */
export function getFactFirstRetrievalService(
    getKGService: () => KnowledgeGraphServiceType
): FactFirstRetrievalService {
    if (!serviceState.factFirstRetrievalService) {
        const kgService = getKGService() as GraphDBKnowledgeGraphServiceType;
        serviceState.factFirstRetrievalService = new FactFirstRetrievalService(kgService as any);
    }
    return serviceState.factFirstRetrievalService;
}

/**
 * Get GraphRAGRetrievalService instance (lazy initialization)
 */
export async function getGraphRAGRetrievalService(
    getKGService: () => KnowledgeGraphServiceType,
    isGraphDB: () => boolean
): Promise<GraphRAGRetrievalService | GraphDBGraphRAGRetrievalService> {
    if (!serviceState.graphRAGRetrievalService) {
        const vectorService = new VectorService();
        await vectorService.init();
        const hybridScorer = new HybridScorer(vectorService);
        const contextualEnrichmentService = new ContextualEnrichmentService(vectorService);

        if (isGraphDB()) {
            // Use GraphDB services
            const kgService = getKGService() as import('../../../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService;

            serviceState.graphRAGRetrievalService = new GraphDBGraphRAGRetrievalService(
                kgService,
                vectorService,
                hybridScorer,
                contextualEnrichmentService
            );
        } else {
            // GraphDB services (fallback path should not be used, but kept for compatibility)
            const kgService = getKGService() as GraphDBKnowledgeGraphServiceType;
            serviceState.graphRAGRetrievalService = new GraphDBGraphRAGRetrievalService(
                kgService,
                vectorService,
                hybridScorer,
                contextualEnrichmentService
            );
        }
    }
    return serviceState.graphRAGRetrievalService;
}

/**
 * Get GraphTraversalService instance (lazy initialization)
 */
export async function getTraversalService(
    _getKGService: () => KnowledgeGraphServiceType,
    _isGraphDB: () => boolean
): Promise<GraphTraversalService | GraphDBGraphTraversalService> {
    if (!serviceState.traversalService) {
        if (_isGraphDB()) {
            try {
                const graphDBClient = getGraphDBClient();
                serviceState.traversalService = new GraphDBGraphTraversalService(graphDBClient);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new ServiceUnavailableError(
                    'GraphDB client not available for traversal service',
                    {
                        error: 'GraphDB connection is not available',
                        originalError: errorMessage
                    }
                );
            }
        } else {
            // ⚠️ ARCHITECTURE WARNING: Neo4j traversal service fallback should not be used
            // According to docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md, GraphDB is the knowledge graph backend.
            // This fallback path should never be hit in production when GraphDB is configured (default).
            // If this path is hit, it indicates a configuration issue.
            const { logger } = await import('../../../utils/logger.js');
            const { ServiceUnavailableError } = await import('../../../types/errors.js');
            
            logger.warn({
                architectureViolation: 'Neo4j traversal service fallback should not be used with GraphDB backend',
                isGraphDB: _isGraphDB(),
                backend: 'neo4j'
            }, '⚠️ ARCHITECTURE WARNING: Attempting to use Neo4j traversal service fallback. ' +
               'GraphDB is the knowledge graph backend. This fallback should not be used. ' +
               'See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md');
            
            // In production, fail fast rather than falling back to Neo4j
            if (process.env.NODE_ENV === 'production') {
                throw new ServiceUnavailableError(
                    'GraphDB traversal service is required. Neo4j fallback is not allowed in production.',
                    {
                        error: 'GraphDB is the knowledge graph backend. Neo4j fallback is not permitted.',
                        suggestion: 'Ensure GraphDB is running and connected. Set KG_BACKEND=graphdb.'
                    }
                );
            }
            
            // In development/test, allow fallback but log warning
            const { getNeo4jDriver, isNeo4jConnected, connectNeo4j } = await import('../../../config/neo4j.js');
            try {
                // Check if Neo4j is connected, try to connect if not
                if (!isNeo4jConnected()) {
                    logger.warn('Neo4j not connected, attempting to connect...');
                    try {
                        await connectNeo4j();
                    } catch (connectError) {
                        const connectErrorMessage = connectError instanceof Error ? connectError.message : String(connectError);
                        throw new ServiceUnavailableError(
                            'Neo4j driver not initialized. Failed to connect to Neo4j.',
                            {
                                error: 'Neo4j connection is not available. Please ensure Neo4j is running and accessible.',
                                originalError: connectErrorMessage,
                                suggestion: 'Check that Neo4j is running and the connection settings are correct'
                            }
                        );
                    }
                }
                const driver = getNeo4jDriver();
                serviceState.traversalService = new GraphTraversalService(driver);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                // If it's already a ServiceUnavailableError from the connection attempt, re-throw it
                if (error instanceof ServiceUnavailableError) {
                    throw error;
                }
                if (errorMessage.includes('not initialized')) {
                    throw new ServiceUnavailableError(
                        'Neo4j driver not initialized. Call connectNeo4j() first.',
                        {
                            error: 'Neo4j connection is not available. Please ensure Neo4j is running and connected.',
                            originalError: errorMessage
                        }
                    );
                }
                throw new ServiceUnavailableError(
                    'Neo4j driver not available for traversal service',
                    {
                        error: 'Neo4j connection is not available',
                        originalError: errorMessage
                    }
                );
            }
        }
    }
    if (!serviceState.traversalService) {
        throw new ServiceUnavailableError('Graph traversal service is not available');
    }
    return serviceState.traversalService;
}

/**
 * Get SteinerTreeService instance (lazy initialization)
 * Uses GraphDBSteinerTreeService for GraphDB backend (SPARQL), Neo4j fallback for development only
 */
export async function getSteinerTreeService(
    getKGService: () => KnowledgeGraphServiceType,
    isGraphDB: () => boolean
): Promise<SteinerTreeService | GraphDBSteinerTreeService | null> {
    if (isGraphDB()) {
        // Initialize GraphDB Steiner tree service
        const { logger } = await import('../../../utils/logger.js');
        logger.info('Initializing GraphDB Steiner tree service');
        const { getGraphDBClient } = await import('../../../config/graphdb.js');
        const client = getGraphDBClient();
        const traversalService = await getTraversalService(getKGService, isGraphDB) as GraphDBGraphTraversalService;
        const kgService = getKGService() as GraphDBKnowledgeGraphServiceType;
        
        if (!kgService) {
            throw new Error('Knowledge graph service is not available');
        }

        // TypeScript doesn't narrow the type after the check, so we assert non-null
        const validKgService: GraphDBKnowledgeGraphServiceType = kgService;

        // GraphDBKnowledgeGraphService implements KnowledgeGraphServiceInterface
        // Cast to KnowledgeGraphService for GraphDBSteinerTreeService constructor
        // Both implement the same interface, so this is safe
        serviceState.steinerTreeService = new GraphDBSteinerTreeService(
            client,
            traversalService,
            validKgService as unknown as KnowledgeGraphService,
        );
        return serviceState.steinerTreeService;
    }
    // ⚠️ ARCHITECTURE WARNING: Neo4j Steiner tree service should not be used
    // According to docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md, GraphDB is the knowledge graph backend.
    // This path should never be hit in production when GraphDB is configured (default).
    if (process.env.NODE_ENV === 'production') {
        const { ServiceUnavailableError } = await import('../../../types/errors.js');
        throw new ServiceUnavailableError(
            'GraphDB Steiner tree service is required. Neo4j fallback is not allowed in production.',
            {
                error: 'GraphDB is the knowledge graph backend. Neo4j fallback is not permitted.',
                suggestion: 'Ensure GraphDB is running and connected. Set KG_BACKEND=graphdb.'
            }
        );
    }
    if (!serviceState.steinerTreeService) {
        // Initialize SteinerTreeService for Neo4j backend (development/test only)
        const { logger } = await import('../../../utils/logger.js');
        logger.warn({
            architectureViolation: 'Neo4j Steiner tree service should not be used with GraphDB backend'
        }, '⚠️ ARCHITECTURE WARNING: Using Neo4j Steiner tree service fallback. ' +
           'GraphDB is the knowledge graph backend. See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md');
        
        const { getNeo4jDriver } = await import('../../../config/neo4j.js');
        const driver = getNeo4jDriver();
        const kgService = getKGService() as KnowledgeGraphService;

        serviceState.steinerTreeService = new SteinerTreeService(
            driver,
            kgService
        );
    }
    return serviceState.steinerTreeService;
}

/**
 * Get LLMAnswerGenerator instance (lazy initialization)
 */
export function getLLMAnswerGenerator(): LLMAnswerGenerator {
    if (!serviceState.llmAnswerGenerator) {
        serviceState.llmAnswerGenerator = new LLMAnswerGenerator();
    }
    return serviceState.llmAnswerGenerator;
}

/**
 * Get InferenceEngine instance (lazy initialization)
 * Uses GraphDBInferenceEngine for GraphDB backend (SPARQL), Neo4j fallback for development only
 */
export async function getInferenceEngine(
    _getKGService: () => KnowledgeGraphServiceType,
    isGraphDB: () => boolean
): Promise<GraphInferenceEngine | GraphDBInferenceEngine | null> {
    if (isGraphDB()) {
        // Initialize GraphDB inference engine
        if (!serviceState.inferenceEngine) {
            const { logger } = await import('../../../utils/logger.js');
            logger.info('Initializing GraphDB inference engine');
            const { getGraphDBClient } = await import('../../../config/graphdb.js');
            const client = getGraphDBClient();
            serviceState.inferenceEngine = new GraphDBInferenceEngine(client);
        }
        return serviceState.inferenceEngine;
    }
    // ⚠️ ARCHITECTURE WARNING: Neo4j inference engine should not be used
    // According to docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md, GraphDB is the knowledge graph backend.
    if (process.env.NODE_ENV === 'production') {
        const { ServiceUnavailableError } = await import('../../../types/errors.js');
        throw new ServiceUnavailableError(
            'GraphDB inference engine is required. Neo4j fallback is not allowed in production.',
            {
                error: 'GraphDB is the knowledge graph backend. Neo4j fallback is not permitted.',
                suggestion: 'Ensure GraphDB is running and connected. Set KG_BACKEND=graphdb.'
            }
        );
    }
    if (!serviceState.inferenceEngine) {
        // Initialize Neo4j inference engine (development/test only)
        const { logger } = await import('../../../utils/logger.js');
        logger.warn({
            architectureViolation: 'Neo4j inference engine should not be used with GraphDB backend'
        }, '⚠️ ARCHITECTURE WARNING: Using Neo4j inference engine fallback. ' +
           'GraphDB is the knowledge graph backend. See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md');
        
        const { getNeo4jDriver } = await import('../../../config/neo4j.js');
        const driver = getNeo4jDriver();
        serviceState.inferenceEngine = new GraphInferenceEngine(driver);
    }
    return serviceState.inferenceEngine;
}

/**
 * Get IncrementalUpdater instance (lazy initialization)
 * Uses GraphDBIncrementalUpdater for GraphDB backend (SPARQL), Neo4j fallback for development only
 */
export async function getIncrementalUpdater(
    getKGService: () => KnowledgeGraphServiceType,
    isGraphDB: () => boolean
): Promise<IncrementalUpdater | GraphDBIncrementalUpdater | null> {
    if (isGraphDB()) {
        // Initialize GraphDB incremental updater
        if (!serviceState.incrementalUpdater) {
            const { logger } = await import('../../../utils/logger.js');
            logger.info('Initializing GraphDB incremental updater');
            const { getGraphDBClient } = await import('../../../config/graphdb.js');
            const client = getGraphDBClient();
            const kgService = getKGService() as import('../../../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService;
            serviceState.incrementalUpdater = new GraphDBIncrementalUpdater(kgService, client);
        }
        return serviceState.incrementalUpdater;
    }
    // ⚠️ ARCHITECTURE WARNING: Neo4j incremental updater should not be used
    // According to docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md, GraphDB is the knowledge graph backend.
    if (process.env.NODE_ENV === 'production') {
        const { ServiceUnavailableError } = await import('../../../types/errors.js');
        throw new ServiceUnavailableError(
            'GraphDB incremental updater is required. Neo4j fallback is not allowed in production.',
            {
                error: 'GraphDB is the knowledge graph backend. Neo4j fallback is not permitted.',
                suggestion: 'Ensure GraphDB is running and connected. Set KG_BACKEND=graphdb.'
            }
        );
    }
    if (!serviceState.incrementalUpdater) {
        // Initialize Neo4j incremental updater (development/test only)
        const { logger } = await import('../../../utils/logger.js');
        logger.warn({
            architectureViolation: 'Neo4j incremental updater should not be used with GraphDB backend'
        }, '⚠️ ARCHITECTURE WARNING: Using Neo4j incremental updater fallback. ' +
           'GraphDB is the knowledge graph backend. See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md');
        
        const { getNeo4jDriver } = await import('../../../config/neo4j.js');
        const driver = getNeo4jDriver();
        const kgService = getKGService() as KnowledgeGraphService;
        serviceState.incrementalUpdater = new IncrementalUpdater(kgService, driver);
    }
    return serviceState.incrementalUpdater;
}
