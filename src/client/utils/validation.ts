/**
 * Validation utilities for business rules
 * Pure functions for validating user input and data
 */

import { t } from './i18n.js';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates a URL string
 * @param url - The URL string to validate
 * @returns Validation result with error message if invalid
 */
export function validateUrl(url: string): ValidationResult {
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return {
      isValid: false,
      error: t('errors.validation.invalidUrl'),
    };
  }

  try {
    const urlObj = new URL(url);
    // Only allow http and https schemes
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return {
        isValid: false,
        error: t('errors.validation.onlyHttpHttps'),
      };
    }
    return { isValid: true };
  } catch (_error) {
    return {
      isValid: false,
      error: t('errors.validation.invalidUrl'),
    };
  }
}

/**
 * Validates that a string is not empty
 * @param value - The string to validate
 * @param fieldName - Optional field name for error message
 * @returns Validation result
 */
export function validateRequired(value: string, fieldName?: string): ValidationResult {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    const defaultFieldName = fieldName || t('errors.validation.fieldName');
    return {
      isValid: false,
      error: t('errors.validation.fieldRequired').replace('{{fieldName}}', defaultFieldName),
    };
  }
  return { isValid: true };
}

/**
 * Validates that a value is within a range
 * @param value - The numeric value to validate
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns Validation result
 */
export function validateRange(value: number, min: number, max: number): ValidationResult {
  if (typeof value !== 'number' || isNaN(value)) {
    return {
      isValid: false,
      error: t('errors.validation.valueMustBeNumber'),
    };
  }
  if (value < min || value > max) {
    return {
      isValid: false,
      error: t('errors.validation.valueMustBeBetween').replace('{{min}}', String(min)).replace('{{max}}', String(max)),
    };
  }
  return { isValid: true };
}

/**
 * Validates email format
 * @param email - The email string to validate
 * @returns Validation result
 */
export function validateEmail(email: string): ValidationResult {
  if (!email || typeof email !== 'string') {
    return {
      isValid: false,
      error: t('errors.validation.invalidEmail'),
    };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      isValid: false,
      error: t('errors.validation.invalidEmail'),
    };
  }
  return { isValid: true };
}

import { WORKFLOWS } from '../config/constants';

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
export function validateWorkflowParams(
  workflowId: string,
  params: Record<string, unknown>
): ValidationResult {
  // Check if workflow requires onderwerp
  const requiresOnderwerp = 
    workflowId.startsWith(WORKFLOWS.BELEIDSSCAN_STEP_PREFIX) || 
    WORKFLOWS.REQUIRING_ONDERWERP.includes(workflowId as typeof WORKFLOWS.REQUIRING_ONDERWERP[number]);
  
  if (requiresOnderwerp) {
    // Check for onderwerp (standard) or query (legacy, maps to onderwerp)
    const onderwerp = params.onderwerp || params.query;
    
    if (!onderwerp || (typeof onderwerp === 'string' && !onderwerp.trim())) {
      return {
        isValid: false,
        error: t('errors.validation.workflowRequiresSubject'),
      };
    }
    
    // Validate length (backend allows max 500 characters)
    if (typeof onderwerp === 'string' && onderwerp.trim().length > 500) {
      return {
        isValid: false,
        error: t('errors.validation.subjectMaxLength'),
      };
    }
  }
  
  return { isValid: true };
}

