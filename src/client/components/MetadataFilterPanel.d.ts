export interface MetadataFilters {
    documentTypes?: string[];
    dateFrom?: string;
    dateTo?: string;
    themes?: string[];
    issuingAuthorities?: string[];
    documentStatuses?: string[];
}
export interface MetadataFilterPanelProps {
    filters: MetadataFilters;
    onFiltersChange: (filters: MetadataFilters) => void;
    availableOptions?: {
        documentTypes?: string[];
        themes?: string[];
        issuingAuthorities?: string[];
        documentStatuses?: string[];
    };
    className?: string;
}
export declare function MetadataFilterPanel({ filters, onFiltersChange, availableOptions, className }: MetadataFilterPanelProps): import("react/jsx-runtime").JSX.Element;
