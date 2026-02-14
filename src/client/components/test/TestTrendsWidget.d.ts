/**
 * Test Trends Widget
 *
 * Displays test trends over time with visual charts.
 */
import { TestApiService } from '../../services/api/TestApiService';
interface TestTrendsWidgetProps {
    testApiService?: TestApiService;
    timeRangeDays?: number;
}
export declare function TestTrendsWidget({ testApiService: injectedTestApiService, timeRangeDays }: TestTrendsWidgetProps): import("react/jsx-runtime").JSX.Element;
export {};
