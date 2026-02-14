/**
 * Validation utilities for business rules
 * Pure functions for validating user input and data
 */
export interface ValidationResult {
    isValid: boolean;
    error?: string;
}
/**
 * Validates a URL string
 * @param url - The URL string to validate
 * @returns Validation result with error message if invalid
 */
export declare function validateUrl(url: string): ValidationResult;
/**
 * Validates that a string is not empty
 * @param value - The string to validate
 * @param fieldName - Optional field name for error message
 * @returns Validation result
 */
export declare function validateRequired(value: string, fieldName?: string): ValidationResult;
/**
 * Validates that a value is within a range
 * @param value - The numeric value to validate
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns Validation result
 */
export declare function validateRange(value: number, min: number, max: number): ValidationResult;
/**
 * Validates email format
 * @param email - The email string to validate
 * @returns Validation result
 */
export declare function validateEmail(email: string): ValidationResult;
/**
 * Validates workflow parameters before sending to API
 *
 * Ensures required parameters (like onderwerp) are present and non-empty.
 * This provides early validation feedback before the API call, improving UX.
 *
 * @param workflowId - The workflow ID to validate parameters for
 * @param params - Workflow parameters (may contain legacy names like 'query' which maps to 'onderwerp')
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * const result = validateWorkflowParams('standard-scan', { onderwerp: 'klimaatadaptatie' });
 * if (!result.isValid) {
 *   toast.error('Validatiefout', result.error);
 *   return;
 * }
 * ```
 *
 * @remarks
 * - Workflows requiring onderwerp: standard-scan, bfs-3-hop, beleidsscan-graph,
 *   beleidsscan-wizard, external-links-exploration, horst-aan-de-maas,
 *   horst-labor-migration, and all workflows starting with 'beleidsscan-step-'
 * - The 'query' parameter (legacy) is automatically mapped to 'onderwerp' by the backend
 * - Maximum onderwerp length is 500 characters (backend validation)
 */
export declare function validateWorkflowParams(workflowId: string, params: Record<string, unknown>): ValidationResult;
