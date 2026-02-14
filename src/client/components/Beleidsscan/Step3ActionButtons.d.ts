/**
 * Step3 Action Buttons Component
 *
 * Navigation buttons, save draft, and continue button.
 */
interface Step3ActionButtonsProps {
    onGoToStep2: () => void;
    onSaveDraft: () => void;
    onContinue?: () => void;
}
declare function Step3ActionButtonsComponent({ onGoToStep2, onSaveDraft, onContinue, }: Step3ActionButtonsProps): import("react/jsx-runtime").JSX.Element;
export declare const Step3ActionButtons: import("react").MemoExoticComponent<typeof Step3ActionButtonsComponent>;
export {};
