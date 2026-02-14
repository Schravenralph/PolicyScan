export type ComparisonMode = 'workflow-vs-workflow' | 'workflow-vs-ground-truth';
export interface ComparisonModeSelectorProps {
    mode: ComparisonMode;
    onModeChange: (mode: ComparisonMode) => void;
}
/**
 * ComparisonModeSelector Component
 *
 * Allows users to switch between different comparison modes:
 * - Workflow vs Workflow (existing)
 * - Workflow vs Ground Truth (new)
 *
 * @component
 */
export declare function ComparisonModeSelector({ mode, onModeChange, }: ComparisonModeSelectorProps): import("react/jsx-runtime").JSX.Element;
