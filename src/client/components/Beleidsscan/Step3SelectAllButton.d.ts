/**
 * Step3 Select All Button Component
 *
 * Button to select or deselect all filtered documents.
 */
interface Step3SelectAllButtonProps {
    selectedCount: number;
    totalCount: number;
    onSelectAll: () => void;
    disabled?: boolean;
}
declare function Step3SelectAllButtonComponent({ selectedCount, totalCount, onSelectAll, disabled, }: Step3SelectAllButtonProps): import("react/jsx-runtime").JSX.Element;
export declare const Step3SelectAllButton: import("react").MemoExoticComponent<typeof Step3SelectAllButtonComponent>;
export {};
