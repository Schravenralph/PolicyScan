/**
 * Email Export Dialog Component
 *
 * Dialog for sending document exports via email.
 */
interface EmailExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    emailRecipients: string;
    onEmailRecipientsChange: (value: string) => void;
    onEmailExport: () => void;
    exporting: boolean;
    selectedCount: number;
    totalCount: number;
}
export declare function EmailExportDialog({ open, onOpenChange, emailRecipients, onEmailRecipientsChange, onEmailExport, exporting, selectedCount, totalCount, }: EmailExportDialogProps): import("react/jsx-runtime").JSX.Element;
export {};
