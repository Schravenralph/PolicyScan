/**
 * Draft Data Validation
 * 
 * Validates draft data structure to ensure no translation keys are stored
 * in domain fields. This enforces the separation between domain data and
 * presentation (translation keys).
 */

import type { BeleidsscanDraft } from '../hooks/useDraftPersistence.js';
import { isTranslationKey } from '../i18n/keys.js';

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
export function validateDraftData(draft: BeleidsscanDraft): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate step field
  if ('step' in draft && draft.step !== undefined) {
    const step = draft.step;
    
    if (typeof step === 'string') {
      if (isTranslationKey(step)) {
        errors.push({
          field: 'step',
          message: `Step field contains translation key: "${step}". Expected number (1-3).`,
          value: step,
        });
      } else {
        // Try to parse as number
        const numValue = Number(step);
        if (isNaN(numValue)) {
          errors.push({
            field: 'step',
            message: `Step field is invalid string: "${step}". Expected number (1-3).`,
            value: step,
          });
        } else if (numValue < 1 || numValue > 3) {
          errors.push({
            field: 'step',
            message: `Step value out of range: ${numValue}. Expected 1-3.`,
            value: step,
          });
        } else {
          warnings.push({
            field: 'step',
            message: `Step field is string "${step}" but should be number ${numValue}. Consider migrating.`,
            value: step,
          });
        }
      }
    } else if (typeof step === 'number') {
      if (step < 1 || step > 3) {
        errors.push({
          field: 'step',
          message: `Step value out of range: ${step}. Expected 1-3.`,
          value: step,
        });
      }
    } else if (step !== null) {
      errors.push({
        field: 'step',
        message: `Step field has invalid type: ${typeof step}. Expected number (1-3) or undefined.`,
        value: step,
      });
    }
  }

  // Validate queryId field
  if ('queryId' in draft && draft.queryId !== undefined && draft.queryId !== null) {
    const queryId = draft.queryId;
    
    if (typeof queryId === 'string') {
      if (isTranslationKey(queryId)) {
        errors.push({
          field: 'queryId',
          message: `queryId field contains translation key: "${queryId}". Expected string ID or null.`,
          value: queryId,
        });
      }
    } else {
      errors.push({
        field: 'queryId',
        message: `queryId field has invalid type: ${typeof queryId}. Expected string | null.`,
        value: queryId,
      });
    }
  }

  // Validate selectedWebsites field
  if ('selectedWebsites' in draft && draft.selectedWebsites !== undefined) {
    const websites = draft.selectedWebsites;
    
    if (!Array.isArray(websites)) {
      errors.push({
        field: 'selectedWebsites',
        message: `selectedWebsites field is not an array. Expected string[].`,
        value: websites,
      });
    } else {
      // Check each item in the array
      websites.forEach((item, index) => {
        if (typeof item === 'string') {
          if (isTranslationKey(item)) {
            errors.push({
              field: `selectedWebsites[${index}]`,
              message: `selectedWebsites array contains translation key at index ${index}: "${item}". Expected website URL string.`,
              value: item,
            });
          }
        } else if (typeof item !== 'string') {
          errors.push({
            field: `selectedWebsites[${index}]`,
            message: `selectedWebsites array contains invalid type at index ${index}: ${typeof item}. Expected string.`,
            value: item,
          });
        }
      });
    }
  }

  // Validate other string fields that shouldn't contain translation keys
  const stringFields: (keyof BeleidsscanDraft)[] = [
    'overheidslaag',
    'selectedEntity',
    'onderwerp',
    'websiteSearchQuery',
    'websiteFilterType',
    'documentSearchQuery',
    'documentTypeFilter',
    'documentWebsiteFilter',
  ];

  for (const field of stringFields) {
    if (field in draft && draft[field] !== undefined && draft[field] !== null) {
      const value = draft[field];
      if (typeof value === 'string' && isTranslationKey(value)) {
        warnings.push({
          field,
          message: `Field "${field}" contains what appears to be a translation key: "${value}". This may be intentional for UI config, but verify it's not domain data.`,
          value,
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate and log draft data (for development)
 * 
 * Logs warnings/errors in development mode only
 */
export function validateDraftDataWithLogging(
  draft: BeleidsscanDraft,
  context: string = 'draft validation'
): boolean {
  const result = validateDraftData(draft);

  if (result.errors.length > 0 || result.warnings.length > 0) {
    if (import.meta.env.DEV) {
      console.group(`⚠️  Draft Validation: ${context}`);
      
      if (result.errors.length > 0) {
        console.error('Errors:');
        result.errors.forEach((error) => {
          console.error(`  - ${error.field}: ${error.message}`, error.value);
        });
      }
      
      if (result.warnings.length > 0) {
        console.warn('Warnings:');
        result.warnings.forEach((warning) => {
          console.warn(`  - ${warning.field}: ${warning.message}`, warning.value);
        });
      }
      
      console.groupEnd();
    }
  }

  return result.isValid;
}
