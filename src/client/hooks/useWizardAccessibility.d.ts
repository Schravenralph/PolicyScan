/**
 * Hook for managing accessibility features in wizard components
 * Extracted from Beleidsscan component to reduce component size
 */
interface UseWizardAccessibilityProps {
    currentStep: number;
    onPreviousStep: () => void;
    onNextStep: () => void;
}
/**
 * Hook for managing focus and keyboard navigation in wizard components
 */
export declare function useWizardAccessibility({ currentStep, onPreviousStep, onNextStep, }: UseWizardAccessibilityProps): void;
export {};
