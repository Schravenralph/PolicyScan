import { logger } from '../../utils/logger.js';
import { ModuleActionAdapter } from './ModuleActionAdapter.js';
import { WorkflowModule } from './WorkflowModule.js';
import { moduleRegistry } from './WorkflowModuleRegistry.js';
import { WorkflowValidator } from './WorkflowValidator.js';
import { NotFoundError, ServiceUnavailableError } from '../../types/errors.js';

export type StepAction = (params: Record<string, unknown>, runId: string, signal?: AbortSignal) => Promise<Record<string, unknown> | null | undefined>;

/**
 * WorkflowActionRegistry Service
 * 
 * Responsible for managing workflow action registration and execution.
 * 
 * This service extracts action registration logic from WorkflowEngine
 * to follow the single responsibility principle.
 */
export class WorkflowActionRegistry {
  private actions: Map<string, StepAction>;

  constructor(private validator: WorkflowValidator, actions?: Map<string, StepAction>) {
    this.actions = actions || new Map<string, StepAction>();
  }

  /**
   * Register an action that can be used in workflows
   */
  registerAction(name: string, action: StepAction): void {
    this.actions.set(name, action);
  }

  /**
   * Execute a single action directly (for testing and standalone execution)
   * 
   * @param actionName - Name of the action to execute
   * @param params - Parameters to pass to the action
   * @param runId - Workflow run ID for logging
   * @param signal - Optional abort signal for cancellation
   * @returns Result from the action execution
   */
  async executeAction(
    actionName: string,
    params: Record<string, unknown>,
    runId: string,
    signal?: AbortSignal
  ): Promise<Record<string, unknown> | null | undefined> {
    const action = this.actions.get(actionName);
    if (!action) {
      const availableActions = Array.from(this.actions.keys()).join(', ');
      throw new NotFoundError('Workflow action', actionName, {
        availableActions: availableActions ? availableActions.split(', ') : [],
        reason: 'action_not_registered'
      });
    }
    return await action(params, runId, signal);
  }

  /**
   * Register a module as an action that can be used in workflows
   * 
   * This method wraps a WorkflowModule in a ModuleActionAdapter and registers
   * it as an action. The module can then be referenced in workflow steps by
   * its ID or by a custom action name.
   * 
   * @param actionName The name to use when referencing this module in workflows (defaults to module.id)
   * @param module The WorkflowModule to register
   * @throws Error if module is invalid or registration fails
   * 
   * @example
   * ```typescript
   * const searchModule = new SearchWebModule();
   * actionRegistry.registerModule('searchWeb', searchModule);
   * ```
   */
  registerModule(actionName: string, module: WorkflowModule): void {
    try {
      const adapter = ModuleActionAdapter.fromModule(module);
      const action = adapter.toAction();
      this.actions.set(actionName, action);
      logger.info({ moduleId: module.id, actionName }, `Registered module ${module.id} as action ${actionName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ moduleId: module.id, actionName, error }, `Failed to register module ${module.id} as action ${actionName}`);
      throw new ServiceUnavailableError(`Failed to register module ${module.id} as action ${actionName}: ${errorMessage}`, {
        moduleId: module.id,
        actionName,
        reason: 'module_registration_failed',
        originalError: errorMessage
      });
    }
  }

  /**
   * Register a module from the module registry by ID
   * 
   * Looks up a module in the module registry and registers it as an action.
   * This allows workflows to reference modules by ID without explicitly
   * registering them first.
   * 
   * @param actionName The name to use when referencing this module in workflows
   * @param moduleId The ID of the module in the registry
   * @throws Error if module is not found in registry
   * 
   * @example
   * ```typescript
   * actionRegistry.registerModuleFromRegistry('searchWeb', 'DiscoverSources');
   * ```
   */
  registerModuleFromRegistry(actionName: string, moduleId: string): void {
    const entry = moduleRegistry.get(moduleId);
    if (!entry) {
      throw new NotFoundError('Workflow module', moduleId, {
        actionName,
        reason: 'module_not_found_in_registry'
      });
    }
    this.registerModule(actionName, entry.module);
  }

  /**
   * Get the names of registered actions (for diagnostics / UI)
   */
  getRegisteredActionNames(): string[] {
    return this.validator.getRegisteredActionNames();
  }

  /**
   * Get the actions map (for internal use by WorkflowEngine)
   */
  getActions(): Map<string, StepAction> {
    return this.actions;
  }
}
