import { LocalEmbeddingProvider } from '../query/VectorService.js';
import { ScrapedDocument } from '../infrastructure/types.js';

/**
 * Lightweight semantic similarity service using sentence embeddings.
 * Uses Xenova/all-MiniLM-L6-v2 (Sentence-BERT) and cosine similarity
 * to capture synonym/semantic overlap (e.g., bodem ≈ grond/soil).
 */
export class SemanticSimilarityService {
  private provider: LocalEmbeddingProvider;
  private embeddingCache: Map<string, number[]>;

  constructor(modelName: string = 'Xenova/all-MiniLM-L6-v2', provider?: LocalEmbeddingProvider) {
    // Allow injecting a mock provider for tests to avoid loading the real model
    this.provider = provider || new LocalEmbeddingProvider(modelName);
    this.embeddingCache = new Map();
  }

  /**
   * Compute cosine similarity between two vectors.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Generate (and cache) an embedding for a given text.
   */
  private async embed(text: string): Promise<number[]> {
    const key = text.trim();
    if (!key) return [];

    const cached = this.embeddingCache.get(key);
    if (cached) return cached;

    const vec = await this.provider.generateEmbedding(key);
    this.embeddingCache.set(key, vec);
    return vec;
  }

  /**
   * Adds semanticSimilarity (0-1) to each document based on query vs title+summary.
   */
  async addSemanticSimilarity(
    documents: ScrapedDocument[],
    query: string
  ): Promise<ScrapedDocument[]> {
    if (!query || documents.length === 0) return documents;

    const queryVec = await this.embed(query);
    if (queryVec.length === 0) return documents;

    // Collect all content strings and identify missing ones
    const docContents: string[] = [];
    const missingContents: string[] = [];
    const missingContentSet = new Set<string>();

    // First pass: Prepare content for each document and find missing embeddings
    for (const doc of documents) {
        const content = `${doc.titel || ''} ${doc.samenvatting || ''}`.trim();
        docContents.push(content);

        if (content && !this.embeddingCache.has(content)) {
            if (!missingContentSet.has(content)) {
                missingContents.push(content);
                missingContentSet.add(content);
            }
        }
    }

    // Batch generate embeddings for missing contents
    if (missingContents.length > 0) {
        try {
            // Use batch generation (optimized for parallel processing)
            const embeddings = await this.provider.generateEmbeddings(missingContents);

            // Update cache with new embeddings
            missingContents.forEach((content, i) => {
                if (embeddings[i] && embeddings[i].length > 0) {
                    this.embeddingCache.set(content, embeddings[i]);
                }
            });
        } catch (error) {
            console.warn('[SemanticSimilarityService] Batch embedding failed, falling back to sequential:', error);
            // Fallback will happen naturally in the next loop as cache won't be populated
            // Or we could try sequential generation here explicitly if needed
        }
    }

    // Second pass: Compute similarity using cached embeddings
    for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const content = docContents[i];

        if (!content) continue;

        // Try to get from cache (populated by batch or previous calls)
        let docVec = this.embeddingCache.get(content);

        // If not in cache (e.g. batch failed or skipped), try individual embed as last resort
        if (!docVec) {
            try {
                docVec = await this.embed(content);
            } catch (e) {
                console.warn(`[SemanticSimilarityService] Failed to embed content for document ${i}:`, e);
                continue;
            }
        }

        if (docVec && docVec.length > 0) {
            doc.semanticSimilarity = this.cosineSimilarity(queryVec, docVec);
        }
    }

    return documents;
  }
}
