/**
 * Website Error Display Component
 *
 * Displays error messages for website suggestions with user-friendly
 * messages and guidance.
 */
interface WebsiteErrorDisplayProps {
    error: Error | null;
    onClose: () => void;
}
declare function WebsiteErrorDisplayComponent({ error, onClose, }: WebsiteErrorDisplayProps): import("react/jsx-runtime").JSX.Element | null;
export declare const WebsiteErrorDisplay: import("react").MemoExoticComponent<typeof WebsiteErrorDisplayComponent>;
export {};
