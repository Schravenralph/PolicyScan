/**
 * Action Registry - Registry system for wizard step actions
 * 
 * This module provides a centralized registry for all wizard step actions,
 * allowing the WizardSessionEngine to resolve (stepId, actionId) → action implementation.
 * 
 * All actions must be registered at server startup before the wizard engine can use them.
 */

import type { WizardStepAction } from './WizardStepAction.js';
import { BadRequestError } from '../../../types/errors.js';

/**
 * Action Registry class
 * 
 * Maintains a registry of all wizard step actions, keyed by (stepId, actionId).
 * Actions are registered at server startup and can be retrieved by the engine.
 */
class ActionRegistry {
  /**
   * Internal map: stepId -> actionId -> action
   */
  private actions: Map<string, Map<string, WizardStepAction<unknown, unknown>>> = new Map();

  /**
   * Register a wizard step action
   * 
   * @param action - The action to register
   * @throws Error if an action with the same (stepId, actionId) is already registered
   */
  registerAction(action: WizardStepAction<unknown, unknown>): void {
    const { stepId, actionId } = action;

    // Validate action has required properties
    if (!stepId || !actionId) {
      throw new BadRequestError(`Action must have stepId and actionId properties. Got: stepId=${stepId}, actionId=${actionId}`, {
        stepId: stepId || 'undefined',
        actionId: actionId || 'undefined',
        actionType: action.constructor.name
      });
    }

    // Get or create step map
    if (!this.actions.has(stepId)) {
      this.actions.set(stepId, new Map());
    }
    const stepActions = this.actions.get(stepId)!;

    // Check for duplicate registration
    if (stepActions.has(actionId)) {
      throw new BadRequestError(
        `Action already registered: ${stepId}.${actionId}. Actions must be unique per (stepId, actionId) pair.`,
        {
          stepId,
          actionId,
          actionType: action.constructor.name
        }
      );
    }

    // Register the action
    stepActions.set(actionId, action);
  }

  /**
   * Get an action by stepId and actionId
   * 
   * @param stepId - The step ID
   * @param actionId - The action ID
   * @returns The action if found, undefined otherwise
   */
  getAction(stepId: string, actionId: string): WizardStepAction<unknown, unknown> | undefined {
    const stepActions = this.actions.get(stepId);
    if (!stepActions) {
      return undefined;
    }
    return stepActions.get(actionId);
  }

  /**
   * Get all actions for a specific step
   * 
   * @param stepId - The step ID
   * @returns Array of all actions registered for the step
   */
  getAllActionsForStep(stepId: string): WizardStepAction<unknown, unknown>[] {
    const stepActions = this.actions.get(stepId);
    if (!stepActions) {
      return [];
    }
    return Array.from(stepActions.values());
  }

  /**
   * Check if an action is registered
   * 
   * @param stepId - The step ID
   * @param actionId - The action ID
   * @returns true if the action is registered, false otherwise
   */
  hasAction(stepId: string, actionId: string): boolean {
    return this.getAction(stepId, actionId) !== undefined;
  }

  /**
   * Get all registered step IDs
   * 
   * @returns Array of all step IDs that have registered actions
   */
  getRegisteredStepIds(): string[] {
    return Array.from(this.actions.keys());
  }

  /**
   * Clear all registered actions (useful for testing)
   */
  clear(): void {
    this.actions.clear();
  }

  /**
   * Get count of registered actions
   * 
   * @returns Total number of registered actions
   */
  getActionCount(): number {
    let count = 0;
    for (const stepActions of this.actions.values()) {
      count += stepActions.size;
    }
    return count;
  }
}

/**
 * Singleton instance of the action registry
 * 
 * This is the global registry that should be used throughout the application.
 */
const actionRegistry = new ActionRegistry();

/**
 * Get the action registry instance
 * 
 * @returns The singleton action registry instance
 */
export function getActionRegistry(): ActionRegistry {
  return actionRegistry;
}

/**
 * Register all wizard step actions at server startup
 * 
 * This function should be called during server initialization to register
 * all available wizard step actions.
 * 
 * @throws Error if any action fails to register
 */
export async function registerAllActions(): Promise<void> {
  // Import all actions dynamically to avoid circular dependencies
  const { CreateQueryAction } = await import('./queryConfiguration/CreateQueryAction.js');
  const { GenerateWebsiteSuggestionsAction } = await import('./websiteSelection/GenerateWebsiteSuggestionsAction.js');
  const { ConfirmWebsiteSelectionAction } = await import('./websiteSelection/ConfirmWebsiteSelectionAction.js');
  const { StartScanAction } = await import('./documentReview/StartScanAction.js');
  const { GetScanStatusAction } = await import('./documentReview/GetScanStatusAction.js');
  const { GetResultsAction } = await import('./documentReview/GetResultsAction.js');
  const { ApplyReviewDecisionsAction } = await import('./documentReview/ApplyReviewDecisionsAction.js');
  
  // Try to import ExportResultsAction (optional)
  let ExportResultsAction: typeof import('./documentReview/ExportResultsAction.js').ExportResultsAction | undefined;
  try {
    const exportModule = await import('./documentReview/ExportResultsAction.js');
    ExportResultsAction = exportModule.ExportResultsAction;
  } catch {
    // ExportResultsAction is optional, so we'll skip it if it doesn't exist
    ExportResultsAction = undefined;
  }

  // Register all actions
  actionRegistry.registerAction(new CreateQueryAction());
  actionRegistry.registerAction(new GenerateWebsiteSuggestionsAction());
  actionRegistry.registerAction(new ConfirmWebsiteSelectionAction());
  actionRegistry.registerAction(new StartScanAction());
  actionRegistry.registerAction(new GetScanStatusAction());
  actionRegistry.registerAction(new GetResultsAction());
  actionRegistry.registerAction(new ApplyReviewDecisionsAction());
  
  // Register ExportResultsAction if available (optional)
  if (ExportResultsAction) {
    actionRegistry.registerAction(new ExportResultsAction());
  }
}

// Export the registry class for testing
export { ActionRegistry };

