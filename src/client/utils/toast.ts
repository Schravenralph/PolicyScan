import { toast as sonnerToast } from 'sonner';
import { ErrorWithRetry } from './errorHandler';
import { translateLogMessage } from './logTranslations';
import { t } from './i18n';

/**
 * Translate a message using translateLogMessage for consistency
 * This ensures all translation logic (i18n keys, patterns, etc.) is applied
 */
function translateMessage(message: string): string {
  return translateLogMessage(message);
}

/**
 * Toast notification utility
 * Replaces alert() calls with user-friendly toast notifications
 * Automatically translates [i18n:...] keys in messages
 */
export const toast = {
  success: (message: string, description?: string) => {
    const translatedMessage = translateMessage(message);
    const translatedDescription = description ? translateMessage(description) : undefined;
    sonnerToast.success(translatedMessage, {
      description: translatedDescription,
      duration: 4000,
    });
  },

  error: (message: string, description?: string, onRetry?: () => void) => {
    const translatedMessage = translateMessage(message);
    const translatedDescription = description ? translateMessage(description) : undefined;
    sonnerToast.error(translatedMessage, {
      description: translatedDescription,
      duration: 8000,
      action: onRetry ? {
        label: t('common.retry'),
        onClick: onRetry,
      } : undefined,
    });
  },

  errorWithRetry: (errorInfo: ErrorWithRetry) => {
    const translatedTitle = translateMessage(errorInfo.title);
    const translatedMessage = translateMessage(errorInfo.message);
    const translatedAction = errorInfo.action ? translateMessage(errorInfo.action) : undefined;
    sonnerToast.error(translatedTitle, {
      description: `${translatedMessage}${translatedAction ? ` ${translatedAction}` : ''}`,
      duration: errorInfo.retryable ? 10000 : 6000,
      action: errorInfo.retryable && errorInfo.onRetry ? {
        label: t('common.retry'),
        onClick: () => {
          if (errorInfo.onRetry) {
            errorInfo.onRetry();
          }
        },
      } : undefined,
    });
  },

  info: (message: string, description?: string) => {
    const translatedMessage = translateMessage(message);
    const translatedDescription = description ? translateMessage(description) : undefined;
    sonnerToast.info(translatedMessage, {
      description: translatedDescription,
      duration: 4000,
    });
  },

  warning: (message: string, description?: string) => {
    const translatedMessage = translateMessage(message);
    const translatedDescription = description ? translateMessage(description) : undefined;
    sonnerToast.warning(translatedMessage, {
      description: translatedDescription,
      duration: 5000,
    });
  },

  loading: (message: string) => {
    const translatedMessage = translateMessage(message);
    return sonnerToast.loading(translatedMessage);
  },

  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: unknown) => string);
    }
  ) => {
    // Translate static messages, function messages will be translated when called
    const translatedMessages = {
      loading: typeof messages.loading === 'string' ? translateMessage(messages.loading) : messages.loading,
      success: typeof messages.success === 'string' 
        ? translateMessage(messages.success)
        : typeof messages.success === 'function'
          ? (data: T) => {
              const successFn = messages.success as (data: T) => string;
              return translateMessage(successFn(data));
            }
          : messages.success,
      error: typeof messages.error === 'string'
        ? translateMessage(messages.error)
        : typeof messages.error === 'function'
          ? (error: unknown) => {
              const errorFn = messages.error as (error: unknown) => string;
              return translateMessage(errorFn(error));
            }
          : messages.error,
    };
    return sonnerToast.promise(promise, translatedMessages);
  },
};

