/**
 * Utility to parse timeout error messages and reconstruct Error objects
 * with suggestions and metadata for use with TimeoutErrorDisplay component
 */

/**
 * Parse a timeout error message string and extract metadata
 * This allows us to reconstruct timeout errors from stored error strings
 */
export function parseTimeoutError(errorMessage: string): Error & { suggestions?: string[]; metadata?: { type?: string; timeoutSeconds?: number; elapsedSeconds?: number; percentageUsed?: number } } | null {
  if (!errorMessage) {
    return null;
  }

  // Check if this looks like a timeout error
  const isTimeoutError = 
    errorMessage.includes('timed out') ||
    errorMessage.includes('exceeded') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('Timeout');

  if (!isTimeoutError) {
    return null;
  }

  // Try to extract timeout information from the message
  // Format: "Step 'X' timed out after Y (elapsed: Z, N% of limit)."
  const timeoutMatch = errorMessage.match(/(\d+)% of limit/);
  const percentageUsed = timeoutMatch ? parseFloat(timeoutMatch[1]) : undefined;

  // Extract timeout duration (e.g., "1m 30s", "2h 5m 10s")
  const durationMatch = errorMessage.match(/after\s+([\dhms\s]+)\s*\(/);
  
  // Extract elapsed time
  const elapsedMatch = errorMessage.match(/elapsed:\s+([\dhms\s]+)/);

  // Determine timeout type from message
  let timeoutType: 'step' | 'workflow' | 'parallel_step' | 'queue' | 'review' | 'api_call' = 'step';
  if (errorMessage.includes('Workflow') && errorMessage.includes('exceeded')) {
    timeoutType = 'workflow';
  } else if (errorMessage.includes('Parallel step')) {
    timeoutType = 'parallel_step';
  } else if (errorMessage.includes('queue')) {
    timeoutType = 'queue';
  } else if (errorMessage.includes('review')) {
    timeoutType = 'review';
  } else if (errorMessage.includes('API call')) {
    timeoutType = 'api_call';
  }

  // Generate basic suggestions based on timeout type
  const suggestions: string[] = [];
  if (percentageUsed && percentageUsed > 95) {
    suggestions.push(`The timeout used ${Math.round(percentageUsed)}% of its limit, suggesting the timeout may be too short.`);
    suggestions.push(`Consider increasing the timeout limit in the workflow configuration.`);
  } else if (percentageUsed) {
    suggestions.push(`The timeout used ${Math.round(percentageUsed)}% of its limit.`);
  }

  switch (timeoutType) {
    case 'step':
      suggestions.push(`Check if external services or APIs used by this step are experiencing delays.`);
      suggestions.push(`Review the step for optimization opportunities.`);
      suggestions.push(`Try running the workflow again - this may be a temporary issue.`);
      break;
    case 'workflow':
      suggestions.push(`Review workflow steps for optimization opportunities.`);
      suggestions.push(`Check if any external services are experiencing delays.`);
      suggestions.push(`Consider breaking the workflow into smaller, more manageable steps.`);
      break;
    case 'parallel_step':
      suggestions.push(`Check if external services used by parallel steps are experiencing delays.`);
      suggestions.push(`Consider increasing timeout limits for parallel steps.`);
      suggestions.push(`Review if parallel steps can be optimized or split into smaller operations.`);
      break;
    case 'queue':
      suggestions.push(`Check if the queue is experiencing high load or delays.`);
      suggestions.push(`Consider increasing the queue timeout limit.`);
      suggestions.push(`Try running the workflow again when queue load is lower.`);
      break;
    case 'review':
      suggestions.push(`Check if reviewers are available and responding promptly.`);
      suggestions.push(`Consider increasing the review timeout limit.`);
      suggestions.push(`Review the review process for optimization opportunities.`);
      break;
    case 'api_call':
      suggestions.push(`Check if the external service is experiencing issues or high load.`);
      suggestions.push(`Consider increasing the API call timeout limit.`);
      suggestions.push(`Review if the API call can be optimized or cached.`);
      suggestions.push(`Try running the workflow again - this may be a temporary service issue.`);
      break;
  }

  // Create error object with metadata
  const error = new Error(errorMessage);
  error.name = `${timeoutType.charAt(0).toUpperCase() + timeoutType.slice(1)}TimeoutError`;
  
  // Parse duration strings to seconds (simplified - just extract numbers)
  const parseDurationToSeconds = (durationStr?: string): number | undefined => {
    if (!durationStr) return undefined;
    
    let totalSeconds = 0;
    const hours = durationStr.match(/(\d+)h/);
    const minutes = durationStr.match(/(\d+)m/);
    const seconds = durationStr.match(/(\d+)s/);
    
    if (hours) totalSeconds += parseInt(hours[1]) * 3600;
    if (minutes) totalSeconds += parseInt(minutes[1]) * 60;
    if (seconds) totalSeconds += parseInt(seconds[1]);
    
    return totalSeconds || undefined;
  };

  (error as Error & { suggestions?: string[]; metadata?: { type?: string; timeoutSeconds?: number; elapsedSeconds?: number; percentageUsed?: number } }).suggestions = suggestions;
  (error as Error & { suggestions?: string[]; metadata?: { type?: string; timeoutSeconds?: number; elapsedSeconds?: number; percentageUsed?: number } }).metadata = {
    type: timeoutType,
    timeoutSeconds: parseDurationToSeconds(durationMatch?.[1]),
    elapsedSeconds: parseDurationToSeconds(elapsedMatch?.[1]),
    percentageUsed,
  };

  return error;
}

/**
 * Check if an error string is a timeout error
 */
export function isTimeoutErrorString(errorMessage: string): boolean {
  if (!errorMessage) return false;
  return (
    errorMessage.includes('timed out') ||
    errorMessage.includes('exceeded') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('Timeout')
  );
}


