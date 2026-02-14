import type { WorkflowConfiguration } from '../../services/api/WorkflowConfigurationApiService';
import type { WorkflowDocument } from '../../services/api';
interface ConfigurationCardProps {
    config: WorkflowConfiguration;
    availableWorkflows: WorkflowDocument[];
    onActivate: (configId: string) => Promise<void>;
    onEdit: (config: WorkflowConfiguration) => void;
    onDelete: (config: WorkflowConfiguration) => void;
    onDuplicate: (config: WorkflowConfiguration) => Promise<void>;
    onExport: (config: WorkflowConfiguration) => Promise<void>;
    activatingId: string | null;
}
declare function ConfigurationCardComponent({ config, availableWorkflows, onActivate, onEdit, onDelete, onDuplicate, onExport, activatingId, }: ConfigurationCardProps): import("react/jsx-runtime").JSX.Element;
export declare const ConfigurationCard: import("react").MemoExoticComponent<typeof ConfigurationCardComponent>;
export {};
