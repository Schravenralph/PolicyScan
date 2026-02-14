/**
 * Test Failure Analysis Page
 * 
 * Dedicated page for analyzing test failures with pattern detection.
 */

import { TestFailureAnalysis } from '../components/test/TestFailureAnalysis';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { TestApiService } from '../services/api/TestApiService';
import { useMemo } from 'react';

interface TestFailureAnalysisPageProps {
  testApiService?: TestApiService;
}

export function TestFailureAnalysisPage({ testApiService: injectedTestApiService }: TestFailureAnalysisPageProps = {}) {
  const testApi = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />
      <div>
        <h1 className="text-3xl font-bold">🐛 Failure Analysis</h1>
        <p className="text-muted-foreground mt-1">Analyze test failures with pattern detection and root cause analysis</p>
      </div>
      <TestFailureAnalysis testApiService={testApi} timeWindowDays={30} />
    </div>
  );
}


