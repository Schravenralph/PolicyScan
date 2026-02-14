/**
 * Action Registry Validator
 * 
 * Validates that all required workflow actions are registered before workflow execution.
 */

import { WorkflowEngine } from './WorkflowEngine.js';
import { logger } from '../../utils/logger.js';
import type { Workflow } from '../infrastructure/types.js';

export interface ActionValidationResult {
  valid: boolean;
  missingActions: string[];
  errors: Array<{
    action: string;
    stepId: string;
    stepName: string;
    error: string;
  }>;
}

export interface ActionVersionInfo {
  action: string;
  version?: string;
  registered: boolean;
}

export class ActionRegistryValidator {
  /**
   * Validate that all actions required by a workflow are registered
   */
  static validateWorkflowActions(
    workflow: Workflow,
    workflowEngine: WorkflowEngine
  ): ActionValidationResult {
    const missingActions: string[] = [];
    const errors: ActionValidationResult['errors'] = [];

    // Get all registered actions from the workflow engine
    // Note: WorkflowEngine doesn't expose actions directly, so we'll need to check during execution
    // For now, we'll validate by attempting to get actions referenced in workflow steps
    
    for (const step of workflow.steps) {
      const actionName = step.action;
      
      if (!actionName) {
        errors.push({
          action: 'unknown',
          stepId: step.id,
          stepName: step.name || step.id,
          error: 'Step has no action specified',
        });
        continue;
      }

      // Check if action is registered by attempting to get it
      // Since WorkflowEngine doesn't expose a public method to check action existence,
      // we'll need to add that or use a different approach
      // For now, we'll validate during execution and log warnings
      
      // Try to validate action exists by checking if it's in the engine's internal map
      // This is a workaround - ideally WorkflowEngine would expose hasAction() method
      try {
        // We can't directly access private actions map, so we'll need to add a public method
        // For now, mark as potentially missing if we can't verify
        const actionExists = this.checkActionExists(workflowEngine, actionName);
        
        if (!actionExists) {
          missingActions.push(actionName);
          errors.push({
            action: actionName,
            stepId: step.id,
            stepName: step.name || step.id,
            error: `Action "${actionName}" is not registered`,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          action: actionName,
          stepId: step.id,
          stepName: step.name || step.id,
          error: `Failed to validate action: ${errorMessage}`,
        });
      }
    }

    const valid = missingActions.length === 0 && errors.length === 0;

    if (!valid) {
      logger.warn(
        {
          workflowId: workflow.id,
          workflowName: workflow.name,
          missingActions,
          errors,
        },
        'Workflow action validation failed'
      );
    }

    return {
      valid,
      missingActions,
      errors,
    };
  }

  /**
   * Check if an action exists in the workflow engine
   */
  private static checkActionExists(workflowEngine: WorkflowEngine, actionName: string): boolean {
    const registeredNames = workflowEngine.getRegisteredActionNames();
    return registeredNames.includes(actionName);
  }

  /**
   * Get list of all registered actions with version info
   */
  static getRegisteredActions(workflowEngine: WorkflowEngine): ActionVersionInfo[] {
    try {
      const actionNames = workflowEngine.getRegisteredActionNames();
      return actionNames.map((actionName: string) => ({
        action: actionName,
        registered: true,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get registered actions');
      return [];
    }
  }

  /**
   * Get list of required actions for a workflow
   */
  static getRequiredActions(workflow: Workflow): string[] {
    const actions = new Set<string>();

    for (const step of workflow.steps) {
      if (step.action) {
        actions.add(step.action);
      }
    }

    return Array.from(actions);
  }

  /**
   * Validate action versions (if version tracking is implemented)
   * 
   * This is a placeholder for future version checking functionality.
   * When version tracking is implemented, this will:
   * - Check if workflow requires specific action versions
   * - Compare required versions with registered versions
   * - Return mismatches for incompatible versions
   */
  static validateActionVersions(
    workflow: Workflow,
    workflowEngine: WorkflowEngine
  ): { valid: boolean; mismatches: Array<{ action: string; required?: string; actual?: string }> } {
    // Version validation would go here if we implement version tracking
    // For now, return valid since we don't track versions yet
    // 
    // Future implementation:
    // 1. Extract required versions from workflow metadata or step params
    // 2. Get actual versions from registered actions
    // 3. Compare and return mismatches
    
    const mismatches: Array<{ action: string; required?: string; actual?: string }> = [];
    
    // If workflow has version requirements, validate them here
    // Example: if (workflow.metadata?.requiredActionVersions) { ... }
    
    return {
      valid: mismatches.length === 0,
      mismatches,
    };
  }
}

