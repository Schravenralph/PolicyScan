import { useEffect, useState, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { TestApiService } from '../../services/api/TestApiService';

interface ErrorCorrelationProps {
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  onDrillDown?: (filters: {
    testFilePath?: string;
    gitCommit?: string;
    environment?: string;
  }) => void;
  testApiService?: TestApiService; // Optional dependency injection for testing
}

interface ErrorItem {
  error: {
    testName: string;
    filePath?: string;
    errorMessage?: string;
    stackTrace?: string;
    errorCategory?: string;
    errorPattern?: string;
    errorFingerprint?: string;
    errorSeverity?: string;
    occurrenceCount?: number;
    firstSeen?: string;
    lastSeen?: string;
  };
  testHistory: {
    _id: string;
    testFilePath: string;
    testFileId: string;
    testType: string;
    executionTimestamp: string;
    git?: {
      commitHash?: string;
      branch?: string;
      author?: string;
      message?: string;
    };
    environment?: {
      os?: string;
      nodeVersion?: string;
      platform?: string;
      ci?: boolean;
    };
  };
}

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];

export function ErrorCorrelation({ dateRange, onDrillDown, testApiService: injectedTestApiService }: ErrorCorrelationProps) {
  // Use dependency injection if provided, otherwise create instance
  // This allows tests to pass mock instances
  const testApiService = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ErrorItem[]>([]);

  const loadErrors = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: Parameters<typeof testApiService.getErrorLogs>[0] = {
        limit: 1000, // Get more data for correlation analysis
      };

      if (dateRange?.from) params.timeRange = dateRange.from.toISOString();
      if (dateRange?.to) params.timeRange = dateRange.to.toISOString();

      const result = await testApiService.getErrorLogs(params) as { errors?: Array<{ testName?: string; filePath?: string; errorMessage?: string; stackTrace?: string; [key: string]: unknown }>; [key: string]: unknown };
      // Transform API response to match ErrorItem structure
      const transformedErrors: ErrorItem[] = (result.errors || []).map((apiError: { testName?: string; filePath?: string; errorMessage?: string; stackTrace?: string; testFilePath?: string; [key: string]: unknown }) => ({
        error: {
          testName: apiError.testName || apiError.testFilePath || 'unknown',
          filePath: apiError.filePath,
          errorMessage: apiError.errorMessage,
          stackTrace: apiError.stackTrace,
          errorCategory: apiError.errorCategory as string | undefined,
          errorPattern: apiError.errorPattern as string | undefined,
          errorFingerprint: apiError.errorFingerprint as string | undefined,
          errorSeverity: apiError.errorSeverity as string | undefined,
          occurrenceCount: apiError.occurrenceCount as number | undefined,
          firstSeen: apiError.firstSeen as string | undefined,
          lastSeen: apiError.lastSeen as string | undefined,
        },
        testHistory: {
          _id: (apiError.testFilePath as string) || '', // Use testFilePath as ID
          testFilePath: (apiError.testFilePath as string) || '',
          testFileId: (apiError.testFilePath as string) || '', // Use testFilePath as ID
          testType: (apiError.testType as string) || '', // Not provided by API
          executionTimestamp: (apiError.executionTimestamp as string) || new Date().toISOString(),
          git: {
            // Not provided by API - would need to be fetched separately
          },
          environment: {
            // Not provided by API - would need to be fetched separately
          },
        },
      }));
      setErrors(transformedErrors);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load errors';
      setError(errorMessage);
      console.error('Error loading errors:', err);
      setErrors([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange, testApiService]);

  useEffect(() => {
    loadErrors();
  }, [loadErrors]);

  // Group errors by git commit
  const errorsByCommit = useMemo(() => {
    const commitMap = new Map<string, number>();
    errors.forEach((item) => {
      const commitHash = item.testHistory.git?.commitHash || 'Unknown';
      const count = commitMap.get(commitHash) || 0;
      commitMap.set(commitHash, count + 1);
    });

    return Array.from(commitMap.entries())
      .map(([commitHash, count]) => ({
        commitHash: commitHash.length > 8 ? commitHash.substring(0, 8) : commitHash,
        fullCommitHash: commitHash,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Top 20 commits
  }, [errors]);

  // Group errors by test file
  const errorsByTestFile = useMemo(() => {
    const fileMap = new Map<string, number>();
    errors.forEach((item) => {
      const filePath = item.testHistory.testFilePath || 'Unknown';
      const count = fileMap.get(filePath) || 0;
      fileMap.set(filePath, count + 1);
    });

    return Array.from(fileMap.entries())
      .map(([filePath, count]) => ({
        filePath: filePath.split('/').pop() || filePath, // Show just filename
        fullFilePath: filePath,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Top 20 test files
  }, [errors]);

  // Group errors by environment
  const errorsByEnvironment = useMemo(() => {
    const envMap = new Map<string, number>();
    errors.forEach((item) => {
      const env = item.testHistory.environment;
      let envKey = 'Unknown';
      
      if (env) {
        if (env.ci !== undefined) {
          envKey = env.ci ? 'CI' : 'Local';
        } else if (env.os) {
          envKey = env.os;
        } else if (env.platform) {
          envKey = env.platform;
        }
      }
      
      const count = envMap.get(envKey) || 0;
      envMap.set(envKey, count + 1);
    });

    return Array.from(envMap.entries())
      .map(([environment, count]) => ({
        environment,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [errors]);

  const handleCommitClick = (commitHash: string) => {
    if (onDrillDown) {
      onDrillDown({ gitCommit: commitHash });
    }
  };

  const handleTestFileClick = (filePath: string) => {
    if (onDrillDown) {
      onDrillDown({ testFilePath: filePath });
    }
  };

  const handleEnvironmentClick = (environment: string) => {
    if (onDrillDown) {
      onDrillDown({ environment });
    }
  };

  // Reserved for future use
  // @ts-expect-error - Reserved for future use, intentionally unused
  const _formatCommitHash = (hash: string) => {
    return hash.length > 8 ? hash.substring(0, 8) : hash;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Error Correlation</h2>
          <p className="text-gray-600 mt-1">Identify correlations between errors and code changes or test files</p>
        </div>
        <Button onClick={loadErrors} variant="outline" size="sm" disabled={loading}>
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

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Errors by Git Commit */}
        <Card>
          <CardHeader>
            <CardTitle>Errors by Git Commit</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-600">Loading...</span>
              </div>
            ) : errorsByCommit.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>No commit data available</p>
                <p className="text-sm mt-2">Git information may not be available for all test runs</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={errorsByCommit}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="commitHash" 
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        fontSize={12}
                      />
                      <YAxis />
                      <Tooltip 
                        formatter={(value: number) => [value, 'Errors']}
                        labelFormatter={(label) => `Commit: ${label}`}
                      />
                      <Legend />
                      <Bar 
                        dataKey="count" 
                        fill="#ef4444"
                        onClick={(data) => {
                          if (data && 'fullCommitHash' in data) {
                            handleCommitClick(data.fullCommitHash as string);
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-sm text-gray-600">
                  <p>Click on a bar to view errors for that commit</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Errors by Test File */}
        <Card>
          <CardHeader>
            <CardTitle>Errors by Test File</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-600">Loading...</span>
              </div>
            ) : errorsByTestFile.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>No test file data available</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={errorsByTestFile}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="filePath" 
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        fontSize={12}
                      />
                      <YAxis />
                      <Tooltip 
                        formatter={(value: number) => [value, 'Errors']}
                        labelFormatter={(label) => `File: ${label}`}
                      />
                      <Legend />
                      <Bar 
                        dataKey="count" 
                        fill="#3b82f6"
                        onClick={(data) => {
                          if (data && 'fullFilePath' in data) {
                            handleTestFileClick(data.fullFilePath as string);
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-sm text-gray-600">
                  <p>Click on a bar to view errors for that test file</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Errors by Environment - Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Errors by Environment</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600">Loading...</span>
            </div>
          ) : errorsByEnvironment.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No environment data available</p>
              <p className="text-sm mt-2">Environment information may not be available for all test runs</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={errorsByEnvironment}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ environment, percent }) => `${environment}: ${(percent * 100).toFixed(1)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                      onClick={(data) => {
                        if (data && 'environment' in data) {
                          handleEnvironmentClick(data.environment as string);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {errorsByEnvironment.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => [value, 'Errors']}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="text-sm text-gray-600">
                <p>Click on a segment to view errors for that environment</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

