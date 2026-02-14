/**
 * Client-side validation schemas for wizard steps
 * 
 * These schemas mirror the server-side schemas to enable offline validation.
 * They must be kept in sync with src/server/services/wizard/definitions/schemas.ts
 */

import { z } from 'zod';

/**
 * Query Configuration Input Schema (client-side)
 * Mirrors queryConfigurationInputSchema from server
 */
export const queryConfigurationInputSchema = z.object({
  overheidslaag: z.string().min(1, 'Overheidslaag is verplicht'),
  entity: z.string().optional(),
  onderwerp: z.string().min(1, 'Onderwerp is verplicht').transform((val) => val.trim()),
}).refine(
  (data) => {
    // entity is required unless overheidslaag === 'kennisinstituut'
    if (data.overheidslaag !== 'kennisinstituut' && !data.entity) {
      return false;
    }
    return true;
  },
  {
    message: 'Instantie is verplicht tenzij overheidslaag "kennisinstituut" is',
    path: ['entity'],
  }
).refine(
  (data) => {
    // onderwerp must be at least 3 characters after trim
    const trimmed = data.onderwerp.trim();
    return trimmed.length >= 3;
  },
  {
    message: 'Onderwerp moet minimaal 3 karakters bevatten',
    path: ['onderwerp'],
  }
).refine(
  (data) => {
    // onderwerp must not exceed 500 characters
    const trimmed = data.onderwerp.trim();
    return trimmed.length <= 500;
  },
  {
    message: 'Onderwerp mag maximaal 500 karakters bevatten',
    path: ['onderwerp'],
  }
);

/**
 * Validate query configuration input offline (client-side)
 * 
 * @param input - The input to validate
 * @returns Validation result with field-specific errors
 */
export function validateQueryConfigurationInput(input: unknown): {
  isValid: boolean;
  errors?: Record<string, string>;
} {
  try {
    queryConfigurationInputSchema.parse(input);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.issues.forEach((issue) => {
        const path = issue.path.join('.');
        if (path) {
          errors[path] = issue.message;
        }
      });
      return { isValid: false, errors };
    }
    return { isValid: false, errors: { _general: 'Validatiefout opgetreden' } };
  }
}

/**
 * Get field-specific error message from validation result
 */
export function getFieldError(
  errors: Record<string, string> | undefined,
  fieldName: string
): string | undefined {
  return errors?.[fieldName];
}


