import { Workflow } from '../infrastructure/types.js';
import { StepAction } from './WorkflowEngine.js';
import { moduleRegistry } from './WorkflowModuleRegistry.js';

/**
 * WorkflowValidator Service
 * 
 * Responsible for validating workflow structure and ensuring
 * all required actions are registered before execution.
 * 
 * This service extracts workflow validation logic from WorkflowEngine
 * to follow the single responsibility principle.
 * 
 * Supports module-based actions by checking the module registry
 * if an action is not found in the registered actions map.
 */
export class WorkflowValidator {
  constructor(private actions: Map<string, StepAction>) {}

  /**
   * Validate that all required actions for a workflow are registered
   * 
   * Checks both registered actions and the module registry.
   * If an action is not found in registered actions, it checks if
   * a module with that ID exists in the registry.
   * 
   * Also validates parallel step definitions.
   */
  validateWorkflow(workflow: Workflow): void {
    // Check if workflow has steps
    if (!workflow.steps || workflow.steps.length === 0) {
      throw new Error(`Workflow "${workflow.name}" has no steps defined`);
    }
    
    const missingActions: string[] = [];
    const moduleActions: string[] = [];
    const invalidParallelSteps: string[] = [];
    const stepIds = new Set(workflow.steps.map(s => s.id));
    
    for (const step of workflow.steps) {
      // Validate parallel steps if defined
      if (step.parallel) {
        // Parallel steps cannot have an action (they're containers)
        if (step.action) {
          invalidParallelSteps.push(`${step.name} (${step.id}): Cannot have both 'action' and 'parallel' properties`);
        }
        
        // Validate that all parallel step IDs exist
        for (const parallelStepId of step.parallel) {
          if (!stepIds.has(parallelStepId)) {
            invalidParallelSteps.push(`${step.name} (${step.id}): Parallel step "${parallelStepId}" does not exist`);
          }
        }
        
        // Validate that parallel steps don't reference each other (no circular dependencies)
        if (step.parallel.includes(step.id)) {
          invalidParallelSteps.push(`${step.name} (${step.id}): Cannot reference itself in parallel steps`);
        }
        
        // Validate actions for parallel steps
        for (const parallelStepId of step.parallel) {
          const parallelStep = workflow.steps.find(s => s.id === parallelStepId);
          if (parallelStep) {
            if (!this.actions.has(parallelStep.action)) {
              // Check if this is a module in the registry
              const moduleEntry = moduleRegistry.get(parallelStep.action);
              if (moduleEntry) {
                moduleActions.push(`${parallelStep.name} (${parallelStep.action} - module)`);
              } else {
                missingActions.push(`${parallelStep.name} (${parallelStep.action})`);
              }
            }
          }
        }
      } else {
        // Validate action for regular steps
        if (!step.action) {
          missingActions.push(`${step.name} (${step.id}): Missing 'action' property`);
        } else if (!this.actions.has(step.action)) {
          // Check if this is a module in the registry
          const moduleEntry = moduleRegistry.get(step.action);
          if (moduleEntry) {
            // Module exists in registry - it can be used as an action
            moduleActions.push(`${step.name} (${step.action} - module)`);
          } else {
            // Neither action nor module found
            missingActions.push(`${step.name} (${step.action})`);
          }
        }
      }
    }
    
    if (invalidParallelSteps.length > 0) {
      throw new Error(
        `Workflow "${workflow.name}" has invalid parallel step definitions: ${invalidParallelSteps.join('; ')}`
      );
    }
    
    if (missingActions.length > 0) {
      const availableActions = Array.from(this.actions.keys()).join(', ');
      const availableModules = moduleRegistry.getAll().map(e => e.metadata.id).join(', ');
      throw new Error(
        `Workflow "${workflow.name}" requires actions that are not registered: ${missingActions.join(', ')}. ` +
        `Available actions: ${availableActions || '(none)'}. ` +
        `Available modules: ${availableModules || '(none)'}`
      );
    }
    
    // Log if any steps use modules (for debugging)
    if (moduleActions.length > 0) {
      // Note: We could auto-register modules here, but that's handled by WorkflowEngine
      // during execution via registerModuleFromRegistry
    }
  }

  /**
   * Check if an action is registered
   */
  hasAction(actionName: string): boolean {
    return this.actions.has(actionName);
  }

  /**
   * Get all registered action names
   */
  getRegisteredActionNames(): string[] {
    return Array.from(this.actions.keys());
  }
}

