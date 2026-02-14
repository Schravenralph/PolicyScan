/**
 * Workflow Benchmark Config Card Component
 *
 * Displays and manages benchmark configuration for a single workflow.
 */
type WorkflowBenchmarkConfig = {
    featureFlags?: Record<string, boolean>;
    params?: Record<string, unknown>;
    timeout?: number;
    maxRetries?: number;
    maxMemoryMB?: number;
    maxConcurrentRequests?: number;
} | null;
interface WorkflowBenchmarkConfigCardProps {
    workflowId: string;
    onWorkflowChange: (workflowId: string) => void;
    config: WorkflowBenchmarkConfig;
    configSource: 'default' | 'custom' | null;
    loading: boolean;
    saving: boolean;
    onEdit: () => void;
    onSave: () => void;
    label: string;
}
export declare function WorkflowBenchmarkConfigCard({ workflowId, onWorkflowChange, config, configSource, loading, saving, onEdit, onSave, label, }: WorkflowBenchmarkConfigCardProps): import("react/jsx-runtime").JSX.Element;
export {};
