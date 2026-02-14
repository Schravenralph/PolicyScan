/**
 * Rechtspraak API Health Service
 * 
 * Provides health check functionality for Rechtspraak Open Data API.
 */

import axios from 'axios';

export interface RechtspraakApiHealthStatus {
  healthy: boolean;
  timestamp: string;
  checks: {
    connectivity: {
      healthy: boolean;
      message?: string;
      latency?: number;
    };
    indexEndpoint: {
      healthy: boolean;
      message?: string;
      latency?: number;
    };
  };
  configuration: {
    baseUrl: string;
  };
}

export class RechtspraakApiHealthService {
  private readonly BASE_URL = 'https://data.rechtspraak.nl';
  private readonly ECLI_INDEX_ENDPOINT = '/uitspraken/zoeken';
  private readonly TIMEOUT_MS = 10000;

  /**
   * Perform comprehensive Rechtspraak API health check
   */
  static async checkHealth(): Promise<RechtspraakApiHealthStatus> {
    const timestamp = new Date().toISOString();
    const service = new RechtspraakApiHealthService();
    
    const checks = {
      connectivity: await service.checkConnectivity(),
      indexEndpoint: await service.checkIndexEndpoint(),
    };

    const healthy = Object.values(checks).every(check => check.healthy);

    return {
      healthy,
      timestamp,
      checks,
      configuration: {
        baseUrl: service.BASE_URL,
      },
    };
  }

  /**
   * Check basic connectivity to Rechtspraak API
   */
  private async checkConnectivity(): Promise<RechtspraakApiHealthStatus['checks']['connectivity']> {
    const startTime = Date.now();

    try {
      // Try to connect to base URL
      const response = await axios.head(this.BASE_URL, {
        timeout: this.TIMEOUT_MS,
        headers: {
          'User-Agent': 'Beleidsscan/1.0',
        },
        validateStatus: (status) => status < 500, // Don't throw on 4xx, only 5xx
      });

      const latency = Date.now() - startTime;
      const statusCode = response.status;

      // Consider 2xx, 3xx, and 4xx as available (4xx means API exists but request was invalid)
      const healthy = statusCode >= 200 && statusCode < 500;

      return {
        healthy,
        message: healthy ? 'API is reachable' : `API returned status ${statusCode}`,
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check for specific error types
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          return {
            healthy: false,
            message: 'API is not reachable (connection refused or DNS failure)',
            latency,
          };
        }
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          return {
            healthy: false,
            message: 'API request timed out',
            latency,
          };
        }
        if (error.response) {
          // Got a response, so API is reachable but returned an error
          return {
            healthy: false,
            message: `API returned error: ${error.response.status} ${error.response.statusText}`,
            latency,
          };
        }
      }

      return {
        healthy: false,
        message: `Connectivity check failed: ${errorMsg}`,
        latency,
      };
    }
  }

  /**
   * Check ECLI index endpoint
   */
  private async checkIndexEndpoint(): Promise<RechtspraakApiHealthStatus['checks']['indexEndpoint']> {
    const startTime = Date.now();

    try {
      // Try a simple query to the index endpoint
      const url = `${this.BASE_URL}${this.ECLI_INDEX_ENDPOINT}`;
      const response = await axios.get(url, {
        timeout: this.TIMEOUT_MS,
        headers: {
          'Accept': 'application/xml, text/xml, */*',
          'User-Agent': 'Beleidsscan/1.0',
        },
        params: {
          q: 'test', // Simple test query
          max: 1, // Request only 1 result
        },
        validateStatus: (status) => status < 500, // Don't throw on 4xx, only 5xx
      });

      const latency = Date.now() - startTime;
      const statusCode = response.status;

      // Check if response is XML (expected format)
      const contentType = response.headers['content-type'] || '';
      const isXml = contentType.includes('xml') || contentType.includes('text/xml');

      if (statusCode >= 200 && statusCode < 300 && isXml) {
        return {
          healthy: true,
          message: 'Index endpoint is working correctly',
          latency,
        };
      }

      // Check for rate limiting
      if (statusCode === 429) {
        const retryAfter = response.headers['retry-after'];
        return {
          healthy: false,
          message: `Rate limited${retryAfter ? ` (retry after ${retryAfter}s)` : ''}`,
          latency,
        };
      }

      return {
        healthy: false,
        message: `Index endpoint returned status ${statusCode}${!isXml ? ' (unexpected content type)' : ''}`,
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          return {
            healthy: false,
            message: `Rate limited${retryAfter ? ` (retry after ${retryAfter}s)` : ''}`,
            latency,
          };
        }
        if (error.response) {
          return {
            healthy: false,
            message: `Index endpoint error: ${error.response.status} ${error.response.statusText}`,
            latency,
          };
        }
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          return {
            healthy: false,
            message: 'Index endpoint request timed out',
            latency,
          };
        }
      }

      return {
        healthy: false,
        message: `Index endpoint check failed: ${errorMsg}`,
        latency,
      };
    }
  }
}


