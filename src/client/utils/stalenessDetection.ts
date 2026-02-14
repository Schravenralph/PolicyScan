/**
 * Staleness Detection - Detects and handles stale data
 * 
 * Provides utilities for detecting stale data and triggering refreshes.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from './cacheInvalidation';

export interface StalenessConfig {
  staleTime: number; // Time in ms before data is considered stale
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
  refetchInterval?: number | false;
}

/**
 * Default staleness configuration
 */
export const DEFAULT_STALENESS_CONFIG: StalenessConfig = {
  staleTime: 2 * 60 * 1000, // 2 minutes
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  refetchInterval: false,
};

/**
 * Check if data is stale based on query state
 */
export function isDataStale(
  queryState: {
    dataUpdatedAt?: number;
    isStale?: boolean;
  },
  staleTime: number = DEFAULT_STALENESS_CONFIG.staleTime
): boolean {
  if (queryState.isStale === true) {
    return true;
  }

  if (queryState.dataUpdatedAt) {
    const age = Date.now() - queryState.dataUpdatedAt;
    return age > staleTime;
  }

  return true; // If no dataUpdatedAt, consider stale
}

/**
 * Hook for detecting stale data and auto-refreshing
 */
export function useStalenessDetection<T>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  config?: Partial<StalenessConfig>
): {
  data: T | undefined;
  isStale: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const mergedConfig = { ...DEFAULT_STALENESS_CONFIG, ...config };

  const query = useQuery({
    queryKey,
    queryFn,
    staleTime: mergedConfig.staleTime,
    refetchOnWindowFocus: mergedConfig.refetchOnWindowFocus,
    refetchOnReconnect: mergedConfig.refetchOnReconnect,
    refetchInterval: mergedConfig.refetchInterval,
  });

  const isStale = isDataStale(
    {
      dataUpdatedAt: query.dataUpdatedAt,
      isStale: query.isStale,
    },
    mergedConfig.staleTime
  );

  const refetch = async (): Promise<void> => {
    await query.refetch();
  };

  return {
    data: query.data,
    isStale,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch,
  };
}

/**
 * Hook for detecting stale query data
 */
export function useStaleQueryDetection(queryId: string | null): {
  isStale: boolean;
  refresh: () => Promise<void>;
} {
  const queryClient = useQueryClient();
  const queryState = queryClient.getQueryState(QueryKeys.query(queryId));

  // Compute staleness from query state (isStale is computed, not directly available)
  const isStale = isDataStale(
    {
      dataUpdatedAt: queryState?.dataUpdatedAt,
      // isStale is computed from dataUpdatedAt and staleTime in isDataStale function
    },
    DEFAULT_STALENESS_CONFIG.staleTime
  );

  const refresh = async (): Promise<void> => {
    await queryClient.refetchQueries({ queryKey: QueryKeys.query(queryId) });
  };

  return {
    isStale,
    refresh,
  };
}


