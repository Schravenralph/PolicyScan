import React from 'react';
interface DocumentStatsProps {
    filteredCount: number;
    totalCount: number;
    hasActiveFilters: boolean;
    onClearFilters: () => void;
}
declare function DocumentStatsComponent({ filteredCount, totalCount, hasActiveFilters, onClearFilters, }: DocumentStatsProps): React.ReactElement;
export declare const DocumentStats: React.MemoExoticComponent<typeof DocumentStatsComponent>;
export {};
