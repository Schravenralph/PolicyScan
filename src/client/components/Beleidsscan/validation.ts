/**
 * Validation utilities for Beleidsscan component
 */

import type { WebsiteType } from './types';
import { ACCESSIBLE_COLORS } from '../../constants/colors';

export interface ValidationErrors {
  onderwerp?: string;
  overheidslaag?: string;
  selectedEntity?: string;
}

/**
 * Validate onderwerp (subject) field
 */
export const validateOnderwerp = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Onderwerp is verplicht';
  } else if (trimmed.length < 3) {
    return 'Onderwerp moet minimaal 3 karakters bevatten';
  } else if (trimmed.length > 500) {
    return 'Onderwerp mag maximaal 500 karakters bevatten';
  }
  return undefined;
};

/**
 * Validate overheidslaag (government layer) selection
 */
export const validateOverheidslaag = (overheidslaag: WebsiteType | null): string | undefined => {
  if (!overheidslaag) {
    return 'Selecteer een overheidslaag';
  }
  return undefined;
};

/**
 * Validate entity selection (if required)
 */
export const validateEntity = (
  overheidslaag: WebsiteType | null,
  selectedEntity: string
): string | undefined => {
  if (overheidslaag && overheidslaag !== 'kennisinstituut' && selectedEntity.trim().length === 0) {
    return 'Selecteer een instantie';
  }
  return undefined;
};

/**
 * Validate entire form
 */
export const validateForm = (
  onderwerp: string,
  overheidslaag: WebsiteType | null,
  selectedEntity: string
): { isValid: boolean; errors: ValidationErrors } => {
  const errors: ValidationErrors = {};
  
  const onderwerpError = validateOnderwerp(onderwerp);
  if (onderwerpError) {
    errors.onderwerp = onderwerpError;
  }
  
  const overheidslaagError = validateOverheidslaag(overheidslaag);
  if (overheidslaagError) {
    errors.overheidslaag = overheidslaagError;
  }
  
  const entityError = validateEntity(overheidslaag, selectedEntity);
  if (entityError) {
    errors.selectedEntity = entityError;
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Check if step 1 can proceed (all required fields are valid)
 */
export const canProceedStep1 = (
  overheidslaag: WebsiteType | null,
  selectedEntity: string,
  onderwerp: string
): boolean => {
  return (
    overheidslaag !== null &&
    (overheidslaag === 'kennisinstituut' || selectedEntity.trim().length > 0) &&
    onderwerp.trim().length >= 3
  );
};

/**
 * Get character counter color based on onderwerp length
 */
export const getCharacterCounterColor = (onderwerp: string): string => {
  if (!onderwerp) return ACCESSIBLE_COLORS.goldText;
  if (onderwerp.length < 3) return '#F37021';
  if (onderwerp.length > 450) return '#F37021';
  if (onderwerp.length > 400) return ACCESSIBLE_COLORS.goldText;
  return '#002EA3';
};



