/**
 * Overview Tab Component
 *
 * Displays system overview including metrics, error overview, storage usage, system health, and trends.
 */
interface OverviewTabProps {
    onErrorSelect: (errorId: string) => void;
}
export declare function OverviewTab({ onErrorSelect }: OverviewTabProps): import("react/jsx-runtime").JSX.Element;
export {};
