/**
 * Step1 Info Dialog Component
 *
 * Dialog providing help and information about query configuration.
 */
interface Step1InfoDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}
declare function Step1InfoDialogComponent({ open, onOpenChange, }: Step1InfoDialogProps): import("react/jsx-runtime").JSX.Element;
export declare const Step1InfoDialog: import("react").MemoExoticComponent<typeof Step1InfoDialogComponent>;
export {};
