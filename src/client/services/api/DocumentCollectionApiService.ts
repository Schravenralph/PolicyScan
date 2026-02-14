/**
 * Document Collection API Service
 * 
 * Provides methods for managing document collections.
 */
import { getApiBaseUrl } from '../../utils/apiUrl';
import { api } from '../api';

export interface DocumentCollection {
  _id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  documentIds: string[];
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentCollectionCreateInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}

export interface DocumentCollectionUpdateInput {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
}

class DocumentCollectionApiService {
  private baseUrl = `${getApiBaseUrl()}/document-collections`;

  /**
   * Get all collections, optionally filtered by userId
   */
  async getCollections(params?: { userId?: string }): Promise<DocumentCollection[]> {
    const queryParams = new URLSearchParams();
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
      throw new Error(`Failed to fetch collections: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get a specific collection by ID
   */
  async getCollection(collectionId: string): Promise<DocumentCollection> {
    const response = await fetch(`${this.baseUrl}/${collectionId}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch collection: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get all collections containing a specific document
   */
  async getCollectionsForDocument(documentId: string): Promise<DocumentCollection[]> {
    const response = await fetch(`${this.baseUrl}/documents/${documentId}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch collections for document: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create a new collection
   */
  async createCollection(collectionData: DocumentCollectionCreateInput): Promise<DocumentCollection> {
    const csrfToken = await api.getCsrfToken();
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify(collectionData),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to create collection: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Update a collection
   */
  async updateCollection(collectionId: string, updates: DocumentCollectionUpdateInput): Promise<DocumentCollection> {
    const csrfToken = await api.getCsrfToken();
    const response = await fetch(`${this.baseUrl}/${collectionId}`, {
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
      throw new Error(error.error || `Failed to update collection: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Delete a collection
   */
  async deleteCollection(collectionId: string): Promise<void> {
    const csrfToken = await api.getCsrfToken();
    const response = await fetch(`${this.baseUrl}/${collectionId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': csrfToken,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to delete collection: ${response.statusText}`);
    }
  }

  /**
   * Add a document to a collection
   */
  async addDocumentToCollection(collectionId: string, documentId: string): Promise<void> {
    const csrfToken = await api.getCsrfToken();
    const response = await fetch(`${this.baseUrl}/${collectionId}/documents/${documentId}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': csrfToken,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to add document to collection: ${response.statusText}`);
    }
  }

  /**
   * Remove a document from a collection
   */
  async removeDocumentFromCollection(collectionId: string, documentId: string): Promise<void> {
    const csrfToken = await api.getCsrfToken();
    const response = await fetch(`${this.baseUrl}/${collectionId}/documents/${documentId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': csrfToken,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to remove document from collection: ${response.statusText}`);
    }
  }
}

export const documentCollectionApiService = new DocumentCollectionApiService();
