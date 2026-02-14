/**
 * Hook to trap focus within a modal element
 * Ensures keyboard navigation (Tab/Shift+Tab) stays within the modal
 * and handles Escape key to close
 */
export declare function useFocusTrap(isOpen: boolean, onClose?: () => void, containerRef?: React.RefObject<HTMLElement>): import("react").RefObject<HTMLDivElement | null>;
