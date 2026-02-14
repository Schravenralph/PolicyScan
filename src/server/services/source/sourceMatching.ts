import { Db, Filter } from 'mongodb';
import { BronWebsiteDocument } from '../../types/index.js';
import { SourceRankingService } from './SourceRankingService.js';

/**
 * Source Matching Service
 * 
 * Uses multi-factor source ranking by default:
 * - Semantic similarity
 * - Historical performance
 * - Keyword matching
 * - Source quality
 * 
 * Falls back to traditional keyword-based ranking if ranking is disabled
 * or when a query is not provided.
 */
export class SourceMatchingService {
  private ranking: SourceRankingService | null = null;
  private rankingEnabled: boolean;

  constructor(private db: Db) {
    // Source ranking is enabled by default, can be disabled with SOURCE_RANKING_ENABLED=false
    this.rankingEnabled = process.env.SOURCE_RANKING_ENABLED !== 'false';
    
    if (this.rankingEnabled) {
      // Initialize ranking service
      this.ranking = new SourceRankingService(db, this);
      console.log('[SourceMatchingService] Multi-factor source ranking enabled');
    } else {
      console.log('[SourceMatchingService] Using traditional keyword-based ranking');
    }
  }

  /**
   * Find bronwebsites that match the query parameters
   * 
   * Filters out deprecated sources (quality < 0.3) if quality scores are available.
   */
  async findMatchingWebsites(
    onderwerp: string,
    thema: string,
    overheidslaag: string
  ): Promise<BronWebsiteDocument[]> {
    const collection = this.db.collection<BronWebsiteDocument>('bronwebsites');

    // Build query to match subjects, themes, or website_types
    const matchQuery: Filter<BronWebsiteDocument> & { $or: Array<Filter<BronWebsiteDocument>> } = {
      $or: [],
      // Exclude deprecated sources
      deprecated: { $ne: true }
    };

    // Match by onderwerp (subject)
    if (onderwerp) {
      matchQuery.$or.push({
        subjects: { $regex: onderwerp, $options: 'i' }
      });
    }

    // Match by thema (theme)
    if (thema) {
      matchQuery.$or.push({
        themes: { $regex: thema, $options: 'i' }
      });
    }

    // Match by overheidslaag (website_types)
    if (overheidslaag) {
      matchQuery.$or.push({
        website_types: { $regex: overheidslaag, $options: 'i' }
      });
    }

    // If no criteria, return empty array
    if (matchQuery.$or.length === 0) {
      return [];
    }

    // Filter out deprecated sources after fetching (quality < 0.3 or deprecated flag is true)

    try {
      let websites = await collection.find(matchQuery).toArray();
      
      // Filter out deprecated sources (quality < 0.3 or deprecated flag is true)
      websites = websites.filter(website => {
        // Exclude if explicitly deprecated
        if (website.deprecated === true) {
          return false;
        }
        
        // Exclude if quality score exists and is too low
        if (website.qualityScore !== undefined && website.qualityScore < 0.3) {
          return false;
        }
        
        return true;
      });
      
      console.log(`Found ${websites.length} matching bronwebsites for: ${onderwerp} / ${thema}`);
      return websites;
    } catch (error) {
      console.error('Error finding matching websites:', error);
      return [];
    }
  }

  /**
   * Find websites by exact subject match
   */
  async findBySubject(subject: string): Promise<BronWebsiteDocument[]> {
    const collection = this.db.collection<BronWebsiteDocument>('bronwebsites');

    try {
      const websites = await collection.find({
        subjects: { $in: [subject] }
      }).toArray();

      return websites;
    } catch (error) {
      console.error('Error finding websites by subject:', error);
      return [];
    }
  }

  /**
   * Find websites by exact theme match
   */
  async findByTheme(theme: string): Promise<BronWebsiteDocument[]> {
    const collection = this.db.collection<BronWebsiteDocument>('bronwebsites');

    try {
      const websites = await collection.find({
        themes: { $in: [theme] }
      }).toArray();

      return websites;
    } catch (error) {
      console.error('Error finding websites by theme:', error);
      return [];
    }
  }

  /**
   * Find websites by government level
   */
  async findByWebsiteType(websiteType: string): Promise<BronWebsiteDocument[]> {
    const collection = this.db.collection<BronWebsiteDocument>('bronwebsites');

    try {
      const websites = await collection.find({
        website_types: { $in: [websiteType] }
      }).toArray();

      return websites;
    } catch (error) {
      console.error('Error finding websites by type:', error);
      return [];
    }
  }

  /**
   * Calculate relevance score for a website based on query parameters
   */
  calculateWebsiteRelevance(
    website: BronWebsiteDocument,
    onderwerp: string,
    thema: string,
    overheidslaag: string
  ): number {
    let score = 0;

    // Check subject match
    if (website.subjects) {
      const subjectMatch = website.subjects.some(subject =>
        subject.toLowerCase().includes(onderwerp.toLowerCase()) ||
        onderwerp.toLowerCase().includes(subject.toLowerCase())
      );
      if (subjectMatch) score += 3;
    }

    // Check theme match
    if (website.themes) {
      const themeMatch = website.themes.some(theme =>
        theme.toLowerCase().includes(thema.toLowerCase()) ||
        thema.toLowerCase().includes(theme.toLowerCase())
      );
      if (themeMatch) score += 3;
    }

    // Check website type match
    if (website.website_types) {
      const typeMatch = website.website_types.some(type =>
        type.toLowerCase().includes(overheidslaag.toLowerCase()) ||
        overheidslaag.toLowerCase().includes(type.toLowerCase())
      );
      if (typeMatch) score += 2;
    }

    // Bonus for accepted websites
    if (website.accepted === true) {
      score += 1;
    }

    // Boost for high-quality sources (qualityScore > 0.8)
    if (website.qualityScore !== undefined && website.qualityScore > 0.8) {
      score += 2; // Significant boost for high-quality sources
    } else if (website.qualityScore !== undefined && website.qualityScore > 0.6) {
      score += 1; // Moderate boost for good-quality sources
    }

    return score;
  }

  /**
   * Get ranked list of matching websites
   * 
   * Uses multi-factor ranking by default when a query is provided.
   * Falls back to traditional keyword-based ranking when:
   * - Ranking is disabled (SOURCE_RANKING_ENABLED=false)
   * - No query text is provided
   * - Ranking service encounters an error
   */
  async getRankedMatchingWebsites(
    onderwerp: string,
    thema: string,
    overheidslaag: string,
    limit: number = 10,
    query?: string // Optional query text for semantic matching
  ): Promise<BronWebsiteDocument[]> {
    const websites = await this.findMatchingWebsites(onderwerp, thema, overheidslaag);

    if (websites.length === 0) {
      return [];
    }

    // Filter out deprecated sources before ranking
    const activeWebsites = websites.filter(website => {
      // Exclude deprecated sources (quality < 0.3 or explicitly deprecated)
      if (website.deprecated === true) {
        return false;
      }
      if (website.qualityScore !== undefined && website.qualityScore < 0.3) {
        return false;
      }
      return true;
    });

    // Boost high-quality sources (quality > 0.8) by moving them to the front
    const highQualitySources = activeWebsites.filter(w => 
      w.qualityScore !== undefined && w.qualityScore > 0.8
    );
    const otherSources = activeWebsites.filter(w => 
      w.qualityScore === undefined || w.qualityScore <= 0.8
    );
    const prioritizedWebsites = [...highQualitySources, ...otherSources];

    // Use multi-factor ranking if enabled and query is provided
    if (this.rankingEnabled && this.ranking && query) {
      try {
        const rankedSources = await this.ranking.rankSources(
          prioritizedWebsites,
          query,
          onderwerp,
          thema,
          overheidslaag
        );

        // Log ranking factors for debugging (first 3 sources)
        if (rankedSources.length > 0) {
          console.log('[SourceMatchingService] Multi-factor ranking applied:');
          rankedSources.slice(0, 3).forEach((ranked, idx) => {
            console.log(`  ${idx + 1}. ${ranked.website.url} (score: ${ranked.finalScore.toFixed(3)})`);
            console.log(`     Factors: semantic=${ranked.rankingFactors.semanticScore.toFixed(2)}, ` +
                       `performance=${ranked.rankingFactors.performanceScore.toFixed(2)}, ` +
                       `keyword=${ranked.rankingFactors.keywordScore.toFixed(2)}, ` +
                       `quality=${ranked.rankingFactors.qualityScore.toFixed(2)}`);
          });
        }

        return rankedSources
          .slice(0, limit)
          .map(ranked => ranked.website);
      } catch (error) {
        console.error('[SourceMatchingService] Error in multi-factor ranking, falling back to keyword ranking:', error);
        // Fall through to traditional ranking
      }
    }

    // Traditional keyword-based ranking (fallback or when disabled)
    // Apply quality boost: high-quality sources (quality > 0.8) get 20% boost
    const scoredWebsites = prioritizedWebsites.map(website => {
      let score = this.calculateWebsiteRelevance(website, onderwerp, thema, overheidslaag);
      
      // Boost high-quality sources
      if (website.qualityScore !== undefined && website.qualityScore > 0.8) {
        score *= 1.2; // 20% boost
      }
      
      return { website, score };
    });

    // Sort by score (highest first) and return top results
    return scoredWebsites
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.website);
  }
}
