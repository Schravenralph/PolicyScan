import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { BronWebsite } from '../services/api';

/**
 * React Query hook for fetching websites by query ID
 * 
 * @param queryId - The query ID to fetch websites for
 * @param options - Optional pagination and query options
 * @example
 * ```tsx
 * const { data: websites, isLoading } = useWebsitesByQuery('query-123', {
 *   page: 1,
 *   limit: 20,
 * });
 * ```
 */
export function useWebsitesByQuery(
  queryId: string | null,
  options?: {
    page?: number;
    limit?: number;
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['websites', 'query', queryId, options?.page, options?.limit],
    queryFn: async () => {
      if (!queryId) return [];
      return await api.bronWebsite.getBronWebsitesByQuery(queryId, {
        page: options?.page,
        limit: options?.limit,
      });
    },
    enabled: !!queryId && (options?.enabled !== false),
    staleTime: 2 * 60 * 1000, // 2 minutes - websites may change
  });
}

/**
 * React Query hook for fetching all websites
 * 
 * @param options - Optional pagination options
 * @example
 * ```tsx
 * const { data: websites, isLoading } = useAllWebsites({
 *   page: 1,
 *   limit: 50,
 * });
 * ```
 */
export function useAllWebsites(options?: {
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['websites', 'all', options?.page, options?.limit],
    queryFn: async () => {
      return await api.bronWebsite.getAllBronWebsites({
        page: options?.page,
        limit: options?.limit,
      });
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - all websites change less frequently
  });
}

/**
 * React Query hook for creating a single website
 * 
 * @example
 * ```tsx
 * const createWebsite = useCreateWebsite();
 * 
 * const handleCreate = async () => {
 *   const website = await createWebsite.mutateAsync({
 *     url: 'https://example.com',
 *     titel: 'Example Website',
 *     // ... other fields
 *   });
 * };
 * ```
 */
export function useCreateWebsite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: BronWebsite) => {
      return await api.bronWebsite.createBronWebsite(data);
    },
    onSuccess: (_newWebsite, variables) => {
      // Invalidate websites list for the query if queryId is present
      if (variables.queryId) {
        queryClient.invalidateQueries({
          queryKey: ['websites', 'query', variables.queryId],
        });
      }
      // Invalidate all websites queries
      queryClient.invalidateQueries({ queryKey: ['websites', 'all'] });
      queryClient.invalidateQueries({ queryKey: ['websites'] });
    },
  });
}

/**
 * React Query hook for creating multiple websites (bulk)
 * 
 * @example
 * ```tsx
 * const createWebsites = useCreateWebsites();
 * 
 * const handleBulkCreate = async () => {
 *   const websites = await createWebsites.mutateAsync([
 *     { url: 'https://example.com/1', titel: 'Site 1', ... },
 *     { url: 'https://example.com/2', titel: 'Site 2', ... },
 *   ]);
 * };
 * ```
 */
export function useCreateWebsites() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: BronWebsite[]) => {
      return await api.bronWebsite.createBronWebsites(data);
    },
    onSuccess: (_newWebsites, variables) => {
      // Invalidate websites for all unique queryIds
      const queryIds = new Set(
        variables
          .map((website) => website.queryId)
          .filter((id): id is string => !!id)
      );
      
      queryIds.forEach((queryId) => {
        queryClient.invalidateQueries({
          queryKey: ['websites', 'query', queryId],
        });
      });
      
      // Invalidate all websites queries
      queryClient.invalidateQueries({ queryKey: ['websites', 'all'] });
      queryClient.invalidateQueries({ queryKey: ['websites'] });
    },
  });
}

/**
 * React Query hook for updating website acceptance status
 * 
 * @example
 * ```tsx
 * const updateAcceptance = useUpdateWebsiteAcceptance();
 * 
 * const handleAccept = async (websiteId: string) => {
 *   await updateAcceptance.mutateAsync({
 *     websiteId,
 *     accepted: true,
 *   });
 * };
 * ```
 */
export function useUpdateWebsiteAcceptance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      websiteId: string;
      accepted: boolean | null;
    }) => {
      return await api.bronWebsite.updateBronWebsiteAcceptance(
        params.websiteId,
        params.accepted
      );
    },
    onSuccess: (updatedWebsite) => {
      // Invalidate websites for the query if queryId is present
      if (updatedWebsite.queryId) {
        queryClient.invalidateQueries({
          queryKey: ['websites', 'query', updatedWebsite.queryId],
        });
      }
      // Invalidate all websites queries
      queryClient.invalidateQueries({ queryKey: ['websites', 'all'] });
      queryClient.invalidateQueries({ queryKey: ['websites'] });
    },
  });
}


