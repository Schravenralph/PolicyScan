/**
 * Test Analytics Dashboard Page
 * 
 * Comprehensive analytics dashboard combining all analytics views.
 */

import { useState } from 'react';
import { TestApiService } from '../services/api/TestApiService';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { TestHealthScoreWidget } from '../components/test/TestHealthScoreWidget';
import { TestTrendsWidget } from '../components/test/TestTrendsWidget';
import { TestHistoryView } from '../components/test/TestHistoryView';
import { TestPerformanceProfiler } from '../components/test/TestPerformanceProfiler';
import { TestFailureAnalysis } from '../components/test/TestFailureAnalysis';
import { TestCoverageVisualization } from '../components/test/TestCoverageVisualization';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useMemo } from 'react';
import { BarChart3, Clock, Bug, Target, History, Zap } from 'lucide-react';

interface TestAnalyticsDashboardPageProps {
  testApiService?: TestApiService;
}

export function TestAnalyticsDashboardPage({ testApiService: injectedTestApiService }: TestAnalyticsDashboardPageProps = {}) {
  const testApi = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />
      <div>
        <h1 className="text-3xl font-bold">📈 Analytics Dashboard</h1>
        <p className="text-muted-foreground mt-1">Comprehensive test analytics and insights</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            History
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="failures" className="flex items-center gap-2">
            <Bug className="w-4 h-4" />
            Failures
          </TabsTrigger>
          <TabsTrigger value="coverage" className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            Coverage
          </TabsTrigger>
          <TabsTrigger value="timeline" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Timeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TestHealthScoreWidget testApiService={testApi} timeRangeDays={30} />
            <TestTrendsWidget testApiService={testApi} timeRangeDays={30} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TestPerformanceProfiler testApiService={testApi} timeRangeDays={30} />
            <TestCoverageVisualization testApiService={testApi} timeRangeDays={30} />
          </div>
        </TabsContent>

        <TabsContent value="history">
          <TestHistoryView testApiService={testApi} timeRangeDays={30} limit={100} />
        </TabsContent>

        <TabsContent value="performance">
          <TestPerformanceProfiler testApiService={testApi} timeRangeDays={30} />
        </TabsContent>

        <TabsContent value="failures">
          <TestFailureAnalysis testApiService={testApi} timeWindowDays={30} />
        </TabsContent>

        <TabsContent value="coverage">
          <TestCoverageVisualization testApiService={testApi} timeRangeDays={30} />
        </TabsContent>

        <TabsContent value="timeline">
          <TestHistoryView testApiService={testApi} timeRangeDays={30} limit={100} />
        </TabsContent>
      </Tabs>
    </div>
  );
}


