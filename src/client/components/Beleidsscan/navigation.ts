/**
 * Navigation utilities for Beleidsscan component
 */

/**
 * Map step numbers to wizard step IDs
 */
export const STEP_ID_MAP: Record<number, string> = {
  1: 'query-configuration',
  2: 'website-selection',
  3: 'document-review',
};

/**
 * Get wizard step ID from step number
 */
export const getWizardStepId = (stepNumber: number): string | undefined => {
  return STEP_ID_MAP[stepNumber];
};



