/**
 * Website Availability Service
 * 
 * Checks website availability before scraping.
 */

import axios from 'axios';
import { logger } from '../../utils/logger.js';
import { scraperConfig } from '../../config/scraperConfig.js';

export interface WebsiteAvailabilityResult {
  available: boolean;
  statusCode?: number;
  latency?: number;
  error?: string;
  redirected?: boolean;
  finalUrl?: string;
}

/**
 * Service for checking website availability
 */
export class WebsiteAvailabilityService {
  /**
   * Check if a website is available before scraping
   */
  async checkAvailability(
    websiteUrl: string,
    timeout: number = 5000
  ): Promise<WebsiteAvailabilityResult> {
    const startTime = Date.now();

    try {
      const response = await axios.head(websiteUrl, {
        timeout,
        headers: {
          'User-Agent': scraperConfig.userAgent,
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 500, // Don't throw on 4xx, only 5xx
      });

      const latency = Date.now() - startTime;
      const statusCode = response.status;

      // Check if redirected
      const redirected = response.request?.res?.responseUrl !== websiteUrl;
      const finalUrl = redirected ? response.request?.res?.responseUrl : websiteUrl;

      // Consider 2xx and 3xx as available, 4xx as unavailable (client error)
      const available = statusCode >= 200 && statusCode < 400;

      return {
        available,
        statusCode,
        latency,
        redirected,
        finalUrl,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        const errorMessage = error.message;

        // Network errors (timeout, connection refused, etc.)
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          return {
            available: false,
            error: `Timeout: ${errorMessage}`,
            latency,
          };
        }

        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          return {
            available: false,
            error: `Connection failed: ${errorMessage}`,
            latency,
          };
        }

        // HTTP errors
        if (statusCode) {
          return {
            available: false,
            statusCode,
            error: `HTTP ${statusCode}: ${errorMessage}`,
            latency,
          };
        }

        return {
          available: false,
          error: errorMessage,
          latency,
        };
      }

      return {
        available: false,
        error: error instanceof Error ? error.message : String(error),
        latency,
      };
    }
  }

  /**
   * Check multiple websites for availability
   */
  async checkMultiple(
    websiteUrls: string[],
    timeout: number = 5000
  ): Promise<Map<string, WebsiteAvailabilityResult>> {
    const results = new Map<string, WebsiteAvailabilityResult>();

    // Check websites in parallel (with concurrency limit)
    const checks = websiteUrls.map(async (url) => {
      const result = await this.checkAvailability(url, timeout);
      results.set(url, result);
    });

    await Promise.allSettled(checks);

    return results;
  }
}


