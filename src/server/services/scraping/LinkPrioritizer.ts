/**
 * Link Prioritizer
 * Prioritizes links based on semantic scores and relevance thresholds
 */

import { SemanticLinkScorer, LinkContext, SemanticScore } from './SemanticLinkScorer.js';
import { logger } from '../../utils/logger.js';

export interface PrioritizedLink {
  url: string;
  score: number;
  context: LinkContext;
  semanticScore: SemanticScore;
  priority: 'high' | 'medium' | 'low';
}

export interface PrioritizationOptions {
  minRelevanceThreshold?: number; // Minimum score to include (default: 0.3)
  maxLinks?: number; // Maximum number of links to return
  deprioritizePatterns?: RegExp[]; // URL patterns to deprioritize
  prioritizePatterns?: RegExp[]; // URL patterns to prioritize
}

/**
 * Service for prioritizing links based on semantic scores
 */
export class LinkPrioritizer {
  private scorer: SemanticLinkScorer;
  private defaultMinThreshold = 0.3;
  private defaultMaxLinks = 100;

  // Patterns that indicate navigation/structural links (to deprioritize)
  private defaultDeprioritizePatterns: RegExp[] = [
    /\/home$/i,
    /\/index/i,
    /\/contact/i,
    /\/about/i,
    /\/privacy/i,
    /\/terms/i,
    /\/cookie/i,
    /\/sitemap/i,
    /\/search/i,
    /^#/, // Anchors
    /\.(jpg|jpeg|png|gif|pdf|zip|doc|docx)$/i, // Files (unless PDFs are policy docs)
  ];

  // Patterns that indicate policy documents (to prioritize)
  private defaultPrioritizePatterns: RegExp[] = [
    /\/beleid/i,
    /\/regeling/i,
    /\/verordening/i,
    /\/besluit/i,
    /\/wet/i,
    /\/nota/i,
    /\/plan/i,
    /\/richtlijn/i,
    /\/protocol/i,
    /\.pdf$/i, // PDFs often contain policy documents
  ];

  constructor(scorer?: SemanticLinkScorer) {
    this.scorer = scorer || new SemanticLinkScorer();
  }

  /**
   * Prioritize links based on semantic scores
   */
  async prioritizeLinks(
    links: LinkContext[],
    options: PrioritizationOptions = {}
  ): Promise<PrioritizedLink[]> {
    const {
      minRelevanceThreshold = this.defaultMinThreshold,
      maxLinks = this.defaultMaxLinks,
      deprioritizePatterns = [],
      prioritizePatterns = [],
    } = options;

    // Combine default and custom patterns
    const allDeprioritizePatterns = [
      ...this.defaultDeprioritizePatterns,
      ...deprioritizePatterns,
    ];
    const allPrioritizePatterns = [
      ...this.defaultPrioritizePatterns,
      ...prioritizePatterns,
    ];

    // Score all links
    const scores = await this.scorer.scoreLinks(links);

    // Create prioritized links
    const prioritized: PrioritizedLink[] = links
      .map(link => {
        const semanticScore = scores.get(link.url);
        if (!semanticScore) {
          return null;
        }

        // Apply pattern-based adjustments
        let adjustedScore = semanticScore.combinedScore;

        // Check deprioritize patterns
        for (const pattern of allDeprioritizePatterns) {
          if (pattern.test(link.url)) {
            adjustedScore *= 0.5; // Reduce score by 50%
            break;
          }
        }

        // Check prioritize patterns
        for (const pattern of allPrioritizePatterns) {
          if (pattern.test(link.url)) {
            adjustedScore = Math.min(adjustedScore * 1.3, 1.0); // Boost by 30% (capped at 1.0)
            break;
          }
        }

        return {
          url: link.url,
          score: adjustedScore,
          context: link,
          semanticScore,
          priority: this.determinePriority(adjustedScore),
        };
      })
      .filter((link): link is PrioritizedLink => {
        if (!link) return false;
        // Filter by minimum threshold
        return link.score >= minRelevanceThreshold;
      })
      .sort((a, b) => b.score - a.score) // Sort by score descending
      .slice(0, maxLinks); // Limit results

    logger.debug(
      `[LinkPrioritizer] Prioritized ${prioritized.length} links from ${links.length} total`
    );

    return prioritized;
  }

  /**
   * Determine priority level based on score
   */
  private determinePriority(score: number): 'high' | 'medium' | 'low' {
    if (score >= 0.7) {
      return 'high';
    } else if (score >= 0.5) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Get high-priority links only
   */
  async getHighPriorityLinks(
    links: LinkContext[],
    options: PrioritizationOptions = {}
  ): Promise<PrioritizedLink[]> {
    const prioritized = await this.prioritizeLinks(links, options);
    return prioritized.filter(link => link.priority === 'high');
  }

  /**
   * Get links above a specific score threshold
   */
  async getLinksAboveThreshold(
    links: LinkContext[],
    threshold: number,
    options: Omit<PrioritizationOptions, 'minRelevanceThreshold'> = {}
  ): Promise<PrioritizedLink[]> {
    return this.prioritizeLinks(links, {
      ...options,
      minRelevanceThreshold: threshold,
    });
  }
}

