import { LocalEmbeddingProvider } from '../../query/VectorService.js';
import { BronWebsiteDocument } from '../../../types/index.js';

/**
 * Source Embedding Service
 * 
 * Generates and manages vector embeddings for sources (websites) to enable
 * semantic matching between queries and sources. This allows the system to
 * find relevant sources even when they use different terminology than the query.
 * 
 * How it works:
 * 1. generateSourceEmbedding() creates an embedding from source metadata
 *    (title, description, subjects, themes, website_types)
 * 2. Embeddings are stored in the source document or cached
 * 3. calculateQuerySourceSimilarity() compares query embedding to source embedding
 * 
 * The embedding is used by SourceRankingService to rank sources
 * based on semantic similarity to the query.
 * 
 * To test:
 * - Generate embeddings for sources and verify they're stored
 * - Query similarity between query and source and verify scores [0, 1]
 */
export class SourceEmbeddingService {
  private embeddingProvider: LocalEmbeddingProvider;
  private embeddingCache: Map<string, number[]> = new Map();

  constructor() {
    // Use local embedding provider for source embeddings
    // This uses the same model as document embeddings for consistency
    this.embeddingProvider = new LocalEmbeddingProvider();
  }

  /**
   * Generate embedding text from source metadata
   * 
   * Combines all relevant source information into a single text string
   * for embedding generation. This includes:
   * - Source title
   * - Source description (samenvatting)
   * - Subjects (onderwerpen)
   * - Themes (themas)
   * - Website types
   */
  private generateSourceText(source: BronWebsiteDocument): string {
    const parts: string[] = [];

    if (source.titel) {
      parts.push(source.titel);
    }

    if (source.samenvatting) {
      parts.push(source.samenvatting);
    }

    if (source.subjects && source.subjects.length > 0) {
      parts.push(`Onderwerpen: ${source.subjects.join(', ')}`);
    }

    if (source.themes && source.themes.length > 0) {
      parts.push(`Themas: ${source.themes.join(', ')}`);
    }

    if (source.website_types && source.website_types.length > 0) {
      parts.push(`Website types: ${source.website_types.join(', ')}`);
    }

    return parts.join('. ');
  }

  /**
   * Generate embedding for a source
   * 
   * Creates a vector embedding from the source's metadata. The embedding
   * is cached in memory for performance. For persistent storage, callers
   * should store the embedding in the source document.
   * 
   * @param source - The source website document
   * @returns Vector embedding as array of numbers
   */
  async generateSourceEmbedding(source: BronWebsiteDocument): Promise<number[]> {
    // Check cache first
    const cacheKey = source.url || source._id?.toString() || '';
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    // Generate text representation
    const sourceText = this.generateSourceText(source);

    // Generate embedding
    const embedding = await this.embeddingProvider.generateEmbedding(sourceText);

    // Cache it
    this.embeddingCache.set(cacheKey, embedding);

    return embedding;
  }

  /**
   * Calculate cosine similarity between query and source embeddings
   * 
   * Returns a similarity score [0, 1] where:
   * - 1.0 = perfect semantic match
   * - 0.0 = no semantic similarity
   * 
   * This score is used by SourceRankingService for ranking.
   * 
   * @param queryEmbedding - Query embedding vector
   * @param sourceEmbedding - Source embedding vector
   * @returns Similarity score [0, 1]
   */
  calculateSimilarity(queryEmbedding: number[], sourceEmbedding: number[]): number {
    if (queryEmbedding.length !== sourceEmbedding.length) {
      console.warn('[SourceEmbeddingService] Embedding dimension mismatch');
      return 0;
    }

    // Calculate cosine similarity
    let dotProduct = 0;
    let normQuery = 0;
    let normSource = 0;

    for (let i = 0; i < queryEmbedding.length; i++) {
      dotProduct += queryEmbedding[i] * sourceEmbedding[i];
      normQuery += queryEmbedding[i] * queryEmbedding[i];
      normSource += sourceEmbedding[i] * sourceEmbedding[i];
    }

    const denominator = Math.sqrt(normQuery) * Math.sqrt(normSource);
    if (denominator === 0) {
      return 0;
    }

    const similarity = dotProduct / denominator;

    // Ensure result is in [0, 1] range (cosine similarity is [-1, 1], but embeddings are normalized)
    return Math.max(0, Math.min(1, similarity));
  }

  /**
   * Calculate similarity between query text and source
   * 
   * Convenience method that generates query embedding and compares to source.
   * 
   * @param queryText - The search query text
   * @param source - The source website document
   * @returns Similarity score [0, 1]
   */
  async calculateQuerySourceSimilarity(
    queryText: string,
    source: BronWebsiteDocument
  ): Promise<number> {
    // Generate embeddings
    const queryEmbedding = await this.embeddingProvider.generateEmbedding(queryText);
    const sourceEmbedding = await this.generateSourceEmbedding(source);

    // Calculate similarity
    return this.calculateSimilarity(queryEmbedding, sourceEmbedding);
  }

  /**
   * Batch generate embeddings for multiple sources
   * 
   * Useful for initial setup or backfilling embeddings.
   */
  async generateSourceEmbeddingsBatch(
    sources: BronWebsiteDocument[]
  ): Promise<Map<string, number[]>> {
    const embeddings = new Map<string, number[]>();

    for (const source of sources) {
      const embedding = await this.generateSourceEmbedding(source);
      const key = source.url || source._id?.toString() || '';
      embeddings.set(key, embedding);
    }

    return embeddings;
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }
}




