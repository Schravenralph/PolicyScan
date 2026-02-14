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
export declare function useWebsitesByQuery(queryId: string | null, options?: {
    page?: number;
    limit?: number;
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<BronWebsite[], Error>;
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
export declare function useAllWebsites(options?: {
    page?: number;
    limit?: number;
}): import("@tanstack/react-query").UseQueryResult<BronWebsite[], Error>;
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
export declare function useCreateWebsite(): import("@tanstack/react-query").UseMutationResult<BronWebsite, Error, BronWebsite, unknown>;
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
export declare function useCreateWebsites(): import("@tanstack/react-query").UseMutationResult<BronWebsite[], Error, BronWebsite[], unknown>;
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
export declare function useUpdateWebsiteAcceptance(): import("@tanstack/react-query").UseMutationResult<BronWebsite, Error, {
    websiteId: string;
    accepted: boolean | null;
}, unknown>;
