import { BaseApiService } from './BaseApiService';

/**
 * AI Crawling API service
 */
export class AICrawlingApiService extends BaseApiService {
  async getAICrawlingConfig(siteUrl?: string, queryConfig?: Record<string, unknown>) {
    const params = new URLSearchParams();
    if (siteUrl) params.append('siteUrl', siteUrl);
    if (queryConfig) params.append('config', JSON.stringify(queryConfig));
    const queryString = params.toString();
    return this.request<{
      scope: string;
      aggressiveness: 'low' | 'medium' | 'high';
      strategy: 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
      maxDepth?: number;
      maxLinks?: number;
      llmModel?: string;
      cacheEnabled?: boolean;
      cacheTTL?: number;
      timeout?: number;
      fallbackBehavior?: 'traditional' | 'skip';
      enabled: boolean;
    }>(`/ai-crawling/config${queryString ? `?${queryString}` : ''}`);
  }

  async getAICrawlingConfigs(filters?: {
    scope?: 'global' | 'site' | 'query';
    siteUrl?: string;
    enabled?: boolean;
    limit?: number;
    skip?: number;
  }) {
    const params = new URLSearchParams();
    if (filters?.scope) params.append('scope', filters.scope);
    if (filters?.siteUrl) params.append('siteUrl', filters.siteUrl);
    if (filters?.enabled !== undefined) params.append('enabled', String(filters.enabled));
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.skip) params.append('skip', String(filters.skip));
    const queryString = params.toString();
    return this.request<
      Array<{
        _id?: string;
        scope: 'global' | 'site' | 'query';
        siteUrl?: string;
        aggressiveness: 'low' | 'medium' | 'high';
        strategy: 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: 'traditional' | 'skip';
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
        createdBy?: string;
      }>
    >(`/ai-crawling/configs${queryString ? `?${queryString}` : ''}`);
  }

  async getAICrawlingConfigById(id: string) {
    return this.request<{
      _id?: string;
      scope: 'global' | 'site' | 'query';
      siteUrl?: string;
      aggressiveness: 'low' | 'medium' | 'high';
      strategy: 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
      maxDepth?: number;
      maxLinks?: number;
      llmModel?: string;
      cacheEnabled?: boolean;
      cacheTTL?: number;
      timeout?: number;
      fallbackBehavior?: 'traditional' | 'skip';
      enabled: boolean;
      createdAt: string;
      updatedAt: string;
      createdBy?: string;
    }>(`/ai-crawling/configs/${id}`);
  }

  async createAICrawlingConfig(config: {
    scope: 'global' | 'site' | 'query';
    siteUrl?: string;
    aggressiveness: 'low' | 'medium' | 'high';
    strategy: 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
    maxDepth?: number;
    maxLinks?: number;
    llmModel?: string;
    cacheEnabled?: boolean;
    cacheTTL?: number;
    timeout?: number;
    fallbackBehavior?: 'traditional' | 'skip';
    enabled?: boolean;
  }) {
    return this.request<{
      _id?: string;
      scope: 'global' | 'site' | 'query';
      siteUrl?: string;
      aggressiveness: 'low' | 'medium' | 'high';
      strategy: 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
      maxDepth?: number;
      maxLinks?: number;
      llmModel?: string;
      cacheEnabled?: boolean;
      cacheTTL?: number;
      timeout?: number;
      fallbackBehavior?: 'traditional' | 'skip';
      enabled: boolean;
      createdAt: string;
      updatedAt: string;
      createdBy?: string;
    }>('/ai-crawling/configs', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async updateAICrawlingConfig(
    id: string,
    updates: {
      aggressiveness?: 'low' | 'medium' | 'high';
      strategy?: 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
      maxDepth?: number;
      maxLinks?: number;
      llmModel?: string;
      cacheEnabled?: boolean;
      cacheTTL?: number;
      timeout?: number;
      fallbackBehavior?: 'traditional' | 'skip';
      enabled?: boolean;
    }
  ) {
    return this.request<{
      _id?: string;
      scope: 'global' | 'site' | 'query';
      siteUrl?: string;
      aggressiveness: 'low' | 'medium' | 'high';
      strategy: 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
      maxDepth?: number;
      maxLinks?: number;
      llmModel?: string;
      cacheEnabled?: boolean;
      cacheTTL?: number;
      timeout?: number;
      fallbackBehavior?: 'traditional' | 'skip';
      enabled: boolean;
      createdAt: string;
      updatedAt: string;
      createdBy?: string;
    }>(`/ai-crawling/configs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteAICrawlingConfig(id: string) {
    return this.request<void>(`/ai-crawling/configs/${id}`, {
      method: 'DELETE',
    });
  }

  async getGlobalAICrawlingConfig() {
    return this.request<{
      scope: 'global';
      aggressiveness: 'low' | 'medium' | 'high';
      strategy: 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
      maxDepth?: number;
      maxLinks?: number;
      llmModel?: string;
      cacheEnabled?: boolean;
      cacheTTL?: number;
      timeout?: number;
      fallbackBehavior?: 'traditional' | 'skip';
      enabled: boolean;
    }>('/ai-crawling/global');
  }

  /**
   * Get explanation for why a document was found via AI-guided crawling
   */
  async getDocumentExplanation(documentUrl: string): Promise<{
    explanation: string;
    detailedExplanation: string;
    strategy: string;
    confidence?: number;
    reasoning?: string;
    traceId?: string;
    baseUrl?: string;
    query?: string;
    crawlDate?: Date;
    decisionPath?: Array<{
      step: number;
      decisionType: string;
      reasoning?: string;
      timestamp?: Date;
    }>;
  } | null> {
    try {
      const encodedUrl = encodeURIComponent(documentUrl);
      return await this.request(`/ai-crawling/traces/document/${encodedUrl}/explanation`);
    } catch (error: unknown) {
      // If explanation not found, return null (document wasn't found via AI crawling)
      if ((error as { response?: { status?: number } })?.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get AI crawling trace by session ID (admin/developer only)
   */
  async getAICrawlingTrace(sessionId: string): Promise<{
    trace: {
      _id?: string;
      sessionId: string;
      baseUrl: string;
      query: string;
      strategy: 'site_search' | 'ai_navigation' | 'traditional_crawl' | 'hybrid';
      decisions: Array<{
        decisionType: string;
        timestamp: Date;
        confidence?: number;
        reasoning?: string;
        metadata?: Record<string, unknown>;
      }>;
      documentsFound: Array<{
        documentUrl: string;
        documentTitle?: string;
        foundVia: string;
        decisionIndex: number;
      }>;
      performanceMetrics: {
        totalDuration?: number;
        llmCalls?: number;
        llmLatency?: number;
        cacheHits?: number;
        cacheMisses?: number;
      };
      createdAt: Date;
      updatedAt: Date;
    };
    explanation: string;
    summary?: {
      strategy: string;
      documentsFound: number;
      decisionsMade: number;
      duration?: number;
      llmCalls?: number;
    };
  }> {
    return await this.request(`/ai-crawling/traces/${sessionId}`);
  }

  /**
   * List AI crawling traces (admin/developer only)
   */
  async listAICrawlingTraces(filters?: {
    baseUrl?: string;
    query?: string;
    strategy?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    skip?: number;
  }): Promise<{
    traces: Array<{
      _id?: string;
      sessionId: string;
      baseUrl: string;
      query: string;
      strategy: 'site_search' | 'ai_navigation' | 'traditional_crawl' | 'hybrid';
      decisions: Array<{
        decisionType: string;
        timestamp: Date;
        confidence?: number;
        reasoning?: string;
        metadata?: Record<string, unknown>;
      }>;
      documentsFound: Array<{
        documentUrl: string;
        documentTitle?: string;
        foundVia: string;
        decisionIndex: number;
      }>;
      performanceMetrics: {
        totalDuration?: number;
        llmCalls?: number;
        llmLatency?: number;
        cacheHits?: number;
        cacheMisses?: number;
      };
      createdAt: Date;
      updatedAt: Date;
    }>;
    total: number;
    limit: number;
    skip: number;
  }> {
    const params = new URLSearchParams();
    if (filters?.baseUrl) params.append('baseUrl', filters.baseUrl);
    if (filters?.query) params.append('query', filters.query);
    if (filters?.strategy) params.append('strategy', filters.strategy);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.skip) params.append('skip', String(filters.skip));

    const queryString = params.toString();
    return await this.request(`/ai-crawling/traces${queryString ? `?${queryString}` : ''}`);
  }

  /**
   * Export AI crawling traces as a file
   */
  async exportAICrawlingTraces(filters?: {
    baseUrl?: string;
    query?: string;
    strategy?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Blob> {
    return this.request<Blob>('/ai-crawling/traces/export', {
      method: 'POST',
      responseType: 'blob',
      body: JSON.stringify({ filters }),
    });
  }
}

