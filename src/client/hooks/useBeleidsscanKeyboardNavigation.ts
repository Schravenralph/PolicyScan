/**
 * Hook for managing keyboard navigation in Beleidsscan component
 * Extracted from Beleidsscan component to reduce component size
 */

import { useEffect, useCallback } from 'react';

interface UseBeleidsscanKeyboardNavigationProps {
  currentStep: number;
  showGraphVisualizer: boolean;
  showWorkflowImport: boolean;
  canProceedStep1: boolean;
  canProceedStep4: boolean;
  isLoadingWebsites: boolean;
  isScrapingWebsites: boolean;
  documentsCount: number;
  queryId: string | null;
  onGenerateWebsites: () => void;
  onScrapeWebsites: () => void;
  onFinalizeDraft: () => void;
  onPreviousStep: () => void;
  onNextStep: () => void;
  onCloseGraphVisualizer: () => void;
  onCloseWorkflowImport: () => void;
}

/**
 * Hook for managing keyboard navigation in Beleidsscan component
 * Handles Escape key, arrow keys, and Enter key navigation
 */
export function useBeleidsscanKeyboardNavigation({
  currentStep,
  showGraphVisualizer,
  showWorkflowImport,
  canProceedStep1,
  canProceedStep4,
  isLoadingWebsites,
  isScrapingWebsites,
  documentsCount,
  queryId,
  onGenerateWebsites,
  onScrapeWebsites,
  onFinalizeDraft,
  onPreviousStep,
  onNextStep,
  onCloseGraphVisualizer,
  onCloseWorkflowImport,
}: UseBeleidsscanKeyboardNavigationProps) {
  /**
   * Keyboard navigation handler
   */
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Escape key to close modals
    if (e.key === 'Escape') {
      if (showGraphVisualizer) {
        onCloseGraphVisualizer();
      }
      if (showWorkflowImport) {
        onCloseWorkflowImport();
      }
      return;
    }

    // Check if focus is in input/textarea/select - don't interfere with form controls
    const target = e.target as HTMLElement;
    const isInFormControl = 
      target instanceof HTMLInputElement || 
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLButtonElement ||
      target.isContentEditable ||
      target.closest('input, textarea, select, button, [contenteditable="true"], [role="combobox"], [role="listbox"]') !== null;

    // Helper function to proceed to next step
    const proceedToNextStep = () => {
      if (currentStep === 1 && canProceedStep1 && !isLoadingWebsites) {
        onGenerateWebsites();
      } else if (currentStep === 2 && canProceedStep4 && !isScrapingWebsites && documentsCount === 0) {
        onScrapeWebsites();
      } else if (currentStep === 2 && documentsCount > 0) {
        onNextStep();
      } else if (currentStep === 3 && queryId) {
        // On Step 3, Enter/Right finalizes the draft
        onFinalizeDraft();
      }
    };

    // Helper function to go back a step
    const goToPreviousStep = () => {
      if (currentStep > 1) {
        onPreviousStep();
      }
    };

    // Skip navigation if in form control (unless it's a modifier key shortcut)
    if (isInFormControl && !(e.metaKey || e.ctrlKey)) {
      // Allow Enter in form controls for natural form submission
      // Allow arrow keys in form controls for text navigation
      return;
    }

    // Modifier key shortcuts (Cmd/Ctrl) - preserve existing behavior
    if (e.key === 'ArrowLeft' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      goToPreviousStep();
      return;
    }
    
    if (e.key === 'ArrowRight' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      proceedToNextStep();
      return;
    }

    // Plain arrow keys (without modifier) - new behavior
    if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      goToPreviousStep();
      return;
    }

    if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      proceedToNextStep();
      return;
    }

    // Enter key navigation (when not in form control)
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      // Don't prevent default if in a button (allows natural button click)
      if (target instanceof HTMLButtonElement) {
        return;
      }
      // Don't prevent default if in a form with submit button (allows natural form submission)
      const form = target.closest('form');
      if (form && form.querySelector('button[type="submit"], input[type="submit"]')) {
        return;
      }
      // Don't prevent default if in a combobox/listbox (Command component)
      if (target.closest('[role="combobox"], [role="listbox"]')) {
        return;
      }
      e.preventDefault();
      proceedToNextStep();
      return;
    }
  }, [
    currentStep,
    showGraphVisualizer,
    showWorkflowImport,
    canProceedStep1,
    canProceedStep4,
    isLoadingWebsites,
    isScrapingWebsites,
    documentsCount,
    queryId,
    onGenerateWebsites,
    onScrapeWebsites,
    onFinalizeDraft,
    onPreviousStep,
    onNextStep,
    onCloseGraphVisualizer,
    onCloseWorkflowImport,
  ]);

  /**
   * Set up keyboard navigation listeners
   */
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}



