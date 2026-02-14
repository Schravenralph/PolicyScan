interface ScheduledTask {
  id: string;
  name: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  status: 'idle' | 'running' | 'failed';
  runningSince?: string;
  lastError?: string;
}

interface LearningSchedulerStatusProps {
  status: {
    enabled: boolean;
    tasks: ScheduledTask[];
  } | null;
  loading: boolean;
  onRecover: () => Promise<void>;
  recovering: boolean;
  onTriggerTask?: (taskId: string) => Promise<void>;
  triggeringTask?: string | null;
}

export function LearningSchedulerStatus({ 
  status, 
  loading, 
  onRecover,
  recovering,
  onTriggerTask,
  triggeringTask,
}: LearningSchedulerStatusProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold mb-4">Scheduled Tasks</h3>
        <div className="text-center py-4 text-gray-500">Loading scheduler status...</div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold mb-4">Scheduled Tasks</h3>
        <div className="text-center py-4 text-gray-500">Scheduler status not available</div>
      </div>
    );
  }

  const runningTasks = status.tasks.filter(t => t.status === 'running');
  const failedTasks = status.tasks.filter(t => t.status === 'failed');

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">Scheduled Tasks</h3>
        <div className="flex gap-2">
          {runningTasks.length > 0 && (
            <button
              onClick={onRecover}
              disabled={recovering}
              className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
            >
              {recovering ? 'Recovering...' : 'Recover Stuck Tasks'}
            </button>
          )}
        </div>
      </div>

      {!status.enabled && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-4">
          <strong>Scheduler is disabled.</strong> Learning service must be enabled for scheduled tasks to run.
        </div>
      )}

      {runningTasks.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded mb-4">
          <strong>{runningTasks.length} task(s) currently running:</strong>
          <ul className="list-disc list-inside mt-2 text-sm">
            {runningTasks.map(task => (
              <li key={task.id}>
                {task.name}
                {task.runningSince && (
                  <span className="text-blue-600 ml-2">
                    (running since {new Date(task.runningSince).toLocaleString()})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {failedTasks.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
          <strong>{failedTasks.length} task(s) failed:</strong>
          <ul className="list-disc list-inside mt-2 text-sm">
            {failedTasks.map(task => (
              <li key={task.id}>
                {task.name}
                {task.lastError && (
                  <span className="text-red-600 ml-2">({task.lastError})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3">
        {status.tasks.map((task) => (
          <div
            key={task.id}
            className={`border rounded p-4 ${
              task.status === 'running'
                ? 'border-blue-300 bg-blue-50'
                : task.status === 'failed'
                ? 'border-red-300 bg-red-50'
                : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{task.name}</h4>
                  {!task.enabled && (
                    <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                      Disabled
                    </span>
                  )}
                  {task.status === 'running' && (
                    <span className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded flex items-center gap-1">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                      Running
                    </span>
                  )}
                  {task.status === 'failed' && (
                    <span className="text-xs bg-red-200 text-red-800 px-2 py-1 rounded">
                      Failed
                    </span>
                  )}
                  {task.status === 'idle' && task.enabled && (
                    <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded">
                      Idle
                    </span>
                  )}
                </div>
                
                <div className="mt-2 text-sm text-gray-600 space-y-1">
                  {task.lastRun && (
                    <div>
                      Last run: <span className="font-mono text-xs">
                        {new Date(task.lastRun).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {task.nextRun && (
                    <div>
                      Next run: <span className="font-mono text-xs">
                        {new Date(task.nextRun).toLocaleString()}
                      </span>
                      {(() => {
                        const nextRunTime = new Date(task.nextRun).getTime();
                        const now = Date.now();
                        const timeUntil = nextRunTime - now;
                        if (timeUntil > 0) {
                          const hours = Math.floor(timeUntil / (1000 * 60 * 60));
                          const minutes = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
                          return (
                            <span className="text-gray-500 ml-2">
                              (in {hours}h {minutes}m)
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}
                  {task.runningSince && (
                    <div>
                      Running since: <span className="font-mono text-xs">
                        {new Date(task.runningSince).toLocaleString()}
                      </span>
                      {(() => {
                        const startTime = new Date(task.runningSince).getTime();
                        const elapsed = Math.floor((Date.now() - startTime) / (1000 * 60));
                        return (
                          <span className="text-blue-600 ml-2">
                            ({elapsed} minutes)
                          </span>
                        );
                      })()}
                    </div>
                  )}
                  {task.lastError && (
                    <div className="text-red-600 text-xs mt-1">
                      Error: {task.lastError}
                    </div>
                  )}
                </div>
              </div>
              {onTriggerTask && task.enabled && (
                <div className="mt-3">
                  <button
                    onClick={() => onTriggerTask(task.id)}
                    disabled={task.status === 'running' || triggeringTask === task.id}
                    className={`px-3 py-1 text-sm rounded ${
                      task.status === 'running' || triggeringTask === task.id
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {triggeringTask === task.id
                      ? 'Triggering...'
                      : task.status === 'running'
                      ? 'Running...'
                      : 'Trigger Now'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {status.tasks.length === 0 && (
        <div className="text-center py-4 text-gray-500">
          No scheduled tasks configured
        </div>
      )}
    </div>
  );
}

