/**
 * Hook for managing accessibility features in wizard components
 * Extracted from Beleidsscan component to reduce component size
 */

import { useEffect, useCallback } from 'react';

interface UseWizardAccessibilityProps {
  currentStep: number;
  onPreviousStep: () => void;
  onNextStep: () => void;
}

/**
 * Hook for managing focus and keyboard navigation in wizard components
 */
export function useWizardAccessibility({
  currentStep,
  onPreviousStep,
  onNextStep,
}: UseWizardAccessibilityProps) {
  /**
   * Focus management on step transitions for accessibility
   */
  useEffect(() => {
    // Small delay to ensure DOM is updated after step change
    const timeoutId = setTimeout(() => {
      let focusTarget: HTMLElement | null = null;

      if (currentStep === 1) {
        // Focus first overheidslaag button or entity input
        focusTarget = document.querySelector('[data-overheidslaag]') as HTMLElement ||
                      document.getElementById('entity-search-input') as HTMLElement ||
                      document.getElementById('onderwerp-input') as HTMLElement;
      } else if (currentStep === 2) {
        // Focus first website checkbox or search input
        focusTarget = document.querySelector('[data-testid="website-suggestions-list"] button') as HTMLElement ||
                      document.querySelector('[aria-label="Zoek websites"]') as HTMLElement;
      } else if (currentStep === 3) {
        // Focus first document checkbox or search input
        focusTarget = document.querySelector('[data-testid="document-list"] button') as HTMLElement ||
                      document.querySelector('[aria-label="Zoek documenten"]') as HTMLElement;
      }

      if (focusTarget) {
        focusTarget.focus();
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [currentStep]);

  /**
   * Keyboard navigation handler
   */
  const handleKeyboardNavigation = useCallback((e: KeyboardEvent) => {
    // Meta/Ctrl + Arrow keys for step navigation
    if (e.key === 'ArrowLeft' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onPreviousStep();
      return;
    }
    
    if (e.key === 'ArrowRight' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onNextStep();
      return;
    }

    // Plain arrow keys (without modifier) - new behavior
    if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      onPreviousStep();
      return;
    }

    if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      onNextStep();
      return;
    }
  }, [onPreviousStep, onNextStep]);

  /**
   * Set up keyboard navigation listeners
   */
  useEffect(() => {
    window.addEventListener('keydown', handleKeyboardNavigation);
    return () => {
      window.removeEventListener('keydown', handleKeyboardNavigation);
    };
  }, [handleKeyboardNavigation]);
}



