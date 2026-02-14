/**
 * WorkflowTimeoutRateMonitor
 * 
 * Background service that periodically checks workflow timeout rates
 * and sends alerts when thresholds are exceeded.
 */

import { getWorkflowAlertService } from './WorkflowAlertService.js';
import { WorkflowModel } from '../../models/Workflow.js';
import { logger } from '../../utils/logger.js';

/**
 * Background monitor for workflow timeout rates
 */
export class WorkflowTimeoutRateMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check every hour
  private running = false;

  /**
   * Start the monitor
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('[WorkflowTimeoutRateMonitor] Monitor already running');
      return;
    }

    logger.info('[WorkflowTimeoutRateMonitor] Starting timeout rate monitor (checking every hour)');
    
    // Run immediately on start
    this.checkTimeoutRates().catch((error) => {
      logger.error({ error }, '[WorkflowTimeoutRateMonitor] Error in initial check');
    });

    // Then run every hour
    this.intervalId = setInterval(() => {
      this.checkTimeoutRates().catch((error) => {
        logger.error({ error }, '[WorkflowTimeoutRateMonitor] Error checking timeout rates');
      });
    }, this.CHECK_INTERVAL_MS);

    logger.info('[WorkflowTimeoutRateMonitor] Monitor started');
  }

  /**
   * Stop the monitor
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('[WorkflowTimeoutRateMonitor] Monitor stopped');
    }
  }

  /**
   * Check timeout rates for all workflows
   * 
   * @private
   */
  private async checkTimeoutRates(): Promise<void> {
    if (this.running) {
      logger.debug('[WorkflowTimeoutRateMonitor] Check already running, skipping');
      return;
    }

    this.running = true;

    try {
      logger.debug('[WorkflowTimeoutRateMonitor] Checking timeout rates for all workflows');

      // Get all workflows from database
      const workflows = await WorkflowModel.findAll();
      
      if (workflows.length === 0) {
        logger.debug('[WorkflowTimeoutRateMonitor] No workflows found');
        return;
      }

      const alertService = getWorkflowAlertService();

      // Check timeout rates for each workflow
      for (const workflow of workflows) {
        try {
          await alertService.checkTimeoutRate(
            workflow.id,
            workflow.name
          );

          // Also check timeout rates for each step
          if (workflow.steps) {
            for (const step of workflow.steps) {
              try {
                await alertService.checkTimeoutRate(
                  workflow.id,
                  workflow.name,
                  step.id,
                  step.name
                );
              } catch (error) {
                logger.error(
                  { error, workflowId: workflow.id, stepId: step.id },
                  '[WorkflowTimeoutRateMonitor] Error checking step timeout rate'
                );
              }
            }
          }
        } catch (error) {
          logger.error(
            { error, workflowId: workflow.id },
            '[WorkflowTimeoutRateMonitor] Error checking workflow timeout rate'
          );
        }
      }

      // Clean up old alert records
      alertService.cleanupOldAlerts();

      logger.debug(
        { workflowCount: workflows.length },
        '[WorkflowTimeoutRateMonitor] Timeout rate check completed'
      );
    } catch (error) {
      logger.error({ error }, '[WorkflowTimeoutRateMonitor] Error in timeout rate check');
    } finally {
      this.running = false;
    }
  }
}

/**
 * Get or create a singleton instance of WorkflowTimeoutRateMonitor
 */
let monitorInstance: WorkflowTimeoutRateMonitor | null = null;

export function getWorkflowTimeoutRateMonitor(): WorkflowTimeoutRateMonitor {
  if (!monitorInstance) {
    monitorInstance = new WorkflowTimeoutRateMonitor();
  }
  return monitorInstance;
}


