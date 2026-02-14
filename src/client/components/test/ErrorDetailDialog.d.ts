interface ErrorDetailDialogProps {
    fingerprint: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}
export declare function ErrorDetailDialog({ fingerprint, open, onOpenChange }: ErrorDetailDialogProps): import("react/jsx-runtime").JSX.Element | null;
export {};
