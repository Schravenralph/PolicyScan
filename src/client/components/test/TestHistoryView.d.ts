/**
 * Test History View
 *
 * Enhanced test history visualization with advanced filtering and analysis.
 */
import { TestApiService } from '../../services/api/TestApiService';
interface TestHistoryViewProps {
    testApiService?: TestApiService;
    testId?: string;
    timeRangeDays?: number;
    limit?: number;
}
export declare function TestHistoryView({ testApiService: injectedTestApiService, testId, timeRangeDays: _timeRangeDays, limit }: TestHistoryViewProps): import("react/jsx-runtime").JSX.Element;
export {};
