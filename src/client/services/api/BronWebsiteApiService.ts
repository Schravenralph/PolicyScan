import { BaseApiService } from './BaseApiService';
import type { PaginationMetadata } from './types';

export interface BronWebsite {
  _id?: string;
  titel: string;
  url: string;
  label: string;
  samenvatting: string;
  'relevantie voor zoekopdracht': string;
  accepted: boolean | null;
  subjects?: string[];
  themes?: string[];
  website_types?: string[];
  queryId?: string;
}

/**
 * BronWebsite API service
 */
export class BronWebsiteApiService extends BaseApiService {
  async createBronWebsite(data: BronWebsite) {
    return this.request<BronWebsite>('/bronwebsites', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createBronWebsites(data: BronWebsite[]) {
    return this.request<BronWebsite[]>('/bronwebsites/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getBronWebsitesByQuery(queryId: string, params?: { page?: number; limit?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    const url = `/bronwebsites/query/${queryId}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.request<{ data: BronWebsite[]; pagination?: PaginationMetadata } | BronWebsite[]>(url);
    // Handle paginated response format
    return Array.isArray(response) ? response : response.data;
  }

  async getAllBronWebsites(params?: { page?: number; limit?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    const url = `/bronwebsites${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.request<{ data: BronWebsite[]; pagination?: PaginationMetadata } | BronWebsite[]>(url);
    // Handle paginated response format
    return Array.isArray(response) ? response : response.data;
  }

  async updateBronWebsiteAcceptance(id: string, accepted: boolean | null) {
    return this.request<BronWebsite>(`/bronwebsites/${id}/acceptance`, {
      method: 'PATCH',
      body: JSON.stringify({ accepted }),
    });
  }
}

