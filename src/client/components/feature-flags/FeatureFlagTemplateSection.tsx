import { Button } from '../ui/button';
import { Layers, RefreshCw, Play, Trash2 } from 'lucide-react';
import type { FeatureFlagTemplate, FeatureFlag } from '../../types/featureFlags.js';
import { t } from '../../utils/i18n';

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

export function FeatureFlagTemplateSection({
  templates,
  bulkEditMode,
  applyingTemplate,
  onTemplatePreviewChange,
  onApplyTemplate,
  onDeleteTemplate,
  getTemplateDifferences,
}: FeatureFlagTemplateSectionProps) {
  if (templates.length === 0 || bulkEditMode) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">{t('featureFlags.savedTemplates')}</h2>
          <span className="text-sm text-muted-foreground">
            ({templates.length} {t('featureFlags.templates')})
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {templates.map((template) => {
          const differences = getTemplateDifferences(template.flags);
          const hasChanges = differences.length > 0;
          
          return (
            <div
              key={template._id || template.name}
              className="rounded-md border bg-background p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{template.name}</h3>
                    {template.isDefault && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        {t('featureFlags.default')}
                      </span>
                    )}
                    {template.isPublic && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        {t('featureFlags.public')}
                      </span>
                    )}
                  </div>
                  {template.description && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {template.description}
                    </p>
                  )}
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>{t('featureFlags.createdBy')} {template.createdBy}</p>
                    <p>{t('featureFlags.used')} {template.usageCount} {template.usageCount !== 1 ? t('featureFlags.times') : t('featureFlags.time')}</p>
                    {hasChanges && (
                      <p className="text-orange-600 dark:text-orange-400">
                        {differences.length} {differences.length !== 1 
                          ? t('featureFlags.flagsDifferFromCurrent') 
                          : t('featureFlags.flagDiffersFromCurrent')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onTemplatePreviewChange(template._id || template.name)}
                  className="flex-1"
                >
                  <Layers className="h-3 w-3 mr-1" />
                  {t('featureFlags.preview')}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => template._id && onApplyTemplate(template._id, template.name)}
                  disabled={applyingTemplate === template._id}
                  className="flex-1"
                >
                  {applyingTemplate === template._id ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3 mr-1" />
                  )}
                  {t('featureFlags.apply')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => template._id && onDeleteTemplate(template._id, template.name)}
                  className="h-8 w-8 p-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

