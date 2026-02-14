/**
 * Consolidated Help Dialog Component
 * 
 * Single, context-aware help dialog that consolidates all step-specific
 * information and reduces visual clutter from multiple info icons.
 */

import { memo } from 'react';
import { 
  HelpCircle, 
  Building2, 
  Map as MapIcon, 
  Search, 
  Zap, 
  FileText, 
  CheckSquare, 
  Filter,
  Sparkles
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { t } from '../../utils/i18n';

interface ConsolidatedHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStep: number;
}

function ConsolidatedHelpDialogComponent({
  open,
  onOpenChange,
  currentStep,
}: ConsolidatedHelpDialogProps) {
  // Determine which tab to show by default based on current step
  const defaultTab = `step-${currentStep}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <HelpCircle className="w-5 h-5 text-primary" aria-hidden="true" />
            {t('consolidatedHelpDialog.title')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('consolidatedHelpDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={defaultTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="step-1">{t('consolidatedHelpDialog.step1')}</TabsTrigger>
            <TabsTrigger value="step-2">{t('consolidatedHelpDialog.step2')}</TabsTrigger>
            <TabsTrigger value="step-3">{t('consolidatedHelpDialog.step3')}</TabsTrigger>
          </TabsList>

          {/* Step 1 Content */}
          <TabsContent value="step-1" className="space-y-4 mt-4">
            <div className="p-4 rounded-lg bg-background border border-border">
              <h3 className="font-semibold mb-2 text-foreground flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                {t('consolidatedHelpDialog.step1Title')}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('consolidatedHelpDialog.step1Description')}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
                  <Building2 className="w-4 h-4 text-primary" />
                  {t('consolidatedHelpDialog.step1SelectLayer')}
                </h4>
                <p className="text-sm mb-2 text-muted-foreground">
                  {t('consolidatedHelpDialog.step1SelectLayerDescription')}
                </p>
                <ul className="text-sm space-y-1 ml-6 list-disc text-foreground">
                  <li><strong>{t('consolidatedHelpDialog.gemeente')}:</strong> {t('consolidatedHelpDialog.gemeenteDescription')}</li>
                  <li><strong>{t('consolidatedHelpDialog.waterschap')}:</strong> {t('consolidatedHelpDialog.waterschapDescription')}</li>
                  <li><strong>{t('consolidatedHelpDialog.provincie')}:</strong> {t('consolidatedHelpDialog.provincieDescription')}</li>
                  <li><strong>{t('consolidatedHelpDialog.rijksoverheid')}:</strong> {t('consolidatedHelpDialog.rijksoverheidDescription')}</li>
                  <li><strong>{t('consolidatedHelpDialog.kennisinstituut')}:</strong> {t('consolidatedHelpDialog.kennisinstituutDescription')}</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
                  <MapIcon className="w-4 h-4 text-primary" />
                  {t('consolidatedHelpDialog.step1SelectEntity')}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {t('consolidatedHelpDialog.step1SelectEntityDescription')}
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
                  <Search className="w-4 h-4 text-primary" />
                  {t('consolidatedHelpDialog.step1EnterSubject')}
                </h4>
                <p className="text-sm mb-2 text-muted-foreground">
                  {t('consolidatedHelpDialog.step1EnterSubjectDescription')}
                </p>
                <ul className="text-sm space-y-1 ml-6 list-disc text-foreground">
                  <li>{t('consolidatedHelpDialog.step1Tip1')}</li>
                  <li>{t('consolidatedHelpDialog.step1Tip2')}</li>
                  <li>{t('consolidatedHelpDialog.step1Tip3')}</li>
                  <li>{t('consolidatedHelpDialog.step1Tip4')}</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-background border border-border">
                <p className="text-sm font-medium mb-1 text-foreground">
                  {t('consolidatedHelpDialog.step1WhatNext')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('consolidatedHelpDialog.step1WhatNextDescription')}
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Step 2 Content */}
          <TabsContent value="step-2" className="space-y-4 mt-4">
            <div className="p-4 rounded-lg bg-background border border-border">
              <h3 className="font-semibold mb-2 text-foreground flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                {t('consolidatedHelpDialog.step2Title')}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('consolidatedHelpDialog.step2Description')}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
                  <Search className="w-4 h-4 text-primary" />
                  {t('consolidatedHelpDialog.step2WebsiteSelection')}
                </h4>
                <p className="text-sm mb-2 text-muted-foreground">
                  {t('consolidatedHelpDialog.step2WebsiteSelectionDescription')}
                </p>
                <ul className="text-sm space-y-1 ml-6 list-disc text-foreground">
                  <li><strong>{t('consolidatedHelpDialog.search')}:</strong> {t('consolidatedHelpDialog.searchDescription')}</li>
                  <li><strong>{t('consolidatedHelpDialog.filter')}:</strong> {t('consolidatedHelpDialog.filterDescription')}</li>
                  <li><strong>{t('consolidatedHelpDialog.sort')}:</strong> {t('consolidatedHelpDialog.sortDescription')}</li>
                  <li><strong>{t('consolidatedHelpDialog.selectAll')}:</strong> {t('consolidatedHelpDialog.selectAllDescription')}</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
                  <Zap className="w-4 h-4 text-primary" />
                  {t('consolidatedHelpDialog.step2ScrapingTitle')}
                </h4>
                <p className="text-sm mb-2 text-muted-foreground">
                  {t('consolidatedHelpDialog.step2ScrapingDescription')}
                </p>
                <ul className="text-sm space-y-1 ml-6 list-disc text-foreground">
                  <li>{t('consolidatedHelpDialog.step2ScrapingPoint1')}</li>
                  <li>{t('consolidatedHelpDialog.step2ScrapingPoint2')}</li>
                  <li>{t('consolidatedHelpDialog.step2ScrapingPoint3')}</li>
                  <li>{t('consolidatedHelpDialog.step2ScrapingPoint4')}</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
                  <FileText className="w-4 h-4 text-primary" />
                  {t('consolidatedHelpDialog.step2GraphVisualization')}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {t('consolidatedHelpDialog.step2GraphVisualizationDescription')}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-background border border-border">
                <p className="text-sm font-medium mb-1 text-foreground">
                  {t('consolidatedHelpDialog.step2Tip')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('consolidatedHelpDialog.step2TipDescription')}
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Step 3 Content */}
          <TabsContent value="step-3" className="space-y-4 mt-4">
            <div className="p-4 rounded-lg bg-background border border-border">
              <h3 className="font-semibold mb-2 text-foreground flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-primary" />
                {t('consolidatedHelpDialog.step3Title')}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('consolidatedHelpDialog.step3Description')}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
                  <CheckSquare className="w-4 h-4 text-primary" />
                  {t('consolidatedHelpDialog.step3DocumentStatuses')}
                </h4>
                <p className="text-sm mb-2 text-muted-foreground">
                  {t('consolidatedHelpDialog.step3DocumentStatusesDescription')}
                </p>
                <ul className="text-sm space-y-1 ml-6 list-disc text-foreground">
                  <li><strong>{t('consolidatedHelpDialog.pending')}:</strong> {t('consolidatedHelpDialog.pendingDescription')}</li>
                  <li><strong>{t('consolidatedHelpDialog.approved')}:</strong> {t('consolidatedHelpDialog.approvedDescription')}</li>
                  <li><strong>{t('consolidatedHelpDialog.rejected')}:</strong> {t('consolidatedHelpDialog.rejectedDescription')}</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
                  <Filter className="w-4 h-4 text-primary" />
                  {t('consolidatedHelpDialog.step3FilterAndSort')}
                </h4>
                <p className="text-sm mb-2 text-muted-foreground">
                  {t('consolidatedHelpDialog.step3FilterAndSortDescription')}
                </p>
                <ul className="text-sm space-y-1 ml-6 list-disc text-foreground">
                  <li><strong>{t('consolidatedHelpDialog.all')}:</strong> {t('consolidatedHelpDialog.allDescription')}</li>
                  <li><strong>{t('consolidatedHelpDialog.pending')}:</strong> {t('consolidatedHelpDialog.pendingFilterDescription')}</li>
                  <li><strong>{t('consolidatedHelpDialog.approved')}:</strong> {t('consolidatedHelpDialog.approvedFilterDescription')}</li>
                  <li><strong>{t('consolidatedHelpDialog.rejected')}:</strong> {t('consolidatedHelpDialog.rejectedFilterDescription')}</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
                  <Sparkles className="w-4 h-4 text-primary" />
                  {t('consolidatedHelpDialog.step3BulkActions')}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {t('consolidatedHelpDialog.step3BulkActionsDescription')}
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
                  <FileText className="w-4 h-4 text-primary" />
                  {t('consolidatedHelpDialog.step3DocumentDetails')}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {t('consolidatedHelpDialog.step3DocumentDetailsDescription')}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-background border border-border">
                <p className="text-sm font-medium mb-1 text-foreground">
                  {t('consolidatedHelpDialog.step3NextSteps')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('consolidatedHelpDialog.step3NextStepsDescription')}
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export const ConsolidatedHelpDialog = memo(ConsolidatedHelpDialogComponent);
