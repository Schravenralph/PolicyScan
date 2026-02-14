/**
 * BronnenOverzicht Action Buttons Component
 *
 * Back and continue buttons for navigation.
 */
interface BronnenOverzichtActionsProps {
    onBack: () => void;
    approvedCount: number;
    onContinue?: () => void;
}
export declare function BronnenOverzichtActions({ onBack, approvedCount, onContinue, }: BronnenOverzichtActionsProps): import("react/jsx-runtime").JSX.Element;
export {};
