/**
 * Template Management Component
 *
 * Displays and manages benchmark configuration templates
 * with selection, loading states, and delete functionality.
 */
interface BenchmarkConfigTemplate {
    _id?: string;
    name: string;
    description?: string;
    benchmarkTypes: string[];
    isPublic?: boolean;
    isDefault?: boolean;
    createdBy?: string;
    createdAt?: string;
    updatedAt?: string;
    usageCount?: number;
}
interface BenchmarkType {
    id: string;
    name: string;
    description: string;
}
interface TemplateManagementProps {
    templates: BenchmarkConfigTemplate[];
    loadingTemplates: boolean;
    selectedTemplate: string | null;
    onTemplateSelect: (templateId: string | null) => void;
    onTemplateDelete: (template: BenchmarkConfigTemplate) => void;
    onShowSaveDialog: () => void;
    availableBenchmarkTypes: BenchmarkType[];
}
export declare function TemplateManagement({ templates, loadingTemplates, selectedTemplate, onTemplateSelect, onTemplateDelete, onShowSaveDialog, availableBenchmarkTypes, }: TemplateManagementProps): import("react/jsx-runtime").JSX.Element;
export {};
