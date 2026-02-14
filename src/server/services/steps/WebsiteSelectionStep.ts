/**
 * WebsiteSelectionStep - Step logic for website selection
 * 
 * This service separates step logic from UI rendering:
 * - Handles website selection business logic
 * - Validates step parameters
 * - Executes step actions
 * - Manages step state
 */

import type { StepDefinition, StepExecutionResult, StepValidationResult } from '../../types/StepDefinition.js';
import { StepStateModel } from '../../models/StepState.js';
import { logger } from '../../utils/logger.js';

/**
 * Website selection step parameters
 */
export interface WebsiteSelectionStepParams {
  /** Selected website IDs */
  selectedWebsiteIds: string[];
  
  /** Optional: Query ID for context */
  queryId?: string;
  
  /** Optional: Workflow run ID */
  runId?: string;
}

/**
 * Website selection step result
 */
export interface WebsiteSelectionStepResult {
  /** Selected website IDs */
  selectedWebsiteIds: string[];
  
  /** Number of websites selected */
  count: number;
  
  /** Optional: Scraping workflow run ID if scraping was initiated */
  scrapingRunId?: string;
}

/**
 * WebsiteSelectionStep - Step definition for website selection
 */
export class WebsiteSelectionStep implements StepDefinition {
  id = 'website-selection';
  name = 'Website Selection';
  description = 'Select websites to scrape for policy documents';

  parameterSchema = {
    selectedWebsiteIds: {
      type: 'array' as const,
      required: true,
      description: 'Array of selected website IDs',
      validation: (value: unknown) => {
        if (!Array.isArray(value)) {
          return 'selectedWebsiteIds must be an array';
        }
        // Allow empty array to skip website scraping
        if (value.length === 0) {
          return true; // Empty array is valid - website scraping will be skipped
        }
        if (!value.every(id => typeof id === 'string' && id.length > 0)) {
          return 'All website IDs must be non-empty strings';
        }
        return true;
      },
    },
    queryId: {
      type: 'string' as const,
      required: false,
      description: 'Query ID for context',
    },
    runId: {
      type: 'string' as const,
      required: false,
      description: 'Workflow run ID',
    },
  };

  /**
   * Validate step parameters
   */
  validate(params: Record<string, unknown>): StepValidationResult {
    const errors: Record<string, string> = {};

    // Validate selectedWebsiteIds
    const selectedWebsiteIds = params.selectedWebsiteIds;
    if (!selectedWebsiteIds) {
      errors.selectedWebsiteIds = 'selectedWebsiteIds is required';
    } else if (!Array.isArray(selectedWebsiteIds)) {
      errors.selectedWebsiteIds = 'selectedWebsiteIds must be an array';
    } else if (selectedWebsiteIds.length === 0) {
      // Empty array is valid - website scraping will be skipped
      // No error needed
    } else if (!selectedWebsiteIds.every((id: unknown) => typeof id === 'string' && id.length > 0)) {
      errors.selectedWebsiteIds = 'All website IDs must be non-empty strings';
    }

    // Validate queryId if provided
    if (params.queryId !== undefined && typeof params.queryId !== 'string') {
      errors.queryId = 'queryId must be a string';
    }

    // Validate runId if provided
    if (params.runId !== undefined && typeof params.runId !== 'string') {
      errors.runId = 'runId must be a string';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
  }

  /**
   * Execute the website selection step
   */
  async execute(
    params: Record<string, unknown>,
    context?: Record<string, unknown>
  ): Promise<StepExecutionResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${JSON.stringify(validation.errors)}`,
        };
      }

      const stepParams = params as unknown as WebsiteSelectionStepParams;
      const runId = stepParams.runId || (context?.runId as string) || '';

      // Persist step state
      if (runId) {
        try {
          // Check if step state already exists
          let stepState = await StepStateModel.findByRunAndStep(runId, this.id);
          
          if (!stepState) {
            // Create new step state
            stepState = await StepStateModel.create({
              runId,
              stepId: this.id,
              params: stepParams as unknown as Record<string, unknown>,
              userId: context?.userId as string | undefined,
              context,
            });
          } else {
            // Update existing step state
            stepState = await StepStateModel.update(runId, this.id, {
              status: 'in_progress',
              params: stepParams as unknown as Record<string, unknown>,
              context,
            });
          }
        } catch (error) {
          logger.warn({ error, runId, stepId: this.id }, 'Failed to persist step state, continuing execution');
        }
      }

      // Execute step logic
      const result: WebsiteSelectionStepResult = {
        selectedWebsiteIds: stepParams.selectedWebsiteIds,
        count: stepParams.selectedWebsiteIds.length,
      };

      // Update step state to completed
      if (runId) {
        try {
          await StepStateModel.update(runId, this.id, {
            status: 'completed',
            result: result as unknown as Record<string, unknown>,
          });
        } catch (error) {
          logger.warn({ error, runId, stepId: this.id }, 'Failed to update step state to completed');
        }
      }

      return {
        success: true,
        data: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error, params }, 'Website selection step execution failed');

      // Update step state to failed
      const runId = params.runId as string || (context?.runId as string) || '';
      if (runId) {
        try {
          await StepStateModel.update(runId, this.id, {
            status: 'failed',
            error: errorMessage,
          });
        } catch (updateError) {
          logger.warn({ error: updateError, runId, stepId: this.id }, 'Failed to update step state to failed');
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get next step ID based on execution result
   */
  getNextStepId(result: StepExecutionResult): string | undefined {
    if (result.success && result.data) {
      // If scraping was initiated, next step might be document review
      if (result.data.scrapingRunId) {
        return 'document-review';
      }
      // Otherwise, proceed to scraping step
      return 'scraping';
    }
    return undefined;
  }

  uiHints = {
    component: 'Step2WebsiteSelection',
    props: {
      stepId: this.id,
    },
  };
}


