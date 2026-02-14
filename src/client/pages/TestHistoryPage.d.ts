/**
 * Test History Page
 *
 * Dedicated page for viewing test history with advanced filtering and analysis.
 */
import { TestApiService } from '../services/api/TestApiService';
interface TestHistoryPageProps {
    testApiService?: TestApiService;
}
export declare function TestHistoryPage({ testApiService: injectedTestApiService }?: TestHistoryPageProps): import("react/jsx-runtime").JSX.Element;
export {};
