/**
 * Test Failure Analysis Component
 *
 * Analyzes test failures with pattern detection and root cause suggestions.
 */
import { TestApiService } from '../../services/api/TestApiService';
interface TestFailureAnalysisProps {
    testApiService?: TestApiService;
    timeWindowDays?: number;
    testType?: string;
}
export declare function TestFailureAnalysis({ testApiService: injectedTestApiService, timeWindowDays, testType }: TestFailureAnalysisProps): import("react/jsx-runtime").JSX.Element | null;
export {};
