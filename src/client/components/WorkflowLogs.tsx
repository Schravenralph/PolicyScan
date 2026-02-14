/**
 * WorkflowLogs Component
 * 
 * Component for displaying workflow execution logs in real-time.
 * Shows log entries with severity levels, timestamps, and filtering options.
 */

import { useState, useEffect, useRef } from 'react';
import { LogBubble, BaseLogEntry } from './shared/LogBubble';

interface WorkflowLogsProps {
  runId: string | null;
  className?: string;
}

interface LogEntryWithMetadata extends BaseLogEntry {
  metadata?: Record<string, unknown>;
}

interface LogsResponse {
  status: string;
  logs: LogEntryWithMetadata[];
}

export function WorkflowLogs({ runId, className = '' }: WorkflowLogsProps) {
  const [logs, setLogs] = useState<LogEntryWithMetadata[]>([]);
  const [status, setStatus] = useState<string>('pending');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [expandedMetadata, setExpandedMetadata] = useState<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentPollDelayRef = useRef(2000);
  const consecutiveErrorsRef = useRef(0);

  useEffect(() => {
    if (!runId) {
      setLogs([]);
      setStatus('pending');
      setIsLoading(false);
      setError(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    setIsLoading(true);
    consecutiveErrorsRef.current = 0;

    const fetchLogs = async () => {
      try {
        const response = await fetch(`/api/runs/${runId}/logs`);
        
        if (!response.ok) {
          // Handle 429 rate limit with exponential backoff
          if (response.status === 429) {
            consecutiveErrorsRef.current += 1;
            const backoffDelay = Math.min(
              30000, // Max 30 seconds
              currentPollDelayRef.current * Math.pow(2, consecutiveErrorsRef.current)
            );
            currentPollDelayRef.current = backoffDelay;
            setError(null); // Don't show rate limit as error
            return;
          }
          throw new Error(`Failed to fetch logs: ${response.status}`);
        }

        const data: LogsResponse = await response.json();
        
        // Reset backoff on success
        consecutiveErrorsRef.current = 0;
        currentPollDelayRef.current = 2000;
        setError(null);
        setIsLoading(false);
        
        setStatus(data.status || 'pending');
        setLogs(data.logs || []);

        // Stop polling when workflow is completed or failed
        if (data.status === 'completed' || data.status === 'failed') {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setIsLoading(false);
        consecutiveErrorsRef.current += 1;
        
        // Exponential backoff for errors
        const backoffDelay = Math.min(
          30000,
          currentPollDelayRef.current * Math.pow(2, consecutiveErrorsRef.current)
        );
        currentPollDelayRef.current = backoffDelay;
      }
    };

    // Initial fetch
    fetchLogs();

    // Set up polling interval
    const poll = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = setInterval(fetchLogs, currentPollDelayRef.current);
    };

    poll();

    // Cleanup on unmount or runId change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [runId]);

  // Show waiting message when runId is null
  if (!runId) {
    return (
      <div className={className}>
        <p>Waiting for workflow to start...</p>
      </div>
    );
  }

  // Show loading state
  if (isLoading && logs.length === 0) {
    return (
      <div className={className}>
        <p>Loading logs...</p>
      </div>
    );
  }

  // Get status badge text
  const getStatusBadge = () => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'running':
        return 'Running';
      default:
        return null;
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div className={className}>
      {statusBadge && (
        <div className="mb-4">
          <span className="px-2 py-1 rounded text-sm font-medium">
            {statusBadge}
          </span>
        </div>
      )}

      {error && (
        <div className="text-red-400 mb-4">
          Error: {error.message}
        </div>
      )}

      {logs.length === 0 && !isLoading && (
        <p>No logs yet. Workflow is starting...</p>
      )}

      <div className="space-y-2">
        {logs.map((log) => {
          const logId = log.id || `${log.timestamp}-${log.message}`;
          const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
          const isMetadataExpanded = expandedMetadata.has(logId);

          // Determine background color based on level
          const getLevelBgClass = () => {
            switch (log.level) {
              case 'error':
                return 'bg-red-950/30';
              case 'warn':
                return 'bg-yellow-950/20';
              case 'debug':
                return 'bg-gray-800/50';
              default:
                return '';
            }
          };

          return (
            <div key={logId} className={getLevelBgClass()}>
              <LogBubble
                log={log}
                variant="compact"
              />
              {hasMetadata && (
                <div className="mt-2 px-4 pb-2">
                  <button
                    onClick={() => {
                      setExpandedMetadata(prev => {
                        const next = new Set(prev);
                        if (next.has(logId)) {
                          next.delete(logId);
                        } else {
                          next.add(logId);
                        }
                        return next;
                      });
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    View details
                  </button>
                  {isMetadataExpanded && (
                    <pre className="mt-2 text-xs text-gray-300 bg-gray-900/50 p-2 rounded overflow-auto">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
