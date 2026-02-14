/**
 * FeatureFlagBulkEditor Component
 * 
 * Handles bulk editing of feature flags.
 * Extracted from FeatureFlagsPage.tsx for better organization.
 */

import { Save, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import type { FeatureFlag } from '../../types/featureFlags.js';
import { getFeatureFlagDisplayName } from '../../utils/featureFlagUtils';
import { t } from '../../utils/i18n';

export interface FeatureFlagBulkEditorProps {
  // State
  bulkEditMode: boolean;
  bulkFlags: Record<string, boolean>;
  bulkConfigName: string;
  applyingBulk: boolean;
  databaseFlags: FeatureFlag[];
  
  // Actions
  onStartBulkEdit: () => void;
  onCancelBulkEdit: () => void;
  onUpdateBulkFlag: (flagName: string, enabled: boolean) => void;
  onBulkConfigNameChange: (name: string) => void;
  onApplyBulkConfig: () => Promise<void>;
}

/**
 * Bulk editor component for feature flags
 */
export function FeatureFlagBulkEditor({
  bulkEditMode,
  bulkFlags,
  bulkConfigName,
  applyingBulk,
  databaseFlags,
  onStartBulkEdit,
  onCancelBulkEdit,
  onUpdateBulkFlag,
  onBulkConfigNameChange,
  onApplyBulkConfig,
}: FeatureFlagBulkEditorProps) {
  if (!bulkEditMode) {
    return (
      <Button
        onClick={onStartBulkEdit}
        variant="outline"
        size="sm"
      >
        <Save className="h-4 w-4 mr-2" />
        {t('featureFlags.bulkEdit')}
      </Button>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t('featureFlags.bulkEditMode')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('featureFlags.configureMultipleFlags')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={onCancelBulkEdit}
            variant="outline"
            size="sm"
            disabled={applyingBulk}
          >
            <X className="h-4 w-4 mr-2" />
            {t('featureFlags.cancel')}
          </Button>
          <Button
            onClick={onApplyBulkConfig}
            disabled={applyingBulk || Object.keys(bulkFlags).length === 0}
            size="sm"
          >
            <Save className={`h-4 w-4 mr-2 ${applyingBulk ? 'animate-spin' : ''}`} />
            {applyingBulk ? t('featureFlags.applyingChanges') : t('featureFlags.applyChanges')}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bulk-config-name">{t('featureFlags.configurationName')}</Label>
        <Input
          id="bulk-config-name"
          value={bulkConfigName}
          onChange={(e) => onBulkConfigNameChange(e.target.value)}
          placeholder={t('featureFlags.configurationNamePlaceholder')}
          disabled={applyingBulk}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('featureFlags.flags')} ({Object.keys(bulkFlags).length} {t('featureFlags.flags')})</Label>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{t('featureFlags.allEnabled')}</span>
            <span>{t('featureFlags.allDisabled')}</span>
          </div>
        </div>
        <div className="rounded-md border bg-background max-h-96 overflow-y-auto">
          <div className="p-4 space-y-3">
            {databaseFlags.map((flag) => {
              const bulkValue = bulkFlags[flag.name];
              const isChanged = bulkValue !== undefined && bulkValue !== flag.enabled;
              
              return (
                <div
                  key={flag.name}
                  className={`flex items-center justify-between p-3 rounded-md border ${
                    isChanged ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800' : 'bg-background'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{getFeatureFlagDisplayName(flag.name)}</span>
                      {isChanged && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {t('featureFlags.changed')}
                        </span>
                      )}
                    </div>
                    {flag.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {flag.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={bulkValue ?? flag.enabled}
                        onCheckedChange={(checked) => onUpdateBulkFlag(flag.name, checked)}
                        disabled={applyingBulk}
                        aria-label={`${getFeatureFlagDisplayName(flag.name)} toggle`}
                      />
                      <span className="text-sm font-medium min-w-[60px]">
                        {bulkValue ?? flag.enabled ? t('featureFlags.enabled') : t('featureFlags.disabled')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t">
        <div className="text-sm text-muted-foreground">
          {Object.keys(bulkFlags).filter(
            (flagName) => bulkFlags[flagName] !== databaseFlags.find(f => f.name === flagName)?.enabled
          ).length > 0 && (
            <span>
              {Object.keys(bulkFlags).filter(
                (flagName) => bulkFlags[flagName] !== databaseFlags.find(f => f.name === flagName)?.enabled
              ).length} flag{Object.keys(bulkFlags).filter(
                (flagName) => bulkFlags[flagName] !== databaseFlags.find(f => f.name === flagName)?.enabled
              ).length !== 1 ? 's' : ''} will be changed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={onCancelBulkEdit}
            variant="outline"
            size="sm"
            disabled={applyingBulk}
          >
            Cancel
          </Button>
          <Button
            onClick={onApplyBulkConfig}
            disabled={applyingBulk || Object.keys(bulkFlags).length === 0}
            size="sm"
          >
            <Save className={`h-4 w-4 mr-2 ${applyingBulk ? 'animate-spin' : ''}`} />
            {applyingBulk ? 'Applying...' : 'Apply Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}

