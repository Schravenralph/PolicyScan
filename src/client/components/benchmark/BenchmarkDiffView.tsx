import { useState } from 'react';
import { ArrowLeftRight, ExternalLink, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';

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
  error?: string;
}

interface BenchmarkDiffViewProps {
  run: BenchmarkRun;
}

interface DocumentComparison {
  left: BenchmarkResult['documents'][0] | null;
  right: BenchmarkResult['documents'][0] | null;
  status: 'same' | 'left-only' | 'right-only' | 'different-rank';
  rankDiff?: number;
}

export function BenchmarkDiffView({ run }: BenchmarkDiffViewProps) {
  const [leftResult, setLeftResult] = useState<BenchmarkResult | null>(
    run.results && run.results.length > 0 ? run.results[0] : null
  );
  const [rightResult, setRightResult] = useState<BenchmarkResult | null>(
    run.results && run.results.length > 1 ? run.results[1] : null
  );

  if (!run.results || run.results.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          <p>No results available for this benchmark run.</p>
        </CardContent>
      </Card>
    );
  }

  // Create comparison map
  const createComparison = (): DocumentComparison[] => {
    if (!leftResult || !rightResult) return [];

    const leftMap = new Map((leftResult.documents || []).map((doc) => [doc.url, doc]));
    const rightMap = new Map((rightResult.documents || []).map((doc) => [doc.url, doc]));

    const allUrls = new Set([...leftMap.keys(), ...rightMap.keys()]);
    const comparisons: DocumentComparison[] = [];

    allUrls.forEach((url) => {
      const left = leftMap.get(url) || null;
      const right = rightMap.get(url) || null;

      if (left && right) {
        comparisons.push({
          left,
          right,
          status: left.rank === right.rank ? 'same' : 'different-rank',
          rankDiff: left.rank - right.rank,
        });
      } else if (left) {
        comparisons.push({
          left,
          right: null,
          status: 'left-only',
        });
      } else {
        comparisons.push({
          left: null,
          right,
          status: 'right-only',
        });
      }
    });

    // Sort by left rank (or right rank if left is null)
    comparisons.sort((a, b) => {
      const aRank = a.left?.rank ?? a.right?.rank ?? Infinity;
      const bRank = b.left?.rank ?? b.right?.rank ?? Infinity;
      return aRank - bRank;
    });

    return comparisons;
  };

  const comparisons = createComparison();

  const getStatusBadge = (status: DocumentComparison['status']) => {
    switch (status) {
      case 'same':
        return <Badge variant="default" className="bg-green-100 text-green-800">Same</Badge>;
      case 'left-only':
        return <Badge variant="outline" className="border-blue-500 text-blue-700">Left Only</Badge>;
      case 'right-only':
        return <Badge variant="outline" className="border-purple-500 text-purple-700">Right Only</Badge>;
      case 'different-rank':
        return <Badge variant="secondary">Rank Changed</Badge>;
    }
  };

  const getRankChangeIndicator = (rankDiff?: number) => {
    if (rankDiff === undefined) return null;
    if (rankDiff === 0) return null;
    if (rankDiff > 0) {
      return (
        <span className="text-red-600 text-xs font-medium">
          ↓ {Math.abs(rankDiff)} (moved down)
        </span>
      );
    }
    return (
      <span className="text-green-600 text-xs font-medium">
        ↑ {Math.abs(rankDiff)} (moved up)
      </span>
    );
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5" />
            Compare Results: {run.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Left Side (Baseline)
              </label>
              <Select
                value={leftResult?.id || ''}
                onValueChange={(value) => {
                  const result = run.results?.find((r) => r.id === value);
                  setLeftResult(result || null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select result..." />
                </SelectTrigger>
                <SelectContent>
                  {run.results?.map((result) => (
                    <SelectItem key={result.id} value={result.id}>
                      {result.configName} ({result.metrics?.documentsFound ?? 0} docs)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Right Side (Comparison)
              </label>
              <Select
                value={rightResult?.id || ''}
                onValueChange={(value) => {
                  const result = run.results?.find((r) => r.id === value);
                  setRightResult(result || null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select result..." />
                </SelectTrigger>
                <SelectContent>
                  {run.results?.map((result) => (
                    <SelectItem key={result.id} value={result.id}>
                      {result.configName} ({result.metrics?.documentsFound ?? 0} docs)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {leftResult && rightResult && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>
                Comparing <strong>{leftResult.configName}</strong> vs{' '}
                <strong>{rightResult.configName}</strong>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {leftResult && rightResult ? (
        <>
          {/* Warning banner when 0 documents found */}
          {(leftResult.metrics?.documentsFound === 0 || rightResult.metrics?.documentsFound === 0) && (
            <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-1">
                      Zero Documents Found
                    </h4>
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">
                      One or both configurations returned 0 documents. This may indicate:
                    </p>
                    <ul className="text-sm text-yellow-800 dark:text-yellow-200 list-disc list-inside space-y-1">
                      <li>Database is empty or not seeded with documents</li>
                      <li>Query does not match any documents in the database</li>
                      <li>Service initialization failed (check server logs)</li>
                      <li>Search execution error (check server logs for details)</li>
                    </ul>
                    {leftResult.error && (
                      <div className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-900/40 rounded text-xs text-yellow-900 dark:text-yellow-100">
                        <strong>Left Error:</strong> {leftResult.error}
                      </div>
                    )}
                    {rightResult.error && (
                      <div className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-900/40 rounded text-xs text-yellow-900 dark:text-yellow-100">
                        <strong>Right Error:</strong> {rightResult.error}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
            <Card className="flex flex-col">
              <CardHeader className="border-b">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>{leftResult.configName}</span>
                  <Badge variant="outline">{leftResult.metrics?.documentsFound ?? 0} documents</Badge>
                </CardTitle>
              </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  {leftResult.metrics?.documentsFound === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                      <p className="font-medium mb-1">No documents found</p>
                      <p className="text-sm">This configuration returned 0 documents. Check server logs for details.</p>
                      {leftResult.error && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-2">Error: {leftResult.error}</p>
                      )}
                    </div>
                  ) : (
                    comparisons
                      .filter((c) => c.left)
                      .map((comparison, index) => (
                      <div
                        key={comparison.left?.url || index}
                        className={`p-4 border rounded-lg ${
                          comparison.status === 'left-only'
                            ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20'
                            : comparison.status === 'different-rank'
                              ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20'
                              : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-600">#{comparison.left?.rank}</span>
                            {getStatusBadge(comparison.status)}
                            {comparison.status === 'different-rank' &&
                              getRankChangeIndicator(comparison.rankDiff)}
                          </div>
                        </div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                          {comparison.left?.titel}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                          {comparison.left?.samenvatting}
                        </p>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>Score: {comparison.left?.score.toFixed(3)}</span>
                          <a
                            href={comparison.left?.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="border-b">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>{rightResult.configName}</span>
                <Badge variant="outline">{rightResult.metrics?.documentsFound ?? 0} documents</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  {rightResult.metrics?.documentsFound === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                      <p className="font-medium mb-1">No documents found</p>
                      <p className="text-sm">This configuration returned 0 documents. Check server logs for details.</p>
                      {rightResult.error && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-2">Error: {rightResult.error}</p>
                      )}
                    </div>
                  ) : (
                    comparisons
                      .filter((c) => c.right)
                      .map((comparison, index) => (
                      <div
                        key={comparison.right?.url || index}
                        className={`p-4 border rounded-lg ${
                          comparison.status === 'right-only'
                            ? 'border-purple-300 bg-purple-50 dark:bg-purple-900/20'
                            : comparison.status === 'different-rank'
                              ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20'
                              : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-600">#{comparison.right?.rank}</span>
                            {getStatusBadge(comparison.status)}
                            {comparison.status === 'different-rank' &&
                              comparison.rankDiff !== undefined &&
                              getRankChangeIndicator(-comparison.rankDiff)}
                          </div>
                        </div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                          {comparison.right?.titel}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                          {comparison.right?.samenvatting}
                        </p>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>Score: {comparison.right?.score.toFixed(3)}</span>
                          <a
                            href={comparison.right?.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
        </>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>Please select both left and right results to compare</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

