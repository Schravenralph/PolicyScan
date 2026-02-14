/**
 * Flaky Tests Widget Section Component
 *
 * Displays flaky tests information and top flaky tests list.
 */
interface FlakyTest {
    test_id?: string;
    suite?: string;
    pass_rate: number;
    flake_rate: number;
}
interface FlakyTestsWidgetSectionProps {
    flakyTestMetrics: {
        totalFlakyTests: number;
        flakyTests?: FlakyTest[];
    } | null;
    flakyTestMetricsLoading: boolean;
}
export declare function FlakyTestsWidgetSection({ flakyTestMetrics, flakyTestMetricsLoading, }: FlakyTestsWidgetSectionProps): import("react/jsx-runtime").JSX.Element;
export {};
