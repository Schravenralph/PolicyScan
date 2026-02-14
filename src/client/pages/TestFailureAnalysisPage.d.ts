/**
 * Test Failure Analysis Page
 *
 * Dedicated page for analyzing test failures with pattern detection.
 */
import { TestApiService } from '../services/api/TestApiService';
interface TestFailureAnalysisPageProps {
    testApiService?: TestApiService;
}
export declare function TestFailureAnalysisPage({ testApiService: injectedTestApiService }?: TestFailureAnalysisPageProps): import("react/jsx-runtime").JSX.Element;
export {};
