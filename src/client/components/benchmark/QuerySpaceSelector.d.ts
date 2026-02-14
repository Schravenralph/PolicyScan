/**
 * Query space selection configuration
 */
export interface QuerySpaceSelection {
    type: 'manual' | 'count' | 'filter' | 'preset' | 'preset-multi';
    queries?: string[];
    presetIds?: string[];
    count?: number;
    filters?: {
        dateRange?: {
            start: string;
            end: string;
        };
        topics?: string[];
        overheidslaag?: string[];
        overheidsinstantie?: string[];
        minDocumentsFound?: number;
        maxDocumentsFound?: number;
    };
    preset?: string;
    sampling?: {
        strategy: 'all' | 'random' | 'top-n' | 'stratified';
        count?: number;
        seed?: number;
    };
}
interface QuerySpaceSelectorProps {
    value?: QuerySpaceSelection;
    onChange: (selection: QuerySpaceSelection | undefined) => void;
    className?: string;
}
/**
 * Query Space Selector Component
 *
 * Allows users to configure query space for benchmarking with:
 * - Manual query selection
 * - Count-based selection
 * - Filter-based selection
 * - Preset selection
 * - Sampling strategies
 *
 * @component
 */
export declare function QuerySpaceSelector({ value, onChange, className }: QuerySpaceSelectorProps): import("react/jsx-runtime").JSX.Element;
export {};
