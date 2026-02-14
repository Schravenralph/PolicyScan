interface BreadcrumbProps {
    currentStep: number;
    onStepClick: (step: number) => void;
    onHomeClick: () => void;
    wizardSession?: {
        currentStepId: string;
        completedSteps: string[];
    } | null;
}
declare function BreadcrumbComponent({ currentStep, onStepClick, onHomeClick, wizardSession }: BreadcrumbProps): import("react/jsx-runtime").JSX.Element;
export declare const Breadcrumb: import("react").MemoExoticComponent<typeof BreadcrumbComponent>;
export {};
