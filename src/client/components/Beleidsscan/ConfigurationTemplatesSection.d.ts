/**
 * ConfigurationTemplatesSection Component
 *
 * Displays a grid of configuration templates that users can preview and use.
 */
import React from 'react';
import type { WorkflowConfigurationTemplate } from '../../services/api/WorkflowConfigurationApiService';
import type { WorkflowDocument } from '../../services/api';
interface ConfigurationTemplatesSectionProps {
    templates: WorkflowConfigurationTemplate[];
    availableWorkflows: WorkflowDocument[];
    onUseTemplate: (template: WorkflowConfigurationTemplate, activate: boolean) => void;
    onPreviewTemplate: (template: WorkflowConfigurationTemplate) => void;
    isSaving: boolean;
    getIconComponent: (icon: string) => React.ComponentType<{
        className?: string;
    }>;
}
declare function ConfigurationTemplatesSectionComponent({ templates, availableWorkflows, onUseTemplate, onPreviewTemplate, isSaving, getIconComponent, }: ConfigurationTemplatesSectionProps): import("react/jsx-runtime").JSX.Element | null;
export declare const ConfigurationTemplatesSection: React.MemoExoticComponent<typeof ConfigurationTemplatesSectionComponent>;
export {};
