/**
 * Validation utilities for Beleidsscan component
 */
import type { WebsiteType } from './types';
export interface ValidationErrors {
    onderwerp?: string;
    overheidslaag?: string;
    selectedEntity?: string;
}
/**
 * Validate onderwerp (subject) field
 */
export declare const validateOnderwerp: (value: string) => string | undefined;
/**
 * Validate overheidslaag (government layer) selection
 */
export declare const validateOverheidslaag: (overheidslaag: WebsiteType | null) => string | undefined;
/**
 * Validate entity selection (if required)
 */
export declare const validateEntity: (overheidslaag: WebsiteType | null, selectedEntity: string) => string | undefined;
/**
 * Validate entire form
 */
export declare const validateForm: (onderwerp: string, overheidslaag: WebsiteType | null, selectedEntity: string) => {
    isValid: boolean;
    errors: ValidationErrors;
};
/**
 * Check if step 1 can proceed (all required fields are valid)
 */
export declare const canProceedStep1: (overheidslaag: WebsiteType | null, selectedEntity: string, onderwerp: string) => boolean;
/**
 * Get character counter color based on onderwerp length
 */
export declare const getCharacterCounterColor: (onderwerp: string) => string;
