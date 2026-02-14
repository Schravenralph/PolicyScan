/**
 * Workflow-Wizard Integration Service
 * 
 * Provides health checks, parameter validation, and result validation
 * for the workflow-wizard integration.
 */

import { api } from '../api';
import { z } from 'zod';
import type { Run, WorkflowOutput } from '../api';

export interface WorkflowExecutionParams {
  queryId: string;
  websiteIds?: string[];
  onderwerp: string;
  overheidslaag?: string;
  overheidsinstantie?: string;
  [key: string]: unknown;
}

export interface IntegrationHealthStatus {
  healthy: boolean;
  timestamp: string;
  checks: {
    workflowService: {
      healthy: boolean;
      message?: string;
    };
    wizardService: {
      healthy: boolean;
      message?: string;
    };
    integration: {
      healthy: boolean;
      message?: string;
    };
  };
}

export interface ParameterValidationResult {
  valid: boolean;
  errors?: Record<string, string>;
}

export interface ResultValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Schema for workflow execution parameters
 */
const workflowExecutionParamsSchema = z.object({
  queryId: z.string().min(1, 'Query ID is required'),
  websiteIds: z.array(z.string()).optional(),
  onderwerp: z.string().min(1, 'Onderwerp is required'),
  overheidslaag: z.string().optional(),
  overheidsinstantie: z.string().optional(),
}).passthrough(); // Allow additional workflow-specific parameters

/**
 * Schema for workflow result validation
 */
const workflowResultSchema = z.object({
  metadata: z.object({
    runId: z.string(),
    workflowId: z.string(),
    workflowName: z.string(),
    startTime: z.string(),
    status: z.string(),
  }),
  results: z.object({
    summary: z.object({
      totalDocuments: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative().optional(),
    }),
  }).optional(),
}).passthrough();

export class WorkflowWizardIntegrationService {
  /**
   * Check integration health
   */
  static async checkHealth(): Promise<IntegrationHealthStatus> {
    const timestamp = new Date().toISOString();
    const checks = {
      workflowService: await this.checkWorkflowService(),
      wizardService: await this.checkWizardService(),
      integration: await this.checkIntegration(),
    };

    const healthy = Object.values(checks).every(check => check.healthy);

    return {
      healthy,
      timestamp,
      checks,
    };
  }

  /**
   * Check workflow service health
   */
  private static async checkWorkflowService(): Promise<IntegrationHealthStatus['checks']['workflowService']> {
    try {
      // Try to get recent runs to verify workflow service is accessible
      await api.getRecentRuns(1);
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Workflow service unavailable',
      };
    }
  }

  /**
   * Check wizard service health
   */
  private static async checkWizardService(): Promise<IntegrationHealthStatus['checks']['wizardService']> {
    try {
      // Try to get wizard health check
      await api.wizard.getHealth();
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Wizard service unavailable',
      };
    }
  }

  /**
   * Check integration health (both services working together)
   */
  private static async checkIntegration(): Promise<IntegrationHealthStatus['checks']['integration']> {
    try {
      // Check if both services are healthy
      const workflowCheck = await this.checkWorkflowService();
      const wizardCheck = await this.checkWizardService();

      if (!workflowCheck.healthy || !wizardCheck.healthy) {
        return {
          healthy: false,
          message: 'One or more services are unavailable',
        };
      }

      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Integration check failed',
      };
    }
  }

  /**
   * Validate workflow execution parameters
   */
  static validateParameters(params: WorkflowExecutionParams): ParameterValidationResult {
    try {
      workflowExecutionParamsSchema.parse(params);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.issues.forEach((err) => {
          const path = err.path.join('.');
          errors[path] = err.message;
        });
        return { valid: false, errors };
      }
      return {
        valid: false,
        errors: { _general: 'Invalid parameters' },
      };
    }
  }

  /**
   * Validate workflow result
   */
  static validateResult(result: WorkflowOutput | Run): ResultValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if result is a Run object
    if ('status' in result && 'type' in result) {
      const run = result as Run;
      
      // Validate run status
      if (!['pending', 'running', 'completed', 'failed', 'cancelled', 'paused'].includes(run.status)) {
        errors.push(`Invalid run status: ${run.status}`);
      }

      // Check for errors
      if (run.status === 'failed' && !run.error) {
        warnings.push('Run failed but no error message provided');
      }

      // Validate run ID
      if (!run._id) {
        errors.push('Run ID is missing');
      }

      return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    // Validate WorkflowOutput
    try {
      workflowResultSchema.parse(result);
      
      const output = result as WorkflowOutput;
      
      // Additional validation
      if (output.metadata.status === 'completed' && !output.results) {
        warnings.push('Workflow completed but no results provided');
      }

      if (output.results?.summary) {
        if (output.results.summary.totalDocuments < 0) {
          errors.push('Total documents cannot be negative');
        }
      }

      return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.issues.map(err => `${err.path.join('.')}: ${err.message}`);
        return {
          valid: false,
          errors: validationErrors,
        };
      }
      return {
        valid: false,
        errors: ['Invalid result format'],
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
}


