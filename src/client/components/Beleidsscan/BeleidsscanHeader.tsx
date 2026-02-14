import { memo } from 'react';
import { ArrowLeft, Save, Check, X, Edit, Copy, History, RotateCcw, HelpCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { t } from '../../utils/i18n';

const logo = '/logo.svg';

interface BeleidsscanHeaderProps {
  currentStep: number;
  queryId: string | null;
  isEditingCompletedSet: boolean;
  originalQueryId: string | null;
  hasDraft: boolean;
  lastDraftSavedAt: string | null;
  onBack: () => void;
  onShowPreviousSets: () => void;
  onSaveDraft: () => void;
  onFinalizeDraft: () => void;
  onUpdateCompletedSet: () => void;
  onDuplicateCompletedSet: () => void;
  onDiscardLoadedSet: () => void;
  onStartFresh?: () => void;
  onShowHelp?: () => void;
  formatDraftTimestamp: (timestamp?: string | null) => string | null;
}

function BeleidsscanHeaderComponent({
  currentStep,
  queryId,
  isEditingCompletedSet,
  originalQueryId,
  hasDraft,
  lastDraftSavedAt,
  onBack,
  onShowPreviousSets,
  onSaveDraft,
  onFinalizeDraft,
  onUpdateCompletedSet,
  onDuplicateCompletedSet,
  onDiscardLoadedSet,
  onStartFresh,
  onShowHelp,
  formatDraftTimestamp,
}: BeleidsscanHeaderProps) {
  return (
    <header className="border-b bg-background" role="banner">
      <div className="container mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt={t('beleidsscanHeader.logo')} className="w-12 h-12" role="img" aria-label={t('beleidsscanHeader.logo')} />
            <div>
              <h1 className="tracking-widest text-foreground" style={{ letterSpacing: '0.2em' }}>
                RUIMTEMEESTERS
              </h1>
              <p className="text-sm text-muted-foreground">
                Kleine acties. Grote impact.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Central Help Button - always visible */}
            {onShowHelp && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onShowHelp}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                aria-label={t('beleidsscanHeader.helpAria')}
                title={t('beleidsscanHeader.helpTitle')}
              >
                <HelpCircle className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t('beleidsscanHeader.help')}</span>
              </Button>
            )}
            {/* Edit Mode Indicator - visible when editing a completed set */}
            {isEditingCompletedSet && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/50 text-muted-foreground">
                <Edit className="w-4 h-4" aria-hidden="true" />
                <span className="text-sm font-medium text-foreground">
                  {t('beleidsscanHeader.editMode')}
                </span>
              </div>
            )}

            {/* Start Fresh Button - visible when there's a draft or query, not editing */}
            {onStartFresh && (hasDraft || queryId) && !isEditingCompletedSet && (
              <Button
                variant="outline"
                size="sm"
                onClick={onStartFresh}
                className="flex items-center gap-2"
                aria-label={t('beleidsscanHeader.startFreshAria')}
                title={t('beleidsscanHeader.startFreshTitle')}
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t('beleidsscanHeader.startFresh')}</span>
              </Button>
            )}

            {/* Previous Sets Button - always visible */}
            <Button
              variant="outline"
              size="sm"
              onClick={onShowPreviousSets}
              className="flex items-center gap-2"
              aria-label={t('beleidsscanHeader.previousSetsAria')}
              title={t('beleidsscanHeader.previousSetsTitle')}
            >
              <History className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('beleidsscanHeader.previousSets')}</span>
            </Button>

            {/* Save Draft Button - visible on all steps when there's meaningful state and not editing */}
            {hasDraft && !isEditingCompletedSet && (
              <Button
                variant="outline"
                size="sm"
                onClick={onSaveDraft}
                className="flex items-center gap-2 border-primary text-primary hover:bg-primary/10"
                aria-label={t('step2.saveDraftManually')}
                title={lastDraftSavedAt ? t('step2.lastSaved').replace('{{timestamp}}', formatDraftTimestamp(lastDraftSavedAt) ?? '') : t('step2.saveDraft')}
              >
                <Save className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">
                  {lastDraftSavedAt ? t('beleidsscan.saved') : t('beleidsscan.save')}
                </span>
              </Button>
            )}

            {/* Update/Duplicate Buttons - visible when editing a completed set */}
            {isEditingCompletedSet && originalQueryId && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onUpdateCompletedSet}
                  className="flex items-center gap-2 border-primary text-primary hover:bg-primary/10"
                  aria-label={t('beleidsscan.updateQuery')}
                  title={t('beleidsscan.updateQueryTooltip')}
                >
                  <Save className="w-4 h-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t('beleidsscanHeader.update')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDuplicateCompletedSet}
                  className="flex items-center gap-2"
                  aria-label={t('beleidsscan.saveAsNew')}
                  title={t('beleidsscan.saveAsNewTooltip')}
                >
                  <Copy className="w-4 h-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t('beleidsscanHeader.saveAsNew')}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDiscardLoadedSet}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                  aria-label={t('beleidsscan.cancelEdit')}
                  title={t('beleidsscan.cancelEditTooltip')}
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t('beleidsscanHeader.cancel')}</span>
                </Button>
              </>
            )}

            {/* Finalize Button - visible on Step 3 when query exists and not editing */}
            {currentStep === 3 && queryId && !isEditingCompletedSet && (
              <Button
                variant="default"
                size="sm"
                onClick={onFinalizeDraft}
                className="flex items-center gap-2"
                aria-label={t('beleidsscan.completeQuery')}
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t('beleidsscanHeader.complete')}</span>
              </Button>
            )}

            <Button
              variant="ghost"
              onClick={onBack}
              className="flex items-center gap-2"
              aria-label={t('beleidsscanHeader.backToPortal')}
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
              <span>Terug naar portaal</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

// Memoize BeleidsscanHeader to prevent unnecessary re-renders
// Only re-render when props actually change
export const BeleidsscanHeader = memo(BeleidsscanHeaderComponent, (prevProps, nextProps) => {
  return (
    prevProps.currentStep === nextProps.currentStep &&
    prevProps.queryId === nextProps.queryId &&
    prevProps.isEditingCompletedSet === nextProps.isEditingCompletedSet &&
    prevProps.originalQueryId === nextProps.originalQueryId &&
    prevProps.hasDraft === nextProps.hasDraft &&
    prevProps.lastDraftSavedAt === nextProps.lastDraftSavedAt &&
    prevProps.onBack === nextProps.onBack &&
    prevProps.onShowPreviousSets === nextProps.onShowPreviousSets &&
    prevProps.onSaveDraft === nextProps.onSaveDraft &&
    prevProps.onFinalizeDraft === nextProps.onFinalizeDraft &&
    prevProps.onUpdateCompletedSet === nextProps.onUpdateCompletedSet &&
    prevProps.onDuplicateCompletedSet === nextProps.onDuplicateCompletedSet &&
    prevProps.onDiscardLoadedSet === nextProps.onDiscardLoadedSet &&
    prevProps.onStartFresh === nextProps.onStartFresh &&
    prevProps.formatDraftTimestamp === nextProps.formatDraftTimestamp
  );
});


