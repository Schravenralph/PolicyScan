import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

/**
 * React Query hook for fetching all workflows
 * 
 * @example
 * ```tsx
 * const { data: workflows, isLoading, error } = useWorkflows();
 * ```
 */
export function useWorkflows() {
  return useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      return await api.workflow.getWorkflows();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - workflows don't change often
  });
}

/**
 * React Query hook for fetching managed workflows (with lifecycle information)
 * 
 * @param status - Optional status filter
 * @example
 * ```tsx
 * const { data: workflows, isLoading } = useManagedWorkflows('Published');
 * ```
 */
export function useManagedWorkflows(status?: string) {
  return useQuery({
    queryKey: ['workflows', 'managed', status],
    queryFn: async () => {
      return await api.workflow.getManagedWorkflows(status);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * React Query hook for fetching a single workflow by ID
 * 
 * @param workflowId - The workflow ID to fetch
 * @example
 * ```tsx
 * const { data: workflow, isLoading, error } = useWorkflowById('workflow-123');
 * ```
 */
export function useWorkflowById(workflowId: string | null) {
  return useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: async () => {
      if (!workflowId) return null;
      return await api.workflow.getWorkflowById(workflowId);
    },
    enabled: !!workflowId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * React Query hook for fetching workflow outputs
 * 
 * @example
 * ```tsx
 * const { data: outputs, isLoading } = useWorkflowOutputs();
 * ```
 */
export function useWorkflowOutputs() {
  return useQuery({
    queryKey: ['workflow-outputs'],
    queryFn: async () => {
      return await api.workflow.getWorkflowOutputs();
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - outputs may change more frequently
  });
}

/**
 * React Query hook for fetching a single workflow output by name
 * 
 * @param name - The workflow output name to fetch
 * @example
 * ```tsx
 * const { data: output, isLoading } = useWorkflowOutput('output-123');
 * ```
 */
export function useWorkflowOutput(name: string | null) {
  return useQuery({
    queryKey: ['workflow-output', name],
    queryFn: async () => {
      if (!name) return null;
      return await api.workflow.getWorkflowOutput(name);
    },
    enabled: !!name,
    staleTime: 2 * 60 * 1000, // 2 minutes - outputs may change more frequently
  });
}

/**
 * React Query hook for fetching a workflow run by ID
 * 
 * @param runId - The run ID to fetch
 * @example
 * ```tsx
 * const { data: run, isLoading } = useWorkflowRun('run-123');
 * ```
 */
export function useWorkflowRun(runId: string | null) {
  return useQuery({
    queryKey: ['workflow-run', runId],
    queryFn: async () => {
      if (!runId) return null;
      return await api.workflow.getRun(runId);
    },
    enabled: !!runId,
    staleTime: 30 * 1000, // 30 seconds - runs may update frequently
  });
}

/**
 * React Query hook for fetching workflow run status
 * 
 * @param runId - The run ID to fetch status for
 * @param options - Options for polling
 * @example
 * ```tsx
 * const { data: status, isLoading } = useWorkflowRunStatus('run-123', {
 *   refetchInterval: 3000, // Poll every 3 seconds
 * });
 * ```
 */
export function useWorkflowRunStatus(
  runId: string | null,
  options?: {
    refetchInterval?: number | false;
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['workflow-run', runId, 'status'],
    queryFn: async () => {
      if (!runId) return null;
      const run = await api.workflow.getRun(runId);
      return run.status;
    },
    enabled: !!runId && (options?.enabled !== false),
    refetchInterval: options?.refetchInterval ?? false,
    staleTime: 0, // Status data is always stale (needs fresh fetch)
  });
}

/**
 * React Query hook for running a workflow
 * 
 * @example
 * ```tsx
 * const runWorkflow = useRunWorkflow();
 * 
 * const handleRun = async () => {
 *   const result = await runWorkflow.mutateAsync({
 *     workflowId: 'workflow-123',
 *     params: { query: 'test' },
 *   });
 * };
 * ```
 */
export function useRunWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      workflowId: string;
      params: Record<string, unknown>;
    }) => {
      // API accepts flexible parameters via passthrough, so we can pass any params
      return await api.workflow.runWorkflow(params.workflowId, params.params);
    },
    onSuccess: (result) => {
      // Invalidate workflow outputs to refetch
      queryClient.invalidateQueries({ queryKey: ['workflow-outputs'] });
      // Invalidate runs list
      queryClient.invalidateQueries({ queryKey: ['workflow-runs'] });
      // Set the new run in cache
      if (result.runId) {
        queryClient.setQueryData(['workflow-run', result.runId], result);
      }
    },
  });
}

/**
 * React Query hook for fetching workflow logs
 * 
 * @param runId - The run ID to fetch logs for
 * @example
 * ```tsx
 * const { data: logs, isLoading } = useWorkflowLogs('run-123');
 * ```
 */
export function useWorkflowLogs(runId: string | null) {
  return useQuery({
    queryKey: ['workflow-run', runId, 'logs'],
    queryFn: async () => {
      if (!runId) return null;
      const run = await api.workflow.getRun(runId);
      return run.logs;
    },
    enabled: !!runId,
    staleTime: 10 * 1000, // 10 seconds - logs may update frequently
  });
}


