/**
 * Test Execution Trigger Component
 * 
 * Provides UI for triggering test execution from the dashboard.
 */

import { useState, useCallback } from 'react';
import { TestApiService } from '../../services/api/TestApiService';
import { Play, Square, Loader2, FileText, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { TestExecutionMonitor } from './TestExecutionMonitor';
import { t } from '../../utils/i18n';

interface TestExecutionTriggerProps {
  testApiService?: TestApiService;
  onRunStarted?: (runId: string) => void;
}

export function TestExecutionTrigger({ testApiService: injectedTestApiService, onRunStarted }: TestExecutionTriggerProps) {
  // testApi reserved for future use
  void (injectedTestApiService || new TestApiService());
  const [testFiles, setTestFiles] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStart = useCallback(async () => {
    try {
      setError(null);
      setRunning(true);
      
      // Parse test files (comma-separated or newline-separated)
      const files = testFiles
        .split(/[,\n]/)
        .map(f => f.trim())
        .filter(Boolean);

      // Call test execution API
      const response = await fetch('/api/tests/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tests: files.length > 0 ? files : null,
        }),
      });

      if (!response.ok) {
        throw new Error(t('testExecution.failedToStart'));
      }

      const data = await response.json();
      const runId = data.status?.lastRunId || `run-${Date.now()}`;
      setCurrentRunId(runId);
      onRunStarted?.(runId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('testExecution.failedToStartExecution');
      setError(errorMessage);
      setRunning(false);
      console.error('Error starting tests:', err);
    }
  }, [testFiles, onRunStarted]);

  const handleCancel = useCallback(async () => {
    try {
      await fetch('/api/tests/cancel', {
        method: 'POST',
      });
      setRunning(false);
      setCurrentRunId(null);
    } catch (err) {
      console.error('Error cancelling tests:', err);
    }
  }, []);

  const handleComplete = useCallback((status: 'completed' | 'failed' | 'cancelled') => {
    setRunning(false);
    if (status === 'completed' || status === 'failed') {
      // Keep runId for viewing results
    } else {
      setCurrentRunId(null);
    }
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="w-5 h-5" />
            {t('testExecution.runTests')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('testExecution.testFilesLabel')}
            </label>
            <Input
              value={testFiles}
              onChange={(e) => setTestFiles(e.target.value)}
              placeholder={t('testExecution.testFilesPlaceholder')}
              disabled={running}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('testExecution.testFilesDescription')}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              <div className="flex items-center gap-2">
                <X className="w-4 h-4" />
                <span>{error}</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              onClick={handleStart}
              disabled={running}
              className="flex-1"
            >
              {running ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('testExecution.running')}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  {t('testExecution.startTests')}
                </>
              )}
            </Button>
            {running && (
              <Button
                onClick={handleCancel}
                variant="outline"
                disabled={!running}
              >
                <Square className="w-4 h-4 mr-2" />
                {t('common.cancel')}
              </Button>
            )}
          </div>

          {testFiles && (
            <div className="mt-2">
              <div className="text-xs text-muted-foreground mb-1">{t('testExecution.selectedFiles')}</div>
              <div className="flex flex-wrap gap-1">
                {testFiles.split(/[,\n]/).map((file, idx) => {
                  const trimmed = file.trim();
                  return trimmed ? (
                    <Badge key={idx} variant="outline" className="text-xs">
                      <FileText className="w-3 h-3 mr-1" />
                      {trimmed}
                    </Badge>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {currentRunId && (
        <TestExecutionMonitor
          runId={currentRunId}
          onComplete={handleComplete}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}

