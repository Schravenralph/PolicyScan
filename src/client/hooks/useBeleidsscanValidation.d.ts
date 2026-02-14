/**
 * Hook for managing validation logic in Beleidsscan component
 * Extracted from Beleidsscan component to reduce component size
 */
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
export declare function useBeleidsscanValidation({ onderwerp, overheidslaag, selectedEntity, validationErrors, setValidationErrors, }: UseBeleidsscanValidationProps): {
    validateOnderwerp: (value: string) => string | undefined;
    validateOverheidslaag: () => string | undefined;
    validateEntity: () => string | undefined;
    validateForm: () => boolean;
    canProceedStep1: boolean;
    getCharacterCounterColor: () => string;
};
export {};
