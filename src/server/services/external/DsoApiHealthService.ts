/**
 * DSO API Health Service
 * 
 * Provides health check functionality for DSO API services.
 */

import { DSOOntsluitenService } from './DSOOntsluitenService.js';
import { DSOEnrichmentService } from './DSOEnrichmentService.js';
import { logger } from '../../utils/logger.js';
import { getDeploymentConfig } from '../../config/deployment.js';

export interface DsoApiHealthStatus {
  healthy: boolean;
  timestamp: string;
  checks: {
    ontsluiten: {
      healthy: boolean;
      message?: string;
      latency?: number;
      apiKeyConfigured: boolean;
    };
    enrichment: {
      healthy: boolean;
      message?: string;
      latency?: number;
      apiKeyConfigured: boolean;
    };
  };
  configuration: {
    environment: 'prod' | 'preprod';
    ontsluitenBaseUrl?: string;
    downloadenBaseUrl?: string;
  };
}

export class DsoApiHealthService {
  /**
   * Perform comprehensive DSO API health check
   */
  static async checkHealth(): Promise<DsoApiHealthStatus> {
    const timestamp = new Date().toISOString();
    
    try {
      // Get configuration
      const deploymentConfig = getDeploymentConfig();
      const dsoConfig = deploymentConfig.dso;

      const checks = {
        ontsluiten: await this.checkOntsluitenService(),
        enrichment: await this.checkEnrichmentService(),
      };

      const healthy = Object.values(checks).every(check => check.healthy);

      return {
        healthy,
        timestamp,
        checks,
        configuration: {
          environment: dsoConfig.env === 'prod' ? 'prod' : 'preprod',
          ontsluitenBaseUrl: dsoConfig.ontsluitenBaseUrl,
          downloadenBaseUrl: dsoConfig.downloadenBaseUrl,
        },
      };
    } catch (error) {
      // Handle configuration errors (e.g. missing API keys)
      return {
        healthy: false,
        timestamp,
        checks: {
          ontsluiten: {
            healthy: false,
            message: error instanceof Error ? error.message : String(error),
            apiKeyConfigured: false
          },
          enrichment: {
            healthy: false,
            message: 'Configuration failed',
            apiKeyConfigured: false
          },
        },
        configuration: {
          environment: 'preprod',
        },
      };
    }
  }

  /**
   * Check DSO Ontsluiten service health
   */
  private static async checkOntsluitenService(): Promise<DsoApiHealthStatus['checks']['ontsluiten']> {
    const startTime = Date.now();
    
    try {
      // Check if API key is configured
      const deploymentConfig = getDeploymentConfig();
      const apiKeyConfigured = !!deploymentConfig.dso.apiKey;
      
      if (!apiKeyConfigured) {
        return {
          healthy: false,
          message: 'DSO API key not configured',
          apiKeyConfigured: false,
        };
      }

      // Try to create service instance (validates configuration)
      const service = new DSOOntsluitenService();
      
      // Perform a simple health check query (minimal query to test connectivity)
      // Use a very simple query that should return quickly
      const testQuery = { query: 'test' };
      
      try {
        // Set a short timeout for health check
        const healthCheckPromise = service.suggestDocuments(testQuery);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Health check timeout')), 5000);
        });
        
        await Promise.race([healthCheckPromise, timeoutPromise]);
        
        const latency = Date.now() - startTime;
        
        return {
          healthy: true,
          latency,
          apiKeyConfigured: true,
        };
      } catch (queryError) {
        const latency = Date.now() - startTime;
        const errorMessage = queryError instanceof Error ? queryError.message : String(queryError);
        
        // Check if it's a rate limit (429) - this is still "healthy" but with warning
        if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
          return {
            healthy: true, // API is available, just rate limited
            message: 'API is rate limited',
            latency,
            apiKeyConfigured: true,
          };
        }
        
        // Check if it's an authentication error (401/403)
        if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('authentication')) {
          return {
            healthy: false,
            message: `Authentication failed: ${errorMessage}`,
            latency,
            apiKeyConfigured: true,
          };
        }
        
        // Other errors indicate API issues
        return {
          healthy: false,
          message: `API request failed: ${errorMessage}`,
          latency,
          apiKeyConfigured: true,
        };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({ error, latency }, 'DSO Ontsluiten service health check failed');
      
      return {
        healthy: false,
        message: errorMessage,
        latency,
        apiKeyConfigured: false,
      };
    }
  }

  /**
   * Check DSO Enrichment service health
   */
  private static async checkEnrichmentService(): Promise<DsoApiHealthStatus['checks']['enrichment']> {
    const startTime = Date.now();
    
    try {
      // Check if API key is configured
      const deploymentConfig = getDeploymentConfig();
      const apiKeyConfigured = !!deploymentConfig.dso.apiKey;
      
      if (!apiKeyConfigured) {
        return {
          healthy: false,
          message: 'DSO API key not configured',
          apiKeyConfigured: false,
        };
      }

      // Check if service is configured (static check)
      const isConfigured = DSOEnrichmentService.isConfigured();
      
      if (!isConfigured) {
        return {
          healthy: false,
          message: 'DSO Enrichment service not configured',
          apiKeyConfigured: false,
        };
      }

      // For enrichment service, we can't easily test without a valid regeling ID
      // So we just check if the service can be instantiated
      try {
        new DSOEnrichmentService();
        // Service instantiation successful means configuration is valid
        const latency = Date.now() - startTime;
        
        return {
          healthy: true,
          latency,
          apiKeyConfigured: true,
        };
      } catch (serviceError) {
        const latency = Date.now() - startTime;
        const errorMessage = serviceError instanceof Error ? serviceError.message : String(serviceError);
        
        return {
          healthy: false,
          message: `Service initialization failed: ${errorMessage}`,
          latency,
          apiKeyConfigured: apiKeyConfigured,
        };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({ error, latency }, 'DSO Enrichment service health check failed');
      
      return {
        healthy: false,
        message: errorMessage,
        latency,
        apiKeyConfigured: false,
      };
    }
  }

  /**
   * Quick health check (returns boolean)
   */
  static async quickHealthCheck(): Promise<boolean> {
    try {
      const health = await this.checkHealth();
      return health.healthy;
    } catch {
      return false;
    }
  }

  /**
   * Check if DSO API is available for workflow execution
   */
  static async isAvailableForWorkflow(): Promise<{
    available: boolean;
    reason?: string;
  }> {
    try {
      const health = await this.checkHealth();
      
      if (!health.healthy) {
        // Check which service is unhealthy
        const unhealthyServices: string[] = [];
        if (!health.checks.ontsluiten.healthy) {
          unhealthyServices.push('Ontsluiten');
        }
        if (!health.checks.enrichment.healthy) {
          unhealthyServices.push('Enrichment');
        }
        
        return {
          available: false,
          reason: `DSO API services unhealthy: ${unhealthyServices.join(', ')}`,
        };
      }
      
      // Check if API keys are configured
      if (!health.checks.ontsluiten.apiKeyConfigured) {
        return {
          available: false,
          reason: 'DSO API key not configured',
        };
      }
      
      return {
        available: true,
      };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}


