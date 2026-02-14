import type { WorkflowDocument } from '../../services/api';
interface ImportData {
    version: number;
    exportedAt: string;
    configuration: {
        name: string;
        description?: string;
        workflowId: string;
        featureFlags: Record<string, boolean>;
    };
}
interface ImportConfigurationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    importFileName: string;
    importData: ImportData | null;
    importName: string;
    availableWorkflows: WorkflowDocument[];
    onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onImportNameChange: (name: string) => void;
    onImport: () => Promise<void>;
    isSaving: boolean;
}
export declare function ImportConfigurationDialog({ open, onOpenChange, importFileName, importData, importName, availableWorkflows, onFileSelect, onImportNameChange, onImport, isSaving, }: ImportConfigurationDialogProps): import("react/jsx-runtime").JSX.Element;
export {};
