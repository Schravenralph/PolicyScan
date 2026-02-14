/**
 * GetScanStatusAction - Wizard step action for retrieving scan status
 * 
 * This action handles the `document-review` wizard step by:
 * - Retrieving the workflow run status from WizardSession.linkedRunId
 * - Returning run status information (running, completed, failed, etc.)
 * - Returning progress information if available
 * - Handling cases where runId is not yet set
 * 
 * This is a read-only action that does not modify the session context.
 */

import { z } from 'zod';
import { getDB } from '../../../../config/database.js';
import { RunManager } from '../../../workflow/RunManager.js';
import { getProgressStreamingService } from '../../../progress/ProgressStreamingService.js';
import type { WizardStepAction } from '../WizardStepAction.js';
import type { WizardSessionDocument } from '../../../../types/WizardSession.js';
import type { Run } from '../../../infrastructure/types.js';

// Import schema from single source of truth
import { getScanStatusInputSchema as schemaFromDefinition } from '../../definitions/schemas.js';

/**
 * Input schema for GetScanStatusAction (re-exported from single source of truth)
 * @deprecated Use getScanStatusInputSchema from definitions/schemas.ts instead
 */
export const getScanStatusInputSchema = schemaFromDefinition;

/**
 * Input type for GetScanStatusAction
 */
export type GetScanStatusInput = z.infer<typeof getScanStatusInputSchema>;

/**
 * Progress information structure
 */
export interface ScanProgress {
  progress?: number;
  status?: string;
  currentStep?: string;
  documentsFound?: number;
  estimatedTime?: number | null;
}

/**
 * Output type for GetScanStatusAction
 */
export interface GetScanStatusOutput {
  status: string;
  runId?: string;
  progress?: ScanProgress;
  error?: string;
  startTime?: string;
  endTime?: string;
}

/**
 * GetScanStatusAction - Retrieves the current status of the workflow run
 * 
 * This action implements the `getScanStatus` action for the `document-review` step.
 * It reads the runId from the session's linkedRunId and retrieves the run status.
 */
export class GetScanStatusAction implements WizardStepAction<GetScanStatusInput, GetScanStatusOutput> {
  readonly stepId = 'document-review';
  readonly actionId = 'getScanStatus';
  
  private runManager: RunManager;
  private progressService = getProgressStreamingService();

  constructor() {
    const db = getDB();
    this.runManager = new RunManager(db);
  }

  /**
   * Execute the getScanStatus action
   * 
   * This method:
   * 1. Validates input (empty object for consistency)
   * 2. Retrieves runId from session.linkedRunId
   * 3. If runId is not set, returns status indicating no run started
   * 4. Retrieves run from RunManager
   * 5. Retrieves progress from ProgressStreamingService if available
   * 6. Returns status, runId, and progress information
   * 
   * @param session - The current wizard session
   * @param input - The action input (empty object)
   * @returns Promise resolving to the action output (status, runId, progress)
   * @throws Error if run retrieval fails unexpectedly
   */
  async execute(
    session: WizardSessionDocument,
    input: GetScanStatusInput
  ): Promise<GetScanStatusOutput> {
    // Validate input (empty object for consistency)
    getScanStatusInputSchema.parse(input);

    // Get runId from session
    const runId = session.linkedRunId;

    // If runId is not set, return status indicating no run started
    if (!runId) {
      return {
        status: 'not-started',
        progress: {
          status: 'not-started',
          currentStep: 'Scan not started',
        },
      };
    }

    // Retrieve run from RunManager
    let run: Run | null;
    try {
      run = await this.runManager.getRun(runId);
    } catch (error) {
      // If run retrieval fails, return error status
      return {
        status: 'error',
        runId,
        error: error instanceof Error ? error.message : 'Failed to retrieve run status',
      };
    }

    // If run not found, return not-found status
    if (!run) {
      return {
        status: 'not-found',
        runId,
        error: 'Run not found',
      };
    }

    // Get progress from ProgressStreamingService if available
    let progress: ScanProgress | undefined;
    const progressData = this.progressService.getProgress(runId);
    if (progressData) {
      progress = {
        progress: progressData.progress,
        status: progressData.status,
        currentStep: progressData.currentStep,
        documentsFound: progressData.totalDocumentsFound,
        estimatedTime: progressData.estimatedSecondsRemaining,
      };
    } else {
      // If no progress data available, create basic progress from run status
      progress = {
        status: run.status,
        currentStep: this.getCurrentStepFromStatus(run.status),
      };
    }

    // Build output
    const output: GetScanStatusOutput = {
      status: run.status,
      runId,
      progress,
      startTime: run.startTime ? run.startTime.toISOString() : undefined,
      endTime: run.endTime ? run.endTime.toISOString() : undefined,
    };

    // Add error if run failed
    if (run.status === 'failed' && run.error) {
      output.error = run.error;
    }

    return output;
  }

  /**
   * Get a human-readable current step message based on run status
   * 
   * @param status - The run status
   * @returns Human-readable step message
   */
  private getCurrentStepFromStatus(status: string): string {
    switch (status) {
      case 'pending':
        return 'Scan pending...';
      case 'running':
        return 'Scan in progress...';
      case 'completed':
        return 'Scan completed';
      case 'failed':
        return 'Scan failed';
      case 'cancelled':
        return 'Scan cancelled';
      case 'paused':
        return 'Scan paused';
      default:
        return `Scan status: ${status}`;
    }
  }
}
