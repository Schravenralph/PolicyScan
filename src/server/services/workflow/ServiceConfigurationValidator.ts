/**
 * Service Configuration Validator
 * 
 * Validates external service configuration for workflows before execution.
 * Provides clear error messages when services are unavailable.
 * 
 * @see docs/71-sprint-in-progress/WI-IMPL-005.md
 */

import { GoogleSearchService } from '../external/googleSearch.js';
import { getDeploymentConfig } from '../../config/deployment.js';
import { logger } from '../../utils/logger.js';

/**
 * Service configuration status
 */
export interface ServiceConfigStatus {
  /** Service name */
  name: string;
  /** Whether the service is configured */
  configured: boolean;
  /** Error message if not configured */
  error?: string;
  /** Configuration guidance */
  guidance?: string;
}

/**
 * Service configuration validation result
 */
export interface ServiceValidationResult {
  /** Whether all required services are configured */
  valid: boolean;
  /** Missing services */
  missingServices: ServiceConfigStatus[];
  /** Error message */
  error?: string;
}

/**
 * Required services for each workflow
 */
type WorkflowServiceRequirements = {
  [workflowId: string]: {
    dso?: boolean;
    googleCustomSearch?: boolean;
    commonCrawl?: boolean;
  };
};

/**
 * Service Configuration Validator
 * 
 * Validates that all required external services are configured
 * before workflow execution starts.
 */
export class ServiceConfigurationValidator {
  private googleSearchService: GoogleSearchService;
  
  /**
   * Map of workflow IDs to their required services
   */
  private readonly workflowServiceRequirements: WorkflowServiceRequirements = {
    // Step 1: DSO Discovery
    'beleidsscan-step-1-search-dso': {
      dso: true,
    },
    // Step 2: DSO Enrichment (depends on Step 1, but DSO API still required)
    'beleidsscan-step-2-enrich-dso': {
      dso: true,
    },
    // Step 6: Official Publications (uses SRU - public API, no configuration needed)
    'beleidsscan-step-6-officiele-bekendmakingen': {
      // No service requirements - SRU is a public API
    },
    // Step 7: Jurisprudence (uses Open Data API as primary, Google Search as fallback)
    // Open Data API is public and doesn't require configuration
    // Google Search is optional fallback, so we don't require it
    'beleidsscan-step-7-rechtspraak': {
      // No strict requirements - Open Data API is always available
      // googleCustomSearch is optional for fallback
    },
    // Step 8: Common Crawl (optional, but validates if enabled)
    'beleidsscan-step-8-common-crawl': {
      commonCrawl: false, // Optional service
    },
    // Full workflow includes all services
    // Note: Step 6 uses SRU (public API), Step 7 uses Open Data API (public) with optional Google Search fallback
    'beleidsscan-wizard': {
      dso: true,
      // googleCustomSearch is optional - Step 7 uses Open Data API as primary
      commonCrawl: false, // Optional
    },
    // Standard scan workflow uses Google Search
    'standard-scan': {
      googleCustomSearch: true,
    },
    // DSO Location-Based Document Search Workflow
    'dso-location-search': {
      dso: true,
    },
  };

  constructor() {
    this.googleSearchService = new GoogleSearchService();
  }

  /**
   * Validate service configuration for a workflow
   * 
   * @param workflowId Workflow ID to validate
   * @param options Optional validation options
   * @returns Validation result with missing services and error messages
   */
  validateWorkflowServices(
    workflowId: string,
    options?: { skipValidation?: boolean }
  ): ServiceValidationResult {
    // Allow skipping validation for testing (via environment variable or option)
    // If skipValidation is explicitly set (true or false), respect it; otherwise check env vars
    const skipValidation = options?.skipValidation !== undefined
      ? options.skipValidation
      : (process.env.SKIP_SERVICE_VALIDATION === 'true' ||
         process.env.NODE_ENV === 'test');
    
    if (skipValidation) {
      logger.debug({ workflowId }, 'Skipping service validation (testing mode)');
      return {
        valid: true,
        missingServices: [],
      };
    }
    const requirements = this.workflowServiceRequirements[workflowId];
    
    // If workflow has no service requirements, it's valid
    if (!requirements) {
      return {
        valid: true,
        missingServices: [],
      };
    }

    const missingServices: ServiceConfigStatus[] = [];

    // Check DSO API configuration
    if (requirements.dso === true) {
      const dsoStatus = this.validateDSOConfiguration();
      if (!dsoStatus.configured) {
        missingServices.push(dsoStatus);
      }
    }

    // Check Google Custom Search API configuration
    if (requirements.googleCustomSearch === true) {
      const googleStatus = this.validateGoogleCustomSearchConfiguration();
      if (!googleStatus.configured) {
        missingServices.push(googleStatus);
      }
    }

    // Check Common Crawl configuration (optional, but validate if workflow uses it)
    if (requirements.commonCrawl !== undefined) {
      const commonCrawlStatus = this.validateCommonCrawlConfiguration();
      // Only add to missing if it's required (not optional)
      if (requirements.commonCrawl === true && !commonCrawlStatus.configured) {
        missingServices.push(commonCrawlStatus);
      }
    }

    const valid = missingServices.length === 0;
    const error = valid
      ? undefined
      : this.formatError(missingServices, workflowId);

    return {
      valid,
      missingServices,
      error,
    };
  }

  /**
   * Validate DSO API configuration
   * Uses standardized deployment config with fallback to legacy env vars
   */
  private validateDSOConfiguration(): ServiceConfigStatus {
    try {
      // Try to use standardized deployment config
      const deploymentConfig = getDeploymentConfig();
      const dsoConfig = deploymentConfig.dso;
      
      if (!dsoConfig.apiKey) {
        return {
          name: 'DSO API',
          configured: false,
          error: 'DSO API key not configured',
          guidance: 'Set DSO_API_KEY (or legacy DSO_PREPROD_KEY/DSO_PROD_KEY) environment variable. ' +
            'See docs for DSO API configuration: https://service.omgevingswet.overheid.nl/publiek/omgevingsinformatie/api/ontsluiten/v2',
        };
      }
      
      return {
        name: 'DSO API',
        configured: true,
      };
    } catch (error) {
      // Fallback to legacy env vars if config loading fails
      const prodKey = process.env.DSO_PROD_KEY;
      const preprodKey = process.env.DSO_PREPROD_KEY;
      const configured = !!(prodKey || preprodKey);

      if (!configured) {
        return {
          name: 'DSO API',
          configured: false,
          error: 'DSO API key not configured',
          guidance: 'Set DSO_API_KEY (or legacy DSO_PREPROD_KEY/DSO_PROD_KEY) environment variable. ' +
            'See docs for DSO API configuration: https://service.omgevingswet.overheid.nl/publiek/omgevingsinformatie/api/ontsluiten/v2',
        };
      }

      return {
        name: 'DSO API',
        configured: true,
      };
    }
  }

  /**
   * Validate Google Custom Search API configuration
   */
  private validateGoogleCustomSearchConfiguration(): ServiceConfigStatus {
    const configured = this.googleSearchService.isConfigured();

    if (!configured) {
      return {
        name: 'Google Custom Search API',
        configured: false,
        error: 'Google Custom Search API not configured',
        guidance: 'Set GOOGLE_CUSTOM_SEARCH_JSON_API_KEY and GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID environment variables. ' +
          'See Google Custom Search API documentation: https://developers.google.com/custom-search/v1/overview',
      };
    }

    return {
      name: 'Google Custom Search API',
      configured: true,
    };
  }

  /**
   * Validate Common Crawl configuration
   * 
   * Note: Common Crawl is typically accessed via public API endpoints,
   * so configuration validation is minimal. This checks if the service
   * is accessible (basic check).
   */
  private validateCommonCrawlConfiguration(): ServiceConfigStatus {
    // Common Crawl uses public endpoints, so configuration is typically always available
    // However, we can check if there are any specific configuration requirements
    // For now, we consider it always configured (it's a public service)
    return {
      name: 'Common Crawl',
      configured: true,
      guidance: 'Common Crawl is a public service and does not require API keys. ' +
        'If you encounter issues, check network connectivity and Common Crawl service status.',
    };
  }

  /**
   * Format error message for missing services
   */
  private formatError(missingServices: ServiceConfigStatus[], workflowId: string): string {
    const serviceNames = missingServices.map(s => s.name).join(', ');
    const details = missingServices
      .map(s => {
        let msg = `  - ${s.name}: ${s.error || 'Not configured'}`;
        if (s.guidance) {
          msg += `\n    ${s.guidance}`;
        }
        return msg;
      })
      .join('\n');

    return (
      `Workflow "${workflowId}" requires the following external services that are not configured:\n` +
      `${serviceNames}\n\n` +
      `Configuration Details:\n${details}\n\n` +
      `Please configure the required services before running this workflow. ` +
      `See .env.example for configuration examples.`
    );
  }

  /**
   * Get required services for a workflow
   * 
   * @param workflowId Workflow ID
   * @returns Array of required service names
   */
  getRequiredServices(workflowId: string): string[] {
    const requirements = this.workflowServiceRequirements[workflowId];
    if (!requirements) {
      return [];
    }

    const services: string[] = [];
    if (requirements.dso === true) {
      services.push('DSO API');
    }
    if (requirements.googleCustomSearch === true) {
      services.push('Google Custom Search API');
    }
    if (requirements.commonCrawl === true) {
      services.push('Common Crawl');
    }

    return services;
  }

  /**
   * Check if a specific service is configured
   * 
   * @param serviceName Service name ('dso', 'googleCustomSearch', 'commonCrawl')
   * @returns Whether the service is configured
   */
  isServiceConfigured(serviceName: string): boolean {
    switch (serviceName.toLowerCase()) {
      case 'dso':
        return this.validateDSOConfiguration().configured;
      case 'googlecustomsearch':
      case 'google':
        return this.validateGoogleCustomSearchConfiguration().configured;
      case 'commoncrawl':
      case 'common_crawl':
        return this.validateCommonCrawlConfiguration().configured;
      default:
        logger.warn({ serviceName }, 'Unknown service name for configuration check');
        return false;
    }
  }
}

