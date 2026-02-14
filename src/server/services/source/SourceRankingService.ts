import { Db } from 'mongodb';
import { BronWebsiteDocument } from '../../types/index.js';
import { SourcePerformanceService } from './SourcePerformanceService.js';
import { SourceEmbeddingService } from '../ingestion/embeddings/SourceEmbeddingService.js';
import { LocalEmbeddingProvider } from '../query/VectorService.js';
import { SourceMatchingService } from './sourceMatching.js';

/**
 * Source Ranking Service
 * 
 * Multi-factor source ranking that combines:
 * 1. Semantic similarity (0.4 weight) - How well the source matches the query semantically
 * 2. Historical performance (0.3 weight) - Acceptance rate of documents from this source
 * 3. Keyword matching (0.2 weight) - Traditional keyword-based relevance
 * 4. Source quality (0.1 weight) - Source metadata completeness and quality indicators
 * 
 * How it works:
 * 1. rankSources() is called with a list of sources and a query
 * 2. For each source, it calculates scores for all four factors
 * 3. Scores are normalized to [0, 1] and combined using configured weights
 * 4. Sources are sorted by final score (highest first)
 * 
 * This service is enabled by default. To disable, set SOURCE_RANKING_ENABLED=false in .env
 * 
 * Configuration (in .env):
 * - SOURCE_RANKING_ENABLED=true (default: true)
 * - SOURCE_RANKING_SEMANTIC_WEIGHT=0.4
 * - SOURCE_RANKING_PERFORMANCE_WEIGHT=0.3
 * - SOURCE_RANKING_KEYWORD_WEIGHT=0.2
 * - SOURCE_RANKING_QUALITY_WEIGHT=0.1
 */
export interface RankedSource {
  website: BronWebsiteDocument;
  finalScore: number;
  rankingFactors: {
    semanticScore: number;
    performanceScore: number;
    keywordScore: number;
    qualityScore: number;
  };
}

export interface RankingWeights {
  semantic: number;
  performance: number;
  keyword: number;
  quality: number;
}

export class SourceRankingService {
  private performanceService: SourcePerformanceService;
  private embeddingService: SourceEmbeddingService;
  private sourceMatching: SourceMatchingService;
  private embeddingProvider: LocalEmbeddingProvider;
  private weights: RankingWeights;

  constructor(
    db: Db,
    sourceMatching: SourceMatchingService,
    weights?: Partial<RankingWeights>
  ) {
    this.performanceService = new SourcePerformanceService(db);
    this.embeddingService = new SourceEmbeddingService();
    this.sourceMatching = sourceMatching;
    this.embeddingProvider = new LocalEmbeddingProvider();

    // Default weights (must sum to 1.0)
    // Quality weight increased to 20-30% as per WI-202 requirements
    this.weights = {
      semantic: parseFloat(process.env.SOURCE_RANKING_SEMANTIC_WEIGHT || '0.35'),
      performance: parseFloat(process.env.SOURCE_RANKING_PERFORMANCE_WEIGHT || '0.25'),
      keyword: parseFloat(process.env.SOURCE_RANKING_KEYWORD_WEIGHT || '0.2'),
      quality: parseFloat(process.env.SOURCE_RANKING_QUALITY_WEIGHT || '0.2'), // Increased from 0.1 to 0.2 (20%)
      ...weights
    };

    // Normalize weights to sum to 1.0
    const sum = this.weights.semantic + this.weights.performance + 
                this.weights.keyword + this.weights.quality;
    if (sum > 0) {
      this.weights.semantic /= sum;
      this.weights.performance /= sum;
      this.weights.keyword /= sum;
      this.weights.quality /= sum;
    }
  }

  /**
   * Rank sources using multi-factor scoring
   * 
   * This is the main entry point for source ranking.
   * It combines semantic similarity, historical performance, keyword matching,
   * and source quality into a final ranking score.
   * 
   * @param sources - List of sources to rank
   * @param query - Search query text
   * @param onderwerp - Subject/topic
   * @param thema - Theme
   * @param overheidslaag - Government level
   * @returns Ranked sources with scores and factor breakdown
   */
  async rankSources(
    sources: BronWebsiteDocument[],
    query: string,
    onderwerp: string,
    thema: string,
    overheidslaag: string
  ): Promise<RankedSource[]> {
    // Generate query embedding once for all sources
    const queryText = [query, onderwerp, thema].filter(Boolean).join(' ');
    const queryEmbedding = await this.embeddingProvider.generateEmbedding(queryText);

    // Calculate scores for each source
    const rankedSources: RankedSource[] = [];

    for (const source of sources) {
      const factors = await this.calculateRankingFactors(
        source,
        queryEmbedding,
        queryText,
        onderwerp,
        thema,
        overheidslaag
      );

      // Calculate weighted final score
      const finalScore =
        factors.semanticScore * this.weights.semantic +
        factors.performanceScore * this.weights.performance +
        factors.keywordScore * this.weights.keyword +
        factors.qualityScore * this.weights.quality;

      rankedSources.push({
        website: source,
        finalScore,
        rankingFactors: factors
      });
    }

    // Sort by final score (highest first)
    rankedSources.sort((a, b) => b.finalScore - a.finalScore);

    return rankedSources;
  }

  /**
   * Calculate all ranking factors for a source
   */
  private async calculateRankingFactors(
    source: BronWebsiteDocument,
    queryEmbedding: number[],
    queryText: string,
    onderwerp: string,
    thema: string,
    overheidslaag: string
  ): Promise<RankedSource['rankingFactors']> {
    // 1. Semantic similarity score [0, 1]
    const semanticScore = await this.calculateSemanticScore(source, queryEmbedding);

    // 2. Historical performance score [0, 1]
    const performanceScore = await this.calculatePerformanceScore(source.url);

    // 3. Keyword matching score [0, 1]
    const keywordScore = this.calculateKeywordScore(
      source,
      onderwerp,
      thema,
      overheidslaag
    );

    // 4. Source quality score [0, 1]
    const qualityScore = this.calculateQualityScore(source);

    return {
      semanticScore,
      performanceScore,
      keywordScore,
      qualityScore
    };
  }

  /**
   * Calculate semantic similarity score
   * 
   * Uses embeddings to measure how well the source matches the query
   * semantically, even if exact keywords don't match.
   */
  private async calculateSemanticScore(
    source: BronWebsiteDocument,
    queryEmbedding: number[]
  ): Promise<number> {
    try {
      const sourceEmbedding = await this.embeddingService.generateSourceEmbedding(source);
      return this.embeddingService.calculateSimilarity(queryEmbedding, sourceEmbedding);
    } catch (error) {
      console.warn(`[SourceRanking] Error calculating semantic score for ${source.url}:`, error);
      return 0;
    }
  }

  /**
   * Calculate historical performance score
   * 
   * Uses acceptance rate of documents from this source. Sources with
   * high acceptance rates get higher scores.
   */
  private async calculatePerformanceScore(sourceUrl: string): Promise<number> {
    try {
      const acceptanceRate = await this.performanceService.getSourceAcceptanceRate(sourceUrl);
      
      if (acceptanceRate === null) {
        // No data yet - return neutral score (0.5)
        return 0.5;
      }

      return acceptanceRate;
    } catch (error) {
      console.warn(`[SourceRanking] Error calculating performance score for ${sourceUrl}:`, error);
      return 0.5; // Neutral score on error
    }
  }

  /**
   * Calculate keyword matching score
   * 
   * Uses the existing SourceMatchingService scoring logic, normalized to [0, 1].
   */
  private calculateKeywordScore(
    source: BronWebsiteDocument,
    onderwerp: string,
    thema: string,
    overheidslaag: string
  ): number {
    // Use existing relevance calculation (max score is ~9: 3+3+2+1)
    const rawScore = this.sourceMatching.calculateWebsiteRelevance(
      source,
      onderwerp,
      thema,
      overheidslaag
    );

    // Normalize to [0, 1] (assuming max score of 9)
    return Math.min(1, rawScore / 9);
  }

  /**
   * Calculate source quality score
   * 
   * Uses qualityScore from LearningService if available (from feedback analysis),
   * otherwise falls back to metadata completeness calculation.
   */
  private calculateQualityScore(source: BronWebsiteDocument): number {
    // Prefer qualityScore from LearningService if available
    if (source.qualityScore !== undefined && source.qualityScore !== null) {
      return Math.max(0, Math.min(1, source.qualityScore));
    }

    // Fallback to metadata completeness calculation
    let score = 0;
    let maxScore = 0;

    // Title present (required, so always 1 point)
    maxScore += 1;
    if (source.titel && source.titel.trim().length > 0) {
      score += 1;
    }

    // Description present
    maxScore += 1;
    if (source.samenvatting && source.samenvatting.trim().length > 0) {
      score += 1;
    }

    // Subjects present
    maxScore += 1;
    if (source.subjects && source.subjects.length > 0) {
      score += 1;
    }

    // Themes present
    maxScore += 1;
    if (source.themes && source.themes.length > 0) {
      score += 1;
    }

    // Website types present
    maxScore += 1;
    if (source.website_types && source.website_types.length > 0) {
      score += 1;
    }

    // Accepted flag (indicates manual review/approval)
    maxScore += 1;
    if (source.accepted === true) {
      score += 1;
    }

    return maxScore > 0 ? score / maxScore : 0;
  }
}




