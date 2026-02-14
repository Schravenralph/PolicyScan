/**
 * General Benchmark Settings Component
 *
 * Form for configuring general benchmark execution settings.
 */
interface GeneralBenchmarkSettingsProps {
    settings: {
        runsPerWorkflow?: number;
        executionMode?: 'sequential' | 'parallel';
        maxConcurrent?: number;
        timeout?: number;
        maxWorkflowTemplates?: number;
    };
    onSettingsChange: (settings: GeneralBenchmarkSettingsProps['settings']) => void;
}
export declare function GeneralBenchmarkSettings({ settings, onSettingsChange }: GeneralBenchmarkSettingsProps): import("react/jsx-runtime").JSX.Element;
export {};
