interface LearningCycleResult {
  rankingBoosts: Array<{
    documentId: string;
    boost: number;
    reason: string;
  }>;
  dictionaryUpdates: Array<{
    term: string;
    synonyms: string[];
    confidence: number;
  }>;
  sourceUpdates: Array<{
    sourceUrl: string;
    qualityScore: number;
    deprecated: boolean;
  }>;
  metrics: {
    documentQuality: Array<{
      documentId: string;
      clicks: number;
      accepts: number;
      rejects: number;
      rating: number;
      qualityScore: number;
    }>;
    sourceQuality: Array<{
      sourceUrl: string;
      documentCount: number;
      averageRating: number;
      acceptanceRate: number;
      clickThroughRate: number;
      qualityScore: number;
    }>;
    termImportance: Array<{
      term: string;
      frequency: number;
      averageRating: number;
      associatedAcceptRate: number;
      importanceScore: number;
    }>;
    overallCTR: number;
    overallAcceptanceRate: number;
  };
}

interface CycleStatus {
  status: 'idle' | 'running' | 'completed' | 'failed' | 'disabled';
  enabled?: boolean;
  message?: string;
  currentCycle?: {
    operationId: string;
    startTime: string;
  };
  lastCycle?: {
    operationId: string;
    status: 'completed' | 'failed';
    completedAt: string;
    error?: string;
  };
}

interface CycleHistoryItem {
  operationId: string;
  status: 'completed' | 'failed';
  startTime: string;
  endTime: string;
  duration: number;
  result?: {
    rankingBoostsCount: number;
    dictionaryUpdatesCount: number;
    sourceUpdatesCount: number;
    sourcesDeprecated: number;
    termsAdded: number;
    synonymsAdded: number;
    overallCTR: number;
    overallAcceptanceRate: number;
  };
  error?: string;
}

interface LearningControlsProps {
  onRunCycle: () => Promise<void>;
  running: boolean;
  lastResult: LearningCycleResult | null;
  cycleStatus?: CycleStatus | null;
  history?: CycleHistoryItem[];
  historyLoading?: boolean;
  showHistory?: boolean;
  onToggleHistory?: () => void;
  onRefreshHistory?: () => void;
}

export function LearningControls({ 
  onRunCycle, 
  running, 
  lastResult, 
  cycleStatus,
  history = [],
  historyLoading = false,
  showHistory = false,
  onToggleHistory,
  onRefreshHistory,
}: LearningControlsProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-xl font-semibold mb-4">Learning Controls</h3>

      <div className="mb-6">
        <button
          onClick={onRunCycle}
          disabled={running}
          className={`px-6 py-3 rounded font-medium ${
            running
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          } text-white`}
        >
          {running ? 'Running Learning Cycle...' : 'Run Learning Cycle'}
        </button>
        {running && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-blue-600">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span>Processing feedback and updating rankings...</span>
            </div>
            {cycleStatus?.currentCycle && (
              <div className="mt-2 text-sm text-gray-600">
                Operation ID: <code className="text-xs">{cycleStatus.currentCycle.operationId}</code>
              </div>
            )}
          </div>
        )}
        
        {cycleStatus?.lastCycle && cycleStatus.lastCycle.status === 'failed' && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
            <strong>Last cycle failed:</strong> {cycleStatus.lastCycle.error || 'Unknown error'}
            <div className="text-xs mt-1">
              Completed: {new Date(cycleStatus.lastCycle.completedAt).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {lastResult && (
        <div className="space-y-4">
          <h4 className="text-lg font-medium">Last Learning Cycle Results</h4>

          {/* Ranking Boosts */}
          <div>
            <h5 className="font-medium mb-2">
              Ranking Boosts ({lastResult.rankingBoosts.length})
            </h5>
            {lastResult.rankingBoosts.length === 0 ? (
              <p className="text-sm text-gray-500">No ranking boosts applied</p>
            ) : (
              <div className="bg-gray-50 rounded p-4 max-h-48 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left font-medium text-gray-700">Document ID</th>
                      <th className="text-left font-medium text-gray-700">Boost</th>
                      <th className="text-left font-medium text-gray-700">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lastResult.rankingBoosts.slice(0, 10).map((boost, idx) => (
                      <tr key={idx}>
                        <td className="py-1 font-mono text-xs">
                          {boost.documentId.substring(0, 8)}...
                        </td>
                        <td className="py-1">{(boost.boost * 100).toFixed(1)}%</td>
                        <td className="py-1 text-gray-600">{boost.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Dictionary Updates */}
          <div>
            <h5 className="font-medium mb-2">
              Dictionary Updates ({lastResult.dictionaryUpdates.length})
            </h5>
            {lastResult.dictionaryUpdates.length === 0 ? (
              <p className="text-sm text-gray-500">No dictionary updates</p>
            ) : (
              <div className="bg-gray-50 rounded p-4 max-h-48 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left font-medium text-gray-700">Term</th>
                      <th className="text-left font-medium text-gray-700">Synonyms</th>
                      <th className="text-left font-medium text-gray-700">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lastResult.dictionaryUpdates.slice(0, 10).map((update, idx) => (
                      <tr key={idx}>
                        <td className="py-1 font-medium">{update.term}</td>
                        <td className="py-1 text-gray-600">
                          {update.synonyms.join(', ') || 'None'}
                        </td>
                        <td className="py-1">{(update.confidence * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Source Updates */}
          <div>
            <h5 className="font-medium mb-2">
              Source Updates ({lastResult.sourceUpdates.length})
            </h5>
            {lastResult.sourceUpdates.length === 0 ? (
              <p className="text-sm text-gray-500">No source updates</p>
            ) : (
              <div className="bg-gray-50 rounded p-4 max-h-48 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left font-medium text-gray-700">Source URL</th>
                      <th className="text-left font-medium text-gray-700">Quality Score</th>
                      <th className="text-left font-medium text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lastResult.sourceUpdates.slice(0, 10).map((update, idx) => (
                      <tr key={idx}>
                        <td className="py-1 text-gray-900 truncate max-w-xs" title={update.sourceUrl}>
                          {update.sourceUrl}
                        </td>
                        <td className="py-1">{(update.qualityScore * 100).toFixed(1)}%</td>
                        <td className="py-1">
                          {update.deprecated ? (
                            <span className="text-red-600 font-medium">Deprecated</span>
                          ) : (
                            <span className="text-green-600">Active</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cycle History */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-lg font-medium">Cycle History</h4>
          <div className="flex gap-2">
            {onRefreshHistory && (
              <button
                onClick={onRefreshHistory}
                disabled={historyLoading}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
              >
                {historyLoading ? 'Loading...' : 'Refresh'}
              </button>
            )}
            {onToggleHistory && (
              <button
                onClick={onToggleHistory}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
              >
                {showHistory ? 'Hide' : 'Show'} History
              </button>
            )}
          </div>
        </div>

        {showHistory && (
          <div className="bg-gray-50 rounded p-4 max-h-96 overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-sm text-gray-500">No cycle history available</p>
            ) : (
              <div className="space-y-3">
                {history.map((cycle) => (
                  <div
                    key={cycle.operationId}
                    className={`border rounded p-3 ${
                      cycle.status === 'completed' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-medium text-sm">
                          {cycle.status === 'completed' ? '✓ Completed' : '✗ Failed'}
                        </div>
                        <div className="text-xs text-gray-600 font-mono mt-1">
                          {cycle.operationId}
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 text-right">
                        <div>{new Date(cycle.startTime).toLocaleString()}</div>
                        <div>Duration: {(cycle.duration / 1000).toFixed(1)}s</div>
                      </div>
                    </div>
                    {cycle.status === 'completed' && cycle.result && (
                      <div className="text-xs text-gray-700 mt-2 grid grid-cols-2 gap-2">
                        <div>Boosts: {cycle.result.rankingBoostsCount}</div>
                        <div>Dictionary Updates: {cycle.result.dictionaryUpdatesCount}</div>
                        <div>Source Updates: {cycle.result.sourceUpdatesCount}</div>
                        <div>Sources Deprecated: {cycle.result.sourcesDeprecated}</div>
                        <div>Terms Added: {cycle.result.termsAdded}</div>
                        <div>Synonyms Added: {cycle.result.synonymsAdded}</div>
                        <div>CTR: {(cycle.result.overallCTR * 100).toFixed(1)}%</div>
                        <div>Acceptance: {(cycle.result.overallAcceptanceRate * 100).toFixed(1)}%</div>
                      </div>
                    )}
                    {cycle.status === 'failed' && cycle.error && (
                      <div className="text-xs text-red-700 mt-2">
                        Error: {cycle.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


