/**
 * Type definitions and validation for ScanParameters
 * Ensures type safety with proper optional/nullable annotations and runtime validation
 */

import { z } from 'zod';

/**
 * ScanParameters interface with explicit optional properties
 * - onderwerp and thema are optional and may be undefined
 * - entity is required (used as fallback for onderwerp)
 */
export interface ScanParameters {
  /** Government layer (required) */
  overheidslaag: string;
  /** Entity name (required, used as fallback for onderwerp) */
  entity: string;
  /** Search locations (required, array of URLs) */
  zoeklocaties: string[];
  /** Custom URL (optional) */
  customUrl?: string;
  /** Subject/topic (optional) */
  onderwerp?: string;
  /** Theme (optional) */
  thema?: string;
}

/**
 * Zod schema for runtime validation of ScanParameters
 */
export const scanParametersSchema = z.object({
  overheidslaag: z.string().min(1, 'Overheidslaag is verplicht'),
  entity: z.string().min(1, 'Entity is verplicht'),
  zoeklocaties: z.array(z.string().url('Elke zoeklocatie moet een geldige URL zijn')).min(1, 'Minimaal één zoeklocatie is vereist'),
  customUrl: z.string().url('Custom URL moet een geldige URL zijn').optional(),
  onderwerp: z.string().optional(),
  thema: z.string().optional(),
});

/**
 * Normalized ScanParameters with defaults for optional properties
 * This ensures we always have string values instead of undefined
 */
export interface NormalizedScanParameters {
  overheidslaag: string;
  entity: string;
  zoeklocaties: string[];
  customUrl: string;
  onderwerp: string;
  thema: string;
}

/**
 * Normalizes ScanParameters by providing default values for optional properties
 * - onderwerp defaults to entity if not provided
 * - thema defaults to empty string
 * - customUrl defaults to empty string
 * 
 * @param params - The scan parameters to normalize
 * @returns Normalized scan parameters with all properties as strings
 */
export function normalizeScanParameters(params: ScanParameters): NormalizedScanParameters {
  return {
    overheidslaag: params.overheidslaag,
    entity: params.entity,
    zoeklocaties: params.zoeklocaties,
    customUrl: params.customUrl ?? '',
    // Use onderwerp if provided, otherwise fall back to entity (which is required, so always present)
    onderwerp: params.onderwerp ?? params.entity,
    thema: params.thema ?? '',
  };
}

/**
 * Validates and normalizes ScanParameters
 * 
 * @param params - The scan parameters to validate and normalize
 * @returns Validation result with normalized parameters if valid
 */
export function validateAndNormalizeScanParameters(
  params: unknown
): { isValid: true; data: NormalizedScanParameters } | { isValid: false; error: string } {
  try {
    const validated = scanParametersSchema.parse(params);
    const normalized = normalizeScanParameters(validated);
    return { isValid: true, data: normalized };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      return {
        isValid: false,
        error: firstError?.message ?? 'Ongeldige scan parameters',
      };
    }
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Onbekende validatiefout',
    };
  }
}

/**
 * Type guard to check if a value is a valid ScanParameters object
 */
export function isScanParameters(value: unknown): value is ScanParameters {
  try {
    scanParametersSchema.parse(value);
    return true;
  } catch {
    return false;
  }
}

