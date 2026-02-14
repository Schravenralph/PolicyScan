import { TestApiService } from '../services/api/TestApiService';
export interface LogFile {
    path: string;
    suite: string;
    timestamp: string;
    date: string;
    size?: number;
    type: 'json' | 'log';
    content?: string | object;
}
export interface UseLogFilesResult {
    logFiles: LogFile[];
    selectedLogFile: number | null;
    setSelectedLogFile: (index: number | null) => void;
    logFilesLoading: boolean;
    logDirectory: string | null;
    loadLogFiles: (testId?: string) => Promise<void>;
    resetLogFiles: () => void;
}
export declare function useLogFiles(testApi: TestApiService): UseLogFilesResult;
