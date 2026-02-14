/**
 * Step3 Action Buttons Component
 * 
 * Navigation buttons, save draft, and continue button.
 */

import { memo } from 'react';
import { ArrowLeft, Check, Save } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';

interface Step3ActionButtonsProps {
  onGoToStep2: () => void;
  onSaveDraft: () => void;
  onContinue?: () => void;
}

function Step3ActionButtonsComponent({
  onGoToStep2,
  onSaveDraft,
  onContinue,
}: Step3ActionButtonsProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mt-8">
      <Button
        onClick={onGoToStep2}
        variant="outline"
        className="flex items-center justify-center gap-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-offset-2 border-border text-foreground hover:bg-muted"
        aria-label={t('step3.backToStep2Aria')}
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        {t('step3.backToStep2')}
      </Button>
      {/* Save Draft Button */}
      <Button
        onClick={() => {
          onSaveDraft();
          toast.success(t('step3.draftSaved'), t('step3.draftSavedDescription'));
        }}
        variant="outline"
        size="sm"
        className="flex items-center gap-2 border-border text-foreground hover:bg-muted"
        title={t('beleidsscan.saveProgressTooltip')}
        aria-label={t('beleidsscan.saveProgressTooltip')}
      >
        <Save className="w-4 h-4" aria-hidden="true" />
        {t('step3.save')}
      </Button>
      <Button
        onClick={onContinue}
        disabled={!onContinue}
        className="flex items-center justify-center gap-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90"
        aria-label={t('step3.completeAria')}
      >
        <Check className="w-4 h-4" aria-hidden="true" />
        {t('step3.complete')}
      </Button>
    </div>
  );
}

// Memoize Step3ActionButtons to prevent unnecessary re-renders
// Only re-render when props actually change
export const Step3ActionButtons = memo(Step3ActionButtonsComponent, (prevProps, nextProps) => {
  return (
    prevProps.onGoToStep2 === nextProps.onGoToStep2 &&
    prevProps.onSaveDraft === nextProps.onSaveDraft &&
    prevProps.onContinue === nextProps.onContinue
  );
});
