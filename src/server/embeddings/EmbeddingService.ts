/**
 * EmbeddingService - Service for generating and storing chunk embeddings
 * 
 * Provides idempotent embedding generation with model registry and pgvector integration.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/05-embedding.md
 */

import type { CanonicalChunk, ServiceContext, EmbeddingService as IEmbeddingService, CanonicalChunkDraft } from '../contracts/types.js';
import { CanonicalChunkService } from '../services/canonical/CanonicalChunkService.js';
import { PgVectorProvider } from '../vector/PgVectorProvider.js';
import { getModelRegistry } from './modelRegistry.js';
import type { EmbeddingProvider } from './EmbeddingProvider.js';
import { LocalEmbeddingProviderAdapter } from './providers/LocalEmbeddingProviderAdapter.js';
import { logger } from '../utils/logger.js';

/**
 * Batch embedding configuration
 */
export interface BatchEmbeddingConfig {
  batchSize?: number; // Number of chunks to process in parallel (default: 10)
  throttleMs?: number; // Delay between batches in milliseconds (default: 100)
  maxRetries?: number; // Maximum retries for failed embeddings (default: 3)
}

/**
 * Embedding result
 */
export interface EmbeddingResult {
  chunkId: string;
  success: boolean;
  error?: string;
  skipped?: boolean; // True if skipped due to idempotency
}

/**
 * EmbeddingService - Main embedding service
 * 
 * Implements EmbeddingService interface from contracts.
 */
export class EmbeddingService implements IEmbeddingService {
  private chunkService: CanonicalChunkService;
  private vectorProvider: PgVectorProvider;
  private modelRegistry = getModelRegistry();
  private providers: Map<string, EmbeddingProvider> = new Map();

  constructor(
    chunkService?: CanonicalChunkService,
    vectorProvider?: PgVectorProvider
  ) {
    this.chunkService = chunkService || new CanonicalChunkService();
    this.vectorProvider = vectorProvider || new PgVectorProvider();
  }

  /**
   * Get or create embedding provider for a model
   * 
   * @param modelId - Model ID
   * @returns Embedding provider
   */
  private getProvider(modelId: string): EmbeddingProvider {
    if (this.providers.has(modelId)) {
      return this.providers.get(modelId)!;
    }

    // Get model from registry
    const modelEntry = this.modelRegistry.get(modelId);
    if (!modelEntry) {
      throw new Error(`Model not found in registry: ${modelId}`);
    }

    // Create provider based on type
    let provider: EmbeddingProvider;
    
    if (modelEntry.provider === 'local') {
      provider = new LocalEmbeddingProviderAdapter(modelId);
    } else {
      throw new Error(`Unsupported provider type: ${modelEntry.provider}`);
    }

    this.providers.set(modelId, provider);
    return provider;
  }

  /**
   * Ensure embeddings for chunks
   * 
   * Idempotent by (chunkId, modelId). Skips if chunk already has embedding
   * for modelId and chunkFingerprint is unchanged.
   * 
   * @param chunkIds - Array of chunk IDs to embed
   * @param modelId - Model ID to use
   * @param ctx - Service context (may include session for transactions)
   * @returns Array of embedding results
   */
  async ensureEmbeddingsForChunks(
    chunkIds: string[],
    modelId: string,
    ctx: ServiceContext
  ): Promise<EmbeddingResult[]> {
    // Validate model
    const modelEntry = this.modelRegistry.get(modelId);
    if (!modelEntry) {
      throw new Error(`Model not found in registry: ${modelId}`);
    }

    // Get provider
    const provider = this.getProvider(modelId);

    // Load chunks
    const foundChunks = await this.chunkService.findByChunkIds(chunkIds, ctx);
    const chunkMap = new Map(foundChunks.map(c => [c.chunkId, c]));

    // Map back to original order, inserting nulls for missing chunks
    const chunks = chunkIds.map(id => chunkMap.get(id) || null);

    const results: EmbeddingResult[] = [];

    // Process chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) {
        results.push({
          chunkId: chunkIds[i],
          success: false,
          error: 'Chunk not found',
        });
        continue;
      }

      try {
        // Check idempotency: skip if embedding exists for this modelId and chunkFingerprint unchanged
        // The idempotency key is (chunkId, modelId), and we skip if fingerprint matches
        if (chunk.embedding && chunk.embedding.modelId === modelId) {
          // If fingerprint matches, embedding is up-to-date (skip)
          // Note: We compare chunkFingerprint to ensure content hasn't changed
          // The embedding metadata update will be idempotent by (chunkId, modelId)
          const existingFingerprint = chunk.embedding.vectorRef || chunk.chunkFingerprint;
          if (existingFingerprint === chunk.chunkFingerprint) {
            results.push({
              chunkId: chunk.chunkId,
              success: true,
              skipped: true,
            });
            continue;
          }
        }

        // Generate embedding (may be out-of-transaction)
        const embedding = await provider.generateEmbedding(chunk.text);

        // Validate dimensions
        if (embedding.length !== modelEntry.dims) {
          throw new Error(
            `Embedding dimension mismatch: expected ${modelEntry.dims}, got ${embedding.length}`
          );
        }

        // Store in pgvector (idempotent by chunkId + modelId)
        await this.vectorProvider.upsertEmbedding(
          chunk.chunkId,
          chunk.documentId,
          modelId,
          embedding,
          modelEntry.dims
        );

        // Update chunk metadata in MongoDB (replay-safe, within transaction if session provided)
        // Store chunkFingerprint in vectorRef for idempotency checking
        await this.updateChunkEmbeddingMetadata(
          chunk.chunkId,
          modelId,
          modelEntry.dims,
          chunk.chunkFingerprint,
          ctx
        );

        results.push({
          chunkId: chunk.chunkId,
          success: true,
        });

        logger.debug(
          { chunkId: chunk.chunkId, modelId, dims: modelEntry.dims },
          'Generated and stored embedding for chunk'
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          chunkId: chunk.chunkId,
          success: false,
          error: errorMessage,
        });

        logger.error(
          { error, chunkId: chunk.chunkId, modelId },
          'Failed to generate embedding for chunk'
        );
      }
    }

    return results;
  }

  /**
   * Embed and upsert chunks
   * 
   * Convenience method that embeds chunks and updates them in one call.
   * 
   * @param chunks - Array of chunk drafts to embed
   * @param modelId - Model ID to use
   * @param ctx - Service context
   * @returns Array of updated chunks with embedding metadata
   */
  async embedAndUpsert(
    chunks: CanonicalChunkDraft[],
    modelId: string,
    ctx: ServiceContext
  ): Promise<unknown> {
    // Validate model
    const modelEntry = this.modelRegistry.get(modelId);
    if (!modelEntry) {
      throw new Error(`Model not found in registry: ${modelId}`);
    }

    const provider = this.getProvider(modelId);
    const results: unknown[] = [];

    for (const chunk of chunks) {
      try {
        // Generate embedding
        const embedding = await provider.generateEmbedding(chunk.text);

        // Store in pgvector
        await this.vectorProvider.upsertEmbedding(
          chunk.chunkId,
          chunk.documentId,
          modelId,
          embedding,
          modelEntry.dims
        );

        // Update chunk metadata
        await this.updateChunkEmbeddingMetadata(
          chunk.chunkId,
          modelId,
          modelEntry.dims,
          chunk.chunkFingerprint,
          ctx
        );

        results.push({ chunkId: chunk.chunkId, success: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
          { error, chunkId: chunk.chunkId, modelId },
          'Failed to embed chunk'
        );
        results.push({ chunkId: chunk.chunkId, success: false, error: errorMessage });
      }
    }

    return results;
  }

  /**
   * Batch embed chunks with throttling
   * 
   * @param chunkIds - Array of chunk IDs
   * @param modelId - Model ID
   * @param config - Batch configuration
   * @param ctx - Service context
   * @returns Array of embedding results
   */
  async batchEmbedChunks(
    chunkIds: string[],
    modelId: string,
    config: BatchEmbeddingConfig,
    ctx: ServiceContext
  ): Promise<EmbeddingResult[]> {
    const batchSize = config.batchSize ?? 10;
    const throttleMs = config.throttleMs ?? 100;
    const maxRetries = config.maxRetries ?? 3;

    const allResults: EmbeddingResult[] = [];

    // Process in batches
    for (let i = 0; i < chunkIds.length; i += batchSize) {
      const batch = chunkIds.slice(i, i + batchSize);
      
      // Retry logic for batch
      let attempts = 0;
      let batchResults: EmbeddingResult[] = [];

      while (attempts < maxRetries) {
        try {
          batchResults = await this.ensureEmbeddingsForChunks(batch, modelId, ctx);
          break; // Success, exit retry loop
        } catch (error) {
          attempts++;
          if (attempts >= maxRetries) {
            // Mark all as failed
            batchResults = batch.map(chunkId => ({
              chunkId,
              success: false,
              error: `Failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`,
            }));
          } else {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, throttleMs * attempts));
          }
        }
      }

      allResults.push(...batchResults);

      // Throttle between batches
      if (i + batchSize < chunkIds.length) {
        await new Promise(resolve => setTimeout(resolve, throttleMs));
      }
    }

    logger.info(
      {
        totalChunks: chunkIds.length,
        successful: allResults.filter(r => r.success).length,
        failed: allResults.filter(r => !r.success).length,
        skipped: allResults.filter(r => r.skipped).length,
        modelId,
      },
      'Batch embedding completed'
    );

    return allResults;
  }

  /**
   * Load chunk by chunkId
   */
  private async _loadChunk(
    chunkId: string,
    ctx: ServiceContext
  ): Promise<CanonicalChunk | null> {
    return await this.chunkService.findByChunkId(chunkId, ctx);
  }

  /**
   * Update chunk embedding metadata
   * 
   * Idempotent update of embedding metadata in MongoDB.
   * Stores chunkFingerprint in vectorRef for idempotency checking.
   * 
   * @param chunkId - Chunk ID
   * @param modelId - Model ID
   * @param dims - Vector dimensions
   * @param chunkFingerprint - Chunk fingerprint (stored in vectorRef for idempotency)
   * @param ctx - Service context (may include session for transactions)
   */
  private async updateChunkEmbeddingMetadata(
    chunkId: string,
    modelId: string,
    dims: number,
    chunkFingerprint: string,
    ctx: ServiceContext
  ): Promise<void> {
    const db = await import('../config/database.js').then(m => m.getDB());
    const collection = db.collection('canonical_chunks');
    const session = ctx.session as unknown;
    const now = new Date();

    // Set the full embedding object to avoid "Cannot create field in null" error
    await collection.updateOne(
      { chunkId },
      {
        $set: {
          embedding: {
            modelId,
            dims,
            vectorRef: chunkFingerprint, // Store fingerprint for idempotency check
            updatedAt: now,
          },
          updatedAt: now,
        },
      },
      session ? { session: session as any } : undefined
    );
  }
}

