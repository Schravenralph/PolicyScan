/**
 * Test Coverage Page
 * 
 * Dedicated page for test coverage visualization and analysis.
 */

import { TestCoverageVisualization } from '../components/test/TestCoverageVisualization';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { TestApiService } from '../services/api/TestApiService';
import { useMemo } from 'react';

interface TestCoveragePageProps {
  testApiService?: TestApiService;
}

export function TestCoveragePage({ testApiService: injectedTestApiService }: TestCoveragePageProps = {}) {
  const testApi = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />
      <div>
        <h1 className="text-3xl font-bold">🎯 Test Coverage</h1>
        <p className="text-muted-foreground mt-1">Visualize and analyze test coverage metrics</p>
      </div>
      <TestCoverageVisualization testApiService={testApi} timeRangeDays={30} />
    </div>
  );
}
