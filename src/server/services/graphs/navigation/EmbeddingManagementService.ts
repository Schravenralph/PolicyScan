/**
 * Embedding Management Service for Navigation Graph
 * 
 * Provides batch embedding operations and backfill functionality for NavigationGraph.
 * Extracted from NavigationGraph.ts to improve maintainability and testability.
 * 
 * This service handles:
 * - Batch embedding generation and updates
 * - Backfilling embeddings for existing nodes
 * - Progress tracking for long-running operations
 */

import type { Driver, Session } from 'neo4j-driver';
import { logger } from '../../../utils/logger.js';
import { Neo4jQueryBuilder } from './Neo4jQueryBuilder.js';
import { SemanticSearchService } from './SemanticSearchService.js';

/**
 * Result of embedding backfill operation
 */
export interface BackfillResult {
    processed: number;
    updated: number;
    errors: number;
}

/**
 * Service for embedding management operations
 */
export class EmbeddingManagementService {
    constructor(
        private driver: Driver,
        private queryBuilder: Neo4jQueryBuilder,
        private semanticSearchService: SemanticSearchService
    ) {}

    /**
     * Backfill embeddings for existing nodes that don't have them.
     * Useful for migrating existing graphs to use vector search.
     * 
     * @param session Neo4j session
     * @param batchSize Number of nodes to process per batch
     * @param progressCallback Optional callback for progress updates
     * @returns Backfill result with counts
     */
    async backfillEmbeddings(
        session: Session,
        batchSize: number = 50,
        progressCallback?: (processed: number, total: number) => void
    ): Promise<BackfillResult> {
        await this.semanticSearchService.ensureEmbeddingProvider();
        if (!this.semanticSearchService.getEmbeddingProvider()) {
            throw new Error('Embedding provider not available for backfill');
        }

        let processed = 0;
        let updated = 0;
        let errors = 0;

        try {
            // Get total count of nodes without embeddings
            const countQuery = this.queryBuilder.buildBackfillEmbeddingsCountQuery();
            const countResult = await session.run(countQuery.query, countQuery.params);
            const total = countResult.records[0]?.get('total')?.toNumber() ?? 0;

            if (total === 0) {
                logger.info('All nodes already have embeddings');
                return { processed: 0, updated: 0, errors: 0 };
            }

            logger.info({ total }, 'Starting embedding backfill');

            // Process in batches
            let hasMore = true;
            while (hasMore) {
                // Get batch of nodes without embeddings
                const batchResult = await session.run(`
                    MATCH (n:NavigationNode)
                    WHERE n.embedding IS NULL
                    RETURN n.url as url, n.title as title
                    LIMIT $batchSize
                `, { batchSize });

                const batch = batchResult.records.map(record => ({
                    url: record.get('url'),
                    title: record.get('title') || ''
                }));

                if (batch.length === 0) {
                    hasMore = false;
                    break;
                }

                // Generate embeddings for batch
                const updates: Array<{ url: string; embedding: number[] }> = [];
                for (const { url, title } of batch) {
                    try {
                        const text = [title, url].join(' ').trim();
                        if (!text) continue;

                        const embedding = await this.semanticSearchService.getEmbedding(text);
                        if (embedding) {
                            updates.push({ url, embedding });
                            this.semanticSearchService.cacheEmbedding(url, embedding);
                        }
                    } catch (error) {
                        logger.error({ url, error }, 'Error generating embedding');
                        errors++;
                    }
                }

                // Update nodes in Neo4j
                if (updates.length > 0) {
                    const batchUpdateQuery = this.queryBuilder.buildBatchUpdateEmbeddingsQuery(updates);
                    await session.run(batchUpdateQuery.query, batchUpdateQuery.params);
                    updated += updates.length;
                }

                processed += batch.length;

                // Report progress
                if (progressCallback) {
                    progressCallback(processed, total);
                }

                logger.debug({ processed, updated, errors, total }, 'Embedding backfill progress');
            }

            logger.info({ processed, updated, errors }, 'Embedding backfill completed');
            return { processed, updated, errors };
        } catch (error) {
            logger.error({ error, processed, updated, errors }, 'Embedding backfill failed');
            throw error;
        }
    }
}

