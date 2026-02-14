/**
 * Test History Statistics Component
 *
 * Displays test history statistics including total runs, tests, pass rate, and duration.
 */
interface TestHistoryStatisticsProps {
    statistics: {
        totalRuns: number;
        totalTests: number;
        avgPassRate: number;
        avgDuration: number;
        trend: 'improving' | 'declining' | 'stable';
    };
}
export declare function TestHistoryStatistics({ statistics }: TestHistoryStatisticsProps): import("react/jsx-runtime").JSX.Element;
export {};
