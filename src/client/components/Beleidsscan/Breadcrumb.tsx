import { memo, useMemo } from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { Button } from '../ui/button';
import { t } from '../../utils/i18n';

interface BreadcrumbProps {
  currentStep: number;
  onStepClick: (step: number) => void;
  onHomeClick: () => void;
  wizardSession?: {
    currentStepId: string;
    completedSteps: string[];
  } | null;
}

function BreadcrumbComponent({ currentStep, onStepClick, onHomeClick, wizardSession }: BreadcrumbProps) {
  const stepLabels = useMemo<Record<number, string>>(() => ({
    1: t('breadcrumb.step1'),
    2: t('breadcrumb.step2'),
    3: t('breadcrumb.step3'),
  }), []);

  const stepIdMap = useMemo<Record<number, string>>(() => ({
    1: 'query-configuration',
    2: 'website-selection',
    3: 'document-review',
  }), []);

  return (
    <nav className="flex items-center text-sm text-muted-foreground mb-6" aria-label={t('breadcrumb.navigation')}>
      <Button
        variant="ghost"
        size="sm"
        className="p-1 h-auto font-normal text-muted-foreground hover:text-foreground"
        onClick={onHomeClick}
        aria-label={t('breadcrumb.backToOverview')}
      >
        <Home className="w-4 h-4" />
      </Button>

      <ChevronRight className="w-4 h-4 mx-1 text-muted-foreground/50" />

      <span className="text-muted-foreground hidden sm:inline">{t('breadcrumb.beleidsscan')}</span>

      <ChevronRight className="w-4 h-4 mx-1 text-muted-foreground/50 hidden sm:block" />

      <div className="flex items-center flex-wrap">
        {[1, 2, 3].map((step, index) => {
          const isCurrent = currentStep === step;
          const isLast = index === 2;

          // Check accessibility (logic from StepNavigation)
          const stepId = stepIdMap[step];
          const isCompleted = wizardSession
            ? wizardSession.completedSteps.includes(stepId)
            : currentStep > step;

          const stepPrerequisites: Record<number, number[]> = {
            1: [],
            2: [1],
            3: [1],
          };
          const prerequisites = stepPrerequisites[step] || [];
          const prerequisitesCompleted = prerequisites.every(prereqStep => {
            const prereqStepId = stepIdMap[prereqStep];
            return wizardSession
              ? wizardSession.completedSteps.includes(prereqStepId)
              : currentStep > prereqStep;
          });

          const isAccessible = isCurrent || isCompleted || (currentStep >= step && prerequisitesCompleted);

          return (
            <div key={step} className="flex items-center">
              {isAccessible && !isCurrent ? (
                <button
                  type="button"
                  onClick={() => onStepClick(step)}
                  className="hover:text-foreground hover:underline transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-1"
                >
                  {step}. {stepLabels[step]}
                </button>
              ) : (
                <span className={isCurrent ? "font-medium text-foreground" : "opacity-70"}>
                  {step}. {stepLabels[step]}
                </span>
              )}

              {!isLast && (
                <ChevronRight className="w-4 h-4 mx-1 text-muted-foreground/50" />
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export const Breadcrumb = memo(BreadcrumbComponent);
