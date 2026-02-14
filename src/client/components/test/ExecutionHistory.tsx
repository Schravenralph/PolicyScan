/**
 * Execution History Component
 * 
 * Displays recent command execution history for test dashboard quick actions.
 * Shows command, timestamp, status, duration, and allows re-running commands.
 * 
 * Created as part of WI-TEST-DASHBOARD-007
 */

import * as React from 'react';
import { Clock, CheckCircle2, XCircle, Loader2, RefreshCw, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import { TestApiService } from '../../services/api/TestApiService';
import { t } from '../../utils/i18n';

interface ExecutionHistoryProps {
  testApi: TestApiService;
  onRunCommand?: (command: string, commandType: string) => void;
  limit?: number;
}

interface Execution {
  id: string;
  command: string;
  commandType: 'health' | 'run' | 'collect-bugs' | 'generate-report' | 'custom';
  timestamp: string;
  status: 'running' | 'success' | 'error';
  exitCode?: number | null;
  duration?: number;
  outputLines?: number;
  error?: string;
}

export const ExecutionHistory: React.FC<ExecutionHistoryProps> = ({
  testApi,
  onRunCommand,
  limit = 10,
}) => {
  const [history, setHistory] = React.useState<Execution[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadHistory = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await testApi.getWorkflowStepsExecutionHistory(limit);
      setHistory(data.history || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load execution history';
      setError(errorMessage);
      if (import.meta.env.DEV) {
        console.error('Error loading execution history:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [testApi, limit]);

  React.useEffect(() => {
    loadHistory();
    // Refresh every 5 seconds to catch new executions
    const interval = setInterval(loadHistory, 5000);
    return () => clearInterval(interval);
  }, [loadHistory]);

  const formatDuration = (ms?: number): string => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return timestamp;
    }
  };

  const getStatusIcon = (status: Execution['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getCommandLabel = (commandType: Execution['commandType']): string => {
    switch (commandType) {
      case 'health':
        return t('executionHistory.healthCheck');
      case 'run':
        return t('test.execution.runAllTests');
      case 'collect-bugs':
        return t('executionHistory.collectBugs');
      case 'generate-report':
        return t('executionHistory.generateReport');
      default:
        return t('executionHistory.custom');
    }
  };

  const handleReRun = (execution: Execution) => {
    if (onRunCommand) {
      // Map commandType back to pnpm command for re-running
      let npmCommand: string;
      switch (execution.commandType) {
        case 'health':
          npmCommand = 'pnpm run test:workflow-steps:health';
          break;
        case 'run':
          npmCommand = 'pnpm run test:workflow-steps';
          break;
        case 'collect-bugs':
          npmCommand = 'pnpm run test:workflow-steps:collect-bugs';
          break;
        case 'generate-report':
          npmCommand = 'pnpm run test:workflow-steps:report';
          break;
        default:
          // For custom commands, try to extract pnpm command from the stored command
          // If it's already a pnpm command, use it as-is
          if (execution.command.startsWith('pnpm ')) {
            npmCommand = execution.command;
          } else {
            // Fallback: try to construct from commandType
            npmCommand = `pnpm run test:workflow-steps:${execution.commandType}`;
          }
      }
      onRunCommand(npmCommand, execution.commandType);
    }
  };

  if (loading && history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Execution History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Execution History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-600">
            <p>{error}</p>
            <Button onClick={loadHistory} variant="outline" size="sm" className="mt-4">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Execution History
          </CardTitle>
          <Button onClick={loadHistory} variant="ghost" size="sm">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>{t('executionHistory.noHistory')}</p>
            <p className="text-sm mt-2">{t('executionHistory.runCommandToSee')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((execution) => (
              <div
                key={execution.id}
                className={cn(
                  'p-3 rounded-lg border transition-colors',
                  execution.status === 'success' && 'bg-green-50 border-green-200',
                  execution.status === 'error' && 'bg-red-50 border-red-200',
                  execution.status === 'running' && 'bg-blue-50 border-blue-200'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(execution.status)}
                      <span className="font-semibold text-sm">
                        {getCommandLabel(execution.commandType)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(execution.timestamp)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 truncate" title={execution.command}>
                      {execution.command}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      {execution.duration && (
                        <span>Duration: {formatDuration(execution.duration)}</span>
                      )}
                      {execution.outputLines !== undefined && (
                        <span>Output: {execution.outputLines} lines</span>
                      )}
                      {execution.exitCode !== null && execution.exitCode !== undefined && (
                        <span>Exit: {execution.exitCode}</span>
                      )}
                    </div>
                    {execution.error && (
                      <div className="mt-2 text-xs text-red-600 truncate" title={execution.error}>
                        Error: {execution.error}
                      </div>
                    )}
                  </div>
                  {onRunCommand && execution.status !== 'running' && (
                    <Button
                      onClick={() => handleReRun(execution)}
                      variant="ghost"
                      size="sm"
                      title={t('executionHistory.rerunCommand')}
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

