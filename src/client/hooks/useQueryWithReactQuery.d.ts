import type { QueryData } from '../services/api';
/**
 * React Query hook for fetching a single query by ID
 *
 * @example
 * ```tsx
 * const { data: query, isLoading, error } = useQueryById('query-123');
 * ```
 */
export declare function useQueryById(queryId: string | null): import("@tanstack/react-query").UseQueryResult<QueryData | null, Error>;
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
export declare function useCreateQuery(): import("@tanstack/react-query").UseMutationResult<{
    _id: string;
} & QueryData, Error, QueryData, unknown>;
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
export declare function useQueryProgress(queryId: string | null, options?: {
    refetchInterval?: number | false;
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<{
    queryId: string;
    progress: number;
    status: "analyzing" | "searching" | "evaluating" | "generating" | "completed" | "error";
    estimatedSecondsRemaining?: number;
    currentStep?: string;
    totalSteps?: number;
    startedAt: number;
    lastUpdated: number;
    error?: string;
} | null, Error>;
