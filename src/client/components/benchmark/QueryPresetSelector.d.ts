/**
 * Query Preset Selector Component
 *
 * Multi-select component for query presets with search, filtering, grouping, and query preview.
 * Allows users to select multiple presets from the API and see a preview of combined queries.
 */
/**
 * Component props
 */
export interface QueryPresetSelectorProps {
    selectedPresetIds: string[];
    onSelectionChange: (presetIds: string[]) => void;
    groupBy?: 'category' | 'source' | 'none';
    filterBy?: string;
    showPreview?: boolean;
}
/**
 * Query Preset Selector Component
 *
 * @component
 */
export declare function QueryPresetSelector({ selectedPresetIds, onSelectionChange, groupBy, filterBy, showPreview, }: QueryPresetSelectorProps): import("react/jsx-runtime").JSX.Element;
