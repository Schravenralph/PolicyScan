import { ErrorWithRetry } from './errorHandler';
/**
 * Toast notification utility
 * Replaces alert() calls with user-friendly toast notifications
 * Automatically translates [i18n:...] keys in messages
 */
export declare const toast: {
    success: (message: string, description?: string) => void;
    error: (message: string, description?: string, onRetry?: () => void) => void;
    errorWithRetry: (errorInfo: ErrorWithRetry) => void;
    info: (message: string, description?: string) => void;
    warning: (message: string, description?: string) => void;
    loading: (message: string) => string | number;
    promise: <T>(promise: Promise<T>, messages: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((error: unknown) => string);
    }) => (string & {
        unwrap: () => Promise<T>;
    }) | (number & {
        unwrap: () => Promise<T>;
    }) | {
        unwrap: () => Promise<T>;
    };
};
