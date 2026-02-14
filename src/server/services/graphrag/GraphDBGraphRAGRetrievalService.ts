/**
 * GraphDB GraphRAG Retrieval Service
 * 
 * GraphDB-compatible implementation of GraphRAG retrieval.
 * Uses GraphDBKnowledgeGraphService and GraphDBGraphTraversalService.
 * 
 * This is the GraphDB implementation of GraphRAG retrieval.
 */

import { FactFirstRetrievalService, FactResult, FactFirstRetrievalResult } from './FactFirstRetrievalService.js';
import { HybridScorer, HybridScoringInput, HybridScoreResult } from './HybridScorer.js';
import { VectorService, VectorDocument } from '../query/VectorService.js';
import { ContextualEnrichmentService, EnrichedChunk } from './ContextualEnrichmentService.js';
import { GraphDBKnowledgeGraphService } from '../graphs/knowledge/GraphDBKnowledgeGraphService.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { getFeatureFlagsService } from '../knowledge-graph/KnowledgeGraphFeatureFlags.js';
import { logger } from '../../utils/logger.js';
import { QueryPlan } from './QueryPlanner.js';

/**
 * Retrieval strategy types
 */
export type RetrievalStrategy = 'fact-first' | 'vector-first' | 'hybrid-parallel' | 'community-based';

/**
 * GraphRAG query options
 */
export interface GraphRAGQueryOptions {
    strategy?: RetrievalStrategy;
    maxResults?: number;
    maxHops?: number;
    kgWeight?: number;
    vectorWeight?: number;
    enableExplainability?: boolean;
}

/**
 * Enriched result combining KG facts with vector context
 */
export interface EnrichedResult {
    fact: FactResult;
    vectorChunks?: Array<{
        id: string;
        content: string;
        similarity: number;
        metadata?: Record<string, unknown>;
    }>;
    hybridScore: HybridScoreResult;
    finalRank: number;
}

/**
 * GraphRAG query result
 */
export interface GraphRAGQueryResult {
    query: string;
    strategy: RetrievalStrategy;
    results: EnrichedResult[];
    metrics: {
        queryTime: number;
        kgRetrievalTime: number;
        vectorRetrievalTime: number;
        scoringTime: number;
        factsRetrieved: number;
        vectorChunksRetrieved: number;
        totalResults: number;
    };
    queryPlan?: {
        kgQueryPlan?: QueryPlan;
        vectorQuery?: string;
    };
}

/**
 * GraphDB GraphRAG Retrieval Service
 * 
 * Orchestrates fact-first KG retrieval, contextual vector enrichment, and hybrid scoring
 * using GraphDB backend.
 */
export class GraphDBGraphRAGRetrievalService {
    private factFirstService: FactFirstRetrievalService;
    private hybridScorer: HybridScorer;
    private vectorService: VectorService;
    private contextualEnrichmentService: ContextualEnrichmentService;

    private metrics = {
        strategyUsage: {
            'fact-first': 0,
            'vector-first': 0,
            'hybrid-parallel': 0,
            'community-based': 0,
        } as Record<RetrievalStrategy, number>,
        totalQueryTime: 0,
        totalQueries: 0,
    };

    constructor(
        kgService: GraphDBKnowledgeGraphService,
        vectorService: VectorService,
        hybridScorer: HybridScorer,
        contextualEnrichmentService?: ContextualEnrichmentService
    ) {
        // Create FactFirstRetrievalService with GraphDB knowledge graph service
        // FactFirstRetrievalService accepts any service implementing the interface
        this.factFirstService = new FactFirstRetrievalService(kgService as any);
        this.vectorService = vectorService;
        this.hybridScorer = hybridScorer;
        this.contextualEnrichmentService = contextualEnrichmentService || new ContextualEnrichmentService(vectorService);
    }

    /**
     * Execute a GraphRAG query
     * 
     * @param query Natural language query
     * @param options Query options
     * @returns GraphRAG query result with enriched results
     */
    async query(query: string, options: GraphRAGQueryOptions = {}): Promise<GraphRAGQueryResult> {
        const startTime = Date.now();

        // Check if GraphRAG retrieval is enabled
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_GRAPHRAG_RETRIEVAL_ENABLED, false)) {
            logger.debug('[GraphDBGraphRAG] Feature flag disabled, returning empty results');
            return {
                query,
                strategy: options.strategy || 'fact-first',
                results: [],
                metrics: {
                    queryTime: Date.now() - startTime,
                    kgRetrievalTime: 0,
                    vectorRetrievalTime: 0,
                    scoringTime: 0,
                    factsRetrieved: 0,
                    vectorChunksRetrieved: 0,
                    totalResults: 0,
                },
            };
        }

        // Determine optimal strategy if not specified
        const strategy = options.strategy || this.determineOptimalStrategy(query);

        logger.info(`[GraphDBGraphRAG] Executing query with strategy: ${strategy}`);

        // Execute retrieval based on strategy
        let kgResults: FactFirstRetrievalResult;
        let vectorResults: Array<{ document: VectorDocument; score: number }> = [];
        let kgRetrievalTime = 0;
        let vectorRetrievalTime = 0;

        if (strategy === 'fact-first' || strategy === 'hybrid-parallel') {
            // Execute KG retrieval
            const kgStart = Date.now();
            kgResults = await this.factFirstService.query(query, {
                maxResults: options.maxResults || 50,
                maxHops: options.maxHops || 2,
            });
            kgRetrievalTime = Date.now() - kgStart;
        } else {
            // Vector-first: start with vector search
            const vectorStart = Date.now();
            vectorResults = await this.vectorService.search(query, options.maxResults || 50);
            vectorRetrievalTime = Date.now() - vectorStart;

            // Then enrich with KG facts
            const kgStart = Date.now();
            kgResults = await this.factFirstService.query(query, {
                maxResults: options.maxResults || 50,
                maxHops: options.maxHops || 2,
            });
            kgRetrievalTime = Date.now() - kgStart;
        }

        // If hybrid-parallel, also do vector search in parallel
        if (strategy === 'hybrid-parallel') {
            const vectorStart = Date.now();
            vectorResults = await this.vectorService.search(query, options.maxResults || 50);
            vectorRetrievalTime = Date.now() - vectorStart;
        }

        // Enrich KG facts with vector context
        const enrichedResults = FeatureFlag.isEnabled(KGFeatureFlag.KG_CONTEXTUAL_ENRICHMENT_ENABLED, false)
            ? await this.enrichWithContextualEnrichment(kgResults.facts, query, options)
            : await this.enrichWithVectorContext(kgResults.facts, query, vectorResults, options);

        // Apply hybrid scoring
        const scoringStart = Date.now();
        const scoredResults = await this.scoreAndRank(enrichedResults, query, options);
        const scoringTime = Date.now() - scoringStart;

        // Limit results
        const maxResults = options.maxResults || 50;
        const finalResults = scoredResults.slice(0, maxResults);

        const queryTime = Date.now() - startTime;
        this.trackMetrics(strategy, queryTime);

        logger.info(
            `[GraphDBGraphRAG] Query completed in ${queryTime}ms: ` +
            `${kgResults.totalFacts} KG facts, ${vectorResults.length} vector chunks, ` +
            `${finalResults.length} final results`
        );

        return {
            query,
            strategy,
            results: finalResults,
            metrics: {
                queryTime,
                kgRetrievalTime,
                vectorRetrievalTime,
                scoringTime,
                factsRetrieved: kgResults.totalFacts,
                vectorChunksRetrieved: vectorResults.length,
                totalResults: finalResults.length,
            },
            queryPlan: {
                kgQueryPlan: kgResults.queryPlan,
                vectorQuery: query,
            },
        };
    }

    /**
     * Determine optimal retrieval strategy based on query type
     */
    private determineOptimalStrategy(query: string): RetrievalStrategy {
        const queryLower = query.toLowerCase();

        // Factual queries (what, when, where, who) -> fact-first
        if (
            queryLower.startsWith('what') ||
            queryLower.startsWith('when') ||
            queryLower.startsWith('where') ||
            queryLower.startsWith('who') ||
            queryLower.includes('is the') ||
            queryLower.includes('are the')
        ) {
            return 'fact-first';
        }

        // Conceptual/exploratory queries -> vector-first
        if (
            queryLower.startsWith('explain') ||
            queryLower.startsWith('describe') ||
            queryLower.startsWith('how') ||
            queryLower.includes('similar to') ||
            queryLower.includes('related to')
        ) {
            return 'vector-first';
        }

        // Complex queries -> hybrid-parallel
        if (
            queryLower.includes('and') ||
            queryLower.includes('or') ||
            queryLower.includes('compare') ||
            queryLower.includes('difference')
        ) {
            return 'hybrid-parallel';
        }

        // Default to fact-first
        return 'fact-first';
    }

    /**
     * Enrich KG facts with vector context using ContextualEnrichmentService
     */
    private async enrichWithContextualEnrichment(
        facts: FactResult[],
        query: string,
        _options: GraphRAGQueryOptions
    ): Promise<Array<{ fact: FactResult; vectorChunks: EnrichedChunk[] }>> {
        if (!this.contextualEnrichmentService) {
            return facts.map(fact => ({ fact, vectorChunks: [] }));
        }

        const enrichmentOptions = {
            maxChunksPerEntity: 5,
            maxChunksPerQuery: 20,
            minSimilarity: 0.3,
            enableDeduplication: true,
            parallelRetrieval: true,
        };

        const enrichmentResult = await this.contextualEnrichmentService.enrichFacts(
            facts,
            query,
            enrichmentOptions
        );

        // Convert to expected format
        return enrichmentResult.results.map(result => ({
            fact: result.fact,
            vectorChunks: result.chunks.map(chunk => ({
                id: chunk.id,
                content: chunk.content,
                similarity: chunk.similarity,
                relevanceScore: chunk.relevanceScore,
                metadata: chunk.metadata,
            })),
        }));
    }

    /**
     * Enrich KG facts with vector context (legacy method)
     */
    private async enrichWithVectorContext(
        facts: FactResult[],
        _query: string,
        vectorResults: Array<{ document: VectorDocument; score: number }>,
        _options: GraphRAGQueryOptions
    ): Promise<Array<{ fact: FactResult; vectorChunks: Array<{ id: string; content: string; similarity: number; metadata?: Record<string, unknown> }> }>> {
        // Match vector chunks to facts by entity ID or content similarity
        return facts.map((fact) => {
            const relevantChunks = vectorResults
                .filter(vr => {
                    // Match by entity ID if available in metadata
                    const entityId = vr.document.metadata?.entityId;
                    if (entityId && entityId === fact.entity.id) {
                        return true;
                    }
                    // Match by content similarity (entity name in chunk)
                    const content = vr.document.content.toLowerCase();
                    const entityName = fact.entity.name?.toLowerCase() || '';
                    return content.includes(entityName);
                })
                .map(vr => ({
                    id: vr.document.id,
                    content: vr.document.content,
                    similarity: vr.score,
                    metadata: vr.document.metadata,
                }));

            return {
                fact,
                vectorChunks: relevantChunks,
            };
        });
    }

    /**
     * Score and rank enriched results
     */
    private async scoreAndRank(
        enrichedResults: Array<{ fact: FactResult; vectorChunks: Array<{ id: string; content: string; similarity: number; metadata?: Record<string, unknown> }> | EnrichedChunk[] }>,
        query: string,
        options: GraphRAGQueryOptions
    ): Promise<EnrichedResult[]> {
        const kgWeight = options.kgWeight ?? 0.6;
        const vectorWeight = options.vectorWeight ?? 0.4;
        const featureFlagsService = getFeatureFlagsService();
        const useHybridScoring = featureFlagsService.isHybridScoringEnabled();

        const scoredResults = await Promise.all(
            enrichedResults.map(async (enriched) => {
                // Combine with vector similarity if available
                const vectorChunks = Array.isArray(enriched.vectorChunks) ? enriched.vectorChunks : [];
                const maxVectorSimilarity = vectorChunks.length > 0
                    ? Math.max(...vectorChunks.map(chunk => 'similarity' in chunk ? chunk.similarity : 0))
                    : 0;

                let hybridScore: HybridScoreResult;

                if (useHybridScoring) {
                    // Calculate hybrid score
                    const scoringInput: HybridScoringInput = {
                        entity: enriched.fact.entity,
                        entityMetadata: {
                            sourceUrls: enriched.fact.provenance?.sourceUrls,
                            extractionTimestamp: enriched.fact.provenance?.extractionTimestamp
                                ? (typeof enriched.fact.provenance.extractionTimestamp === 'string'
                                    ? new Date(enriched.fact.provenance.extractionTimestamp)
                                    : undefined)
                                : undefined,
                        },
                        queryText: query,
                    };

                    hybridScore = await this.hybridScorer.calculateScore(scoringInput);
                } else {
                    // Use simpler scoring: just vector similarity or default score
                    const finalScore = maxVectorSimilarity || 0.5;
                    hybridScore = {
                        kgScore: 0,
                        vectorScore: maxVectorSimilarity,
                        finalScore: finalScore
                    };
                }

                // Weighted combination (only relevant if hybrid scoring was used, otherwise finalScore is already set)
                let finalScore = hybridScore.finalScore;

                if (useHybridScoring) {
                    finalScore = (hybridScore.finalScore * kgWeight) + (maxVectorSimilarity * vectorWeight);
                }

                return {
                    fact: enriched.fact,
                    vectorChunks: vectorChunks.map(chunk => ({
                        id: 'id' in chunk ? chunk.id : '',
                        content: 'content' in chunk ? chunk.content : '',
                        similarity: 'similarity' in chunk ? chunk.similarity : 0,
                        metadata: 'metadata' in chunk ? chunk.metadata : undefined,
                    })),
                    hybridScore: {
                        ...hybridScore,
                        finalScore,
                    },
                    finalRank: 0, // Will be set after sorting
                };
            })
        );

        // Sort by final score
        scoredResults.sort((a, b) => b.hybridScore.finalScore - a.hybridScore.finalScore);

        // Assign ranks
        scoredResults.forEach((result, index) => {
            result.finalRank = index + 1;
        });

        return scoredResults;
    }

    /**
     * Track metrics
     */
    private trackMetrics(strategy: RetrievalStrategy, queryTime: number): void {
        this.metrics.strategyUsage[strategy]++;
        this.metrics.totalQueryTime += queryTime;
        this.metrics.totalQueries++;
    }

    /**
     * Get service metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            averageQueryTime: this.metrics.totalQueries > 0
                ? this.metrics.totalQueryTime / this.metrics.totalQueries
                : 0,
        };
    }
}

