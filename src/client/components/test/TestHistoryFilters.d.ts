/**
 * Test History Filters Component
 *
 * Filter controls and view mode selector for test history.
 */
interface TestHistoryFiltersProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    testTypeFilter: string;
    onTestTypeChange: (filter: string) => void;
    branchFilter: string;
    onBranchChange: (filter: string) => void;
    statusFilter: string;
    onStatusChange: (filter: string) => void;
    sortBy: 'timestamp' | 'duration' | 'passRate';
    onSortByChange: (sortBy: 'timestamp' | 'duration' | 'passRate') => void;
    sortOrder: 'asc' | 'desc';
    onSortOrderChange: (order: 'asc' | 'desc') => void;
    viewMode: 'list' | 'chart' | 'timeline';
    onViewModeChange: (mode: 'list' | 'chart' | 'timeline') => void;
    uniqueTestTypes: string[];
    uniqueBranches: string[];
}
export declare function TestHistoryFilters({ searchQuery, onSearchChange, testTypeFilter, onTestTypeChange, branchFilter, onBranchChange, statusFilter, onStatusChange, sortBy, onSortByChange, sortOrder, onSortOrderChange, viewMode, onViewModeChange, uniqueTestTypes, uniqueBranches, }: TestHistoryFiltersProps): import("react/jsx-runtime").JSX.Element;
export {};
