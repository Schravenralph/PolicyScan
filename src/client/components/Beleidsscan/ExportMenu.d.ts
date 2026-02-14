/**
 * Export Menu Component
 *
 * Dropdown menu for exporting documents in various formats
 * with scope selection (all/filtered/selected) and format information.
 */
type ExportFormat = 'csv' | 'json' | 'markdown' | 'xlsx';
type ExportScope = 'all' | 'filtered' | 'selected';
interface ExportMenuProps {
    selectedCount: number;
    onExport: (format: ExportFormat, scope: ExportScope) => void;
}
declare function ExportMenuComponent({ selectedCount, onExport, }: ExportMenuProps): import("react/jsx-runtime").JSX.Element;
export declare const ExportMenu: import("react").MemoExoticComponent<typeof ExportMenuComponent>;
export {};
