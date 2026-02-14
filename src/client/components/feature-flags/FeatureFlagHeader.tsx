import { Button } from '../ui/button';
import { Layers, Save, Settings, X, RefreshCw } from 'lucide-react';
import { t } from '../../utils/i18n';

interface FeatureFlagHeaderProps {
  bulkEditMode: boolean;
  draftMode: boolean;
  databaseFlagsCount: number;
  savingDraft: boolean;
  refreshing: boolean;
  hasPendingChanges: boolean;
  pendingChangesCount: number;
  onNavigateToTemplates: () => void;
  onSaveTemplate: () => void;
  onEnableDraftMode: () => void;
  onStartBulkEdit: () => void;
  onCancelDraftMode: () => void;
  onSaveDraftChanges: () => void;
  onRefreshCache: () => void;
}

export function FeatureFlagHeader({
  bulkEditMode,
  draftMode,
  databaseFlagsCount,
  savingDraft,
  refreshing,
  hasPendingChanges,
  pendingChangesCount,
  onNavigateToTemplates,
  onSaveTemplate,
  onEnableDraftMode,
  onStartBulkEdit,
  onCancelDraftMode,
  onSaveDraftChanges,
  onRefreshCache,
}: FeatureFlagHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">{t('featureFlags.title')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('featureFlags.description')}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={onNavigateToTemplates}
          variant="outline"
          size="sm"
        >
          <Layers className="h-4 w-4 mr-2" />
          {t('featureFlags.viewTemplates')}
        </Button>
        {!bulkEditMode && !draftMode && databaseFlagsCount > 0 && (
          <>
            <Button
              onClick={onSaveTemplate}
              variant="outline"
              size="sm"
            >
              <Save className="h-4 w-4 mr-2" />
              {t('featureFlags.saveAsTemplate')}
            </Button>
            <Button
              onClick={onEnableDraftMode}
              variant="outline"
              size="sm"
            >
              <Settings className="h-4 w-4 mr-2" />
              {t('featureFlags.editMode')}
            </Button>
            <Button
              onClick={onStartBulkEdit}
              variant="outline"
              size="sm"
            >
              <Save className="h-4 w-4 mr-2" />
              {t('featureFlags.bulkEdit')}
            </Button>
          </>
        )}
        {draftMode && (
          <>
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
              onClick={onSaveTemplate}
              variant="outline"
              size="sm"
              disabled={savingDraft}
            >
              <Save className="h-4 w-4 mr-2" />
              {t('featureFlags.saveAsTemplate')}
            </Button>
          </>
        )}
        <Button
          onClick={onRefreshCache}
          disabled={refreshing || draftMode}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          {t('featureFlags.refreshCache')}
        </Button>
      </div>
    </div>
  );
}

