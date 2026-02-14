/**
 * FeatureFlagDraftModeControls Component
 * 
 * Handles draft mode UI and controls for feature flags.
 * Extracted from FeatureFlagsPage.tsx for better organization.
 */

import { GitBranch, Save, X, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { t } from '../../utils/i18n';

export interface FeatureFlagDraftModeControlsProps {
  // State
  draftMode: boolean;
  savingDraft: boolean;
  hasPendingChanges: boolean;
  pendingChangesCount: number;
  
  // Actions
  onEnableDraftMode: () => void;
  onCancelDraftMode: () => void;
  onSaveDraftChanges: () => Promise<void>;
  onSaveAsTemplate: () => void;
}

/**
 * Draft mode controls component for feature flags
 */
export function FeatureFlagDraftModeControls({
  draftMode,
  savingDraft,
  hasPendingChanges,
  pendingChangesCount,
  onEnableDraftMode,
  onCancelDraftMode,
  onSaveDraftChanges,
  onSaveAsTemplate,
}: FeatureFlagDraftModeControlsProps) {
  if (!draftMode) {
    return (
      <Button
        onClick={onEnableDraftMode}
        variant="outline"
        size="sm"
      >
        <GitBranch className="h-4 w-4 mr-2" />
        {t('featureFlags.editMode')}
      </Button>
    );
  }

  return (
    <>
      {/* Draft Mode Action Buttons */}
      <div className="flex items-center gap-2">
        <Button
          onClick={onCancelDraftMode}
          variant="outline"
          size="sm"
          disabled={savingDraft}
        >
          <X className="h-4 w-4 mr-2" />
          {t('featureFlags.cancel')}
        </Button>
        <Button
          onClick={onSaveDraftChanges}
          disabled={savingDraft || !hasPendingChanges}
          size="sm"
          className="bg-primary text-primary-foreground"
        >
          <Save className={`h-4 w-4 mr-2 ${savingDraft ? 'animate-spin' : ''}`} />
          {t('featureFlags.saveChanges')} {hasPendingChanges && `(${pendingChangesCount})`}
        </Button>
        <Button
          onClick={onSaveAsTemplate}
          variant="outline"
          size="sm"
          disabled={savingDraft}
        >
          <Save className="h-4 w-4 mr-2" />
          {t('featureFlags.saveAsTemplate')}
        </Button>
      </div>

      {/* Pending Changes Banner */}
      {hasPendingChanges && (
        <div className="rounded-lg border bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              <div>
                <p className="font-semibold text-yellow-900 dark:text-yellow-100">
                  {t('featureFlags.youHavePendingChanges').replace('{{count}}', String(pendingChangesCount))}
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  {t('featureFlags.clickSaveToApply')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

