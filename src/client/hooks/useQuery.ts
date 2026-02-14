import { useState, useCallback } from 'react';
import { api } from '../services/api';
import type { QueryData } from '../services/api';
import { logError } from '../utils/errorHandler';

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
export function useQuery(): UseQueryReturn {
  const [queryId, setQueryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createQuery = useCallback(async (data: QueryData): Promise<string> => {
    setIsLoading(true);
    setError(null);
    try {
      const createdQuery = await api.createQuery(data);
      setQueryId(createdQuery._id);
      return createdQuery._id;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create query');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createQueryViaWizard = useCallback(
    async (sessionId: string, data: QueryData, revision?: number): Promise<string> => {
      setIsLoading(true);
      setError(null);
      try {
        // Call wizard session endpoint to execute createQuery action
        const response = await api.wizard.executeAction(
          sessionId,
          'query-configuration',
          'createQuery',
          {
            input: {
              overheidslaag: data.overheidstype || '',
              entity: data.overheidsinstantie,
              onderwerp: data.onderwerp,
            },
            revision,
          }
        );

        // Extract queryId from response
        const output = response.output as { queryId: string; query: { _id: string } } | undefined;
        if (!output || !output.queryId) {
          throw new Error('Invalid response from wizard createQuery action');
        }

        setQueryId(output.queryId);
        return output.queryId;
      } catch (err) {
        const apiError = err as {
          response?: {
            status?: number;
            data?: {
              error?: string;
              message?: string;
              expectedRevision?: number;
              actualRevision?: number;
            };
          };
          message?: string;
        };

        // Handle revision conflicts (409)
        if (apiError?.response?.status === 409) {
          const errorData = apiError.response.data;
          const error = new Error(
            errorData?.message ||
              `Revision conflict: expected revision ${errorData?.expectedRevision}, but found ${errorData?.actualRevision}`
          );
          setError(error);
          logError(error, 'create-query-wizard-revision-conflict');
          throw error;
        }

        const error =
          err instanceof Error
            ? err
            : new Error(
                apiError?.response?.data?.message ||
                  apiError?.message ||
                  'Failed to create query via wizard'
              );
        setError(error);
        logError(error, 'create-query-wizard');
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const getQuery = useCallback(async (id: string): Promise<QueryData | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const query = await api.getQuery(id);
      return query;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to get query');
      setError(error);
      logError(error, 'get-query');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getQueryProgress = useCallback(
    async (id: string): Promise<{
      queryId: string;
      progress: number;
      status: 'analyzing' | 'searching' | 'evaluating' | 'generating' | 'completed' | 'error';
      estimatedSecondsRemaining?: number;
      currentStep?: string;
      totalSteps?: number;
      startedAt: number;
      lastUpdated: number;
      error?: string;
    } | null> => {
      try {
        const progress = await api.getQueryProgress(id);
        return progress;
      } catch (err) {
        // Progress not found is ok (might not be initialized yet or already cleaned up)
        if (err instanceof Error && !err.message.includes('404')) {
          logError(err, 'get-query-progress');
        }
        return null;
      }
    },
    []
  );

  return {
    queryId,
    isLoading,
    error,
    createQuery,
    createQueryViaWizard,
    getQuery,
    getQueryProgress,
    setQueryId,
  };
}

