import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { QueryData } from '../services/api';

/**
 * React Query hook for fetching a single query by ID
 * 
 * @example
 * ```tsx
 * const { data: query, isLoading, error } = useQueryById('query-123');
 * ```
 */
export function useQueryById(queryId: string | null) {
  return useQuery({
    queryKey: ['query', queryId],
    queryFn: async () => {
      if (!queryId) return null;
      return await api.query.getQuery(queryId);
    },
    enabled: !!queryId,
    staleTime: 2 * 60 * 1000, // 2 minutes - queries don't change often
  });
}

/**
 * React Query hook for creating a new query
 * 
 * @example
 * ```tsx
 * const createQuery = useCreateQuery();
 * 
 * const handleCreate = async () => {
 *   const queryId = await createQuery.mutateAsync({
 *     onderwerp: 'klimaatadaptatie',
 *     overheidslaag: 'gemeente',
 *   });
 * };
 * ```
 */
export function useCreateQuery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: QueryData) => {
      return await api.query.createQuery(data);
    },
    onSuccess: (newQuery) => {
      // Invalidate queries list to refetch
      queryClient.invalidateQueries({ queryKey: ['queries'] });
      // Set the new query in cache
      queryClient.setQueryData(['query', newQuery._id], newQuery);
    },
  });
}

/**
 * React Query hook for fetching query progress
 * 
 * @example
 * ```tsx
 * const { data: progress, isLoading } = useQueryProgress('query-123', {
 *   refetchInterval: 3000, // Poll every 3 seconds
 * });
 * ```
 */
export function useQueryProgress(
  queryId: string | null,
  options?: {
    refetchInterval?: number | false;
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['query', queryId, 'progress'],
    queryFn: async () => {
      if (!queryId) return null;
      return await api.query.getQueryProgress(queryId);
    },
    enabled: !!queryId && (options?.enabled !== false),
    refetchInterval: options?.refetchInterval ?? false,
    staleTime: 0, // Progress data is always stale (needs fresh fetch)
  });
}

