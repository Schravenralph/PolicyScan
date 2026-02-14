import type { QueryData } from '../services/api';
export interface UseQueryReturn {
    queryId: string | null;
    isLoading: boolean;
    error: Error | null;
    createQuery: (data: QueryData) => Promise<string>;
    createQueryViaWizard: (sessionId: string, data: QueryData, revision?: number) => Promise<string>;
    getQuery: (id: string) => Promise<QueryData | null>;
    getQueryProgress: (id: string) => Promise<{
        queryId: string;
        progress: number;
        status: 'analyzing' | 'searching' | 'evaluating' | 'generating' | 'completed' | 'error';
        estimatedSecondsRemaining?: number;
        currentStep?: string;
        totalSteps?: number;
        startedAt: number;
        lastUpdated: number;
        error?: string;
    } | null>;
    setQueryId: (id: string | null) => void;
}
/**
 * Custom hook for query management
 * Handles query creation, retrieval, and progress tracking
 */
export declare function useQuery(): UseQueryReturn;
