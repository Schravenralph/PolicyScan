import type { WorkflowConfiguration } from '../../services/api/WorkflowConfigurationApiService';
import type { WorkflowDocument } from '../../services/api';
interface ActiveConfigurationCardProps {
    activeConfiguration: WorkflowConfiguration;
    availableWorkflows: WorkflowDocument[];
    onEdit: (config: WorkflowConfiguration) => void;
    onRefresh: () => Promise<void>;
    isLoading: boolean;
}
declare function ActiveConfigurationCardComponent({ activeConfiguration, availableWorkflows, onEdit, onRefresh, isLoading, }: ActiveConfigurationCardProps): import("react/jsx-runtime").JSX.Element;
export declare const ActiveConfigurationCard: import("react").MemoExoticComponent<typeof ActiveConfigurationCardComponent>;
export {};
