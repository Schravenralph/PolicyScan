/**
 * Website Search and Filters Component
 *
 * Search input, filter dropdown, sort dropdown, bulk actions,
 * and selection summary for website selection.
 */
import type { BronWebsite } from '../../services/api';
interface WebsiteSearchAndFiltersProps {
    websiteSearchQuery: string;
    onSearchChange: (query: string) => void;
    websiteFilterType: string | null;
    onFilterChange: (type: string | null) => void;
    websiteSortBy: 'relevance' | 'name' | 'type';
    onSortChange: (sortBy: 'relevance' | 'name' | 'type') => void;
    uniqueWebsiteTypes: string[];
    selectedWebsites: string[];
    filteredAndSortedWebsites: BronWebsite[];
    suggestedWebsites: BronWebsite[];
    onSelectAll: () => void;
    onClearFilters: () => void;
}
declare function WebsiteSearchAndFiltersComponent({ websiteSearchQuery, onSearchChange, websiteFilterType, onFilterChange, websiteSortBy, onSortChange, uniqueWebsiteTypes, selectedWebsites, filteredAndSortedWebsites, suggestedWebsites, onSelectAll, onClearFilters, }: WebsiteSearchAndFiltersProps): import("react/jsx-runtime").JSX.Element;
export declare const WebsiteSearchAndFilters: import("react").MemoExoticComponent<typeof WebsiteSearchAndFiltersComponent>;
export {};
