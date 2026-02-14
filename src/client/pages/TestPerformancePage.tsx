/**
 * Test Performance Page
 * 
 * Dedicated page for test performance analysis and profiling.
 */

import { TestPerformanceProfiler } from '../components/test/TestPerformanceProfiler';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { TestApiService } from '../services/api/TestApiService';
import { useMemo } from 'react';

interface TestPerformancePageProps {
  testApiService?: TestApiService;
}

export function TestPerformancePage({ testApiService: injectedTestApiService }: TestPerformancePageProps = {}) {
  const testApi = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />
      <div>
        <h1 className="text-3xl font-bold">⚡ Test Performance</h1>
        <p className="text-muted-foreground mt-1">Detailed performance analysis and profiling</p>
      </div>
      <TestPerformanceProfiler testApiService={testApi} timeRangeDays={30} />
    </div>
  );
}
