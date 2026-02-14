import { BaseApiService } from './BaseApiService';
import type { PaginationMetadata } from './types';

/**
 * Common Crawl API service
 */
export class CommonCrawlApiService extends BaseApiService {
  async queryCommonCrawl(params: {
    query: string;
    domainFilter?: string;
    crawlId?: string;
    limit?: number;
  }) {
    return this.request<{
      results: Array<{
        urlkey: string;
        timestamp: string;
        url: string;
        mime: string;
        status: string;
        digest: string;
        length: string;
        offset: string;
        filename: string;
      }>;
      total: number;
      crawlId: string;
      query: string;
    }>('/commoncrawl/query', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async getCommonCrawlCrawls() {
    return this.request<Array<{ id: string; name: string; date: string }>>('/commoncrawl/crawls');
  }

  async validateCrawlId(crawlId: string) {
    return this.request<{
      isValid: boolean;
      suggestions?: string[];
    }>(`/commoncrawl/validate/${encodeURIComponent(crawlId)}`);
  }

  // Common Crawl Query Management
  async saveCommonCrawlQuery(params: {
    query: string;
    domainFilter?: string;
    crawlId: string;
    status?: 'pending' | 'approved' | 'rejected';
  }) {
    return this.request<{
      _id: string;
      query: string;
      domainFilter: string;
      crawlId: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>('/commoncrawl/queries', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async getCommonCrawlQueries(params?: {
    status?: 'pending' | 'approved' | 'rejected';
    page?: number;
    limit?: number;
    skip?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.skip) queryParams.append('skip', params.skip.toString());

    const url = `/commoncrawl/queries${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.request<{
      data: Array<{
        _id: string;
        query: string;
        domainFilter: string;
        crawlId: string;
        status: string;
        resultCount: number;
        createdAt: string;
        updatedAt: string;
      }>;
      pagination?: PaginationMetadata;
    } | Array<{
      _id: string;
      query: string;
      domainFilter: string;
      crawlId: string;
      status: string;
      resultCount: number;
      createdAt: string;
      updatedAt: string;
    }>>(url);
    // Handle paginated response format
    return Array.isArray(response) ? response : response.data;
  }

  async getCommonCrawlQuery(queryId: string) {
    return this.request<{
      _id: string;
      query: string;
      domainFilter: string;
      crawlId: string;
      status: string;
      resultCount: number;
      createdAt: string;
      updatedAt: string;
    }>(`/commoncrawl/queries/${queryId}`);
  }

  async saveCommonCrawlResults(
    queryId: string,
    results: Array<{
      urlkey: string;
      timestamp: string;
      url: string;
      mime: string;
      status: string;
      digest: string;
      length: string;
      offset: string;
      filename: string;
    }>
  ) {
    return this.request<{
      message: string;
      saved: number;
      skipped: number;
    }>(`/commoncrawl/queries/${queryId}/results`, {
      method: 'POST',
      body: JSON.stringify({ results }),
    });
  }

  async getCommonCrawlResults(queryId: string, params?: {
    approved?: boolean;
    limit?: number;
    skip?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.approved !== undefined)
      queryParams.append('approved', params.approved.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.skip) queryParams.append('skip', params.skip.toString());

    const url = `/commoncrawl/queries/${queryId}/results${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.request<
      Array<{
        _id: string;
        queryId: string;
        urlkey: string;
        timestamp: string;
        url: string;
        mime: string;
        status: string;
        digest: string;
        length: string;
        offset: string;
        filename: string;
        approved: boolean;
        createdAt: string;
      }>
    >(url);
  }

  async approveCommonCrawlResult(resultId: string) {
    return this.request<{
      _id: string;
      approved: boolean;
    }>(`/commoncrawl/results/${resultId}/approve`, {
      method: 'POST',
    });
  }

  async approveCommonCrawlResults(resultIds: string[]) {
    return this.request<{
      message: string;
      approved: number;
    }>('/commoncrawl/results/approve-many', {
      method: 'POST',
      body: JSON.stringify({ resultIds }),
    });
  }

  async deleteCommonCrawlQuery(queryId: string) {
    return this.request<{
      message: string;
    }>(`/commoncrawl/queries/${queryId}`, {
      method: 'DELETE',
    });
  }
}

