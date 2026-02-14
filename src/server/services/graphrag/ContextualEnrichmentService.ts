/**
 * Contextual Enrichment Service
 * 
 * Retrieves relevant text chunks from the vector store to provide context alongside KG facts.
 * Enables the hybrid retrieval pattern where KG provides structured facts and vectors provide
 * contextual semantic information.
 * 
 * Based on HYBRID-KG-VECTOR-ARCHITECTURE.md Layer 4:
 * "Contextual enrichment: Parallel semantic search in the vector store retrieves relevant text
 * chunks lacking explicit structure; context is provided to the LLM alongside KG facts"
 */

import { VectorService } from '../query/VectorService.js';
import { FactResult } from './FactFirstRetrievalService.js';
import { BaseEntity } from '../../domain/ontology.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { logger } from '../../utils/logger.js';

/**
 * Enriched vector chunk with relevance information
 */
export interface EnrichedChunk {
    id: string;
    content: string;
    similarity: number;
    relevanceScore: number; // Combined score considering both similarity and KG relevance
    metadata?: Record<string, unknown>;
    matchedEntityId?: string; // Which entity this chunk relates to
    matchedEntityName?: string;
}

/**
 * Contextual enrichment result for a single fact
 */
export interface EnrichmentResult {
    fact: FactResult;
    chunks: EnrichedChunk[];
    enrichmentTime: number;
}

/**
 * Batch enrichment result
 */
export interface BatchEnrichmentResult {
    results: EnrichmentResult[];
    totalChunks: number;
    totalTime: number;
    averageChunksPerFact: number;
}

/**
 * Enrichment options
 */
export interface EnrichmentOptions {
    maxChunksPerEntity?: number; // Default: 5
    maxChunksPerQuery?: number; // Default: 20
    minSimilarity?: number; // Default: 0.3
    enableDeduplication?: boolean; // Default: true
    parallelRetrieval?: boolean; // Default: true
}

/**
 * Contextual Enrichment Service
 * 
 * Retrieves relevant vector chunks for KG entities and queries
 */
export class ContextualEnrichmentService {
    private vectorService: VectorService;

    constructor(vectorService: VectorService) {
        this.vectorService = vectorService;
    }

    /**
     * Enrich KG facts with relevant vector chunks
     * 
     * @param facts KG facts to enrich
     * @param query Original query for query-based enrichment
     * @param options Enrichment options
     * @returns Enrichment results
     */
    async enrichFacts(
        facts: FactResult[],
        query: string,
        options: EnrichmentOptions = {}
    ): Promise<BatchEnrichmentResult> {
        const startTime = Date.now();

        // Check if contextual enrichment is enabled
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_CONTEXTUAL_ENRICHMENT_ENABLED, false)) {
            logger.debug('[ContextualEnrichment] Feature flag disabled, returning empty enrichment');
            return {
                results: facts.map(fact => ({
                    fact,
                    chunks: [],
                    enrichmentTime: 0,
                })),
                totalChunks: 0,
                totalTime: Date.now() - startTime,
                averageChunksPerFact: 0,
            };
        }

        const maxChunksPerEntity = options.maxChunksPerEntity || 5;
        const maxChunksPerQuery = options.maxChunksPerQuery || 20;
        const minSimilarity = options.minSimilarity || 0.3;
        const enableDeduplication = options.enableDeduplication !== false;
        const parallelRetrieval = options.parallelRetrieval !== false;

        logger.debug(
            `[ContextualEnrichment] Enriching ${facts.length} facts with ` +
            `maxChunksPerEntity=${maxChunksPerEntity}, maxChunksPerQuery=${maxChunksPerQuery}`
        );

        // Perform entity-based and query-based enrichment
        const enrichmentResults: EnrichmentResult[] = [];

        if (parallelRetrieval) {
            // Parallel enrichment: entity-based and query-based simultaneously
            const [entityChunks, queryChunks] = await Promise.all([
                this.enrichByEntities(facts, maxChunksPerEntity, minSimilarity),
                this.enrichByQuery(query, maxChunksPerQuery, minSimilarity),
            ]);

            // Combine and deduplicate chunks for each fact
            for (const fact of facts) {
                const entityChunksForFact = entityChunks.get(fact.entity.id) || [];
                const allChunks = [...entityChunksForFact, ...queryChunks];

                // Deduplicate if enabled
                const uniqueChunks = enableDeduplication
                    ? this.deduplicateChunks(allChunks)
                    : allChunks;

                // Filter by minimum similarity and limit
                const filteredChunks = uniqueChunks
                    .filter(chunk => chunk.similarity >= minSimilarity)
                    .slice(0, maxChunksPerEntity);

                // Rank chunks by relevance to the fact
                const rankedChunks = this.rankChunksByRelevance(
                    filteredChunks,
                    fact.entity,
                    query
                );

                enrichmentResults.push({
                    fact,
                    chunks: rankedChunks,
                    enrichmentTime: 0, // Will be calculated from total time
                });
            }
        } else {
            // Sequential enrichment
            for (const fact of facts) {
                const factStartTime = Date.now();

                // Entity-based enrichment
                const entityChunks = await this.enrichEntity(fact.entity, maxChunksPerEntity, minSimilarity);

                // Query-based enrichment (shared across all facts)
                const queryChunks = await this.enrichByQuery(query, maxChunksPerQuery, minSimilarity);

                // Combine chunks
                const allChunks = [...entityChunks, ...queryChunks];

                // Deduplicate if enabled
                const uniqueChunks = enableDeduplication
                    ? this.deduplicateChunks(allChunks)
                    : allChunks;

                // Filter and rank
                const filteredChunks = uniqueChunks
                    .filter(chunk => chunk.similarity >= minSimilarity)
                    .slice(0, maxChunksPerEntity);

                const rankedChunks = this.rankChunksByRelevance(
                    filteredChunks,
                    fact.entity,
                    query
                );

                enrichmentResults.push({
                    fact,
                    chunks: rankedChunks,
                    enrichmentTime: Date.now() - factStartTime,
                });
            }
        }

        const totalTime = Date.now() - startTime;
        const totalChunks = enrichmentResults.reduce((sum, result) => sum + result.chunks.length, 0);
        const averageChunksPerFact = facts.length > 0 ? totalChunks / facts.length : 0;

        logger.info(
            `[ContextualEnrichment] Enriched ${facts.length} facts with ${totalChunks} chunks ` +
            `in ${totalTime}ms (avg ${averageChunksPerFact.toFixed(1)} chunks/fact)`
        );

        return {
            results: enrichmentResults,
            totalChunks,
            totalTime,
            averageChunksPerFact,
        };
    }

    /**
     * Enrich a single entity with relevant vector chunks
     */
    private async enrichEntity(
        entity: BaseEntity,
        maxChunks: number,
        minSimilarity: number
    ): Promise<EnrichedChunk[]> {
        // Build search query from entity information
        const searchQuery = this.buildEntitySearchQuery(entity);

        if (!searchQuery) {
            return [];
        }

        try {
            // Search vector store
            const vectorResults = await this.vectorService.search(searchQuery, maxChunks * 2); // Get more to filter

            // Convert to enriched chunks
            const chunks: EnrichedChunk[] = vectorResults
                .filter(result => result.score >= minSimilarity)
                .map(result => ({
                    id: result.document.id,
                    content: result.document.content,
                    similarity: result.score,
                    relevanceScore: result.score, // Will be recalculated in rankChunksByRelevance
                    metadata: result.document.metadata,
                    matchedEntityId: entity.id,
                    matchedEntityName: entity.name,
                }));

            return chunks.slice(0, maxChunks);
        } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            logger.warn({ 
                error: errorObj
            }, `[ContextualEnrichment] Failed to enrich entity ${entity.id}:`);
            return [];
        }
    }

    /**
     * Enrich multiple entities in parallel (entity-based enrichment)
     */
    private async enrichByEntities(
        facts: FactResult[],
        maxChunksPerEntity: number,
        minSimilarity: number
    ): Promise<Map<string, EnrichedChunk[]>> {
        const entityChunksMap = new Map<string, EnrichedChunk[]>();

        // Enrich all entities in parallel
        const enrichmentPromises = facts.map(async (fact) => {
            const chunks = await this.enrichEntity(fact.entity, maxChunksPerEntity, minSimilarity);
            return { entityId: fact.entity.id, chunks };
        });

        const results = await Promise.all(enrichmentPromises);

        // Build map
        for (const result of results) {
            entityChunksMap.set(result.entityId, result.chunks);
        }

        return entityChunksMap;
    }

    /**
     * Enrich by query keywords (query-based enrichment)
     */
    private async enrichByQuery(
        query: string,
        maxChunks: number,
        minSimilarity: number
    ): Promise<EnrichedChunk[]> {
        if (!query || query.trim().length === 0) {
            return [];
        }

        try {
            // Search vector store with query
            const vectorResults = await this.vectorService.search(query, maxChunks * 2); // Get more to filter

            // Convert to enriched chunks
            const chunks: EnrichedChunk[] = vectorResults
                .filter(result => result.score >= minSimilarity)
                .map(result => ({
                    id: result.document.id,
                    content: result.document.content,
                    similarity: result.score,
                    relevanceScore: result.score,
                    metadata: result.document.metadata,
                }));

            return chunks.slice(0, maxChunks);
        } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            logger.warn({ 
                error: errorObj
            }, `[ContextualEnrichment] Failed to enrich by query:`);
            return [];
        }
    }

    /**
     * Build search query from entity information
     */
    private buildEntitySearchQuery(entity: BaseEntity): string | null {
        const parts: string[] = [];

        // Add entity name
        if (entity.name) {
            parts.push(entity.name);
        }

        // Add description
        if (entity.description) {
            parts.push(entity.description);
        }

        // Add metadata keywords if available
        if (entity.metadata) {
            const metadata = entity.metadata;
            
            // Extract relevant metadata fields
            if (metadata.theme) {
                parts.push(String(metadata.theme));
            }
            if (metadata.location) {
                parts.push(String(metadata.location));
            }
            if (metadata.keywords && Array.isArray(metadata.keywords)) {
                parts.push(...metadata.keywords.map(k => String(k)));
            }
        }

        if (parts.length === 0) {
            return null;
        }

        // Combine parts into search query
        return parts.join(' ');
    }

    /**
     * Deduplicate chunks by content similarity
     */
    private deduplicateChunks(chunks: EnrichedChunk[]): EnrichedChunk[] {
        const seen = new Set<string>();
        const unique: EnrichedChunk[] = [];

        for (const chunk of chunks) {
            // Use content hash or ID to deduplicate
            const key = chunk.id || this.hashContent(chunk.content);

            if (!seen.has(key)) {
                seen.add(key);
                unique.push(chunk);
            }
        }

        return unique;
    }

    /**
     * Simple content hash for deduplication
     */
    private hashContent(content: string): string {
        // Simple hash: use first 100 chars + length
        const preview = content.substring(0, 100).toLowerCase().trim();
        return `${preview}_${content.length}`;
    }

    /**
     * Rank chunks by relevance to entity and query
     */
    private rankChunksByRelevance(
        chunks: EnrichedChunk[],
        entity: BaseEntity,
        query: string
    ): EnrichedChunk[] {
        const queryLower = query.toLowerCase();
        const entityNameLower = entity.name?.toLowerCase() || '';
        const entityDescriptionLower = entity.description?.toLowerCase() || '';

        return chunks.map(chunk => {
            let relevanceScore = chunk.similarity; // Start with vector similarity

            const contentLower = chunk.content.toLowerCase();

            // Boost if entity name appears in chunk
            if (entityNameLower && contentLower.includes(entityNameLower)) {
                relevanceScore += 0.2;
            }

            // Boost if entity description keywords appear
            if (entityDescriptionLower) {
                const descriptionWords = entityDescriptionLower.split(/\s+/).filter(w => w.length > 3);
                const matches = descriptionWords.filter(word => contentLower.includes(word)).length;
                if (matches > 0) {
                    relevanceScore += (matches / descriptionWords.length) * 0.1;
                }
            }

            // Boost if query keywords appear
            const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
            const queryMatches = queryWords.filter(word => contentLower.includes(word)).length;
            if (queryMatches > 0) {
                relevanceScore += (queryMatches / queryWords.length) * 0.15;
            }

            // Normalize to [0, 1]
            relevanceScore = Math.min(1.0, relevanceScore);

            return {
                ...chunk,
                relevanceScore,
            };
        }).sort((a, b) => b.relevanceScore - a.relevanceScore); // Sort by relevance descending
    }
}

