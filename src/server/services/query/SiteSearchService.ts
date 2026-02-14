/**
 * Site Search Service
 * 
 * Detects and uses site search functionality to find relevant content.
 * This service helps AI-guided crawlers navigate sites with search features.
 */

import axios, { AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';
import { scraperConfig } from '../../config/scraperConfig.js';

export interface SiteSearchResult {
  url: string;
  title: string;
  summary?: string;
  relevanceScore?: number;
}

export interface SiteSearchConfig {
  searchPath?: string;
  searchParamName?: string;
  resultItemSelector?: string;
  resultLinkSelector?: string;
  resultTitleSelector?: string;
  resultSummarySelector?: string;
  timeout?: number;
}

/**
 * Service for detecting and using site search functionality
 */
export class SiteSearchService {
  private defaultConfig: Required<SiteSearchConfig> = {
    searchPath: '/zoeken',
    searchParamName: 'q',
    resultItemSelector: '.search-result, .result-item, li.result, article.result',
    resultLinkSelector: 'a, h2 a, h3 a, .title a',
    resultTitleSelector: 'h2, h3, .title',
    resultSummarySelector: '.summary, .description, .intro, p',
    timeout: 5000
  };

  /**
   * Detect if a site has a search feature (optimized to reduce false positives)
   * 
   * @param baseUrl - The base URL of the site
   * @returns Configuration for the search feature, or null if not found
   */
  async detectSearchFeature(baseUrl: string): Promise<SiteSearchConfig | null> {
    try {
      const html = await this.fetchPage(baseUrl);
      const $ = cheerio.load(html);

      // More specific selectors to reduce false positives
      // Look for actual search forms, not just any input
      const searchForms = $('form').filter((_index, form) => {
        const $form = $(form);
        const action = $form.attr('action') || '';
        const hasSearchInput = $form.find('input[type="search"], input[name*="q"], input[name*="zoek"], input[name*="search"]').length > 0;
        const actionSuggestsSearch = /zoek|search|zoeken/i.test(action);
        
        return hasSearchInput || actionSuggestsSearch;
      });
      
      if (searchForms.length === 0) {
        return null;
      }

      // Try to extract search configuration from the most likely form
      let bestForm = searchForms.first();
      let bestScore = 0;

      searchForms.each((_index, form) => {
        const $form = $(form);
        const action = $form.attr('action') || '';
        const hasSearchInput = $form.find('input[type="search"], input[name*="q"], input[name*="zoek"]').length > 0;
        
        let score = 0;
        if (hasSearchInput) score += 2;
        if (/zoek|search/i.test(action)) score += 2;
        if (/zoeken|zoek/i.test(action)) score += 1; // Dutch search terms
        
        if (score > bestScore) {
          bestScore = score;
          bestForm = $form;
        }
      });

      // If best score is too low, likely a false positive
      if (bestScore < 2) {
        return null;
      }

      const action = bestForm.attr('action') || '';
      const _method = bestForm.attr('method')?.toLowerCase() || 'get';

      // Extract search path
      let searchPath = '/zoeken';
      if (action) {
        try {
          const url = new URL(action, baseUrl);
          searchPath = url.pathname;
        } catch {
          searchPath = action.startsWith('/') ? action : `/${action}`;
        }
      }

      // Extract parameter name (prefer search-specific inputs)
      const searchInput = bestForm.find('input[type="search"], input[name*="q"], input[name*="zoek"]').first();
      const paramName = searchInput.attr('name') || 'q';

      // Validate the configuration by checking if it looks like a real search
      if (!paramName || paramName.length > 20) {
        return null; // Suspicious parameter name
      }

      return {
        searchPath,
        searchParamName: paramName,
        timeout: this.defaultConfig.timeout
      };
    } catch (error) {
      console.warn(`Failed to detect search feature for ${baseUrl}:`, error);
      return null;
    }
  }

  /**
   * Perform a site search
   * 
   * @param baseUrl - The base URL of the site
   * @param query - The search query
   * @param config - Optional search configuration (if not provided, will try to detect)
   * @returns Array of search results
   */
  async search(
    baseUrl: string,
    query: string,
    config?: SiteSearchConfig
  ): Promise<SiteSearchResult[]> {
    let searchConfig = config;

    // Auto-detect if config not provided
    if (!searchConfig) {
      const detectedConfig = await this.detectSearchFeature(baseUrl);
      if (!detectedConfig) {
        console.warn(`No search feature detected for ${baseUrl}`);
        return [];
      }
      searchConfig = detectedConfig;
    }

    // Merge with defaults
    const finalConfig = { ...this.defaultConfig, ...searchConfig };

    try {
      // Build search URL
      const searchUrl = new URL(finalConfig.searchPath, baseUrl);
      searchUrl.searchParams.set(finalConfig.searchParamName, query);

      // Fetch search results
      const html = await this.fetchPage(searchUrl.toString(), finalConfig.timeout);
      const $ = cheerio.load(html);

      // Extract results
      const results: SiteSearchResult[] = [];
      
      $(finalConfig.resultItemSelector).each((_index, element) => {
        const $item = $(element);
        
        // Extract link
        const linkElement = $item.find(finalConfig.resultLinkSelector).first();
        const href = linkElement.attr('href');
        if (!href) return;

        const absoluteUrl = new URL(href, baseUrl).toString();

        // Extract title
        const titleElement = $item.find(finalConfig.resultTitleSelector).first();
        const title = titleElement.text().trim() || linkElement.text().trim();

        // Extract summary
        const summaryElement = $item.find(finalConfig.resultSummarySelector).first();
        const summary = summaryElement.text().trim();

        results.push({
          url: absoluteUrl,
          title,
          summary: summary || undefined
        });
      });

      return results;
    } catch (error) {
      console.error(`Failed to perform site search on ${baseUrl}:`, error);
      return [];
    }
  }

  /**
   * Check if site search is usable (with timeout to avoid long waits)
   * 
   * @param baseUrl - The base URL of the site
   * @returns True if search feature is available and usable
   */
  async isUsable(baseUrl: string): Promise<boolean> {
    const config = await this.detectSearchFeature(baseUrl);
    if (!config) return false;

    // Try a test search with shorter timeout
    try {
      const testConfig = { ...config, timeout: 3000 }; // 3 second timeout for test
      const results = await this.search(baseUrl, 'test', testConfig);
      // Require at least 1 result to consider it usable
      return results.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Fetch a page with timeout
   */
  private async fetchPage(url: string, timeout: number = 5000): Promise<string> {
    const config: AxiosRequestConfig = {
      timeout,
      headers: {
        'User-Agent': scraperConfig.userAgent
      }
    };

    const response = await axios.get(url, config);
    return response.data;
  }
}
