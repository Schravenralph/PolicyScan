import { DocumentChunk } from './DocumentChunkingService.js';
import { VectorService } from './VectorService.js';
/**
 * Service for retrieving relevant chunks using semantic search
 *
 * Uses embeddings to find the most relevant chunks for a query,
 * combining semantic similarity with keyword matching.
 */
export declare class ChunkRetrievalService {
    private vectorService;
    private topK;
    constructor(vectorService?: VectorService, topK?: number);
    /**
     * Retrieve relevant chunks for a query
     *
     * @param query The search query
     * @param chunks All available chunks
     * @returns Top K most relevant chunks
     */
    retrieveRelevantChunks(query: string, chunks: DocumentChunk[]): Promise<DocumentChunk[]>;
    /**
     * Retrieve chunks using keyword matching (fallback)
     */
    private retrieveByKeyword;
    /**
     * Calculate keyword match score
     */
    private keywordMatchScore;
    /**
     * Calculate cosine similarity between two vectors
     */
    private cosineSimilarity;
    /**
     * Set top K value
     */
    setTopK(topK: number): void;
}
