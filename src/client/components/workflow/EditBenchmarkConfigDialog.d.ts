/**
 * Edit Benchmark Configuration Dialog Component
 *
 * Dialog for editing benchmark configuration (feature flags and parameters)
 * for a workflow. Reusable for both Workflow A and Workflow B.
 */
interface BenchmarkConfig {
    featureFlags?: Record<string, boolean>;
    params?: Record<string, unknown>;
}
interface FeatureFlag {
    name: string;
    description?: string;
    enabled?: boolean;
}
interface EditBenchmarkConfigDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workflowLabel: string;
    editingConfig: BenchmarkConfig | null;
    onEditingConfigChange: (config: BenchmarkConfig) => void;
    savedConfig: BenchmarkConfig | null;
    onSave: () => void;
    saving: boolean;
    availableFlags: FeatureFlag[];
    loadingFlags: boolean;
    flagsError: string | null;
    onRefetchFlags: () => void;
    flagsSearchQuery: string;
    onFlagsSearchQueryChange: (query: string) => void;
}
export declare function EditBenchmarkConfigDialog({ open, onOpenChange, workflowLabel, editingConfig, onEditingConfigChange, savedConfig, onSave, saving, availableFlags, loadingFlags, flagsError, onRefetchFlags, flagsSearchQuery, onFlagsSearchQueryChange, }: EditBenchmarkConfigDialogProps): import("react/jsx-runtime").JSX.Element;
export {};
