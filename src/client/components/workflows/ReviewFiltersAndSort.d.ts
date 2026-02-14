/**
 * Review Filters and Sort Component
 *
 * Filter and sort controls for candidate review.
 */
interface ReviewFiltersAndSortProps {
    filterQuery: string;
    onFilterChange: (query: string) => void;
    sortBy: 'relevance' | 'title' | 'url' | 'boost';
    onSortChange: (sortBy: 'relevance' | 'title' | 'url' | 'boost') => void;
    showOnlyAccepted: boolean;
    onShowOnlyAcceptedChange: (show: boolean) => void;
    showOnlyRejected: boolean;
    onShowOnlyRejectedChange: (show: boolean) => void;
    showOnlyPending: boolean;
    onShowOnlyPendingChange: (show: boolean) => void;
}
export declare function ReviewFiltersAndSort({ filterQuery, onFilterChange, sortBy, onSortChange, showOnlyAccepted, onShowOnlyAcceptedChange, showOnlyRejected, onShowOnlyRejectedChange, showOnlyPending, onShowOnlyPendingChange, }: ReviewFiltersAndSortProps): import("react/jsx-runtime").JSX.Element;
export {};
