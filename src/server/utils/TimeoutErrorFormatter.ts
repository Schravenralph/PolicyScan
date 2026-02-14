/**
 * Timeout Error Formatter
 * 
 * Provides consistent, user-friendly error messages for timeout scenarios
 * with actionable suggestions based on timeout type and context.
 */

export type TimeoutType = 'step' | 'workflow' | 'parallel_step' | 'queue' | 'review' | 'api_call';

export interface TimeoutErrorContext {
  type: TimeoutType;
  workflowId?: string;
  workflowName?: string;
  stepId?: string;
  stepName?: string;
  timeoutMs: number;
  elapsedMs: number;
  action?: string;
  runId?: string;
  percentageUsed?: number;
}

export interface FormattedTimeoutError {
  message: string;
  suggestions: string[];
  metadata: {
    type: TimeoutType;
    timeoutSeconds: number;
    elapsedSeconds: number;
    percentageUsed: number;
    workflowId?: string;
    workflowName?: string;
    stepId?: string;
    stepName?: string;
  };
}

/**
 * Format milliseconds to human-readable duration
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format milliseconds to seconds with 1 decimal place
 */
function formatSeconds(ms: number): number {
  return Math.round((ms / 1000) * 10) / 10;
}

/**
 * Get actionable suggestions based on timeout type and context
 */
function getSuggestions(context: TimeoutErrorContext): string[] {
  const suggestions: string[] = [];
  const percentageUsed = context.percentageUsed ?? (context.elapsedMs / context.timeoutMs) * 100;

  switch (context.type) {
    case 'step':
      suggestions.push(`The step "${context.stepName || context.stepId}" took longer than the allowed time limit.`);
      if (percentageUsed > 95) {
        suggestions.push(`The step used ${Math.round(percentageUsed)}% of its timeout limit, suggesting the timeout may be too short.`);
        suggestions.push(`Consider increasing the timeout for this step in the workflow configuration.`);
      } else {
        suggestions.push(`The step used ${Math.round(percentageUsed)}% of its timeout limit.`);
      }
      suggestions.push(`Check if external services or APIs used by this step are experiencing delays.`);
      suggestions.push(`Review the step's action (${context.action || 'unknown'}) for optimization opportunities.`);
      suggestions.push(`Try running the workflow again - this may be a temporary issue.`);
      break;

    case 'workflow':
      suggestions.push(`The workflow "${context.workflowName || context.workflowId}" exceeded its maximum execution time.`);
      if (percentageUsed > 95) {
        suggestions.push(`The workflow used ${Math.round(percentageUsed)}% of its timeout limit, suggesting the timeout may be too short.`);
        suggestions.push(`Consider increasing the workflow timeout in the workflow configuration.`);
      } else {
        suggestions.push(`The workflow used ${Math.round(percentageUsed)}% of its timeout limit.`);
      }
      suggestions.push(`Review workflow steps for optimization opportunities.`);
      suggestions.push(`Check if any external services are experiencing delays.`);
      suggestions.push(`Consider breaking the workflow into smaller, more manageable steps.`);
      break;

    case 'parallel_step':
      suggestions.push(`One or more parallel steps in workflow "${context.workflowName || context.workflowId}" timed out.`);
      suggestions.push(`The step "${context.stepName || context.stepId}" exceeded its timeout limit.`);
      suggestions.push(`Check if external services used by parallel steps are experiencing delays.`);
      suggestions.push(`Consider increasing timeout limits for parallel steps.`);
      suggestions.push(`Review if parallel steps can be optimized or split into smaller operations.`);
      break;

    case 'queue':
      suggestions.push(`The workflow "${context.workflowName || context.workflowId}" timed out while waiting in the queue.`);
      suggestions.push(`The queue processing time exceeded the allowed limit.`);
      suggestions.push(`Check if the queue is experiencing high load or delays.`);
      suggestions.push(`Consider increasing the queue timeout limit.`);
      suggestions.push(`Try running the workflow again when queue load is lower.`);
      break;

    case 'review':
      suggestions.push(`The workflow review point timed out.`);
      suggestions.push(`The review process took longer than the allowed time limit.`);
      suggestions.push(`Check if reviewers are available and responding promptly.`);
      suggestions.push(`Consider increasing the review timeout limit.`);
      suggestions.push(`Review the review process for optimization opportunities.`);
      break;

    case 'api_call':
      suggestions.push(`An external API call timed out.`);
      if (context.stepName) {
        suggestions.push(`The API call in step "${context.stepName}" exceeded its timeout limit.`);
      }
      suggestions.push(`Check if the external service is experiencing issues or high load.`);
      suggestions.push(`Consider increasing the API call timeout limit.`);
      suggestions.push(`Review if the API call can be optimized or cached.`);
      suggestions.push(`Try running the workflow again - this may be a temporary service issue.`);
      break;
  }

  return suggestions;
}

/**
 * Format timeout error message with context and suggestions
 */
export class TimeoutErrorFormatter {
  /**
   * Format a timeout error with user-friendly message and suggestions
   */
  formatError(context: TimeoutErrorContext): FormattedTimeoutError {
    const timeoutSeconds = formatSeconds(context.timeoutMs);
    const elapsedSeconds = formatSeconds(context.elapsedMs);
    const percentageUsed = context.percentageUsed ?? (context.elapsedMs / context.timeoutMs) * 100;

    let message = '';

    switch (context.type) {
      case 'step':
        message = `Step "${context.stepName || context.stepId}" timed out after ${formatDuration(context.timeoutMs)} (elapsed: ${formatDuration(context.elapsedMs)}, ${Math.round(percentageUsed)}% of limit).`;
        if (context.workflowName) {
          message += ` Workflow: ${context.workflowName}`;
          if (context.workflowId) {
            message += ` (${context.workflowId})`;
          }
        }
        break;

      case 'workflow':
        message = `Workflow "${context.workflowName || context.workflowId}" exceeded maximum execution time of ${formatDuration(context.timeoutMs)} (elapsed: ${formatDuration(context.elapsedMs)}, ${Math.round(percentageUsed)}% of limit).`;
        break;

      case 'parallel_step':
        message = `Parallel step "${context.stepName || context.stepId}" timed out after ${formatDuration(context.timeoutMs)} (elapsed: ${formatDuration(context.elapsedMs)}, ${Math.round(percentageUsed)}% of limit).`;
        if (context.workflowName) {
          message += ` Workflow: ${context.workflowName}`;
          if (context.workflowId) {
            message += ` (${context.workflowId})`;
          }
        }
        break;

      case 'queue':
        message = `Workflow "${context.workflowName || context.workflowId}" timed out while waiting in queue (timeout: ${formatDuration(context.timeoutMs)}, elapsed: ${formatDuration(context.elapsedMs)}, ${Math.round(percentageUsed)}% of limit).`;
        break;

      case 'review':
        message = `Workflow review point timed out after ${formatDuration(context.timeoutMs)} (elapsed: ${formatDuration(context.elapsedMs)}, ${Math.round(percentageUsed)}% of limit).`;
        if (context.workflowName) {
          message += ` Workflow: ${context.workflowName}`;
          if (context.workflowId) {
            message += ` (${context.workflowId})`;
          }
        }
        break;

      case 'api_call':
        message = `External API call timed out after ${formatDuration(context.timeoutMs)} (elapsed: ${formatDuration(context.elapsedMs)}, ${Math.round(percentageUsed)}% of limit).`;
        if (context.stepName) {
          message += ` Step: ${context.stepName}`;
        }
        if (context.workflowName) {
          message += ` Workflow: ${context.workflowName}`;
        }
        break;
    }

    const suggestions = getSuggestions({
      ...context,
      percentageUsed,
    });

    return {
      message,
      suggestions,
      metadata: {
        type: context.type,
        timeoutSeconds,
        elapsedSeconds,
        percentageUsed,
        workflowId: context.workflowId,
        workflowName: context.workflowName,
        stepId: context.stepId,
        stepName: context.stepName,
      },
    };
  }

  /**
   * Format error message as a simple string (for backward compatibility)
   */
  formatErrorMessage(context: TimeoutErrorContext): string {
    return this.formatError(context).message;
  }

  /**
   * Format error with suggestions as a single message
   */
  formatErrorWithSuggestions(context: TimeoutErrorContext): string {
    const formatted = this.formatError(context);
    return `${formatted.message}\n\nSuggestions:\n${formatted.suggestions.map(s => `- ${s}`).join('\n')}`;
  }
}

// Singleton instance
let timeoutErrorFormatter: TimeoutErrorFormatter | null = null;

/**
 * Get the singleton TimeoutErrorFormatter instance
 */
export function getTimeoutErrorFormatter(): TimeoutErrorFormatter {
  if (!timeoutErrorFormatter) {
    timeoutErrorFormatter = new TimeoutErrorFormatter();
  }
  return timeoutErrorFormatter;
}


