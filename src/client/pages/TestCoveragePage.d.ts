/**
 * Test Coverage Page
 *
 * Dedicated page for test coverage visualization and analysis.
 */
import { TestApiService } from '../services/api/TestApiService';
interface TestCoveragePageProps {
    testApiService?: TestApiService;
}
export declare function TestCoveragePage({ testApiService: injectedTestApiService }?: TestCoveragePageProps): import("react/jsx-runtime").JSX.Element;
export {};
