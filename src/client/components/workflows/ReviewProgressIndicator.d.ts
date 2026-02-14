/**
 * Review Progress Indicator Component
 *
 * Displays review progress with statistics and progress bar.
 */
interface ReviewProgressIndicatorProps {
    totalCount: number;
    acceptedCount: number;
    rejectedCount: number;
    pendingCount: number;
    filteredCount?: number;
    hasFilter: boolean;
}
export declare function ReviewProgressIndicator({ totalCount, acceptedCount, rejectedCount, pendingCount, filteredCount, hasFilter, }: ReviewProgressIndicatorProps): import("react/jsx-runtime").JSX.Element;
export {};
