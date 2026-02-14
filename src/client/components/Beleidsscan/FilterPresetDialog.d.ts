import React from 'react';
import type { FilterPreset } from '../../hooks/useFilterPresets';
export interface FilterPresetDialogProps {
    isOpen: boolean;
    onClose: () => void;
    presetName: string;
    onPresetNameChange: (name: string) => void;
    currentFilters: {
        documentFilter: 'all' | 'pending' | 'approved' | 'rejected';
        documentTypeFilter: string | null;
        documentDateFilter: 'all' | 'week' | 'month' | 'year';
        documentWebsiteFilter: string | null;
        documentSearchQuery: string;
    };
    onSave: (preset: Omit<FilterPreset, 'id'>) => FilterPreset;
}
/**
 * Dialog component for saving document filter presets.
 *
 * Allows users to save their current filter configuration as a named preset
 * for quick access later.
 *
 * @example
 * ```tsx
 * <FilterPresetDialog
 *   isOpen={showPresetDialog}
 *   onClose={() => setShowPresetDialog(false)}
 *   presetName={presetName}
 *   onPresetNameChange={setPresetName}
 *   currentFilters={{
 *     documentFilter,
 *     documentTypeFilter,
 *     documentDateFilter,
 *     documentWebsiteFilter,
 *     documentSearchQuery
 *   }}
 *   onSave={saveFilterPreset}
 * />
 * ```
 */
export declare const FilterPresetDialog: React.FC<FilterPresetDialogProps>;
