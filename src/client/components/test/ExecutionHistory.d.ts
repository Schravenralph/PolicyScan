/**
 * Execution History Component
 *
 * Displays recent command execution history for test dashboard quick actions.
 * Shows command, timestamp, status, duration, and allows re-running commands.
 *
 * Created as part of WI-TEST-DASHBOARD-007
 */
import * as React from 'react';
import { TestApiService } from '../../services/api/TestApiService';
interface ExecutionHistoryProps {
    testApi: TestApiService;
    onRunCommand?: (command: string, commandType: string) => void;
    limit?: number;
}
export declare const ExecutionHistory: React.FC<ExecutionHistoryProps>;
export {};
