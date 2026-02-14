/**
 * Step2 Action Buttons Component
 * 
 * Navigation buttons, scrape button, save draft, progress indicator,
 * and completion button for Step2WebsiteSelection.
 */

import { memo } from 'react';
import { ArrowLeft, ArrowRight, RefreshCw, Clock, Save } from 'lucide-react';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { ScrapingInfoDialog } from './ScrapingInfoDialog';
import { t } from '../../utils/i18n';
import { toast } from '../../utils/toast';
import { logError } from '../../utils/errorHandler';
import { formatWebsiteCount } from '../../utils/draftFormatters.js';

interface Step2ActionButtonsProps {
  // Navigation
  onBack: () => void;
  onNavigateToStep3: () => Promise<void>;
  handleStepNavigation?: (step: number) => Promise<void>;
  
  // Scraping state
  isScrapingWebsites: boolean;
  scrapingProgress: number;
  scrapingStatus: string;
  scrapingDocumentsFound: number;
  scrapingEstimatedTime?: number;
  documents: unknown[];
  
  // Selection state
  selectedWebsites: string[];
  canProceedStep4: boolean;
  
  // Scraping actions
  onScrapeWebsites: () => Promise<void>;
  
  // Draft persistence
  saveDraftToStorage: () => void;
  
  // UI state
  showScrapingInfo: boolean;
  onShowScrapingInfoChange: (show: boolean) => void;
  workflowRunId: string | null;
}

function Step2ActionButtonsComponent({
  onBack,
  onNavigateToStep3,
  handleStepNavigation,
  isScrapingWebsites,
  scrapingProgress,
  scrapingStatus,
  scrapingDocumentsFound,
  scrapingEstimatedTime,
  documents,
  selectedWebsites,
  canProceedStep4,
  onScrapeWebsites,
  saveDraftToStorage,
  showScrapingInfo,
  onShowScrapingInfoChange,
  workflowRunId: _workflowRunId,
}: Step2ActionButtonsProps) {
  const handleScrapeClick = async () => {
    // Always call onScrapeWebsites, even with 0 websites
    // The workflow will query DSO, IPLO, Rechtspraak, and other sources
    // even when no websites are selected
    try {
      await onScrapeWebsites();
    } catch (error) {
      logError(error instanceof Error ? error : new Error(t('workflow.failedToStart')), 'start-workflow');
      // If workflow start fails, still try to navigate to step 3
      // This allows users to see the error state and potentially retry
      try {
        if (handleStepNavigation) {
          await handleStepNavigation(3);
        } else {
          await onNavigateToStep3();
        }
      } catch (navError) {
        logError(navError instanceof Error ? navError : new Error(t('workflow.failedToNavigateToStep3')), 'navigate-to-step3');
      }
    }
  };

  const handleGoToResults = async () => {
    try {
      if (handleStepNavigation) {
        await handleStepNavigation(3);
      } else {
        await onNavigateToStep3();
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error(t('workflow.failedToNavigateToStep3')), 'navigate-to-step3-results');
    }
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4 mt-8">
      <Button
        onClick={onBack}
        variant="outline"
        className="flex items-center justify-center gap-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-offset-2 border-border text-foreground hover:bg-muted"
        disabled={isScrapingWebsites}
        data-testid="step2-back-button"
        aria-label={t('step2.previousStep')}
      >
        <ArrowLeft className="w-4 h-4" />
        {t('step2.previous')}
      </Button>
      {!isScrapingWebsites && documents.length === 0 && (
        <div className="flex items-center gap-2">
          <ScrapingInfoDialog
            open={showScrapingInfo}
            onOpenChange={onShowScrapingInfoChange}
            disabled={!canProceedStep4}
          />
          <Button
            data-testid="scrape-websites-button"
            onClick={handleScrapeClick}
            disabled={!canProceedStep4}
            className={`flex items-center justify-center gap-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              canProceedStep4 ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground'
            }`}
            style={{
              opacity: canProceedStep4 ? 1 : 0.5
            }}
            aria-label={selectedWebsites.length > 0
              ? t('step2.startWorkflowWithWebsites')
                .replace('{{count}}', String(selectedWebsites.length))
                .replace('{{plural}}', selectedWebsites.length !== 1 ? 's' : '')
              : t('step2.startWorkflowWithoutWebsites')}
          >
            {selectedWebsites.length > 0
              ? `${t('beleidsscan.scrape')} ${formatWebsiteCount(selectedWebsites.length)}`
              : t('beleidsscan.startWorkflowWithoutWebsites')}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Button>
          {/* Save Draft Button */}
          <Button
            onClick={() => {
              saveDraftToStorage();
              toast.success(t('beleidsscan.draftSaved'), t('beleidsscan.draftSavedDesc'));
            }}
            variant="outline"
            size="sm"
            className="flex items-center gap-2 border-border text-foreground hover:bg-muted"
            title={t('beleidsscan.saveProgressTooltip')}
            aria-label={t('beleidsscan.saveProgressTooltip')}
          >
            <Save className="w-4 h-4" aria-hidden="true" />
            {t('common.save')}
          </Button>
        </div>
      )}
      {isScrapingWebsites && (
        <div className="flex-1 space-y-3">
          <Button
            disabled
            className="flex items-center gap-2 w-full bg-primary text-primary-foreground opacity-70"
            aria-label={t('step2.scrapingInProgress')}
            aria-busy="true"
          >
            <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
            {t('beleidsscan.scraping')}
          </Button>
          {/* Enhanced progress visibility - IMPROVED */}
          <div className="space-y-3 p-4 rounded-lg border-2 border-primary bg-primary/5">
            {scrapingProgress > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-foreground">
                    {t('step2.progress')} {scrapingProgress}%
                  </span>
                  {scrapingEstimatedTime && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      ~{scrapingEstimatedTime} {t('step2.remainingTime')}
                    </span>
                  )}
                </div>
                <Progress value={scrapingProgress} className="h-3" />
                {scrapingStatus && (
                  <p className="text-xs text-muted-foreground">
                    {scrapingStatus}
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center justify-between text-sm pt-2 border-t border-primary/20">
              <span className="text-foreground">
                <strong className="text-primary">{scrapingDocumentsFound}</strong> {t('step2.documentsFound')}
              </span>
            </div>
          </div>
        </div>
      )}
      {!isScrapingWebsites && scrapingProgress === 100 && scrapingStatus === t('step2.scrapingCompleted') && (
        <Button
          data-testid="go-to-results-button"
          onClick={handleGoToResults}
          className="flex items-center justify-center gap-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90"
          aria-label={
            documents.length > 0
              ? t('step2.goToStep3WithDocuments').replace('{{count}}', String(documents.length))
              : t('step2.goToStep3')
          }
        >
          {documents.length > 0 ? (
            <>{t('step2.goToResults')} ({documents.length})</>
          ) : (
            <>{t('step2.goToResults')}</>
          )}
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

// Memoize Step2ActionButtons to prevent unnecessary re-renders
// Only re-render when props actually change
export const Step2ActionButtons = memo(Step2ActionButtonsComponent, (prevProps, nextProps) => {
  return (
    prevProps.onBack === nextProps.onBack &&
    prevProps.onNavigateToStep3 === nextProps.onNavigateToStep3 &&
    prevProps.handleStepNavigation === nextProps.handleStepNavigation &&
    prevProps.isScrapingWebsites === nextProps.isScrapingWebsites &&
    prevProps.scrapingProgress === nextProps.scrapingProgress &&
    prevProps.scrapingStatus === nextProps.scrapingStatus &&
    prevProps.scrapingDocumentsFound === nextProps.scrapingDocumentsFound &&
    prevProps.scrapingEstimatedTime === nextProps.scrapingEstimatedTime &&
    prevProps.documents.length === nextProps.documents.length &&
    prevProps.selectedWebsites.length === nextProps.selectedWebsites.length &&
    prevProps.canProceedStep4 === nextProps.canProceedStep4 &&
    prevProps.onScrapeWebsites === nextProps.onScrapeWebsites &&
    prevProps.saveDraftToStorage === nextProps.saveDraftToStorage &&
    prevProps.showScrapingInfo === nextProps.showScrapingInfo &&
    prevProps.onShowScrapingInfoChange === nextProps.onShowScrapingInfoChange &&
    prevProps.workflowRunId === nextProps.workflowRunId // Used in comparison
  );
});
