/**
 * AI Navigation Service
 * 
 * Uses LLM to analyze site structure and find relevant sections/links.
 * This service helps AI-guided crawlers navigate sites intelligently.
 */

import * as cheerio from 'cheerio';
import axios, { AxiosRequestConfig } from 'axios';
import { scraperConfig } from '../../config/scraperConfig.js';
// OpenAI is dynamically imported, so we use a generic type
type OpenAI = {
  chat: {
    completions: {
      create: (params: {
        model: string;
        messages: Array<{ role: string; content: string }>;
        temperature?: number;
        max_tokens?: number;
      }) => Promise<{
        choices: Array<{
          message: {
            content: string | null;
          };
        }>;
      }>;
    };
  };
};

export interface NavigationLink {
  url: string;
  text: string;
  relevanceScore: number;
  reasoning?: string;
}

export interface NavigationAnalysis {
  relevantLinks: NavigationLink[];
  suggestedPath: string[];
  siteStructure?: {
    hasSearch: boolean;
    hasSitemap: boolean;
    mainSections: string[];
  };
}

interface CacheEntry {
  analysis: NavigationAnalysis;
  timestamp: number;
}

/**
 * Service for AI-powered site navigation
 */
export class AINavigationService {
  private openaiClient: OpenAI | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTTL: number;
  private performanceMetrics: {
    llmCalls: number;
    cacheHits: number;
    cacheMisses: number;
    avgLatency: number;
    totalLatency: number;
    callCount: number;
  } = {
    llmCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgLatency: 0,
    totalLatency: 0,
    callCount: 0
  };

  constructor(cacheTTL: number = 604800) { // 7 days default
    this.cacheTTL = cacheTTL;
  }

  /**
   * Analyze homepage/sitemap to find relevant sections
   * 
   * @param baseUrl - The base URL of the site
   * @param query - The search query/topic
   * @returns Analysis with relevant links and suggested navigation path
   */
  async analyzeSiteStructure(
    baseUrl: string,
    query: string
  ): Promise<NavigationAnalysis> {
    const startTime = Date.now();
    
    // Check cache with TTL
    const cacheKey = `${baseUrl}:${query}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < this.cacheTTL * 1000) {
        this.performanceMetrics.cacheHits++;
        this.updateMetrics(Date.now() - startTime);
        return cached.analysis;
      } else {
        // Cache expired, remove it
        this.cache.delete(cacheKey);
      }
    }
    
    this.performanceMetrics.cacheMisses++;

    try {
      // Fetch homepage
      const html = await this.fetchPage(baseUrl);
      const $ = cheerio.load(html);

      // Extract all links with filtering
      const links: Array<{ url: string; text: string }> = [];
      const seenUrls = new Set<string>();
      
      $('a[href]').each((_index, element) => {
        const href = $(element).attr('href');
        const text = $(element).text().trim();
        if (href && text && text.length > 0) {
          try {
            const absoluteUrl = new URL(href, baseUrl).toString();
            // Filter out common non-content URLs
            if (absoluteUrl.startsWith('http://') || absoluteUrl.startsWith('https://')) {
              // Skip common non-content patterns
              if (!this.isNonContentUrl(absoluteUrl) && !seenUrls.has(absoluteUrl)) {
                seenUrls.add(absoluteUrl);
                links.push({ url: absoluteUrl, text });
              }
            }
          } catch {
            // Invalid URL, skip
          }
        }
      });

      // Pre-filter links using simple keyword matching before LLM
      const preFilteredLinks = this.preFilterLinks(links, query);

      // Use LLM to prioritize links (only if we have good candidates)
      const relevantLinks = await this.prioritizeLinks(preFilteredLinks, query);

      // Detect site structure (parallelize where possible)
      const [hasSitemap] = await Promise.all([
        this.checkSitemap(baseUrl)
      ]);

      const siteStructure = {
        hasSearch: $('form[action*="zoek"], form[action*="search"], input[type="search"]').length > 0,
        hasSitemap,
        mainSections: this.extractMainSections($)
      };

      // Build suggested path
      const suggestedPath = relevantLinks
        .slice(0, 5)
        .map(link => link.url);

      const analysis: NavigationAnalysis = {
        relevantLinks,
        suggestedPath,
        siteStructure
      };

      // Cache result with timestamp
      this.cache.set(cacheKey, {
        analysis,
        timestamp: Date.now()
      });

      // Cleanup old cache entries periodically (every 100 calls)
      if (this.performanceMetrics.callCount % 100 === 0) {
        this.cleanupCache();
      }

      this.updateMetrics(Date.now() - startTime);
      return analysis;
    } catch (error) {
      console.error(`Failed to analyze site structure for ${baseUrl}:`, error);
      this.updateMetrics(Date.now() - startTime);
      return {
        relevantLinks: [],
        suggestedPath: []
      };
    }
  }

  /**
   * Pre-filter links using simple keyword matching to reduce LLM token usage
   */
  private preFilterLinks(
    links: Array<{ url: string; text: string }>,
    query: string
  ): Array<{ url: string; text: string }> {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 2);
    
    if (queryTerms.length === 0) {
      return links.slice(0, 30); // No filtering possible, just limit
    }

    // Score links based on keyword matches
    const scored = links.map(link => {
      const textLower = link.text.toLowerCase();
      const urlLower = link.url.toLowerCase();
      
      let score = 0;
      for (const term of queryTerms) {
        if (textLower.includes(term)) score += 2;
        if (urlLower.includes(term)) score += 1;
      }
      
      return { link, score };
    });

    // Sort by score and take top 30 for LLM processing
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map(item => item.link);
  }

  /**
   * Check if URL is likely non-content (admin, login, etc.)
   */
  private isNonContentUrl(url: string): boolean {
    const nonContentPatterns = [
      '/login', '/logout', '/admin', '/account', '/profile',
      '/search', '/zoek', '/contact', '/contact/', '/privacy',
      '/cookies', '/algemene-voorwaarden', '/disclaimer'
    ];
    
    const urlLower = url.toLowerCase();
    return nonContentPatterns.some(pattern => urlLower.includes(pattern));
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age >= this.cacheTTL * 1000) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(latency: number): void {
    this.performanceMetrics.callCount++;
    this.performanceMetrics.totalLatency += latency;
    this.performanceMetrics.avgLatency = 
      this.performanceMetrics.totalLatency / this.performanceMetrics.callCount;
  }

  /**
   * Use LLM to prioritize links based on relevance to query
   */
  private async prioritizeLinks(
    links: Array<{ url: string; text: string }>,
    query: string
  ): Promise<NavigationLink[]> {
    // If we have very few links, skip LLM and use simple matching
    if (links.length <= 5) {
      return this.prioritizeLinksSimple(links, query);
    }

    // If LLM is not available, use simple keyword matching
    if (!this.isLLMAvailable()) {
      return this.prioritizeLinksSimple(links, query);
    }

    // Check if simple matching already gives good results
    const simpleResults = this.prioritizeLinksSimple(links, query);
    const topScore = simpleResults[0]?.relevanceScore || 0;
    
    // If simple matching finds high-confidence matches, skip LLM
    if (topScore > 0.7 && simpleResults.length >= 5) {
      return simpleResults;
    }

    try {
      return await this.prioritizeLinksWithLLM(links, query);
    } catch (error) {
      console.warn('LLM prioritization failed, falling back to simple matching:', error);
      return this.prioritizeLinksSimple(links, query);
    }
  }

  /**
   * Simple keyword-based link prioritization (fallback)
   */
  private prioritizeLinksSimple(
    links: Array<{ url: string; text: string }>,
    query: string
  ): NavigationLink[] {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);

    const scored = links.map(link => {
      const textLower = link.text.toLowerCase();
      const urlLower = link.url.toLowerCase();

      let score = 0;
      for (const term of queryTerms) {
        if (textLower.includes(term)) score += 2;
        if (urlLower.includes(term)) score += 1;
      }

      return {
        url: link.url,
        text: link.text,
        relevanceScore: score / (queryTerms.length * 2), // Normalize to [0, 1]
        reasoning: `Keyword match: ${queryTerms.filter(t => textLower.includes(t) || urlLower.includes(t)).join(', ')}`
      };
    });

    return scored
      .filter(link => link.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Use LLM to prioritize links (optimized prompt)
   */
  private async prioritizeLinksWithLLM(
    links: Array<{ url: string; text: string }>,
    query: string
  ): Promise<NavigationLink[]> {
    if (!this.openaiClient) {
      const OpenAI = await import('openai').catch(() => null);
      if (!OpenAI) {
        throw new Error('OpenAI package not available');
      }
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY not set');
      }
      this.openaiClient = new OpenAI.default({ apiKey }) as OpenAI;
    }
    const openaiClient = this.openaiClient;
    if (!openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    this.performanceMetrics.llmCalls++;

    // Optimized prompt: shorter, more focused
    const linksText = links
      .slice(0, 25) // Reduced from 30 to save tokens
      .map((link, index) => `${index + 1}. ${link.text}`) // Removed URL to save tokens
      .join('\n');

    // More concise prompt
    const prompt = `Analyze Dutch municipal website links for: "${query}"

Links:
${linksText}

Rate relevance 0.0-1.0. Return JSON array:
[{"index": 1, "score": 0.9, "reasoning": "brief"}]`;

    const response = await openaiClient.chat.completions.create({
      model: process.env.AI_NAVIGATION_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Analyze website navigation. Return JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2, // Reduced from 0.3 for more consistent results
      max_tokens: 1500 // Reduced from 2000 to save tokens
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM');
    }

    // Parse JSON response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }

    const scores = JSON.parse(jsonMatch[0]) as Array<{
      index: number;
      score: number;
      reasoning: string;
    }>;

    // Map scores back to links
    const prioritized: NavigationLink[] = [];
    for (const score of scores) {
      const linkIndex = score.index - 1;
      if (linkIndex >= 0 && linkIndex < links.length) {
        prioritized.push({
          url: links[linkIndex].url,
          text: links[linkIndex].text,
          relevanceScore: Math.max(0, Math.min(1, score.score)),
          reasoning: score.reasoning
        });
      }
    }

    return prioritized.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      cacheHitRate: this.performanceMetrics.cacheHits / 
        (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses) || 0
    };
  }

  /**
   * Check if sitemap exists
   */
  private async checkSitemap(baseUrl: string): Promise<boolean> {
    const sitemapUrls = [
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/sitemap_index.xml`,
      `${baseUrl}/robots.txt` // Sometimes contains sitemap reference
    ];

    for (const url of sitemapUrls) {
      try {
        const response = await axios.head(url, { timeout: 2000 });
        if (response.status === 200) {
          return true;
        }
      } catch {
        // Continue checking
      }
    }

    return false;
  }

  /**
   * Extract main sections from homepage
   */
  private extractMainSections($: cheerio.CheerioAPI): string[] {
    const sections: string[] = [];

    // Look for navigation menus
    $('nav a, .menu a, .navigation a, header a').each((_index, element) => {
      const text = $(element).text().trim();
      if (text && text.length < 50) {
        sections.push(text);
      }
    });

    // Deduplicate and limit
    return Array.from(new Set(sections)).slice(0, 10);
  }

  /**
   * Check if LLM is available
   */
  private isLLMAvailable(): boolean {
    return process.env.AI_NAVIGATION_PROVIDER === 'openai' &&
           !!process.env.OPENAI_API_KEY;
  }

  /**
   * Fetch a page
   */
  private async fetchPage(url: string): Promise<string> {
    const config: AxiosRequestConfig = {
      timeout: 10000,
      headers: {
        'User-Agent': scraperConfig.userAgent
      }
    };

    const response = await axios.get(url, config);
    return response.data;
  }
}
