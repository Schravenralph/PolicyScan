import type { RunLog } from '../../infrastructure/types.js';
import type { WorkflowOutput } from '../WorkflowOutputService.js';

/**
 * Extracts error information from workflow run logs
 */
export class WorkflowErrorExtractor {
  /**
   * Extract errors from logs
   */
  extractErrors(logs: RunLog[]): WorkflowOutput['errors'] {
    return logs
      .filter(log => log.level === 'error')
      .map(log => ({
        timestamp: log.timestamp.toISOString(),
        message: log.message,
        url: log.metadata?.url as string | undefined,
        stepId: log.metadata?.stepId as string | undefined
      }));
  }
}



