interface StepNavigationProps {
    currentStep: number;
    onStepClick: (step: number) => void;
    wizardSession?: {
        currentStepId: string;
        completedSteps: string[];
    } | null;
}
declare function StepNavigationComponent({ currentStep, onStepClick, wizardSession }: StepNavigationProps): import("react/jsx-runtime").JSX.Element;
export declare const StepNavigation: import("react").MemoExoticComponent<typeof StepNavigationComponent>;
export {};
