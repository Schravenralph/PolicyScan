/**
 * Draft Data Validation
 *
 * Validates draft data structure to ensure no translation keys are stored
 * in domain fields. This enforces the separation between domain data and
 * presentation (translation keys).
 */
import type { BeleidsscanDraft } from '../hooks/useDraftPersistence.js';
export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}
export interface ValidationError {
    field: string;
    message: string;
    value: unknown;
}
export interface ValidationWarning {
    field: string;
    message: string;
    value: unknown;
}
/**
 * Validate draft data structure
 *
 * Ensures:
 * - step is a number (1-3), never a string or translation key
 * - queryId is string | null, never a translation key
 * - selectedWebsites is string[], never contains translation keys
 * - All domain values are correct types
 */
export declare function validateDraftData(draft: BeleidsscanDraft): ValidationResult;
/**
 * Validate and log draft data (for development)
 *
 * Logs warnings/errors in development mode only
 */
export declare function validateDraftDataWithLogging(draft: BeleidsscanDraft, context?: string): boolean;
