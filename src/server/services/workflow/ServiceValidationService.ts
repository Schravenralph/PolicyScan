/**
 * Service Validation Service
 * 
 * Validates external service configuration at workflow start to provide clear error messages
 * when services are unavailable or misconfigured. This prevents silent failures and improves debugging.
 * 
 * @see docs/70-sprint-backlog/WI-405-external-service-validation.md
 */

import { getDeploymentConfig } from '../../config/deployment.js';
import { DSOOntsluitenService } from '../external/DSOOntsluitenService.js';
import { GoogleSearchService } from '../external/googleSearch.js';
import { CommonCrawlIndexService } from '../common-crawl/CommonCrawlIndexService.js';
import { logger } from '../../utils/logger.js';
import { ServiceConfigurationError } from '../../utils/serviceErrors.js';

/**
 * Service validation result
 */
export interface ServiceValidationResult {
  /** Service name */
  service: string;
  /** Validation status */
  status: 'available' | 'unavailable' | 'misconfigured';
  /** Reason for status */
  reason?: string;
  /** Required configuration keys */
  requiredConfig?: string[];
  /** Steps affected by this service */
  stepsAffected?: string[];
  /** Whether service is optional */
  optional?: boolean;
}

/**
 * Complete validation result for all services
 */
export interface ValidationReport {
  /** Overall validation status */
  valid: boolean;
  /** Individual service validation results */
  services: ServiceValidationResult[];
  /** Summary message */
  message: string;
}

/**
 * Service validator interface
 */
interface ServiceValidator {
  /** Validate service configuration */
  validate(): Promise<ServiceValidationResult>;
  /** Check if service is available */
  isAvailable(): Promise<boolean>;
  /** Get required configuration keys */
  getRequiredConfig(): string[];
  /** Get steps that depend on this service */
  getStepsAffected(): string[];
  /** Whether service is optional */
  isOptional(): boolean;
}

/**
 * DSO API Validator
 */
class DSOApiValidator implements ServiceValidator {
  private useProduction: boolean;

  constructor(useProduction: boolean = false) {
    this.useProduction = useProduction;
  }

  getRequiredConfig(): string[] {
    return ['DSO_API_KEY'];
  }

  getStepsAffected(): string[] {
    return ['step1', 'step2'];
  }

  isOptional(): boolean {
    return false;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const deploymentConfig = getDeploymentConfig();
      const apiKey = deploymentConfig.dso.apiKey;
      return !!apiKey;
    } catch (error) {
      return false;
    }
  }

  async validate(): Promise<ServiceValidationResult> {
    try {
      const deploymentConfig = getDeploymentConfig();
      const apiKey = deploymentConfig.dso.apiKey;

      if (!apiKey) {
        return {
          service: 'DSO API',
          status: 'misconfigured',
          reason: 'Missing API key',
          requiredConfig: this.getRequiredConfig(),
          stepsAffected: this.getStepsAffected(),
          optional: this.isOptional(),
        };
      }

      // Try to create service instance to verify configuration
      try {
        const service = new DSOOntsluitenService(this.useProduction);
        // Check if service is configured (static method)
        const isConfigured = DSOOntsluitenService.isConfigured(this.useProduction);
        
        if (!isConfigured) {
          return {
            service: 'DSO API',
            status: 'misconfigured',
            reason: 'API key present but service not properly configured',
            requiredConfig: this.getRequiredConfig(),
            stepsAffected: this.getStepsAffected(),
            optional: this.isOptional(),
          };
        }

        return {
          service: 'DSO API',
          status: 'available',
          requiredConfig: this.getRequiredConfig(),
          stepsAffected: this.getStepsAffected(),
          optional: this.isOptional(),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          service: 'DSO API',
          status: 'misconfigured',
          reason: `Configuration error: ${errorMessage}`,
          requiredConfig: this.getRequiredConfig(),
          stepsAffected: this.getStepsAffected(),
          optional: this.isOptional(),
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        service: 'DSO API',
        status: 'unavailable',
        reason: `Failed to validate: ${errorMessage}`,
        requiredConfig: this.getRequiredConfig(),
        stepsAffected: this.getStepsAffected(),
        optional: this.isOptional(),
      };
    }
  }
}

/**
 * Google Custom Search API Validator
 */
class GoogleSearchApiValidator implements ServiceValidator {
  getRequiredConfig(): string[] {
    return ['GOOGLE_CUSTOM_SEARCH_JSON_API_KEY', 'GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID'];
  }

  getStepsAffected(): string[] {
    return ['step6', 'step7'];
  }

  isOptional(): boolean {
    return true; // Google Search is optional (can use other sources)
  }

  async isAvailable(): Promise<boolean> {
    try {
      const service = new GoogleSearchService();
      return service.isConfigured();
    } catch (error) {
      return false;
    }
  }

  async validate(): Promise<ServiceValidationResult> {
    try {
      const service = new GoogleSearchService();
      
      if (!service.isConfigured()) {
        return {
          service: 'Google Custom Search API',
          status: 'misconfigured',
          reason: 'Missing API key or search engine ID',
          requiredConfig: this.getRequiredConfig(),
          stepsAffected: this.getStepsAffected(),
          optional: this.isOptional(),
        };
      }

      // Try to validate configuration
      try {
        service.validateConfiguration();
        return {
          service: 'Google Custom Search API',
          status: 'available',
          requiredConfig: this.getRequiredConfig(),
          stepsAffected: this.getStepsAffected(),
          optional: this.isOptional(),
        };
      } catch (error) {
        if (error instanceof ServiceConfigurationError) {
          return {
            service: 'Google Custom Search API',
            status: 'misconfigured',
            reason: error.message,
            requiredConfig: this.getRequiredConfig(),
            stepsAffected: this.getStepsAffected(),
            optional: this.isOptional(),
          };
        }
        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        service: 'Google Custom Search API',
        status: 'unavailable',
        reason: `Failed to validate: ${errorMessage}`,
        requiredConfig: this.getRequiredConfig(),
        stepsAffected: this.getStepsAffected(),
        optional: this.isOptional(),
      };
    }
  }
}

/**
 * Common Crawl API Validator
 */
class CommonCrawlApiValidator implements ServiceValidator {
  getRequiredConfig(): string[] {
    // Common Crawl doesn't require API keys, but needs configuration
    return [];
  }

  getStepsAffected(): string[] {
    return ['step8'];
  }

  isOptional(): boolean {
    return true; // Common Crawl is optional
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Common Crawl doesn't require special configuration
      // Just check if service can be instantiated
      const service = new CommonCrawlIndexService();
      return true;
    } catch (error) {
      return false;
    }
  }

  async validate(): Promise<ServiceValidationResult> {
    try {
      // Common Crawl doesn't require API keys
      // Just verify service can be instantiated
      const service = new CommonCrawlIndexService();
      
      return {
        service: 'Common Crawl API',
        status: 'available',
        requiredConfig: this.getRequiredConfig(),
        stepsAffected: this.getStepsAffected(),
        optional: this.isOptional(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        service: 'Common Crawl API',
        status: 'unavailable',
        reason: `Failed to validate: ${errorMessage}`,
        requiredConfig: this.getRequiredConfig(),
        stepsAffected: this.getStepsAffected(),
        optional: this.isOptional(),
      };
    }
  }
}

/**
 * Service Validation Service
 * 
 * Validates external service configuration and availability.
 */
export class ServiceValidationService {
  private validators: Map<string, ServiceValidator> = new Map();

  constructor(useProduction: boolean = false) {
    // Register validators
    this.validators.set('dso', new DSOApiValidator(useProduction));
    this.validators.set('googleSearch', new GoogleSearchApiValidator());
    this.validators.set('commonCrawl', new CommonCrawlApiValidator());
  }

  /**
   * Validate a specific service
   * 
   * @param serviceName - Service name ('dso', 'googleSearch', 'commonCrawl')
   * @returns Validation result
   */
  async validateService(serviceName: string): Promise<ServiceValidationResult> {
    const validator = this.validators.get(serviceName);
    if (!validator) {
      return {
        service: serviceName,
        status: 'unavailable',
        reason: `Unknown service: ${serviceName}`,
        optional: true,
      };
    }

    return validator.validate();
  }

  /**
   * Validate all services
   * 
   * @param requiredServices - Optional list of required service names (defaults to all)
   * @returns Validation report
   */
  async validateAll(requiredServices?: string[]): Promise<ValidationReport> {
    const servicesToValidate = requiredServices || Array.from(this.validators.keys());
    const results: ServiceValidationResult[] = [];

    for (const serviceName of servicesToValidate) {
      const result = await this.validateService(serviceName);
      results.push(result);
    }

    // Determine overall validity
    // A workflow is invalid if any required service is unavailable or misconfigured
    const requiredServiceResults = results.filter(r => !r.optional);
    const invalidRequiredServices = requiredServiceResults.filter(
      r => r.status === 'unavailable' || r.status === 'misconfigured'
    );

    const valid = invalidRequiredServices.length === 0;

    // Build summary message
    const unavailableServices = results.filter(r => r.status === 'unavailable');
    const misconfiguredServices = results.filter(r => r.status === 'misconfigured');
    
    let message = 'Service validation ';
    if (valid) {
      message += 'passed';
      if (unavailableServices.length > 0 || misconfiguredServices.length > 0) {
        message += ` (${unavailableServices.length} optional service(s) unavailable, ${misconfiguredServices.length} optional service(s) misconfigured)`;
      }
    } else {
      message += 'failed';
      if (misconfiguredServices.length > 0) {
        message += `: ${misconfiguredServices.length} required service(s) misconfigured`;
      }
      if (unavailableServices.length > 0) {
        message += `: ${unavailableServices.length} required service(s) unavailable`;
      }
    }

    return {
      valid,
      services: results,
      message,
    };
  }

  /**
   * Validate services required for specific workflow steps
   * 
   * @param stepIds - Step IDs to validate services for
   * @returns Validation report
   */
  async validateForSteps(stepIds: string[]): Promise<ValidationReport> {
    const requiredServices: string[] = [];

    // Map step IDs to required services
    for (const stepId of stepIds) {
      if (stepId === 'step1' || stepId === 'step2') {
        if (!requiredServices.includes('dso')) {
          requiredServices.push('dso');
        }
      }
      if (stepId === 'step6' || stepId === 'step7') {
        if (!requiredServices.includes('googleSearch')) {
          requiredServices.push('googleSearch');
        }
      }
      if (stepId === 'step8') {
        if (!requiredServices.includes('commonCrawl')) {
          requiredServices.push('commonCrawl');
        }
      }
    }

    return this.validateAll(requiredServices);
  }

  /**
   * Get required configuration for a service
   * 
   * @param serviceName - Service name
   * @returns Required configuration keys
   */
  getRequiredConfig(serviceName: string): string[] {
    const validator = this.validators.get(serviceName);
    if (!validator) {
      return [];
    }
    return validator.getRequiredConfig();
  }

  /**
   * Check if a service is available (quick check without full validation)
   * 
   * @param serviceName - Service name
   * @returns True if service is available
   */
  async isServiceAvailable(serviceName: string): Promise<boolean> {
    const validator = this.validators.get(serviceName);
    if (!validator) {
      return false;
    }
    return validator.isAvailable();
  }
}

/**
 * Get service validation service instance
 * 
 * @param useProduction - Whether to use production configuration (default: false)
 * @returns ServiceValidationService instance
 */
export function getServiceValidationService(useProduction: boolean = false): ServiceValidationService {
  return new ServiceValidationService(useProduction);
}

