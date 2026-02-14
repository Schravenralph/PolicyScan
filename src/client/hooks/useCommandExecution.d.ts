import { TestApiService, QueuedCommand } from '../services/api/TestApiService';
export interface UseCommandExecutionResult {
    outputPaneOpen: boolean;
    setOutputPaneOpen: React.Dispatch<React.SetStateAction<boolean>>;
    outputPaneCommand: string;
    outputPaneOutput: string[];
    setOutputPaneOutput: React.Dispatch<React.SetStateAction<string[]>>;
    outputPaneStatus: 'idle' | 'running' | 'success' | 'error';
    handleExecuteCommand: (command: string, commandType?: string) => Promise<void>;
    queue: QueuedCommand[];
    refreshQueue: () => Promise<void>;
    cancelQueuedCommand: (id: string) => Promise<void>;
    clearQueue: () => Promise<void>;
}
export declare function useCommandExecution(testApi: TestApiService, showCommandCompletionNotification: (command: string, success: boolean, duration: number) => void): UseCommandExecutionResult;
