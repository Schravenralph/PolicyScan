/**
 * Link Prioritization Service
 * 
 * Uses LLM to intelligently prioritize links for crawling.
 * This helps AI-guided crawlers focus on the most relevant content.
 */

import { AINavigationService } from './ai-crawling/AINavigationService.js';
// NavigationLink type is used by AINavigationService but not directly imported here

export interface LinkWithContext {
  url: string;
  text: string;
  context?: string; // Surrounding text or page context
  depth?: number; // Crawl depth
}

export interface PrioritizedLink extends LinkWithContext {
  priority: number; // 0-1, higher is more important
  reasoning?: string;
}

/**
 * Service for prioritizing links using LLM
 */
export class LinkPrioritizationService {
  private navigationService: AINavigationService;

  constructor(navigationService?: AINavigationService) {
    this.navigationService = navigationService || new AINavigationService();
  }

  /**
   * Prioritize links based on query relevance
   * 
   * @param links - Links to prioritize
   * @param query - Search query/topic
   * @param baseUrl - Base URL for context
   * @returns Prioritized links sorted by priority
   */
  async prioritizeLinks(
    links: LinkWithContext[],
    query: string,
    baseUrl: string
  ): Promise<PrioritizedLink[]> {
    if (links.length === 0) {
      return [];
    }

    // Use AINavigationService to get relevance scores
    // (It already has LLM integration)
    const analysis = await this.navigationService.analyzeSiteStructure(baseUrl, query);
    
    // Create a map of URLs to scores from analysis
    const scoreMap = new Map<string, number>();
    for (const link of analysis.relevantLinks) {
      scoreMap.set(link.url, link.relevanceScore);
    }

    // Prioritize links
    const prioritized: PrioritizedLink[] = links.map(link => {
      const relevanceScore = scoreMap.get(link.url) || this.calculateSimpleScore(link, query);
      
      // Adjust score based on depth (prefer shallower links)
      const depthPenalty = link.depth ? link.depth * 0.1 : 0;
      const priority = Math.max(0, Math.min(1, relevanceScore - depthPenalty));

      return {
        ...link,
        priority,
        reasoning: this.generateReasoning(link, query, priority)
      };
    });

    // Sort by priority (descending)
    return prioritized.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Calculate simple relevance score (fallback when LLM is not available)
   */
  private calculateSimpleScore(link: LinkWithContext, query: string): number {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);
    
    const textLower = link.text.toLowerCase();
    const urlLower = link.url.toLowerCase();
    const contextLower = (link.context || '').toLowerCase();

    let score = 0;
    for (const term of queryTerms) {
      if (textLower.includes(term)) score += 2;
      if (urlLower.includes(term)) score += 1;
      if (contextLower.includes(term)) score += 1;
    }

    // Normalize to [0, 1]
    return Math.min(1, score / (queryTerms.length * 2));
  }

  /**
   * Generate reasoning for priority score
   */
  private generateReasoning(
    _link: LinkWithContext,
    query: string,
    priority: number
  ): string {
    // _link is unused but kept for interface consistency or potential future use
    if (priority > 0.7) {
      return `High relevance: Link text and context strongly match query "${query}"`;
    } else if (priority > 0.4) {
      return `Moderate relevance: Some match with query "${query}"`;
    } else {
      return `Low relevance: Limited match with query "${query}"`;
    }
  }

  /**
   * Filter links by minimum priority threshold
   * 
   * @param links - Prioritized links
   * @param minPriority - Minimum priority threshold (0-1)
   * @returns Filtered links
   */
  filterByPriority(
    links: PrioritizedLink[],
    minPriority: number = 0.3
  ): PrioritizedLink[] {
    return links.filter(link => link.priority >= minPriority);
  }

  /**
   * Get top N links by priority
   * 
   * @param links - Prioritized links
   * @param topN - Number of top links to return
   * @returns Top N links
   */
  getTopLinks(links: PrioritizedLink[], topN: number = 10): PrioritizedLink[] {
    return links.slice(0, topN);
  }
}

