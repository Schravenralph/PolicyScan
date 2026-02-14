/**
 * Mock Common Crawl Index Service
 * 
 * Provides mock implementation of CommonCrawlIndexService for testing.
 * Implements the same interface as the real service but returns
 * configurable mock responses instead of making real database queries.
 */

import { MockServiceBase } from './MockServiceBase.js';
import { getMockServiceRegistry } from './MockServiceRegistry.js';
import { logger } from '../../utils/logger.js';
import type { QueryOptions } from '../common-crawl/CommonCrawlIndexService.js';

export interface CDXResult {
  domain: string;
  url: string;
}

export class MockCommonCrawlService extends MockServiceBase<CDXResult[], Error> {
  private mockCrawlIds: Set<string> = new Set(['CC-MAIN-2024-01', 'CC-MAIN-2024-02']);

  constructor() {
    super();
    // Set default mock response
    this.setDefaultResponse(this.getDefaultMockResults());
    getMockServiceRegistry().register('CommonCrawlIndexService', this);
  }

  getServiceName(): string {
    return 'MockCommonCrawlService';
  }

  /**
   * Mock isCrawlLoaded implementation
   */
  async isCrawlLoaded(crawlId: string): Promise<boolean> {
    if (!this.isEnabled()) {
      logger.debug('MockCommonCrawlService is disabled, falling back to real service.');
      return false;
    }

    logger.info(`MockCommonCrawlService.isCrawlLoaded called with crawlId: "${crawlId}"`);

    // Check for error scenario
    const errorKey = `isCrawlLoaded:${crawlId}`;
    if (this.hasError(errorKey)) {
      const error = this.getError(errorKey);
      if (error) {
        logger.warn(`MockCommonCrawlService returning error for key '${errorKey}'.`);
        throw error;
      }
    }

    // Return true if crawlId is in mock set
    return this.mockCrawlIds.has(crawlId);
  }

  /**
   * Mock query implementation
   */
  async query(options: QueryOptions): Promise<CDXResult[]> {
    if (!this.isEnabled()) {
      logger.debug('MockCommonCrawlService is disabled, falling back to real service.');
      return [];
    }

    logger.info({ options }, 'MockCommonCrawlService.query called');

    // Build key from query options
    const key = `query:${JSON.stringify(options)}`;
    
    // Check for error scenario
    if (this.hasError(key)) {
      const error = this.getError(key);
      if (error) {
        logger.warn(`MockCommonCrawlService returning error for key '${key}'.`);
        throw error;
      }
    }

    // Get mock response
    const response = this.getResponse(key);

    if (response) {
      logger.debug(`MockCommonCrawlService returning custom response for key '${key}'.`);
      // Apply query filters (simulate real behavior)
      return this.filterResults(response, options);
    }

    // Return default response if no specific response set
    logger.debug(`MockCommonCrawlService returning default response for key '${key}'.`);
    return this.filterResults(this.getDefaultMockResults(), options);
  }

  /**
   * Filter results based on query options (simulate real database query behavior)
   */
  private filterResults(
    results: CDXResult[],
    options: QueryOptions
  ): CDXResult[] {
    let filtered = [...results];

    // Filter by crawlId
    if (options.crawlId) {
      // In real implementation, this would filter by crawlId in database
      // For mock, we just return all results (crawlId filtering is handled by isCrawlLoaded)
    }

    // Filter by domainPattern
    if (options.domainPattern) {
      const pattern = new RegExp(options.domainPattern, 'i');
      filtered = filtered.filter(result => pattern.test(result.domain));
    }

    // Filter by urlPattern
    if (options.urlPattern) {
      const pattern = new RegExp(options.urlPattern, 'i');
      filtered = filtered.filter(result => pattern.test(result.url));
    }

    // Filter by pathPattern
    if (options.pathPattern) {
      const pattern = new RegExp(options.pathPattern, 'i');
      filtered = filtered.filter(result => {
        try {
          const url = new URL(result.url);
          return pattern.test(url.pathname);
        } catch {
          return false;
        }
      });
    }

    // Apply skip
    if (options.skip) {
      filtered = filtered.slice(options.skip);
    }

    // Apply limit
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * Get default mock results
   */
  private getDefaultMockResults(): CDXResult[] {
    return [
      {
        domain: 'www.amsterdam.nl',
        url: 'https://www.amsterdam.nl/klimaatadaptatie'
      },
      {
        domain: 'www.rotterdam.nl',
        url: 'https://www.rotterdam.nl/omgevingsvisie'
      },
      {
        domain: 'www.utrecht.nl',
        url: 'https://www.utrecht.nl/verordening-waterbeheer'
      },
      {
        domain: 'www.denhaag.nl',
        url: 'https://www.denhaag.nl/beleid-duurzaamheid'
      },
      {
        domain: 'www.eindhoven.nl',
        url: 'https://www.eindhoven.nl/omgevingsplan'
      }
    ];
  }

  /**
   * Add a mock crawl ID (for testing)
   */
  addMockCrawlId(crawlId: string): void {
    this.mockCrawlIds.add(crawlId);
  }

  /**
   * Remove a mock crawl ID (for testing)
   */
  removeMockCrawlId(crawlId: string): void {
    this.mockCrawlIds.delete(crawlId);
  }

  /**
   * Clear all mock crawl IDs
   */
  clearMockCrawlIds(): void {
    this.mockCrawlIds.clear();
  }
}


