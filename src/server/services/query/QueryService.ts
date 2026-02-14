import { Query } from '../../models/Query.js';
import type { QueryDocument, QueryCreateInput } from '../../types/index.js';
import { KnowledgeBase } from '../knowledgeBase/knowledgeBase.js';
import { logger } from '../../utils/logger.js';
import type { QueryScanResponseDto } from '../../types/dto.js';
import { mapKnowledgeBaseScanToDto } from '../../utils/mappers.js';
import { NotFoundError } from '../../types/errors.js';
import { queryCache } from './QueryCache.js';

/**
 * Service for query-related business logic
 * Handles all query operations and knowledge base searches
 */
export class QueryService {
  private knowledgeBase: KnowledgeBase;

  constructor(knowledgeBase?: KnowledgeBase) {
    this.knowledgeBase = knowledgeBase || new KnowledgeBase();
  }

  /**
   * Initialize the knowledge base
   */
  async initialize(): Promise<void> {
    try {
      await this.knowledgeBase.initialize();
    } catch (error) {
      logger.error({ error }, 'Failed to initialize knowledge base in QueryService');
      throw error;
    }
  }

  /**
   * Create a new query
   */
  async createQuery(queryData: QueryCreateInput): Promise<QueryDocument> {
    try {
      return await Query.create(queryData);
    } catch (error) {
      logger.error({ error, queryData }, 'Error creating query in QueryService');
      throw error;
    }
  }

  /**
   * Get all queries with pagination
   */
  async getAllQueries(options: {
    limit?: number;
    skip?: number;
    status?: 'draft' | 'completed';
    createdBy?: string;
  } = {}): Promise<QueryDocument[]> {
    try {
      const { limit, skip, status, createdBy } = options;
      return await Query.findAll({ limit, skip, status, createdBy });
    } catch (error) {
      logger.error({ error, options }, 'Error fetching queries in QueryService');
      throw error;
    }
  }

  /**
   * Get a query by ID
   */
  async getQueryById(id: string): Promise<QueryDocument | null> {
    try {
      return await Query.findById(id);
    } catch (error) {
      logger.error({ error, id }, 'Error fetching query in QueryService');
      throw error;
    }
  }

  /**
   * Update a query
   */
  async updateQuery(
    id: string,
    updateData: Partial<QueryCreateInput>
  ): Promise<QueryDocument | null> {
    try {
      return await Query.update(id, updateData);
    } catch (error) {
      logger.error({ error, id, updateData }, 'Error updating query in QueryService');
      throw error;
    }
  }

  /**
   * Delete a query
   */
  async deleteQuery(id: string): Promise<boolean> {
    try {
      return await Query.delete(id);
    } catch (error) {
      logger.error({ error, id }, 'Error deleting query in QueryService');
      throw error;
    }
  }

  /**
   * Duplicate a query (create a new query based on an existing one)
   */
  async duplicateQuery(id: string, modifications?: Partial<QueryCreateInput>): Promise<QueryDocument> {
    try {
      const originalQuery = await this.getQueryById(id);
      if (!originalQuery) {
        throw new NotFoundError('Query', id, {
          reason: 'query_not_found',
          operation: 'updateQuery',
        });
      }

      // Create new query data based on original, with optional modifications
      const duplicateData: QueryCreateInput = {
        overheidstype: modifications?.overheidstype ?? originalQuery.overheidstype,
        overheidsinstantie: modifications?.overheidsinstantie ?? originalQuery.overheidsinstantie,
        onderwerp: modifications?.onderwerp ?? originalQuery.onderwerp,
        websiteTypes: modifications?.websiteTypes ?? originalQuery.websiteTypes ?? [],
        websiteUrls: modifications?.websiteUrls ?? originalQuery.websiteUrls ?? [],
        documentUrls: modifications?.documentUrls ?? originalQuery.documentUrls ?? [],
        // Reset status to draft for new query
        status: 'draft',
      };

      return await Query.create(duplicateData);
    } catch (error) {
      logger.error({ error, id, modifications }, 'Error duplicating query in QueryService');
      throw error;
    }
  }

  /**
   * Scan knowledge base for relevant content
   */
  async scanKnowledgeBase(
    queryId: string,
    queryText: string,
    maxResults: number = 5
  ): Promise<QueryScanResponseDto> {
    try {
      // Check cache first
      const cacheKey = queryCache.generateCacheKey({
        query: queryText,
        maxKeywordResults: maxResults
      });

      const searchByKeywordMethod = this.knowledgeBase.searchByKeyword.bind(this.knowledgeBase);
      const getRelatedContentMethod = this.knowledgeBase.getRelatedContent.bind(this.knowledgeBase);
      const cached = await queryCache.get<{
        searchResults: Awaited<ReturnType<typeof searchByKeywordMethod>>;
        relatedContent: Awaited<ReturnType<typeof getRelatedContentMethod>>;
      }>(cacheKey);

      if (cached) {
        logger.debug({ queryId, cacheKey }, 'Cache hit for knowledge base scan');
        return mapKnowledgeBaseScanToDto(queryId, queryText, cached.searchResults, cached.relatedContent);
      }

      // Search knowledge base for relevant content
      const searchResults = await this.knowledgeBase.searchByKeyword(queryText, maxResults);

      // Get related content for top result if found
      let relatedContent: Awaited<ReturnType<typeof this.knowledgeBase.getRelatedContent>> = [];
      if (searchResults.length > 0) {
        const topResult = searchResults[0].document;
        relatedContent = await this.knowledgeBase.getRelatedContent(topResult.url, 1);
      }

      // Cache the results (default TTL)
      await queryCache.set(cacheKey, { searchResults, relatedContent });

      return mapKnowledgeBaseScanToDto(queryId, queryText, searchResults, relatedContent);
    } catch (error) {
      logger.error({ error, queryId, queryText }, 'Error scanning knowledge base in QueryService');
      throw error;
    }
  }
}

let queryServiceInstance: QueryService | null = null;

export const getQueryService = (): QueryService => {
  if (!queryServiceInstance) {
    queryServiceInstance = new QueryService();
  }
  return queryServiceInstance;
};
