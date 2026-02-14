/**
 * Test Performance Profiler
 *
 * Detailed performance analysis and profiling for test runs.
 */
import { TestApiService } from '../../services/api/TestApiService';
interface TestPerformanceProfilerProps {
    testApiService?: TestApiService;
    testId?: string;
    timeRangeDays?: number;
}
export declare function TestPerformanceProfiler({ testApiService: injectedTestApiService, testId, timeRangeDays }: TestPerformanceProfilerProps): import("react/jsx-runtime").JSX.Element | null;
export {};
