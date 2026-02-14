/**
 * Test History Page
 * 
 * Dedicated page for viewing test history with advanced filtering and analysis.
 */

import { TestHistoryView } from '../components/test/TestHistoryView';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { TestApiService } from '../services/api/TestApiService';
import { useMemo } from 'react';

interface TestHistoryPageProps {
  testApiService?: TestApiService;
}

export function TestHistoryPage({ testApiService: injectedTestApiService }: TestHistoryPageProps = {}) {
  const testApi = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />
      <div>
        <h1 className="text-3xl font-bold">📊 Test History</h1>
        <p className="text-muted-foreground mt-1">Comprehensive test execution history with advanced filtering</p>
      </div>
      <TestHistoryView testApiService={testApi} timeRangeDays={30} limit={100} />
    </div>
  );
}


