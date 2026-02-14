/**
 * Context Validation - Validates context state structure and integrity
 *
 * Provides utilities for validating context state to prevent corruption
 * and ensure data integrity.
 */
import type { BeleidsscanDraft } from '../hooks/useDraftPersistence';
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Validate context state structure
 */
export declare function validateContextState(state: unknown): ValidationResult;
/**
 * Sanitize context state by removing invalid fields
 */
export declare function sanitizeContextState(state: unknown): BeleidsscanDraft | null;
