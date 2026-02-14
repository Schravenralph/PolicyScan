import { useEffect, useRef } from 'react';

/**
 * Hook to trap focus within a modal element
 * Ensures keyboard navigation (Tab/Shift+Tab) stays within the modal
 * and handles Escape key to close
 */
export function useFocusTrap(
  isOpen: boolean,
  onClose?: () => void,
  containerRef?: React.RefObject<HTMLElement>
) {
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Restore focus to previous element when modal closes
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
        previousActiveElementRef.current = null;
      }
      return;
    }

    // Store the currently focused element before opening modal
    previousActiveElementRef.current = document.activeElement as HTMLElement;

    // Get the modal container
    const modal = containerRef?.current || modalRef.current;
    if (!modal) return;

    // Find all focusable elements within the modal
    const getFocusableElements = (): HTMLElement[] => {
      const focusableSelectors = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ');

      return Array.from(modal.querySelectorAll(focusableSelectors)) as HTMLElement[];
    };

    // Focus the first focusable element
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      // Small delay to ensure modal is fully rendered
      setTimeout(() => {
        focusableElements[0]?.focus();
      }, 0);
    }

    // Handle Tab key to cycle through focusable elements
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: going backwards
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: going forwards
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      } else if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        onClose();
      }
    };

    // Add event listener
    modal.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      modal.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, containerRef]);

  return modalRef;
}

