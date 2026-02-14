/**
 * ConfigurationTemplatesSection Component
 * 
 * Displays a grid of configuration templates that users can preview and use.
 */

import React, { memo, useMemo } from 'react';
import { Eye, Check, Loader2, Workflow as WorkflowIcon, Flag } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import type { WorkflowConfigurationTemplate } from '../../services/api/WorkflowConfigurationApiService';
import type { WorkflowDocument } from '../../services/api';
import { t } from '../../utils/i18n';

interface ConfigurationTemplatesSectionProps {
  templates: WorkflowConfigurationTemplate[];
  availableWorkflows: WorkflowDocument[];
  onUseTemplate: (template: WorkflowConfigurationTemplate, activate: boolean) => void;
  onPreviewTemplate: (template: WorkflowConfigurationTemplate) => void;
  isSaving: boolean;
  getIconComponent: (icon: string) => React.ComponentType<{ className?: string }>;
}

// Count enabled flags
function countEnabledFlags(flags: Record<string, boolean>): number {
  return Object.values(flags).filter(Boolean).length;
}

function ConfigurationTemplatesSectionComponent({
  templates,
  availableWorkflows,
  onUseTemplate,
  onPreviewTemplate,
  isSaving,
  getIconComponent,
}: ConfigurationTemplatesSectionProps) {
  // Create a Map for O(1) lookup instead of O(n) find() for workflow names
  // This optimization is especially important when many templates are displayed
  const workflowMap = useMemo(() => {
    const map = new Map<string, string>();
    availableWorkflows.forEach(workflow => {
      map.set(workflow.id, workflow.name || workflow.id);
    });
    return map;
  }, [availableWorkflows]);

  if (templates.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Configuratie Templates</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Begin snel met een vooraf geconfigureerde template
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {templates.map((template) => {
          const IconComponent = getIconComponent(template.icon || 'workflow');
          return (
            <Card key={template.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <IconComponent className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <CardTitle className="text-base">{template.name}</CardTitle>
                </div>
                <CardDescription>{template.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-muted-foreground">{template.useCase}</p>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <WorkflowIcon className="h-3 w-3" aria-hidden="true" />
                    <span>{workflowMap.get(template.workflowId ?? '') || template.workflowId || t('common.unknown')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Flag className="h-3 w-3" aria-hidden="true" />
                    <span>{countEnabledFlags(template.featureFlags)} feature flags</span>
                  </div>
                </div>
              </CardContent>
              <CardContent className="pt-0">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onPreviewTemplate(template)}
                    aria-label={`Preview template ${template.name}`}
                  >
                    <Eye className="h-4 w-4 mr-1" aria-hidden="true" />
                    Preview
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    onClick={() => onUseTemplate(template, false)}
                    disabled={isSaving}
                    aria-label={`Gebruik template ${template.name}`}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" aria-hidden="true" />
                    ) : (
                      <Check className="h-4 w-4 mr-1" aria-hidden="true" />
                    )}
                    Gebruik
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

// Memoize ConfigurationTemplatesSection to prevent unnecessary re-renders
// Only re-render when props actually change
export const ConfigurationTemplatesSection = memo(ConfigurationTemplatesSectionComponent, (prevProps, nextProps) => {
  return (
    prevProps.templates.length === nextProps.templates.length &&
    prevProps.isSaving === nextProps.isSaving &&
    prevProps.availableWorkflows.length === nextProps.availableWorkflows.length &&
    prevProps.onUseTemplate === nextProps.onUseTemplate &&
    prevProps.onPreviewTemplate === nextProps.onPreviewTemplate &&
    prevProps.getIconComponent === nextProps.getIconComponent &&
    // Deep compare templates array (by id for simplicity)
    (prevProps.templates === nextProps.templates ||
      (prevProps.templates.length === nextProps.templates.length &&
        prevProps.templates.every((t, i) => t.id === nextProps.templates[i]?.id))) &&
    // Deep compare availableWorkflows array (by id for simplicity)
    (prevProps.availableWorkflows === nextProps.availableWorkflows ||
      (prevProps.availableWorkflows.length === nextProps.availableWorkflows.length &&
        prevProps.availableWorkflows.every((w, i) => w.id === nextProps.availableWorkflows[i]?.id)))
  );
});
