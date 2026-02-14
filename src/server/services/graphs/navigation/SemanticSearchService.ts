/**
 * Semantic Search Service for Navigation Graph
 * 
 * Provides semantic search capabilities using vector embeddings and Neo4j vector indexes.
 * Extracted from NavigationGraph.ts to improve maintainability and testability.
 * 
 * This service handles:
 * - Vector similarity search using Neo4j vector indexes
 * - Keyword-based fallback search
 * - Embedding provider management
 */

import type { Driver, Session } from 'neo4j-driver';
import type { NavigationNode } from '../../../types/navigationGraph.js';
import { LocalEmbeddingProvider } from '../../query/VectorService.js';
import { logger } from '../../../utils/logger.js';
import { Neo4jQueryBuilder } from './Neo4jQueryBuilder.js';
import { parseChildren, neo4jNodeToNavigationNode } from '../../../utils/navigationGraphSerialization.js';

/**
 * Service for semantic search operations
 */
export class SemanticSearchService {
    private embeddingProvider: LocalEmbeddingProvider | null = null;
    private embeddingCache: Map<string, number[]> = new Map();

    constructor(
        private driver: Driver,
        private queryBuilder: Neo4jQueryBuilder
    ) {}

    /**
     * Ensure embedding provider is initialized
     */
    async ensureEmbeddingProvider(): Promise<void> {
        if (!this.embeddingProvider) {
            this.embeddingProvider = new LocalEmbeddingProvider();
        }
        await this.embeddingProvider.init();
    }

    /**
     * Get embedding provider instance
     */
    getEmbeddingProvider(): LocalEmbeddingProvider | null {
        return this.embeddingProvider;
    }

    /**
     * Get embedding from cache or generate new one
     */
    async getEmbedding(text: string): Promise<number[] | null> {
        // Check cache first
        const cached = this.embeddingCache.get(text);
        if (cached) {
            return cached;
        }

        // Generate new embedding
        await this.ensureEmbeddingProvider();
        if (!this.embeddingProvider) {
            return null;
        }

        const embedding = await this.embeddingProvider.generateEmbedding(text);
        if (embedding) {
            this.embeddingCache.set(text, embedding);
        }
        return embedding;
    }

    /**
     * Cache an embedding
     */
    cacheEmbedding(key: string, embedding: number[]): void {
        this.embeddingCache.set(key, embedding);
    }

    /**
     * Get cached embedding
     */
    getCachedEmbedding(key: string): number[] | undefined {
        return this.embeddingCache.get(key);
    }

    /**
     * Find semantically similar nodes using Neo4j vector index search
     * 
     * @param session Neo4j session
     * @param query Search query string
     * @param limit Maximum number of results
     * @param getAllNodes Function to get all nodes (for fallback)
     * @returns Array of nodes with similarity scores
     */
    async findSemanticallySimilar(
        session: Session,
        query: string,
        limit: number = 20,
        getAllNodes: () => Promise<NavigationNode[]>
    ): Promise<Array<{ node: NavigationNode; score: number }>> {
        await this.ensureEmbeddingProvider();
        if (!this.embeddingProvider) {
            logger.warn('Embedding provider not available, falling back to keyword search');
            return this.fallbackKeywordSearch(query, limit, getAllNodes);
        }

        const queryVector = await this.getEmbedding(query);
        if (!queryVector) {
            logger.warn('Failed to generate embedding, falling back to keyword search');
            return this.fallbackKeywordSearch(query, limit, getAllNodes);
        }

        try {
            // Use Neo4j vector index for efficient similarity search
            const vectorSearchQuery = this.queryBuilder.buildVectorSearchQuery(
                Math.min(limit * 2, 100), // Query more than needed for filtering
                queryVector,
                limit
            );
            const result = await session.run(vectorSearchQuery.query, vectorSearchQuery.params);

            const scored: Array<{ node: NavigationNode; score: number }> = [];
            for (const record of result.records) {
                const nodeRecord = record.get('node');
                const scoreValue = record.get('score');

                // Skip records with missing node or score
                if (!nodeRecord || scoreValue == null) {
                    continue;
                }

                // Safely convert score to number
                let score: number;
                if (typeof scoreValue === 'number') {
                    score = scoreValue;
                } else if (
                    scoreValue &&
                    typeof scoreValue === 'object' &&
                    'toNumber' in scoreValue &&
                    typeof (scoreValue as { toNumber: () => number }).toNumber === 'function'
                ) {
                    score = (scoreValue as { toNumber: () => number }).toNumber();
                } else {
                    // Skip records with invalid score
                    continue;
                }

                const children = parseChildren(record.get('children'));
                const node = neo4jNodeToNavigationNode(nodeRecord, children);
                if (!node) {
                    continue;
                }

                scored.push({ node, score });
            }

            return scored;
        } catch (error) {
            // Fallback to keyword-based search if vector index is not available
            logger.warn({ query, error }, 'Vector index search failed, falling back to keyword search');
            return this.fallbackKeywordSearch(query, limit, getAllNodes);
        }
    }

    /**
     * Fallback keyword-based search when vector index is unavailable
     * 
     * @param query Search query string
     * @param limit Maximum number of results
     * @param getAllNodes Function to get all nodes
     * @returns Array of nodes with similarity scores
     */
    private async fallbackKeywordSearch(
        query: string,
        limit: number,
        getAllNodes: () => Promise<NavigationNode[]>
    ): Promise<Array<{ node: NavigationNode; score: number }>> {
        const queryLower = query.toLowerCase();
        const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
        const nodes = await getAllNodes();

        const scored: Array<{ node: NavigationNode; score: number }> = [];
        for (const node of nodes) {
            const title = (node.title || '').toLowerCase();
            const urlLower = node.url.toLowerCase();

            let score = 0;
            for (const term of queryTerms) {
                if (title.includes(term)) score += 0.5;
                if (urlLower.includes(term)) score += 0.3;
            }

            if (score > 0) {
                scored.push({ node, score });
            }
        }

        return scored.sort((a, b) => b.score - a.score).slice(0, limit);
    }
}

