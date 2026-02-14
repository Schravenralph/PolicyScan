/**
 * OpenAI API Health Service
 * 
 * Provides health check functionality for OpenAI API.
 */

import { OpenAI } from 'openai';
import { logger } from '../../utils/logger.js';
import { validateEnv } from '../../config/env.js';

export interface OpenAIApiHealthStatus {
  healthy: boolean;
  timestamp: string;
  checks: {
    configuration: {
      healthy: boolean;
      message?: string;
      apiKeyConfigured: boolean;
    };
    connectivity: {
      healthy: boolean;
      message?: string;
      latency?: number;
    };
    rateLimit: {
      healthy: boolean;
      message?: string;
    };
  };
  configuration: {
    apiKeyConfigured: boolean;
  };
}

export class OpenAIApiHealthService {
  /**
   * Perform comprehensive OpenAI API health check
   */
  static async checkHealth(): Promise<OpenAIApiHealthStatus> {
    const timestamp = new Date().toISOString();
    
    const checks = {
      configuration: await this.checkConfiguration(),
      connectivity: await this.checkConnectivity(),
      rateLimit: await this.checkRateLimit(),
    };

    const healthy = Object.values(checks).every(check => check.healthy);

    const env = validateEnv();
    const configuration = {
      apiKeyConfigured: !!env.OPENAI_API_KEY,
    };

    return {
      healthy,
      timestamp,
      checks,
      configuration,
    };
  }

  /**
   * Check OpenAI API configuration
   */
  private static async checkConfiguration(): Promise<OpenAIApiHealthStatus['checks']['configuration']> {
    try {
      const env = validateEnv();
      const apiKeyConfigured = !!env.OPENAI_API_KEY;

      if (!apiKeyConfigured) {
        return {
          healthy: false,
          message: 'OPENAI_API_KEY not configured',
          apiKeyConfigured: false,
        };
      }

      return {
        healthy: true,
        apiKeyConfigured: true,
      };
    } catch (error) {
      logger.error({ error }, 'OpenAI API configuration check failed');
      return {
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
        apiKeyConfigured: false,
      };
    }
  }

  /**
   * Check OpenAI API connectivity
   */
  private static async checkConnectivity(): Promise<OpenAIApiHealthStatus['checks']['connectivity']> {
    const startTime = Date.now();
    
    try {
      const env = validateEnv();
      if (!env.OPENAI_API_KEY) {
        return {
          healthy: false,
          message: 'OpenAI API not configured',
        };
      }

      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      
      // Perform a simple health check query (minimal query to test connectivity)
      // Use a very simple query that should return quickly
      const testMessage = 'test';
      
      try {
        // Set a short timeout for health check
        const healthCheckPromise = openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: testMessage }],
          max_tokens: 5,
        });
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
      logger.error({ error, latency }, 'OpenAI API connectivity check failed');
      return {
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
        latency,
      };
    }
  }

  /**
   * Check OpenAI API rate limit status
   */
  private static async checkRateLimit(): Promise<OpenAIApiHealthStatus['checks']['rateLimit']> {
    try {
      const env = validateEnv();
      if (!env.OPENAI_API_KEY) {
        return {
          healthy: false,
          message: 'OpenAI API not configured',
        };
      }

      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      
      try {
        // Try a minimal query to check if we're rate limited
        const testMessage = 'test';
        await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: testMessage }],
          max_tokens: 5,
        });
        
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
      logger.error({ error }, 'OpenAI API rate limit check failed');
      return {
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}


