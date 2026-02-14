/**
 * Test Search Page
 * 
 * Dedicated page for advanced test search functionality.
 */

import { TestAdvancedSearch } from '../components/test/TestAdvancedSearch';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { TestApiService } from '../services/api/TestApiService';
import { useMemo } from 'react';

interface TestSearchPageProps {
  testApiService?: TestApiService;
}

export function TestSearchPage({ testApiService: injectedTestApiService }: TestSearchPageProps = {}) {
  const testApi = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />
      <div>
        <h1 className="text-3xl font-bold">🔍 Advanced Search</h1>
        <p className="text-muted-foreground mt-1">Search test runs with advanced filters and query options</p>
      </div>
      <TestAdvancedSearch testApiService={testApi} />
    </div>
  );
}


