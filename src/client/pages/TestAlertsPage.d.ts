/**
 * Test Alerts Page
 *
 * Displays active alerts for test failures, regressions, and issues.
 */
import { TestApiService } from '../services/api/TestApiService';
interface TestAlertsPageProps {
    testApiService?: TestApiService;
}
export declare function TestAlertsPage({ testApiService: injectedTestApiService }?: TestAlertsPageProps): import("react/jsx-runtime").JSX.Element;
export {};
