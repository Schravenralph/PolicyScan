/**
 * Edit Benchmark Configuration Dialog Component
 * 
 * Dialog for editing benchmark configuration (feature flags and parameters)
 * for a workflow. Reusable for both Workflow A and Workflow B.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Search, CheckSquare, Square, RotateCcw, Save, AlertCircle, Loader2 } from 'lucide-react';
import { t } from '../../utils/i18n';
import { getFeatureFlagDisplayName } from '../../utils/featureFlagUtils';

interface BenchmarkConfig {
  featureFlags?: Record<string, boolean>;
  params?: Record<string, unknown>;
}

interface FeatureFlag {
  name: string;
  description?: string;
  enabled?: boolean;
}

interface EditBenchmarkConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowLabel: string;
  editingConfig: BenchmarkConfig | null;
  onEditingConfigChange: (config: BenchmarkConfig) => void;
  savedConfig: BenchmarkConfig | null;
  onSave: () => void;
  saving: boolean;
  availableFlags: FeatureFlag[];
  loadingFlags: boolean;
  flagsError: string | null;
  onRefetchFlags: () => void;
  flagsSearchQuery: string;
  onFlagsSearchQueryChange: (query: string) => void;
}

export function EditBenchmarkConfigDialog({
  open,
  onOpenChange,
  workflowLabel,
  editingConfig,
  onEditingConfigChange,
  savedConfig,
  onSave,
  saving,
  availableFlags,
  loadingFlags,
  flagsError,
  onRefetchFlags,
  flagsSearchQuery,
  onFlagsSearchQueryChange,
}: EditBenchmarkConfigDialogProps) {
  const handleToggleFlag = (flagName: string, checked: boolean) => {
    if (!editingConfig) return;
    onEditingConfigChange({
      ...editingConfig,
      featureFlags: {
        ...editingConfig.featureFlags,
        [flagName]: checked,
      },
    });
  };

  const handleEnableAll = () => {
    if (!editingConfig) return;
    const allEnabled = { ...editingConfig.featureFlags };
    availableFlags.forEach(flag => {
      allEnabled[flag.name] = true;
    });
    onEditingConfigChange({
      ...editingConfig,
      featureFlags: allEnabled,
    });
  };

  const handleDisableAll = () => {
    if (!editingConfig) return;
    const allDisabled = { ...editingConfig.featureFlags };
    availableFlags.forEach(flag => {
      allDisabled[flag.name] = false;
    });
    onEditingConfigChange({
      ...editingConfig,
      featureFlags: allDisabled,
    });
  };

  const handleReset = () => {
    if (savedConfig) {
      onEditingConfigChange(savedConfig);
    }
  };

  const filteredFlags = availableFlags.filter(flag => {
    const query = flagsSearchQuery.toLowerCase();
    const displayName = getFeatureFlagDisplayName(flag.name).toLowerCase();
    return (
      flag.name.toLowerCase().includes(query) ||
      displayName.includes(query) ||
      flag.description?.toLowerCase().includes(query)
    );
  });

  const enabledCount = editingConfig?.featureFlags 
    ? Object.values(editingConfig.featureFlags).filter(v => v === true).length 
    : 0;
  const totalCount = availableFlags.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {workflowLabel === 'A' 
              ? t('workflowComparison.editBenchmarkConfigA')
              : workflowLabel === 'B'
              ? t('workflowComparison.editBenchmarkConfigB')
              : `${t('workflowComparison.editBenchmarkConfigA')} ${workflowLabel}`}
          </DialogTitle>
          <DialogDescription>
            {t('workflowComparison.configureFeatureFlags')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('workflowComparison.featureFlags')}</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleEnableAll}
                  disabled={loadingFlags || availableFlags.length === 0}
                  title={t('workflowComparison.enableAllFlags')}
                >
                  <CheckSquare className="w-4 h-4 mr-1" />
                  {t('workflowComparison.enableAllFlags')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisableAll}
                  disabled={loadingFlags || availableFlags.length === 0}
                  title={t('workflowComparison.disableAllFlags')}
                >
                  <Square className="w-4 h-4 mr-1" />
                  {t('workflowComparison.disableAllFlags')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  disabled={loadingFlags || !savedConfig}
                  title={t('workflowComparison.resetToSaved')}
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  {t('workflowComparison.resetToSaved')}
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('workflowComparison.searchFeatureFlags')}
                value={flagsSearchQuery}
                onChange={(e) => onFlagsSearchQueryChange(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto border rounded-md p-4">
              {loadingFlags ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mr-2" />
                  <p className="text-sm text-muted-foreground">{t('benchmark.loadingFeatureFlags')}</p>
                </div>
              ) : flagsError ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <AlertCircle className="w-8 h-8 text-destructive mb-2" />
                  <p className="text-sm text-muted-foreground">{flagsError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefetchFlags}
                    className="mt-4"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {t('benchmark.retry')}
                  </Button>
                </div>
              ) : availableFlags.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t('featureFlags.noFlagsAvailable')}.</p>
              ) : filteredFlags.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t('benchmark.noFlagsMatchSearch')}</p>
              ) : (
                filteredFlags.map((flag) => (
                  <div key={flag.name} className="flex items-center justify-between py-2 border-b last:border-b-0 hover:bg-muted/50 transition-colors rounded px-2 -mx-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{getFeatureFlagDisplayName(flag.name)}</span>
                        {editingConfig?.featureFlags?.[flag.name] && (
                          <Badge variant="default" className="text-xs">{t('workflowComparison.enabled')}</Badge>
                        )}
                      </div>
                      {flag.description && (
                        <p className="text-xs text-muted-foreground mt-1">{flag.description}</p>
                      )}
                    </div>
                    <Switch
                      checked={editingConfig?.featureFlags?.[flag.name] ?? false}
                      onCheckedChange={(checked) => handleToggleFlag(flag.name, checked)}
                      aria-label={`Toggle ${getFeatureFlagDisplayName(flag.name)}`}
                    />
                  </div>
                ))
              )}
            </div>
            {availableFlags.length > 0 && !loadingFlags && (
              <p className="text-xs text-muted-foreground">
                {enabledCount} {t('workflowComparison.of')} {totalCount} {t('workflowComparison.flagsEnabled')}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={onSave}
            disabled={saving || !editingConfig}
          >
            {saving ? (
              <>
                <AlertCircle className="w-4 h-4 mr-2 animate-spin" />
                {t('workflowComparison.saving')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {t('workflowComparison.saveConfiguration')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
