/**
 * Relationship Builder Service
 * 
 * Automatically links workflow-discovered nodes to related existing nodes based on:
 * - Semantic similarity (embedding-based cosine similarity)
 * - Metadata matching (thema, onderwerp, sourceUrl)
 * 
 * The service is non-blocking and configurable to enable/disable relationship creation.
 * 
 * @module RelationshipBuilderService
 */

import { Driver } from 'neo4j-driver';
import { logger } from '../../../utils/logger.js';
import { NavigationGraph, NavigationNode } from './NavigationGraph.js';
import { LocalEmbeddingProvider } from '../../query/VectorService.js';

/**
 * Configuration options for relationship building
 */
export interface RelationshipBuilderOptions {
  /** Maximum number of relationships to create per node (default: 5) */
  maxLinks?: number;
  /** Minimum similarity score for semantic linking (default: 0.7) */
  similarityThreshold?: number;
  /** Enable semantic similarity-based linking (default: true) */
  enableSemanticLinking?: boolean;
  /** Enable metadata-based linking (default: true) */
  enableMetadataLinking?: boolean;
}

/**
 * Result of relationship building operation
 */
export interface RelationshipBuilderResult {
  /** URLs of nodes that were linked to */
  linkedNodeUrls: string[];
  /** Number of relationships created */
  relationshipsCreated: number;
  /** Similarity scores for semantic links */
  similarityScores?: Array<{ url: string; score: number }>;
}

/**
 * Service to automatically link navigation graph nodes based on similarity and metadata
 */
export class RelationshipBuilderService {
  // private embeddingProvider: LocalEmbeddingProvider | null = null; // Unused

  constructor(
    private driver: Driver,
    private navigationGraph: NavigationGraph,
    embeddingProvider?: LocalEmbeddingProvider | null
  ) {
    if (!driver) {
      throw new Error('RelationshipBuilderService requires a Neo4j driver instance');
    }
  }

  /**
   * Link a new node to related existing nodes using semantic similarity and metadata
   * 
   * @param newNode - The new node to link
   * @param options - Configuration options
   * @returns Result with linked node URLs and relationship count
   */
  async linkToRelatedNodes(
    newNode: NavigationNode,
    options: RelationshipBuilderOptions = {}
  ): Promise<RelationshipBuilderResult> {
    const startTime = Date.now();
    const {
      maxLinks = 5,
      similarityThreshold = 0.7,
      enableSemanticLinking = true,
      enableMetadataLinking = true,
    } = options;

    const linkedNodeUrls: string[] = [];
    const similarityScores: Array<{ url: string; score: number }> = [];

    try {
      // Skip if node already exists (to avoid self-linking)
      const existingNode = await this.navigationGraph.getNode(newNode.url);
      if (existingNode) {
        logger.debug(
          { url: newNode.url },
          '[RelationshipBuilder] Node already exists, skipping relationship creation'
        );
        return { linkedNodeUrls: [], relationshipsCreated: 0 };
      }

      // Find candidate nodes for linking
      const candidates: Array<{ url: string; score: number; method: 'semantic' | 'metadata' }> = [];

      // 1. Semantic similarity-based linking
      if (enableSemanticLinking && newNode.embedding && newNode.embedding.length > 0) {
        const semanticCandidates = await this.findSemanticCandidates(
          newNode,
          similarityThreshold,
          maxLinks * 2 // Get more candidates to filter later
        );
        candidates.push(...semanticCandidates.map(c => ({ ...c, method: 'semantic' as const })));
      }

      // 2. Metadata-based linking
      if (enableMetadataLinking) {
        const metadataCandidates = await this.findMetadataCandidates(newNode, maxLinks * 2);
        candidates.push(...metadataCandidates.map(c => ({ ...c, method: 'metadata' as const })));
      }

      // Deduplicate and sort by score
      const uniqueCandidates = new Map<string, { url: string; score: number; method: 'semantic' | 'metadata' }>();
      for (const candidate of candidates) {
        const existing = uniqueCandidates.get(candidate.url);
        if (!existing || candidate.score > existing.score) {
          uniqueCandidates.set(candidate.url, candidate);
        }
      }

      // Sort by score and take top N
      const sortedCandidates = Array.from(uniqueCandidates.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, maxLinks);

      // Create relationships
      if (sortedCandidates.length > 0) {
        const created = await this.createRelationships(newNode.url, sortedCandidates.map(c => c.url));
        linkedNodeUrls.push(...sortedCandidates.map(c => c.url));
        similarityScores.push(...sortedCandidates.map(c => ({ url: c.url, score: c.score })));

        const duration = Date.now() - startTime;
        logger.info(
          {
            newNodeUrl: newNode.url,
            relationshipsCreated: created,
            linkedNodeUrls,
            duration,
            method: sortedCandidates.map(c => c.method),
          },
          '[RelationshipBuilder] Created relationships for new node'
        );

        return {
          linkedNodeUrls,
          relationshipsCreated: created,
          similarityScores,
        };
      }

      const duration = Date.now() - startTime;
      logger.debug(
        {
          newNodeUrl: newNode.url,
          duration,
        },
        '[RelationshipBuilder] No suitable candidates found for linking'
      );

      return { linkedNodeUrls: [], relationshipsCreated: 0 };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        {
          newNodeUrl: newNode.url,
          error,
          duration,
        },
        '[RelationshipBuilder] Failed to link node to related nodes'
      );
      // Don't throw - relationship creation should not fail workflows
      return { linkedNodeUrls: [], relationshipsCreated: 0 };
    }
  }

  /**
   * Link nodes based on metadata matching
   * 
   * @param newNode - The new node
   * @param metadata - Metadata to match against (thema, onderwerp, sourceUrl)
   * @returns Result with linked node URLs
   */
  async linkByMetadata(
    newNode: NavigationNode,
    metadata: {
      thema?: string;
      onderwerp?: string;
      sourceUrl?: string;
    }
  ): Promise<RelationshipBuilderResult> {
    const startTime = Date.now();
    const linkedNodeUrls: string[] = [];

    try {
      const session = this.driver.session();
      try {
        // Build query conditions based on available metadata
        const conditions: string[] = [];
        const params: Record<string, unknown> = { newNodeUrl: newNode.url };

        if (metadata.sourceUrl) {
          conditions.push('n.sourceUrl = $sourceUrl');
          params.sourceUrl = metadata.sourceUrl;
        }

        if (metadata.thema) {
          conditions.push('n.thema = $thema');
          params.thema = metadata.thema;
        }

        if (metadata.onderwerp) {
          conditions.push('n.onderwerp = $onderwerp');
          params.onderwerp = metadata.onderwerp;
        }

        if (conditions.length === 0) {
          logger.debug(
            { newNodeUrl: newNode.url },
            '[RelationshipBuilder] No metadata provided for linking'
          );
          return { linkedNodeUrls: [], relationshipsCreated: 0 };
        }

        // Find nodes matching metadata
        const query = `
          MATCH (n:NavigationNode)
          WHERE n.url <> $newNodeUrl
            AND (${conditions.join(' OR ')})
          RETURN n.url as url
          LIMIT 10
        `;

        const result = await session.run(query, params);
        const candidateUrls = result.records.map(record => record.get('url') as string);

        if (candidateUrls.length > 0) {
          const created = await this.createRelationships(newNode.url, candidateUrls);
          linkedNodeUrls.push(...candidateUrls);

          const duration = Date.now() - startTime;
          logger.info(
            {
              newNodeUrl: newNode.url,
              metadata,
              relationshipsCreated: created,
              linkedNodeUrls,
              duration,
            },
            '[RelationshipBuilder] Created metadata-based relationships'
          );

          return {
            linkedNodeUrls,
            relationshipsCreated: created,
          };
        }

        const duration = Date.now() - startTime;
        logger.debug(
          {
            newNodeUrl: newNode.url,
            metadata,
            duration,
          },
          '[RelationshipBuilder] No nodes found matching metadata'
        );

        return { linkedNodeUrls: [], relationshipsCreated: 0 };
      } finally {
        await session.close();
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        {
          newNodeUrl: newNode.url,
          metadata,
          error,
          duration,
        },
        '[RelationshipBuilder] Failed to link by metadata'
      );
      return { linkedNodeUrls: [], relationshipsCreated: 0 };
    }
  }

  /**
   * Find candidate nodes using semantic similarity
   * 
   * @param newNode - The new node with embedding
   * @param threshold - Minimum similarity score
   * @param limit - Maximum number of candidates
   * @returns Array of candidate nodes with similarity scores
   */
  private async findSemanticCandidates(
    newNode: NavigationNode,
    threshold: number,
    limit: number
  ): Promise<Array<{ url: string; score: number }>> {
    if (!newNode.embedding || newNode.embedding.length === 0) {
      return [];
    }

    const session = this.driver.session();
    try {
      // Use Neo4j vector index for efficient similarity search
      // Note: This requires the embedding index to be created
      const query = `
        MATCH (n:NavigationNode)
        WHERE n.url <> $newNodeUrl
          AND n.embedding IS NOT NULL
          AND size(n.embedding) = $embeddingSize
        WITH n, 
          gds.similarity.cosine($newNodeVector, n.embedding) AS similarity
        WHERE similarity >= $threshold
        RETURN n.url as url, similarity as score
        ORDER BY similarity DESC
        LIMIT $limit
      `;

      // Fallback to manual calculation if GDS is not available
      const fallbackQuery = `
        MATCH (n:NavigationNode)
        WHERE n.url <> $newNodeUrl
          AND n.embedding IS NOT NULL
          AND size(n.embedding) = $embeddingSize
        RETURN n.url as url, n.embedding as embedding
        LIMIT ${limit * 2}
      `;

      try {
        const result = await session.run(query, {
          newNodeUrl: newNode.url,
          newNodeVector: newNode.embedding,
          embeddingSize: newNode.embedding.length,
          threshold,
          limit,
        });

        return result.records.map(record => ({
          url: record.get('url') as string,
          score: record.get('score') as number,
        }));
      } catch (gdsError) {
        // GDS not available, use fallback with manual calculation
        logger.debug(
          { error: gdsError },
          '[RelationshipBuilder] GDS similarity not available, using manual calculation'
        );

        const result = await session.run(fallbackQuery, {
          newNodeUrl: newNode.url,
          embeddingSize: newNode.embedding.length,
        });

        const candidates: Array<{ url: string; score: number }> = [];
        for (const record of result.records) {
          const url = record.get('url') as string;
          const embedding = record.get('embedding') as number[];
          if (embedding && embedding.length === newNode.embedding!.length) {
            const similarity = this.cosineSimilarity(newNode.embedding!, embedding);
            if (similarity >= threshold) {
              candidates.push({ url, score: similarity });
            }
          }
        }

        // Sort by score and return top N
        return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
      }
    } finally {
      await session.close();
    }
  }

  /**
   * Find candidate nodes using metadata matching
   * 
   * @param newNode - The new node
   * @param limit - Maximum number of candidates
   * @returns Array of candidate nodes with scores
   */
  private async findMetadataCandidates(
    newNode: NavigationNode,
    limit: number
  ): Promise<Array<{ url: string; score: number }>> {
    const session = this.driver.session();
    try {
      const candidates: Array<{ url: string; score: number }> = [];

      // Match by sourceUrl
      if (newNode.sourceUrl) {
        const sourceUrlQuery = `
          MATCH (n:NavigationNode)
          WHERE n.url <> $newNodeUrl
            AND n.sourceUrl = $sourceUrl
          RETURN n.url as url
          LIMIT $limit
        `;

        const result = await session.run(sourceUrlQuery, {
          newNodeUrl: newNode.url,
          sourceUrl: newNode.sourceUrl,
          limit,
        });

        for (const record of result.records) {
          candidates.push({
            url: record.get('url') as string,
            score: 0.8, // High score for exact sourceUrl match
          });
        }
      }

      // Match by title similarity (simple word overlap)
      if (newNode.title) {
        const titleWords = newNode.title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        if (titleWords.length > 0) {
          const titleQuery = `
            MATCH (n:NavigationNode)
            WHERE n.url <> $newNodeUrl
              AND n.title IS NOT NULL
              AND any(word IN $titleWords WHERE toLower(n.title) CONTAINS word)
            RETURN n.url as url, n.title as title
            LIMIT $limit
          `;

          const result = await session.run(titleQuery, {
            newNodeUrl: newNode.url,
            titleWords,
            limit,
          });

          for (const record of result.records) {
            const url = record.get('url') as string;
            const title = record.get('title') as string;
            const titleWords2 = title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            const overlap = this.calculateWordOverlap(titleWords, titleWords2);
            
            // Only add if not already in candidates or with higher score
            const existing = candidates.find(c => c.url === url);
            if (!existing || overlap > existing.score) {
              if (existing) {
                existing.score = Math.max(existing.score, overlap);
              } else {
                candidates.push({ url, score: overlap });
              }
            }
          }
        }
      }

      return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
    } finally {
      await session.close();
    }
  }

  /**
   * Create LINKS_TO relationships between nodes with optional edge properties
   * 
   * @param fromUrl - Source node URL
   * @param toUrls - Target node URLs
   * @param edgeProperties - Optional edge properties for each relationship
   * @returns Number of relationships created
   */
  private async createRelationships(
    fromUrl: string, 
    toUrls: string[],
    edgeProperties?: Array<import('../../../types/navigationGraph.js').NavigationEdgeProperties | undefined>
  ): Promise<number> {
    if (toUrls.length === 0) {
      return 0;
    }

    const session = this.driver.session();
    try {
      // Build edge properties for each relationship
      const relationships = toUrls.map((toUrl, index) => {
        const props = edgeProperties?.[index];
        const propsStr = props ? JSON.stringify(props).replace(/"/g, "'") : '';
        return { toUrl, props: props || {} };
      });

      const query = `
        MATCH (from:NavigationNode {url: $fromUrl})
        UNWIND $relationships AS rel
        MATCH (to:NavigationNode {url: rel.toUrl})
        WHERE from.url <> to.url
        MERGE (from)-[r:LINKS_TO]->(to)
        SET r += rel.props
        RETURN count(*) as created
      `;

      const result = await session.run(query, {
        fromUrl,
        relationships,
      });

      const created = result.records[0]?.get('created')?.toNumber() || 0;
      return created;
    } finally {
      await session.close();
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   * 
   * @param a - First vector
   * @param b - Second vector
   * @returns Similarity score between 0 and 1
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
   * Calculate word overlap similarity (Jaccard index)
   * 
   * @param words1 - First set of words
   * @param words2 - Second set of words
   * @returns Similarity score between 0 and 1
   */
  private calculateWordOverlap(words1: string[], words2: string[]): number {
    const set1 = new Set(words1);
    const set2 = new Set(words2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }
}

