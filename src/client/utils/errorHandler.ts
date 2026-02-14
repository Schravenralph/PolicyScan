/**
 * Enhanced error handling utility for Beleidsscan
 * Provides specific, actionable error messages with retry functionality
 * 
 * This module integrates with the centralized error handling system
 */

import { getErrorMessage, getOperationErrorMessage as getOperationErrorMsg } from './errorMessages.js';
import { t } from './i18n.js';
import { translateLogMessage } from './logTranslations.js';

export interface ErrorInfo {
  title: string;
  message: string;
  action?: string;
  retryable?: boolean;
  errorType: 'network' | 'validation' | 'server' | 'timeout' | 'permission' | 'unknown';
  statusCode?: number;
  code?: string;
}

export interface ErrorWithRetry extends ErrorInfo {
  onRetry?: () => void | Promise<void>;
}

/**
 * Parse API error response (from backend ErrorResponse format)
 */
export function parseApiErrorResponse(response: {
  error?: string;
  code?: string;
  message?: string;
  statusCode?: number;
}): ErrorInfo {
  // Helper to translate message if it contains [i18n:...] or [i18n ...] keys
  const translateIfNeeded = (msg: string | undefined): string | undefined => {
    if (!msg) return msg;
    // Check for both [i18n:...] and [i18n ...] formats (missing colon)
    if (msg.includes('[i18n:') || msg.match(/\[i18n\s+\w/)) {
      return translateLogMessage(msg);
    }
    return msg;
  };

  // Check for GraphDB hierarchy error first
  if (response.error?.includes('GraphDB backend') || response.message?.includes('GraphDB backend')) {
    return {
      title: t('errors.graphdb.hierarchyNotAvailable'),
      message: t('errors.graphdb.hierarchyNotAvailableMessage'),
      action: t('errors.graphdb.hierarchyNotAvailableAction'),
      retryable: false,
      errorType: 'validation',
      statusCode: response.statusCode || 400
    };
  }
  
  // Derive default error code from status code if not provided
  const statusCode = response.statusCode || 500;
  let defaultCode = 'INTERNAL_SERVER_ERROR';
  if (statusCode === 401) {
    defaultCode = 'UNAUTHORIZED';
  } else if (statusCode === 403) {
    defaultCode = 'FORBIDDEN';
  } else if (statusCode === 404) {
    defaultCode = 'NOT_FOUND';
  } else if (statusCode === 400) {
    defaultCode = 'BAD_REQUEST';
  } else if (statusCode === 429) {
    defaultCode = 'TOO_MANY_REQUESTS';
  } else if (statusCode >= 500) {
    defaultCode = 'INTERNAL_SERVER_ERROR';
  } else if (statusCode >= 400) {
    defaultCode = 'CLIENT_ERROR';
  }
  
  const code = response.code || defaultCode;
  
  // Try to get error message from code first
  const errorMessage = getErrorMessage(code);
  
  // Translate API response messages if they contain [i18n:...] keys
  const translatedMessage = translateIfNeeded(response.message || response.error) || errorMessage.message;
  
  return {
    title: errorMessage.title,
    message: translatedMessage,
    action: errorMessage.action,
    retryable: errorMessage.retryable,
    errorType: statusCode >= 500 ? 'server' : statusCode === 401 || statusCode === 403 ? 'permission' : 'validation',
    statusCode,
    code,
  };
}

/**
 * Check if error is related to GraphDB backend not supporting hierarchical structure
 */
export function isGraphDBHierarchyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  
  const errorObj = error as Record<string, unknown>;
  
  // Check error message
  if (errorObj.message && typeof errorObj.message === 'string') {
    if (errorObj.message.includes('Hierarchical structure is not available for GraphDB backend')) {
      return true;
    }
  }
  
  // Check response data
  if (errorObj.response && typeof errorObj.response === 'object') {
    const response = errorObj.response as { data?: unknown };
    if (response.data && typeof response.data === 'object') {
      const data = response.data as { error?: string; message?: string };
      if (data.error?.includes('GraphDB backend') || data.message?.includes('GraphDB backend')) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Parse error and return specific error information
 */
export function parseError(error: unknown): ErrorInfo {
  // Check for GraphDB hierarchy error first
  if (isGraphDBHierarchyError(error)) {
    return {
      title: t('errors.graphdb.hierarchyNotAvailable'),
      message: t('errors.graphdb.hierarchyNotAvailableMessage'),
      action: t('errors.graphdb.hierarchyNotAvailableAction'),
      retryable: false,
      errorType: 'validation',
      statusCode: 400
    };
  }
  
  // Check if it's an API error response
  if (error && typeof error === 'object' && 'code' in error) {
    return parseApiErrorResponse(error as { code?: string; message?: string; statusCode?: number });
  }
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      title: t('errors.network.connectionProblem'),
      message: t('errors.network.connectionProblemMessage'),
      action: t('errors.network.connectionProblemAction'),
      retryable: true,
      errorType: 'network'
    };
  }

  // HTTP errors
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    return parseHttpError(status);
  }

  // Error objects with message
  if (error instanceof Error) {
    // Check if error message contains [i18n:...] keys and translate it first
    const errorMessage = translateLogMessage(error.message);
    
    const message = errorMessage.toLowerCase();
    
    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        title: t('errors.timeout.genericTitle'),
        message: t('errors.timeout.genericMessage'),
        action: t('errors.timeout.genericAction'),
        retryable: true,
        errorType: 'timeout'
      };
    }

    // Connection refused errors - link to startup issues
    if (message.includes('econnrefused') || message.includes('connection refused')) {
      return {
        title: t('errors.network.connectionRefused'),
        message: t('errors.network.connectionRefusedMessage'),
        action: t('errors.network.connectionRefusedAction'),
        retryable: true,
        errorType: 'network'
      };
    }

    // Socket hang up and EPIPE errors
    if (message.includes('socket hang up') || 
        message.includes('econnreset') || 
        message.includes('epipe') ||
        message.includes('broken pipe')) {
      return {
        title: t('errors.network.connectionBroken'),
        message: t('errors.network.connectionBrokenMessage'),
        action: t('errors.network.connectionBrokenAction'),
        retryable: true,
        errorType: 'network'
      };
    }

    // Network errors
    if (message.includes('network') || message.includes('failed to fetch')) {
      return {
        title: t('errors.network.networkError'),
        message: t('errors.network.networkErrorMessage'),
        action: t('errors.network.networkErrorAction'),
        retryable: true,
        errorType: 'network'
      };
    }

    // Permission errors
    if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('401') || message.includes('403')) {
      return {
        title: 'Toegang geweigerd',
        message: 'U heeft geen toestemming voor deze actie.',
        action: 'Log opnieuw in of neem contact op met de beheerder.',
        retryable: false,
        errorType: 'permission',
        statusCode: message.includes('401') ? 401 : 403
      };
    }

    // Server errors
    if (message.includes('500') || message.includes('server error')) {
      return {
        title: 'Serverfout',
        message: 'Er is een fout opgetreden op de server.',
        action: 'Probeer het over een paar minuten opnieuw. Als het probleem aanhoudt, neem contact op met de beheerder.',
        retryable: true,
        errorType: 'server',
        statusCode: 500
      };
    }

    // Not found errors
    if (message.includes('404') || message.includes('not found')) {
      return {
        title: 'Niet gevonden',
        message: 'De gevraagde resource kon niet worden gevonden.',
        action: 'Controleer of de URL correct is of probeer het later opnieuw.',
        retryable: false,
        errorType: 'server',
        statusCode: 404
      };
    }

    // Rate limiting
    if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
      return {
        title: 'Te veel verzoeken',
        message: 'U heeft te veel verzoeken gedaan. Wacht even voordat u het opnieuw probeert.',
        action: 'Wacht 30 seconden en probeer het dan opnieuw.',
        retryable: true,
        errorType: 'server',
        statusCode: 429
      };
    }

    // Generic error with message (use translated message if it contains [i18n:...])
    return {
      title: 'Fout opgetreden',
      message: errorMessage || 'Er is een onbekende fout opgetreden.',
      action: 'Probeer het opnieuw. Als het probleem aanhoudt, neem contact op met de beheerder.',
      retryable: true,
      errorType: 'unknown'
    };
  }

  // Unknown error
  return {
    title: 'Onbekende fout',
    message: 'Er is een onbekende fout opgetreden.',
    action: 'Probeer het opnieuw of verfris de pagina.',
    retryable: true,
    errorType: 'unknown'
  };
}

/**
 * Parse HTTP status code errors
 */
function parseHttpError(status: number): ErrorInfo {
  switch (status) {
    case 400:
      return {
        title: 'Ongeldig verzoek',
        message: 'Het verzoek is ongeldig. Controleer de ingevoerde gegevens.',
        action: 'Controleer uw invoer en probeer het opnieuw.',
        retryable: false,
        errorType: 'validation',
        statusCode: 400
      };
    case 401:
      return {
        title: 'Niet ingelogd',
        message: 'U moet ingelogd zijn om deze actie uit te voeren.',
        action: 'Log opnieuw in en probeer het opnieuw.',
        retryable: false,
        errorType: 'permission',
        statusCode: 401
      };
    case 403:
      return {
        title: 'Toegang geweigerd',
        message: 'U heeft geen toestemming voor deze actie.',
        action: 'Neem contact op met de beheerder als u denkt dat dit een fout is.',
        retryable: false,
        errorType: 'permission',
        statusCode: 403
      };
    case 404:
      return {
        title: 'Niet gevonden',
        message: 'De gevraagde resource kon niet worden gevonden.',
        action: 'Controleer of de URL correct is.',
        retryable: false,
        errorType: 'server',
        statusCode: 404
      };
    case 429:
      return {
        title: 'Te veel verzoeken',
        message: 'U heeft te veel verzoeken gedaan. Wacht even voordat u het opnieuw probeert.',
        action: 'Wacht 30 seconden en probeer het dan opnieuw.',
        retryable: true,
        errorType: 'server',
        statusCode: 429
      };
    case 500:
    case 502:
    case 503:
      return {
        title: 'Serverfout',
        message: `De server heeft een fout gerapporteerd (${status}).`,
        action: 'Probeer het over een paar minuten opnieuw.',
        retryable: true,
        errorType: 'server',
        statusCode: status
      };
    default:
      return {
        title: 'Fout opgetreden',
        message: `Er is een fout opgetreden (${status}).`,
        action: 'Probeer het opnieuw. Als het probleem aanhoudt, neem contact op met de beheerder.',
        retryable: status >= 500,
        errorType: 'server',
        statusCode: status
      };
  }
}

/**
 * Log error for debugging
 */
export function logError(error: unknown, context?: string): void {
  const errorInfo = parseError(error);
  const errorObj = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  const logData: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    context: context || 'Unknown',
    errorType: errorInfo.errorType,
    statusCode: errorInfo.statusCode || errorObj?.statusCode || errorObj?.status,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  
  if (errorObj?.code !== undefined) {
    logData.code = errorObj.code;
  }
  if (errorObj?.response !== undefined) {
    logData.response = errorObj.response;
  }
  // Include endpoint and method if available (from API errors)
  if (errorObj?.endpoint !== undefined) {
    logData.endpoint = errorObj.endpoint;
  }
  if (errorObj?.method !== undefined) {
    logData.method = errorObj.method;
  }

  // Enhanced logging: Log each property separately for better visibility in browser console
  // This prevents "Object" from appearing when React DevTools intercepts console.error
  console.group(`🔴 Error [${context || 'Unknown'}]`);
  console.error('Timestamp:', logData.timestamp);
  console.error('Error Type:', logData.errorType);
  console.error('Status Code:', logData.statusCode || 'N/A');
  console.error('Message:', logData.message);
  if (logData.code) {
    console.error('Error Code:', logData.code);
  }
  if (logData.endpoint) {
    console.error('Endpoint:', logData.endpoint);
  }
  if (logData.method) {
    console.error('Method:', logData.method);
  }
  if (logData.response) {
    console.error('Response:', logData.response);
    // Extract URL from response if available
    if (typeof logData.response === 'object' && logData.response !== null) {
      const response = logData.response as { url?: string };
      if (response.url) {
        console.error('Request URL:', response.url);
      }
    }
  }
  if (logData.stack) {
    console.error('Stack:', logData.stack);
  }
  // Also log the full object for detailed inspection
  console.error('Full Error Object:', error);
  console.error('Full Log Data:', logData);
  console.groupEnd();
  
  // In production, you might want to send this to an error tracking service
  // e.g., Sentry, LogRocket, etc.
  if (process.env.NODE_ENV === 'production') {
    // Example: sendToErrorTracking(logData);
  }
}

/**
 * Create error message with retry functionality
 */
export function createErrorWithRetry(
  error: unknown,
  retryFn: () => void | Promise<void>,
  context?: string
): ErrorWithRetry {
  const errorInfo = parseError(error);
  logError(error, context);
  
  return {
    ...errorInfo,
    onRetry: retryFn
  };
}

/**
 * Get user-friendly error message for specific operations
 * Uses centralized error message mapping
 */
export function getOperationErrorMessage(operation: string, error: unknown): ErrorInfo {
  const baseError = parseError(error);
  const operationMessage = getOperationErrorMsg(operation, baseError.code);
  
  return {
    ...baseError,
    title: operationMessage.title,
    message: baseError.message || operationMessage.message,
    action: baseError.action || operationMessage.action,
    retryable: baseError.retryable ?? operationMessage.retryable,
  };
}

