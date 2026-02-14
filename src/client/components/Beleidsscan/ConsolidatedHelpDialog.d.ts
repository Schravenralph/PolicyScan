/**
 * Consolidated Help Dialog Component
 *
 * Single, context-aware help dialog that consolidates all step-specific
 * information and reduces visual clutter from multiple info icons.
 */
interface ConsolidatedHelpDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentStep: number;
}
declare function ConsolidatedHelpDialogComponent({ open, onOpenChange, currentStep, }: ConsolidatedHelpDialogProps): import("react/jsx-runtime").JSX.Element;
export declare const ConsolidatedHelpDialog: import("react").MemoExoticComponent<typeof ConsolidatedHelpDialogComponent>;
export {};
