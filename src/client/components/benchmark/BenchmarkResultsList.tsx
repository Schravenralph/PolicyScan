import { Clock, CheckCircle2, XCircle, Eye, Calendar, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { t } from '../../utils/i18n';

interface BenchmarkResult {
  id: string;
  benchmarkType: string;
  configName: string;
  documents: Array<{
    url: string;
    titel: string;
    samenvatting: string;
    score: number;
    rank: number;
  }>;
  metrics: {
    documentsFound: number;
    averageScore: number;
  };
}

interface BenchmarkRun {
  id: string;
  name: string;
  query?: string;
  queries?: string[];
  benchmarkTypes: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
  cancelledAt?: string;
  results?: BenchmarkResult[];
}

interface BenchmarkResultsListProps {
  runs: BenchmarkRun[];
  onSelectRun: (run: BenchmarkRun) => void;
  onCancelRun?: (runId: string) => void;
}

export function BenchmarkResultsList({ runs, onSelectRun, onCancelRun }: BenchmarkResultsListProps) {
  const getStatusIcon = (status: BenchmarkRun['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-orange-600" />;
      case 'running':
        return <Clock className="w-4 h-4 text-blue-600 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: BenchmarkRun['status']) => {
    const variants: Record<BenchmarkRun['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
      completed: 'default',
      running: 'secondary',
      failed: 'destructive',
      cancelled: 'outline',
      pending: 'outline',
    };

    return (
      <Badge variant={variants[status]}>
        {getStatusIcon(status)}
        <span className="ml-1 capitalize">{status}</span>
      </Badge>
    );
  };

  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          <p>No benchmark runs yet. Run a benchmark to see results here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {runs.map((run) => (
        <Card key={run.id} className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg">{run.name || `Benchmark ${run.id ? run.id.slice(0, 8) : 'Unknown'}`}</CardTitle>
                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  {new Date(run.createdAt).toLocaleString()}
                </div>
              </div>
              {getStatusBadge(run.status)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Test Query:</p>
                {(() => {
                  const displayQuery = run.query || (run.queries && run.queries.length > 0 ? run.queries[0] : '');
                  const hasMultipleQueries = run.queries && run.queries.length > 1;
                  return (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 italic">"{displayQuery || t('benchmark.noQuery')}"</p>
                      {hasMultipleQueries && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          +{run.queries!.length - 1} more quer{run.queries!.length - 1 === 1 ? 'y' : 'ies'}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Benchmark Types:
                </p>
                <div className="flex flex-wrap gap-2">
                  {(run.benchmarkTypes || []).map((type) => (
                    <Badge key={type} variant="outline" className="text-xs">
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>

              {run.results && run.results.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Results:
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {run.results.map((result) => (
                      <div
                        key={result.id}
                        className="text-xs p-2 bg-gray-50 dark:bg-gray-800 rounded border"
                      >
                        <p className="font-medium">{result.configName}</p>
                        <p className="text-gray-500">
                          {result.metrics?.documentsFound ?? 0} documents
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                {(run.status === 'running' || run.status === 'pending') && onCancelRun && (
                  <Button
                    onClick={() => onCancelRun(run.id)}
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                )}
                {run.status === 'completed' && (
                  <Button
                    onClick={() => onSelectRun(run)}
                    variant="outline"
                    className="w-full"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View & Compare Results
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

