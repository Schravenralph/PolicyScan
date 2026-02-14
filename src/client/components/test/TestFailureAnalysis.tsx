/**
 * Test Failure Analysis Component
 * 
 * Analyzes test failures with pattern detection and root cause suggestions.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { TestApiService } from '../../services/api/TestApiService';
import { AlertTriangle, Bug, TrendingUp, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { t } from '../../utils/i18n';

interface TestFailureAnalysisProps {
  testApiService?: TestApiService;
  timeWindowDays?: number;
  testType?: string;
}

interface FailurePattern {
  id: string;
  pattern: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  frequency: number;
  affectedTests: string[];
  affectedEnvironments: string[];
  rootCauseSuggestions?: string[];
  trend?: 'increasing' | 'decreasing' | 'stable';
}

interface FailureAnalysisData {
  patterns: FailurePattern[];
  groups: Array<{
    id: string;
    pattern: string;
    count: number;
    tests: string[];
  }>;
  summary: {
    byCategory: Record<string, number>;
    bySeverity: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
  };
  totalFailures: number;
  recommendations: string[];
}

export function TestFailureAnalysis({ testApiService: injectedTestApiService, timeWindowDays = 30, testType }: TestFailureAnalysisProps) {
  const testApi = injectedTestApiService || new TestApiService();
  const [analysisData, setAnalysisData] = useState<FailureAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const loadFailureAnalysis = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await testApi.getFailurePatterns({
        timeRangeDays: timeWindowDays,
      }) as unknown as FailureAnalysisData;

      setAnalysisData(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load failure analysis';
      setError(errorMessage);
      console.error('Error loading failure analysis:', err);
    } finally {
      setLoading(false);
    }
  }, [testApi, timeWindowDays, testType]);

  useEffect(() => {
    loadFailureAnalysis();
  }, [loadFailureAnalysis]);

  // Filter patterns
  const filteredPatterns = useMemo(() => {
    if (!analysisData) return [];

    let filtered = [...analysisData.patterns];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.pattern.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query) ||
        p.affectedTests.some(t => t.toLowerCase().includes(query))
      );
    }

    // Severity filter
    if (severityFilter !== 'all') {
      filtered = filtered.filter(p => p.severity === severityFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(p => p.category === categoryFilter);
    }

    return filtered;
  }, [analysisData, searchQuery, severityFilter, categoryFilter]);

  // Get unique categories
  const uniqueCategories = useMemo(() => {
    if (!analysisData) return [];
    const categories = new Set(analysisData.patterns.map(p => p.category));
    return Array.from(categories).sort();
  }, [analysisData]);

  if (loading && !analysisData) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <AlertTriangle className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-destructive">{error}</div>
        </CardContent>
      </Card>
    );
  }

  if (!analysisData) {
    return null;
  }

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical':
        return 'bg-destructive text-destructive-foreground';
      case 'high':
        return 'bg-orange-600 dark:bg-orange-700 text-white';
      case 'medium':
        return 'bg-yellow-600 dark:bg-yellow-700 text-white';
      case 'low':
        return 'bg-primary text-primary-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bug className="w-5 h-5" />
            Failure Analysis Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Total Failures</div>
              <div className="text-2xl font-bold text-red-600">{analysisData.totalFailures}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Patterns</div>
              <div className="text-2xl font-bold">{analysisData.patterns.length}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Critical</div>
              <div className="text-2xl font-bold text-red-600">
                {analysisData.summary.bySeverity.critical}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">High</div>
              <div className="text-2xl font-bold text-orange-600">
                {analysisData.summary.bySeverity.high}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t('common.filter')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Search className="w-4 h-4" />
                <label className="text-sm font-medium">{t('common.search')}</label>
              </div>
              <Input
                placeholder={t('testFailureAnalysis.searchPatterns')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('errorExplorer.severity')}</label>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('testFailureAnalysis.allSeverities')}</SelectItem>
                  <SelectItem value="critical">{t('testFailureAnalysis.critical')}</SelectItem>
                  <SelectItem value="high">{t('testFailureAnalysis.high')}</SelectItem>
                  <SelectItem value="medium">{t('testFailureAnalysis.medium')}</SelectItem>
                  <SelectItem value="low">{t('testFailureAnalysis.low')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('errorExplorer.category')}</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('testFailureAnalysis.allCategories')}</SelectItem>
                  {uniqueCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Patterns */}
      <Tabs defaultValue="patterns">
        <TabsList>
          <TabsTrigger value="patterns">Patterns ({filteredPatterns.length})</TabsTrigger>
          <TabsTrigger value="groups">Groups ({analysisData.groups.length})</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>
        <TabsContent value="patterns">
          <div className="space-y-4">
            {filteredPatterns.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-muted-foreground py-8">
                    No failure patterns found matching the filters
                  </div>
                </CardContent>
              </Card>
            ) : (
              filteredPatterns.map((pattern) => (
                <Card key={pattern.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={getSeverityColor(pattern.severity)}>
                          {pattern.severity}
                        </Badge>
                        <Badge variant="outline">{pattern.category}</Badge>
                        {pattern.trend && (
                          <Badge variant="outline" className={
                            pattern.trend === 'increasing' ? 'text-red-600' :
                            pattern.trend === 'decreasing' ? 'text-green-600' :
                            'text-gray-600'
                          }>
                            {pattern.trend === 'increasing' && <TrendingUp className="w-3 h-3 mr-1" />}
                            {pattern.trend}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {pattern.frequency} occurrences
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <div className="font-medium mb-1">Pattern</div>
                        <div className="text-sm text-muted-foreground font-mono bg-muted p-2 rounded">
                          {pattern.pattern}
                        </div>
                      </div>
                      <div>
                        <div className="font-medium mb-1">Affected Tests ({pattern.affectedTests.length})</div>
                        <div className="flex flex-wrap gap-2">
                          {pattern.affectedTests.slice(0, 10).map((test, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {test}
                            </Badge>
                          ))}
                          {pattern.affectedTests.length > 10 && (
                            <Badge variant="outline" className="text-xs">
                              +{pattern.affectedTests.length - 10} more
                            </Badge>
                          )}
                        </div>
                      </div>
                      {pattern.rootCauseSuggestions && pattern.rootCauseSuggestions.length > 0 && (
                        <div>
                          <div className="font-medium mb-1 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-yellow-600" />
                            Root Cause Suggestions
                          </div>
                          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                            {pattern.rootCauseSuggestions.map((suggestion, idx) => (
                              <li key={idx}>{suggestion}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
        <TabsContent value="groups">
          <div className="space-y-4">
            {analysisData.groups.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-muted-foreground py-8">
                    No failure groups found
                  </div>
                </CardContent>
              </Card>
            ) : (
              analysisData.groups.map((group) => (
                <Card key={group.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{group.pattern}</CardTitle>
                      <Badge variant="outline">{group.count} failures</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div>
                      <div className="font-medium mb-2">Affected Tests ({group.tests.length})</div>
                      <div className="flex flex-wrap gap-2">
                        {group.tests.map((test, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {test}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
        <TabsContent value="recommendations">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analysisData.recommendations.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No recommendations available
                </div>
              ) : (
                <ul className="list-disc list-inside space-y-2">
                  {analysisData.recommendations.map((rec, idx) => (
                    <li key={idx} className="text-sm">{rec}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

