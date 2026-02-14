/**
 * EmbeddingProvider - Interface for embedding generation providers
 * 
 * Abstraction for different embedding providers (local, OpenAI, etc.).
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/05-embedding.md
 */

/**
 * EmbeddingProvider interface
 */
export interface EmbeddingProvider {
  /**
   * Generate embedding for text
   * 
   * @param text - Text to embed
   * @returns Embedding vector
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts (batched)
   *
   * @param texts - Array of texts to embed
   * @returns Array of embedding vectors
   */
  generateEmbeddings(texts: string[]): Promise<number[][]>;

  /**
   * Get provider name
   */
  getName(): string;

  /**
   * Get model dimensions
   */
  getDims(): number;
}
