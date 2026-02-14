import { useState, useCallback } from 'react';
import { getItem, setItem } from '../utils/localStorageJSON.js';

const FILTER_PRESETS_STORAGE_KEY = 'beleidsscan_filter_presets';

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
export function useFilterPresets(): UseFilterPresetsReturn {
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>(() => {
    return getItem<FilterPreset[]>(FILTER_PRESETS_STORAGE_KEY, []);
  });

  const savePreset = useCallback((preset: Omit<FilterPreset, 'id'>): FilterPreset => {
    const newPreset: FilterPreset = {
      ...preset,
      id: Date.now().toString()
    };

    setFilterPresets(prev => {
      const updated = [...prev, newPreset];
      setItem(FILTER_PRESETS_STORAGE_KEY, updated);
      return updated;
    });

    return newPreset;
  }, []);

  const deletePreset = useCallback((presetId: string) => {
    setFilterPresets(prev => {
      const updated = prev.filter(p => p.id !== presetId);
      setItem(FILTER_PRESETS_STORAGE_KEY, updated);
      return updated;
    });
  }, []);

  const getPreset = useCallback((presetId: string): FilterPreset | null => {
    return filterPresets.find(p => p.id === presetId) || null;
  }, [filterPresets]);

  const applyPreset = useCallback((presetId: string): FilterPreset | null => {
    return getPreset(presetId);
  }, [getPreset]);

  return {
    filterPresets,
    savePreset,
    deletePreset,
    applyPreset,
    getPreset
  };
}

