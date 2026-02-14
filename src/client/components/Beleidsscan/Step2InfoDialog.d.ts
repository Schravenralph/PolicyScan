/**
 * Step2 Info Dialog Component
 *
 * Dialog providing help and information about website selection and scraping.
 */
interface Step2InfoDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}
declare function Step2InfoDialogComponent({ open, onOpenChange, }: Step2InfoDialogProps): import("react/jsx-runtime").JSX.Element;
export declare const Step2InfoDialog: import("react").MemoExoticComponent<typeof Step2InfoDialogComponent>;
export {};
