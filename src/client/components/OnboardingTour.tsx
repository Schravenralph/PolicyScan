import React, { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

interface TourStep {
  id: string;
  title: string;
  description: string;
  target?: string; // Route or feature to highlight
  icon?: React.ReactNode;
}

const tourSteps: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welkom bij Beleidsscan!',
    description: 'Beleidsscan helpt je om beleidsdocumenten van Nederlandse overheden te vinden en te analyseren. Laten we je snel rondleiden.',
  },
  {
    id: 'search',
    title: 'Zoeken',
    description: 'Gebruik de zoekpagina om te zoeken naar beleidsdocumenten op onderwerp, locatie of jurisdictieniveau.',
    target: '/search',
  },
  {
    id: 'workflows',
    title: 'Workflows (Developers)',
    description: 'Als developer kun je workflows maken om automatisch websites te monitoren en nieuwe documenten te vinden.',
    target: '/workflows',
  },
  {
    id: 'help',
    title: 'Help & Documentatie',
    description: 'Heb je vragen? Bezoek het Help Center voor tutorials, handleidingen en veelgestelde vragen.',
    target: '/help',
  },
];

export function OnboardingTour() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Check if user has completed onboarding
    const onboardingCompleted = localStorage.getItem(`onboarding_completed_${user._id}`);
    if (onboardingCompleted === 'true') {
      return;
    }

    // Check if this is first login (no lastLogin or very recent registration)
    // For now, we'll show it if they haven't completed it
    // In a real implementation, you'd check the user's registration date or firstLogin flag
    const hasSeenTour = localStorage.getItem(`onboarding_seen_${user._id}`);
    if (!hasSeenTour) {
      // Small delay to ensure page is loaded
      setTimeout(() => {
        setIsOpen(true);
      }, 500);
    }
  }, [user]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    if (user) {
      localStorage.setItem(`onboarding_seen_${user._id}`, 'true');
    }
    setIsOpen(false);
  };

  const handleComplete = () => {
    if (user) {
      localStorage.setItem(`onboarding_completed_${user._id}`, 'true');
      localStorage.setItem(`onboarding_seen_${user._id}`, 'true');
    }
    setCompleted(true);
    setIsOpen(false);
  };

  const handleGoToFeature = () => {
    const step = tourSteps[currentStep];
    if (step.target) {
      navigate(step.target);
      handleNext();
    } else {
      handleNext();
    }
  };

  if (!isOpen && !completed) return null;

  const currentStepData = tourSteps[currentStep];
  const isLastStep = currentStep === tourSteps.length - 1;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">{currentStepData.title}</DialogTitle>
          <DialogDescription className="text-base mt-2">
            {currentStepData.description}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 my-4">
          {tourSteps.map((_, index) => (
            <div
              key={index}
              className={`h-2 w-2 rounded-full transition-colors ${
                index <= currentStep ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>

        <div className="text-sm text-gray-500 text-center">
          Stap {currentStep + 1} van {tourSteps.length}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="ghost" onClick={handleSkip}>
            Overslaan
          </Button>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={() => setCurrentStep(currentStep - 1)}
              >
                Vorige
              </Button>
            )}
            {currentStepData.target ? (
              <Button onClick={handleGoToFeature}>
                {isLastStep ? 'Voltooien' : 'Ga naar functie'}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={handleNext}>
                {isLastStep ? 'Voltooien' : 'Volgende'}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

