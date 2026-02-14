/**
 * Test Health Score Widget
 *
 * Displays overall test health score with breakdown by category.
 */
import { TestApiService } from '../../services/api/TestApiService';
interface TestHealthScoreWidgetProps {
    testApiService?: TestApiService;
    timeRangeDays?: number;
}
export declare function TestHealthScoreWidget({ testApiService: injectedTestApiService, timeRangeDays }: TestHealthScoreWidgetProps): import("react/jsx-runtime").JSX.Element | null;
export {};
