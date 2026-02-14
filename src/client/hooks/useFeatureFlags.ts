import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description?: string;
  source: string;
}

/**
 * React Query hook for fetching feature flags
 * 
 * @param options - Optional query options
 * @example
 * ```tsx
 * const { data: flags, isLoading, error } = useFeatureFlags();
 * ```
 */
export function useFeatureFlags(options?: {
  enabled?: boolean;
  filterSource?: 'database' | 'environment' | 'all';
}) {
  return useQuery({
    queryKey: ['feature-flags', options?.filterSource],
    queryFn: async () => {
      const response = await api.get<{ flags: FeatureFlag[] }>('/feature-flags');
      const flags = response?.flags || [];
      
      // Filter by source if specified
      if (options?.filterSource === 'database') {
        return flags.filter(f => f.source !== 'environment');
      } else if (options?.filterSource === 'environment') {
        return flags.filter(f => f.source === 'environment');
      }
      
      return flags;
    },
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000, // 5 minutes - feature flags don't change often
  });
}



