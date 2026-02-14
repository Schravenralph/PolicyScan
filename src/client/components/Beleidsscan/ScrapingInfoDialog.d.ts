/**
 * Scraping Info Dialog Component
 *
 * Dialog providing information about the scraping process.
 */
interface ScrapingInfoDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    disabled?: boolean;
}
declare function ScrapingInfoDialogComponent({ open, onOpenChange, disabled, }: ScrapingInfoDialogProps): import("react/jsx-runtime").JSX.Element;
export declare const ScrapingInfoDialog: import("react").MemoExoticComponent<typeof ScrapingInfoDialogComponent>;
export {};
