/**
 * Test Run Timeline Component
 *
 * Visualizes test run history as a timeline with trends and patterns.
 */
import { TestApiService } from '../../services/api/TestApiService';
interface TestRunTimelineProps {
    testApiService?: TestApiService;
    testId?: string;
    timeRangeDays?: number;
    limit?: number;
}
export declare function TestRunTimeline({ testApiService: injectedTestApiService, testId, timeRangeDays: _timeRangeDays, limit }: TestRunTimelineProps): import("react/jsx-runtime").JSX.Element;
export {};
