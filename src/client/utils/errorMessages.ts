/**
 * Error Message Utilities
 * 
 * Provides user-friendly error message formatting and mapping
 * to improve error message clarity across the application.
 */

import { translateLogMessage } from './logTranslations.js';
import { t } from './i18n.js';

/**
 * Error context for better error messages
 */
export interface ErrorContext {
  action?: string; // What the user was trying to do
  field?: string; // Which field had an error
  value?: string; // What value caused the error
  step?: number; // Wizard step number
  resource?: string; // Resource name (e.g., "website", "document")
}

/**
 * Error message map structure
 */
export interface ErrorMessageMap {
  title: string;
  message: string;
  action?: string;
  retryable: boolean;
}

/**
 * Error messages mapped by error code
 */
export const errorMessages: Record<string, ErrorMessageMap> = {
  AUTHENTICATION_ERROR: {
    title: 'Niet ingelogd',
    message: 'U moet ingelogd zijn om deze actie uit te voeren.',
    action: 'Log opnieuw in en probeer het opnieuw.',
    retryable: false,
  },
  AUTHORIZATION_ERROR: {
    title: 'Toegang geweigerd',
    message: 'U heeft geen toestemming voor deze actie.',
    action: 'Neem contact op met de beheerder als u denkt dat dit een fout is.',
    retryable: false,
  },
  VALIDATION_ERROR: {
    title: 'Ongeldige invoer',
    message: 'De ingevoerde gegevens zijn ongeldig. Controleer alle velden en probeer het opnieuw.',
    action: 'Controleer uw invoer en probeer het opnieuw.',
    retryable: false,
  },
  BAD_REQUEST: {
    title: 'Ongeldig verzoek',
    message: 'Het verzoek is ongeldig. Controleer de ingevoerde gegevens.',
    action: 'Controleer uw invoer en probeer het opnieuw.',
    retryable: false,
  },
  NOT_FOUND: {
    title: 'Niet gevonden',
    message: 'De gevraagde resource kon niet worden gevonden.',
    action: 'Controleer of de URL correct is of probeer het later opnieuw.',
    retryable: false,
  },
  CONFLICT: {
    title: 'Conflict',
    message: 'Er is een conflict opgetreden. De resource bestaat mogelijk al.',
    action: 'Controleer of de resource al bestaat en probeer het opnieuw.',
    retryable: false,
  },
  UNPROCESSABLE_ENTITY: {
    title: 'Niet verwerkbaar',
    message: 'De server kan het verzoek niet verwerken vanwege semantische fouten.',
    action: 'Controleer de ingevoerde gegevens en probeer het opnieuw.',
    retryable: false,
  },
  RATE_LIMIT_EXCEEDED: {
    title: 'Te veel verzoeken',
    message: 'U heeft te veel verzoeken gedaan. Wacht even voordat u het opnieuw probeert.',
    action: 'Wacht 30 seconden en probeer het dan opnieuw.',
    retryable: true,
  },
  INTERNAL_SERVER_ERROR: {
    title: 'Serverfout',
    message: 'Er is een fout opgetreden op de server.',
    action: 'Probeer het over een paar minuten opnieuw. Als het probleem aanhoudt, neem contact op met de beheerder.',
    retryable: true,
  },
  SERVICE_UNAVAILABLE: {
    title: 'Service niet beschikbaar',
    message: 'De service is tijdelijk niet beschikbaar.',
    action: 'Probeer het over een paar minuten opnieuw.',
    retryable: true,
  },
  DATABASE_ERROR: {
    title: 'Databasefout',
    message: 'Er is een fout opgetreden bij het verbinden met de database.',
    action: 'Probeer het over een paar minuten opnieuw. Als het probleem aanhoudt, neem contact op met de beheerder.',
    retryable: true,
  },
  EXTERNAL_SERVICE_ERROR: {
    title: 'Externe servicefout',
    message: 'Er is een fout opgetreden bij het verbinden met een externe service.',
    action: 'Probeer het over een paar minuten opnieuw. Als het probleem aanhoudt, neem contact op met de beheerder.',
    retryable: true,
  },
};

/**
 * Operation-specific error messages
 */
export const operationErrorMessages: Record<string, ErrorMessageMap> = {
  'generate-websites': {
    title: 'Fout bij genereren website suggesties',
    message: 'Er is een fout opgetreden bij het genereren van website suggesties. Probeer het opnieuw.',
    action: 'Probeer het opnieuw. Als het probleem aanhoudt, controleer of alle vereiste gegevens zijn ingevuld.',
    retryable: true,
  },
  'scrape-websites': {
    title: 'Fout bij scrapen websites',
    message: 'Er is een fout opgetreden bij het scannen van websites. De scan kan niet worden voltooid.',
    action: 'Probeer het opnieuw. Als het probleem aanhoudt, controleer of de websites bereikbaar zijn.',
    retryable: true,
  },
  'update-document': {
    title: 'Fout bij bijwerken document',
    message: 'Er is een fout opgetreden bij het bijwerken van het document.',
    action: 'Probeer het opnieuw. Als het probleem aanhoudt, controleer of alle vereiste velden zijn ingevuld.',
    retryable: true,
  },
  'import-workflow': {
    title: 'Fout bij importeren workflow resultaten',
    message: 'Er is een fout opgetreden bij het importeren van workflow resultaten.',
    action: 'Probeer het opnieuw. Als het probleem aanhoudt, controleer of het bestand geldig is.',
    retryable: true,
  },
  'save-draft': {
    title: 'Fout bij opslaan concept',
    message: 'Er is een fout opgetreden bij het opslaan van het concept.',
    action: 'Probeer het opnieuw. Als het probleem aanhoudt, controleer uw internetverbinding.',
    retryable: true,
  },
  'load-draft': {
    title: 'Fout bij laden concept',
    message: 'Er is een fout opgetreden bij het laden van het concept.',
    action: 'Probeer het opnieuw. Als het probleem aanhoudt, kan het concept mogelijk niet worden gevonden.',
    retryable: false,
  },
};

/**
 * Default error message for unknown errors
 */
const defaultErrorMessage: ErrorMessageMap = {
  title: 'Fout opgetreden',
  message: 'Er is een onbekende fout opgetreden.',
  action: 'Probeer het opnieuw. Als het probleem aanhoudt, neem contact op met de beheerder.',
  retryable: true,
};

/**
 * Get error message by error code
 */
export function getErrorMessage(code: string): ErrorMessageMap {
  if (!code || typeof code !== 'string') {
    return defaultErrorMessage;
  }
  
  const errorMessage = errorMessages[code];
  if (errorMessage) {
    return errorMessage;
  }
  
  return defaultErrorMessage;
}

/**
 * Get error message by HTTP status code
 */
export function getErrorMessageForStatus(status: number): ErrorMessageMap {
  switch (status) {
    case 400:
      return errorMessages.BAD_REQUEST;
    case 401:
      return errorMessages.AUTHENTICATION_ERROR;
    case 403:
      return errorMessages.AUTHORIZATION_ERROR;
    case 404:
      return errorMessages.NOT_FOUND;
    case 409:
      return errorMessages.CONFLICT;
    case 422:
      return errorMessages.UNPROCESSABLE_ENTITY;
    case 429:
      return errorMessages.RATE_LIMIT_EXCEEDED;
    case 500:
      return errorMessages.INTERNAL_SERVER_ERROR;
    case 502:
    case 503:
      return errorMessages.SERVICE_UNAVAILABLE;
    default:
      return errorMessages.INTERNAL_SERVER_ERROR;
  }
}

/**
 * Get operation-specific error message
 */
export function getOperationErrorMessage(operation: string, errorCode?: string): ErrorMessageMap {
  if (!operation || typeof operation !== 'string') {
    return errorCode ? getErrorMessage(errorCode) : errorMessages.INTERNAL_SERVER_ERROR;
  }
  
  const operationMessage = operationErrorMessages[operation];
  if (operationMessage) {
    return operationMessage;
  }
  
  // If operation not found, try to use error code message
  if (errorCode) {
    return getErrorMessage(errorCode);
  }
  
  // Default to internal server error
  return errorMessages.INTERNAL_SERVER_ERROR;
}

/**
 * Format a user-friendly error message with context
 */
export function formatErrorMessage(
  error: Error | string,
  context?: ErrorContext
): string {
  const errorMessage = typeof error === 'string' ? error : error.message;
  
  // If context is provided, format with context
  if (context) {
    const { action, step, resource } = context;
    
    // Build contextual prefix
    let prefix = '';
    if (step) {
      prefix = `Stap ${step}: `;
    }
    if (action) {
      prefix += `${action}: `;
    }
    
    // Add resource context if available
    if (resource) {
      prefix = prefix.replace(action || '', `${action || 'Bewerking'} van ${resource}`);
    }
    
    return `${prefix}${errorMessage}`;
  }
  
  return errorMessage;
}

/**
 * Map technical error messages to user-friendly messages
 */
export function getUserFriendlyErrorMessage(
  error: Error | string,
  context?: ErrorContext
): string {
  let errorMessage = typeof error === 'string' ? error : error.message;
  
  // Translate [i18n:...] keys if present
  errorMessage = translateLogMessage(errorMessage);
  
  const lowerMessage = errorMessage.toLowerCase();
  
  // Network errors
  if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('connection')) {
    return t('errors.networkConnection');
  }
  
  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return t('errors.timeout');
  }
  
  // Validation errors
  if (lowerMessage.includes('validation') || lowerMessage.includes('invalid')) {
    if (context?.field) {
      return t('errors.validationWithField').replace('{{field}}', context.field);
    }
    return t('errors.validation');
  }
  
  // Not found errors
  if (lowerMessage.includes('not found') || lowerMessage.includes('niet gevonden')) {
    if (context?.resource) {
      return t('errors.resourceNotFound').replace('{{resource}}', context.resource);
    }
    return t('errors.notFound');
  }
  
  // Permission errors
  if (lowerMessage.includes('permission') || lowerMessage.includes('unauthorized') || lowerMessage.includes('toegang')) {
    return t('errors.permission');
  }
  
  // Server errors
  if (lowerMessage.includes('server error') || lowerMessage.includes('internal error') || lowerMessage.includes('500')) {
    return t('errors.serverError');
  }
  
  // Rate limiting
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    return t('errors.rateLimit');
  }
  
  // Default: return formatted message with context (already translated if it contained [i18n:...])
  return formatErrorMessage(errorMessage, context);
}

/**
 * Get actionable guidance for common errors
 */
export function getErrorGuidance(
  error: Error | string,
  context?: ErrorContext
): string | null {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const lowerMessage = errorMessage.toLowerCase();
  
  // Network errors
  if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
    return 'Controleer uw internetverbinding en probeer het opnieuw. Als het probleem aanhoudt, neem contact op met de ondersteuning.';
  }
  
  // Validation errors
  if (lowerMessage.includes('validation') || lowerMessage.includes('invalid')) {
    if (context?.field) {
      return `Controleer het veld "${context.field}" en zorg dat alle vereiste informatie is ingevuld.`;
    }
    return 'Controleer alle velden en zorg dat alle vereiste informatie is ingevuld.';
  }
  
  // Not found errors
  if (lowerMessage.includes('not found') || lowerMessage.includes('niet gevonden')) {
    return 'Controleer of de informatie correct is ingevoerd en probeer het opnieuw.';
  }
  
  // Server errors
  if (lowerMessage.includes('server error') || lowerMessage.includes('internal error')) {
    return 'Probeer het over een moment opnieuw. Als het probleem aanhoudt, neem contact op met de ondersteuning.';
  }
  
  return null;
}

/**
 * Format validation error with field context
 */
export function formatValidationError(
  field: string,
  error: string
): string {
  // Map common validation errors to user-friendly messages
  const lowerError = error.toLowerCase();
  
  if (lowerError.includes('required') || lowerError.includes('verplicht')) {
    return `${field} is verplicht`;
  }
  
  if (lowerError.includes('minimum') || lowerError.includes('minimaal')) {
    const match = error.match(/(\d+)/);
    if (match) {
      return `${field} moet minimaal ${match[1]} karakters bevatten`;
    }
  }
  
  if (lowerError.includes('maximum') || lowerError.includes('maximaal')) {
    const match = error.match(/(\d+)/);
    if (match) {
      return `${field} mag maximaal ${match[1]} karakters bevatten`;
    }
  }
  
  if (lowerError.includes('invalid') || lowerError.includes('ongeldig')) {
    return `${field} heeft een ongeldige waarde`;
  }
  
  // Return original error if no mapping found
  return error;
}

/**
 * Get error severity level for UI styling
 */
export type ErrorSeverity = 'error' | 'warning' | 'info';

export function getErrorSeverity(error: Error | string): ErrorSeverity {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const lowerMessage = errorMessage.toLowerCase();
  
  // Warnings (non-critical)
  if (lowerMessage.includes('warning') || lowerMessage.includes('waarschuwing')) {
    return 'warning';
  }
  
  // Info (informational)
  if (lowerMessage.includes('info') || lowerMessage.includes('informatie')) {
    return 'info';
  }
  
  // Default to error
  return 'error';
}
