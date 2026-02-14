/**
 * Active Failures Widget Component
 *
 * Displays active test failures with breakdown by severity and navigation to failure details.
 */
import type { ActiveFailuresState } from '../../hooks/useActiveFailures';
interface ActiveFailuresWidgetProps {
    activeFailures: ActiveFailuresState | null;
    loading: boolean;
    onNavigateToFailures?: () => void;
}
export declare function ActiveFailuresWidget({ activeFailures, loading, onNavigateToFailures, }: ActiveFailuresWidgetProps): import("react/jsx-runtime").JSX.Element;
export {};
