export interface FilterPreset {
    id: string;
    name: string;
    filters: {
        documentFilter: 'all' | 'pending' | 'approved' | 'rejected';
        documentTypeFilter: string | null;
        documentDateFilter: 'all' | 'week' | 'month' | 'year';
        documentWebsiteFilter: string | null;
        documentSearchQuery: string;
    };
}
export interface UseFilterPresetsReturn {
    filterPresets: FilterPreset[];
    savePreset: (preset: Omit<FilterPreset, 'id'>) => FilterPreset;
    deletePreset: (presetId: string) => void;
    applyPreset: (presetId: string) => FilterPreset | null;
    getPreset: (presetId: string) => FilterPreset | null;
}
/**
 * Hook for managing document filter presets in localStorage.
 *
 * Provides functionality to save, delete, and apply filter presets.
 * Presets are persisted to localStorage and automatically loaded on mount.
 *
 * @returns Object containing filter presets array and management functions
 *
 * @example
 * ```typescript
 * const { filterPresets, savePreset, deletePreset, applyPreset } = useFilterPresets();
 *
 * // Save a new preset
 * const preset = savePreset({
 *   name: 'High Relevance PDFs',
 *   filters: {
 *     documentFilter: 'all',
 *     documentTypeFilter: 'pdf',
 *     documentDateFilter: 'month',
 *     documentWebsiteFilter: null,
 *     documentSearchQuery: ''
 *   }
 * });
 *
 * // Apply a preset
 * const applied = applyPreset(preset.id);
 *
 * // Delete a preset
 * deletePreset(preset.id);
 * ```
 */
export declare function useFilterPresets(): UseFilterPresetsReturn;
