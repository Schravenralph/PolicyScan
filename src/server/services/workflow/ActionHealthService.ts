/**
 * Action Health Service
 * 
 * Provides health check functionality for workflow action registration.
 */

import { WorkflowEngine } from './WorkflowEngine.js';
import { ActionRegistryValidator } from './ActionRegistryValidator.js';
import { WorkflowModel } from '../../models/Workflow.js';
import { logger } from '../../utils/logger.js';
import type { Workflow } from '../infrastructure/types.js';

export interface ActionHealthStatus {
  healthy: boolean;
  timestamp: string;
  registeredActions: number;
  requiredActions: Array<{
    action: string;
    registered: boolean;
    usedInWorkflows: string[];
  }>;
  workflows: Array<{
    id: string;
    name: string;
    valid: boolean;
    missingActions: string[];
  }>;
  errors?: string[];
}

export class ActionHealthService {
  /**
   * Get comprehensive health status of action registration
   */
  static async getHealthStatus(workflowEngine: WorkflowEngine): Promise<ActionHealthStatus> {
    const timestamp = new Date().toISOString();
    const errors: string[] = [];

    try {
      // Get all registered actions
      const registeredActionNames = new Set(workflowEngine.getRegisteredActionNames());

      // Get all published workflows
      const workflows = await WorkflowModel.findByStatus('Published');

      // Track which actions are used in which workflows
      const actionUsage = new Map<string, string[]>();

      // Validate each workflow
      const workflowStatuses = workflows.map((workflow) => {
        // Cast to Workflow type for validation
        const workflowForValidation = workflow as Workflow;
        const requiredActions = ActionRegistryValidator.getRequiredActions(workflowForValidation);
        
        // Track action usage
        for (const action of requiredActions) {
          if (!actionUsage.has(action)) {
            actionUsage.set(action, []);
          }
          actionUsage.get(action)!.push(workflow.id);
        }

        const validation = ActionRegistryValidator.validateWorkflowActions(workflowForValidation, workflowEngine);
        
        return {
          id: workflow.id,
          name: workflow.name,
          valid: validation.valid,
          missingActions: validation.missingActions,
        };
      });

      // Build required actions list
      const requiredActions = Array.from(actionUsage.entries()).map(([action, workflows]: [string, string[]]) => ({
        action,
        registered: registeredActionNames.has(action),
        usedInWorkflows: workflows,
      }));

      // Determine overall health
      const allWorkflowsValid = workflowStatuses.every((w: { valid: boolean }) => w.valid);
      const allActionsRegistered = requiredActions.every((a: { registered: boolean }) => a.registered);
      const healthy = allWorkflowsValid && allActionsRegistered;

      if (!healthy) {
        const missingActions = requiredActions.filter((a: { registered: boolean }) => !a.registered);
        if (missingActions.length > 0) {
          errors.push(`Missing actions: ${missingActions.map((a: { action: string }) => a.action).join(', ')}`);
        }
        
        const invalidWorkflows = workflowStatuses.filter((w: { valid: boolean }) => !w.valid);
        if (invalidWorkflows.length > 0) {
          errors.push(`Invalid workflows: ${invalidWorkflows.map((w: { id: string }) => w.id).join(', ')}`);
        }
      }

      return {
        healthy,
        timestamp,
        registeredActions: registeredActionNames.size,
        requiredActions,
        workflows: workflowStatuses,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get action health status');
      return {
        healthy: false,
        timestamp,
        registeredActions: 0,
        requiredActions: [],
        workflows: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Quick health check (returns boolean)
   */
  static async quickHealthCheck(workflowEngine: WorkflowEngine): Promise<boolean> {
    try {
      const health = await this.getHealthStatus(workflowEngine);
      return health.healthy;
    } catch {
      return false;
    }
  }

  /**
   * Get registration statistics
   */
  static getRegistrationStats(workflowEngine: WorkflowEngine): {
    totalRegistered: number;
    actions: Array<{ name: string; registered: boolean }>;
  } {
    const registeredActions = ActionRegistryValidator.getRegisteredActions(workflowEngine);
    
    return {
      totalRegistered: registeredActions.length,
      actions: registeredActions.map(a => ({
        name: a.action,
        registered: a.registered,
      })),
    };
  }
}

