import { memo, useMemo } from 'react';
import { Check } from 'lucide-react';
import { t } from '../../utils/i18n';

interface StepNavigationProps {
  currentStep: number;
  onStepClick: (step: number) => void;
  wizardSession?: {
    currentStepId: string;
    completedSteps: string[];
  } | null;
}

function StepNavigationComponent({ currentStep, onStepClick, wizardSession }: StepNavigationProps) {
  // Memoize static maps to prevent recreation on every render
  const stepIdMap = useMemo<Record<number, string>>(() => ({
    1: 'query-configuration',
    2: 'website-selection',
    3: 'document-review',
  }), []);

  const stepLabels = useMemo<Record<number, string>>(() => ({
    1: 'Configureer',
    2: 'Selecteer',
    3: 'Review',
  }), []);

  const stepAnnouncements = useMemo<Record<number, string>>(() => ({
    1: t('stepNavigation.step1Announcement'),
    2: t('stepNavigation.step2Announcement'),
    3: t('stepNavigation.step3Announcement'),
  }), []);

  return (
    <nav className="mb-12" aria-label={t('beleidsscan.scanProgress')}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-foreground">{t('beleidsscan.scanProgress')}</h4>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 mb-4">
        {[1, 2, 3].map((step) => {
          const stepId = stepIdMap[step];
          const isCompleted = wizardSession
            ? wizardSession.completedSteps.includes(stepId)
            : currentStep > step;
          const isCurrent = wizardSession
            ? wizardSession.currentStepId === stepId
            : currentStep === step;

          // Check prerequisites: step is accessible if:
          // 1. It's the current step, OR
          // 2. It's completed, OR
          // 3. All previous steps are completed (for sequential navigation)
          // Note: Step 3 only requires step 1 (website selection is optional)
          const stepPrerequisites: Record<number, number[]> = {
            1: [], // Step 1 has no prerequisites
            2: [1], // Step 2 requires step 1
            3: [1], // Step 3 only requires step 1 (step 2 is optional)
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
            <div key={step} className="flex items-center gap-2 sm:gap-4 flex-1">
              <div className="flex flex-col items-center gap-2 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    if (isAccessible) {
                      onStepClick(step);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (isAccessible && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onStepClick(step);
                    }
                    // Arrow key navigation between steps
                    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      const nextStep = Math.min(step + 1, 3);
                      const nextButton = document.querySelector(`[data-testid="step-navigation-button-${nextStep}"]`) as HTMLButtonElement;
                      if (nextButton && !nextButton.disabled) {
                        nextButton.focus();
                      }
                    }
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      const prevStep = Math.max(step - 1, 1);
                      const prevButton = document.querySelector(`[data-testid="step-navigation-button-${prevStep}"]`) as HTMLButtonElement;
                      if (prevButton && !prevButton.disabled) {
                        prevButton.focus();
                      }
                    }
                  }}
                  disabled={!isAccessible}
                  data-testid={`step-navigation-button-${step}`}
                  className={`min-w-11 min-h-11 w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all relative z-10 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 ${isCompleted || isCurrent
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                    : 'bg-muted text-muted-foreground'
                    }`}
                  style={{
                    cursor: isAccessible ? 'pointer' : 'not-allowed',
                  }}
                  aria-label={`${t('stepNavigation.step').replace('{{number}}', String(step))}${isCompleted ? t('stepNavigation.completed') : isCurrent ? t('stepNavigation.currentStep') : ''}`}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5 sm:w-6 sm:h-6" />
                  ) : (
                    <span className="text-sm sm:text-base font-semibold">{step}</span>
                  )}
                </button>
                <div className="hidden sm:block text-xs text-center text-muted-foreground">
                  {stepLabels[step]}
                </div>
              </div>
              {step < 3 && (
                <div
                  className={`flex-1 h-1 rounded transition-all ${isCompleted ? 'bg-primary' : 'bg-muted'
                    }`}
                  style={{
                    transform: isCompleted ? 'scaleY(1.2)' : 'scaleY(1)'
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div
        className="text-center text-sm sr-only text-muted-foreground"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        id="step-announcement"
      >
        {stepAnnouncements[currentStep]}
      </div>
      <div className="text-center text-sm text-muted-foreground" aria-hidden="true">
        Stap {currentStep} van 3
      </div>
    </nav>
  );
}

// Memoize StepNavigation to prevent unnecessary re-renders
// Only re-render when props actually change
export const StepNavigation = memo(StepNavigationComponent, (prevProps, nextProps) => {
  return (
    prevProps.currentStep === nextProps.currentStep &&
    prevProps.onStepClick === nextProps.onStepClick &&
    prevProps.wizardSession?.currentStepId === nextProps.wizardSession?.currentStepId &&
    prevProps.wizardSession?.completedSteps.length === nextProps.wizardSession?.completedSteps.length &&
    // Deep compare completedSteps array
    (prevProps.wizardSession?.completedSteps.every((step, i) => 
      step === nextProps.wizardSession?.completedSteps[i]
    ) ?? true)
  );
});


