/**
 * Test Execution Trigger Component
 *
 * Provides UI for triggering test execution from the dashboard.
 */
import { TestApiService } from '../../services/api/TestApiService';
interface TestExecutionTriggerProps {
    testApiService?: TestApiService;
    onRunStarted?: (runId: string) => void;
}
export declare function TestExecutionTrigger({ testApiService: injectedTestApiService, onRunStarted }: TestExecutionTriggerProps): import("react/jsx-runtime").JSX.Element;
export {};
