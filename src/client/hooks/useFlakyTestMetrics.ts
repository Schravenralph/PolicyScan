import { useState, useCallback } from 'react';
import { TestApiService } from '../services/api/TestApiService';

export interface FlakyTestMetricsState {
  totalFlakyTests: number;
  flakyTests: Array<{
    test_id?: string;
    suite?: string;
    total_runs: number;
    pass_rate: number;
    flake_rate: number;
    recent_failures: number;
  }>;
}

interface UseFlakyTestMetricsResult {
  flakyTestMetrics: FlakyTestMetricsState | null;
  flakyTestMetricsLoading: boolean;
  loadFlakyTestMetrics: () => Promise<void>;
}

export function useFlakyTestMetrics(testApi: TestApiService): UseFlakyTestMetricsResult {
  const [flakyTestMetrics, setFlakyTestMetrics] = useState<FlakyTestMetricsState | null>(null);
  const [flakyTestMetricsLoading, setFlakyTestMetricsLoading] = useState(false);

  // Load flaky test metrics
  const loadFlakyTestMetrics = useCallback(async () => {
    try {
      setFlakyTestMetricsLoading(true);
      const result = await testApi.getFlakeDetection({ timeRangeDays: 30 });
      setFlakyTestMetrics(result as unknown as FlakyTestMetricsState);
    } catch (err) {
      console.error('Error loading flaky test metrics:', err);
      // Don't set error state - widget is optional
    } finally {
      setFlakyTestMetricsLoading(false);
    }
  }, [testApi]);

  return {
    flakyTestMetrics,
    flakyTestMetricsLoading,
    loadFlakyTestMetrics
  };
}
