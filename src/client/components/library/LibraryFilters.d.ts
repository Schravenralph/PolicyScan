/**
 * Library Filters Component
 *
 * Provides filtering controls for the library page:
 * - Query ID filter
 * - Workflow Run ID filter
 * - Review Status filter
 * - Source filter
 * - Active filters display with remove buttons
 */
interface LibraryFiltersProps {
    queryIdFilter: string;
    onQueryIdFilterChange: (value: string) => void;
    workflowRunIdFilter: string;
    onWorkflowRunIdFilterChange: (value: string) => void;
    reviewStatusFilter: 'pending_review' | 'approved' | 'rejected' | 'needs_revision' | 'all';
    onReviewStatusFilterChange: (value: 'pending_review' | 'approved' | 'rejected' | 'needs_revision' | 'all') => void;
    sourceFilter: 'DSO' | 'Rechtspraak' | 'Wetgeving' | 'Gemeente' | 'PDOK' | 'Web' | 'all';
    onSourceFilterChange: (value: 'DSO' | 'Rechtspraak' | 'Wetgeving' | 'Gemeente' | 'PDOK' | 'Web' | 'all') => void;
    onPageReset: () => void;
}
export declare function LibraryFilters({ queryIdFilter, onQueryIdFilterChange, workflowRunIdFilter, onWorkflowRunIdFilterChange, reviewStatusFilter, onReviewStatusFilterChange, sourceFilter, onSourceFilterChange, onPageReset, }: LibraryFiltersProps): import("react/jsx-runtime").JSX.Element;
export {};
