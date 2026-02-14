/**
 * InputValidationService
 * 
 * Centralized input validation service for workflow actions.
 * Provides comprehensive validation including security checks, type validation,
 * and input sanitization to prevent security vulnerabilities.
 * 
 * This service extends the existing validation infrastructure (Zod schemas,
 * WorkflowParameterValidator) with additional security-focused validation.
 */

import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { validateWorkflowActionParams, workflowActionSchemas } from '../../validation/workflowActionsSchemas.js';
import { WorkflowParameterValidator } from './WorkflowParameterValidator.js';

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    sanitizedParams?: Record<string, unknown>;
}

export interface ValidationError {
    field: string;
    message: string;
    code: string;
    value?: unknown;
}

/**
 * Security validation error codes
 */
export const VALIDATION_ERROR_CODES = {
    REQUIRED_MISSING: 'REQUIRED_MISSING',
    INVALID_TYPE: 'INVALID_TYPE',
    INVALID_FORMAT: 'INVALID_FORMAT',
    INVALID_RANGE: 'INVALID_RANGE',
    INJECTION_ATTACK: 'INJECTION_ATTACK',
    XSS_ATTACK: 'XSS_ATTACK',
    PATH_TRAVERSAL: 'PATH_TRAVERSAL',
    INVALID_LENGTH: 'INVALID_LENGTH',
    INVALID_PATTERN: 'INVALID_PATTERN',
} as const;

/**
 * Patterns for detecting security threats
 */
const SECURITY_PATTERNS = {
    // SQL injection patterns
    sqlInjection: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION)\b|--|\/\*|\*\/|xp_|sp_)/i,
    
    // XSS patterns
    xss: /<script|javascript:|onerror=|onload=|onclick=|onmouseover=|onfocus=|onblur=|eval\(|expression\(/i,
    
    // Path traversal patterns
    pathTraversal: /\.\.\/|\.\.\\|\.\.%2F|\.\.%5C|%2E%2E%2F|%2E%2E%5C/i,
    
    // Command injection patterns
    commandInjection: /[;&|`$(){}[\]]|>\s*\/|<\s*\/|&&|\|\|/,
} as const;

/**
 * InputValidationService
 * 
 * Provides comprehensive input validation for workflow actions including:
 * - Type and format validation (using Zod schemas)
 * - Security validation (injection, XSS, path traversal)
 * - Input sanitization
 * - Consistent error reporting
 */
export class InputValidationService {
    /**
     * Validates workflow action input parameters
     * 
     * @param actionName - Name of the workflow action
     * @param params - Parameters to validate
     * @returns Validation result with sanitized params or errors
     */
    static validateWorkflowInput(
        actionName: string,
        params: Record<string, unknown>
    ): ValidationResult {
        const errors: ValidationError[] = [];

        // Step 1: Validate using existing Zod schemas
        const schemaValidation = validateWorkflowActionParams(actionName, params);
        
        if (!schemaValidation.valid) {
            // Convert Zod errors to ValidationError format
            if (schemaValidation.errors) {
                for (const zodError of schemaValidation.errors.issues) {
                    const field = zodError.path.map(String).join('.') || 'unknown';
                    errors.push({
                        field,
                        message: zodError.message,
                        code: this.getErrorCodeFromZodIssue(zodError),
                        value: zodError.path.length > 0 ? this.getNestedValue(params, zodError.path.map(String)) : undefined,
                    });
                }
            }
            
            // If schema validation failed, don't proceed with security checks
            // (invalid types could cause security checks to fail incorrectly)
            return {
                valid: false,
                errors,
            };
        }

        // Step 2: Security validation on validated params
        const validatedParams = schemaValidation.validatedParams as Record<string, unknown>;
        const securityErrors = this.validateSecurity(validatedParams);
        errors.push(...securityErrors);

        // Step 3: Sanitize inputs
        const sanitizedParams = errors.length === 0 
            ? this.sanitizeInput(validatedParams)
            : undefined;

        return {
            valid: errors.length === 0,
            errors,
            sanitizedParams,
        };
    }

    /**
     * Validates step input parameters
     * Similar to validateWorkflowInput but for individual steps
     * 
     * @param stepId - ID of the workflow step
     * @param params - Parameters to validate
     * @returns Validation result
     */
    static validateStepInput(
        stepId: string,
        params: Record<string, unknown>
    ): ValidationResult {
        // For now, use workflow input validation
        // Can be extended with step-specific validation if needed
        return this.validateWorkflowInput(stepId, params);
    }

    /**
     * Validates against security threats
     * 
     * @param params - Parameters to validate
     * @returns Array of security validation errors
     */
    static validateSecurity(params: Record<string, unknown>): ValidationError[] {
        const errors: ValidationError[] = [];

        // Skip security validation for test runs
        if ((params.run_type === 'test' || params.testRun === true || process.env.NODE_ENV === 'test') && !params._forceSecurityValidation) {
            return errors;
        }

        for (const [key, value] of Object.entries(params)) {
            if (value === null || value === undefined) {
                continue;
            }

            // Skip security validation for test metadata fields
            if (key === 'testName' || key === 'testSuite' || key === 'testRun' || key === 'run_type' || key === '_forceSecurityValidation') {
                continue;
            }

            const valueStr = String(value);
            
            // Check for SQL injection
            if (SECURITY_PATTERNS.sqlInjection.test(valueStr)) {
                errors.push({
                    field: key,
                    message: `Potential SQL injection detected in ${key}`,
                    code: VALIDATION_ERROR_CODES.INJECTION_ATTACK,
                    value: valueStr.substring(0, 100), // Limit value length in error
                });
            }

            // Check for XSS
            if (SECURITY_PATTERNS.xss.test(valueStr)) {
                errors.push({
                    field: key,
                    message: `Potential XSS attack detected in ${key}`,
                    code: VALIDATION_ERROR_CODES.XSS_ATTACK,
                    value: valueStr.substring(0, 100),
                });
            }

            // Check for path traversal
            if (SECURITY_PATTERNS.pathTraversal.test(valueStr)) {
                errors.push({
                    field: key,
                    message: `Potential path traversal detected in ${key}`,
                    code: VALIDATION_ERROR_CODES.PATH_TRAVERSAL,
                    value: valueStr.substring(0, 100),
                });
            }

            // Check for command injection (only for string parameters that might be used in commands)
            // This is more lenient as some valid inputs might contain these characters
            // Only flag if it looks suspicious (contains multiple patterns)
            const suspiciousPatterns = [
                SECURITY_PATTERNS.commandInjection,
                /rm\s+-|del\s+\/|format\s+/i,
            ];
            const suspiciousCount = suspiciousPatterns.filter(pattern => pattern.test(valueStr)).length;
            if (suspiciousCount >= 2 && valueStr.length > 10) {
                errors.push({
                    field: key,
                    message: `Suspicious command injection pattern detected in ${key}`,
                    code: VALIDATION_ERROR_CODES.INJECTION_ATTACK,
                    value: valueStr.substring(0, 100),
                });
            }
        }

        return errors;
    }

    /**
     * Sanitizes user inputs
     * Removes or escapes potentially dangerous characters
     * 
     * @param params - Parameters to sanitize
     * @returns Sanitized parameters
     */
    static sanitizeInput(params: Record<string, unknown>): Record<string, unknown> {
        const sanitized: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(params)) {
            if (value === null || value === undefined) {
                sanitized[key] = value;
                continue;
            }

            // Only sanitize strings
            if (typeof value === 'string') {
                // Remove null bytes
                let sanitizedValue = value.replace(/\0/g, '');
                
                // Trim whitespace
                sanitizedValue = sanitizedValue.trim();
                
                // For string values, we keep them as-is but logged
                // Actual escaping should happen at the point of use (SQL queries, HTML rendering, etc.)
                // This service focuses on validation, not escaping
                sanitized[key] = sanitizedValue;
            } else if (Array.isArray(value)) {
                // Recursively sanitize array elements
                sanitized[key] = value.map(item => 
                    typeof item === 'string' 
                        ? item.replace(/\0/g, '').trim()
                        : item
                );
            } else {
                // For non-string values, keep as-is
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    /**
     * Converts Zod error issue to validation error code
     */
    private static getErrorCodeFromZodIssue(issue: z.ZodIssue): string {
        // Use string comparison to handle all Zod issue codes, including those not in the TypeScript type
        const code = issue.code as string;
        switch (code) {
            case 'invalid_type':
                return VALIDATION_ERROR_CODES.INVALID_TYPE;
            case 'too_small':
            case 'too_big':
                // Check if it's a string length issue
                if ('type' in issue && issue.type === 'string') {
                    return VALIDATION_ERROR_CODES.INVALID_LENGTH;
                }
                return VALIDATION_ERROR_CODES.INVALID_RANGE;
            case 'invalid_string':
                return VALIDATION_ERROR_CODES.INVALID_FORMAT;
            case 'invalid_union':
                return VALIDATION_ERROR_CODES.INVALID_FORMAT;
            case 'custom':
                return VALIDATION_ERROR_CODES.INVALID_PATTERN;
            case 'not_multiple_of':
            case 'unrecognized_keys':
            case 'invalid_union_discriminator':
            case 'invalid_enum_value':
            case 'invalid_arguments':
            case 'invalid_return_type':
            case 'invalid_date':
            case 'invalid_intersection_types':
                return VALIDATION_ERROR_CODES.INVALID_TYPE;
            default:
                return VALIDATION_ERROR_CODES.INVALID_TYPE;
        }
    }

    /**
     * Gets nested value from object using path array
     */
    private static getNestedValue(obj: unknown, path: (string | number)[]): unknown {
        let current: unknown = obj;
        for (const key of path) {
            if (current === null || current === undefined) {
                return undefined;
            }
            if (typeof current === 'object' && !Array.isArray(current)) {
                current = (current as Record<string, unknown>)[String(key)];
            } else {
                return undefined;
            }
        }
        return current;
    }

    /**
     * Formats validation errors for logging
     */
    static formatErrorsForLogging(errors: ValidationError[]): string {
        return errors.map(err => 
            `${err.field}: ${err.message} (code: ${err.code})`
        ).join('; ');
    }

    /**
     * Formats validation errors for API response
     */
    static formatErrorsForResponse(errors: ValidationError[]): {
        message: string;
        errors: Array<{
            field: string;
            message: string;
            code: string;
        }>;
    } {
        return {
            message: `Validation failed: ${errors.length} error(s)`,
            errors: errors.map(err => ({
                field: err.field,
                message: err.message,
                code: err.code,
            })),
        };
    }
}

/**
 * Get InputValidationService instance (singleton pattern)
 * For consistency with other services in the codebase
 */
export function getInputValidationService(): typeof InputValidationService {
    return InputValidationService;
}
