/**
 * Document Tag API Service
 * 
 * Provides methods for managing document tags.
 */
import { getApiBaseUrl } from '../../utils/apiUrl';
import { api } from '../api';

export interface DocumentTag {
  _id?: string;
  id: string;
  label: string;
  category?: 'theme' | 'documentType' | 'jurisdiction' | 'custom';
  color?: string;
  description?: string;
  userId?: string;
  usageCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentTagCreateInput {
  id: string;
  label: string;
  category?: 'theme' | 'documentType' | 'jurisdiction' | 'custom';
  color?: string;
  description?: string;
}

export interface DocumentTagUpdateInput {
  label?: string;
  color?: string;
  description?: string;
}

class DocumentTagApiService {
  private baseUrl = `${getApiBaseUrl()}/document-tags`;

  /**
   * Get all tags, optionally filtered by category or userId
   */
  async getTags(params?: { category?: string; userId?: string }): Promise<DocumentTag[]> {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.append('category', params.category);
    if (params?.userId) queryParams.append('userId', params.userId);

    const url = queryParams.toString() ? `${this.baseUrl}?${queryParams}` : this.baseUrl;
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tags: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get a specific tag by ID
   */
  async getTag(tagId: string): Promise<DocumentTag> {
    const response = await fetch(`${this.baseUrl}/${tagId}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tag: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create a new tag
   */
  async createTag(tagData: DocumentTagCreateInput): Promise<DocumentTag> {
    const csrfToken = await api.getCsrfToken();
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify(tagData),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to create tag: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Update a tag
   */
  async updateTag(tagId: string, updates: DocumentTagUpdateInput): Promise<DocumentTag> {
    const csrfToken = await api.getCsrfToken();
    const response = await fetch(`${this.baseUrl}/${tagId}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to update tag: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Delete a tag
   */
  async deleteTag(tagId: string): Promise<void> {
    const csrfToken = await api.getCsrfToken();
    const response = await fetch(`${this.baseUrl}/${tagId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': csrfToken,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to delete tag: ${response.statusText}`);
    }
  }

  /**
   * Add a tag to a document
   */
  async addTagToDocument(tagId: string, documentId: string): Promise<void> {
    const csrfToken = await api.getCsrfToken();
    const response = await fetch(`${this.baseUrl}/${tagId}/documents/${documentId}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': csrfToken,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to add tag to document: ${response.statusText}`);
    }
  }

  /**
   * Remove a tag from a document
   */
  async removeTagFromDocument(tagId: string, documentId: string): Promise<void> {
    const csrfToken = await api.getCsrfToken();
    const response = await fetch(`${this.baseUrl}/${tagId}/documents/${documentId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': csrfToken,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to remove tag from document: ${response.statusText}`);
    }
  }
}

export const documentTagApiService = new DocumentTagApiService();
