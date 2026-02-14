import { VectorService } from './VectorService.js';
import { knowledgeGraphService, KnowledgeGraphService } from '../knowledge-graph/core/KnowledgeGraph.js';
import { GraphDBKnowledgeGraphService } from '../knowledge-graph/core/GraphDBKnowledgeGraphService.js';
import { BaseEntity, RelationType } from '../../domain/ontology.js';
import { RankingService, RankingFactors } from './RankingService.js';
import { RerankerService } from '../retrieval/RerankerService.js';
import { ScrapedDocument, DocumentType } from '../infrastructure/types.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { GraphDBGraphRAGRetrievalService } from '../graphrag/GraphDBGraphRAGRetrievalService.js';
import { getGraphDBClient } from '../../config/graphdb.js';
import { FactFirstRetrievalService } from '../graphrag/FactFirstRetrievalService.js';
import { HybridScorer } from '../graphrag/HybridScorer.js';
import { GraphDBGraphTraversalService } from '../graphrag/GraphDBGraphTraversalService.js';
import { ContextualEnrichmentService } from '../graphrag/ContextualEnrichmentService.js';
import { logger } from '../../utils/logger.js';
import { queryCache } from './QueryCache.js';

// Get KG service lazily - create instance without connecting (will connect on first use)
function getDefaultKGService(): GraphDBKnowledgeGraphService {
    // Create service instance without client - it will connect lazily when initialized
    // This avoids trying to get GraphDB client at module load time
    return new GraphDBKnowledgeGraphService();
}

export interface HybridSearchResult {
    documents: Array<{
        id: string;
        content: string;
        score: number;
        metadata: Record<string, unknown>;
        uri?: string;              // Schema.org URI
        sourceUrl?: string;        // Web page link
        rankScore?: number;        // Final ranking score
        rankingFactors?: RankingFactors; // Breakdown of ranking
    }>;
    relatedEntities: BaseEntity[];
    summary?: string;
}

export interface SearchFilters {
    location?: string;              // Municipality or location name
    jurisdiction?: 'national' | 'provincial' | 'municipal';  // Jurisdiction level
    validFrom?: Date;
    validTo?: Date;
    areaId?: string;
    areaIds?: string[];
}

export class HybridSearchService {
    private vectorService: VectorService;
    private rankingService: RankingService;
    private rerankerService: RerankerService | null;
    private kgService: typeof knowledgeGraphService | GraphDBKnowledgeGraphService;
    private graphRAGRetrievalService: GraphDBGraphRAGRetrievalService | null = null;

    constructor(
        kgService?: GraphDBKnowledgeGraphService,
        vectorService?: VectorService,
        rankingService?: RankingService,
        rerankerService?: RerankerService | null
    ) {
        this.kgService = kgService || getDefaultKGService();
        this.vectorService = vectorService || new VectorService();
        // RankingService expects KnowledgeGraphService, but we may have GraphDBKnowledgeGraphService
        // Both implement similar interfaces, so we cast if needed
        this.rankingService = rankingService || new RankingService(
            kgService as unknown as KnowledgeGraphService,
            {},
            this.vectorService
        );
        
        // Initialize re-ranker service if enabled
        // This provides LLM-based semantic re-ranking for improved relevance
        // See: docs/improvements/02-llm-reranker.md
        try {
            this.rerankerService = rerankerService !== undefined 
                ? rerankerService 
                : new RerankerService();
            
            if (this.rerankerService && this.rerankerService.isEnabled()) {
                console.log('[HybridSearchService] LLM re-ranker enabled for semantic re-ranking');
            }
        } catch (error) {
            console.warn('[HybridSearchService] Failed to initialize re-ranker:', error);
            this.rerankerService = null;
        }
    }

    /**
     * Lazy initialization of GraphRAGRetrievalService
     * Only initializes if feature flag is enabled and GraphDB is available
     */
    private async getGraphRAGRetrievalService(): Promise<GraphDBGraphRAGRetrievalService | null> {
        // Check if GraphRAG retrieval is enabled
        // Use try-catch to handle cases where FeatureFlag is not mocked in tests
        let isGraphRAGEnabled = false;
        try {
            isGraphRAGEnabled = FeatureFlag.isEnabled(KGFeatureFlag.KG_GRAPHRAG_RETRIEVAL_ENABLED, false);
        } catch (error) {
            // If FeatureFlag check fails (e.g., in tests without mocking), return null to use basic KG search
            logger.debug({ error }, '[HybridSearchService] FeatureFlag check failed in getGraphRAGRetrievalService, returning null');
            return null;
        }

        if (!isGraphRAGEnabled) {
            return null;
        }

        // GraphRAG works with GraphDB
        if (!(this.kgService instanceof GraphDBKnowledgeGraphService)) {
            logger.debug('[HybridSearchService] GraphRAG requires GraphDB backend');
            return null;
        }

        // Lazy initialization
        if (!this.graphRAGRetrievalService) {
            try {
                const graphdbClient = getGraphDBClient();
                if (!graphdbClient) {
                    logger.warn('[HybridSearchService] GraphDB client not available for GraphRAG');
                    return null;
                }

                const kgService = this.kgService as GraphDBKnowledgeGraphService;
                const hybridScorer = new HybridScorer(this.vectorService);
                const contextualEnrichmentService = new ContextualEnrichmentService(this.vectorService);

                this.graphRAGRetrievalService = new GraphDBGraphRAGRetrievalService(
                    kgService,
                    this.vectorService,
                    hybridScorer,
                    contextualEnrichmentService
                );

                logger.info('[HybridSearchService] GraphRAG retrieval service initialized');
            } catch (error) {
                logger.warn({ error }, '[HybridSearchService] Failed to initialize GraphRAG retrieval service');
                return null;
            }
        }

        return this.graphRAGRetrievalService;
    }

    async init() {
        await this.vectorService.init();
    }

    /**
     * Normalizes location names for comparison (handles variations like "Gemeente Amsterdam" vs "Amsterdam")
     */
    private normalizeLocation(location: string): string {
        return location
            .toLowerCase()
            .replace(/^(gemeente|provincie|waterschap)\s+/i, '')
            .trim();
    }

    /**
     * Checks if a document matches the location filter
     */
    private matchesLocation(doc: { metadata?: Record<string, unknown>; entity?: BaseEntity }, location: string): boolean {
        if (!location) return true;

        const normalizedLocation = this.normalizeLocation(location);
        const metadata = doc.metadata || {};
        const entity = doc.entity;

        // Check various metadata fields for location
        const locationFields = [
            metadata.jurisdiction,
            metadata.website_titel,
            metadata.source,
            entity?.metadata?.jurisdiction,
        ];

        return locationFields.some(field => {
            if (!field) return false;
            return this.normalizeLocation(String(field)).includes(normalizedLocation) ||
                   normalizedLocation.includes(this.normalizeLocation(String(field)));
        });
    }

    /**
     * Checks if a document matches the jurisdiction filter
     */
    private matchesJurisdiction(doc: { metadata?: Record<string, unknown>; entity?: BaseEntity }, jurisdiction: string): boolean {
        if (!jurisdiction) return true;

        const metadata = doc.metadata || {};
        const entity = doc.entity;
        const jurisdictionLower = jurisdiction.toLowerCase();

        // Check metadata for jurisdiction indicators
        const jurisdictionStr = String(metadata.jurisdiction || entity?.metadata?.jurisdiction || '').toLowerCase();
        
        if (jurisdictionLower === 'municipal') {
            return jurisdictionStr.includes('gemeente') || jurisdictionStr.includes('municipal');
        } else if (jurisdictionLower === 'provincial') {
            return jurisdictionStr.includes('provincie') || jurisdictionStr.includes('provincial');
        } else if (jurisdictionLower === 'national') {
            return jurisdictionStr.includes('rijk') || 
                   jurisdictionStr.includes('rijksoverheid') || 
                   jurisdictionStr.includes('national') ||
                   (!jurisdictionStr.includes('gemeente') && 
                    !jurisdictionStr.includes('provincie') && 
                    !jurisdictionStr.includes('waterschap'));
        }

        return true;
    }

    /**
     * Checks if a document matches the temporal filters
     */
    private matchesTemporal(doc: { metadata?: Record<string, unknown> }, validFrom?: Date, validTo?: Date): boolean {
        if (!validFrom && !validTo) return true;

        const metadata = doc.metadata || {};
        // Check for validity dates in metadata
        const docValidFromStr = (metadata.validFrom as string) || (metadata.dates as any)?.validFrom;
        const docValidToStr = (metadata.validTo as string) || (metadata.dates as any)?.validTo;

        const docValidFrom = docValidFromStr ? new Date(docValidFromStr) : null;
        const docValidTo = docValidToStr ? new Date(docValidToStr) : null;

        if (validFrom) {
            if (docValidFrom && docValidFrom < validFrom) return false;
        }

        if (validTo) {
             if (docValidTo && docValidTo > validTo) return false;
        }

        return true;
    }

    /**
     * Checks if a document matches the area filter
     */
    private matchesArea(doc: { metadata?: Record<string, unknown> }, areaId?: string, areaIds?: string[]): boolean {
        if (!areaId && (!areaIds || areaIds.length === 0)) return true;

        const metadata = doc.metadata || {};
        // Check 'spatialMetadata.areaId' or flat 'areaId'
        const docAreaId = (metadata.areaId as string) || (metadata.spatialMetadata as any)?.areaId;

        if (areaId && docAreaId !== areaId) return false;
        if (areaIds && areaIds.length > 0 && !areaIds.includes(docAreaId)) return false;

        return true;
    }

    /**
     * Performs a hybrid search using GraphRAG when enabled, otherwise falls back to basic KG search.
     * Results are ranked using a combination of vector score, graph relevance, and recency.
     * @param query The user's search query.
     * @param limit Max number of document results.
     * @param filters Optional filters for location and jurisdiction, or includeRankingFactors for backwards compatibility.
     * @param includeRankingFactors Whether to include detailed ranking breakdown (for debugging).
     */
    async search(
        query: string,
        limit: number = 5,
        filtersOrIncludeRanking?: SearchFilters | boolean,
        includeRankingFactors?: boolean
    ): Promise<HybridSearchResult> {
        // Handle backwards compatibility: old signature was (query, limit, includeRankingFactors)
        let filters: SearchFilters | undefined;
        let includeRanking: boolean;
        
        if (typeof filtersOrIncludeRanking === 'boolean') {
            // Old signature: (query, limit, includeRankingFactors)
            filters = undefined;
            includeRanking = filtersOrIncludeRanking;
        } else {
            // New signature: (query, limit, filters, includeRankingFactors)
            filters = filtersOrIncludeRanking;
            includeRanking = includeRankingFactors || false;
        }

        // Optimize cache hit rate by normalizing query and filters
        // Empty filters should be treated as undefined to avoid cache fragmentation
        let effectiveFilters = filters;
        if (filters && Object.keys(filters).length === 0) {
            effectiveFilters = undefined;
        } else if (filters && Object.values(filters).every(v => v === undefined)) {
            effectiveFilters = undefined;
        }

        // Normalize query for cache key (case-insensitive, trimmed)
        const normalizedQuery = query.toLowerCase().trim();

        // Generate cache key
        const cacheKey = queryCache.generateKey({
            query: normalizedQuery,
            limit,
            filters: effectiveFilters,
            includeRanking
        });

        // Try to get from cache
        const cachedResult = await queryCache.get<HybridSearchResult>(cacheKey);
        if (cachedResult) {
            return cachedResult;
        }

        // Check if GraphRAG retrieval is enabled
        // Only attempt GraphRAG if the feature flag is explicitly enabled
        // Use try-catch to handle cases where FeatureFlag is not mocked in tests
        let isGraphRAGEnabled = false;
        try {
            isGraphRAGEnabled = FeatureFlag.isEnabled(KGFeatureFlag.KG_GRAPHRAG_RETRIEVAL_ENABLED, false);
        } catch (error) {
            // If FeatureFlag check fails (e.g., in tests without mocking), default to basic KG search
            logger.debug({ error }, '[HybridSearchService] FeatureFlag check failed, using basic KG search');
            isGraphRAGEnabled = false;
        }

        if (isGraphRAGEnabled) {
            try {
                const graphRAGService = await this.getGraphRAGRetrievalService();
                if (graphRAGService) {
                    const result = await this.searchWithGraphRAG(query, limit, effectiveFilters, includeRanking);
                    queryCache.set(cacheKey, result);
                    return result;
                }
            } catch (error) {
                // Fall through to basic KG search if GraphRAG service initialization fails
                logger.debug({ error }, '[HybridSearchService] GraphRAG service unavailable, falling back to basic KG search');
            }
        }
        
        // Use basic KG search (either flag disabled or GraphRAG unavailable)
        const result = await this.searchWithBasicKG(query, limit, effectiveFilters, includeRanking);

        // Store in cache
        queryCache.set(cacheKey, result);

        return result;
    }

    /**
     * Performs search using GraphRAG retrieval service (fact-first retrieval with contextual enrichment).
     * @param query The user's search query.
     * @param limit Max number of document results.
     * @param filters Optional filters for location and jurisdiction.
     * @param includeRanking Whether to include detailed ranking breakdown.
     */
    private async searchWithGraphRAG(
        query: string,
        limit: number,
        filters?: SearchFilters,
        includeRanking?: boolean
    ): Promise<HybridSearchResult> {
        const graphRAGService = await this.getGraphRAGRetrievalService();
        if (!graphRAGService) {
            // Fallback to basic KG search if GraphRAG service is not available
            logger.warn('[HybridSearchService] GraphRAG service not available, falling back to basic KG search');
            return await this.searchWithBasicKG(query, limit, filters, includeRanking);
        }

        try {
            // Execute GraphRAG query
            const graphRAGResult = await graphRAGService.query(query, {
                maxResults: limit,
                strategy: 'fact-first',
            });

            // Transform GraphRAG results to HybridSearchResult format
            const documents: HybridSearchResult['documents'] = [];
            const relatedEntities: BaseEntity[] = [];
            const seenEntityIds = new Set<string>();
            const seenDocumentIds = new Set<string>();

            for (const enrichedResult of graphRAGResult.results) {
                const { fact, vectorChunks, hybridScore } = enrichedResult;

                // Add entity to related entities (deduplicated)
                if (!seenEntityIds.has(fact.entity.id)) {
                    relatedEntities.push(fact.entity);
                    seenEntityIds.add(fact.entity.id);
                }

                // Create documents from vector chunks if available, otherwise from entity
                if (vectorChunks && vectorChunks.length > 0) {
                    for (const chunk of vectorChunks) {
                        if (seenDocumentIds.has(chunk.id)) continue;
                        seenDocumentIds.add(chunk.id);

                        documents.push({
                            id: chunk.id,
                            content: chunk.content,
                            score: chunk.similarity,
                            metadata: {
                                ...chunk.metadata,
                                entity: fact.entity,
                                factRelevanceScore: fact.relevanceScore,
                            },
                            uri: fact.entity.uri,
                            sourceUrl: fact.provenance?.sourceUrls?.[0],
                            rankScore: hybridScore.finalScore,
                            rankingFactors: includeRanking ? {
                                vectorScore: chunk.similarity,
                                graphRelevance: fact.relevanceScore || 0,
                                recencyScore: 0.5, // Default recency score
                                metadataScore: 0.5, // Default metadata score
                                finalScore: hybridScore.finalScore,
                            } : undefined,
                        });
                    }
                } else {
                    // No vector chunks, create document from entity metadata
                    const entityContent = (fact.entity.metadata?.description as string | undefined) || 
                                         (fact.entity.metadata?.name as string | undefined) || 
                                         (fact.entity.name as string | undefined) || 
                                         '';
                    
                    if (!seenDocumentIds.has(fact.entity.id)) {
                        seenDocumentIds.add(fact.entity.id);
                        documents.push({
                            id: fact.entity.id,
                            content: String(entityContent),
                            score: fact.relevanceScore || 0,
                            metadata: {
                                entity: fact.entity,
                                factRelevanceScore: fact.relevanceScore,
                            },
                            uri: fact.entity.uri,
                            sourceUrl: fact.provenance?.sourceUrls?.[0],
                            rankScore: hybridScore.finalScore,
                            rankingFactors: includeRanking ? {
                                vectorScore: 0, // No vector score for entity-only results
                                graphRelevance: fact.relevanceScore || 0,
                                recencyScore: 0.5, // Default recency score
                                metadataScore: 0.5, // Default metadata score
                                finalScore: hybridScore.finalScore,
                            } : undefined,
                        });
                    }
                }
            }

            // Apply filters if provided
            let filteredDocuments = documents;
            if (filters) {
                filteredDocuments = documents.filter(doc => {
                    if (filters.location && !this.matchesLocation(doc, filters.location)) {
                        return false;
                    }
                    if (filters.jurisdiction && !this.matchesJurisdiction(doc, filters.jurisdiction)) {
                        return false;
                    }
                    if ((filters.validFrom || filters.validTo) && !this.matchesTemporal(doc, filters.validFrom, filters.validTo)) {
                        return false;
                    }
                    if ((filters.areaId || (filters.areaIds && filters.areaIds.length > 0)) && !this.matchesArea(doc, filters.areaId, filters.areaIds)) {
                        return false;
                    }
                    return true;
                });
            }

            // Sort by rank score and limit results
            const sortedDocuments = filteredDocuments
                .sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0))
                .slice(0, limit);

            return {
                documents: sortedDocuments,
                relatedEntities: relatedEntities.slice(0, 10),
            };
        } catch (error) {
            logger.error({ error, query }, '[HybridSearchService] GraphRAG search failed, falling back to basic KG search');
            // Fallback to basic KG search on error
            return await this.searchWithBasicKG(query, limit, filters, includeRanking);
        }
    }

    /**
     * Performs search using basic KG entity matching (original implementation).
     * @param query The user's search query.
     * @param limit Max number of document results.
     * @param filters Optional filters for location and jurisdiction.
     * @param includeRanking Whether to include detailed ranking breakdown.
     */
    private async searchWithBasicKG(
        query: string,
        limit: number,
        filters?: SearchFilters,
        includeRanking?: boolean
    ): Promise<HybridSearchResult> {
        // Check if KG retrieval is enabled via feature flags
        // Use try-catch to handle cases where FeatureFlag is not mocked in tests
        let isKGRetrievalEnabled = true; // Default to enabled for backward compatibility
        try {
            isKGRetrievalEnabled = FeatureFlag.isRetrievalEnabled();
        } catch (error) {
            // If FeatureFlag check fails (e.g., in tests without mocking), default to enabled
            logger.debug({ error }, '[HybridSearchService] FeatureFlag.isRetrievalEnabled() failed, defaulting to enabled');
            isKGRetrievalEnabled = true;
        }

        // Ensure knowledge graph service is ready (GraphDB backend is lazy)
        if (isKGRetrievalEnabled && 'initialize' in this.kgService && typeof this.kgService.initialize === 'function') {
            try {
                await this.kgService.initialize();
            } catch (error) {
                logger.warn({ error }, '[HybridSearchService] Failed to initialize Knowledge Graph service, disabling KG retrieval for this request');
                isKGRetrievalEnabled = false;
            }
        }

        // 1. Vector Search (Semantic Text)
        // Construct filter predicate for pre-filtering in VectorService
        let vectorFilter: ((doc: { metadata: Record<string, unknown> }) => boolean) | undefined;
        if (filters) {
            vectorFilter = (doc) => {
                // Cast to match VectorDocument structure expected by VectorService
                const typedDoc = doc as unknown as { metadata?: Record<string, unknown>; entity?: BaseEntity };

                if (filters.location && !this.matchesLocation(typedDoc, filters.location)) return false;
                if (filters.jurisdiction && !this.matchesJurisdiction(typedDoc, filters.jurisdiction)) return false;
                if ((filters.validFrom || filters.validTo) && !this.matchesTemporal(typedDoc, filters.validFrom, filters.validTo)) return false;
                if ((filters.areaId || (filters.areaIds && filters.areaIds.length > 0)) && !this.matchesArea(typedDoc, filters.areaId, filters.areaIds)) return false;
                return true;
            };
        }

        const vectorResults = await this.vectorService.search(query, limit * 2, vectorFilter); // Get more for ranking

        // 2. Knowledge Graph Search (Entity Matching) - Only if KG retrieval is enabled
        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);
        const relatedEntities: BaseEntity[] = [];
        const seenIds = new Set<string>();
        
        if (isKGRetrievalEnabled) {
            // Use Cypher query for efficient entity matching
            const matchingNodes = await this.kgService.searchEntities(terms);
            
            for (const node of matchingNodes) {
                if (seenIds.has(node.id)) continue;
                relatedEntities.push(node);
                seenIds.add(node.id);
            }

            // 3. Expand Graph Results (only if reasoning is enabled)
            const isKGReasoningEnabled = FeatureFlag.isReasoningEnabled();
            if (isKGReasoningEnabled) {
                // Batch retrieval of neighbors for Regulation entities to avoid N+1 query problem
                const regulationIds: string[] = [];
                for (const entity of relatedEntities) {
                    if (entity.type === 'Regulation') {
                        regulationIds.push(entity.id);
                    }
                }

                if (regulationIds.length > 0) {
                    try {
                        // Use type assertion if getNeighborsBatch is not yet in the type definition of kgService union
                        // but we know it's implemented in both underlying services
                        const docs = await this.kgService.getNeighborsBatch(regulationIds, RelationType.DEFINED_IN);
                        docs.forEach(doc => {
                            if (!seenIds.has(doc.id)) {
                                relatedEntities.push(doc);
                                seenIds.add(doc.id);
                            }
                        });
                    } catch (error) {
                        logger.warn({ error, regulationIdsCount: regulationIds.length }, '[HybridSearchService] Failed to batch get neighbors, continuing without expansion');
                    }
                }
            }
        }

        // 4. Calculate ranking scores and enrich documents
        // Batch retrieval of entities from knowledge graph
        let entities: (BaseEntity | undefined)[] = [];
        if (isKGRetrievalEnabled && vectorResults.length > 0) {
            try {
                const docIds = vectorResults.map(res => res.document.id);
                entities = await this.kgService.getNodes(docIds);
            } catch (error) {
                logger.warn({ error }, '[HybridSearchService] Failed to batch get entities from KG, continuing without entities');
                entities = new Array(vectorResults.length).fill(undefined);
            }
        }

        const documentsWithRanking = await Promise.all(vectorResults.map(async (res, index) => {
            // Get entity from batch results (only if KG retrieval is enabled)
            const entity = isKGRetrievalEnabled ? entities[index] : undefined;

            // Calculate ranking (will use entity if available, otherwise vector-only)
            let rankingFactors;
            try {
                rankingFactors = await this.rankingService.calculateRankScore(
                    res.score,
                    entity,
                    res.document.metadata
                );
            } catch (error) {
                logger.warn({ error, documentId: res.document.id }, '[HybridSearchService] Ranking service failed, using default scores');
                rankingFactors = {
                    finalScore: res.score,
                    vectorScore: res.score,
                    graphRelevance: 0,
                    recencyScore: 0,
                    metadataScore: 0
                };
            }

            return {
                id: res.document.id,
                content: res.document.content,
                score: res.score,
                metadata: { ...res.document.metadata, entity: entity || undefined },
                entity: entity || undefined,
                uri: entity?.uri,
                sourceUrl: res.document.metadata?.sourceUrl || res.document.metadata?.url,
                rankScore: rankingFactors.finalScore,
                rankingFactors: includeRanking ? rankingFactors : undefined
            };
        }));

        // 5. Apply filters (location and jurisdiction)
        let filteredDocuments = documentsWithRanking;
        if (filters) {
            filteredDocuments = documentsWithRanking.filter(doc => {
                if (filters.location && !this.matchesLocation(doc, filters.location)) {
                    return false;
                }
                if (filters.jurisdiction && !this.matchesJurisdiction(doc, filters.jurisdiction)) {
                    return false;
                }
                if ((filters.validFrom || filters.validTo) && !this.matchesTemporal(doc, filters.validFrom, filters.validTo)) {
                    return false;
                }
                if ((filters.areaId || (filters.areaIds && filters.areaIds.length > 0)) && !this.matchesArea(doc, filters.areaId, filters.areaIds)) {
                    return false;
                }
                return true;
            });
        }

        // 6. Sort by rank score and deduplicate by URI
        const sortedDocuments = filteredDocuments
            .sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));

        // Deduplicate by URI (keep highest ranked) and remove internal entity field
        const seenUris = new Set<string>();
        const deduplicatedDocuments = sortedDocuments
            .filter(doc => {
                if (doc.uri && seenUris.has(doc.uri)) {
                    return false;
                }
                if (doc.uri) {
                    seenUris.add(doc.uri);
                }
                return true;
            })
            .map((doc) => {
                const { entity: _entity, ...rest } = doc;
                return rest as Omit<typeof doc, 'entity'>;
            }); // Remove entity from response

        // 7. Apply LLM Re-ranking (if enabled)
        // This step uses OpenAI GPT to semantically re-rank the top N documents
        // for improved relevance. The re-ranker understands context and can distinguish
        // deep policy discussions from passing mentions.
        // 
        // How it works:
        // 1. Takes top N documents (default: 20) from initial ranking
        // 2. Converts to ScrapedDocument format for re-ranker
        // 3. Uses RerankerService to get LLM-based relevance scores
        // 4. Combines hybrid rankScore with rerankerScore: finalScore = 0.6 * rankScore + 0.4 * rerankerScore
        // 5. Re-sorts documents by final combined score
        //
        // Configuration: Set RERANKER_ENABLED=true and OPENAI_API_KEY in environment
        // See: docs/improvements/02-llm-reranker.md for details
        let finalRankedDocuments = deduplicatedDocuments;
        
        if (this.rerankerService?.isEnabled() && deduplicatedDocuments.length > 0) {
            try {
                // Convert to ScrapedDocument format for re-ranker
                const documentsForReranking: Array<ScrapedDocument & { relevanceScore?: number; semanticSimilarity?: number }> = 
                    deduplicatedDocuments.map(doc => {
                        const metadata = (doc.metadata || {}) as Record<string, unknown>;
                        const sourceUrl = typeof doc.sourceUrl === 'string' ? doc.sourceUrl : (typeof doc.uri === 'string' ? doc.uri : doc.id);
                        return {
                            titel: (metadata.title as string) || (metadata.titel as string) || doc.id,
                            url: sourceUrl,
                            website_url: typeof doc.sourceUrl === 'string' ? doc.sourceUrl : '',
                            website_titel: (metadata.website_titel as string) || (metadata.source as string) || '',
                            samenvatting: (metadata.samenvatting as string) || doc.content.substring(0, 500) || '',
                            type_document: (metadata.type_document as DocumentType) || 'Webpagina',
                            publicatiedatum: (metadata.publicatiedatum as string) || (metadata.date as string) || null,
                            // Store original rankScore as relevanceScore for re-ranker
                            relevanceScore: doc.rankScore ? doc.rankScore * 20 : undefined, // Convert 0-1 to 0-20 scale
                            semanticSimilarity: doc.score // Vector similarity score
                        };
                    });

                // Apply re-ranking to top N documents
                const rerankedResults = await this.rerankerService.rerank(
                    documentsForReranking,
                    query
                );

                // Map re-ranked results back to hybrid search format
                // Combine original rankScore with rerankerScore
                finalRankedDocuments = rerankedResults.map(result => {
                    // Find original document
                    const originalDoc = deduplicatedDocuments.find(d => 
                        d.id === result.document.url || 
                        d.sourceUrl === result.document.url ||
                        d.uri === result.document.url
                    ) || deduplicatedDocuments[0]; // Fallback

                    // Combine scores: hybrid rankScore (60%) + rerankerScore (40%)
                    // Both scores are normalized to [0, 1]
                    const hybridScore = originalDoc.rankScore || 0;
                    const rerankerScore = result.rerankerScore;
                    const combinedScore = 
                        hybridScore * 0.6 + 
                        rerankerScore * 0.4;

                    return {
                        ...originalDoc,
                        rankScore: combinedScore,
                        // Store re-ranker metadata for debugging (optional)
                        ...(includeRanking && {
                            rankingFactors: {
                                ...originalDoc.rankingFactors,
                                rerankerScore,
                                hybridScore,
                                finalScore: combinedScore
                            } as RankingFactors
                        })
                    };
                });

                // Re-sort by final combined score
                finalRankedDocuments.sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));

            } catch (error) {
                console.error('[HybridSearchService] Re-ranking failed, using original scores:', error);
                // Fallback to original ranking if re-ranker fails
                finalRankedDocuments = deduplicatedDocuments;
            }
        }

        // If filters reduced results significantly, get more initial results for better filtering
        let finalDocuments = finalRankedDocuments.slice(0, limit);
        if (filters && finalDocuments.length < limit && vectorResults.length < limit * 3) {
            // Re-search with higher limit to get more candidates for filtering
            const expandedResults = await this.vectorService.search(query, limit * 3);
            // Batch retrieval for expanded results
            let expandedEntities: (BaseEntity | undefined)[] = [];
            if (isKGRetrievalEnabled && expandedResults.length > 0) {
                try {
                    const docIds = expandedResults.map(res => res.document.id);
                    expandedEntities = await this.kgService.getNodes(docIds);
                } catch (error) {
                     logger.warn({ error }, '[HybridSearchService] Failed to batch get entities for expanded results');
                     expandedEntities = new Array(expandedResults.length).fill(undefined);
                }
            }

            const expandedWithRanking = await Promise.all(expandedResults.map(async (res, index) => {
                // Only fetch entity if KG retrieval is enabled
                const entity = isKGRetrievalEnabled ? expandedEntities[index] : undefined;

                const rankingFactors = await this.rankingService.calculateRankScore(
                    res.score,
                    entity,
                    res.document.metadata
                );
                return {
                    id: res.document.id,
                    content: res.document.content,
                    score: res.score,
                    metadata: { ...res.document.metadata, entity },
                    entity,
                    uri: entity?.uri,
                    sourceUrl: res.document.metadata?.sourceUrl || res.document.metadata?.url,
                    rankScore: rankingFactors.finalScore,
                    rankingFactors: includeRanking ? rankingFactors : undefined
                };
            }));

            let expandedFiltered = expandedWithRanking;
            if (filters.location) {
                expandedFiltered = expandedFiltered.filter(doc => this.matchesLocation(doc, filters.location!));
            }
            if (filters.jurisdiction) {
                expandedFiltered = expandedFiltered.filter(doc => this.matchesJurisdiction(doc, filters.jurisdiction!));
            }
            if (filters.validFrom || filters.validTo) {
                expandedFiltered = expandedFiltered.filter(doc => this.matchesTemporal(doc, filters.validFrom, filters.validTo));
            }
            if (filters.areaId || (filters.areaIds && filters.areaIds.length > 0)) {
                expandedFiltered = expandedFiltered.filter(doc => this.matchesArea(doc, filters.areaId, filters.areaIds));
            }

            // Combine and deduplicate
            // First remove entity from expandedFiltered before combining
            const expandedFilteredWithoutEntity = expandedFiltered.map((doc) => {
                const { entity: _entity, ...rest } = doc;
                return rest as Omit<typeof doc, 'entity'>;
            });
            const allDocs = [...deduplicatedDocuments, ...expandedFilteredWithoutEntity];
            const allSeenUris = new Set(seenUris);
            const combinedDeduped = allDocs
                .filter(doc => {
                    if (doc.uri && allSeenUris.has(doc.uri)) {
                        return false;
                    }
                    if (doc.uri) {
                        allSeenUris.add(doc.uri);
                    }
                    return true;
                }); // Entity already removed, no need to map again

            // Apply re-ranking to expanded results if enabled
            let finalExpandedDocuments = combinedDeduped
                .sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));

            if (this.rerankerService?.isEnabled() && finalExpandedDocuments.length > 0) {
                try {
                    const expandedForReranking: Array<ScrapedDocument & { relevanceScore?: number; semanticSimilarity?: number }> = 
                        finalExpandedDocuments.map(doc => {
                            const metadata = (doc.metadata || {}) as Record<string, unknown>;
                            const sourceUrl = typeof doc.sourceUrl === 'string' ? doc.sourceUrl : (typeof doc.uri === 'string' ? doc.uri : doc.id);
                            return {
                                titel: (metadata.title as string) || (metadata.titel as string) || doc.id,
                                url: sourceUrl,
                                website_url: typeof doc.sourceUrl === 'string' ? doc.sourceUrl : '',
                                website_titel: (metadata.website_titel as string) || (metadata.source as string) || '',
                                samenvatting: (metadata.samenvatting as string) || doc.content.substring(0, 500) || '',
                                type_document: (metadata.type_document as DocumentType) || 'Webpagina',
                                publicatiedatum: (metadata.publicatiedatum as string) || (metadata.date as string) || null,
                                relevanceScore: doc.rankScore ? doc.rankScore * 20 : undefined,
                                semanticSimilarity: doc.score
                            };
                        });

                    const expandedReranked = await this.rerankerService.rerank(expandedForReranking, query);
                    
                    finalExpandedDocuments = expandedReranked.map(result => {
                        const originalDoc = finalExpandedDocuments.find(d => 
                            d.id === result.document.url || 
                            d.sourceUrl === result.document.url ||
                            d.uri === result.document.url
                        ) || finalExpandedDocuments[0];

                        const hybridScore = originalDoc.rankScore || 0;
                        const rerankerScore = result.rerankerScore;
                        const combinedScore = hybridScore * 0.6 + rerankerScore * 0.4;

                        return {
                            ...originalDoc,
                            rankScore: combinedScore
                        };
                    });

                    finalExpandedDocuments.sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));
                } catch (error) {
                    console.error('[HybridSearchService] Re-ranking failed for expanded results:', error);
                }
            }

            finalDocuments = finalExpandedDocuments.slice(0, limit);
        }

        return {
            documents: finalDocuments.map(doc => ({
                ...doc,
                sourceUrl: typeof doc.sourceUrl === 'string' ? doc.sourceUrl : undefined
            })),
            relatedEntities: relatedEntities.slice(0, 10)
        };
    }
}

export const hybridSearchService = new HybridSearchService();
