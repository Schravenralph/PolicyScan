/**
 * Transformation Validation - Validates data before and after transformation
 *
 * Provides utilities for validating input and output data structures
 * to prevent transformation errors and data loss.
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Validate BronWebsite structure before transformation
 */
export declare function validateBronWebsite(website: unknown): ValidationResult;
/**
 * Validate CanonicalDocument structure before transformation
 */
export declare function validateCanonicalDocument(doc: unknown): ValidationResult;
/**
 * Validate Bron structure after transformation
 */
export declare function validateBron(bron: unknown): ValidationResult;
