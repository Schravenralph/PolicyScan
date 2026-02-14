/**
 * New Comparison Form Component
 *
 * Form for creating a new workflow comparison with two workflows,
 * queries, labels, and benchmark configurations.
 */
interface BenchmarkConfig {
    featureFlags?: Record<string, boolean>;
    params?: Record<string, unknown>;
}
interface NewComparisonFormProps {
    comparisonName: string;
    onComparisonNameChange: (value: string) => void;
    comparisonDescription: string;
    onComparisonDescriptionChange: (value: string) => void;
    comparisonWorkflowA: string;
    onComparisonWorkflowAChange: (value: string) => void;
    comparisonWorkflowB: string;
    onComparisonWorkflowBChange: (value: string) => void;
    comparisonQueries: string[];
    onAddQuery: () => void;
    onRemoveQuery: (index: number) => void;
    onQueryChange: (index: number, value: string) => void;
    comparisonLabelA: string;
    onComparisonLabelAChange: (value: string) => void;
    comparisonLabelB: string;
    onComparisonLabelBChange: (value: string) => void;
    workflowAConfig: BenchmarkConfig | null;
    workflowBConfig: BenchmarkConfig | null;
    configSourceA: 'default' | 'custom' | null;
    configSourceB: 'default' | 'custom' | null;
    loadingConfigA: boolean;
    loadingConfigB: boolean;
    savingConfigA: boolean;
    savingConfigB: boolean;
    onOpenEditA: () => void;
    onOpenEditB: () => void;
    onSaveConfigA: () => void;
    onSaveConfigB: () => void;
    onStartComparison: () => void;
    isStartingComparison: boolean;
}
export declare function NewComparisonForm({ comparisonName, onComparisonNameChange, comparisonDescription, onComparisonDescriptionChange, comparisonWorkflowA, onComparisonWorkflowAChange, comparisonWorkflowB, onComparisonWorkflowBChange, comparisonQueries, onAddQuery, onRemoveQuery, onQueryChange, comparisonLabelA, onComparisonLabelAChange, comparisonLabelB, onComparisonLabelBChange, workflowAConfig, workflowBConfig, configSourceA, configSourceB, loadingConfigA, loadingConfigB, savingConfigA, savingConfigB, onOpenEditA, onOpenEditB, onSaveConfigA, onSaveConfigB, onStartComparison, isStartingComparison, }: NewComparisonFormProps): import("react/jsx-runtime").JSX.Element;
export {};
