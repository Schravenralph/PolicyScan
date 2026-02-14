import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { t } from '../../utils/i18n';

interface TestHistoryEntry {
  id: string;
  testFilePath: string;
  testFileId: string;
  testType: 'unit' | 'integration' | 'e2e' | 'visual' | 'performance' | 'workflow-steps' | 'other';
  executionTimestamp: string;
  duration: number;
  result: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
  };
  status: 'passed' | 'failed' | 'skipped';
  environment: {
    os: string;
    nodeVersion: string;
    playwrightVersion?: string;
    jestVersion?: string;
  };
  git: {
    commitHash: string;
    commitHashShort?: string;
    branch: string;
  };
  cicd?: {
    environment?: string;
    buildNumber?: string;
  };
  testRunner?: string;
  exitCode?: number;
}

interface TestHistoryTimelineProps {
  onRunClick?: (runId: string) => void;
}

interface TimelineEntryProps {
  entry: TestHistoryEntry & { position: number; time: number };
  left: string;
  color: string;
  zoomLevel: number;
  panOffset: number;
  onRunClick?: (runId: string) => void;
  formatDate: (dateString: string) => string;
  formatDuration: (ms: number) => string;
}

function TimelineEntry({
  entry,
  left,
  color,
  zoomLevel,
  panOffset,
  onRunClick,
  formatDate,
  formatDuration,
}: TimelineEntryProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="absolute cursor-pointer group"
      style={{
        left: `calc(${left} + ${panOffset}px)`,
        transform: `scale(${zoomLevel})`,
        transformOrigin: 'left center',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onRunClick?.(entry.id)}
    >
      {/* Timeline marker */}
      <div
        className="w-4 h-4 rounded-full border-2 border-white shadow-md transition-all"
        style={{
          backgroundColor: color,
          marginLeft: '-8px',
          marginTop: '-8px',
        }}
      />
      
      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded shadow-lg z-10"
          style={{ marginBottom: '8px' }}
        >
          <div className="font-semibold mb-1">{entry.testFileId}</div>
          <div className="space-y-1">
            <div>
              <span className="text-gray-400">{t('testHistoryTimeline.status')}</span>{' '}
              <span className="font-medium" style={{ color }}>
                {entry.status.toUpperCase()}
              </span>
            </div>
            <div>
              <span className="text-gray-400">{t('testHistoryTimeline.time')}</span> {formatDate(entry.executionTimestamp)}
            </div>
            <div>
              <span className="text-gray-400">{t('testHistoryTimeline.duration')}</span> {formatDuration(entry.duration)}
            </div>
            <div>
              <span className="text-gray-400">{t('testHistoryTimeline.results')}</span>{' '}
              {entry.result.passed} {t('testHistoryTimeline.passed')}, {entry.result.failed} {t('testHistoryTimeline.failed')}, {entry.result.skipped} {t('testHistoryTimeline.skipped')}
            </div>
            <div>
              <span className="text-gray-400">{t('testHistoryTimeline.type')}</span> {entry.testType}
            </div>
            {entry.cicd?.environment && (
              <div>
                <span className="text-gray-400">{t('testHistoryTimeline.environment')}</span> {entry.cicd.environment}
              </div>
            )}
            <div>
              <span className="text-gray-400">{t('testHistoryTimeline.branch')}</span> {entry.git.branch}
            </div>
            <div className="text-gray-400 text-xs mt-2">
              {t('testHistoryTimeline.clickToViewDetails')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function TestHistoryTimeline({ onRunClick }: TestHistoryTimelineProps) {
  const [history, setHistory] = useState<TestHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [testFilePath, setTestFilePath] = useState<string>('');
  const [testType, setTestType] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [environment, setEnvironment] = useState<string>('');
  
  // Zoom state
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<number>(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<number>(0);

  // Fetch test history
  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (dateFrom) params.append('from', dateFrom);
      if (dateTo) params.append('to', dateTo);
      if (testFilePath) params.append('testFilePath', testFilePath);
      if (testType) params.append('testType', testType);
      if (status) params.append('status', status);
      if (environment) params.append('environment', environment);
      params.append('limit', '500'); // Get more entries for timeline
      
      const response = await api.get<{
        history: TestHistoryEntry[];
        total: number;
        filters: Record<string, unknown>;
        pagination: { limit: number; skip: number; hasMore: boolean };
      }>(`/tests/history?${params.toString()}`);
      
      setHistory(response.history);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('testHistoryTimeline.failedToFetch');
      setError(errorMessage);
      logError(err, 'TestHistoryTimeline.fetchHistory');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, testFilePath, testType, status, environment]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Get unique values for filter dropdowns
  const uniqueTestFiles = useMemo(() => {
    const files = new Set(history.map(h => h.testFilePath));
    return Array.from(files).sort();
  }, [history]);

  const uniqueEnvironments = useMemo(() => {
    const envs = new Set(
      history
        .map(h => h.cicd?.environment || 'local')
        .filter(Boolean)
    );
    return Array.from(envs).sort();
  }, [history]);

  // Timeline calculations
  const timelineData = useMemo(() => {
    if (history.length === 0) return [];
    
    const sorted = [...history].sort((a, b) => 
      new Date(a.executionTimestamp).getTime() - new Date(b.executionTimestamp).getTime()
    );
    
    const minTime = new Date(sorted[0].executionTimestamp).getTime();
    const maxTime = new Date(sorted[sorted.length - 1].executionTimestamp).getTime();
    const timeRange = maxTime - minTime;
    
    return sorted.map(entry => {
      const time = new Date(entry.executionTimestamp).getTime();
      const position = ((time - minTime) / timeRange) * 100;
      
      return {
        ...entry,
        position,
        time,
      };
    });
  }, [history]);

  // Handle zoom
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.2, 0.5));
  const handleZoomReset = () => {
    setZoomLevel(1);
    setPanOffset(0);
  };

  // Handle pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // Left mouse button
      setIsPanning(true);
      setPanStart(e.clientX - panOffset);
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPanOffset(e.clientX - panStart);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Handle wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoomLevel(prev => Math.max(0.5, Math.min(3, prev + delta)));
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return '#10b981'; // green
      case 'failed': return '#ef4444'; // red
      case 'skipped': return '#6b7280'; // gray
      default: return '#9ca3af';
    }
  };

  // Format duration
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">{t('testHistoryTimeline.loadingHistory')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded">
        <p className="text-red-800">{t('testHistoryTimeline.error')} {error}</p>
        <button
          onClick={fetchHistory}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          {t('testHistoryTimeline.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-4">{t('testHistoryTimeline.filters')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('testHistoryTimeline.fromDate')}
            </label>
            <input
              type="datetime-local"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('testHistoryTimeline.toDate')}
            </label>
            <input
              type="datetime-local"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('testHistoryTimeline.testFile')}
            </label>
            <select
              value={testFilePath}
              onChange={(e) => setTestFilePath(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">{t('testHistoryTimeline.allFiles')}</option>
              {uniqueTestFiles.map(file => (
                <option key={file} value={file}>{file.split('/').pop()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('testHistoryTimeline.testType')}
            </label>
            <select
              value={testType}
              onChange={(e) => setTestType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">{t('testHistoryTimeline.allTypes')}</option>
              <option value="unit">{t('testHistoryTimeline.unit')}</option>
              <option value="integration">{t('testHistoryTimeline.integration')}</option>
              <option value="e2e">{t('testHistoryTimeline.endToEnd')}</option>
              <option value="visual">{t('testHistoryTimeline.visual')}</option>
              <option value="performance">{t('testHistoryTimeline.performance')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('testHistoryTimeline.status')}
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">{t('testHistoryTimeline.allStatus')}</option>
              <option value="passed">{t('testHistoryTimeline.passed')}</option>
              <option value="failed">{t('testHistoryTimeline.failed')}</option>
              <option value="skipped">{t('testHistoryTimeline.skipped')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('testHistoryTimeline.environment')}
            </label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">{t('testHistoryTimeline.allEnvironments')}</option>
              {uniqueEnvironments.map(env => (
                <option key={env} value={env}>{env}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={fetchHistory}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            {t('testHistoryTimeline.applyFilters')}
          </button>
          <button
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setTestFilePath('');
              setTestType('');
              setStatus('');
              setEnvironment('');
            }}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
          >
            {t('testHistoryTimeline.clearFilters')}
          </button>
        </div>
      </div>

      {/* Zoom Controls */}
      <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
            disabled={zoomLevel <= 0.5}
          >
            {t('testHistoryTimeline.zoomOut')}
          </button>
          <span className="text-sm text-gray-600">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
            disabled={zoomLevel >= 3}
          >
            {t('testHistoryTimeline.zoomIn')}
          </button>
          <button
            onClick={handleZoomReset}
            className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm ml-2"
          >
            {t('testHistoryTimeline.reset')}
          </button>
        </div>
        <div className="text-sm text-gray-600">
          {history.length} {t('testHistoryTimeline.testRunsShown')}
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-4">{t('testHistoryTimeline.testExecutionTimeline')}</h3>
        {timelineData.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {t('testHistoryTimeline.noHistoryFound')} {t('testHistoryTimeline.runTestsToSee')}
          </div>
        ) : (
          <div
            className="relative border-t-2 border-gray-300 pt-4 overflow-x-auto"
            style={{ minHeight: '200px', cursor: isPanning ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            {/* Timeline axis */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-300" />
            
            {/* Timeline entries */}
            {timelineData.map((entry) => {
              const left = `${entry.position}%`;
              const color = getStatusColor(entry.status);
              
              return (
                <TimelineEntry
                  key={entry.id}
                  entry={entry}
                  left={left}
                  color={color}
                  zoomLevel={zoomLevel}
                  panOffset={panOffset}
                  onRunClick={onRunClick}
                  formatDate={formatDate}
                  formatDuration={formatDuration}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-white rounded-lg shadow p-4">
        <h4 className="text-sm font-semibold mb-2">{t('testHistoryTimeline.legend')}</h4>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow-md" />
            <span>{t('testHistoryTimeline.passed')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-md" />
            <span>{t('testHistoryTimeline.failed')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-gray-500 border-2 border-white shadow-md" />
            <span>{t('testHistoryTimeline.skipped')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

