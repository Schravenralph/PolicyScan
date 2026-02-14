import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Loader2, AlertCircle, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { getApiBaseUrl } from '../utils/apiUrl';

interface BackendConnection {
  name: string;
  status: 'success' | 'failure' | 'warning' | 'skipped';
  latency?: number;
  message?: string;
  details?: Record<string, any>;
}

interface BackendConnectionsData {
  timestamp: string;
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
  };
  results: BackendConnection[];
}

export function TestHealthPage() {
  const [data, setData] = useState<BackendConnectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${getApiBaseUrl()}/tests/backend-connections`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json() as BackendConnectionsData;
      setData(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load backend connections';
      setError(errorMessage);
      console.error('Error loading backend connections:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'failure':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'border-green-500 bg-green-50';
      case 'failure':
        return 'border-red-500 bg-red-50';
      case 'warning':
        return 'border-yellow-500 bg-yellow-50';
      default:
        return 'border-gray-500 bg-gray-50';
    }
  };

  if (loading && !data) {
    return (
      <div className="p-8">
        <TestDashboardNav />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600">Loading connection status...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">❤️ Health & Latency</h1>
          <p className="text-gray-600 mt-1">Monitor backend connection health and response times</p>
        </div>
        <Button onClick={loadConnections} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className={data.summary.failed > 0 ? 'border-red-500' : 'border-green-500'}>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">✅ Successful</div>
              <div className="text-3xl font-bold text-green-600">{data.summary.successful}</div>
            </CardContent>
          </Card>

          <Card className={data.summary.failed > 0 ? 'border-red-500' : ''}>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">❌ Failed</div>
              <div className="text-3xl font-bold text-red-600">{data.summary.failed}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">⏭️ Skipped</div>
              <div className="text-3xl font-bold text-yellow-600">{data.summary.skipped}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">📦 Total</div>
              <div className="text-3xl font-bold">{data.summary.total}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Connection Details */}
      <Card>
        <CardHeader>
          <CardTitle>🔌 Backend Connection Status</CardTitle>
        </CardHeader>
        <CardContent>
          {!data || data.results.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No connection data available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.results.map((connection, index) => (
                <div
                  key={index}
                  className={`border-l-4 ${getStatusColor(connection.status)} p-4 rounded-lg`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(connection.status)}
                      <div>
                        <div className="font-semibold">{connection.name}</div>
                        {connection.message && (
                          <div className="text-sm text-gray-600 mt-1">{connection.message}</div>
                        )}
                        {connection.latency !== undefined && (
                          <div className="text-sm text-gray-500 mt-1">
                            Latency: {connection.latency}ms
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="px-3 py-1 rounded-full text-xs font-semibold bg-white">
                      {connection.status.toUpperCase()}
                    </div>
                  </div>
                  {connection.details && Object.keys(connection.details).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <details className="text-sm">
                        <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                          View Details
                        </summary>
                        <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                          {JSON.stringify(connection.details, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {data && (
        <div className="text-sm text-gray-500 text-center">
          Last updated: {new Date(data.timestamp).toLocaleString()}
        </div>
      )}
    </div>
  );
}

