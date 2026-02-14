import type { WorkflowConfiguration, ConfigurableFeatureFlag } from '../../services/api/WorkflowConfigurationApiService';
import type { WorkflowDocument } from '../../services/api';
interface FeatureFlagCategory {
    name: string;
    flags: ConfigurableFeatureFlag[];
}
interface ConfigurationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'edit';
    config?: WorkflowConfiguration | null;
    availableWorkflows: WorkflowDocument[];
    flagCategories: FeatureFlagCategory[];
    onSubmit: (data: {
        name: string;
        description?: string;
        workflowId: string;
        featureFlags: Record<string, boolean>;
        isActive: boolean;
    }) => Promise<void>;
    isSaving: boolean;
}
declare function ConfigurationDialogComponent({ open, onOpenChange, mode, config, availableWorkflows, flagCategories, onSubmit, isSaving, }: ConfigurationDialogProps): import("react/jsx-runtime").JSX.Element;
export declare const ConfigurationDialog: import("react").MemoExoticComponent<typeof ConfigurationDialogComponent>;
export {};
