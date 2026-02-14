/**
 * Benchmark Search Executor
 * Handles all search execution logic for benchmarks
 */

import { Filter } from 'mongodb';
import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { HybridRetrievalService, RetrievedDocument, CanonicalRetrievedDocument } from '../query/HybridRetrievalService.js';
import type { CanonicalDocument } from '../../contracts/types.js';
import { VectorService } from '../query/VectorService.js';
import { RelevanceScorerService } from '../query/relevanceScorer.js';
import { RerankerService, type RerankerResult } from '../retrieval/RerankerService.js';
import type { ScrapedDocument, DocumentType } from '../infrastructure/types.js';
import type { BronDocumentDocument } from '../../types/index.js'; // Needed for executeSearchWithRelevanceConfig
import { BronDocument } from '../../models/BronDocument.js'; // Needed for executeSearchWithRelevanceConfig (legacy method)

/**
 * Service for executing searches in benchmark contexts
 */
export class BenchmarkSearchExecutor {
  /**
   * Execute search with a specific benchmark configuration
   */
  async executeSearchWithConfig(
    query: string,
    config: { name: string; description: string; settings: Partial<Record<string, boolean | number | string>> }
  ): Promise<Array<ScrapedDocument | RetrievedDocument>> {
    logger.debug({ config: config.name, query }, 'Executing search with config');

    // Apply config settings to environment (temporarily)
    const originalEnv: Record<string, string | undefined> = {};
    Object.entries(config.settings).forEach(([key, value]) => {
      originalEnv[key] = process.env[key];
      if (typeof value === 'boolean') {
        process.env[key] = value ? 'true' : 'false';
      } else if (typeof value === 'number') {
        process.env[key] = value.toString();
      } else if (typeof value === 'string') {
        process.env[key] = value;
      }
    });

    try {
      let documents: RetrievedDocument[] = [];

      if (config.settings.HYBRID_RETRIEVAL_ENABLED && config.settings.EMBEDDING_ENABLED) {
        // Initialize services with current config
        logger.debug({ config: config.name }, 'Initializing VectorService and HybridRetrievalService');
        try {
          const vectorService = new VectorService();
          await vectorService.init();
          logger.debug({ config: config.name }, 'VectorService initialized');

          const hybridRetrievalService = new HybridRetrievalService(vectorService);
          await hybridRetrievalService.init();
          logger.debug({ config: config.name }, 'HybridRetrievalService initialized');

          // Use canonical retrieval method (returns canonical documents directly)
          const canonicalResults = await hybridRetrievalService.retrieveCanonical(query, {
            keywordWeight: typeof config.settings.SCORE_KEYWORD_WEIGHT === 'number' ? config.settings.SCORE_KEYWORD_WEIGHT : 0.5,
            semanticWeight: typeof config.settings.SCORE_SEMANTIC_WEIGHT === 'number' ? config.settings.SCORE_SEMANTIC_WEIGHT : 0.5,
          });
          // Use canonical format directly - no transformation needed
          // Map to RetrievedDocument format for compatibility with existing code
          documents = canonicalResults.map(result => ({
            id: result.document._id!.toString(),
            url: result.document.canonicalUrl || (result.document.sourceMetadata?.url as string) || '',
            titel: result.document.title,
            samenvatting: result.document.fullText || '',
            keywordScore: result.keywordScore,
            semanticScore: result.semanticScore,
            finalScore: result.finalScore,
            combinedScore: result.keywordScore * (typeof config.settings.SCORE_KEYWORD_WEIGHT === 'number' ? config.settings.SCORE_KEYWORD_WEIGHT : 0.5) +
              result.semanticScore * (typeof config.settings.SCORE_SEMANTIC_WEIGHT === 'number' ? config.settings.SCORE_SEMANTIC_WEIGHT : 0.5),
            metadata: {
              ...result.document.sourceMetadata,
              ...result.document.enrichmentMetadata,
            },
          }));
          logger.debug({ config: config.name, query, documentCount: documents.length }, 'HybridRetrievalService results');
        } catch (error) {
          logger.error({ error, config: config.name, query }, 'Error initializing or using hybrid retrieval services, falling back to MongoDB query');
          // Fallback to MongoDB query if hybrid retrieval fails
          documents = await this.executeMongoQuery(query);
        }
      } else {
        // Fallback to basic MongoDB query
        logger.debug({ config: config.name }, 'Using MongoDB query (hybrid retrieval disabled)');
        documents = await this.executeMongoQuery(query);
      }

      if (documents.length === 0) {
        logger.warn({ config: config.name, query }, 'Search returned 0 documents');
      } else {
        logger.debug({ config: config.name, query, documentCount: documents.length }, 'Search execution completed');
      }

      return documents;
    } catch (error) {
      logger.error({ error, config: config.name, query }, 'Error executing search with config');
      // Try fallback to MongoDB query
      try {
        logger.debug({ config: config.name, query }, 'Attempting MongoDB query fallback');
        return await this.executeMongoQuery(query);
      } catch (fallbackError) {
        logger.error({ error: fallbackError, config: config.name, query }, 'MongoDB query fallback also failed');
        throw error; // Throw original error
      }
    } finally {
      // Restore original environment
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      });
    }
  }

  /**
   * Execute search with relevance scorer configuration
   */
  async executeSearchWithRelevanceConfig(
    query: string,
    weights: { keyword: number; semantic: number }
  ): Promise<Array<ScrapedDocument & { score?: number }>> {
    const relevanceScorer = new RelevanceScorerService();
    const db = getDB();
    const collection = db.collection<BronDocumentDocument>('brondocumenten');
    const queryFilter: Filter<BronDocumentDocument> = {
      $or: [
        { titel: { $regex: query, $options: 'i' } },
        { samenvatting: { $regex: query, $options: 'i' } },
      ],
    };
    const results = await collection
      .find(queryFilter)
      .limit(100)
      .toArray();

    // Score and rank documents
    const scored = results.map((doc) => {
      const scrapedDoc = doc as unknown as ScrapedDocument;
      // Use calculateRelevance with query as onderwerp and defaults for other params
      const score = relevanceScorer.calculateRelevance(
        scrapedDoc,
        query,
        '', // thema - empty for general queries
        '' // overheidslaag - empty for general queries
      );
      return { ...scrapedDoc, score };
    });

    return scored.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 50);
  }

  /**
   * Execute search with reranker
   */
  async executeSearchWithReranker(query: string, useReranker: boolean): Promise<ScrapedDocument[]> {
    const db = getDB();
    const collection = db.collection<BronDocumentDocument>('brondocumenten');
    const queryFilter: Filter<BronDocumentDocument> = {
      $or: [
        { titel: { $regex: query, $options: 'i' } },
        { samenvatting: { $regex: query, $options: 'i' } },
      ],
    };
    const mongoResults = await collection
      .find(queryFilter)
      .limit(useReranker ? 100 : 50)
      .toArray();

    // Convert WithId<Document>[] to ScrapedDocument[]
    const documents: ScrapedDocument[] = mongoResults.map((doc) => {
      const typedDoc = doc as unknown as BronDocumentDocument;
      // Convert type_document string to DocumentType, defaulting to 'Webpagina' if invalid
      const typeDocument = (typedDoc.type_document as DocumentType) || 'Webpagina';
      const validDocumentTypes: DocumentType[] = [
        'PDF', 'Omgevingsvisie', 'Omgevingsplan', 'Bestemmingsplan',
        'Structuurvisie', 'Beleidsregel', 'Beleidsnota', 'Verordening',
        'Visiedocument', 'Rapport', 'Besluit', 'Beleidsdocument', 'Webpagina'
      ];
      const documentType: DocumentType = validDocumentTypes.includes(typeDocument)
        ? typeDocument
        : 'Webpagina';
      return {
        titel: typedDoc.titel || '',
        url: typedDoc.url || '',
        website_url: typedDoc.website_url || typedDoc.url || '',
        samenvatting: typedDoc.samenvatting || '',
        type_document: documentType,
        publicatiedatum: typedDoc.publicatiedatum || null,
      };
    });

    if (useReranker) {
      const reranker = new RerankerService();
      const rerankedResults = await reranker.rerank(documents, query);
      // Extract documents from RerankerResult[]
      return rerankedResults.map((result: RerankerResult) => result.document).slice(0, 50);
    }

    return documents.slice(0, 50);
  }

  /**
   * Execute hybrid search
   */
  async executeHybridSearch(
    query: string,
    keywordWeight: number,
    semanticWeight: number
  ): Promise<RetrievedDocument[]> {
    const vectorService = new VectorService();
    await vectorService.init();
    const hybridRetrievalService = new HybridRetrievalService(vectorService);
    await hybridRetrievalService.init();

    // Use canonical retrieval method (returns canonical documents directly)
    const canonicalResults = await hybridRetrievalService.retrieveCanonical(query, {
      keywordWeight,
      semanticWeight,
    });

    // Map canonical results to RetrievedDocument format for compatibility
    // Note: Using canonical format directly - no transformation to legacy format

    // Map canonical results to RetrievedDocument format for compatibility
    // Note: Using canonical document fields directly - no legacy transformation
    // This is more efficient than transformCanonicalToLegacy() and uses canonical format
    return canonicalResults.map(result => ({
      id: result.document._id!.toString(),
      url: result.document.canonicalUrl || (result.document.sourceMetadata?.url as string) || '',
      titel: result.document.title,
      samenvatting: result.document.fullText || '',
      keywordScore: result.keywordScore,
      semanticScore: result.semanticScore,
      finalScore: result.finalScore,
      combinedScore: result.keywordScore * keywordWeight + result.semanticScore * semanticWeight,
      metadata: {
        ...result.document.sourceMetadata,
        ...result.document.enrichmentMetadata,
      },
    }));
  }

  /**
   * Execute MongoDB query directly (using canonical documents)
   */
  async executeMongoQuery(query: string, limit: number = 50): Promise<RetrievedDocument[]> {
    try {
      // Query canonical documents directly (for benchmarking performance)
      // Note: For production use, prefer SearchService which provides unified search
      const db = getDB();
      const collection = db.collection<CanonicalDocument>('canonical_documents');

      const queryFilter = {
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { fullText: { $regex: query, $options: 'i' } },
        ],
      };

      logger.debug({ query, filter: queryFilter }, 'Executing MongoDB query on canonical_documents');

      const canonicalDocs = await collection
        .find(queryFilter)
        .limit(limit)
        .toArray();

      logger.debug({ query, resultCount: canonicalDocs.length }, 'MongoDB query results');

      // Map to RetrievedDocument[] directly from canonical documents
      return canonicalDocs.map((doc) => {
        return {
          id: doc._id?.toString() || '',
          url: doc.canonicalUrl || (doc.sourceMetadata?.url as string) || '',
          titel: doc.title || '',
          samenvatting: doc.fullText || '',
          keywordScore: 0,
          semanticScore: 0,
          finalScore: 0,
          metadata: {
            ...doc.sourceMetadata,
            ...doc.enrichmentMetadata
          },
          _id: doc._id?.toString() || '',
        };
      });
    } catch (error) {
      logger.error({ error, query }, 'Error executing MongoDB query');
      throw error;
    }
  }
}

