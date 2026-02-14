/**
 * BM25-based semantic similarity scoring for log clustering
 * Uses basic NLP techniques (tokenization, TF-IDF-like scoring) to determine
 * semantic similarity between log messages.
 */
interface BM25Config {
    k1?: number;
    b?: number;
}
/**
 * Calculates BM25 score for a query against a document
 * BM25 formula: sum of IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D| / avgdl))
 */
export declare function calculateBM25Score(query: string, document: string, corpus: string[], config?: BM25Config): number;
/**
 * Calculates semantic similarity between two texts using BM25
 * Returns a score between 0 and 1 (normalized)
 */
export declare function semanticSimilarity(text1: string, text2: string, contextCorpus?: string[], config?: BM25Config): number;
/**
 * Calculates cosine similarity between two tokenized texts
 * Alternative to BM25 for semantic similarity
 */
export declare function cosineSimilarity(text1: string, text2: string): number;
/**
 * Combined semantic similarity using both BM25 and cosine similarity
 * Returns a score between 0 and 1
 */
export declare function combinedSemanticSimilarity(text1: string, text2: string, contextCorpus?: string[], config?: BM25Config): number;
export {};
