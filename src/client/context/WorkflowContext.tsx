import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import { api } from '../services/api';
import type { WorkflowDocument } from '../services/api/WorkflowApiService';
import { logError } from '../utils/errorHandler';
import { checkConnectionHealth } from '../utils/connectionHealth';

interface WorkflowContextType {
  workflows: WorkflowDocument[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  getWorkflowById: (id: string) => WorkflowDocument | undefined;
}

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [workflows, setWorkflows] = useState<WorkflowDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const workflowsRef = useRef<WorkflowDocument[]>([]);
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  // Keep ref in sync with state
  useEffect(() => {
    workflowsRef.current = workflows;
  }, [workflows]);

  const loadWorkflows = useCallback(async (retryAttempt = 0) => {
    setIsLoading(true);
    if (retryAttempt === 0) {
      setError(null);
    }
    
    // Clear any pending retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    
    try {
      const fetchedWorkflows = await api.getWorkflows();
      
      // Validate that we got a valid array
      if (!Array.isArray(fetchedWorkflows)) {
        throw new Error('Invalid response format: expected array of workflows');
      }
      
      // Always update workflows with fresh data from API
      // But validate the data first
      const validWorkflows = fetchedWorkflows.filter(w => w && w.id && w.name);
      
      const currentWorkflows = workflowsRef.current;
      if (validWorkflows.length > 0 || currentWorkflows.length === 0) {
        // Update if we got valid workflows, or if we had no workflows before
        setWorkflows(validWorkflows);
        setError(null);
      } else {
        // If we got empty array but had workflows before, preserve existing ones
        // This prevents clearing workflows due to transient API issues
        console.warn('Received empty workflows array, preserving existing workflows');
      }
    } catch (err) {
      // Preserve error properties (code, statusCode, etc.) when creating error object
      const error = err instanceof Error 
        ? err 
        : new Error('Failed to load workflows');
      
      // Preserve error properties from the original error
      if (err && typeof err === 'object') {
        const errObj = err as Record<string, unknown>;
        if (errObj.code) (error as any).code = errObj.code;
        if (errObj.statusCode) (error as any).statusCode = errObj.statusCode;
        if (errObj.endpoint) (error as any).endpoint = errObj.endpoint;
        if (errObj.method) (error as any).method = errObj.method;
        if (errObj.response) (error as any).response = errObj.response;
      }
      
      // Check if this is a network error - if so, get health diagnostics immediately
      const errorMessage = error.message.toLowerCase();
      const isNetworkError = 
        errorMessage.includes('failed to connect') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('niet bereikbaar') || // Dutch: "not reachable"
        errorMessage.includes('not reachable') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('fetch') ||
        errorMessage.includes('network') ||
        (error as any).code === 'ECONNREFUSED' ||
        (error as any).code === 'ETIMEDOUT' ||
        (error as any).code === 'ENOTFOUND' ||
        (error as any).code === 'EAI_AGAIN' ||
        (error as any).statusCode === undefined; // Network errors don't have status codes
      
      // Store health check result for use in retry logic
      let healthCheckResult: { healthy: boolean; apiUrl: string; isUsingProxy: boolean; diagnostic?: string; error?: string } | null = null;
      let finalError = error;
      
      // If it's a network error, get health diagnostics to enhance the error message
      if (isNetworkError) {
        try {
          const healthCheck = await checkConnectionHealth();
          healthCheckResult = {
            healthy: healthCheck.healthy,
            apiUrl: healthCheck.apiUrl,
            isUsingProxy: healthCheck.isUsingProxy,
            diagnostic: healthCheck.diagnostic,
            error: healthCheck.error,
          };
          
          // Enhance error with health diagnostics
          const enhancedMessage = healthCheck.healthy
            ? `${error.message}\n\nNote: Backend health check passed, but workflow request failed. This may be a transient issue.`
            : `${error.message}\n\nDiagnostics: ${healthCheck.diagnostic || healthCheck.error || 'Backend connection check failed'}`;
          
          // Create enhanced error with diagnostics
          const enhancedError = new Error(enhancedMessage);
          // Preserve all original error properties
          Object.assign(enhancedError, error);
          // Add health check info
          (enhancedError as any).healthCheck = healthCheckResult;
          
          finalError = enhancedError;
          logError(enhancedError, 'load-workflows');
          setError(enhancedError);
        } catch (healthError) {
          // Health check itself failed - log original error with note about health check failure
          const healthCheckFailedError = new Error(`${error.message}\n\nNote: Could not check backend health: ${healthError instanceof Error ? healthError.message : String(healthError)}`);
          Object.assign(healthCheckFailedError, error);
          finalError = healthCheckFailedError;
          logError(healthCheckFailedError, 'load-workflows');
          setError(healthCheckFailedError);
        }
      } else {
        // Not a network error - log and set error normally
        logError(error, 'load-workflows');
        setError(error);
      }
      
      // Don't clear workflows on error - preserve existing ones
      // This prevents the UI from going blank due to transient errors
      // Only clear if this is the first load and we have no workflows
      const currentWorkflows = workflowsRef.current;
      if (currentWorkflows.length === 0 && retryAttempt === 0) {
        // First load failed, keep empty array
        setWorkflows([]);
      }
      // Otherwise, keep existing workflows to prevent UI from going blank
      
      // Retry logic for transient errors
      // Only retry on network/connection errors, not on permanent errors (4xx)
      // Note: isNetworkError was already determined above, but we need to check for 5xx errors too
      const isRetryableError = isNetworkError || 
        ((error as any).statusCode && (error as any).statusCode >= 500); // Retry on 5xx errors
      
      // Use health check result from above (if available) or check error object
      const existingHealthCheck = healthCheckResult || (finalError as any).healthCheck;
      
      if (isRetryableError && retryAttempt < maxRetries) {
        const nextRetry = retryAttempt + 1;
        const delay = retryDelay * nextRetry;
        console.log(`[WorkflowContext] Retrying workflow load (attempt ${nextRetry}/${maxRetries}) after ${delay}ms...`, {
          error: finalError.message,
          code: (finalError as any).code,
          statusCode: (finalError as any).statusCode,
          endpoint: (finalError as any).endpoint,
          healthCheck: existingHealthCheck ? { healthy: existingHealthCheck.healthy, diagnostic: existingHealthCheck.diagnostic } : undefined,
        });
        
        retryTimeoutRef.current = setTimeout(() => {
          loadWorkflows(nextRetry);
        }, delay); // Exponential backoff
      } else {
        // Max retries reached or non-retryable error
        // If we already have health check info, use it; otherwise check again
        if (retryAttempt >= maxRetries && isRetryableError) {
          // Check if backend came back up (re-check health if we don't have recent info)
          try {
            const healthCheck = existingHealthCheck 
              ? { healthy: existingHealthCheck.healthy, apiUrl: existingHealthCheck.apiUrl }
              : await checkConnectionHealth();
            
            if (healthCheck.healthy) {
              // Backend is actually reachable - this was a transient error
              // Retry one more time immediately
              console.log('[WorkflowContext] Backend health check passed after retries, retrying workflow load...');
              setTimeout(() => {
                loadWorkflows(0); // Reset retry count
              }, 500);
              return; // Don't set error state
            }
          } catch (healthError) {
            // Health check itself failed - backend is likely down
            console.error('[WorkflowContext] Backend health check also failed, backend is likely down', {
              error: healthError instanceof Error ? healthError.message : String(healthError),
              stack: healthError instanceof Error ? healthError.stack : undefined,
            });
            // Log to error handler for better tracking
            if (healthError instanceof Error) {
              logError(healthError, 'WorkflowContext.healthCheck');
            }
          }
        }
        
        // Only show error if backend is confirmed down or it's a non-retryable error
        if (retryAttempt >= maxRetries) {
          console.error('[WorkflowContext] Failed to load workflows after maximum retries', {
            attempts: retryAttempt + 1,
            error: finalError.message,
            code: (finalError as any).code,
            statusCode: (finalError as any).statusCode,
            endpoint: (finalError as any).endpoint,
            response: (finalError as any).response,
            healthCheck: existingHealthCheck,
          });
        } else {
          console.error('[WorkflowContext] Non-retryable error, stopping retry attempts:', {
            error: finalError.message,
            code: (finalError as any).code,
            statusCode: (finalError as any).statusCode,
            isRetryable: isRetryableError,
          });
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkflows();
    
    // Cleanup: clear any pending retry timeout on unmount
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [loadWorkflows]);

  // Create a Map for O(1) lookup instead of O(n) find()
  // This optimization is especially important when getWorkflowById is called frequently
  const workflowMap = useMemo(() => {
    const map = new Map<string, WorkflowDocument>();
    workflows.forEach(workflow => {
      map.set(workflow.id, workflow);
    });
    return map;
  }, [workflows]);

  const getWorkflowById = useCallback(
    (id: string) => {
      return workflowMap.get(id);
    },
    [workflowMap]
  );

  const refetch = useCallback(() => {
    // Reset retry count and start fresh load
    return loadWorkflows(0);
  }, [loadWorkflows]);

  const value = useMemo(
    () => ({
      workflows,
      isLoading,
      error,
      refetch,
      getWorkflowById,
    }),
    [workflows, isLoading, error, refetch, getWorkflowById]
  );

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflows() {
  const context = useContext(WorkflowContext);
  if (context === undefined) {
    throw new Error('useWorkflows must be used within a WorkflowProvider');
  }
  return context;
}

