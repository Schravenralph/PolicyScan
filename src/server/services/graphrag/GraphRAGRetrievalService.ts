/**
 * GraphRAG Retrieval Service (Orchestrator)
 * 
 * Orchestrates the full hybrid reasoning engine, combining:
 * - Fact-first KG retrieval
 * - Contextual vector enrichment
 * - Hybrid scoring
 * 
 * This is the main orchestrator service that coordinates all GraphRAG components.
 */

import { FactFirstRetrievalService, FactResult, FactFirstRetrievalResult } from './FactFirstRetrievalService.js';
import { HybridScorer, HybridScoringInput, HybridScoreResult } from './HybridScorer.js';
import { VectorService, VectorDocument } from '../query/VectorService.js';
import { GraphTraversalService } from './GraphTraversalService.js';
import { ContextualEnrichmentService, EnrichedChunk } from './ContextualEnrichmentService.js';
import { CommunityBasedRetrievalService } from './CommunityBasedRetrievalService.js';
import { GraphClusteringService } from '../graphs/navigation/GraphClusteringService.js';
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
 * Vector chunk interface for legacy enrichment method
 */
export interface VectorChunk {
    id: string;
    content: string;
    similarity: number;
    metadata?: Record<string, unknown>;
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
 * GraphRAG Retrieval Service
 * 
 * Orchestrates fact-first KG retrieval, contextual vector enrichment, and hybrid scoring
 */
export class GraphRAGRetrievalService {
    private factFirstService: FactFirstRetrievalService;
    private hybridScorer: HybridScorer;
    private vectorService: VectorService;
    // private traversalService?: GraphTraversalService; // Unused
    private contextualEnrichmentService?: ContextualEnrichmentService;
    private communityRetrievalService?: CommunityBasedRetrievalService;

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
        factFirstService: FactFirstRetrievalService,
        hybridScorer: HybridScorer,
        vectorService: VectorService,
        _traversalService: GraphTraversalService | undefined, // Keep signature compatible
        contextualEnrichmentService?: ContextualEnrichmentService,
        clusteringService?: GraphClusteringService
    ) {
        this.factFirstService = factFirstService;
        this.hybridScorer = hybridScorer;
        this.vectorService = vectorService;
        this.contextualEnrichmentService = contextualEnrichmentService || new ContextualEnrichmentService(vectorService);
        
        // Initialize community retrieval service if clustering service is provided
        if (clusteringService) {
            this.communityRetrievalService = new CommunityBasedRetrievalService(
                clusteringService,
                vectorService,
                factFirstService
            );
        }
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
            logger.debug('[GraphRAG] Feature flag disabled, returning empty results');
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
        let strategy = options.strategy || this.determineOptimalStrategy(query);

        logger.info(`[GraphRAG] Executing query with strategy: ${strategy}`);

        // Handle community-based retrieval strategy
        if (strategy === 'community-based') {
            if (FeatureFlag.isEnabled(KGFeatureFlag.KG_COMMUNITY_RETRIEVAL_ENABLED, false)) {
                return await this.executeCommunityBasedRetrieval(query, options, startTime);
            } else {
                logger.info('[GraphRAG] Community retrieval disabled, falling back to fact-first');
                strategy = 'fact-first';
            }
        }

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

        // Enrich KG facts with vector context using ContextualEnrichmentService if enabled
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
            `[GraphRAG] Query completed in ${queryTime}ms: ` +
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
     * Execute community-based retrieval
     */
    private async executeCommunityBasedRetrieval(
        query: string,
        options: GraphRAGQueryOptions,
        startTime: number
    ): Promise<GraphRAGQueryResult> {
        if (!this.communityRetrievalService) {
            logger.warn('[GraphRAG] Community retrieval service not available, falling back to fact-first');
            return await this.query(query, { ...options, strategy: 'fact-first' });
        }

        const communityResult = await this.communityRetrievalService.retrieve(query, {
            relevanceThreshold: 0.3,
            maxCommunities: 10,
            maxResultsPerCommunity: options.maxResults || 20,
        });

        // Convert community results to enriched results
        const enrichedResults: EnrichedResult[] = [];
        const featureFlagsService = getFeatureFlagsService();
        const useHybridScoring = featureFlagsService.isHybridScoringEnabled();
        
        for (const communityResultItem of communityResult.results) {
            for (const fact of communityResultItem.facts) {
                let hybridScore: HybridScoreResult;

                if (useHybridScoring) {
                    // Use hybrid scoring
                    const scoringInput: HybridScoringInput = {
                        entity: fact.entity,
                        entityMetadata: {
                            sourceUrls: fact.provenance?.sourceUrls,
                            extractionTimestamp: fact.provenance?.extractionTimestamp 
                                ? (typeof fact.provenance.extractionTimestamp === 'string' 
                                    ? new Date(fact.provenance.extractionTimestamp) 
                                    : (fact.provenance.extractionTimestamp && typeof fact.provenance.extractionTimestamp === 'object' && 'getTime' in fact.provenance.extractionTimestamp)
                                        ? fact.provenance.extractionTimestamp as Date
                                        : undefined)
                                : undefined,
                        },
                        queryText: query,
                    };

                    hybridScore = await this.hybridScorer.calculateScore(scoringInput);
                } else {
                    // Use simpler scoring: default score (no vector similarity available in community-based retrieval)
                    hybridScore = {
                        kgScore: 0,
                        vectorScore: 0,
                        finalScore: 0.5, // Default score when hybrid scoring is disabled
                    };
                }

                enrichedResults.push({
                    fact,
                    vectorChunks: [],
                    hybridScore,
                    finalRank: 0,
                });
            }
        }

        // Sort and rank
        enrichedResults.sort((a, b) => b.hybridScore.finalScore - a.hybridScore.finalScore);
        enrichedResults.forEach((result, index) => {
            result.finalRank = index + 1;
        });

        const maxResults = options.maxResults || 50;
        const finalResults = enrichedResults.slice(0, maxResults);
        const queryTime = Date.now() - startTime;
        this.trackMetrics('community-based', queryTime);

        return {
            query,
            strategy: 'community-based',
            results: finalResults,
            metrics: {
                queryTime,
                kgRetrievalTime: communityResult.metrics.retrievalTime,
                vectorRetrievalTime: 0,
                scoringTime: 0,
                factsRetrieved: communityResult.metrics.totalFacts,
                vectorChunksRetrieved: 0,
                totalResults: finalResults.length,
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
        _options: GraphRAGQueryOptions // kept for interface consistency though unused
    ): Promise<Array<{ fact: FactResult; vectorChunks: EnrichedChunk[] }>> {
        if (!this.contextualEnrichmentService) {
            logger.warn('[GraphRAG] ContextualEnrichmentService not available, falling back to basic enrichment');
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
     * Enrich KG facts with vector context (legacy method, kept for fallback)
     */
    private async enrichWithVectorContext(
        facts: FactResult[],
        _query: string,
        vectorResults: Array<{ document: VectorDocument; score: number }>,
        _options: GraphRAGQueryOptions
    ): Promise<Array<{ fact: FactResult; vectorChunks: VectorChunk[] }>> {
        const enriched: Array<{ fact: FactResult; vectorChunks: VectorChunk[] }> = [];

        for (const fact of facts) {
            // Find relevant vector chunks for this fact
            const relevantChunks: VectorChunk[] = [];

            // Match vector chunks to KG entities
            for (const vectorResult of vectorResults) {
                const chunk = vectorResult.document;
                const entityName = fact.entity.name?.toLowerCase() || '';
                const chunkContent = chunk.content?.toLowerCase() || '';

                // Simple matching: check if entity name appears in chunk
                if (entityName && chunkContent.includes(entityName)) {
                    relevantChunks.push({
                        id: chunk.id,
                        content: chunk.content,
                        similarity: vectorResult.score,
                        metadata: chunk.metadata,
                    });
                }
            }

            // If no matches found, use top vector chunks as general context
            if (relevantChunks.length === 0 && vectorResults.length > 0) {
                relevantChunks.push(
                    ...vectorResults.slice(0, 3).map(vr => ({
                        id: vr.document.id,
                        content: vr.document.content,
                        similarity: vr.score,
                        metadata: vr.document.metadata,
                    }))
                );
            }

            enriched.push({
                fact,
                vectorChunks: relevantChunks.slice(0, 5), // Limit to top 5 chunks per fact
            });
        }

        return enriched;
    }

    /**
     * Score and rank enriched results using hybrid scoring
     */
    private async scoreAndRank(
        enrichedResults: Array<{ fact: FactResult; vectorChunks: EnrichedChunk[] | VectorChunk[] }>,
        query: string,
        options: GraphRAGQueryOptions
    ): Promise<EnrichedResult[]> {
        // Check if hybrid scoring is enabled
        const featureFlagsService = getFeatureFlagsService();
        const useHybridScoring = featureFlagsService.isHybridScoringEnabled();

        // Update hybrid scorer config if weights specified and hybrid scoring is enabled
        if (useHybridScoring && (options.kgWeight !== undefined || options.vectorWeight !== undefined)) {
            this.hybridScorer.updateConfig({
                kgWeight: options.kgWeight,
                vectorWeight: options.vectorWeight,
                enableExplainability: options.enableExplainability ?? true,
            });
        }

        // Generate query embedding for vector scoring (only if hybrid scoring is enabled)
        let queryEmbedding: number[] | undefined;
        if (useHybridScoring) {
            try {
                queryEmbedding = await this.vectorService.generateEmbedding(query);
            } catch (error) {
                const errorObj = error instanceof Error ? error : new Error(String(error));
                logger.warn({ 
                    error: errorObj
                }, '[GraphRAG] Failed to generate query embedding:');
            }
        }

        // Score each result
        const scoredResults: EnrichedResult[] = [];

        for (const enriched of enrichedResults) {
            // Get best vector similarity from chunks
            const bestVectorSimilarity = enriched.vectorChunks.length > 0
                ? enriched.vectorChunks[0].similarity
                : undefined;

            let hybridScore: HybridScoreResult;

            if (useHybridScoring) {
                // Use hybrid scoring
                const scoringInput: HybridScoringInput = {
                    entity: enriched.fact.entity,
                    entityMetadata: {
                        sourceUrls: enriched.fact.provenance?.sourceUrls,
                        extractionTimestamp: enriched.fact.provenance?.extractionTimestamp 
                            ? (typeof enriched.fact.provenance.extractionTimestamp === 'string' 
                                ? new Date(enriched.fact.provenance.extractionTimestamp) 
                                : (enriched.fact.provenance.extractionTimestamp && typeof enriched.fact.provenance.extractionTimestamp === 'object' && 'getTime' in enriched.fact.provenance.extractionTimestamp)
                                    ? enriched.fact.provenance.extractionTimestamp as Date
                                    : undefined)
                            : undefined,
                    },
                    vectorSimilarity: bestVectorSimilarity,
                    queryEmbedding,
                    queryText: query,
                };

                hybridScore = await this.hybridScorer.calculateScore(scoringInput);
            } else {
                // Use simpler scoring: just vector similarity or default score
                const finalScore = bestVectorSimilarity ?? 0.5;
                hybridScore = {
                    kgScore: 0,
                    vectorScore: bestVectorSimilarity ?? 0,
                    finalScore: finalScore
                };
            }

            scoredResults.push({
                fact: enriched.fact,
                vectorChunks: enriched.vectorChunks,
                hybridScore,
                finalRank: 0, // Will be set after sorting
            });
        }

        // Sort by final score (descending)
        scoredResults.sort((a, b) => {
            const scoreA = a.hybridScore?.finalScore ?? 0.5;
            const scoreB = b.hybridScore?.finalScore ?? 0.5;
            return scoreB - scoreA;
        });

        // Assign final ranks
        scoredResults.forEach((result, index) => {
            result.finalRank = index + 1;
        });

        return scoredResults;
    }

    /**
     * Get service metrics
     */
    getMetrics(): {
        strategyUsage: Record<RetrievalStrategy, number>;
        averageQueryTime: number;
        totalQueries: number;
    } {
        return {
            strategyUsage: { ...this.metrics.strategyUsage },
            averageQueryTime: this.metrics.totalQueries > 0
                ? this.metrics.totalQueryTime / this.metrics.totalQueries
                : 0,
            totalQueries: this.metrics.totalQueries,
        };
    }

    private trackMetrics(strategy: RetrievalStrategy, time: number): void {
        this.metrics.strategyUsage[strategy]++;
        this.metrics.totalQueries++;
        this.metrics.totalQueryTime += time;
    }
}
