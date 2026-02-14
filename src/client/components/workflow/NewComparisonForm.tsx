/**
 * New Comparison Form Component
 * 
 * Form for creating a new workflow comparison with two workflows,
 * queries, labels, and benchmark configurations.
 */

import { Play, Plus, X, Settings, Save, Edit2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { WorkflowSelector } from '../benchmark/WorkflowSelector';
import { t } from '../../utils/i18n';
import { getFeatureFlagDisplayName } from '../../utils/featureFlagUtils';

interface BenchmarkConfig {
  featureFlags?: Record<string, boolean>;
  params?: Record<string, unknown>;
}

interface NewComparisonFormProps {
  comparisonName: string;
  onComparisonNameChange: (value: string) => void;
  comparisonDescription: string;
  onComparisonDescriptionChange: (value: string) => void;
  comparisonWorkflowA: string;
  onComparisonWorkflowAChange: (value: string) => void;
  comparisonWorkflowB: string;
  onComparisonWorkflowBChange: (value: string) => void;
  comparisonQueries: string[];
  onAddQuery: () => void;
  onRemoveQuery: (index: number) => void;
  onQueryChange: (index: number, value: string) => void;
  comparisonLabelA: string;
  onComparisonLabelAChange: (value: string) => void;
  comparisonLabelB: string;
  onComparisonLabelBChange: (value: string) => void;
  workflowAConfig: BenchmarkConfig | null;
  workflowBConfig: BenchmarkConfig | null;
  configSourceA: 'default' | 'custom' | null;
  configSourceB: 'default' | 'custom' | null;
  loadingConfigA: boolean;
  loadingConfigB: boolean;
  savingConfigA: boolean;
  savingConfigB: boolean;
  onOpenEditA: () => void;
  onOpenEditB: () => void;
  onSaveConfigA: () => void;
  onSaveConfigB: () => void;
  onStartComparison: () => void;
  isStartingComparison: boolean;
}

export function NewComparisonForm({
  comparisonName,
  onComparisonNameChange,
  comparisonDescription,
  onComparisonDescriptionChange,
  comparisonWorkflowA,
  onComparisonWorkflowAChange,
  comparisonWorkflowB,
  onComparisonWorkflowBChange,
  comparisonQueries,
  onAddQuery,
  onRemoveQuery,
  onQueryChange,
  comparisonLabelA,
  onComparisonLabelAChange,
  comparisonLabelB,
  onComparisonLabelBChange,
  workflowAConfig,
  workflowBConfig,
  configSourceA,
  configSourceB,
  loadingConfigA,
  loadingConfigB,
  savingConfigA,
  savingConfigB,
  onOpenEditA,
  onOpenEditB,
  onSaveConfigA,
  onSaveConfigB,
  onStartComparison,
  isStartingComparison,
}: NewComparisonFormProps) {
  const canStart = 
    comparisonWorkflowA && 
    comparisonWorkflowB && 
    comparisonQueries.filter((q) => q.trim()).length > 0 && 
    comparisonName.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('workflowComparison.startNewWorkflowComparison')}</CardTitle>
        <CardDescription>
          {t('workflowComparison.configureTwoWorkflows')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="comparison-name">{t('workflowComparison.comparisonNameRequired')}</Label>
          <Input
            id="comparison-name"
            placeholder={t('workflowComparison.comparisonNameExample')}
            value={comparisonName}
            onChange={(e) => onComparisonNameChange(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="comparison-description">{t('workflowComparison.descriptionOptional')}</Label>
          <Textarea
            id="comparison-description"
            placeholder={t('workflowComparison.describeComparison')}
            value={comparisonDescription}
            onChange={(e) => onComparisonDescriptionChange(e.target.value)}
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('workflowComparison.workflowA')} *</Label>
            <WorkflowSelector
              selectedWorkflows={comparisonWorkflowA ? [comparisonWorkflowA] : []}
              onSelectionChange={(ids) => onComparisonWorkflowAChange(ids[0] || '')}
              maxSelection={1}
              minSelection={0}
              label=""
              description=""
            />
            <Input
              placeholder={t('workflowComparison.labelOptional')}
              value={comparisonLabelA}
              onChange={(e) => onComparisonLabelAChange(e.target.value)}
            />
            {comparisonWorkflowA && (
              <Card className="mt-2">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      {t('workflowComparison.benchmarkConfiguration')}
                      {configSourceA && (
                        <Badge 
                          variant={configSourceA === 'custom' ? 'default' : 'secondary'} 
                          className="text-xs"
                          title={configSourceA === 'custom' ? t('workflowComparison.usingCustomConfig') : t('workflowComparison.usingDefaultConfig')}
                        >
                          {configSourceA === 'custom' ? t('workflowComparison.custom') : t('workflowComparison.default')}
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={onOpenEditA}
                        disabled={loadingConfigA}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={onSaveConfigA}
                        disabled={savingConfigA || loadingConfigA || !workflowAConfig}
                      >
                        {savingConfigA ? (
                          <AlertCircle className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  {loadingConfigA ? (
                    <p className="text-xs text-muted-foreground">{t('workflowComparison.loadingConfiguration')}</p>
                  ) : workflowAConfig ? (
                    <div className="space-y-2 text-xs">
                      {workflowAConfig.featureFlags && Object.keys(workflowAConfig.featureFlags).length > 0 ? (
                        <div>
                          <p className="font-medium mb-1">{t('workflowComparison.featureFlags')}</p>
                          <div className="space-y-1">
                            {Object.entries(workflowAConfig.featureFlags).map(([flag, value]) => (
                              <div key={flag} className="flex items-center gap-2">
                                <Badge variant={value ? 'default' : 'secondary'} className="text-xs">
                                  {value ? t('workflowComparison.on') : t('workflowComparison.off')}
                                </Badge>
                                <span className="text-xs">{getFeatureFlagDisplayName(flag)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">{t('workflowComparison.noConfigurationSet')}</p>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </div>
          <div className="space-y-2">
            <Label>{t('workflowComparison.workflowB')} *</Label>
            <WorkflowSelector
              selectedWorkflows={comparisonWorkflowB ? [comparisonWorkflowB] : []}
              onSelectionChange={(ids) => onComparisonWorkflowBChange(ids[0] || '')}
              maxSelection={1}
              minSelection={0}
              label=""
              description=""
            />
            <Input
              placeholder={t('workflowComparison.labelOptional')}
              value={comparisonLabelB}
              onChange={(e) => onComparisonLabelBChange(e.target.value)}
            />
            {comparisonWorkflowB && (
              <Card className="mt-2">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      {t('workflowComparison.benchmarkConfiguration')}
                      {configSourceB && (
                        <Badge 
                          variant={configSourceB === 'custom' ? 'default' : 'secondary'} 
                          className="text-xs"
                          title={configSourceB === 'custom' ? t('workflowComparison.usingCustomConfig') : t('workflowComparison.usingDefaultConfig')}
                        >
                          {configSourceB === 'custom' ? t('workflowComparison.custom') : t('workflowComparison.default')}
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={onOpenEditB}
                        disabled={loadingConfigB}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={onSaveConfigB}
                        disabled={savingConfigB || loadingConfigB || !workflowBConfig}
                      >
                        {savingConfigB ? (
                          <AlertCircle className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  {loadingConfigB ? (
                    <p className="text-xs text-muted-foreground">{t('workflowComparison.loadingConfiguration')}</p>
                  ) : workflowBConfig ? (
                    <div className="space-y-2 text-xs">
                      {workflowBConfig.featureFlags && Object.keys(workflowBConfig.featureFlags).length > 0 ? (
                        <div>
                          <p className="font-medium mb-1">{t('workflowComparison.featureFlags')}</p>
                          <div className="space-y-1">
                            {Object.entries(workflowBConfig.featureFlags).map(([flag, value]) => (
                              <div key={flag} className="flex items-center gap-2">
                                <Badge variant={value ? 'default' : 'secondary'} className="text-xs">
                                  {value ? t('workflowComparison.on') : t('workflowComparison.off')}
                                </Badge>
                                <span className="text-xs">{getFeatureFlagDisplayName(flag)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">{t('workflowComparison.noConfigurationSet')}</p>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t('workflowComparison.testQueries')}</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddQuery}
              className="flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              {t('workflowComparison.addQuery')}
            </Button>
          </div>
          <div className="space-y-2">
            {comparisonQueries.map((query, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder={t('workflowComparison.queryExample').replace('{{index}}', String(index + 1))}
                  value={query}
                  onChange={(e) => onQueryChange(index, e.target.value)}
                  className="flex-1"
                />
                {comparisonQueries.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveQuery(index)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <Button
          onClick={onStartComparison}
          disabled={isStartingComparison || !canStart}
          className="w-full"
          size="lg"
        >
          {isStartingComparison ? (
            <>
              <AlertCircle className="w-4 h-4 mr-2 animate-spin" />
              {t('workflowComparison.startingComparison')}
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              {t('workflowComparison.startComparison')}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
