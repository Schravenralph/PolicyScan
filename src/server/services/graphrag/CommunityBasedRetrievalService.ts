/**
 * Community-Based Retrieval Service
 * 
 * Implements community-based retrieval following the Microsoft GraphRAG pattern.
 * Dynamically selects communities based on query relevance and retrieves from selected communities.
 * 
 * Based on Microsoft GraphRAG research:
 * - Dynamic Community Selection: Score communities for query relevance and prune irrelevant ones
 * - Community Reports: Structured summaries serve as context for LLM retrieval
 */

import { GraphClusteringService, ClusterNode } from '../graphs/navigation/GraphClusteringService.js';
import { CommunityScorer, CommunityScore } from './CommunityScorer.js';
import { VectorService } from '../query/VectorService.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { logger } from '../../utils/logger.js';
import { FactFirstRetrievalService, FactResult } from './FactFirstRetrievalService.js';

/**
 * Community-based retrieval options
 */
export interface CommunityRetrievalOptions {
    relevanceThreshold?: number; // Default: 0.3
    maxCommunities?: number; // Default: 10
    maxResultsPerCommunity?: number; // Default: 20
    enablePruning?: boolean; // Default: true
    useCommunityReports?: boolean; // Default: false (requires WI-221-COMMUNITY-REPORTS)
    useSemanticLabels?: boolean; // Default: false (requires WI-221-SEMANTIC-LABELING)
}

/**
 * Community retrieval result
 */
export interface CommunityRetrievalResult {
    query: string;
    selectedCommunities: CommunityScore[];
    results: Array<{
        community: ClusterNode;
        facts: FactResult[];
        communityContext?: {
            label?: string;
            summary?: string;
            keyEntities?: string[];
        };
    }>;
    metrics: {
        totalCommunities: number;
        selectedCommunities: number;
        prunedCommunities: number;
        totalFacts: number;
        retrievalTime: number;
        scoringTime: number;
    };
}

/**
 * Community-Based Retrieval Service
 * 
 * Implements hierarchical retrieval by selecting relevant communities and retrieving from them
 */
export class CommunityBasedRetrievalService {
    private clusteringService: GraphClusteringService;
    private communityScorer: CommunityScorer;
    private factFirstService?: FactFirstRetrievalService;
    
    // Metrics tracking
    private metrics = {
        totalRetrievals: 0,
        totalCommunitiesScored: 0,
        totalCommunitiesSelected: 0,
        totalFactsRetrieved: 0,
        totalRetrievalTime: 0,
        totalScoringTime: 0,
    };

    constructor(
        clusteringService: GraphClusteringService,
        vectorService: VectorService,
        factFirstService?: FactFirstRetrievalService
    ) {
        this.clusteringService = clusteringService;
        this.communityScorer = new CommunityScorer(vectorService);
        this.factFirstService = factFirstService;
    }

    /**
     * Retrieve results using community-based retrieval
     * 
     * @param query Natural language query
     * @param options Retrieval options
     * @returns Community retrieval result
     */
    async retrieve(
        query: string,
        options: CommunityRetrievalOptions = {}
    ): Promise<CommunityRetrievalResult> {
        const startTime = Date.now();

        // Check if community retrieval is enabled
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_COMMUNITY_RETRIEVAL_ENABLED, false)) {
            logger.debug('[CommunityRetrieval] Feature flag disabled, returning empty results');
            return {
                query,
                selectedCommunities: [],
                results: [],
                metrics: {
                    totalCommunities: 0,
                    selectedCommunities: 0,
                    prunedCommunities: 0,
                    totalFacts: 0,
                    retrievalTime: Date.now() - startTime,
                    scoringTime: 0,
                },
            };
        }

        const {
            relevanceThreshold = 0.3,
            maxCommunities = 10,
            maxResultsPerCommunity = 20,
            enablePruning = true,
            useCommunityReports = false,
            useSemanticLabels = false,
        } = options;

        logger.info(`[CommunityRetrieval] Starting retrieval for query: "${query}"`);

        // Step 1: Get meta-graph with communities
        const metaGraph = await this.clusteringService.createMetaGraph();

        // Step 2: Score communities for query relevance
        const scoringStart = Date.now();
        const scoredCommunities = await this.communityScorer.scoreCommunities(query, metaGraph, {
            minRelevanceThreshold: enablePruning ? relevanceThreshold : 0,
            topK: maxCommunities,
            useSemanticScoring: true,
            useKeywordScoring: true,
        });
        const scoringTime = Date.now() - scoringStart;

        // Step 3: Prune low-scoring communities (if enabled)
        const selectedCommunities = enablePruning
            ? scoredCommunities.filter(score => score.relevanceScore >= relevanceThreshold)
            : scoredCommunities.slice(0, maxCommunities);

        const prunedCommunities = scoredCommunities.length - selectedCommunities.length;

        logger.info(
            `[CommunityRetrieval] Selected ${selectedCommunities.length} communities ` +
            `(pruned ${prunedCommunities}, scored ${scoredCommunities.length})`
        );

        // Step 4: Retrieve from selected communities
        const results: CommunityRetrievalResult['results'] = [];
        let totalFacts = 0;

        for (const communityScore of selectedCommunities) {
            const community = communityScore.cluster;

            // Get community context (if available)
            const communityContext = await this.getCommunityContext(
                community,
                useSemanticLabels,
                useCommunityReports
            );

            // Retrieve facts from this community
            const facts = await this.retrieveFromCommunity(
                query,
                community,
                maxResultsPerCommunity
            );

            totalFacts += facts.length;

            results.push({
                community,
                facts,
                communityContext,
            });
        }

        const retrievalTime = Date.now() - startTime;

        // Update service metrics
        this.metrics.totalRetrievals++;
        this.metrics.totalCommunitiesScored += scoredCommunities.length;
        this.metrics.totalCommunitiesSelected += selectedCommunities.length;
        this.metrics.totalFactsRetrieved += totalFacts;
        this.metrics.totalRetrievalTime += retrievalTime;
        this.metrics.totalScoringTime += scoringTime;

        logger.info(
            `[CommunityRetrieval] Completed in ${retrievalTime}ms: ` +
            `${selectedCommunities.length} communities, ${totalFacts} facts`
        );

        return {
            query,
            selectedCommunities,
            results,
            metrics: {
                totalCommunities: Object.keys(metaGraph.clusters).length,
                selectedCommunities: selectedCommunities.length,
                prunedCommunities,
                totalFacts,
                retrievalTime,
                scoringTime,
            },
        };
    }

    /**
     * Get community context (label, summary, key entities)
     * 
     * @param community Community cluster
     * @param useSemanticLabels Whether to use semantic labels (requires WI-221-SEMANTIC-LABELING)
     * @param useCommunityReports Whether to use community reports (requires WI-221-COMMUNITY-REPORTS)
     * @returns Community context
     */
    private async getCommunityContext(
        community: ClusterNode,
        useSemanticLabels: boolean,
        useCommunityReports: boolean
    ): Promise<CommunityRetrievalResult['results'][0]['communityContext']> {
        const context: CommunityRetrievalResult['results'][0]['communityContext'] = {};

        // Use semantic label if available and enabled
        // Note: SemanticLabelingService is designed for knowledge graph entities, not navigation graph clusters.
        // For navigation graph clusters, we use the cluster label as the semantic label.
        // Full semantic labeling integration would require KnowledgeGraphClusteringService.
        if (useSemanticLabels) {
            // Use the cluster label as the semantic label for navigation graph clusters
            // In the future, this could be enhanced to use SemanticCommunityLabeler with KnowledgeGraphClusteringService
            context.label = community.label;
        } else {
            context.label = community.label;
        }

        // Use community report if available and enabled
        if (useCommunityReports) {
            // Note: CommunityReportGenerator works with KnowledgeGraphClusteringService,
            // which uses a different cluster type (KnowledgeClusterNode vs ClusterNode).
            // For navigation graph clusters, we generate a simple summary from cluster metadata.
            context.summary = `Community with ${community.nodeCount} nodes focused on ${community.label}`;
            
            // Extract key entities from cluster if we have access to nodes
            try {
                const clusterNodes = await this.clusteringService.getClusterNodes(community);
                if (clusterNodes.length > 0) {
                    // Extract representative entity names from node titles
                    const keyEntities = clusterNodes
                        .slice(0, 5)
                        .map(node => node.title)
                        .filter((title): title is string => !!title && title.length > 0);
                    if (keyEntities.length > 0) {
                        context.keyEntities = keyEntities;
                    }
                }
            } catch (error) {
                const errorObj = error instanceof Error ? error : new Error(String(error));
                logger.debug({ 
                    error: errorObj.message,
                    errorStack: errorObj.stack
                }, `[CommunityRetrieval] Could not extract key entities for community ${community.id}:`);
            }
        }

        return context;
    }

    /**
     * Retrieve facts from a specific community
     * 
     * @param query Query text
     * @param community Community cluster
     * @param maxResults Maximum results to return
     * @returns Facts from the community
     */
    private async retrieveFromCommunity(
        query: string,
        community: ClusterNode,
        maxResults: number
    ): Promise<FactResult[]> {
        // If fact-first service is available, use it with community filtering
        if (this.factFirstService) {
            try {
                const factResults = await this.factFirstService.query(query, {
                    maxResults,
                    maxHops: 2,
                });

                // Filter facts to those relevant to this community
                // For now, we'll return all facts (community filtering can be enhanced later)
                return factResults.facts.slice(0, maxResults);
            } catch (error) {
                logger.warn({ 
                    error: error instanceof Error ? error.message : String(error),
                    errorStack: error instanceof Error ? error.stack : undefined
                }, `[CommunityRetrieval] Failed to retrieve facts from community ${community.id}:`);
            }
        }

        // Fallback: return empty results if fact-first service is not available
        logger.debug(`[CommunityRetrieval] Fact-first service not available, returning empty results for community ${community.id}`);
        return [];
    }

    /**
     * Get service metrics
     */
    getMetrics(): {
        totalRetrievals: number;
        averageCommunitiesSelected: number;
        averageRetrievalTime: number;
        averageScoringTime: number;
        averageFactsPerRetrieval: number;
        averageCommunitiesScored: number;
    } {
        const { totalRetrievals } = this.metrics;
        
        return {
            totalRetrievals,
            averageCommunitiesSelected: totalRetrievals > 0
                ? this.metrics.totalCommunitiesSelected / totalRetrievals
                : 0,
            averageRetrievalTime: totalRetrievals > 0
                ? this.metrics.totalRetrievalTime / totalRetrievals
                : 0,
            averageScoringTime: totalRetrievals > 0
                ? this.metrics.totalScoringTime / totalRetrievals
                : 0,
            averageFactsPerRetrieval: totalRetrievals > 0
                ? this.metrics.totalFactsRetrieved / totalRetrievals
                : 0,
            averageCommunitiesScored: totalRetrievals > 0
                ? this.metrics.totalCommunitiesScored / totalRetrievals
                : 0,
        };
    }

    /**
     * Reset metrics (useful for testing)
     */
    resetMetrics(): void {
        this.metrics = {
            totalRetrievals: 0,
            totalCommunitiesScored: 0,
            totalCommunitiesSelected: 0,
            totalFactsRetrieved: 0,
            totalRetrievalTime: 0,
            totalScoringTime: 0,
        };
    }
}

