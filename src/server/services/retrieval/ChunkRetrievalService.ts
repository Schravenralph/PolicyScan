import { DocumentChunk } from '../ingestion/processing/DocumentChunkingService.js';
import { VectorService } from '../query/VectorService.js';
import { BadRequestError, ExternalServiceError } from '../../types/errors.js';

/**
 * Service for retrieving relevant chunks using semantic search
 * 
 * Uses embeddings to find the most relevant chunks for a query,
 * combining semantic similarity with keyword matching.
 */
export class ChunkRetrievalService {
  private vectorService: VectorService;
  private topK: number;

  constructor(vectorService?: VectorService, topK: number = 5) {
    this.vectorService = vectorService || new VectorService();
    this.topK = topK;
  }

  /**
   * Retrieve relevant chunks for a query
   * 
   * @param query The search query
   * @param chunks All available chunks
   * @returns Top K most relevant chunks
   */
  async retrieveRelevantChunks(query: string, chunks: DocumentChunk[]): Promise<DocumentChunk[]> {
    if (chunks.length === 0) {
      return [];
    }

    try {
      // Try semantic search first
      await this.vectorService.init();
      const queryEmbedding = await this.vectorService.generateEmbedding(query);

      // Generate embeddings for all chunks in batch
      const chunkTexts = chunks.map(c => c.text);
      let chunkEmbeddings: number[][] = [];

      try {
        chunkEmbeddings = await this.vectorService.generateEmbeddings(chunkTexts);
      } catch (e) {
        console.warn('Batch embedding generation failed, falling back to individual generation', e);
        // Fallback to individual generation if batch fails completely
        chunkEmbeddings = await Promise.all(chunkTexts.map(text => this.vectorService.generateEmbedding(text)));
      }

      if (chunkEmbeddings.length !== chunks.length) {
        throw new ExternalServiceError('VectorService', `Generated embeddings count (${chunkEmbeddings.length}) does not match chunks count (${chunks.length})`, {
          reason: 'embedding_count_mismatch',
          operation: 'retrieveRelevantChunks',
          chunksCount: chunks.length,
          embeddingsCount: chunkEmbeddings.length
        });
      }

      // Calculate similarity for each chunk
      const chunkScores = chunks.map((chunk, index) => {
        try {
          const chunkEmbedding = chunkEmbeddings[index];
           if (!chunkEmbedding || chunkEmbedding.length === 0) {
             throw new BadRequestError('Invalid embedding', {
               reason: 'invalid_embedding',
               operation: 'retrieveRelevantChunks',
               chunkId: chunk.id
             });
          }
          const similarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
          return { chunk, similarity };
        } catch (error) {
          // Fallback to keyword matching if embedding fails
          console.warn(`Failed to generate embedding for chunk ${chunk.id}:`, error);
          const keywordScore = this.keywordMatchScore(query, chunk.text);
          return { chunk, similarity: keywordScore };
        }
      });

      // Sort by similarity and take top K
      chunkScores.sort((a, b) => b.similarity - a.similarity);
      return chunkScores.slice(0, this.topK).map(item => item.chunk);
    } catch (error) {
      console.warn('Semantic search failed, falling back to keyword matching:', error);
      // Fallback to keyword matching
      return this.retrieveByKeyword(query, chunks);
    }
  }

  /**
   * Retrieve chunks using keyword matching (fallback)
   */
  private retrieveByKeyword(query: string, chunks: DocumentChunk[]): DocumentChunk[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
    
    const scoredChunks = chunks.map(chunk => {
      const score = this.keywordMatchScore(query, chunk.text);
      return { chunk, score };
    });

    scoredChunks.sort((a, b) => b.score - a.score);
    return scoredChunks.slice(0, this.topK).map(item => item.chunk);
  }

  /**
   * Calculate keyword match score
   */
  private keywordMatchScore(query: string, text: string): number {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 2);

    let score = 0;
    for (const term of queryTerms) {
      if (textLower.includes(term)) {
        score += 1;
        // Bonus for multiple occurrences
        const occurrences = (textLower.match(new RegExp(term, 'g')) || []).length;
        score += (occurrences - 1) * 0.5;
      }
    }

    // Normalize by number of query terms
    return queryTerms.length > 0 ? score / queryTerms.length : 0;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new BadRequestError('Vectors must have same length', {
        reason: 'vector_length_mismatch',
        operation: 'cosineSimilarity',
        vectorALength: a.length,
        vectorBLength: b.length
      });
    }

    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  /**
   * Set top K value
   */
  setTopK(topK: number): void {
    this.topK = topK;
  }
}
