/**
 * Google API Health Service
 * 
 * Provides health check functionality for Google Custom Search API.
 */

import { GoogleSearchService } from './googleSearch.js';
import { logger } from '../../utils/logger.js';
import { validateEnv } from '../../config/env.js';

export interface GoogleApiHealthStatus {
  healthy: boolean;
  timestamp: string;
  checks: {
    configuration: {
      healthy: boolean;
      message?: string;
      apiKeyConfigured: boolean;
      searchEngineIdConfigured: boolean;
    };
    connectivity: {
      healthy: boolean;
      message?: string;
      latency?: number;
    };
    rateLimit: {
      healthy: boolean;
      message?: string;
      remainingQuota?: number;
    };
  };
  configuration: {
    apiKeyConfigured: boolean;
    searchEngineIdConfigured: boolean;
  };
}

export class GoogleApiHealthService {
  /**
   * Perform comprehensive Google API health check
   */
  static async checkHealth(): Promise<GoogleApiHealthStatus> {
    const timestamp = new Date().toISOString();
    
    const checks = {
      configuration: await this.checkConfiguration(),
      connectivity: await this.checkConnectivity(),
      rateLimit: await this.checkRateLimit(),
    };

    const healthy = Object.values(checks).every(check => check.healthy);

    const env = validateEnv();
    const configuration = {
      apiKeyConfigured: !!env.GOOGLE_CUSTOM_SEARCH_JSON_API_KEY,
      searchEngineIdConfigured: !!env.GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID,
    };

    return {
      healthy,
      timestamp,
      checks,
      configuration,
    };
  }

  /**
   * Check Google API configuration
   */
  private static async checkConfiguration(): Promise<GoogleApiHealthStatus['checks']['configuration']> {
    try {
      const env = validateEnv();
      const apiKeyConfigured = !!env.GOOGLE_CUSTOM_SEARCH_JSON_API_KEY;
      const searchEngineIdConfigured = !!env.GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID;

      if (!apiKeyConfigured || !searchEngineIdConfigured) {
        const missing: string[] = [];
        if (!apiKeyConfigured) missing.push('GOOGLE_CUSTOM_SEARCH_JSON_API_KEY');
        if (!searchEngineIdConfigured) missing.push('GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID');

        return {
          healthy: false,
          message: `Missing configuration: ${missing.join(', ')}`,
          apiKeyConfigured,
          searchEngineIdConfigured,
        };
      }

      // Try to create service instance (validates configuration)
      const service = new GoogleSearchService();
      service.validateConfiguration();

      return {
        healthy: true,
        apiKeyConfigured,
        searchEngineIdConfigured,
      };
    } catch (error) {
      logger.error({ error }, 'Google API configuration check failed');
      return {
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
        apiKeyConfigured: false,
        searchEngineIdConfigured: false,
      };
    }
  }

  /**
   * Check Google API connectivity
   */
  private static async checkConnectivity(): Promise<GoogleApiHealthStatus['checks']['connectivity']> {
    const startTime = Date.now();
    
    try {
      const env = validateEnv();
      if (!env.GOOGLE_CUSTOM_SEARCH_JSON_API_KEY || !env.GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID) {
        return {
          healthy: false,
          message: 'Google API not configured',
        };
      }

      const service = new GoogleSearchService();
      
      // Perform a simple health check query (minimal query to test connectivity)
      // Use a very simple query that should return quickly
      const testQuery = 'test';
      
      try {
        // Set a short timeout for health check
        const healthCheckPromise = service.search(testQuery, { numResults: 1 });
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Health check timeout')), 5000);
        });
        
        await Promise.race([healthCheckPromise, timeoutPromise]);
        
        const latency = Date.now() - startTime;
        
        return {
          healthy: true,
          latency,
        };
      } catch (error) {
        const latency = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Check for rate limit errors (429)
        if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
          return {
            healthy: false,
            message: 'Rate limit exceeded',
            latency,
          };
        }
        
        // Check for authentication errors (401, 403)
        if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('authentication')) {
          return {
            healthy: false,
            message: 'Authentication failed',
            latency,
          };
        }
        
        return {
          healthy: false,
          message: `Connectivity check failed: ${errorMessage}`,
          latency,
        };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error({ error, latency }, 'Google API connectivity check failed');
      return {
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
        latency,
      };
    }
  }

  /**
   * Check Google API rate limit status
   */
  private static async checkRateLimit(): Promise<GoogleApiHealthStatus['checks']['rateLimit']> {
    try {
      const env = validateEnv();
      if (!env.GOOGLE_CUSTOM_SEARCH_JSON_API_KEY || !env.GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID) {
        return {
          healthy: false,
          message: 'Google API not configured',
        };
      }

      // Note: Google Custom Search API doesn't provide quota information via API
      // We can only detect rate limits when they occur (429 responses)
      // This check verifies that we can make a request without hitting rate limits
      
      const service = new GoogleSearchService();
      
      try {
        // Try a minimal query to check if we're rate limited
        const testQuery = 'test';
        await service.search(testQuery, { numResults: 1 });
        
        return {
          healthy: true,
          message: 'No rate limit detected',
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
          return {
            healthy: false,
            message: 'Rate limit exceeded',
          };
        }
        
        // Other errors don't indicate rate limit issues
        return {
          healthy: true,
          message: 'Rate limit check passed (other error occurred)',
        };
      }
    } catch (error) {
      logger.error({ error }, 'Google API rate limit check failed');
      return {
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}


