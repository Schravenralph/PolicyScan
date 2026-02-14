/**
 * Fact-First Retrieval Service
 * Implements GraphRAG pattern: queries knowledge graph first for direct factual answers
 * before enriching with vector search. KG is the authoritative fact table.
 */

import { KnowledgeGraphService } from '../knowledge-graph/core/KnowledgeGraph.js';
import { BaseEntity, RelationType } from '../../domain/ontology.js';
import { QueryParser, ParsedQuery, QueryType } from './QueryParser.js';
import { QueryPlanner, QueryPlan } from './QueryPlanner.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { logger } from '../../utils/logger.js';

export interface FactResult {
    entity: BaseEntity;
    relationships?: Array<{
        sourceId: string;
        targetId: string;
        type: RelationType;
    }>;
    provenance?: {
        sourceUrls?: string[];
        extractionTimestamp?: string;
    };
    relevanceScore?: number;
}

export interface FactFirstRetrievalResult {
    facts: FactResult[];
    queryType: QueryType;
    queryPlan: QueryPlan;
    queryTime: number;
    totalFacts: number;
}

/**
 * Fact-First Retrieval Service
 * Queries the knowledge graph first for direct factual answers
 */
export class FactFirstRetrievalService {
    private queryParser: QueryParser;
    private queryPlanner: QueryPlanner;

    constructor(private kgService: KnowledgeGraphService) {
        this.queryParser = new QueryParser();
        this.queryPlanner = new QueryPlanner(kgService);
    }

    /**
     * Query the knowledge graph for facts matching the query
     */
    async query(query: string, options?: {
        maxResults?: number;
        maxHops?: number;
        relationType?: RelationType;
    }): Promise<FactFirstRetrievalResult> {
        const startTime = Date.now();

        // Check if fact-first retrieval is enabled (using GraphRAG retrieval flag)
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_GRAPHRAG_RETRIEVAL_ENABLED, false)) {
            logger.debug('[FactFirstRetrieval] Feature flag disabled, returning empty results');
            return {
                facts: [],
                queryType: QueryType.ENTITY,
                queryPlan: {
                    strategy: 'direct',
                    maxHops: 0,
                    description: 'Feature disabled'
                },
                queryTime: Date.now() - startTime,
                totalFacts: 0
            };
        }

        // Parse the query
        const parsedQuery = this.queryParser.parse(query);
        logger.debug(`[FactFirstRetrieval] Parsed query: ${JSON.stringify(parsedQuery)}`);

        // Plan the query
        const queryPlan = await this.queryPlanner.planQuery(parsedQuery);
        logger.debug(`[FactFirstRetrieval] Query plan: ${JSON.stringify(queryPlan)}`);

        // Execute the query based on type
        let facts: FactResult[] = [];

        switch (parsedQuery.type) {
            case QueryType.FACT:
                facts = await this.executeFactQuery(parsedQuery, queryPlan, options);
                break;
            case QueryType.ENTITY:
                facts = await this.executeEntityQuery(parsedQuery, queryPlan, options);
                break;
            case QueryType.RELATIONSHIP:
                facts = await this.executeRelationshipQuery(parsedQuery, queryPlan, options);
                break;
        }

        // Add provenance and relationships to results
        const enrichedFacts = await this.enrichFacts(facts, parsedQuery);

        // Rank results by relevance
        const rankedFacts = this.rankFacts(enrichedFacts, parsedQuery);

        // Limit results
        const maxResults = options?.maxResults || 50;
        const limitedFacts = rankedFacts.slice(0, maxResults);

        const queryTime = Date.now() - startTime;
        logger.info(`[FactFirstRetrieval] Query completed in ${queryTime}ms, found ${limitedFacts.length} facts`);

        return {
            facts: limitedFacts,
            queryType: parsedQuery.type,
            queryPlan,
            queryTime,
            totalFacts: limitedFacts.length
        };
    }

    /**
     * Execute a fact query (direct factual questions)
     */
    private async executeFactQuery(
        parsedQuery: ParsedQuery,
        _queryPlan: QueryPlan,
        _options?: { maxHops?: number; relationType?: RelationType }
    ): Promise<FactResult[]> {
        // Search for entities matching keywords
        const entities = await this.kgService.searchEntities(parsedQuery.keywords);

        // If entity type is specified, filter by type
        let filteredEntities = entities;
        if (parsedQuery.entityTypes && parsedQuery.entityTypes.length > 0) {
            filteredEntities = entities.filter(e => parsedQuery.entityTypes!.includes(e.type));
        }

        // If location is specified, filter by location
        if (parsedQuery.location) {
            filteredEntities = filteredEntities.filter(e => {
                const name = e.name?.toLowerCase() || '';
                const description = e.description?.toLowerCase() || '';
                const metadata = JSON.stringify(e.metadata || {}).toLowerCase();
                return name.includes(parsedQuery.location!.toLowerCase()) ||
                       description.includes(parsedQuery.location!.toLowerCase()) ||
                       metadata.includes(parsedQuery.location!.toLowerCase());
            });
        }

        // Convert to FactResult format
        return filteredEntities.map(entity => ({
            entity,
            relevanceScore: this.calculateRelevanceScore(entity, parsedQuery)
        }));
    }

    /**
     * Execute an entity query (find entities)
     */
    private async executeEntityQuery(
        parsedQuery: ParsedQuery,
        _queryPlan: QueryPlan,
        _options?: { maxResults?: number }
    ): Promise<FactResult[]> {
        // Use keyword search
        let entities: BaseEntity[] = [];

        if (parsedQuery.keywords.length > 0) {
            entities = await this.kgService.searchEntities(parsedQuery.keywords);
        } else if (parsedQuery.entityTypes && parsedQuery.entityTypes.length > 0) {
            // If no keywords but entity type specified, get all entities of that type
            entities = await this.kgService.getNodesByType(parsedQuery.entityTypes[0]);
        } else {
            // Fallback: search with all words from query
            const words = parsedQuery.originalQuery.split(/\s+/).filter(w => w.length > 2);
            entities = await this.kgService.searchEntities(words);
        }

        // Filter by entity type if specified
        if (parsedQuery.entityTypes && parsedQuery.entityTypes.length > 0) {
            entities = entities.filter(e => parsedQuery.entityTypes!.includes(e.type));
        }

        // Filter by location if specified
        if (parsedQuery.location) {
            entities = entities.filter(e => {
                const name = e.name?.toLowerCase() || '';
                const description = e.description?.toLowerCase() || '';
                const metadata = JSON.stringify(e.metadata || {}).toLowerCase();
                return name.includes(parsedQuery.location!.toLowerCase()) ||
                       description.includes(parsedQuery.location!.toLowerCase()) ||
                       metadata.includes(parsedQuery.location!.toLowerCase());
            });
        }

        return entities.map(entity => ({
            entity,
            relevanceScore: this.calculateRelevanceScore(entity, parsedQuery)
        }));
    }

    /**
     * Execute a relationship query (find relationships)
     */
    private async executeRelationshipQuery(
        parsedQuery: ParsedQuery,
        queryPlan: QueryPlan,
        options?: { maxHops?: number; relationType?: RelationType }
    ): Promise<FactResult[]> {
        // First, find source entities matching keywords
        const sourceEntities = await this.kgService.searchEntities(parsedQuery.keywords);

        if (sourceEntities.length === 0) {
            return [];
        }

        // Get relationships for each source entity
        const facts: FactResult[] = [];
        const maxHops = options?.maxHops || queryPlan.maxHops || 2;
        const relationType = options?.relationType || queryPlan.relationType;

        for (const sourceEntity of sourceEntities.slice(0, 10)) { // Limit to first 10 sources
            // Get neighbors using traversal
            const neighbors = await this.kgService.getNeighbors(
                sourceEntity.id,
                relationType,
                maxHops
            );

            // Get relationships for this entity
            const relationships = await this.kgService.getRelationshipsForEntity(sourceEntity.id);

            // Create fact results for each neighbor
            for (const neighbor of neighbors) {
                const relevantRelationships = relationships.filter(
                    rel => rel.targetId === neighbor.id
                );

                facts.push({
                    entity: neighbor,
                    relationships: relevantRelationships,
                    relevanceScore: this.calculateRelevanceScore(neighbor, parsedQuery)
                });
            }
        }

        return facts;
    }

    /**
     * Enrich facts with provenance and relationships
     */
    private async enrichFacts(facts: FactResult[], _parsedQuery: ParsedQuery): Promise<FactResult[]> {
        return Promise.all(facts.map(async (fact) => {
            // Get relationships if not already included
            if (!fact.relationships) {
                const relationships = await this.kgService.getRelationshipsForEntity(fact.entity.id);
                fact.relationships = relationships;
            }

            // Extract provenance from metadata
            if (fact.entity.metadata) {
                const metadata = fact.entity.metadata as Record<string, unknown>;
                const sourceUrls = Array.isArray(metadata.sourceUrls) 
                    ? (metadata.sourceUrls as unknown[]).filter((url): url is string => typeof url === 'string')
                    : undefined;
                const url = typeof metadata.url === 'string' ? metadata.url : undefined;
                fact.provenance = {
                    sourceUrls: sourceUrls || (url ? [url] : undefined),
                    extractionTimestamp: typeof metadata.extractionTimestamp === 'string' 
                        ? metadata.extractionTimestamp 
                        : (metadata.createdAt instanceof Date ? metadata.createdAt.toISOString() : undefined)
                };
            }

            return fact;
        }));
    }

    /**
     * Rank facts by relevance to the query
     */
    private rankFacts(facts: FactResult[], parsedQuery: ParsedQuery): FactResult[] {
        // Calculate relevance scores if not already calculated
        const scoredFacts = facts.map(fact => ({
            ...fact,
            relevanceScore: fact.relevanceScore || this.calculateRelevanceScore(fact.entity, parsedQuery)
        }));

        // Sort by relevance score (descending)
        return scoredFacts.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    }

    /**
     * Calculate relevance score for an entity based on the query
     */
    private calculateRelevanceScore(entity: BaseEntity, parsedQuery: ParsedQuery): number {
        let score = 0.5; // Base score

        // Boost if entity type matches
        if (parsedQuery.entityTypes && parsedQuery.entityTypes.includes(entity.type)) {
            score += 0.2;
        }

        // Boost if keywords match in name (higher weight)
        const name = entity.name?.toLowerCase() || '';
        const description = entity.description?.toLowerCase() || '';
        
        for (const keyword of parsedQuery.keywords) {
            const keywordLower = keyword.toLowerCase();
            if (name.includes(keywordLower)) {
                score += 0.3; // Name match is more important
            } else if (description.includes(keywordLower)) {
                score += 0.1; // Description match
            }
        }

        // Boost if location matches
        if (parsedQuery.location) {
            const locationLower = parsedQuery.location.toLowerCase();
            if (name.includes(locationLower) || description.includes(locationLower)) {
                score += 0.2;
            }
        }

        // Normalize to [0, 1]
        return Math.min(1.0, score);
    }
}

