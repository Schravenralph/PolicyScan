/**
 * React Query hook for fetching all workflows
 *
 * @example
 * ```tsx
 * const { data: workflows, isLoading, error } = useWorkflows();
 * ```
 */
export declare function useWorkflows(): import("@tanstack/react-query").UseQueryResult<import("../services/api").WorkflowDocument[], Error>;
/**
 * React Query hook for fetching managed workflows (with lifecycle information)
 *
 * @param status - Optional status filter
 * @example
 * ```tsx
 * const { data: workflows, isLoading } = useManagedWorkflows('Published');
 * ```
 */
export declare function useManagedWorkflows(status?: string): import("@tanstack/react-query").UseQueryResult<import("../services/api").WorkflowDocument[], Error>;
/**
 * React Query hook for fetching a single workflow by ID
 *
 * @param workflowId - The workflow ID to fetch
 * @example
 * ```tsx
 * const { data: workflow, isLoading, error } = useWorkflowById('workflow-123');
 * ```
 */
export declare function useWorkflowById(workflowId: string | null): import("@tanstack/react-query").UseQueryResult<import("../services/api").WorkflowDocument | null, Error>;
/**
 * React Query hook for fetching workflow outputs
 *
 * @example
 * ```tsx
 * const { data: outputs, isLoading } = useWorkflowOutputs();
 * ```
 */
export declare function useWorkflowOutputs(): import("@tanstack/react-query").UseQueryResult<{
    name: string;
    jsonPath: string;
    markdownPath: string;
    txtPath: string;
    createdAt: string;
}[], Error>;
/**
 * React Query hook for fetching a single workflow output by name
 *
 * @param name - The workflow output name to fetch
 * @example
 * ```tsx
 * const { data: output, isLoading } = useWorkflowOutput('output-123');
 * ```
 */
export declare function useWorkflowOutput(name: string | null): import("@tanstack/react-query").UseQueryResult<import("../services/api").WorkflowOutput | null, Error>;
/**
 * React Query hook for fetching a workflow run by ID
 *
 * @param runId - The run ID to fetch
 * @example
 * ```tsx
 * const { data: run, isLoading } = useWorkflowRun('run-123');
 * ```
 */
export declare function useWorkflowRun(runId: string | null): import("@tanstack/react-query").UseQueryResult<import("../services/api").Run | null, Error>;
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
export declare function useWorkflowRunStatus(runId: string | null, options?: {
    refetchInterval?: number | false;
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<"pending" | "completed" | "running" | "failed" | "cancelled" | "paused" | "completed_with_errors" | null, Error>;
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
export declare function useRunWorkflow(): import("@tanstack/react-query").UseMutationResult<{
    runId: string;
}, Error, {
    workflowId: string;
    params: Record<string, unknown>;
}, unknown>;
/**
 * React Query hook for fetching workflow logs
 *
 * @param runId - The run ID to fetch logs for
 * @example
 * ```tsx
 * const { data: logs, isLoading } = useWorkflowLogs('run-123');
 * ```
 */
export declare function useWorkflowLogs(runId: string | null): import("@tanstack/react-query").UseQueryResult<{
    id?: string;
    timestamp: string;
    level: string;
    message: string;
    formattedMessage?: string;
    thoughtBubble?: string;
    icon?: string;
    color?: string;
    metadata?: Record<string, unknown>;
}[] | null, Error>;
