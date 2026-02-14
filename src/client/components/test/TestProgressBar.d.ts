interface TestProgressBarProps {
    progress: {
        percentage: number;
        completed: number;
        total: number;
        estimatedTimeRemaining?: number;
    };
    className?: string;
}
/**
 * Progress bar component for test execution
 * Shows completion percentage, completed/total tests, and estimated time remaining
 */
export declare function TestProgressBar({ progress, className }: TestProgressBarProps): import("react/jsx-runtime").JSX.Element;
export {};
