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
export declare const scanParametersSchema: z.ZodObject<{
    overheidslaag: z.ZodString;
    entity: z.ZodString;
    zoeklocaties: z.ZodArray<z.ZodString, "many">;
    customUrl: z.ZodOptional<z.ZodString>;
    onderwerp: z.ZodOptional<z.ZodString>;
    thema: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    overheidslaag: string;
    entity: string;
    zoeklocaties: string[];
    onderwerp?: string | undefined;
    thema?: string | undefined;
    customUrl?: string | undefined;
}, {
    overheidslaag: string;
    entity: string;
    zoeklocaties: string[];
    onderwerp?: string | undefined;
    thema?: string | undefined;
    customUrl?: string | undefined;
}>;
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
export declare function normalizeScanParameters(params: ScanParameters): NormalizedScanParameters;
/**
 * Validates and normalizes ScanParameters
 *
 * @param params - The scan parameters to validate and normalize
 * @returns Validation result with normalized parameters if valid
 */
export declare function validateAndNormalizeScanParameters(params: unknown): {
    isValid: true;
    data: NormalizedScanParameters;
} | {
    isValid: false;
    error: string;
};
/**
 * Type guard to check if a value is a valid ScanParameters object
 */
export declare function isScanParameters(value: unknown): value is ScanParameters;
