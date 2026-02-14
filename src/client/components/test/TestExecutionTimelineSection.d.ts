/**
 * Test Execution Timeline Section Component
 *
 * Displays test execution timeline with statistics.
 */
import type { TestStatistics } from '../../hooks/useTestStatistics';
interface TestExecutionTimelineSectionProps {
    statistics: TestStatistics | null;
}
export declare function TestExecutionTimelineSection({ statistics }: TestExecutionTimelineSectionProps): import("react/jsx-runtime").JSX.Element | null;
export {};
