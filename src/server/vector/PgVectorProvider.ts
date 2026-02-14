/**
 * PgVectorProvider - pgvector implementation of VectorSearchProvider
 * 
 * Provides vector similarity search using pgvector extension in PostgreSQL.
 * Supports filtered retrieval by documentIds (from PostGIS/keyword prefilter).
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/06-vector-search.md
 */

import { getPostgresPool, testPostgresConnection } from '../config/postgres.js';
import type { VectorSearchProvider, VectorSearchResult } from '../contracts/types.js';
import { logger } from '../utils/logger.js';
import { validateEnv } from '../config/env.js';

/**
 * Configuration for pgvector indexes
 */
export interface PgVectorIndexConfig {
  indexType: 'hnsw' | 'ivfflat';
  // HNSW parameters
  hnswM?: number; // Number of bi-directional links (default: 16)
  hnswEfConstruction?: number; // Size of dynamic candidate list (default: 64)
  // IVFFLAT parameters
  ivfflatLists?: number; // Number of clusters (default: 100)
}

/**
 * PgVectorProvider - pgvector implementation
 */
export class PgVectorProvider implements VectorSearchProvider {
  private readonly schema: string;
  private readonly indexConfig: PgVectorIndexConfig;
  private schemaEnsured = false;

  constructor(config?: { schema?: string; indexConfig?: PgVectorIndexConfig }) {
    const env = validateEnv();
    this.schema = config?.schema || process.env.PGVECTOR_SCHEMA || 'vector';

    if (!/^[a-z0-9_]+$/i.test(this.schema)) {
      throw new Error(`Invalid schema name: ${this.schema}. Only alphanumeric characters and underscores are allowed.`);
    }

    // Default index config from environment or defaults
    const indexType = (process.env.PGVECTOR_INDEX_TYPE || 'hnsw') as 'hnsw' | 'ivfflat';
    this.indexConfig = config?.indexConfig || {
      indexType,
      hnswM: parseInt(process.env.PGVECTOR_HNSW_M || '16', 10),
      hnswEfConstruction: parseInt(process.env.PGVECTOR_HNSW_EF_CONSTRUCTION || '64', 10),
      ivfflatLists: parseInt(process.env.PGVECTOR_IVFFLAT_LISTS || '100', 10),
    };
  }

  /**
   * Escape identifier (schema/table name) to prevent SQL injection
   *
   * Doubles double quotes and wraps in double quotes.
   */
  private escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  /**
   * Check if PostgreSQL connection is available
   */
  private async checkConnection(): Promise<boolean> {
    try {
      return await testPostgresConnection();
    } catch (error) {
      logger.debug({ error }, 'PostgreSQL connection check failed');
      return false;
    }
  }

  /**
   * Ensure pgvector schema and tables exist
   * 
   * Gracefully handles connection failures - logs warning but doesn't throw
   */
  async ensureSchema(): Promise<void> {
    if (this.schemaEnsured) {
      return;
    }

    // Check connection before attempting schema operations
    const isConnected = await this.checkConnection();
    if (!isConnected) {
      logger.warn(
        { schema: this.schema },
        'PostgreSQL connection not available, skipping schema initialization. Vector search will be unavailable.'
      );
      // Don't throw - allow SearchService to fall back to keyword-only search
      return;
    }

    const pool = getPostgresPool();

    try {
      // Enable pgvector extension
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector');

      // Create schema (quote identifier to handle special characters)
      await pool.query(`CREATE SCHEMA IF NOT EXISTS ${this.escapeIdentifier(this.schema)}`);

      // Create table (quote schema and table names)
      const schemaQuoted = this.escapeIdentifier(this.schema);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${schemaQuoted}.chunk_embeddings (
          chunk_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          document_id TEXT NOT NULL,
          embedding vector NOT NULL,
          dims INTEGER NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          PRIMARY KEY (chunk_id, model_id)
        );
      `);

      // Create indexes (quote schema and table names)
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_document_id 
          ON ${schemaQuoted}.chunk_embeddings 
          USING BTREE (document_id);
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_model_id 
          ON ${schemaQuoted}.chunk_embeddings 
          USING BTREE (model_id);
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_updated_at 
          ON ${schemaQuoted}.chunk_embeddings 
          USING BTREE (updated_at);
      `);

      // Create vector similarity index (if not exists)
      // Check if index already exists to avoid errors
      const indexName = `idx_chunk_embeddings_vector_${this.indexConfig.indexType}`;
      const indexExists = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE schemaname = $1 
          AND indexname = $2
        );
      `, [this.schema, indexName]);

      if (!indexExists.rows[0].exists) {
        const schemaQuoted = this.escapeIdentifier(this.schema);
        const tableQuoted = `${schemaQuoted}."chunk_embeddings"`;
        const indexNameQuoted = `"${indexName}"`;

        try {
          if (this.indexConfig.indexType === 'hnsw') {
            // CREATE INDEX WITH clause doesn't support parameterized queries
            // Note: HNSW index creation may fail on empty tables in some pgvector versions
            // It will be created automatically when first data is inserted
            await pool.query(`
              CREATE INDEX ${indexNameQuoted}
                ON ${tableQuoted}
                USING hnsw (embedding vector_cosine_ops)
                WITH (m = ${this.indexConfig.hnswM}, ef_construction = ${this.indexConfig.hnswEfConstruction});
            `);
          } else {
            // IVFFLAT requires knowing the vector dimension
            // We'll create it without dimension for now, or require it in config
            // For now, use a default dimension (384 for common models)
            const defaultDims = 384;
            // CREATE INDEX WITH clause doesn't support parameterized queries
            await pool.query(`
              CREATE INDEX ${indexNameQuoted}
                ON ${tableQuoted}
                USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = ${this.indexConfig.ivfflatLists});
            `);
          }

          logger.info(
            {
              indexType: this.indexConfig.indexType,
              schema: this.schema,
              indexName,
            },
            'Created pgvector similarity index'
          );
        } catch (indexError) {
          // Index creation may fail on empty tables - that's okay, it will be created when data is inserted
          logger.warn(
            {
              error: indexError,
              indexType: this.indexConfig.indexType,
              schema: this.schema,
              indexName,
            },
            'Failed to create pgvector index (will be created when data is inserted)'
          );
        }
      }

      // Create trigger function for updated_at
      await pool.query(`
        CREATE OR REPLACE FUNCTION ${schemaQuoted}.update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // Create trigger
      await pool.query(`
        DROP TRIGGER IF EXISTS update_chunk_embeddings_updated_at ON ${schemaQuoted}.chunk_embeddings;
        CREATE TRIGGER update_chunk_embeddings_updated_at
          BEFORE UPDATE ON ${schemaQuoted}.chunk_embeddings
          FOR EACH ROW
          EXECUTE FUNCTION ${schemaQuoted}.update_updated_at_column();
      `);

      this.schemaEnsured = true;
      logger.info({ schema: this.schema }, 'pgvector schema ensured');
    } catch (error) {
      // Log error but don't throw - allow graceful degradation
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('PostgreSQL authentication failed') ||
        errorMessage.includes('PostgreSQL connection refused') ||
        errorMessage.includes('password authentication failed')) {
        logger.warn(
          { error, schema: this.schema },
          'PostgreSQL connection failed during schema initialization. Vector search will be unavailable. Use GET /api/search as workaround.'
        );
      } else {
        logger.error({ error, schema: this.schema }, 'Failed to ensure pgvector schema');
      }
      // Don't throw - allow SearchService to fall back to keyword-only search
      // Schema will be retried on next operation if connection becomes available
    }
  }

  /**
   * Upsert embedding for a chunk
   * 
   * Idempotent by (chunkId, modelId).
   */
  async upsertEmbedding(
    chunkId: string,
    documentId: string,
    modelId: string,
    embedding: number[],
    dims: number
  ): Promise<void> {
    if (embedding.length !== dims) {
      throw new Error(`Embedding dimension mismatch: expected ${dims}, got ${embedding.length}`);
    }

    await this.ensureSchema();
    const pool = getPostgresPool();

    try {
      // pgvector expects JSON array format: '[1,2,3]'
      // pg driver converts JavaScript arrays to PostgreSQL array format {1,2,3}
      // So we need to pass as JSON string and cast to vector
      const vectorJson = JSON.stringify(embedding);
      const schemaQuoted = this.escapeIdentifier(this.schema);

      await pool.query(`
        INSERT INTO ${schemaQuoted}.chunk_embeddings (
          chunk_id,
          model_id,
          document_id,
          embedding,
          dims,
          updated_at,
          created_at
        )
        VALUES ($1, $2, $3, $4::text::vector, $5, NOW(), NOW())
        ON CONFLICT (chunk_id, model_id)
        DO UPDATE SET
          embedding = EXCLUDED.embedding,
          document_id = EXCLUDED.document_id,
          dims = EXCLUDED.dims,
          updated_at = NOW();
      `, [chunkId, modelId, documentId, vectorJson, dims]);

      logger.debug(
        { chunkId, modelId, dims },
        'Upserted chunk embedding in pgvector'
      );
    } catch (error) {
      logger.error(
        { error, chunkId, modelId },
        'Failed to upsert embedding in pgvector'
      );
      throw error;
    }
  }

  /**
   * Search for similar chunks
   * 
   * Uses cosine similarity (1 - cosine_distance) for scoring.
   * Supports filtering by documentIds (from PostGIS/keyword prefilter).
   */
  async search(
    queryEmbedding: number[],
    modelId: string,
    topK: number,
    filters?: { documentIds?: string[] }
  ): Promise<VectorSearchResult[]> {
    // Check connection before attempting search
    const isConnected = await this.checkConnection();
    if (!isConnected) {
      logger.debug(
        { modelId, topK },
        'PostgreSQL connection not available, throwing error to trigger fallback'
      );
      throw new Error('PostgreSQL connection failed');
    }

    await this.ensureSchema();
    const pool = getPostgresPool();

    try {
      // pgvector expects JSON array format: '[1,2,3]'
      // pg driver converts JavaScript arrays to PostgreSQL array format {1,2,3}
      // So we need to pass as JSON string and cast to vector
      const queryVectorJson = JSON.stringify(queryEmbedding);
      const schemaQuoted = this.escapeIdentifier(this.schema);

      // Build query with optional documentId filter
      // Use CAST($1::text AS vector) to ensure proper parsing
      let query = `
        SELECT 
          chunk_id,
          document_id,
          1 - (embedding <=> CAST($1::text AS vector)) as score
        FROM ${schemaQuoted}.chunk_embeddings
        WHERE model_id = $2
      `;

      // Pass as JSON string, cast to text then vector
      const params: unknown[] = [queryVectorJson, modelId];
      let paramIndex = 3;

      if (filters?.documentIds && filters.documentIds.length > 0) {
        // Convert documentIds to strings to ensure type consistency
        // MongoDB ObjectIds might be passed as objects, so stringify them
        const documentIdStrings = filters.documentIds.map(id => String(id));

        // Use unnest approach which works better with pg driver arrays
        // This creates a subquery that unnests the array parameter
        query += ` AND document_id IN (SELECT unnest($${paramIndex}::text[]))`;
        params.push(documentIdStrings);
        paramIndex++;

        logger.debug(
          {
            documentIds: documentIdStrings.slice(0, 3),
            documentIdsCount: documentIdStrings.length,
            paramIndex,
            firstDocumentId: documentIdStrings[0],
            firstDocumentIdType: typeof documentIdStrings[0],
          },
          'Added documentId filter to query (using unnest)'
        );
      }

      query += `
        ORDER BY embedding <=> CAST($1::text AS vector)
        LIMIT $${paramIndex};
      `;
      params.push(topK);

      logger.debug(
        {
          modelId,
          topK,
          hasDocumentFilter: !!filters?.documentIds,
          documentIdCount: filters?.documentIds?.length || 0,
          queryVectorLength: queryEmbedding.length,
          queryVectorJsonPreview: queryVectorJson.substring(0, 100),
          queryPreview: query.substring(0, 200),
          paramCount: params.length,
        },
        'Executing vector search'
      );

      const result = await pool.query(query, params);

      logger.debug(
        {
          rowCount: result.rows.length,
          modelId,
          queryExecuted: query.substring(0, 300),
        },
        'Vector search query executed'
      );

      const results: VectorSearchResult[] = result.rows.map(row => ({
        chunkId: row.chunk_id,
        documentId: row.document_id,
        score: parseFloat(row.score),
      }));

      logger.debug(
        {
          modelId,
          topK,
          resultCount: results.length,
          hasFilter: !!filters?.documentIds,
          filterDocumentIds: filters?.documentIds?.slice(0, 3),
          scores: results.slice(0, 3).map(r => r.score),
        },
        'Vector search completed'
      );

      return results;
    } catch (error) {
      // Log error and throw to trigger fallback in SearchService
      // SearchService expects an error to switch to keyword-only search
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('PostgreSQL authentication failed') ||
        errorMessage.includes('PostgreSQL connection refused') ||
        errorMessage.includes('password authentication failed')) {
        logger.warn(
          { error, modelId },
          'PostgreSQL connection failed during vector search, throwing error. SearchService will fall back to keyword-only search.'
        );
        throw error;
      } else {
        logger.error({ error, modelId }, 'Failed to search in pgvector');
      }
      throw error;
    }
  }

  /**
   * Delete embedding for a chunk
   */
  async deleteEmbedding(chunkId: string, modelId: string): Promise<void> {
    await this.ensureSchema();
    const pool = getPostgresPool();

    try {
      // Quote schema to prevent injection and handle special characters
      const schemaQuoted = `"${this.schema}"`;
      await pool.query(
        `DELETE FROM ${this.escapeIdentifier(this.schema)}.chunk_embeddings WHERE chunk_id = $1 AND model_id = $2`,
        [chunkId, modelId]
      );

      logger.debug({ chunkId, modelId }, 'Deleted chunk embedding from pgvector');
    } catch (error) {
      logger.error({ error, chunkId, modelId }, 'Failed to delete embedding from pgvector');
      throw error;
    }
  }
}

