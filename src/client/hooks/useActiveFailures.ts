import { useState, useCallback } from 'react';
import { TestApiService, ActiveFailure } from '../services/api/TestApiService';

export interface ActiveFailuresState {
  total: number;
  newCount: number;
  failures?: ActiveFailure[];
}

interface UseActiveFailuresResult {
  activeFailures: ActiveFailuresState | null;
  activeFailuresLoading: boolean;
  loadActiveFailures: () => Promise<void>;
}

export function useActiveFailures(testApi: TestApiService): UseActiveFailuresResult {
  const [activeFailures, setActiveFailures] = useState<ActiveFailuresState | null>(null);
  const [activeFailuresLoading, setActiveFailuresLoading] = useState(false);

  // Load active failures
  const loadActiveFailures = useCallback(async () => {
    try {
      setActiveFailuresLoading(true);
      const result = await testApi.getActiveFailures({ limit: 1000 });
      
      // Type guard: Ensure result has the expected structure
      // Handle cases where API might return unexpected data
      if (!result || typeof result !== 'object') {
        setActiveFailures({ total: 0, newCount: 0, failures: [] });
        return;
      }
      
      // Type-safe extraction with proper type guards
      const failures: ActiveFailure[] = Array.isArray(result.failures) 
        ? result.failures.filter((f): f is ActiveFailure => 
            f !== null && 
            typeof f === 'object' && 
            'testId' in f && 
            'testFilePath' in f
          )
        : [];
      
      const total: number = typeof result.total === 'number' && result.total >= 0 
        ? result.total 
        : failures.length;
      
      const newCount: number = failures.filter((f) => f.state === 'new').length;
      
      setActiveFailures({
        total,
        newCount,
        failures: failures,
      });
    } catch (err) {
      console.error('Error loading active failures:', err);
      // Don't set error state - widget is optional
    } finally {
      setActiveFailuresLoading(false);
    }
  }, [testApi]);

  return {
    activeFailures,
    activeFailuresLoading,
    loadActiveFailures
  };
}
