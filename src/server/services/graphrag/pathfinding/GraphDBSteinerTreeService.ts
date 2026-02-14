/**
 * GraphDB Steiner Tree Service
 * 
 * SPARQL-based implementation of Steiner tree service for GraphDB backend.
 * Provides Steiner tree algorithm for finding minimum weighted paths
 * connecting key concepts in the knowledge graph.
 * 
 * Architecture: Knowledge Graph operations MUST use GraphDB (SPARQL), not Neo4j (Cypher).
 * See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md
 */

import { GraphDBClient } from '../../../config/graphdb.js';
import { RelationType } from '../../../domain/ontology.js';
import { GraphDBGraphTraversalService } from '../GraphDBGraphTraversalService.js';
import { KnowledgeGraphService } from '../../knowledge-graph/core/KnowledgeGraph.js';
import { QueryParser } from '../QueryParser.js';
import { getFeatureFlagsService } from '../../knowledge-graph/KnowledgeGraphFeatureFlags.js';
import { KGFeatureFlag } from '../../../models/FeatureFlag.js';
import { logger } from '../../../utils/logger.js';
import {
    GraphDBSteinerTreeAlgorithm,
    SteinerTreeConfig,
    SteinerTreeResult,
    WeightedEdge,
} from './GraphDBSteinerTreeAlgorithm.js';

/**
 * Steiner tree query options
 */
export interface SteinerTreeQueryOptions {
    query?: string; // Natural language query to extract entities from
    terminalNodeIds?: string[]; // Explicit terminal node IDs
    maxDepth?: number;
    maxNodes?: number;
    relationshipTypes?: RelationType[];
    minWeight?: number;
    enableExplainability?: boolean;
}

/**
 * Enhanced Steiner tree result with scoring information
 */
export interface EnhancedSteinerTreeResult extends SteinerTreeResult {
    query?: string;
    pathFindingTime: number;
    averageConfidence: number;
    explanation?: string;
}

/**
 * Service-specific configuration that extends SteinerTreeConfig
 */
interface SteinerTreeServiceConfig extends SteinerTreeConfig {
    kgWeight?: number;
    ontologyWeight?: number;
    enableExplainability?: boolean;
}

/**
 * GraphDB Steiner Tree Service
 * 
 * Provides Steiner tree algorithm for finding minimum weighted paths
 * connecting key concepts in the knowledge graph using GraphDB (SPARQL).
 */
export class GraphDBSteinerTreeService {
    private algorithm: GraphDBSteinerTreeAlgorithm;
    // private traversalService: GraphDBGraphTraversalService; // Unused
    private kgService: KnowledgeGraphService;
    private queryParser: QueryParser;
    private featureFlagsService = getFeatureFlagsService();
    private config: SteinerTreeServiceConfig;

    constructor(
        client: GraphDBClient,
        traversalService: GraphDBGraphTraversalService,
        kgService: KnowledgeGraphService,
        config: Partial<SteinerTreeServiceConfig> = {}
    ) {
        this.algorithm = new GraphDBSteinerTreeAlgorithm(client, traversalService);
        this.kgService = kgService;
        this.queryParser = new QueryParser();
        this.config = {
            kgWeight: config.kgWeight ?? 0.5,
            ontologyWeight: config.ontologyWeight ?? 0.5,
            enableExplainability: config.enableExplainability ?? true,
            maxDepth: config.maxDepth ?? 10,
            maxNodes: config.maxNodes ?? 1000,
            ...config,
        };
    }

    /**
     * Check if Steiner tree is enabled via feature flag
     */
    private isEnabled(): boolean {
        return this.featureFlagsService.isEnabled(KGFeatureFlag.KG_STEINER_TREE_ENABLED, false);
    }

    /**
     * Find Steiner tree connecting terminal nodes
     * @param options Query options
     * @returns Enhanced Steiner tree result
     */
    async findSteinerTree(options: SteinerTreeQueryOptions): Promise<EnhancedSteinerTreeResult | null> {
        if (!this.isEnabled()) {
            logger.warn('[SteinerTree] Feature flag disabled');
            return null;
        }

        const startTime = Date.now();

        // Extract terminal nodes from query or use provided IDs
        let terminalNodeIds: string[] = [];

        if (options.terminalNodeIds && options.terminalNodeIds.length > 0) {
            terminalNodeIds = options.terminalNodeIds;
        } else if (options.query) {
            terminalNodeIds = await this.extractTerminalNodes(options.query);
        } else {
            logger.warn('[SteinerTree] No terminal nodes provided');
            return null;
        }

        if (terminalNodeIds.length < 2) {
            logger.warn('[SteinerTree] Need at least 2 terminal nodes');
            return null;
        }

        logger.info(
            `[SteinerTree] Finding Steiner tree for ${terminalNodeIds.length} terminals: ${terminalNodeIds.join(', ')}`
        );

        // Build weight function that combines KG confidence and ontology weights
        const weightFunction = (edge: WeightedEdge): number => {
            const kgWeight = edge.kgConfidence ?? 0.5;
            const ontologyWeight = edge.ontologyWeight ?? 1.0;
            const combinedWeight = kgWeight * ontologyWeight;

            // Invert for cost (lower confidence = higher cost)
            return 1.0 / (combinedWeight + 0.01); // Add small epsilon to avoid division by zero
        };

        // Configure algorithm
        const algorithmConfig: SteinerTreeConfig = {
            maxDepth: options.maxDepth ?? this.config.maxDepth,
            maxNodes: options.maxNodes ?? this.config.maxNodes,
            relationshipTypes: options.relationshipTypes,
            weightFunction,
            minWeight: options.minWeight,
        };

        // Find Steiner tree
        const result = await this.algorithm.findSteinerTree(terminalNodeIds, algorithmConfig);

        if (!result) {
            return null;
        }

        // Enhance result with scoring and explanations
        const enhancedResult = await this.enhanceResult(result, options, Date.now() - startTime);

        return enhancedResult;
    }

    /**
     * Extract terminal nodes from natural language query
     * Uses QueryParser to extract keywords and searches the knowledge graph for matching entities
     */
    private async extractTerminalNodes(query: string): Promise<string[]> {
        if (!this.kgService) {
            logger.warn('[SteinerTree] Knowledge graph service not available for entity extraction');
            return [];
        }

        try {
            // Parse the query to extract keywords
            const parsedQuery = this.queryParser.parse(query);
            logger.debug(`[SteinerTree] Parsed query: ${JSON.stringify(parsedQuery)}`);

            // Search for entities using keywords
            const keywords = parsedQuery.keywords.length > 0 
                ? parsedQuery.keywords 
                : query.split(/\s+/).filter(w => w.length > 2); // Fallback to all words if no keywords

            if (keywords.length === 0) {
                logger.warn('[SteinerTree] No keywords extracted from query');
                return [];
            }

            // Search for entities matching the keywords
            const entities = await this.kgService.searchEntities(keywords);

            // Filter by entity type if specified in query
            let filteredEntities = entities;
            if (parsedQuery.entityTypes && parsedQuery.entityTypes.length > 0) {
                filteredEntities = entities.filter(e => 
                    parsedQuery.entityTypes!.includes(e.type)
                );
            }

            // Limit to top results (prioritize by relevance if available)
            // For now, take up to 5 entities to avoid too many terminal nodes
            const maxTerminals = 5;
            const terminalEntities = filteredEntities.slice(0, maxTerminals);

            if (terminalEntities.length === 0) {
                logger.warn(`[SteinerTree] No entities found for query: "${query}"`);
                return [];
            }

            const terminalNodeIds = terminalEntities.map(e => e.id);
            logger.info(
                `[SteinerTree] Extracted ${terminalNodeIds.length} terminal nodes from query: ${terminalNodeIds.join(', ')}`
            );

            return terminalNodeIds;
        } catch (error) {
            logger.error({ error }, '[SteinerTree] Error extracting terminal nodes from query');
            return [];
        }
    }

    /**
     * Enhance Steiner tree result with scoring and explanations
     */
    private async enhanceResult(
        result: SteinerTreeResult,
        options: SteinerTreeQueryOptions,
        pathFindingTime: number
    ): Promise<EnhancedSteinerTreeResult> {
        // Calculate average confidence
        const confidences = result.edges
            .map(e => e.kgConfidence ?? 0.5)
            .filter(c => c > 0);

        const averageConfidence =
            confidences.length > 0
                ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
                : 0.5;

        // Generate explanation if enabled
        let explanation: string | undefined;
        if (this.config.enableExplainability && options.enableExplainability !== false) {
            explanation = this.generateExplanation(result, averageConfidence, pathFindingTime);
        }

        return {
            ...result,
            query: options.query,
            pathFindingTime,
            averageConfidence,
            explanation,
        };
    }

    /**
     * Generate human-readable explanation
     */
    private generateExplanation(
        result: SteinerTreeResult,
        averageConfidence: number,
        pathFindingTime: number
    ): string {
        const parts: string[] = [];

        parts.push(
            `Found Steiner tree connecting ${result.terminalNodes.length} terminal nodes ` +
            `with ${result.nodes.length} total nodes and ${result.edges.length} edges.`
        );

        if (result.steinerNodes.length > 0) {
            parts.push(`Includes ${result.steinerNodes.length} intermediate (Steiner) nodes.`);
        }

        parts.push(`Total path cost: ${result.totalCost.toFixed(3)}.`);

        if (averageConfidence >= 0.7) {
            parts.push('High average KG confidence.');
        } else if (averageConfidence >= 0.4) {
            parts.push('Moderate average KG confidence.');
        } else {
            parts.push('Low average KG confidence.');
        }

        parts.push(`Path finding completed in ${pathFindingTime}ms.`);

        return parts.join(' ');
    }

    /**
     * Update service configuration
     */
    updateConfig(config: Partial<SteinerTreeConfig>): void {
        this.config = {
            ...this.config,
            ...config,
        };
    }

    /**
     * Get current configuration
     */
    getConfig(): SteinerTreeConfig {
        return { ...this.config };
    }
}
