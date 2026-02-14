/**
 * Hook for managing validation logic in Beleidsscan component
 * Extracted from Beleidsscan component to reduce component size
 */

import { useCallback } from 'react';
import {
  validateOnderwerp as validateOnderwerpUtil,
  validateOverheidslaag as validateOverheidslaagUtil,
  validateEntity as validateEntityUtil,
  validateForm as validateFormUtil,
  canProceedStep1 as canProceedStep1Util,
  getCharacterCounterColor as getCharacterCounterColorUtil,
} from '../components/Beleidsscan/validation';
import type { WebsiteType } from '../components/Beleidsscan/types';

import type { ValidationErrors } from '../context/BeleidsscanContext.js';

interface UseBeleidsscanValidationProps {
  onderwerp: string;
  overheidslaag: string | null;
  selectedEntity: string;
  validationErrors: ValidationErrors;
  setValidationErrors: (errors: ValidationErrors) => void;
}

/**
 * Hook for managing validation logic in Beleidsscan component
 * Provides validation functions and form validation
 */
export function useBeleidsscanValidation({
  onderwerp,
  overheidslaag,
  selectedEntity,
  validationErrors,
  setValidationErrors,
}: UseBeleidsscanValidationProps) {
  const validateOnderwerp = useCallback((value: string) => validateOnderwerpUtil(value), []);

  const validateOverheidslaag = useCallback(() => validateOverheidslaagUtil(overheidslaag as WebsiteType | null), [overheidslaag]);

  const validateEntity = useCallback(() => validateEntityUtil(overheidslaag as WebsiteType | null, selectedEntity), [overheidslaag, selectedEntity]);

  const validateForm = useCallback(() => {
    const { isValid, errors } = validateFormUtil(onderwerp, overheidslaag as WebsiteType | null, selectedEntity);
    // Use direct update since setValidationErrors doesn't support functional updates
    setValidationErrors({ ...validationErrors, ...errors } as ValidationErrors);
    return isValid;
     
  }, [onderwerp, overheidslaag, selectedEntity, validationErrors, setValidationErrors]);

  const canProceedStep1 = canProceedStep1Util(overheidslaag as WebsiteType | null, selectedEntity, onderwerp);

  const getCharacterCounterColor = useCallback(() => getCharacterCounterColorUtil(onderwerp), [onderwerp]);

  return {
    validateOnderwerp,
    validateOverheidslaag,
    validateEntity,
    validateForm,
    canProceedStep1,
    getCharacterCounterColor,
  };
}

