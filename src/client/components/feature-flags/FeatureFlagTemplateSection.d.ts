import type { FeatureFlagTemplate, FeatureFlag } from '../../types/featureFlags.js';
interface FeatureFlagTemplateSectionProps {
    templates: FeatureFlagTemplate[];
    bulkEditMode: boolean;
    applyingTemplate: string | null;
    showTemplatePreview: string | null;
    onTemplatePreviewChange: (templateId: string | null) => void;
    onApplyTemplate: (templateId: string, templateName: string) => Promise<void>;
    onDeleteTemplate: (templateId: string, templateName: string) => void;
    getTemplateDifferences: (templateFlags: Record<string, boolean>) => Array<{
        flag: string;
        current: boolean;
        template: boolean;
    }>;
    flags: FeatureFlag[];
}
export declare function FeatureFlagTemplateSection({ templates, bulkEditMode, applyingTemplate, onTemplatePreviewChange, onApplyTemplate, onDeleteTemplate, getTemplateDifferences, }: FeatureFlagTemplateSectionProps): import("react/jsx-runtime").JSX.Element | null;
export {};
