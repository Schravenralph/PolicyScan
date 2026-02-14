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
export declare const queryConfigurationInputSchema: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodObject<{
    overheidslaag: z.ZodString;
    entity: z.ZodOptional<z.ZodString>;
    onderwerp: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    onderwerp: string;
    overheidslaag: string;
    entity?: string | undefined;
}, {
    onderwerp: string;
    overheidslaag: string;
    entity?: string | undefined;
}>, {
    onderwerp: string;
    overheidslaag: string;
    entity?: string | undefined;
}, {
    onderwerp: string;
    overheidslaag: string;
    entity?: string | undefined;
}>, {
    onderwerp: string;
    overheidslaag: string;
    entity?: string | undefined;
}, {
    onderwerp: string;
    overheidslaag: string;
    entity?: string | undefined;
}>, {
    onderwerp: string;
    overheidslaag: string;
    entity?: string | undefined;
}, {
    onderwerp: string;
    overheidslaag: string;
    entity?: string | undefined;
}>;
/**
 * Validate query configuration input offline (client-side)
 *
 * @param input - The input to validate
 * @returns Validation result with field-specific errors
 */
export declare function validateQueryConfigurationInput(input: unknown): {
    isValid: boolean;
    errors?: Record<string, string>;
};
/**
 * Get field-specific error message from validation result
 */
export declare function getFieldError(errors: Record<string, string> | undefined, fieldName: string): string | undefined;
