import { BaseApiService } from './BaseApiService';
import type { PaginationMetadata } from './types';
import type { BronDocument } from '../../utils/transformations';
import type { BronWebsite } from './BronWebsiteApiService';

export interface QueryData {
  _id?: string; // Query ID
  overheidstype?: string; // Government type (e.g., "Gemeente", "Provincie")
  overheidsinstantie?: string; // Government instance (e.g., "Amsterdam", "Huizen")
  onderwerp: string; // Subject/topic - what user is searching for
  websiteTypes: string[]; // Types of websites to search
  websiteUrls?: string[]; // URLs of selected websites
  documentUrls?: string[]; // URLs of found documents
  status?: 'draft' | 'completed'; // Query status
  finalizedAt?: string | Date; // Finalization timestamp
  createdAt?: string | Date; // Creation timestamp
  updatedAt?: string | Date; // Last update timestamp
}

/**
 * Query API service
 */
export class QueryApiService extends BaseApiService {
  async createQuery(data: QueryData) {
    return this.request<{ _id: string } & QueryData>('/queries', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getQueries(params?: { page?: number; limit?: number; skip?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.skip) queryParams.append('skip', params.skip.toString());

    const url = `/queries${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.request<{ data: QueryData[]; pagination?: PaginationMetadata } | QueryData[]>(url);
    // Handle paginated response format
    return Array.isArray(response) ? response : response.data;
  }

  async getQuery(id: string) {
    return this.request<QueryData>(`/queries/${id}`);
  }

  async updateQuery(id: string, data: Partial<QueryData>) {
    return this.request<QueryData>(`/queries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async duplicateQuery(id: string, data?: Partial<QueryData>) {
    // Use the backend duplicate endpoint which properly handles duplication
    return this.request<QueryData & { _id: string }>(`/queries/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  async triggerScan(queryId: string) {
    return this.request<{
      success: boolean;
      documentsFound: number;
      sourcesFound: number;
      progress: {
        status: string;
        currentStep: string;
        documentsFound: number;
        sourcesFound: number;
      };
      documents: BronDocument[];
      suggestedSources: BronWebsite[];
    }>(`/queries/${queryId}/scan`, {
      method: 'POST',
    });
  }

  async getScanStatus(queryId: string) {
    return this.request<{
      status: string;
      documentsFound: number;
      sourcesFound: number;
    }>(`/queries/${queryId}/scan/status`);
  }

  async generateWebsiteSuggestions(queryId: string) {
    return this.request<{
      success: boolean;
      websites: BronWebsite[];
      metadata?: {
        aiSuggestionsCount: number;
        municipalityWebsiteIncluded: boolean;
        onlyMunicipalityWebsite: boolean;
      };
    }>(`/queries/${queryId}/suggestions`, {
      method: 'POST',
    });
  }

  async getQueryProgress(queryId: string) {
    return this.request<{
      queryId: string;
      progress: number;
      status: 'analyzing' | 'searching' | 'evaluating' | 'generating' | 'completed' | 'error';
      estimatedSecondsRemaining?: number;
      currentStep?: string;
      totalSteps?: number;
      startedAt: number;
      lastUpdated: number;
      error?: string;
    }>(`/queries/${queryId}/progress`);
  }

  async generateMockWebsiteSuggestions(queryId: string) {
    return this.request<{
      success: boolean;
      websites: BronWebsite[];
      isMock: boolean;
    }>(`/queries/${queryId}/suggestions/mock`, {
      method: 'POST',
    });
  }

  async scrapeSelectedWebsites(queryId: string, websiteIds: string[]) {
    return this.request<{
      success: boolean;
      documents: BronDocument[];
      documentsFound: number;
    }>(`/queries/${queryId}/scrape`, {
      method: 'POST',
      body: JSON.stringify({ websiteIds }),
    });
  }

  async getJurisdictions() {
    return this.request<{
      municipalities: string[];
      waterschappen: string[];
      provincies: string[];
      signature: string;
      timestamp: string;
    }>('/jurisdictions');
  }

  async finalizeQuery(queryId: string) {
    return this.request<QueryData & { _id: string; status: 'completed'; finalizedAt: string }>(`/queries/${queryId}/finalize`, {
      method: 'POST',
    });
  }

  async getCompletedQueries(params?: { page?: number; limit?: number; skip?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.skip) queryParams.append('skip', params.skip.toString());

    const url = `/queries/completed${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.request<{ data: QueryData[]; pagination?: PaginationMetadata } | QueryData[]>(url);
    // Handle paginated response format
    return Array.isArray(response) ? response : response.data;
  }
}

