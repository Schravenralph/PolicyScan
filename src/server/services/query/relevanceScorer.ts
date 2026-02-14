import { ScrapedDocument } from '../infrastructure/types.js';
import { RerankerService } from '../retrieval/RerankerService.js';
import { LearningService } from '../learning/LearningService.js';
import { logger } from '../../utils/logger.js';

/**
 * Metadata available on documents for ranking
 */
interface DocumentMetadata {
  issuingAuthority?: string | null;
  themes?: string[];
  metadataConfidence?: number;
}

/**
 * Configuration for metadata-based ranking boosts
 */
interface MetadataRankingConfig {
  enabled: boolean;
  policyBoost: number;
  recencyBoost: number;
  themeMatchBoost: number;
  authorityBoost: number;
  boostMode: 'additive' | 'multiplicative';
}

export class RelevanceScorerService {
  private rerankerService: RerankerService | null = null;
  private learningService: LearningService | null = null;
  private documentBoostsCache: Map<string, number> = new Map();
  private cacheExpiry: number = 60 * 60 * 1000; // 1 hour
  private lastCacheUpdate: number = 0;
  private metadataConfig: MetadataRankingConfig;

  constructor(learningService?: LearningService) {
    // Initialize re-ranker service if enabled
    try {
      this.rerankerService = new RerankerService();
      if (this.rerankerService.isEnabled()) {
        logger.info('[RelevanceScorerService] LLM re-ranker enabled');
      }
    } catch (error) {
      logger.warn({ error }, '[RelevanceScorerService] Failed to initialize re-ranker');
      this.rerankerService = null;
    }

    // Initialize learning service for feedback-based boosts
    this.learningService = learningService || null;
    if (this.learningService?.isEnabled()) {
      logger.info('[RelevanceScorerService] Feedback-based ranking boosts enabled');
      // Refresh boosts cache periodically
      this.refreshBoostsCache().catch(err => {
        logger.warn({ error: err }, '[RelevanceScorerService] Failed to refresh boosts cache');
      });
    }

    // Initialize metadata ranking configuration
    this.metadataConfig = {
      enabled: process.env.METADATA_RANKING_ENABLED !== 'false',
      policyBoost: parseFloat(process.env.METADATA_POLICY_BOOST || '1.2'),
      recencyBoost: parseFloat(process.env.METADATA_RECENCY_BOOST || '1.1'),
      themeMatchBoost: parseFloat(process.env.METADATA_THEME_MATCH_BOOST || '1.15'),
      authorityBoost: parseFloat(process.env.METADATA_AUTHORITY_BOOST || '1.1'),
      boostMode: (process.env.METADATA_BOOST_MODE as 'additive' | 'multiplicative') || 'multiplicative'
    };

    if (this.metadataConfig.enabled) {
      logger.info(
        {
          policyBoost: this.metadataConfig.policyBoost,
          recencyBoost: this.metadataConfig.recencyBoost,
          themeMatchBoost: this.metadataConfig.themeMatchBoost,
          mode: this.metadataConfig.boostMode
        },
        '[RelevanceScorerService] Metadata-based ranking enabled'
      );
    }
  }
  /**
   * Calculate relevance score for a scraped document
   */
  calculateRelevance(
    document: ScrapedDocument,
    onderwerp: string,
    thema: string,
    overheidslaag: string
  ): number {
    let score = 0;

    // Semantic similarity (embeddings) - captures synonyms (e.g., bodem ≈ grond)
    const semanticSimilarity = (document as { semanticSimilarity?: number }).semanticSimilarity;
    if (typeof semanticSimilarity === 'number') {
      // Scale 0-1 similarity to 0-6 points (rounded)
      score += Math.min(6, Math.round(semanticSimilarity * 10 * 0.6));
    }

    const titel = document.titel.toLowerCase();
    const samenvatting = document.samenvatting.toLowerCase();
    const url = document.url.toLowerCase();

    const onderwerpLower = onderwerp.toLowerCase();
    const themaLower = thema.toLowerCase();
    const overheidlaagLower = overheidslaag.toLowerCase();

    // Helper function to check for word matches in multi-word queries
    const getWordMatchScore = (text: string, query: string, exactMatchPoints: number): number => {
      const queryLower = query.toLowerCase();
      
      // Exact phrase match (full points)
      if (text.includes(queryLower)) {
        return exactMatchPoints;
      }
      
      // For multi-word queries, give partial credit for matching individual words
      const stopWords = ['algemeen', 'de', 'het', 'een', 'van', 'voor', 'met', 'op', 'in', 'aan', 'bij', 'over', 'onder'];
      const queryWords = queryLower
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.includes(word));
      
      if (queryWords.length > 1) {
        // Multi-word query: give partial credit for each matching word
        const matchingWords = queryWords.filter(word => text.includes(word));
        if (matchingWords.length > 0) {
          // Give proportional credit based on how many words match
          return Math.floor((matchingWords.length / queryWords.length) * exactMatchPoints);
        }
      } else if (queryWords.length === 1) {
        // Single word query: give full points if it matches
        if (text.includes(queryWords[0])) {
          return exactMatchPoints;
        }
      }
      
      return 0;
    };

    // Title matches (highest weight) - improved for multi-word queries
    score += getWordMatchScore(titel, onderwerpLower, 5);
    score += getWordMatchScore(titel, themaLower, 5);
    if (titel.includes(overheidlaagLower)) score += 3;

    // Summary matches (medium weight) - improved for multi-word queries
    score += getWordMatchScore(samenvatting, onderwerpLower, 3);
    score += getWordMatchScore(samenvatting, themaLower, 3);
    if (samenvatting.includes(overheidlaagLower)) score += 2;

    // URL matches (lower weight) - improved for multi-word queries
    score += getWordMatchScore(url, onderwerpLower, 2);
    score += getWordMatchScore(url, themaLower, 2);

    // Document type bonuses
    if (document.type_document === 'Beleidsdocument') score += 3;
    if (document.type_document === 'PDF') score += 2;
    if (document.type_document === 'Verordening') score += 3;

    // Source bonuses
    if (document.website_url.includes('iplo.nl')) score += 2;
    if (document.website_url.includes('rijksoverheid.nl')) score += 2;
    if (document.website_url.includes('officielebekendmakingen.nl')) score += 2;

    // Recency bonus (if publication date is available)
    if (document.publicatiedatum) {
      const pubDate = new Date(document.publicatiedatum);
      const now = new Date();
      const ageInDays = (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60 * 24);

      if (ageInDays < 365) score += 2; // Published within last year
      else if (ageInDays < 1825) score += 1; // Published within last 5 years
    }

    // Apply metadata-based boosts if enabled
    if (this.metadataConfig.enabled) {
      const metadataBoost = this.calculateMetadataBoost(document, onderwerp, thema, overheidslaag);
      if (metadataBoost > 0) {
        if (this.metadataConfig.boostMode === 'multiplicative') {
          score = Math.round(score * (1 + metadataBoost));
        } else {
          score += Math.round(metadataBoost * 10); // Scale additive boost
        }
      }
    }

    // Apply feedback-based boost if available
    if (this.learningService?.isEnabled()) {
      const documentId = (document as { _id?: { toString: () => string } })._id?.toString();
      if (documentId) {
        const boost = this.getCachedBoost(documentId);
        if (boost > 1.0) {
          score = Math.round(score * boost);
        }
      }
    }

    return score;
  }

  /**
   * Calculate metadata-based boost for a document
   * Returns a boost multiplier (0 = no boost, >0 = boost amount)
   */
  private calculateMetadataBoost(
    document: ScrapedDocument & DocumentMetadata,
    onderwerp: string,
    thema: string,
    overheidslaag: string
  ): number {
    let boost = 0;
    const metadata = document as DocumentMetadata;
    const confidence = metadata.metadataConfidence || 0.5;

    // Policy document boost for policy-related queries
    if (this.isPolicyQuery(onderwerp, thema)) {
      const isPolicyDoc = this.isPolicyDocument(document.type_document);
      if (isPolicyDoc) {
        boost += (this.metadataConfig.policyBoost - 1) * confidence;
      }
    }

    // Theme matching boost
    if (metadata.themes && metadata.themes.length > 0) {
      const themeMatch = this.matchThemes(metadata.themes, thema);
      if (themeMatch > 0) {
        boost += (this.metadataConfig.themeMatchBoost - 1) * themeMatch * confidence;
      }
    }

    // Recency boost (enhanced with metadata confidence)
    if (document.publicatiedatum) {
      const recencyBoost = this.calculateRecencyBoost(document.publicatiedatum);
      if (recencyBoost > 0) {
        boost += (this.metadataConfig.recencyBoost - 1) * recencyBoost * confidence;
      }
    }

    // Authority boost
    if (metadata.issuingAuthority) {
      const authorityMatch = this.matchAuthority(metadata.issuingAuthority, overheidslaag);
      if (authorityMatch) {
        boost += (this.metadataConfig.authorityBoost - 1) * confidence;
      }
    }

    return Math.min(boost, 0.5); // Cap boost at 50%
  }

  /**
   * Check if query is policy-related
   */
  private isPolicyQuery(onderwerp: string, thema: string): boolean {
    const policyKeywords = ['beleid', 'beleidsnota', 'beleidsregel', 'beleidsdocument', 'beleidsplan'];
    const queryText = `${onderwerp} ${thema}`.toLowerCase();
    return policyKeywords.some(keyword => queryText.includes(keyword));
  }

  /**
   * Check if document type is a policy document
   */
  private isPolicyDocument(type: string): boolean {
    const policyTypes = [
      'Beleidsdocument',
      'Beleidsnota',
      'Beleidsregel',
      'Omgevingsvisie',
      'Structuurvisie',
      'Visiedocument'
    ];
    return policyTypes.includes(type);
  }

  /**
   * Match document themes to query theme
   * Returns match score 0-1
   */
  private matchThemes(documentThemes: string[], queryTheme: string): number {
    if (!queryTheme || documentThemes.length === 0) return 0;

    const queryLower = queryTheme.toLowerCase();
    let bestMatch = 0;

    for (const theme of documentThemes) {
      const themeLower = theme.toLowerCase();
      
      // Exact match
      if (themeLower === queryLower) {
        return 1.0;
      }
      
      // Contains match
      if (themeLower.includes(queryLower) || queryLower.includes(themeLower)) {
        bestMatch = Math.max(bestMatch, 0.7);
      }
      
      // Word overlap
      const themeWords = themeLower.split(/\s+/);
      const queryWords = queryLower.split(/\s+/);
      const commonWords = themeWords.filter(w => queryWords.includes(w) && w.length > 3);
      if (commonWords.length > 0) {
        bestMatch = Math.max(bestMatch, 0.5 * (commonWords.length / Math.max(themeWords.length, queryWords.length)));
      }
    }

    return bestMatch;
  }

  /**
   * Calculate recency boost (0-1)
   */
  private calculateRecencyBoost(publicatiedatum: string): number {
    try {
      const pubDate = new Date(publicatiedatum);
      const now = new Date();
      const ageInDays = (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60 * 24);

      if (ageInDays < 0) return 0; // Future dates
      if (ageInDays < 365) return 1.0; // Within last year
      if (ageInDays < 730) return 0.7; // Within last 2 years
      if (ageInDays < 1825) return 0.4; // Within last 5 years
      return 0.1; // Older
    } catch {
      return 0;
    }
  }

  /**
   * Check if document authority matches query government layer
   */
  private matchAuthority(issuingAuthority: string, overheidslaag: string): boolean {
    if (!issuingAuthority || !overheidslaag) return false;

    const authorityLower = issuingAuthority.toLowerCase();
    const layerLower = overheidslaag.toLowerCase();

    // Municipality match
    if (layerLower.includes('gemeente') && authorityLower.includes('gemeente')) {
      return true;
    }

    // Province match
    if (layerLower.includes('provincie') && authorityLower.includes('provincie')) {
      return true;
    }

    // National match
    if ((layerLower.includes('rijk') || layerLower.includes('nationaal')) && 
        (authorityLower.includes('rijk') || authorityLower.includes('rijksoverheid'))) {
      return true;
    }

    return false;
  }

  /**
   * Get cached boost for a document, refreshing cache if needed
   */
  private getCachedBoost(documentId: string): number {
    // Check if cache needs refresh (older than 1 hour)
    const now = Date.now();
    if (now - this.lastCacheUpdate > this.cacheExpiry) {
      // Refresh cache asynchronously (don't block)
      this.refreshBoostsCache().catch(err => {
        console.warn('[RelevanceScorerService] Failed to refresh boosts cache:', err);
      });
    }

    return this.documentBoostsCache.get(documentId) || 1.0;
  }

  /**
   * Refresh the boosts cache from learning service
   */
  private async refreshBoostsCache(): Promise<void> {
    if (!this.learningService?.isEnabled()) {
      return;
    }

    try {
      const boosts = await this.learningService.calculateRankingBoosts();
      this.documentBoostsCache.clear();
      
      for (const boost of boosts) {
        this.documentBoostsCache.set(boost.documentId, boost.boostMultiplier);
      }
      
      this.lastCacheUpdate = Date.now();
      logger.info({ boostCount: boosts.length }, '[RelevanceScorerService] Refreshed boosts cache');
    } catch (error) {
      logger.error({ error }, '[RelevanceScorerService] Error refreshing boosts cache');
    }
  }

  /**
   * Score and filter documents by minimum relevance threshold.
   * 
   * Optionally uses LLM re-ranker if enabled to improve ranking quality.
   * 
   * @param documents Documents to score and filter
   * @param onderwerp Main subject/topic
   * @param thema Theme/sub-theme
   * @param overheidslaag Government layer
   * @param minScore Minimum relevance score threshold
   * @param useReranker Whether to use LLM re-ranker (default: true if enabled)
   * @returns Scored, filtered, and sorted documents
   */
  async scoreAndFilterDocuments(
    documents: ScrapedDocument[],
    onderwerp: string,
    thema: string,
    overheidslaag: string,
    minScore: number = 3,
    useReranker: boolean = true
  ): Promise<ScrapedDocument[]> {
    // First, calculate initial relevance scores
    const scoredDocuments = documents.map(doc => ({
      ...doc,
      relevanceScore: this.calculateRelevance(doc, onderwerp, thema, overheidslaag)
    }));

    // Log scoring details for debugging
    if (process.env.DEBUG_SCORING === 'true') {
      const lowScoreDocs = scoredDocuments.filter(doc => (doc.relevanceScore || 0) < minScore);
      logger.info(
        {
          totalDocs: documents.length,
          passed: scoredDocuments.length - lowScoreDocs.length,
          rejected: lowScoreDocs.length
        },
        '[RelevanceScorer] Scoring details'
      );
      if (lowScoreDocs.length > 0) {
        logger.info(
          {
            title: lowScoreDocs[0].titel,
            score: lowScoreDocs[0].relevanceScore
          },
          '[RelevanceScorer] Sample rejected doc'
        );
      }
    }

    // Filter by minimum score
    const filtered = scoredDocuments.filter(doc => doc.relevanceScore && doc.relevanceScore >= minScore);

    // Sort by initial score
    const sorted = filtered.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    // Apply LLM re-ranking if enabled and requested
    if (useReranker && this.rerankerService?.isEnabled() && sorted.length > 0) {
      try {
        // Build query from onderwerp and thema
        const query = [onderwerp, thema].filter(Boolean).join(' ');

        // Re-rank documents (RerankerService handles score extraction internally)
        const rerankedResults = await this.rerankerService.rerank(sorted, query);

        // Convert back to ScrapedDocument format with updated scores
        // Map scores back to 0-20 scale for consistency
        return rerankedResults.map(result => ({
          ...result.document,
          relevanceScore: result.finalScore * 20, // Convert 0-1 to 0-20 scale
          // Store re-ranker metadata for debugging
          rerankerScore: result.rerankerScore,
          hybridScore: result.hybridScore
        } as ScrapedDocument & { rerankerScore?: number; hybridScore?: number }));
      } catch (error) {
        console.error('[RelevanceScorerService] Re-ranking failed, using original scores:', error);
        // Fallback to original sorted documents
        return sorted;
      }
    }

    return sorted;
  }

  /**
   * Generate relevance explanation text
   */
  generateRelevanceExplanation(
    document: ScrapedDocument,
    onderwerp: string,
    thema: string,
    score: number
  ): string {
    const matches: string[] = [];

    if (document.titel.toLowerCase().includes(onderwerp.toLowerCase())) {
      matches.push(`titel bevat "${onderwerp}"`);
    }
    if (document.titel.toLowerCase().includes(thema.toLowerCase())) {
      matches.push(`titel bevat "${thema}"`);
    }
    if (document.samenvatting.toLowerCase().includes(onderwerp.toLowerCase())) {
      matches.push(`samenvatting bevat "${onderwerp}"`);
    }
    if (document.samenvatting.toLowerCase().includes(thema.toLowerCase())) {
      matches.push(`samenvatting bevat "${thema}"`);
    }

    if (matches.length === 0) {
      return `Mogelijk relevant voor ${onderwerp} en ${thema}`;
    }

    const matchText = matches.join(', ');
    return `Relevant omdat ${matchText}. Relevantiescore: ${score}/20`;
  }

  /**
   * Categorize documents by relevance level
   */
  categorizeByRelevance(
    documents: ScrapedDocument[],
    onderwerp: string,
    thema: string,
    overheidslaag: string
  ): {
    high: ScrapedDocument[];
    medium: ScrapedDocument[];
    low: ScrapedDocument[];
  } {
    const scored = documents.map(doc => ({
      ...doc,
      relevanceScore: this.calculateRelevance(doc, onderwerp, thema, overheidslaag)
    }));

    return {
      high: scored.filter(doc => (doc.relevanceScore || 0) >= 10),
      medium: scored.filter(doc => (doc.relevanceScore || 0) >= 5 && (doc.relevanceScore || 0) < 10),
      low: scored.filter(doc => (doc.relevanceScore || 0) < 5)
    };
  }
}
