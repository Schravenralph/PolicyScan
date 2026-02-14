/**
 * Draft Management Dialog Component
 * 
 * Consolidated dialog that handles both draft restoration and reconciliation
 * in a single, clean user experience.
 */

import { AlertTriangle, Clock, Server, HardDrive, Save, X, Info, CheckCircle2, Sparkles, RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import type { ReconciliationResult } from '../../services/draftReconciliation.js';
import type { BeleidsscanDraft } from '../../hooks/useDraftPersistence.js';
import { t } from '../../utils/i18n';
import { formatFieldValue as formatDraftFieldValue, formatStep } from '../../utils/draftFormatters.js';

/**
 * Map technical field names to user-friendly labels
 */
function getFieldLabel(field: string): string {
  const fieldLabels: Record<string, string> = {
    step: t('draftManagement.currentStep'),
    queryId: t('draftManagement.queryId'),
    selectedWebsites: t('draftManagement.selectedWebsites'),
    onderwerp: t('draftManagement.subject'),
    overheidslaag: t('draftManagement.governmentLayer'),
    selectedEntity: t('draftManagement.selectedEntity'),
  };
  return fieldLabels[field] || field;
}

/**
 * Format field value for display
 * 
 * Uses explicit domain formatters for all fields.
 */
function formatFieldValue(field: string, value: unknown): string {
  // Use explicit formatters for known domain fields
  if (field === 'step' || field === 'selectedWebsites' || field === 'queryId') {
    return formatDraftFieldValue(field, value);
  }
  
  // For other fields, return string representation
  return String(value ?? '');
}

interface DraftManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  
  // Draft restoration props
  pendingDraft: BeleidsscanDraft | null;
  showRestorePrompt: boolean;
  overheidslagen: Array<{ id: string; label: string }>;
  onRestore: () => void;
  onDiscard: () => void;
  
  // Reconciliation props
  reconciliationResult: ReconciliationResult | null;
  onUseClient: () => void;
  onUseServer: () => void;
  onMerge: () => void;
  onIgnore?: () => void;
  onStartFresh?: () => void;
  
  formatTimestamp: (timestamp?: string | null) => string | null;
}

export function DraftManagementDialog({
  open,
  onOpenChange,
  pendingDraft,
  showRestorePrompt,
  overheidslagen,
  onRestore,
  onDiscard,
  reconciliationResult,
  onUseClient,
  onUseServer,
  onMerge,
  onIgnore,
  onStartFresh,
  formatTimestamp,
}: DraftManagementDialogProps) {
  // Determine dialog state
  const hasDivergence = reconciliationResult?.hasDivergence ?? false;
  const needsRestore = showRestorePrompt && pendingDraft && !hasDivergence;
  const needsReconciliation = hasDivergence && pendingDraft;
  
  // If nothing to show, return null
  if (!needsRestore && !needsReconciliation) {
    return null;
  }

  // If we have both restoration and reconciliation, prioritize reconciliation
  // (reconciliation implies we already have a draft loaded)
  const showReconciliation = needsReconciliation;
  const showRestore = needsRestore && !showReconciliation;

  if (showReconciliation && reconciliationResult) {
    const { divergences, clientNewer, serverNewer } = reconciliationResult;
    const clientTimestamp = pendingDraft?.timestamp || null;
    
    // Filter out queryId from display - it's not user-friendly
    const displayableDivergences = divergences.filter(d => d.field !== 'queryId');
    
    // Determine recommended action
    // Prefer server if newer, otherwise prefer merge for best user experience
    const recommendedAction = serverNewer ? 'server' : (clientNewer ? 'client' : 'merge');

    // Handle dialog close - if user clicks X, treat it as ignore
    const handleDialogChange = (newOpen: boolean) => {
      if (!newOpen && onIgnore) {
        // User closed dialog (X button or ESC) - treat as ignore
        onIgnore();
      }
      onOpenChange(newOpen);
    };

    return (
      <Dialog open={open} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500" aria-hidden="true" />
              {t('draftManagement.divergenceDetected')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('draftManagement.divergenceDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Divergence Summary */}
            <div className="p-4 rounded-lg border bg-background">
              <div className="flex items-start gap-2 mb-3">
                <Info className="w-4 h-4 mt-0.5 text-muted-foreground" aria-hidden="true" />
                <h3 className="font-semibold text-foreground">
                  {t('draftManagement.whatIsDifferent')}
                </h3>
              </div>
              <ul className="space-y-3 text-sm">
                {displayableDivergences.map((divergence, index) => (
                  <li key={index} className="flex flex-col gap-2 p-2 rounded bg-background border border-border">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${divergence.severity === 'high' ? 'bg-red-500' :
                          divergence.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-400'
                        }`} aria-hidden="true" />
                      <strong className="text-foreground">{getFieldLabel(divergence.field)}</strong>
                    </div>
                    <div className="flex items-center gap-3 pl-4 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{t('draftManagement.local')}</span>
                        <span className="text-xs bg-background px-2 py-1 rounded border">
                          {formatFieldValue(divergence.field, divergence.clientValue)}
                        </span>
                      </div>
                      <span className="text-muted-foreground">→</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{t('draftManagement.server')}</span>
                        <span className="text-xs bg-background px-2 py-1 rounded border">
                          {formatFieldValue(divergence.field, divergence.serverValue)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Client Draft Info */}
              <div className={`p-4 rounded-lg border flex flex-col h-full transition-colors ${clientNewer ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' : 'bg-background'}`}>
                <div className="flex items-start gap-3">
                  <HardDrive className={`w-5 h-5 mt-0.5 ${clientNewer ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-foreground">
                        {t('draftManagement.localVersion')}
                      </h4>
                      {clientNewer && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400">
                          {t('draftManagement.newest')}
                        </span>
                      )}
                    </div>
                    {clientTimestamp && (
                      <div className="text-sm flex flex-wrap items-center gap-2 text-muted-foreground mb-2">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                          {formatTimestamp(clientTimestamp)}
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t('draftManagement.savedInBrowser')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Server State Info */}
              <div className={`p-4 rounded-lg border flex flex-col h-full transition-colors ${serverNewer ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' : 'bg-background'}`}>
                <div className="flex items-start gap-3">
                  <Server className={`w-5 h-5 mt-0.5 ${serverNewer ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-foreground">
                        {t('draftManagement.serverVersion')}
                      </h4>
                      {serverNewer && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400">
                          {t('draftManagement.newest')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {t('draftManagement.savedOnServer')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('draftManagement.savedOnServerDescription')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-4 border-t mt-2">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => {
                    onUseClient();
                    onOpenChange(false);
                  }}
                  variant={recommendedAction === 'client' ? 'default' : 'outline'}
                  className={`flex-1 relative ${recommendedAction === 'client' ? 'ring-2 ring-primary' : ''}`}
                >
                  <HardDrive className="w-4 h-4 mr-2" aria-hidden="true" />
                  {t('draftManagement.useLocalButton')}
                  {recommendedAction === 'client' && (
                    <CheckCircle2 className="w-4 h-4 ml-2" aria-hidden="true" />
                  )}
                </Button>
                <Button
                  onClick={() => {
                    onUseServer();
                    onOpenChange(false);
                  }}
                  variant={recommendedAction === 'server' ? 'default' : 'outline'}
                  className={`flex-1 relative ${recommendedAction === 'server' ? 'ring-2 ring-primary' : ''}`}
                >
                  <Server className="w-4 h-4 mr-2" aria-hidden="true" />
                  {t('draftManagement.useServerButton')}
                  {recommendedAction === 'server' && (
                    <CheckCircle2 className="w-4 h-4 ml-2" aria-hidden="true" />
                  )}
                </Button>
                <Button
                  onClick={() => {
                    onMerge();
                    onOpenChange(false);
                  }}
                  variant={recommendedAction === 'merge' ? 'default' : 'outline'}
                  className={`flex-1 sm:flex-[1.2] relative ${recommendedAction === 'merge' ? 'ring-2 ring-primary' : ''}`}
                >
                  <Sparkles className="w-4 h-4 mr-2" aria-hidden="true" />
                  {t('draftManagement.mergeButton')}
                  {recommendedAction === 'merge' && (
                    <CheckCircle2 className="w-4 h-4 ml-2" aria-hidden="true" />
                  )}
                </Button>
              </div>
              
              {/* Help text */}
              <div className="space-y-2 text-xs text-muted-foreground bg-background border border-border p-3 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{t('draftManagement.whatDoesEachOption')}</p>
                    <ul className="space-y-1 list-disc list-inside ml-1">
                      <li><strong>{t('draftManagement.useLocalButton')}:</strong> {t('draftManagement.useLocalDescription')}</li>
                      <li><strong>{t('draftManagement.useServerButton')}:</strong> {t('draftManagement.useServerDescription')}</li>
                      <li><strong>{t('draftManagement.mergeButton')}:</strong> {t('draftManagement.mergeDescription')}</li>
                    </ul>
                    {recommendedAction && (
                      <p className="mt-2 pt-2 border-t border-border">
                        <strong className="text-foreground">{t('draftManagement.recommended')}</strong> {
                          recommendedAction === 'server' ? t('draftManagement.useServerVersion') :
                          recommendedAction === 'merge' ? t('draftManagement.mergeVersions') :
                          t('draftManagement.useLocalVersion')
                        }
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              {onIgnore && (
                <Button
                  onClick={() => {
                    onIgnore();
                    onOpenChange(false);
                  }}
                  variant="ghost"
                  className="w-full border-dashed text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4 mr-2" aria-hidden="true" />
                  {t('draftManagement.ignoreAndContinue')}
                </Button>
              )}
              {onStartFresh && (
                <Button
                  onClick={() => {
                    onStartFresh();
                    onOpenChange(false);
                  }}
                  variant="ghost"
                  className="w-full border-dashed text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="w-4 h-4 mr-2" aria-hidden="true" />
                  {t('draftManagement.startFresh')}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (showRestore && pendingDraft) {
    // Handle dialog close - if user clicks X, treat it as discard
    const handleRestoreDialogChange = (newOpen: boolean) => {
      if (!newOpen) {
        // User closed dialog (X button or ESC) - treat as discard
        onDiscard();
      }
      onOpenChange(newOpen);
    };

    return (
      <Dialog open={open} onOpenChange={handleRestoreDialogChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif font-semibold text-foreground">
              {t('draftManagement.draftFound')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('draftManagement.draftFoundDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {pendingDraft.onderwerp && (
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-xs font-medium mb-1 text-muted-foreground">{t('draftManagement.subject')}</p>
                <p className="text-sm text-foreground">{pendingDraft.onderwerp}</p>
              </div>
            )}
            {pendingDraft.overheidslaag && (
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-xs font-medium mb-1 text-muted-foreground">{t('draftManagement.governmentLayer')}</p>
                <p className="text-sm text-foreground">{overheidslagen.find(l => l.id === pendingDraft.overheidslaag)?.label}</p>
              </div>
            )}
            {pendingDraft.selectedEntity && (
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-xs font-medium mb-1 text-muted-foreground">{t('draftManagement.selectedEntity')}</p>
                <p className="text-sm text-foreground">{pendingDraft.selectedEntity}</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-xs font-medium mb-1 text-muted-foreground">{t('draftManagement.lastSaved')}</p>
                <p className="text-sm text-foreground">{formatTimestamp(pendingDraft.timestamp) || t('common.unknown')}</p>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-xs font-medium mb-1 text-muted-foreground">{t('draftManagement.step')}</p>
                <p className="text-sm text-foreground">{formatStep(pendingDraft.step || 1)}</p>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-xs font-medium mb-1 text-muted-foreground">{t('draftManagement.websitesSelected')}</p>
                <p className="text-sm text-foreground">{pendingDraft.selectedWebsites?.length || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-xs font-medium mb-1 text-muted-foreground">{t('draftManagement.documentsFound')}</p>
                <p className="text-sm text-foreground">{pendingDraft.documents?.length || 0}</p>
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              {t('draftManagement.draftsExpire')}
            </p>
          </div>
          <div className="space-y-3 mt-6">
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  onDiscard();
                  onOpenChange(false);
                }}
                variant="outline"
                className="flex-1 border-border text-foreground hover:bg-background"
              >
                {t('draftManagement.discardAndContinue')}
              </Button>
              <Button
                onClick={() => {
                  onRestore();
                  onOpenChange(false);
                }}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Save className="w-4 h-4 mr-2" />
                {t('draftManagement.restore')}
              </Button>
            </div>
            {onStartFresh ? (
              <Button
                onClick={() => {
                  onStartFresh();
                  onOpenChange(false);
                }}
                variant="ghost"
                className="w-full border-dashed text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="w-4 h-4 mr-2" aria-hidden="true" />
                {t('draftManagement.startFresh')}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  onDiscard();
                  onOpenChange(false);
                }}
                variant="ghost"
                className="w-full border-dashed text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4 mr-2" aria-hidden="true" />
                {t('draftManagement.ignoreAndContinue')}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}

