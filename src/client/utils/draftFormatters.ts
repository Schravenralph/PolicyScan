/**
 * Draft Field Formatters
 * 
 * Explicit mapping from domain values to translated strings.
 * This enforces the separation between domain data (numbers, booleans, enums)
 * and presentation (translated strings).
 */

import { t, type TranslationKey } from './i18n.js';

/**
 * Format step number to translated string
 * 
 * @param step - Step number (1, 2, or 3)
 * @returns Translated step name
 */
export function formatStep(step: number): string {
  const stepNames: Record<number, TranslationKey> = {
    1: 'draftManagement.step1',
    2: 'draftManagement.step2',
    3: 'draftManagement.step3',
  };

  const key = stepNames[step];
  if (key) {
    return t(key);
  }

  // Fallback for invalid step numbers
  return `Stap ${step}`;
}

/**
 * Format website count with proper pluralization
 * 
 * @param count - Number of websites
 * @returns Formatted string with proper pluralization
 */
export function formatWebsiteCount(count: number): string {
  if (count === 0) {
    return t('common.noWebsites');
  }

  // Use proper pluralization
  const websiteKey: TranslationKey = count === 1 ? 'common.website' : 'common.websites';
  return `${count} ${t(websiteKey)}`;
}

/**
 * Format queryId for display
 * 
 * @param queryId - Query ID string or null
 * @returns Query ID string or "Not set" translation
 */
export function formatQueryId(queryId: string | null | undefined): string {
  if (queryId === null || queryId === undefined || queryId === '') {
    return t('common.notSet');
  }
  return queryId;
}

/**
 * Format field value based on field name
 * 
 * This is the main formatter that routes to specific formatters
 * based on the field name. Use this for generic field formatting.
 * 
 * @param field - Field name
 * @param value - Field value
 * @returns Formatted string for display
 */
export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined) {
    return t('common.notSet');
  }

  switch (field) {
    case 'step': {
      if (typeof value === 'number') {
        return formatStep(value);
      }
      return String(value);
    }

    case 'selectedWebsites': {
      if (Array.isArray(value)) {
        return formatWebsiteCount(value.length);
      }
      if (typeof value === 'number') {
        return formatWebsiteCount(value);
      }
      if (typeof value === 'string') {
        // Try to extract number from string (legacy format like "1 common.website")
        const numMatch = value.match(/^(\d+)/);
        if (numMatch) {
          return formatWebsiteCount(Number(numMatch[1]));
        }
        // Try to parse as number
        const numValue = Number(value);
        if (!isNaN(numValue)) {
          return formatWebsiteCount(numValue);
        }
      }
      return String(value);
    }

    case 'queryId': {
      if (typeof value === 'string' || value === null) {
        return formatQueryId(value);
      }
      return String(value);
    }

    default:
      // For unknown fields, return string representation
      return String(value);
  }
}
