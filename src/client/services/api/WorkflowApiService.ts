import { BaseApiService } from './BaseApiService';
import type { BronDocument } from '../../utils/transformations';
import type { BronWebsite } from './BronWebsiteApiService';
import { getApiBaseUrl } from '../../utils/apiUrl';

export interface WorkflowDocument {
  _id?: string;
  id: string;
  name: string;
  description?: string;
  steps: Array<{
    id: string;
    name: string;
    action: string;
    params?: Record<string, unknown>;
    next?: string;
  }>;
  status: 'Draft' | 'Testing' | 'Tested' | 'Published' | 'Unpublished' | 'Deprecated';
  version: number;
  statusHistory: Array<{
    status: string;
    timestamp: string;
    userId?: string;
    comment?: string;
  }>;
  publishedBy?: string;
  publishedAt?: string;
  testMetrics?: {
    runCount: number;
    acceptanceRate: number;
    errorRate: number;
    lastTestRun?: string;
  };
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface WorkflowOutput {
  metadata: {
    runId: string;
    workflowId: string;
    workflowName: string;
    startTime: string;
    endTime?: string;
    status: string;
    version: string;
  };
  parameters: Record<string, unknown>;
  trace: {
    workflowId: string;
    workflowName: string;
    runId: string;
    startTime: string;
    endTime?: string;
    status: string;
    steps: Array<{
      stepId: string;
      stepName: string;
      action: string;
      startTime: string;
      endTime?: string;
      status: string;
      urls?: string[];
    }>;
    totalUrlsVisited: number;
    totalDocumentsFound: number;
  };
  results: {
    summary: {
      totalPages: number;
      totalDocuments: number;
      newlyDiscovered: number;
      existing: number;
      errors: number;
    };
    webPages: Array<{
      url: string;
      title: string;
      type: string;
      status: string;
      visitedAt: string;
      depth: number;
      parentUrl?: string;
      filePath?: string;
    }>;
    documents: Array<{
      url: string;
      title: string;
      type: string;
      sourceUrl: string;
      relevanceScore?: number;
      discoveredAt: string;
      metadata?: Record<string, unknown>;
    }>;
    endpoints: Array<{
      url: string;
      title: string;
      type: string;
      sourceUrl: string;
      relevanceScore?: number;
    }>;
  };
  errors: Array<{
    timestamp: string;
    message: string;
    url?: string;
    stepId?: string;
  }>;
}

export interface Run {
  _id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused' | 'completed_with_errors';
  startTime: string;
  endTime?: string;
  params: Record<string, unknown>;
  logs: Array<{
    id?: string;
    timestamp: string;
    level: string;
    message: string;
    formattedMessage?: string;
    thoughtBubble?: string;
    icon?: string;
    color?: string;
    metadata?: Record<string, unknown>;
  }>;
  result?: unknown;
  error?: string;
  outputPaths?: {
    jsonPath: string;
    markdownPath: string;
    txtPath: string;
    csvPath: string;
    htmlPath: string;
    xmlPath: string;
  };
}

/**
 * Workflow API service
 */
export class WorkflowApiService extends BaseApiService {
  // Workflow output endpoints
  async getWorkflowOutputs() {
    return this.request<Array<{
      name: string;
      jsonPath: string;
      markdownPath: string;
      txtPath: string;
      createdAt: string;
    }>>('/workflow-outputs');
  }

  async downloadWorkflowOutput(name: string, format: 'json' | 'md' | 'txt'): Promise<void> {
    // Use base class infrastructure for consistent error handling and auth
    // We need to use fetch directly to access response headers for filename
    const token = this.getAuthToken();
    
    // Use the normalized API base URL that handles localhost:4000 normalization
    // Call getApiBaseUrl() dynamically to ensure test server URLs are read correctly
    const apiBaseUrl = getApiBaseUrl();
    
    const response = await fetch(`${apiBaseUrl}/workflow-outputs/${encodeURIComponent(name)}/download/${encodeURIComponent(format)}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      // Use centralized error parsing like BaseApiService
      const text = await response.text();
      let errorData: unknown;
      try {
        errorData = text ? JSON.parse(text) : { message: response.statusText };
      } catch {
        errorData = { message: response.statusText };
      }

      const { parseApiErrorResponse } = await import('../../utils/errorHandler');
      const errorInfo = parseApiErrorResponse(
        typeof errorData === 'object' && errorData !== null
          ? (errorData as { code?: string; message?: string; statusCode?: number })
          : { message: response.statusText, statusCode: response.status }
      );

      throw new Error(errorInfo.message || 'Failed to download file');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Get filename from Content-Disposition header or construct it
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `${name}.${format}`;
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }

    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async getWorkflowOutput(name: string) {
    return this.request<WorkflowOutput>(`/workflow-outputs/${encodeURIComponent(name)}`);
  }

  async convertWorkflowOutputToDocuments(name: string, queryId: string) {
    return this.request<{
      message: string;
      documentsCreated: number;
      websitesCreated: number;
      documents: BronDocument[];
      websites: BronWebsite[];
    }>(`/workflow-outputs/${encodeURIComponent(name)}/to-documents`, {
      method: 'POST',
      body: JSON.stringify({ queryId }),
    });
  }

  // Workflow management endpoints (lifecycle management)
  async getWorkflows() {
    return this.request<WorkflowDocument[]>('/workflows');
  }

  async getWorkflowById(id: string) {
    return this.request<WorkflowDocument>(`/workflows/manage/${encodeURIComponent(id)}`);
  }

  async getManagedWorkflows(status?: string) {
    const url = status ? `/workflows/manage?status=${status}` : '/workflows/manage';
    return this.request<WorkflowDocument[]>(url);
  }

  async getManagedWorkflow(id: string) {
    return this.request<WorkflowDocument>(`/workflows/manage/${encodeURIComponent(id)}`);
  }

  async createWorkflow(workflow: {
    id: string;
    name: string;
    description?: string;
    steps: Array<{
      id: string;
      name: string;
      action: string;
      params?: Record<string, unknown>;
      next?: string;
    }>;
  }) {
    return this.request<WorkflowDocument>('/workflows/manage', {
      method: 'POST',
      body: JSON.stringify(workflow),
    });
  }

  async updateWorkflow(
    id: string,
    updates: {
      name?: string;
      description?: string;
      steps?: Array<{
        id: string;
        name: string;
        action: string;
        params?: Record<string, unknown>;
        next?: string;
      }>;
    }
  ) {
    return this.request<WorkflowDocument>(`/workflows/manage/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async updateWorkflowStatus(
    id: string, 
    status: string, 
    comment?: string,
    runningInstanceBehavior?: 'complete' | 'cancel'
  ) {
    return this.request<WorkflowDocument & { runningInstancesHandled?: { total: number; cancelled: number; completed: number } }>(
      `/workflows/manage/${encodeURIComponent(id)}/status`, 
      {
        method: 'POST',
        body: JSON.stringify({ status, comment, runningInstanceBehavior }),
      }
    );
  }

  async getRunningInstances(workflowId: string) {
    // Get all runs for this workflow and filter for active ones
    // We'll need to use the runs endpoint and filter client-side for now
    // In the future, we could add a dedicated endpoint
    const response = await this.request<Array<{
      _id: string;
      status: string;
      startTime: string;
      params: Record<string, unknown>;
    }>>('/runs');
    return response.filter(
      (run) => 
        (run.params.workflowId === workflowId || run.params.workflowName === workflowId) &&
        (run.status === 'running' || run.status === 'pending')
    );
  }

  async checkQualityGates(id: string) {
    return this.request<{ passed: boolean; reasons: string[] }>(
      `/workflows/manage/${encodeURIComponent(id)}/quality-gates`
    );
  }

  async updateTestMetrics(
    id: string,
    metrics: {
      runCount: number;
      acceptanceRate: number;
      errorRate: number;
    }
  ) {
    return this.request<WorkflowDocument>(`/workflows/manage/${encodeURIComponent(id)}/test-metrics`, {
      method: 'POST',
      body: JSON.stringify(metrics),
    });
  }

  async getWorkflowHistory(id: string) {
    return this.request<{
      id: string;
      name: string;
      version: number;
      statusHistory: Array<{
        status: string;
        timestamp: string;
        userId?: string;
        comment?: string;
      }>;
      publishedBy?: string;
      publishedAt?: string;
      testMetrics?: {
        runCount: number;
        acceptanceRate: number;
        errorRate: number;
        lastTestRun?: string;
      };
    }>(`/workflows/manage/${encodeURIComponent(id)}/history`);
  }

  async previewRollback(id: string, version: number) {
    return this.request<{
      currentVersion: number;
      targetVersion: number;
      changes: Array<{
        field: string;
        current: unknown;
        previous: unknown;
      }>;
      warnings: string[];
    }>(`/workflows/manage/${encodeURIComponent(id)}/rollback/preview?version=${version}`);
  }

  async rollbackWorkflow(id: string, version: number, comment?: string) {
    return this.request<{
      message: string;
      workflow: WorkflowDocument;
    }>(`/workflows/manage/${encodeURIComponent(id)}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ version, comment }),
    });
  }

  async getVersionHistory(id: string, options?: { limit?: number; skip?: number }) {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.skip) params.append('offset', String(options.skip)); // Backend uses 'offset' not 'skip'
    const queryString = params.toString();
    const url = queryString ? `/workflows/manage/${encodeURIComponent(id)}/history?${queryString}` : `/workflows/manage/${encodeURIComponent(id)}/history`;
    const response = await this.request<{
      id: string;
      name: string;
      version: number;
      versions: Array<{
        version: number;
        status: string;
        publishedBy?: string;
        publishedAt?: string;
        changes?: string[];
      }>;
      pagination: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      };
      statusHistory: Array<{
        status: string;
        timestamp: string;
        userId?: string;
        comment?: string;
      }>;
      publishedBy?: string;
      publishedAt?: string;
      testMetrics?: {
        runCount: number;
        acceptanceRate: number;
        errorRate: number;
        lastTestRun?: string;
      };
    }>(url);
    // Return in the format expected by the component
    return {
      versions: response.versions || [],
      total: response.pagination?.total || 0,
      hasMore: response.pagination?.hasMore || false,
    };
  }

  async deleteWorkflow(id: string) {
    return this.request<{ message: string; workflow: WorkflowDocument }>(
      `/workflows/manage/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      }
    );
  }

  // Workflow module endpoints (US-006, WI-349)
  async getWorkflowModules(filters?: {
    query?: string;
    category?: string;
    tags?: string[];
    author?: string;
    published?: boolean;
    minVersion?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.query) params.append('query', filters.query);
    if (filters?.category) params.append('category', filters.category);
    if (filters?.tags) params.append('tags', filters.tags.join(','));
    if (filters?.author) params.append('author', filters.author);
    if (filters?.published !== undefined) params.append('published', String(filters.published));
    if (filters?.minVersion) params.append('minVersion', filters.minVersion);

    const queryString = params.toString();
    const url = queryString ? `/workflows/modules?${queryString}` : '/workflows/modules';
    
    return this.request<{
      modules: Array<{
        metadata: {
          id: string;
          name: string;
          version: string;
          description: string;
          category: string;
          author: {
            name: string;
            email?: string;
            url?: string;
          };
          license: string;
          repository?: string;
          tags: string[];
          dependencies: Array<{
            moduleId: string;
            version?: string;
            required?: boolean;
          }>;
          keywords?: string[];
          homepage?: string;
          icon?: string;
          published: boolean;
          createdAt: string;
          updatedAt: string;
          compatibility?: {
            minEngineVersion?: string;
            maxEngineVersion?: string;
          };
        };
        registeredAt: string;
        usageCount: number;
      }>;
      total: number;
      hasMore: boolean;
    }>(url);
  }

  async getWorkflowModule(id: string) {
    return this.request<{
      metadata: {
        id: string;
        name: string;
        version: string;
        description: string;
        category: string;
        author: {
          name: string;
          email?: string;
          url?: string;
        };
        license: string;
        repository?: string;
        tags: string[];
        dependencies: Array<{
          moduleId: string;
          version?: string;
          required?: boolean;
        }>;
        keywords?: string[];
        homepage?: string;
        icon?: string;
        published: boolean;
        createdAt: string;
        updatedAt: string;
        compatibility?: {
          minEngineVersion?: string;
          maxEngineVersion?: string;
        };
      };
      registeredAt: string;
      usageCount: number;
    }>(`/workflows/modules/${encodeURIComponent(id)}`);
  }

  async getWorkflowModuleSchema(id: string) {
    return this.request<Record<
      string,
      {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object';
        label: string;
        description?: string;
        required?: boolean;
        default?: unknown;
        options?: Array<{ value: string | number; label: string }>;
        validation?: {
          min?: number;
          max?: number;
          pattern?: string;
        };
      }
    >>(`/workflows/modules/${encodeURIComponent(id)}/schema`);
  }

  async getWorkflowModulesByCategory(category: string) {
    return this.request<{
      modules: Array<{
        metadata: {
          id: string;
          name: string;
          version: string;
          description: string;
          category: string;
          author: {
            name: string;
            email?: string;
            url?: string;
          };
          license: string;
          repository?: string;
          tags: string[];
          dependencies: Array<{
            moduleId: string;
            version?: string;
            required?: boolean;
          }>;
          keywords?: string[];
          homepage?: string;
          icon?: string;
          published: boolean;
          createdAt: string;
          updatedAt: string;
          compatibility?: {
            minEngineVersion?: string;
            maxEngineVersion?: string;
          };
        };
        registeredAt: string;
        usageCount: number;
      }>;
      total: number;
      hasMore: boolean;
    }>(`/workflows/modules/category/${encodeURIComponent(category)}`);
  }

  async getModuleCategories() {
    return this.request<{ categories: string[] }>('/workflows/modules/categories/list');
  }

  async getModuleTags() {
    return this.request<{ tags: string[] }>('/workflows/modules/tags/list');
  }

  async getModuleStatistics() {
    return this.request<{
      totalModules: number;
      publishedModules: number;
      categories: number;
      tags: number;
      authors: number;
      totalUsage: number;
    }>('/workflows/modules/statistics');
  }

  /**
   * Get all workflows that use a specific module
   * This helps track module reuse across workflows (US-006 requirement)
   */
  async getWorkflowsUsingModule(moduleId: string) {
    return this.request<{
      moduleId: string;
      moduleName: string;
      workflows: Array<{
        id: string;
        name: string;
        description?: string;
        status: string;
        version: number;
        stepsUsingModule: Array<{
          id: string;
          name: string;
          action: string;
          params?: Record<string, unknown>;
        }>;
      }>;
      total: number;
    }>(`/workflows/modules/${encodeURIComponent(moduleId)}/workflows`);
  }

  // Workflow sharing endpoints (US-008)
  async shareWorkflow(
    workflowId: string,
    userId?: string,
    teamId?: string,
    level: 'owner' | 'editor' | 'runner' | 'viewer' = 'viewer'
  ) {
    return this.request<{
      workflowId: string;
      ownerId: string;
      visibility: 'private' | 'team' | 'public';
      permissions: Array<{
        userId?: string;
        teamId?: string;
        level: string;
        grantedBy: string;
        grantedAt: string;
      }>;
    }>(`/workflows/${encodeURIComponent(workflowId)}/share`, {
      method: 'POST',
      body: JSON.stringify({ userId, teamId, level }),
    });
  }

  async removeWorkflowAccess(workflowId: string, userId: string) {
    return this.request<{ message: string }>(`/workflows/${encodeURIComponent(workflowId)}/share/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  }

  async updateWorkflowPermission(
    workflowId: string,
    userId: string,
    level: 'owner' | 'editor' | 'runner' | 'viewer'
  ) {
    return this.request<{
      workflowId: string;
      ownerId: string;
      visibility: 'private' | 'team' | 'public';
      permissions: Array<{
        userId?: string;
        teamId?: string;
        level: string;
        grantedBy: string;
        grantedAt: string;
      }>;
    }>(`/workflows/${encodeURIComponent(workflowId)}/permissions/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ level }),
    });
  }

  async transferWorkflowOwnership(workflowId: string, newOwnerId: string) {
    return this.request<{
      workflowId: string;
      ownerId: string;
      visibility: 'private' | 'team' | 'public';
      permissions: Array<{
        userId?: string;
        teamId?: string;
        level: string;
        grantedBy: string;
        grantedAt: string;
      }>;
    }>(`/workflows/${encodeURIComponent(workflowId)}/transfer-ownership`, {
      method: 'POST',
      body: JSON.stringify({ newOwnerId }),
    });
  }

  async getWorkflowActivity(workflowId: string) {
    return this.request<
      Array<{
        timestamp: string;
        userId: string;
        userName?: string;
        action: string;
        details?: string;
      }>
    >(`/workflows/${encodeURIComponent(workflowId)}/activity`);
  }

  async getSharedWorkflows() {
    return this.request<
      Array<{
        id: string;
        name: string;
        description?: string;
        myPermission?: 'owner' | 'editor' | 'runner' | 'viewer' | null;
      }>
    >('/workflows/shared-with-me');
  }

  async getWorkflowPermissions(workflowId: string) {
    return this.request<{
      workflowId: string;
      ownerId: string;
      visibility: 'private' | 'team' | 'public';
      permissions: Array<{
        userId?: string;
        teamId?: string;
        level: string;
        grantedBy: string;
        grantedAt: string;
        userName?: string;
        userEmail?: string;
      }>;
    }>(`/workflows/${encodeURIComponent(workflowId)}/permissions`);
  }

  async updateWorkflowVisibility(
    workflowId: string,
    visibility: 'private' | 'team' | 'public'
  ) {
    return this.request<{
      workflowId: string;
      ownerId: string;
      visibility: 'private' | 'team' | 'public';
      permissions: Array<{
        userId?: string;
        teamId?: string;
        level: string;
        grantedBy: string;
        grantedAt: string;
      }>;
    }>(`/workflows/${encodeURIComponent(workflowId)}/visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility }),
    });
  }

  // Run endpoints (for workflow execution tracking)
  // Note: Backend uses .passthrough() so any parameters are allowed
  // This matches the backend validation schema which allows workflow-specific parameters
  async runWorkflow(
    workflowId: string,
    params: {
      mode?: string;
      reviewMode?: boolean;
      query?: string;
      queryId?: string;
      selectedWebsites?: string[];
      overheidstype?: string;
      overheidsinstantie?: string;
      onderwerp?: string;
      thema?: string;
      randomness?: number;
      [key: string]: unknown; // Allow any additional workflow-specific parameters
    }
  ) {
    return this.request<{ runId: string }>(`/workflows/${encodeURIComponent(workflowId)}/run`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async getRecentRuns(limit: number = 20) {
    return this.request<Run[]>(`/runs?limit=${limit}`);
  }

  // Queue management endpoints
  async getWorkflowQueueJobs() {
    return this.request<{
      jobs: Array<{
        jobId: string;
        workflowId: string;
        runId?: string;
        status: 'waiting' | 'active' | 'paused';
        createdAt: string;
        startedAt?: string;
        params: Record<string, unknown>;
      }>;
      count: number;
      waiting: number;
      active: number;
    }>('/queue/workflow/jobs');
  }

  async pauseQueueJob(jobId: string) {
    return this.request<{ message: string; jobId: string }>(`/queue/workflow/jobs/${encodeURIComponent(jobId)}/pause`, {
      method: 'POST',
    });
  }

  async resumeQueueJob(jobId: string) {
    return this.request<{ message: string; jobId: string }>(`/queue/workflow/jobs/${encodeURIComponent(jobId)}/resume`, {
      method: 'POST',
    });
  }

  async removeQueueJob(jobId: string) {
    return this.request<{ message: string; jobId: string }>(`/queue/workflow/jobs/${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
    });
  }

  async getRun(runId: string) {
    return this.request<Run>(`/runs/${encodeURIComponent(runId)}`);
  }

  async getGraphStream(runId: string) {
    return this.request<{
      runId: string;
      timestamp: string;
      nodes: Array<{
        id: string;
        url: string;
        title: string;
        type: 'page' | 'section' | 'document';
        children: string[];
        lastVisited?: string;
        hasChildren?: boolean;
        childCount?: number;
        score?: number;
        depth?: number;
      }>;
      childNodes?: Array<{
        id: string;
        url: string;
        title: string;
        type: 'page' | 'section' | 'document';
        children: string[];
        lastVisited?: string;
        hasChildren?: boolean;
        childCount?: number;
        score?: number;
        depth?: number;
      }>;
      edges: Array<{ source: string; target: string }>;
      stats: {
        totalNodes: number;
        totalEdges: number;
        displayedNode?: string;
        childCount?: number;
        navigatedCount?: number;
      };
      message?: string;
    }>(`/graph/stream/${encodeURIComponent(runId)}`);
  }

  async pauseRun(runId: string) {
    return this.request<Run>(`/runs/${encodeURIComponent(runId)}/pause`, {
      method: 'POST',
    });
  }

  async resumeRun(runId: string) {
    return this.request<Run>(`/runs/${encodeURIComponent(runId)}/resume`, {
      method: 'POST',
    });
  }

  async cancelRun(runId: string) {
    return this.request<Run>(`/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
    });
  }

  // Export endpoints
  async exportResults(
    documents: Array<{
      id: string;
      content: string;
      sourceUrl?: string;
      metadata?: Record<string, unknown>;
    }>,
    format: 'csv' | 'pdf',
    options?: {
      includeCitations?: boolean;
      citationFormat?: 'apa' | 'custom';
      searchParams?: {
        topic?: string;
        location?: string;
        jurisdiction?: string;
      };
    }
  ): Promise<Blob> {
    return this.request<Blob>('/export', {
      method: 'POST',
      body: JSON.stringify({
        documents,
        format,
        includeCitations: options?.includeCitations || false,
        citationFormat: options?.citationFormat || 'apa',
        searchParams: options?.searchParams,
      }),
      responseType: 'blob',
    });
  }

  async emailExport(
    documents: Array<{
      id: string;
      content: string;
      sourceUrl?: string;
      metadata?: Record<string, unknown>;
    }>,
    recipients: string[],
    searchParams?: {
      topic?: string;
      location?: string;
      jurisdiction?: string;
    },
    options?: {
      includeCitations?: boolean;
      citationFormat?: 'apa' | 'custom';
    }
  ): Promise<{ message: string; recipients: number }> {
    return this.request<{ message: string; recipients: number }>('/export/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documents,
        recipients,
        searchParams,
        includeCitations: options?.includeCitations || false,
        citationFormat: options?.citationFormat || 'apa',
      }),
    });
  }

  // Benchmark configuration endpoints
  async getBenchmarkConfig(workflowId: string) {
    return this.request<{
      featureFlags?: Record<string, boolean>;
      params?: Record<string, unknown>;
      timeout?: number;
      maxRetries?: number;
      maxMemoryMB?: number;
      maxConcurrentRequests?: number;
      _source?: 'custom' | 'default' | null; // Metadata indicating config source (non-enumerable in response)
    }>(`/workflows/manage/${encodeURIComponent(workflowId)}/benchmark-config`);
  }

  async setBenchmarkConfig(
    workflowId: string,
    config: {
      featureFlags?: Record<string, boolean>;
      params?: Record<string, unknown>;
      timeout?: number;
      maxRetries?: number;
      maxMemoryMB?: number;
      maxConcurrentRequests?: number;
    }
  ) {
    return this.request<{
      success: boolean;
      benchmarkConfig: {
        featureFlags?: Record<string, boolean>;
        params?: Record<string, unknown>;
        timeout?: number;
        maxRetries?: number;
        maxMemoryMB?: number;
        maxConcurrentRequests?: number;
      };
    }>(`/workflows/manage/${encodeURIComponent(workflowId)}/benchmark-config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }
}

