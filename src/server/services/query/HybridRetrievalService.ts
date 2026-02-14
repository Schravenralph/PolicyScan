/**
 * Hybrid Retrieval Service
 * 
 * Combines keyword-based MongoDB search with semantic vector search
 * to provide improved document retrieval.
 * 
 * This service implements the hybrid retrieval strategy from 01-hybrid-retrieval.md:
 * - Keyword search using MongoDB text index (when enabled) or regex fallback
 * - Semantic search using VectorService
 * - Weighted combination of results (default: 0.4 keyword, 0.6 semantic)
 * - Score normalization to [0, 1] range
 * - Deduplication by URL
 * - Boost for documents appearing in both result sets (+10%)
 * - Optional RRF (Reciprocal Rank Fusion) merge method
 * 
 * Environment Variables:
 * - HYBRID_KEYWORD_WEIGHT: Weight for keyword results (default: 0.4)
 * - HYBRID_SEMANTIC_WEIGHT: Weight for semantic results (default: 0.6)
 * - HYBRID_MAX_KEYWORD_RESULTS: Max results from keyword search (default: 50)
 * - HYBRID_MAX_SEMANTIC_RESULTS: Max results from semantic search (default: 50)
 * - SEMANTIC_SIMILARITY_THRESHOLD: Minimum similarity for semantic results (default: 0.7)
 * - HYBRID_FIELD_BOOST_TITLE: Weight for title field matches (default: 10)
 * - HYBRID_FIELD_BOOST_SUMMARY: Weight for summary field matches (default: 5)
 * - HYBRID_FIELD_BOOST_RELEVANCE: Weight for relevance field matches (default: 5)
 * - HYBRID_FIELD_BOOST_LABEL: Weight for label field matches (default: 2)
 * - HYBRID_FIELD_BOOST_URL: Weight for URL field matches (default: 1)
 * - MONGODB_TEXT_INDEX_ENABLED: Enable MongoDB text index usage (default: false)
 *   Note: Text indexes require apiStrict: false. Run `pnpm run create-text-index` to create the index.
 */

import { VectorService } from './VectorService.js';
import { getDB } from '../../config/database.js';
import type { BronDocumentDocument } from '../../types/index.js';
import { ObjectId } from 'mongodb';
import { getFieldBoostConfig, type FieldBoostConfig } from '../../config/search-config.js';
import { queryCache, type CacheKeyOptions } from './QueryCache.js';
import { getCanonicalDocumentService } from '../canonical/CanonicalDocumentService.js';
import { getCanonicalChunkService } from '../canonical/CanonicalChunkService.js';
import { transformCanonicalToLegacy } from '../../utils/canonicalToLegacyTransformer.js';
import type { CanonicalDocument, DocumentFilters } from '../../contracts/types.js';

export interface RetrievalOptions {
  keywordWeight?: number;
  semanticWeight?: number;
  maxKeywordResults?: number;
  maxSemanticResults?: number;
  similarityThreshold?: number;
  mergeMethod?: 'weighted' | 'rrf';
  filters?: DocumentFilters;
}

export interface RetrievedDocument {
  id: string;
  url: string;
  titel: string;
  samenvatting: string;
  keywordScore: number;
  semanticScore: number;
  finalScore: number;
  metadata: Record<string, unknown>;
  _id?: string;
}

interface KeywordSearchResult {
  doc: BronDocumentDocument;
  score: number;
}

interface SemanticSearchResult {
  doc: BronDocumentDocument;
  score: number;
}

interface CanonicalKeywordSearchResult {
  doc: CanonicalDocument;
  score: number;
}

interface CanonicalSemanticSearchResult {
  doc: CanonicalDocument;
  score: number;
}

export interface CanonicalRetrievedDocument {
  document: CanonicalDocument;
  keywordScore: number;
  semanticScore: number;
  finalScore: number;
}

export class HybridRetrievalService {
  private vectorService: VectorService;
  private defaultKeywordWeight: number;
  private defaultSemanticWeight: number;
  private defaultMaxKeywordResults: number;
  private defaultMaxSemanticResults: number;
  private defaultSimilarityThreshold: number;
  private fieldBoosts: FieldBoostConfig;
  private canonicalDocumentService: ReturnType<typeof getCanonicalDocumentService>;
  private canonicalChunkService: ReturnType<typeof getCanonicalChunkService>;

  constructor(vectorService?: VectorService) {
    this.vectorService = vectorService || new VectorService();
    this.canonicalDocumentService = getCanonicalDocumentService();
    this.canonicalChunkService = getCanonicalChunkService();

    // Load configuration from environment variables with defaults
    this.defaultKeywordWeight = parseFloat(
      process.env.HYBRID_KEYWORD_WEIGHT || '0.4'
    );
    this.defaultSemanticWeight = parseFloat(
      process.env.HYBRID_SEMANTIC_WEIGHT || '0.6'
    );
    this.defaultMaxKeywordResults = parseInt(
      process.env.HYBRID_MAX_KEYWORD_RESULTS || '50',
      10
    );
    this.defaultMaxSemanticResults = parseInt(
      process.env.HYBRID_MAX_SEMANTIC_RESULTS || '50',
      10
    );
    this.defaultSimilarityThreshold = parseFloat(
      process.env.SEMANTIC_SIMILARITY_THRESHOLD || '0.7'
    );

    // Load field boost configuration
    this.fieldBoosts = getFieldBoostConfig();
  }

  async init() {
    await this.vectorService.init();
  }

  /**
   * Check if text index is available and enabled
   * Text indexes require apiStrict: false in MongoDB driver configuration
   * Run `pnpm run create-text-index` to create the index on canonical_documents
   */
  private async isTextIndexAvailable(): Promise<boolean> {
    // Check if text index usage is explicitly enabled
    if (process.env.MONGODB_TEXT_INDEX_ENABLED !== 'true') {
      return false;
    }

    try {
      const db = getDB();
      // Check for text index on canonical_documents collection (migrated)
      const collection = db.collection('canonical_documents');
      const indexes = await collection.indexes();

      // Check if text index exists
      return indexes.some(index => {
        const indexKeys = index.key as Record<string, string | number>;
        return Object.values(indexKeys).some(value => value === 'text');
      });
    } catch (error) {
      console.warn('[HybridRetrievalService] Failed to check text index availability:', error);
      return false;
    }
  }

  /**
   * Perform keyword search using MongoDB text index or regex fallback
   * Now uses canonical documents instead of legacy brondocumenten collection
   * Text index is used when available and enabled (requires apiStrict: false)
   * Falls back to regex queries when text index is not available
   * 
   * @deprecated Use keywordSearchCanonical() instead.
   */
  private async keywordSearch(
    query: string,
    limit: number,
    filters?: DocumentFilters
  ): Promise<KeywordSearchResult[]> {
    // Use canonical document service for text search
    const canonicalResults = await this.canonicalDocumentService.textSearch(
      query,
      filters,
      { limit: limit * 2 } // Get more results to score and filter
    );

    // Transform canonical documents to legacy format for scoring compatibility
    // The scoring logic uses legacy field names (titel, samenvatting, etc.)
    const legacyDocs = canonicalResults.map(canonicalDoc => {
      const legacyDoc = transformCanonicalToLegacy(canonicalDoc);
      // Preserve keywordScore from canonical search if available
      return { ...legacyDoc, _canonicalKeywordScore: canonicalDoc.keywordScore };
    });

    // Check if we used text index (indicated by keywordScore being set)
    const useTextScore = canonicalResults.some(doc => doc.keywordScore !== undefined);

    // Score results based on field matches (using legacy field names)
    const scoredResults: KeywordSearchResult[] = legacyDocs.map((doc) => {
      let score = 0;

      // If canonical service provided a keywordScore, use it as base
      if (useTextScore && (doc as any)._canonicalKeywordScore !== undefined) {
        score = (doc as any)._canonicalKeywordScore;
      } else {
        // Calculate score using configurable field boosts (regex fallback)
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedQuery, 'i');

        // Title match: configurable weight
        if (doc.titel && regex.test(doc.titel)) {
          const matches = (doc.titel.match(regex) || []).length;
          score += this.fieldBoosts.title * matches;
        }

        // Summary match: configurable weight
        if (doc.samenvatting && regex.test(doc.samenvatting)) {
          const matches = (doc.samenvatting.match(regex) || []).length;
          score += this.fieldBoosts.summary * matches;
        }

        // Relevance field match: configurable weight
        if (doc['relevantie voor zoekopdracht'] && regex.test(doc['relevantie voor zoekopdracht'])) {
          const matches = (doc['relevantie voor zoekopdracht'].match(regex) || []).length;
          score += this.fieldBoosts.relevance * matches;
        }

        // Label match: configurable weight
        if (doc.label && regex.test(doc.label)) {
          const matches = (doc.label.match(regex) || []).length;
          score += this.fieldBoosts.label * matches;
        }

        // URL match: configurable weight
        if (doc.url && regex.test(doc.url)) {
          score += this.fieldBoosts.url;
        }
      }

      // Remove temporary _canonicalKeywordScore field
      const { _canonicalKeywordScore, ...cleanDoc } = doc as any;
      return { doc: cleanDoc, score };
    });

    // Sort by score and return top results
    return scoredResults
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Perform keyword search on canonical documents
   * Returns canonical documents with scores
   */
  private async keywordSearchCanonical(
    query: string,
    limit: number,
    filters?: DocumentFilters
  ): Promise<CanonicalKeywordSearchResult[]> {
    // Use canonical document service for text search
    const canonicalResults = await this.canonicalDocumentService.textSearch(
      query,
      filters,
      { limit: limit * 2 } // Get more results to score and filter
    );

    // Score results
    return canonicalResults.map(doc => ({
      doc,
      score: doc.keywordScore || 0
    }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Perform semantic search using vector similarity
   * 
   * @deprecated Use semanticSearchCanonical() for new code
   */
  private async semanticSearch(
    query: string,
    limit: number,
    threshold: number,
    filters?: DocumentFilters
  ): Promise<SemanticSearchResult[]> {
    // Generate query embedding
    const queryEmbedding = await this.vectorService.generateEmbedding(query);

    // Determine model ID
    const modelName = process.env.VECTOR_SERVICE_MODEL || 'Xenova/all-MiniLM-L6-v2';
    const modelId = `${modelName}@v1`;

    // Retrieve chunks (fetch more to allow for aggregation and filtering)
    const chunks = await this.canonicalChunkService.semanticRetrieve(
      queryEmbedding,
      filters || {},
      limit * 5,
      modelId
    );

    if (chunks.length === 0) return [];

    // Aggregate chunks by document ID, taking the max score for each document
    const docScores = new Map<string, number>();

    for (const chunk of chunks) {
      const currentScore = docScores.get(chunk.documentId) || 0;
      if (chunk.score > currentScore) {
        docScores.set(chunk.documentId, chunk.score);
      }
    }

    // Filter documents by threshold and get top K IDs
    const filteredDocIds = Array.from(docScores.entries())
      .filter(([_, score]) => score >= threshold)
      .sort((a, b) => b[1] - a[1]) // Sort by score descending
      .slice(0, limit)
      .map(([id]) => id);

    if (filteredDocIds.length === 0) return [];

    // Fetch full canonical documents
    const canonicalDocs = await this.canonicalDocumentService.findByIds(filteredDocIds);

    // Transform to legacy format and attach scores
    const results: SemanticSearchResult[] = [];

    for (const doc of canonicalDocs) {
      const docId = (doc as any)._id.toString();
      const score = docScores.get(docId) || 0;

      const legacyDoc = transformCanonicalToLegacy(doc);
      results.push({
        doc: legacyDoc,
        score
      });
    }

    // Sort final results by score
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Perform semantic search using vector similarity
   * Returns canonical documents with scores (no legacy transformation)
   */
  private async semanticSearchCanonical(
    query: string,
    limit: number,
    threshold: number,
    filters?: DocumentFilters
  ): Promise<CanonicalSemanticSearchResult[]> {
    // Generate query embedding
    const queryEmbedding = await this.vectorService.generateEmbedding(query);

    // Determine model ID
    const modelName = process.env.VECTOR_SERVICE_MODEL || 'Xenova/all-MiniLM-L6-v2';
    const modelId = `${modelName}@v1`;

    // Retrieve chunks
    const chunks = await this.canonicalChunkService.semanticRetrieve(
      queryEmbedding,
      filters || {},
      limit * 5,
      modelId
    );

    if (chunks.length === 0) return [];

    // Aggregate chunks by document ID, taking the max score
    const docScores = new Map<string, number>();

    for (const chunk of chunks) {
      const currentScore = docScores.get(chunk.documentId) || 0;
      if (chunk.score > currentScore) {
        docScores.set(chunk.documentId, chunk.score);
      }
    }

    // Filter and sort IDs
    const filteredDocIds = Array.from(docScores.entries())
      .filter(([_, score]) => score >= threshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    if (filteredDocIds.length === 0) return [];

    // Fetch full canonical documents
    const canonicalDocs = await this.canonicalDocumentService.findByIds(filteredDocIds);

    const results: CanonicalSemanticSearchResult[] = [];

    for (const doc of canonicalDocs) {
      const docId = (doc as any)._id.toString();
      const score = docScores.get(docId) || 0;

      results.push({
        doc,
        score
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  /**
   * Normalize scores to [0, 1] range
   */
  private normalizeScores<T extends { score: number }>(
    results: T[]
  ): Array<T & { normalizedScore: number }> {
    if (results.length === 0) {
      return [];
    }

    const maxScore = Math.max(...results.map(r => r.score));
    const minScore = Math.min(...results.map(r => r.score));

    // Handle edge case: all scores are the same
    if (maxScore === minScore) {
      return results.map(r => ({
        ...r,
        normalizedScore: maxScore > 0 ? 1 : 0
      }));
    }

    // Normalize to [0, 1]
    return results.map(r => ({
      ...r,
      normalizedScore: (r.score - minScore) / (maxScore - minScore)
    }));
  }

  /**
   * Merge keyword and semantic results using weighted combination
   */
  private mergeResultsWeighted(
    keywordResults: Array<KeywordSearchResult & { normalizedScore: number }>,
    semanticResults: Array<SemanticSearchResult & { normalizedScore: number }>,
    options: RetrievalOptions
  ): RetrievedDocument[] {
    const { keywordWeight = this.defaultKeywordWeight, semanticWeight = this.defaultSemanticWeight } = options;

    // Create a map keyed by URL for deduplication
    const docMap = new Map<string, RetrievedDocument>();

    // Track which documents appear in both result sets (for boosting)
    const keywordUrls = new Set(
      keywordResults.map(r => r.doc.url)
    );
    const semanticUrls = new Set(
      semanticResults.map(r => r.doc.url)
    );
    const commonUrls = new Set(
      [...keywordUrls].filter(url => semanticUrls.has(url))
    );

    // Add keyword results
    for (const { doc, normalizedScore } of keywordResults) {
      const url = doc.url;
      const id = doc._id?.toString() || url;

      docMap.set(url, {
        id,
        url,
        titel: doc.titel || '',
        samenvatting: doc.samenvatting || '',
        keywordScore: normalizedScore,
        semanticScore: 0,
        finalScore: keywordWeight * normalizedScore,
        metadata: {
          label: doc.label,
          type_document: doc.type_document,
          website_url: doc.website_url,
          website_titel: doc.website_titel,
          publicatiedatum: doc.publicatiedatum,
          subjects: doc.subjects,
          themes: doc.themes
        },
        _id: doc._id?.toString()
      });
    }

    // Add/merge semantic results
    for (const { doc, normalizedScore } of semanticResults) {
      const url = doc.url;
      const id = doc._id?.toString() || url;
      const isInBoth = commonUrls.has(url);

      if (docMap.has(url)) {
        // Merge: document appears in both result sets
        const existing = docMap.get(url)!;
        existing.semanticScore = normalizedScore;

        // Calculate base combined score
        existing.finalScore =
          (keywordWeight * existing.keywordScore) +
          (semanticWeight * normalizedScore);

        // Boost documents appearing in both sets (+10%)
        if (isInBoth) {
          existing.finalScore *= 1.1;
          // Ensure score doesn't exceed 1.0
          existing.finalScore = Math.min(existing.finalScore, 1.0);
        }
      } else {
        // New document from semantic search only
        docMap.set(url, {
          id,
          url,
          titel: doc.titel || '',
          samenvatting: doc.samenvatting || '',
          keywordScore: 0,
          semanticScore: normalizedScore,
          finalScore: semanticWeight * normalizedScore,
          metadata: {
            label: doc.label,
            type_document: doc.type_document,
            website_url: doc.website_url,
            website_titel: doc.website_titel,
            publicatiedatum: doc.publicatiedatum,
            subjects: doc.subjects,
            themes: doc.themes
          },
          _id: doc._id?.toString()
        });
      }
    }

    // Sort by final score and return
    return Array.from(docMap.values())
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Merge results using Reciprocal Rank Fusion (RRF)
   */
  private mergeResultsRRF(
    keywordResults: Array<KeywordSearchResult & { normalizedScore: number }>,
    semanticResults: Array<SemanticSearchResult & { normalizedScore: number }>,
    _options: RetrievalOptions
  ): RetrievedDocument[] {
    const k = 60; // RRF constant (standard value)

    // Create a map keyed by URL
    const docMap = new Map<string, RetrievedDocument>();

    // Build rank maps
    const keywordRanks = new Map<string, number>();
    keywordResults.forEach((r, index) => {
      keywordRanks.set(r.doc.url, index + 1);
    });

    const semanticRanks = new Map<string, number>();
    semanticResults.forEach((r, index) => {
      semanticRanks.set(r.doc.url, index + 1);
    });

    // Track which documents appear in both result sets
    const keywordUrls = new Set(keywordResults.map(r => r.doc.url));
    const semanticUrls = new Set(semanticResults.map(r => r.doc.url));
    const commonUrls = new Set(
      [...keywordUrls].filter(url => semanticUrls.has(url))
    );

    // Process keyword results
    for (const { doc, normalizedScore } of keywordResults) {
      const url = doc.url;
      const id = doc._id?.toString() || url;
      const rank = keywordRanks.get(url) || Infinity;
      const rrfScore = 1 / (k + rank);

      docMap.set(url, {
        id,
        url,
        titel: doc.titel || '',
        samenvatting: doc.samenvatting || '',
        keywordScore: normalizedScore,
        semanticScore: 0,
        finalScore: rrfScore,
        metadata: {
          label: doc.label,
          type_document: doc.type_document,
          website_url: doc.website_url,
          website_titel: doc.website_titel,
          publicatiedatum: doc.publicatiedatum,
          subjects: doc.subjects,
          themes: doc.themes
        },
        _id: doc._id?.toString()
      });
    }

    // Process semantic results
    for (const { doc, normalizedScore } of semanticResults) {
      const url = doc.url;
      const id = doc._id?.toString() || url;
      const rank = semanticRanks.get(url) || Infinity;
      const rrfScore = 1 / (k + rank);
      const isInBoth = commonUrls.has(url);

      if (docMap.has(url)) {
        // Merge: add RRF scores
        const existing = docMap.get(url)!;
        existing.semanticScore = normalizedScore;
        existing.finalScore += rrfScore;

        // Boost documents appearing in both sets (+10%)
        if (isInBoth) {
          existing.finalScore *= 1.1;
        }
      } else {
        docMap.set(url, {
          id,
          url,
          titel: doc.titel || '',
          samenvatting: doc.samenvatting || '',
          keywordScore: 0,
          semanticScore: normalizedScore,
          finalScore: rrfScore,
          metadata: {
            label: doc.label,
            type_document: doc.type_document,
            website_url: doc.website_url,
            website_titel: doc.website_titel,
            publicatiedatum: doc.publicatiedatum,
            subjects: doc.subjects,
            themes: doc.themes
          },
          _id: doc._id?.toString()
        });
      }
    }

    // Sort by final score and return
    return Array.from(docMap.values())
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Merge canonical keyword and semantic results using weighted combination
   */
  private mergeCanonicalResultsWeighted(
    keywordResults: Array<CanonicalKeywordSearchResult & { normalizedScore: number }>,
    semanticResults: Array<CanonicalSemanticSearchResult & { normalizedScore: number }>,
    options: RetrievalOptions
  ): CanonicalRetrievedDocument[] {
    const { keywordWeight = this.defaultKeywordWeight, semanticWeight = this.defaultSemanticWeight } = options;

    // Create a map keyed by canonicalUrl for deduplication
    const docMap = new Map<string, CanonicalRetrievedDocument>();

    // Track which documents appear in both result sets (for boosting)
    const keywordUrls = new Set(
      keywordResults.map(r => r.doc.canonicalUrl || r.doc.sourceMetadata?.legacyUrl || '')
    );
    const semanticUrls = new Set(
      semanticResults.map(r => r.doc.canonicalUrl || r.doc.sourceMetadata?.legacyUrl || '')
    );
    const commonUrls = new Set(
      [...keywordUrls].filter(url => semanticUrls.has(url) && url !== '')
    );

    // Add keyword results
    for (const { doc, normalizedScore } of keywordResults) {
      const url = doc.canonicalUrl || (doc.sourceMetadata?.legacyUrl as string) || '';
      if (!url) continue;

      docMap.set(url, {
        document: doc,
        keywordScore: normalizedScore,
        semanticScore: 0,
        finalScore: keywordWeight * normalizedScore,
      });
    }

    // Add/merge semantic results
    for (const { doc, normalizedScore } of semanticResults) {
      const url = doc.canonicalUrl || (doc.sourceMetadata?.legacyUrl as string) || '';
      if (!url) continue;

      const isInBoth = commonUrls.has(url);

      if (docMap.has(url)) {
        // Merge: document appears in both result sets
        const existing = docMap.get(url)!;
        existing.semanticScore = normalizedScore;

        // Calculate base combined score
        existing.finalScore =
          (keywordWeight * existing.keywordScore) +
          (semanticWeight * normalizedScore);

        // Boost documents appearing in both sets (+10%)
        if (isInBoth) {
          existing.finalScore *= 1.1;
          // Ensure score doesn't exceed 1.0
          existing.finalScore = Math.min(existing.finalScore, 1.0);
        }
      } else {
        // New document from semantic search only
        docMap.set(url, {
          document: doc,
          keywordScore: 0,
          semanticScore: normalizedScore,
          finalScore: semanticWeight * normalizedScore,
        });
      }
    }

    // Sort by final score and return
    return Array.from(docMap.values())
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Main retrieval method: combines keyword and semantic search
   * Uses query caching to reduce computation for repeated queries
   * 
   * @deprecated Use retrieveCanonical() for new code - returns canonical documents directly
   */
  async retrieve(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<RetrievedDocument[]> {
    const {
      keywordWeight = this.defaultKeywordWeight,
      semanticWeight = this.defaultSemanticWeight,
      maxKeywordResults = this.defaultMaxKeywordResults,
      maxSemanticResults = this.defaultMaxSemanticResults,
      similarityThreshold = this.defaultSimilarityThreshold,
      mergeMethod = 'weighted',
      filters
    } = options;

    // Generate cache key from query and options
    // Note: QueryCache doesn't currently support filters in key generation
    // If filters are present, we should bypass cache or implement a way to include them
    const cacheKeyOptions: CacheKeyOptions = {
      query,
      keywordWeight,
      semanticWeight,
      maxKeywordResults,
      maxSemanticResults,
      similarityThreshold,
      mergeMethod
    };

    // Bypass cache if filters are present
    let cachedResult: RetrievedDocument[] | null = null;
    let cacheKey = '';

    if (!filters) {
      cacheKey = queryCache.generateCacheKey(cacheKeyOptions);
      // Check cache first
      cachedResult = await queryCache.get<RetrievedDocument[]>(cacheKey) ?? null;
      if (cachedResult !== null) {
        return cachedResult;
      }
    }

    // Validate weights sum to 1.0 (approximately)
    const totalWeight = keywordWeight + semanticWeight;
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      console.warn(
        `[HybridRetrievalService] Weights don't sum to 1.0 (${totalWeight}), normalizing...`
      );
    }

    // Perform parallel retrieval
    const [keywordResults, semanticResults] = await Promise.all([
      this.keywordSearch(query, maxKeywordResults, filters),
      this.semanticSearch(query, maxSemanticResults, similarityThreshold, filters)
    ]);

    // Normalize scores to [0, 1] range
    const normalizedKeyword = this.normalizeScores(keywordResults);
    const normalizedSemantic = this.normalizeScores(semanticResults);

    // Merge results based on selected method
    let results: RetrievedDocument[];
    if (mergeMethod === 'rrf') {
      results = this.mergeResultsRRF(normalizedKeyword, normalizedSemantic, options);
    } else {
      results = this.mergeResultsWeighted(normalizedKeyword, normalizedSemantic, options);
    }

    // Store in cache if no filters
    if (!filters && cacheKey) {
      queryCache.set(cacheKey, results);
    }

    return results;
  }

  /**
   * Main retrieval method: combines keyword and semantic search
   * Returns canonical documents directly (no legacy transformation)
   * Uses query caching to reduce computation for repeated queries
   */
  async retrieveCanonical(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<CanonicalRetrievedDocument[]> {
    const {
      keywordWeight = this.defaultKeywordWeight,
      semanticWeight = this.defaultSemanticWeight,
      maxKeywordResults = this.defaultMaxKeywordResults,
      maxSemanticResults = this.defaultMaxSemanticResults,
      similarityThreshold = this.defaultSimilarityThreshold,
      mergeMethod = 'weighted',
      filters
    } = options;

    // Generate cache key from query and options
    const cacheKeyOptions: CacheKeyOptions = {
      query,
      keywordWeight,
      semanticWeight,
      maxKeywordResults,
      maxSemanticResults,
      similarityThreshold,
      mergeMethod
    };

    // Bypass cache if filters are present
    let cachedResult: CanonicalRetrievedDocument[] | null = null;
    let canonicalCacheKey = '';

    if (!filters) {
      const cacheKey = queryCache.generateCacheKey(cacheKeyOptions);
      // Check cache first (using a different cache key prefix for canonical results)
      canonicalCacheKey = `canonical:${cacheKey}`;
      cachedResult = await queryCache.get<CanonicalRetrievedDocument[]>(canonicalCacheKey) ?? null;
      if (cachedResult !== null) {
        return cachedResult;
      }
    }

    // Validate weights sum to 1.0 (approximately)
    const totalWeight = keywordWeight + semanticWeight;
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      console.warn(
        `[HybridRetrievalService] Weights don't sum to 1.0 (${totalWeight}), normalizing...`
      );
    }

    // Perform parallel retrieval using canonical methods
    const [keywordResults, semanticResults] = await Promise.all([
      this.keywordSearchCanonical(query, maxKeywordResults, filters),
      this.semanticSearchCanonical(query, maxSemanticResults, similarityThreshold, filters)
    ]);

    // Normalize scores to [0, 1] range
    const normalizedKeyword = this.normalizeScores(keywordResults);
    const normalizedSemantic = this.normalizeScores(semanticResults);

    // Merge results (currently only weighted method supported for canonical)
    const results = this.mergeCanonicalResultsWeighted(normalizedKeyword, normalizedSemantic, options);

    // Store in cache if no filters
    if (!filters && canonicalCacheKey) {
      queryCache.set(canonicalCacheKey, results);
    }

    return results;
  }

  /**
   * Invalidate cache for a specific query
   * Useful when documents are updated and cache needs to be refreshed
   */
  invalidateCache(query?: string): void {
    if (query) {
      queryCache.invalidateByQueryPrefix(query);
    } else {
      queryCache.invalidateAll();
    }
  }

  /**
   * Get cache metrics for monitoring
   */
  getCacheMetrics() {
    return queryCache.getMetrics();
  }
}
