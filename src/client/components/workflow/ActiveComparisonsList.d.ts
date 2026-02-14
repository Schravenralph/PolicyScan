/**
 * Active Comparisons List Component
 *
 * Displays a list of active workflow comparisons with status badges
 * and selection functionality.
 */
interface ActiveComparison {
    id: string;
    name: string;
    status: string;
}
interface ActiveComparisonsListProps {
    activeComparisons: ActiveComparison[];
    activeComparisonId: string | null;
    onComparisonSelect: (id: string) => void;
    showList: boolean;
    onToggleList: () => void;
}
export declare function ActiveComparisonsList({ activeComparisons, activeComparisonId, onComparisonSelect, showList, onToggleList, }: ActiveComparisonsListProps): import("react/jsx-runtime").JSX.Element | null;
export {};
