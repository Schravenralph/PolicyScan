/**
 * Real-Time Test Execution Monitor Component
 *
 * Displays live test execution progress using WebSocket updates.
 */
interface TestExecutionMonitorProps {
    runId: string;
    onComplete?: (status: 'completed' | 'failed' | 'cancelled') => void;
    onCancel?: () => void;
}
export declare function TestExecutionMonitor({ runId, onComplete, onCancel }: TestExecutionMonitorProps): import("react/jsx-runtime").JSX.Element;
export {};
