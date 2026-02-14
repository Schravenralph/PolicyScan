/**
 * IPLO Scraper Health Service
 * 
 * Provides health checks for the IPLO scraper, including website availability,
 * structure validation, and selector compatibility.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../../utils/logger.js';
import { scraperConfig } from '../../config/scraperConfig.js';
import { WebsiteAvailabilityService } from './WebsiteAvailabilityService.js';

export interface IploScraperHealthStatus {
  healthy: boolean;
  websiteAvailable: boolean;
  structureValid: boolean;
  selectorsWorking: boolean;
  latency?: number;
  errors: string[];
  warnings: string[];
  lastChecked?: Date;
}

/**
 * Service for checking IPLO scraper health
 */
export class IploScraperHealthService {
  private baseUrl = 'https://iplo.nl';
  private availabilityService: WebsiteAvailabilityService;
  private cachedHealthStatus: IploScraperHealthStatus | null = null;
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.availabilityService = new WebsiteAvailabilityService();
  }

  /**
   * Check IPLO scraper health
   */
  async checkHealth(): Promise<IploScraperHealthStatus> {
    // Return cached status if still valid
    if (this.cachedHealthStatus && this.cachedHealthStatus.lastChecked) {
      const age = Date.now() - this.cachedHealthStatus.lastChecked.getTime();
      if (age < this.cacheExpiry) {
        return this.cachedHealthStatus;
      }
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    let websiteAvailable = false;
    let structureValid = false;
    let selectorsWorking = false;
    let latency: number | undefined;

    try {
      // Check website availability
      const availability = await this.availabilityService.checkAvailability(this.baseUrl, 10000);
      websiteAvailable = availability.available;
      latency = availability.latency;

      if (!websiteAvailable) {
        errors.push(`IPLO website is not available (status: ${availability.statusCode || 'unknown'})`);
      }

      // If website is available, check structure
      if (websiteAvailable) {
        try {
          const response = await axios.get(this.baseUrl, {
            timeout: 10000,
            headers: {
              'User-Agent': scraperConfig.userAgent,
            },
          });

          const $ = cheerio.load(response.data);

          // Check for key selectors used by the scraper
          const keySelectors = [
            'article',
            '.content',
            'main',
            '.main-content',
            'section',
            '.article-content',
            '[role="article"]',
            'a[href]',
          ];

          const foundSelectors = keySelectors.filter((selector) => {
            try {
              return $(selector).length > 0;
            } catch {
              return false;
            }
          });

          if (foundSelectors.length === 0) {
            errors.push('No key selectors found on IPLO website - structure may have changed');
            structureValid = false;
          } else if (foundSelectors.length < keySelectors.length / 2) {
            warnings.push(
              `Only ${foundSelectors.length}/${keySelectors.length} key selectors found - structure may have changed`
            );
            structureValid = true; // Partial match - still usable
          } else {
            structureValid = true;
          }

          // Test document extraction selectors
          const documentSelectors = [
            'article a',
            '.content a',
            'main a',
            '.main-content a',
            'section a',
            '.article-content a',
            '[role="article"] a',
          ];

          const foundDocumentSelectors = documentSelectors.filter((selector) => {
            try {
              return $(selector).length > 0;
            } catch {
              return false;
            }
          });

          if (foundDocumentSelectors.length === 0) {
            errors.push('No document extraction selectors found - scraper may not work');
            selectorsWorking = false;
          } else {
            selectorsWorking = true;
          }

          // Check for PDF links (common document type)
          const pdfLinks = $('a[href$=".pdf"]').length;
          if (pdfLinks === 0) {
            warnings.push('No PDF links found on homepage - may indicate structure change');
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to check IPLO structure: ${errorMsg}`);
          structureValid = false;
          selectorsWorking = false;
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Health check failed: ${errorMsg}`);
      websiteAvailable = false;
    }

    const healthy = websiteAvailable && structureValid && selectorsWorking && errors.length === 0;

    const healthStatus: IploScraperHealthStatus = {
      healthy,
      websiteAvailable,
      structureValid,
      selectorsWorking,
      latency,
      errors,
      warnings,
      lastChecked: new Date(),
    };

    // Cache the result
    this.cachedHealthStatus = healthStatus;

    return healthStatus;
  }

  /**
   * Check if IPLO scraper is healthy
   */
  async isHealthy(): Promise<boolean> {
    const health = await this.checkHealth();
    return health.healthy;
  }

  /**
   * Clear cached health status
   */
  clearCache(): void {
    this.cachedHealthStatus = null;
  }
}


