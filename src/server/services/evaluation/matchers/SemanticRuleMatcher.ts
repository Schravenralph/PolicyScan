/**
 * SemanticRuleMatcher - Semantic rule matching using embeddings
 * 
 * Matches rules against queries using semantic similarity via embeddings.
 * Uses LocalEmbeddingProvider to generate embeddings and cosine similarity for matching.
 */

import type { IRuleMatcher } from '../interfaces/IRuleMatcher.js';
import type { PolicyRule } from '../../parsing/types/PolicyRule.js';
import type { RuleMatch } from '../types/RuleMatch.js';
import { LocalEmbeddingProvider } from '../../query/VectorService.js';

/**
 * Calculate cosine similarity between two vectors
 * Returns value clamped to [0, 1] to handle floating point precision issues
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  // Clamp to [0, 1] to handle floating point precision issues
  return Math.max(0, Math.min(1, similarity));
}

export class SemanticRuleMatcher implements IRuleMatcher {
  private embeddingProvider: LocalEmbeddingProvider;
  private embeddingCache: Map<string, number[]>;

  constructor(embeddingProvider?: LocalEmbeddingProvider) {
    this.embeddingProvider = embeddingProvider || new LocalEmbeddingProvider();
    this.embeddingCache = new Map();
  }

  /**
   * Generate or retrieve cached embedding for text
   */
  private async embed(text: string): Promise<number[]> {
    const key = text.trim().toLowerCase();
    if (!key) {
      return [];
    }

    const cached = this.embeddingCache.get(key);
    if (cached) {
      return cached;
    }

    const embedding = await this.embeddingProvider.generateEmbedding(key);
    this.embeddingCache.set(key, embedding);
    return embedding;
  }

  /**
   * Match a rule against a query using semantic similarity
   * 
   * @param rule - Policy rule to match
   * @param query - Query string to match against
   * @returns RuleMatch if similarity >= 0.5, null otherwise
   */
  async match(rule: PolicyRule, query: string): Promise<RuleMatch | null> {
    if (!query || query.trim().length === 0) {
      return null;
    }

    // Build rule text from title, type, and content (prioritize title)
    const ruleText = `${rule.titel || ''} ${rule.type || ''} ${rule.content || ''}`.trim();

    if (!ruleText) {
      return null;
    }

    // Generate embeddings
    const [queryEmbedding, ruleEmbedding] = await Promise.all([
      this.embed(query),
      this.embed(ruleText),
    ]);

    if (queryEmbedding.length === 0 || ruleEmbedding.length === 0) {
      return null;
    }

    // Calculate cosine similarity
    const similarity = cosineSimilarity(queryEmbedding, ruleEmbedding);

    // Threshold: only return matches with similarity >= 0.5
    if (similarity < 0.5) {
      return null;
    }

    return {
      rule,
      query,
      matchScore: similarity,
      matchType: 'semantic',
      matchedTerms: [], // Semantic matches don't have specific matched terms
      confidence: similarity, // Use similarity as confidence
    };
  }
}
