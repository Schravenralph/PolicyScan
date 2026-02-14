/**
 * Test Performance Page
 *
 * Dedicated page for test performance analysis and profiling.
 */
import { TestApiService } from '../services/api/TestApiService';
interface TestPerformancePageProps {
    testApiService?: TestApiService;
}
export declare function TestPerformancePage({ testApiService: injectedTestApiService }?: TestPerformancePageProps): import("react/jsx-runtime").JSX.Element;
export {};
