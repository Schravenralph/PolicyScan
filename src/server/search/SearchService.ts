/**
 * SearchService - Unified search pipeline
 * 
 * Implements keyword prefilter, PostGIS geo constraints, pgvector semantic retrieval,
 * scoring merge, and citations.
 * 
 * @experimental This is the target architecture for future implementation.
 * Currently, the application uses `src/server/services/query/HybridSearch.ts`.
 *
 * @see docs/01-architecture/search/unified-search-architecture.md
 */

import { getDB } from '../config/database.js';
import { GeoIndexService } from '../geo/GeoIndexService.js';
import { EmbeddingService } from '../embeddings/EmbeddingService.js';
import { CanonicalChunkService } from '../services/canonical/CanonicalChunkService.js';
import { CanonicalDocumentService } from '../services/canonical/CanonicalDocumentService.js';
import { PgVectorProvider } from '../vector/PgVectorProvider.js';
import { RetrievalQueryPlanner, type RetrievalPlan } from '../services/query/index.js';
import type { Geometry } from 'geojson';
import type { CanonicalDocument, DocumentFamily } from '../contracts/types.js';
import { logger } from '../utils/logger.js';

/**
 * Search filters
 */
export interface SearchFilters {
  documentFamily?: DocumentFamily[];
  documentType?: string[];
  publisherAuthority?: string;
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  // Temporal filters
  validFrom?: Date;
  validTo?: Date;
  // Spatial filters
  areaId?: string;
  areaIds?: string[];
  geo?: Geometry; // Point, Polygon, or BBox
}

/**
 * Search result citation
 */
export interface SearchCitation {
  chunkId: string;
  offsets: { start: number; end: number };
  snippet: string;
  score: number;
}

/**
 * Search result score breakdown
 */
export interface SearchScoreBreakdown {
  keywordScore: number;
  semanticScore: number;
  geoScore?: number;
  finalScore: number;
}

/**
 * Search result
 */
export interface SearchResult {
  documentId: string;
  title: string;
  source: string;
  canonicalUrl?: string;
  scoreBreakdown: SearchScoreBreakdown;
  citations: SearchCitation[];
}

/**
 * Search metrics
 */
export interface SearchMetrics {
  keywordPrefilterMs: number;
  geoFilterMs?: number;
  semanticRetrievalMs: number;
  mergeRankMs: number;
  totalMs: number;
  candidateDocumentCount: number;
  finalResultCount: number;
  hitRate?: number; // Percentage of queries that returned results
  topFilters?: {
    documentFamily?: string[];
    documentType?: string[];
    hasGeo?: boolean;
  };
}

/**
 * Search request
 */
export interface SearchRequest {
  query: string;
  filters?: SearchFilters;
  topK?: number; // Default: 20
  includeCitations?: boolean; // Default: true
  modelId?: string; // Embedding model ID
  decomposeQuery?: boolean; // Enable query decomposition for complex queries
}

/**
 * Search response
 */
export interface SearchResponse {
  results: SearchResult[];
  metrics: SearchMetrics;
}

/**
 * SearchService - Unified search implementation
 */
export class SearchService {
  private _geoIndexService: GeoIndexService;
  private _embeddingService: EmbeddingService;
  private chunkService: CanonicalChunkService;
  private _documentService: CanonicalDocumentService;
  private vectorProvider: PgVectorProvider;
  private defaultModelId: string;
  private planner: RetrievalQueryPlanner;

  constructor(config: { defaultModelId?: string; planner?: RetrievalQueryPlanner } = {}) {
    this._geoIndexService = new GeoIndexService();
    this._embeddingService = new EmbeddingService();
    this.chunkService = new CanonicalChunkService();
    this._documentService = new CanonicalDocumentService();
    this.vectorProvider = new PgVectorProvider();
    // Default to first available model from registry
    this.defaultModelId = config.defaultModelId || 'Xenova/all-MiniLM-L6-v2@v1';
    this.planner = config.planner || new RetrievalQueryPlanner();
  }

  /**
   * Execute unified search
   * 
   * Pipeline:
   * 1. Keyword prefilter (Mongo text index / regex fallback)
   * 2. Geo filter (PostGIS) → constrain candidate documentIds
   * 3. Semantic retrieval (embed query, vector search)
   * 4. Merge & rank (normalize scores, dedupe, attach citations)
   * 
   * @param request - Search request
   * @returns Search response with results and metrics
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    const startTime = Date.now();
    const metrics: SearchMetrics = {
      keywordPrefilterMs: 0,
      semanticRetrievalMs: 0,
      mergeRankMs: 0,
      totalMs: 0,
      candidateDocumentCount: 0,
      finalResultCount: 0,
    };

    const topK = request.topK || 20;
    const includeCitations = request.includeCitations !== false;
    const modelId = request.modelId || this.defaultModelId;

    // Handle query decomposition if enabled
    if (request.decomposeQuery) {
      try {
        const plan = await this.planner.planRetrieval(request.query);

        // Only proceed with decomposition if we have multiple steps or comparison intent
        // Otherwise, fall back to normal search (more efficient)
        if (plan.steps.length > 1 || plan.queryType === 'comparison') {
          return this.executeDecomposedSearch(plan, request);
        }
      } catch (error) {
        logger.warn({ error, query: request.query }, 'Query decomposition failed, falling back to standard search');
        // Continue with standard search
      }
    }

    try {
      // Stage 1: Keyword prefilter
      const keywordStart = Date.now();
      const candidateDocs = await this.keywordPrefilter(request.query, request.filters);
      metrics.keywordPrefilterMs = Date.now() - keywordStart;
      metrics.candidateDocumentCount = candidateDocs.length;

      // Track top filters for observability
      metrics.topFilters = {
        documentFamily: request.filters?.documentFamily,
        documentType: request.filters?.documentType,
        hasGeo: !!request.filters?.geo,
      };

      logger.debug(
        {
          query: request.query,
          candidateCount: candidateDocs.length,
          keywordMs: metrics.keywordPrefilterMs,
        },
        'Keyword prefilter completed'
      );

      // Stage 2: Geo filter (if provided)
      let geoFilteredDocIds: string[] | undefined;
      if (request.filters?.geo) {
        const geoStart = Date.now();
        const geoResult = await this.geoFilter(request.filters.geo);
        metrics.geoFilterMs = Date.now() - geoStart;

        if (geoResult !== null) {
          geoFilteredDocIds = geoResult;

          // Intersect with keyword candidates
          // Convert MongoDB _id (ObjectId) to string for comparison
          const candidateDocIds = new Set(candidateDocs.map(d => String(d._id)));
          geoFilteredDocIds = geoFilteredDocIds.filter(id => candidateDocIds.has(id));
          metrics.candidateDocumentCount = geoFilteredDocIds.length;

          logger.debug(
            {
              geoFilteredCount: geoFilteredDocIds.length,
              geoMs: metrics.geoFilterMs,
            },
            'Geo filter completed'
          );
        } else {
          logger.debug('Geo filter ignored due to failure');
        }
      }

      // If no candidates after filters, return empty results
      // Convert MongoDB _id (ObjectId) to string for PostgreSQL documentId matching
      const finalCandidateDocIds = (geoFilteredDocIds || candidateDocs.map(d => String(d._id)));
      
      if (finalCandidateDocIds.length === 0) {
        metrics.totalMs = Date.now() - startTime;
        return {
          results: [],
          metrics,
        };
      }

      // Stage 3: Semantic retrieval (requires PostgreSQL with pgvector)
      const semanticStart = Date.now();
      let semanticResults: Array<{ chunkId: string; documentId: string; score: number }> = [];
      let semanticRetrievalFailed = false;
      
      try {
        semanticResults = await this.semanticRetrieval(
          request.query,
          modelId,
          topK * 2, // Get more chunks for better ranking
          finalCandidateDocIds
        );
      } catch (error) {
        // If semantic retrieval fails (e.g., PostgreSQL connection issue),
        // we'll fall back to keyword-only search
        semanticRetrievalFailed = true;
        logger.warn(
          { error, query: request.query },
          'Semantic retrieval failed, falling back to keyword-only search'
        );
      }
      
      metrics.semanticRetrievalMs = Date.now() - semanticStart;

      logger.debug(
        {
          semanticResultCount: semanticResults.length,
          semanticMs: metrics.semanticRetrievalMs,
          semanticRetrievalFailed,
        },
        'Semantic retrieval completed'
      );

      // Stage 4: Merge & rank
      const mergeStart = Date.now();
      let rankedResults: SearchResult[];
      
      if (semanticResults.length === 0 && semanticRetrievalFailed) {
        // Fallback to keyword-only search when semantic retrieval fails
        rankedResults = await this.keywordOnlyRank(
          candidateDocs,
          request.query,
          topK,
          includeCitations,
          request.filters?.geo ? geoFilteredDocIds : undefined
        );
      } else {
        rankedResults = await this.mergeAndRank(
          semanticResults,
          candidateDocs,
          request.query,
          topK,
          includeCitations,
          request.filters?.geo ? geoFilteredDocIds : undefined
        );
      }
      
      metrics.mergeRankMs = Date.now() - mergeStart;
      metrics.finalResultCount = rankedResults.length;
      metrics.totalMs = Date.now() - startTime;
      metrics.hitRate = rankedResults.length > 0 ? 1.0 : 0.0;

      logger.info(
        {
          query: request.query,
          resultCount: rankedResults.length,
          totalMs: metrics.totalMs,
          keywordMs: metrics.keywordPrefilterMs,
          geoMs: metrics.geoFilterMs,
          semanticMs: metrics.semanticRetrievalMs,
          mergeMs: metrics.mergeRankMs,
          candidateCount: metrics.candidateDocumentCount,
          filters: metrics.topFilters,
        },
        'Unified search completed'
      );

      return {
        results: rankedResults,
        metrics,
      };
    } catch (error) {
      metrics.totalMs = Date.now() - startTime;
      logger.error({ error, query: request.query }, 'Search failed');
      throw error;
    }
  }

  /**
   * Stage 1: Keyword prefilter
   * 
   * Uses MongoDB text index or regex fallback to find candidate documents.
   * Returns documents with computed keyword relevance scores.
   */
  private async keywordPrefilter(
    query: string,
    filters?: SearchFilters
  ): Promise<Array<CanonicalDocument & { keywordScore: number }>> {
    const db = getDB();
    const collection = db.collection<CanonicalDocument>('canonical_documents');

    // Build filter
    const mongoFilter: Record<string, unknown> = {};

    // Text search: try text index first, fallback to regex
    // Apply filters first
    if (filters?.documentFamily && filters.documentFamily.length > 0) {
      mongoFilter.documentFamily = { $in: filters.documentFamily };
    }

    if (filters?.documentType && filters.documentType.length > 0) {
      mongoFilter.documentType = { $in: filters.documentType };
    }

    if (filters?.publisherAuthority) {
      mongoFilter.publisherAuthority = filters.publisherAuthority;
    }

    // Temporal filters
    if (filters?.validFrom) {
      // Find documents valid ON or AFTER this date (active at start of query period)
      // Document is valid if its end date is >= filter.validFrom OR it has no end date (indefinite)
      if (!mongoFilter.$and) {
        mongoFilter.$and = [];
      }
      (mongoFilter.$and as Array<Record<string, unknown>>).push({
        $or: [
          { 'dates.validTo': { $gte: filters.validFrom } },
          { 'dates.validTo': null },
          { 'dates.validTo': { $exists: false } },
        ],
      });
    }
    if (filters?.validTo) {
      // Find documents valid ON or BEFORE this date (active at end of query period)
      // Document is valid if its start date is <= filter.validTo
      mongoFilter['dates.validFrom'] = { $lte: filters.validTo };
    }

    // Spatial filters
    if (filters?.areaId) {
      mongoFilter['sourceMetadata.spatialMetadata.areaId'] = filters.areaId;
    }
    if (filters?.areaIds && filters.areaIds.length > 0) {
      mongoFilter['sourceMetadata.spatialMetadata.areaId'] = { $in: filters.areaIds };
    }

    if (filters?.dateRange) {
      const dateRange = filters.dateRange as { from?: Date; to?: Date };
      if (dateRange.from || dateRange.to) {
        const dateFilter: Record<string, Date> = {};
        if (dateRange.from) {
          dateFilter.$gte = dateRange.from;
        }
        if (dateRange.to) {
          dateFilter.$lte = dateRange.to;
        }
        mongoFilter['dates.publishedAt'] = dateFilter;
      }
    }

    // Try text index first, fallback to regex if it fails
    let documents: CanonicalDocument[] = [];
    let useTextIndex = false;
    try {
      // Try MongoDB text search (requires text index)
      const textFilter = { ...mongoFilter, $text: { $search: query } };
      documents = await collection.find(textFilter).limit(100).toArray();
      useTextIndex = true;
    } catch (error: unknown) {
      // Fallback to regex if text index not available
      const err = error as { code?: number; codeName?: string };
      if (err.code === 27 || err.codeName === 'IndexNotFound') {
        logger.debug('Text index not available, falling back to regex search');
        const queryWords = query.split(/\s+/).filter(w => w.length > 2);
        if (queryWords.length > 0) {
          // Join words with OR operator for regex search
          // $options: 'i' makes the entire pattern case-insensitive
          const regexPattern = queryWords.join('|');
          mongoFilter.fullText = { $regex: regexPattern, $options: 'i' };
        }
        documents = await collection.find(mongoFilter).limit(100).toArray();
      } else {
        throw error;
      }
    }

    // Compute keyword scores for each document
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const documentsWithScores = documents.map(doc => {
      const keywordScore = this.computeKeywordScore(doc, queryWords, useTextIndex);
      return { ...doc, keywordScore };
    });

    return documentsWithScores;
  }

  /**
   * Compute keyword relevance score for a document
   * 
   * Scores based on:
   * - Title matches (weight: 10)
   * - Full text matches (weight: 1)
   * - Normalized to 0-1 range
   */
  private computeKeywordScore(
    doc: CanonicalDocument,
    queryWords: string[],
    useTextIndex: boolean
  ): number {
    if (queryWords.length === 0) {
      return 0.5; // Default score if no query words
    }

    const titleLower = (doc.title || '').toLowerCase();
    const fullTextLower = (doc.fullText || '').toLowerCase();

    let score = 0;
    let maxPossibleScore = 0;

    for (const word of queryWords) {
      maxPossibleScore += 10 + 1; // Title weight + fullText weight

      // Title matches (weight: 10)
      const titleMatches = (titleLower.match(new RegExp(word, 'gi')) || []).length;
      score += titleMatches * 10;

      // Full text matches (weight: 1)
      const textMatches = (fullTextLower.match(new RegExp(word, 'gi')) || []).length;
      score += textMatches * 1;
    }

    // Normalize to 0-1 range
    if (maxPossibleScore === 0) {
      return 0.5;
    }

    const normalizedScore = Math.min(1, score / maxPossibleScore);
    
    // Boost score if using text index (MongoDB text search provides relevance)
    if (useTextIndex) {
      return Math.min(1, normalizedScore * 1.2);
    }

    return normalizedScore;
  }

  /**
   * Stage 2: Geo filter
   * 
   * Queries PostGIS for documents intersecting with the given geometry.
   * Returns null if geo service is unavailable (connection failure), allowing fallback.
   */
  private async geoFilter(geometry: Geometry): Promise<string[] | null> {
    try {
      const { queryPostgres } = await import('../config/postgres.js');
      const geometryJson = JSON.stringify(geometry);

      const result = await queryPostgres<{ document_id: string }>(
        `SELECT document_id 
         FROM geo.document_geometries 
         WHERE ST_Intersects(geom, ST_GeomFromGeoJSON($1))`,
        [geometryJson]
      );

      return result.map(row => row.document_id);
    } catch (error) {
      // Log PostgreSQL connection errors with more detail
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('PostgreSQL authentication failed') || 
          errorMessage.includes('PostgreSQL connection refused') ||
          errorMessage.includes('PostgreSQL connection failed')) {
        logger.warn({ error, geometry }, 'Geo filter failed due to PostgreSQL connection issue, ignoring filter');
        return null;
      }

      logger.warn({ error, geometry }, 'Geo filter failed, returning empty result');
      return [];
    }
  }

  /**
   * Stage 3: Semantic retrieval
   * 
   * Embeds query and performs vector search over chunks.
   * Gracefully handles PostgreSQL connection failures by returning empty results.
   */
  private async semanticRetrieval(
    query: string,
    modelId: string,
    topK: number,
    candidateDocIds: string[]
  ): Promise<Array<{ chunkId: string; documentId: string; score: number }>> {
    try {
      // Generate query embedding using EmbeddingService
      // Note: EmbeddingService doesn't expose getProvider directly, so we'll use a workaround
      // For MVP, we'll use the model registry to get the provider
      const { getModelRegistry } = await import('../embeddings/modelRegistry.js');
      const { LocalEmbeddingProviderAdapter } = await import('../embeddings/providers/LocalEmbeddingProviderAdapter.js');
      const modelRegistry = getModelRegistry();
      const modelEntry = modelRegistry.get(modelId);
      
      if (!modelEntry) {
        throw new Error(`Model not found in registry: ${modelId}`);
      }

      // Create provider based on type
      let provider;
      if (modelEntry.provider === 'local') {
        provider = new LocalEmbeddingProviderAdapter(modelId);
      } else {
        throw new Error(`Unsupported provider type: ${modelEntry.provider}`);
      }

      // Generate query embedding
      const queryEmbedding = await provider.generateEmbedding(query);

      // Vector search with documentId filter
      const vectorResults = await this.vectorProvider.search(
        queryEmbedding,
        modelId,
        topK,
        { documentIds: candidateDocIds }
      );

      return vectorResults;
    } catch (error) {
      // Log PostgreSQL connection errors with more detail
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('PostgreSQL authentication failed') || 
          errorMessage.includes('PostgreSQL connection refused') ||
          errorMessage.includes('PostgreSQL connection failed') ||
          errorMessage.includes('PostgreSQL database does not exist') ||
          errorMessage.includes('password authentication failed')) {
        // Log warning and re-throw to allow search method to handle fallback
        logger.warn(
          { error, query, modelId },
          'Semantic retrieval failed due to PostgreSQL connection issue, signaling fallback'
        );
        throw error;
      }
      // Re-throw other errors (e.g., model not found, embedding generation failures)
      throw error;
    }
  }

  /**
   * Stage 4: Merge & rank
   * 
   * Normalizes scores, dedupes by documentId, and attaches citations.
   */
  private async mergeAndRank(
    semanticResults: Array<{ chunkId: string; documentId: string; score: number }>,
    candidateDocs: Array<CanonicalDocument & { keywordScore: number }>,
    query: string,
    topK: number,
    includeCitations: boolean,
    geoFilteredDocIds?: string[]
  ): Promise<SearchResult[]> {
    // Group by documentId and collect top chunks
    const docMap = new Map<string, {
      document: CanonicalDocument & { keywordScore?: number };
      chunks: Array<{ chunkId: string; score: number }>;
      maxScore: number;
    }>();

    // Create document lookup
    // MongoDB _id might be ObjectId object, but PostgreSQL documentIds are strings
    // Convert _id to string for consistent matching
    const docLookup = new Map(candidateDocs.map(d => [String(d._id), d]));

    for (const result of semanticResults) {
      const doc = docLookup.get(result.documentId);
      if (!doc) {
        continue; // Skip if document not in candidates
      }

      if (!docMap.has(result.documentId)) {
        docMap.set(result.documentId, {
          document: doc,
          chunks: [],
          maxScore: 0,
        });
      }

      const entry = docMap.get(result.documentId)!;
      entry.chunks.push({ chunkId: result.chunkId, score: result.score });
      entry.maxScore = Math.max(entry.maxScore, result.score);
    }

    // Build results with citations
    const results: SearchResult[] = [];

    for (const [documentId, entry] of docMap.entries()) {
      // Sort chunks by score
      entry.chunks.sort((a, b) => b.score - a.score);

      // Get citations
      const citations: SearchCitation[] = [];
      if (includeCitations) {
        for (const chunkInfo of entry.chunks.slice(0, 3)) { // Top 3 citations per doc
          try {
            const chunk = await this.chunkService.findByChunkId(chunkInfo.chunkId);
            if (chunk) {
              const snippet = this.buildSnippet(chunk.text, query, chunk.offsets);
              citations.push({
                chunkId: chunk.chunkId,
                offsets: chunk.offsets,
                snippet,
                score: chunkInfo.score,
              });
            }
          } catch (error) {
            logger.warn({ error, chunkId: chunkInfo.chunkId }, 'Failed to build citation');
          }
        }
      }

      // Normalize scores (semantic score is already 0-1 from cosine similarity)
      const semanticScore = entry.maxScore;
      // Get keyword score from candidate document
      const keywordScore = entry.document.keywordScore || 0.5;
      
      // Compute geo score if geo filter was used
      let geoScore: number | undefined;
      if (geoFilteredDocIds && geoFilteredDocIds.includes(documentId)) {
        // Documents that pass geo filter get a boost
        geoScore = 1.0;
      }

      // Weighted combination: semantic (60%), keyword (30%), geo (10% if present)
      let finalScore: number;
      if (geoScore !== undefined) {
        finalScore = (semanticScore * 0.6) + (keywordScore * 0.3) + (geoScore * 0.1);
      } else {
        finalScore = (semanticScore * 0.7) + (keywordScore * 0.3);
      }

      results.push({
        documentId,
        title: entry.document.title,
        source: entry.document.source,
        canonicalUrl: entry.document.canonicalUrl,
        scoreBreakdown: {
          keywordScore,
          semanticScore,
          geoScore,
          finalScore,
        },
        citations,
      });
    }

    // Sort by final score and return top K
    results.sort((a, b) => b.scoreBreakdown.finalScore - a.scoreBreakdown.finalScore);

    return results.slice(0, topK);
  }

  /**
   * Build citation snippet from chunk text
   */
  private buildSnippet(
    chunkText: string,
    query: string,
    _offsets: { start: number; end: number }
  ): string {
    // Extract snippet around query terms
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const text = chunkText.toLowerCase();

    // Find first occurrence of any query word
    let snippetStart = 0;
    for (const word of queryWords) {
      const index = text.indexOf(word);
      if (index !== -1) {
        snippetStart = Math.max(0, index - 50); // 50 chars before
        break;
      }
    }

    const snippetEnd = Math.min(chunkText.length, snippetStart + 200); // 200 chars total
    let snippet = chunkText.substring(snippetStart, snippetEnd);

    // Add ellipsis if needed
    if (snippetStart > 0) {
      snippet = '...' + snippet;
    }
    if (snippetEnd < chunkText.length) {
      snippet = snippet + '...';
    }

    return snippet.trim();
  }

  /**
   * Keyword-only ranking (fallback when semantic retrieval fails)
   * 
   * Ranks documents based on keyword scores only, without semantic search.
   * Used when PostgreSQL connection fails or semantic retrieval is unavailable.
   */
  private async keywordOnlyRank(
    candidateDocs: Array<CanonicalDocument & { keywordScore: number }>,
    query: string,
    topK: number,
    includeCitations: boolean,
    geoFilteredDocIds?: string[]
  ): Promise<SearchResult[]> {
    // Sort documents by keyword score
    const sortedDocs = [...candidateDocs].sort((a, b) => b.keywordScore - a.keywordScore);

    // Build results
    const results: SearchResult[] = [];

    for (const doc of sortedDocs.slice(0, topK)) {
      const documentId = String(doc._id);

      // Compute geo score if geo filter was used
      let geoScore: number | undefined;
      if (geoFilteredDocIds && geoFilteredDocIds.includes(documentId)) {
        geoScore = 1.0;
      }

      // Use keyword score as the primary score
      const keywordScore = doc.keywordScore;
      const semanticScore = 0; // No semantic score available

      // Weighted combination: keyword (70%), geo (30% if present)
      let finalScore: number;
      if (geoScore !== undefined) {
        finalScore = (keywordScore * 0.7) + (geoScore * 0.3);
      } else {
        finalScore = keywordScore;
      }

      // Get citations from document text (simple snippet extraction)
      const citations: SearchCitation[] = [];
      if (includeCitations && doc.fullText) {
        try {
          // Extract a snippet from the document text that contains query terms
          const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
          const textLower = doc.fullText.toLowerCase();
          
          // Find first occurrence of any query word
          let snippetStart = 0;
          for (const word of queryWords) {
            const index = textLower.indexOf(word);
            if (index !== -1) {
              snippetStart = Math.max(0, index - 50);
              break;
            }
          }

          const snippetEnd = Math.min(doc.fullText.length, snippetStart + 200);
          let snippet = doc.fullText.substring(snippetStart, snippetEnd);

          // Add ellipsis if needed
          if (snippetStart > 0) {
            snippet = '...' + snippet;
          }
          if (snippetEnd < doc.fullText.length) {
            snippet = snippet + '...';
          }

          citations.push({
            chunkId: documentId, // Use documentId as chunkId for keyword-only results
            offsets: { start: snippetStart, end: snippetEnd },
            snippet: snippet.trim(),
            score: keywordScore,
          });
        } catch (error) {
          logger.warn({ error, documentId }, 'Failed to build citation for keyword-only result');
        }
      }

      results.push({
        documentId,
        title: doc.title,
        source: doc.source,
        canonicalUrl: doc.canonicalUrl,
        scoreBreakdown: {
          keywordScore,
          semanticScore,
          geoScore,
          finalScore,
        },
        citations,
      });
    }

    return results;
  }

  /**
   * Execute decomposed search plan
   */
  private async executeDecomposedSearch(
    plan: RetrievalPlan,
    originalRequest: SearchRequest
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    logger.debug({ plan }, 'Executing decomposed search plan');

    const stepPromises = plan.steps.map(step => {
      const stepRequest: SearchRequest = {
        ...originalRequest,
        query: step.query,
        decomposeQuery: false, // Prevent infinite recursion
        // Use estimated expected results as topK, or a heuristic
        topK: step.expectedResults || Math.ceil((originalRequest.topK || 20) / Math.max(1, plan.steps.length * 0.5)) + 5
      };

      return this.search(stepRequest)
        .then(response => ({ step, response }))
        .catch(error => {
            logger.warn({ error, step }, 'Decomposed search step failed');
            return {
              step,
              response: {
                results: [],
                metrics: {
                  keywordPrefilterMs: 0,
                  semanticRetrievalMs: 0,
                  mergeRankMs: 0,
                  geoFilterMs: 0,
                  totalMs: 0,
                  candidateDocumentCount: 0,
                  finalResultCount: 0
                } as SearchMetrics
              }
            };
        });
    });

    const results = await Promise.all(stepPromises);

    // Combine results
    const combinedResults = this.combineSearchResults(results.map(r => r.response.results));

    // Limit to original topK
    const finalResults = combinedResults.slice(0, originalRequest.topK || 20);

    // Aggregate metrics
    const metrics: SearchMetrics = {
        keywordPrefilterMs: results.reduce((sum, r) => sum + r.response.metrics.keywordPrefilterMs, 0),
        semanticRetrievalMs: results.reduce((sum, r) => sum + r.response.metrics.semanticRetrievalMs, 0),
        mergeRankMs: results.reduce((sum, r) => sum + r.response.metrics.mergeRankMs, 0),
        geoFilterMs: results.reduce((sum, r) => sum + (r.response.metrics.geoFilterMs || 0), 0),
        totalMs: Date.now() - startTime,
        candidateDocumentCount: results.reduce((sum, r) => sum + r.response.metrics.candidateDocumentCount, 0),
        finalResultCount: finalResults.length,
        hitRate: finalResults.length > 0 ? 1.0 : 0.0
    };

    logger.info(
      {
        query: originalRequest.query,
        resultCount: finalResults.length,
        planSteps: plan.steps.length,
        metrics
      },
      'Decomposed search completed'
    );

    return {
      results: finalResults,
      metrics
    };
  }

  /**
   * Combine results from multiple searches
   */
  private combineSearchResults(resultsGroups: SearchResult[][]): SearchResult[] {
      const docMap = new Map<string, SearchResult>();

      for (const results of resultsGroups) {
          for (const result of results) {
              if (docMap.has(result.documentId)) {
                  const existing = docMap.get(result.documentId)!;

                  // Boost score if document appears in multiple results
                  // Weighted sum with boost
                  const newFinalScore = Math.min(1.0, existing.scoreBreakdown.finalScore + (result.scoreBreakdown.finalScore * 0.2));
                  existing.scoreBreakdown.finalScore = newFinalScore;

                  // Merge citations (keep unique chunks)
                  const existingChunkIds = new Set(existing.citations.map(c => c.chunkId));
                  for (const cit of result.citations) {
                      if (!existingChunkIds.has(cit.chunkId)) {
                          existing.citations.push(cit);
                          existingChunkIds.add(cit.chunkId);
                      }
                  }

                  // Sort citations by score and keep top 3
                  existing.citations.sort((a, b) => b.score - a.score);
                  existing.citations = existing.citations.slice(0, 3);

              } else {
                  // Clone result to avoid mutation issues
                  docMap.set(result.documentId, {
                    ...result,
                    citations: [...result.citations],
                    scoreBreakdown: { ...result.scoreBreakdown }
                  });
              }
          }
      }

      return Array.from(docMap.values()).sort((a, b) => b.scoreBreakdown.finalScore - a.scoreBreakdown.finalScore);
  }
}
