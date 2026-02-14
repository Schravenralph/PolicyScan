import { useState, useCallback } from 'react';
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

export function useLogFiles(testApi: TestApiService): UseLogFilesResult {
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);
  const [selectedLogFile, setSelectedLogFile] = useState<number | null>(null);
  const [logFilesLoading, setLogFilesLoading] = useState(false);
  const [logDirectory, setLogDirectory] = useState<string | null>(null);

  const loadLogFiles = useCallback(async (testId?: string) => {
    if (!testId) return;

    setLogFilesLoading(true);
    try {
      // The API return type in TestDashboardPage was slightly loosely typed, here we assume it matches
      const data = await testApi.getLogFiles(testId) as unknown as {
        logFiles: LogFile[];
        logDirectory: string | null
      };

      setLogFiles(data.logFiles || []);
      setLogDirectory(data.logDirectory);
    } catch (err) {
      console.error('Error loading log files:', err);
      // Don't show error to user - log files are optional
      setLogFiles([]);
      setLogDirectory(null);
    } finally {
      setLogFilesLoading(false);
    }
  }, [testApi]);

  const resetLogFiles = useCallback(() => {
    setLogFiles([]);
    setSelectedLogFile(null);
    setLogDirectory(null);
  }, []);

  return {
    logFiles,
    selectedLogFile,
    setSelectedLogFile,
    logFilesLoading,
    logDirectory,
    loadLogFiles,
    resetLogFiles
  };
}
