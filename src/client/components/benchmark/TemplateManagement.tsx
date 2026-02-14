/**
 * Template Management Component
 * 
 * Displays and manages benchmark configuration templates
 * with selection, loading states, and delete functionality.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Loader2, Save, X } from 'lucide-react';

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

export function TemplateManagement({
  templates,
  loadingTemplates,
  selectedTemplate,
  onTemplateSelect,
  onTemplateDelete,
  onShowSaveDialog,
  availableBenchmarkTypes,
}: TemplateManagementProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Benchmark Configuration Templates</CardTitle>
            <CardDescription>
              Save and manage benchmark configurations for reuse in workflow comparisons
            </CardDescription>
          </div>
          <Button
            onClick={onShowSaveDialog}
            variant="default"
            size="sm"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Template
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loadingTemplates ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No templates saved yet. Create your first template to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <Card
                key={template.name}
                className={`cursor-pointer transition-all ${
                  (selectedTemplate === template._id || selectedTemplate === template.name)
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200'
                }`}
                onClick={() => onTemplateSelect(template._id || template.name)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{template.name}</h3>
                        {(selectedTemplate === template._id || selectedTemplate === template.name) && (
                          <Badge variant="default" className="text-xs">Selected</Badge>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {template.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {template.benchmarkTypes.map((typeId) => {
                          const type = availableBenchmarkTypes.find(t => t.id === typeId);
                          return type ? (
                            <Badge key={typeId} variant="outline" className="text-xs">
                              {type.name}
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete template "${template.name}"?`)) {
                          onTemplateDelete(template);
                        }
                      }}
                      className="text-destructive hover:text-destructive"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
