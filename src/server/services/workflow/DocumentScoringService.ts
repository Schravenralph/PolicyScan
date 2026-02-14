/**
 * Document Scoring Service
 * 
 * @deprecated Use DocumentScorer from services/scoring/ instead.
 * This service is maintained for backward compatibility only.
 * 
 * Migration guide: See docs/40-implementation-plans/separation-of-concerns/phase-3-scoring-layer.md
 * 
 * Scores and ranks CanonicalDocument objects using multiple factors:
 * - Authority weighting (from source type or enrichmentMetadata)
 * - Semantic relevance (from embeddings in enrichmentMetadata)
 * - Keyword match (text matching using fullText directly)
 * - Recency (publication date from dates.publishedAt)
 * - Document type preference (configurable)
 * - Rule-based boost (from enrichmentMetadata.linkedXmlData)
 */

import type { CanonicalDocument } from '../../contracts/types.js';
import { logger } from '../../utils/logger.js';
import { RuleEvaluator } from '../evaluation/RuleEvaluator.js';
import { DocumentScorer } from '../scoring/DocumentScorer.js';
import type { PolicyRule } from '../parsing/types/PolicyRule.js';

/**
 * Configuration for document scoring weights
 */
export interface ScoringWeights {
  /** Weight for authority score (default: 0.3) */
  authorityWeight: number;
  /** Weight for semantic relevance score (default: 0.3) */
  semanticWeight: number;
  /** Weight for keyword match score (default: 0.2) */
  keywordWeight: number;
  /** Weight for recency score (default: 0.1) */
  recencyWeight: number;
  /** Weight for document type preference (default: 0.1) */
  typeWeight: number;
}

/**
 * Default scoring weights
 */
const DEFAULT_WEIGHTS: ScoringWeights = {
  authorityWeight: 0.3,
  semanticWeight: 0.3,
  keywordWeight: 0.2,
  recencyWeight: 0.1,
  typeWeight: 0.1,
};

/**
 * Document type preferences (higher = more preferred)
 */
const DOCUMENT_TYPE_PREFERENCES: Record<string, number> = {
  // Policy documents (high preference)
  'Omgevingsvisie': 1.0,
  'Omgevingsplan': 1.0,
  'Omgevingsprogramma': 0.9,
  'Verordening': 0.95,
  'Beleidsregel': 0.9,
  'Besluit': 0.85,
  'Nota': 0.8,
  'Regeling': 0.85,
  'Circulaire': 0.75,
  'Richtlijn': 0.8,
  
  // Official publications (very high preference)
  'Staatsblad': 1.0,
  'Tractatenblad': 1.0,
  'Kamerstuk': 0.9,
  
  // Jurisprudence (high preference for legal context)
  'Hoge Raad': 0.95,
  'Gerechtshof': 0.85,
  'Rechtbank': 0.8,
  'Uitspraak': 0.8,
  
  // Guidance documents (medium preference)
  'Handreiking': 0.7,
  'Leidraad': 0.7,
  
  // Default for unknown types
  'default': 0.5,
};

/**
 * Service for scoring and ranking documents
 * 
 * @deprecated Use DocumentScorer from services/scoring/ instead.
 * This class now wraps DocumentScorer for backward compatibility.
 */
export class DocumentScoringService {
  private weights: ScoringWeights;
  private ruleEvaluator: RuleEvaluator;
  private documentScorer: DocumentScorer;

  constructor(weights?: Partial<ScoringWeights>, ruleEvaluator?: RuleEvaluator) {
    // Store weights for backward compatibility (though they're not used anymore)
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
    this.ruleEvaluator = ruleEvaluator || new RuleEvaluator();
    
    // Create DocumentScorer for backward compatibility
    // Note: DocumentScorer uses its own default weights, so custom weights are ignored
    this.documentScorer = new DocumentScorer(this.ruleEvaluator);
    
    // Normalize weights to ensure they sum to 1.0 (for backward compatibility)
    const totalWeight = 
      this.weights.authorityWeight +
      this.weights.semanticWeight +
      this.weights.keywordWeight +
      this.weights.recencyWeight +
      this.weights.typeWeight;
    
    if (totalWeight > 0) {
      this.weights.authorityWeight /= totalWeight;
      this.weights.semanticWeight /= totalWeight;
      this.weights.keywordWeight /= totalWeight;
      this.weights.recencyWeight /= totalWeight;
      this.weights.typeWeight /= totalWeight;
    }
  }

  /**
   * Derives authority score from CanonicalDocument
   * 
   * Priority:
   * 1. enrichmentMetadata.authorityScore (if available)
   * 2. Computed from source field
   * 3. Computed from publisherAuthority field
   * 4. Default: 0.5 (neutral)
   * 
   * @param document The canonical document
   * @returns Authority score in range [0, 1]
   */
  private deriveAuthorityScore(document: CanonicalDocument): number {
    // Priority 1: Check enrichmentMetadata
    if (document.enrichmentMetadata?.authorityScore !== undefined) {
      const score = document.enrichmentMetadata.authorityScore;
      if (typeof score === 'number' && score >= 0 && score <= 1) {
        return score;
      }
    }

    // Priority 2: Derive from source field
    const sourceScores: Record<CanonicalDocument['source'], number> = {
      'DSO': 0.9,
      'Rechtspraak': 0.9,
      'Wetgeving': 0.9,
      'Web': 0.7,
      'Gemeente': 0.8,
      'PDOK': 0.8,
      'IPLO': 0.7, // IPLO provides guidance, similar authority to Web
    };

    if (document.source in sourceScores) {
      return sourceScores[document.source];
    }

    // Priority 3: Derive from publisherAuthority (if available)
    if (document.publisherAuthority) {
      const authority = document.publisherAuthority.toLowerCase();
      if (authority.includes('rijk') || authority.includes('national')) {
        return 0.9;
      } else if (authority.includes('provincie') || authority.includes('provincial')) {
        return 0.85;
      } else if (authority.includes('gemeente') || authority.includes('municipal')) {
        return 0.8;
      }
    }

    // Default: neutral score
    return 0.5;
  }

  /**
   * Extracts match signals from CanonicalDocument enrichmentMetadata
   * 
   * @param document The canonical document
   * @returns Match signals object with optional keyword, semantic, and metadata scores
   */
  private extractMatchSignals(
    document: CanonicalDocument
  ): { keyword?: number; semantic?: number; metadata?: number } {
    const matchSignals = document.enrichmentMetadata?.matchSignals;
    
    if (!matchSignals || typeof matchSignals !== 'object') {
      return {};
    }

    const matchSignalsTyped = matchSignals as Record<string, unknown>;
    const result: { keyword?: number; semantic?: number; metadata?: number } = {};
    
    if (typeof matchSignalsTyped.keyword === 'number' && matchSignalsTyped.keyword >= 0 && matchSignalsTyped.keyword <= 1) {
      result.keyword = matchSignalsTyped.keyword;
    }
    
    if (typeof matchSignalsTyped.semantic === 'number' && matchSignalsTyped.semantic >= 0 && matchSignalsTyped.semantic <= 1) {
      result.semantic = matchSignalsTyped.semantic;
    }
    
    if (typeof matchSignalsTyped.metadata === 'number' && matchSignalsTyped.metadata >= 0 && matchSignalsTyped.metadata <= 1) {
      result.metadata = matchSignalsTyped.metadata;
    }

    return result;
  }

  /**
   * Extracts publication date from CanonicalDocument dates field
   * 
   * Converts Date object to ISO string format (YYYY-MM-DD) for compatibility
   * with existing calculateRecencyScore() method.
   * 
   * @param document The canonical document
   * @returns Publication date as ISO string (YYYY-MM-DD) or undefined
   */
  private extractPublicationDate(document: CanonicalDocument): string | undefined {
    const publishedAt = document.dates?.publishedAt;
    
    if (!publishedAt) {
      return undefined;
    }

    // Handle Date object
    if (publishedAt instanceof Date) {
      // Format as YYYY-MM-DD
      const year = publishedAt.getFullYear();
      const month = String(publishedAt.getMonth() + 1).padStart(2, '0');
      const day = String(publishedAt.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // Handle string (shouldn't happen, but be defensive)
    if (typeof publishedAt === 'string') {
      // Try to parse and reformat
      try {
        const date = new Date(publishedAt);
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
      } catch {
        // Invalid date string, return undefined
      }
    }

    return undefined;
  }

  /**
   * Scores a single document using all factors
   * 
   * @deprecated Use DocumentScorer.scoreDocument() instead
   * @param document The document to score
   * @param query Optional query text for keyword matching
   * @returns Final score in range [0, 1]
   */
  async scoreDocument(document: CanonicalDocument, query?: string): Promise<number> {
    logger.debug(
      { sourceId: document.sourceId, source: document.source },
      '[DocumentScoringService] Delegating to DocumentScorer (deprecated)'
    );

    // Use DocumentScorer and extract just the finalScore
    const scored = await this.documentScorer.scoreDocument(document, query);
    return scored.finalScore;
  }

  /**
   * Calculate rule-based score boost
   * 
   * Boosts documents that have rules matching the query.
   * Uses RuleEvaluator from the evaluation layer.
   * 
   * @param document The document to score
   * @param query Optional query text for rule matching
   * @returns Rule score in range [0, 1]
   */
  private async calculateRuleScore(document: CanonicalDocument, query?: string): Promise<number> {
    const linkedXmlData = document.enrichmentMetadata?.linkedXmlData as {
      rules?: Array<{ identificatie: string; titel?: string; type?: string }>;
      ruleCount?: number;
    } | undefined;

    if (!linkedXmlData || !linkedXmlData.rules || linkedXmlData.rules.length === 0) {
      return 0; // No rules, no boost
    }

    logger.debug(
      { ruleCount: linkedXmlData.rules.length, hasQuery: !!query },
      '[DocumentScoringService] Calculating rule-based score using RuleEvaluator'
    );

    // Convert linkedXmlData rules to PolicyRule format
    const policyRules: PolicyRule[] = linkedXmlData.rules.map((rule, index) => ({
      id: `rule-${index}`,
      identificatie: rule.identificatie,
      titel: rule.titel,
      type: rule.type,
      sourceDocument: document.sourceId,
      extractedAt: new Date(), // Use current date as fallback
    }));

    // Use RuleEvaluator to calculate score
    const ruleScore = await this.ruleEvaluator.calculateRuleScore(policyRules, query);
    
    logger.debug(
      {
        totalRules: policyRules.length,
        ruleScore,
      },
      '[DocumentScoringService] Rule score calculated with RuleEvaluator'
    );

    return ruleScore;
  }

  /**
   * Scores multiple documents and returns them with scores
   * 
   * @deprecated Use DocumentScorer.scoreDocuments() instead
   * @param documents Documents to score
   * @param query Optional query text for keyword matching
   * @returns Documents with finalScore property added
   */
  async scoreDocuments(
    documents: CanonicalDocument[],
    query?: string
  ): Promise<Array<CanonicalDocument & { finalScore: number }>> {
    // Use DocumentScorer and convert ScoredDocument[] to CanonicalDocument & { finalScore: number }[]
    const scored = await this.documentScorer.scoreDocuments(documents, query);
    return scored.map(doc => ({
      ...doc,
      finalScore: doc.finalScore,
    }));
  }

  /**
   * Ranks documents by score (highest first)
   * 
   * @deprecated Use DocumentScorer.rankDocuments() instead
   * @param documents Documents with scores
   * @returns Ranked documents
   */
  async rankDocuments(
    documents: Array<CanonicalDocument & { finalScore: number }>
  ): Promise<Array<CanonicalDocument & { finalScore: number }>> {
    // Convert to ScoredDocument format for DocumentScorer
    const scored: Array<CanonicalDocument & { finalScore: number; factorScores: any; scoredAt: Date }> = documents.map(doc => ({
      ...doc,
      factorScores: {
        authority: 0,
        semantic: 0,
        keyword: 0,
        recency: 0,
        type: 0,
        rules: 0,
      },
      scoredAt: new Date(),
    }));

    // Use DocumentScorer and convert RankedDocument[] back to CanonicalDocument & { finalScore: number }[]
    const ranked = await this.documentScorer.rankDocuments(scored);
    return ranked.map(doc => ({
      ...doc,
      // Remove scoring-specific properties to match old interface
      finalScore: doc.finalScore,
    }));
  }

  /**
   * Scores and ranks documents in one operation
   * 
   * @deprecated Use DocumentScorer.scoreDocuments() and DocumentScorer.rankDocuments() instead
   * @param documents Documents to score and rank
   * @param query Optional query text for keyword matching
   * @returns Ranked documents with scores
   */
  async scoreAndRankDocuments(
    documents: CanonicalDocument[],
    query?: string
  ): Promise<Array<CanonicalDocument & { finalScore: number }>> {
    const scored = await this.scoreDocuments(documents, query);
    return await this.rankDocuments(scored);
  }

  /**
   * Calculates keyword match score from document content
   * 
   * Uses fullText directly from CanonicalDocument (no metadata extraction needed).
   * This ensures the scoring algorithm uses the complete document content.
   * 
   * @param document The document
   * @param query The search query
   * @returns Keyword score in range [0, 1]
   */
  private calculateKeywordScore(document: CanonicalDocument, query: string): number {
    if (!query || query.trim().length === 0) {
      return 0;
    }

    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 2);
    
    if (queryTerms.length === 0) {
      return 0;
    }

    // Search in title (weight: 0.6) and text content (weight: 0.4)
    let titleMatches = 0;
    let textMatches = 0;

    if (document.title) {
      const titleLower = document.title.toLowerCase();
      titleMatches = queryTerms.filter(term => titleLower.includes(term)).length;
    }

    // Use fullText directly from CanonicalDocument (no metadata extraction needed)
    // fullText is required in CanonicalDocument, but handle edge case gracefully
    const fullText = document.fullText || '';
    
    if (fullText) {
      const textLower = fullText.toLowerCase();
      textMatches = queryTerms.filter(term => textLower.includes(term)).length;
      
      logger.debug(
        {
          hasFullText: !!fullText,
          textLength: fullText.length,
          matches: textMatches,
          queryTerms: queryTerms.length,
        },
        '[DocumentScoringService] Keyword matching using fullText directly from CanonicalDocument'
      );
    }

    // Calculate weighted score
    const titleScore = (titleMatches / queryTerms.length) * 0.6;
    const textScore = (textMatches / queryTerms.length) * 0.4;
    const keywordScore = titleScore + textScore;

    return Math.min(1, keywordScore);
  }

  /**
   * Calculates recency score based on publication date
   * 
   * More recent documents get higher scores.
   * Documents older than 10 years get score 0.
   * 
   * @param publicationDate Publication date in ISO format (YYYY-MM-DD) or undefined
   * @returns Recency score in range [0, 1]
   */
  private calculateRecencyScore(publicationDate?: string): number {
    if (!publicationDate) {
      // No date available - use neutral score
      return 0.5;
    }

    try {
      const pubDate = new Date(publicationDate);
      const now = new Date();
      const yearsAgo = (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

      // Score decreases linearly from 1.0 (current) to 0.0 (10 years old)
      if (yearsAgo < 0) {
        // Future date - treat as current
        return 1.0;
      } else if (yearsAgo >= 10) {
        // Older than 10 years
        return 0.0;
      } else {
        // Linear decay: 1.0 at 0 years, 0.0 at 10 years
        return 1.0 - (yearsAgo / 10);
      }
    } catch {
      // Invalid date format - use neutral score
      logger.warn(`Invalid publication date format: ${publicationDate}`);
      return 0.5;
    }
  }

  /**
   * Calculates document type preference score
   * 
   * @param documentType Document type or undefined
   * @returns Type preference score in range [0, 1]
   */
  private calculateTypeScore(documentType?: string): number {
    if (!documentType) {
      return DOCUMENT_TYPE_PREFERENCES['default'] ?? 0.5;
    }

    // Check for exact match first
    if (documentType in DOCUMENT_TYPE_PREFERENCES) {
      return DOCUMENT_TYPE_PREFERENCES[documentType];
    }

    // Check for partial match (case-insensitive)
    const typeLower = documentType.toLowerCase();
    for (const [prefType, score] of Object.entries(DOCUMENT_TYPE_PREFERENCES)) {
      if (prefType.toLowerCase() === typeLower) {
        return score;
      }
      // Check if document type contains preference type
      if (typeLower.includes(prefType.toLowerCase()) || prefType.toLowerCase().includes(typeLower)) {
        return score;
      }
    }

    // Default score for unknown types
    return DOCUMENT_TYPE_PREFERENCES['default'] ?? 0.5;
  }

  /**
   * Gets current scoring weights
   */
  getWeights(): ScoringWeights {
    return { ...this.weights };
  }

  /**
   * Updates scoring weights
   */
  setWeights(weights: Partial<ScoringWeights>): void {
    this.weights = { ...this.weights, ...weights };
    
    // Normalize weights
    const totalWeight = 
      this.weights.authorityWeight +
      this.weights.semanticWeight +
      this.weights.keywordWeight +
      this.weights.recencyWeight +
      this.weights.typeWeight;
    
    if (totalWeight > 0) {
      this.weights.authorityWeight /= totalWeight;
      this.weights.semanticWeight /= totalWeight;
      this.weights.keywordWeight /= totalWeight;
      this.weights.recencyWeight /= totalWeight;
      this.weights.typeWeight /= totalWeight;
    }
  }
}
