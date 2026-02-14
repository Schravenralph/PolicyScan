import { TestApiService, TestStatus } from '../services/api/TestApiService';
export interface UseTestExecutionCallbacks {
    onTestsComplete: (status: TestStatus) => void;
    onActivity: () => void;
    onError: (error: string) => void;
    clearLogs: () => void;
    startLogPolling: () => void;
    stopLogPolling: () => void;
}
export interface UseTestExecutionResult {
    handleRunAllTests: () => Promise<void>;
    handleStopTests: () => void;
    startStatusPolling: () => void;
    stopStatusPolling: () => void;
}
export declare function useTestExecution(testApi: TestApiService, testStatus: TestStatus | null, setTestStatus: (status: TestStatus | null | ((prev: TestStatus | null) => TestStatus | null)) => void, loadTestStatus: () => Promise<TestStatus | null>, callbacks: UseTestExecutionCallbacks): UseTestExecutionResult;
