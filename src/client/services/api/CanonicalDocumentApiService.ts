/**
 * Canonical Document API Service
 * 
 * Service for interacting with canonical document API endpoints.
 * Returns canonical document format directly (no transformation).
 * 
 * @see WI-412: Frontend API Service Migration
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/01-canonical-model.md
 */

import { BaseApiService } from './BaseApiService';
import type { PaginationMetadata } from './types';

/**
 * Canonical Document interface (matches server contract)
 * 
 * @see src/server/contracts/types.ts
 */
export interface CanonicalDocument {
  _id: string;
  source: 'DSO' | 'Rechtspraak' | 'Wetgeving' | 'Gemeente' | 'PDOK' | 'Web';
  sourceId: string;
  canonicalUrl?: string;
  title: string;
  publisherAuthority?: string;
  documentFamily: 'Omgevingsinstrument' | 'Juridisch' | 'Beleid' | 'Web' | 'Geo' | 'Other';
  documentType: string;
  dates: {
    publishedAt?: Date | string;
    validFrom?: Date | string;
    validTo?: Date | string;
  };
  fullText: string;
  contentFingerprint: string;
  language: string;
  artifactRefs: ArtifactRef[];
  sourceMetadata: Record<string, unknown>;
  enrichmentMetadata?: Record<string, unknown>;
  documentStructure?: 'singleton' | 'bundle';
  format?: 'PDF' | 'Web' | 'XML' | 'DOCX' | 'JSON' | 'GeoJSON' | 'Shapefile' | 'ZIP' | 'Other';
  formatComposition?: {
    formats: Array<{
      format: string;
      count: number;
      primary?: boolean;
      purpose?: string;
      filePatterns?: string[];
    }>;
  };
  versionOf?: string;
  reviewStatus?: 'pending_review' | 'approved' | 'rejected' | 'needs_revision';
  reviewMetadata?: {
    reviewedAt?: Date | string;
    reviewedBy?: string;
    reviewNotes?: string;
    previousStatus?: 'pending_review' | 'approved' | 'rejected' | 'needs_revision';
  };
  createdAt: Date | string;
  updatedAt: Date | string;
  schemaVersion: string;
  [key: string]: unknown; // Allow additional fields
}

/**
 * Canonical Document Draft interface (for create/update operations)
 */
export interface CanonicalDocumentDraft {
  source: 'DSO' | 'Rechtspraak' | 'Wetgeving' | 'Gemeente' | 'PDOK' | 'Web';
  sourceId: string;
  canonicalUrl?: string;
  title: string;
  publisherAuthority?: string;
  documentFamily: 'Omgevingsinstrument' | 'Juridisch' | 'Beleid' | 'Web' | 'Geo' | 'Other';
  documentType: string;
  dates: {
    publishedAt?: Date | string;
    validFrom?: Date | string;
    validTo?: Date | string;
  };
  fullText: string;
  contentFingerprint: string;
  language?: string;
  artifactRefs?: Array<unknown>;
  sourceMetadata: Record<string, unknown>;
  enrichmentMetadata?: Record<string, unknown>;
  documentStructure?: 'singleton' | 'bundle';
  format?: 'PDF' | 'Web' | 'XML' | 'DOCX' | 'JSON' | 'GeoJSON' | 'Shapefile' | 'ZIP' | 'Other';
  formatComposition?: unknown;
  versionOf?: string;
  reviewStatus?: 'pending_review' | 'approved' | 'rejected' | 'needs_revision';
  reviewMetadata?: {
    reviewedAt?: Date | string;
    reviewedBy?: string;
    reviewNotes?: string;
    previousStatus?: 'pending_review' | 'approved' | 'rejected' | 'needs_revision';
  };
}

/**
 * Artifact provenance information
 * 
 * Tracks where and how an artifact was acquired.
 */
export interface ArtifactProvenance {
  source: string;
  acquiredAt: Date | string;
  requestId?: string;
  url?: string;
  headers?: Record<string, string>;
  notes?: string;
}

/**
 * Artifact reference
 * 
 * Reference to a stored artifact (file) associated with a canonical document.
 */
export interface ArtifactRef {
  sha256: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date | string;
  provenance: ArtifactProvenance;
}

/**
 * Bundle file entry
 * 
 * Metadata for a single file within a document bundle (e.g., ZIP archive).
 */
export interface BundleFileEntry {
  filename: string; // Full path within bundle (e.g., 'juridische-tekst/regeling.xml')
  format: 'PDF' | 'Web' | 'XML' | 'DOCX' | 'JSON' | 'GeoJSON' | 'Shapefile' | 'ZIP' | 'Other';
  sizeBytes?: number; // File size in bytes
  purpose?: string; // Purpose: 'legal-text', 'geographic-data', 'metadata', etc.
  mimeType?: string; // MIME type if known
}

/**
 * Extension type
 * 
 * Types of extensions that can be loaded with documents.
 */
export type ExtensionType = 'geo' | 'legal' | 'web';

/**
 * Document with extensions
 * 
 * Canonical document with loaded extensions.
 */
export interface CanonicalDocumentWithExtensions extends CanonicalDocument {
  extensions: Partial<Record<ExtensionType, unknown>>;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  skip?: number;
}

/**
 * Filter parameters for document queries
 */
export interface DocumentFilterParams {
  queryId?: string;
  workflowRunId?: string;
  reviewStatus?: 'pending_review' | 'approved' | 'rejected' | 'needs_review' | Array<'pending_review' | 'approved' | 'rejected' | 'needs_review'>;
  source?: 'DSO' | 'Rechtspraak' | 'Wetgeving' | 'Gemeente' | 'PDOK' | 'Web';
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination?: PaginationMetadata;
}

/**
 * Canonical Document API Service
 * 
 * Provides methods for interacting with canonical document endpoints.
 */
export class CanonicalDocumentApiService extends BaseApiService {
  /**
   * Get all canonical documents with pagination and optional filters
   */
  async getCanonicalDocuments(
    params?: PaginationParams & DocumentFilterParams
  ): Promise<PaginatedResponse<CanonicalDocument>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.skip) queryParams.append('skip', params.skip.toString());
    if (params?.queryId) queryParams.append('queryId', params.queryId);
    if (params?.workflowRunId) queryParams.append('workflowRunId', params.workflowRunId);
    if (params?.reviewStatus) {
      if (Array.isArray(params.reviewStatus)) {
        params.reviewStatus.forEach(status => queryParams.append('reviewStatus', status));
      } else {
        queryParams.append('reviewStatus', params.reviewStatus);
      }
    }
    if (params?.source) {
      queryParams.append('source', params.source);
    }
    
    const url = `/canonical-documents${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.request<PaginatedResponse<CanonicalDocument>>(url);
  }

  /**
   * Get canonical document by ID
   */
  async getCanonicalDocumentById(id: string): Promise<CanonicalDocument> {
    return this.request<CanonicalDocument>(`/canonical-documents/${id}`);
  }

  /**
   * Get canonical documents by query ID
   */
  async getCanonicalDocumentsByQuery(
    queryId: string,
    params?: PaginationParams
  ): Promise<PaginatedResponse<CanonicalDocument>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.skip) queryParams.append('skip', params.skip.toString());
    
    const url = `/canonical-documents/query/${queryId}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.request<PaginatedResponse<CanonicalDocument>>(url);
  }

  /**
   * Get canonical documents by workflow run ID
   */
  async getCanonicalDocumentsByWorkflowRun(
    runId: string,
    params?: PaginationParams
  ): Promise<PaginatedResponse<CanonicalDocument>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.skip) queryParams.append('skip', params.skip.toString());
    
    const url = `/canonical-documents/workflow-run/${runId}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.request<PaginatedResponse<CanonicalDocument>>(url);
  }

  /**
   * Get canonical documents by website URL
   */
  async getCanonicalDocumentsByWebsite(
    url: string,
    params?: PaginationParams
  ): Promise<PaginatedResponse<CanonicalDocument>> {
    const queryParams = new URLSearchParams();
    queryParams.append('url', url);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.skip) queryParams.append('skip', params.skip.toString());
    
    const endpoint = `/canonical-documents/website?${queryParams.toString()}`;
    return this.request<PaginatedResponse<CanonicalDocument>>(endpoint);
  }

  /**
   * Create a new canonical document
   * 
   * Note: Most documents are created via workflow services.
   * This endpoint is provided for direct creation if needed.
   */
  async createCanonicalDocument(data: CanonicalDocumentDraft): Promise<CanonicalDocument> {
    return this.request<CanonicalDocument>('/canonical-documents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Extract content from a URL
   * 
   * @param url - The URL to extract content from
   * @returns Extracted text, optional title, and metadata
   */
  async extractContentFromUrl(url: string): Promise<{ text: string; title?: string; metadata: Record<string, unknown> }> {
    return this.request<{ text: string; title?: string; metadata: Record<string, unknown> }>('/canonical-documents/extract-url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  /**
   * Update a canonical document
   */
  async updateCanonicalDocument(
    id: string,
    data: Partial<CanonicalDocumentDraft>
  ): Promise<CanonicalDocument> {
    return this.request<CanonicalDocument>(`/canonical-documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update document acceptance status
   */
  async updateCanonicalDocumentAcceptance(
    id: string,
    accepted: boolean | null
  ): Promise<CanonicalDocument> {
    return this.request<CanonicalDocument>(`/canonical-documents/${id}/acceptance`, {
      method: 'PATCH',
      body: JSON.stringify({ accepted }),
    });
  }

  /**
   * Delete a canonical document
   */
  async deleteCanonicalDocument(id: string): Promise<void> {
    return this.delete<void>(`/canonical-documents/${id}`);
  }

  /**
   * Get canonical document with extensions loaded
   * 
   * @param id - Document ID
   * @param extensionTypes - Optional array of extension types to load (geo, legal, web)
   *                         If not provided, loads all available extensions
   */
  async getCanonicalDocumentWithExtensions(
    id: string,
    extensionTypes?: ExtensionType[]
  ): Promise<CanonicalDocumentWithExtensions> {
    const queryParams = new URLSearchParams();
    if (extensionTypes && extensionTypes.length > 0) {
      queryParams.append('extensionTypes', extensionTypes.join(','));
    }
    
    const url = `/canonical-documents/${id}/with-extensions${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.request<CanonicalDocumentWithExtensions>(url);
  }

  /**
   * Batch load canonical documents with extensions
   * 
   * @param documentIds - Array of document IDs to load
   * @param extensionTypes - Optional array of extension types to load (geo, legal, web)
   *                         If not provided, loads all available extensions
   */
  async getCanonicalDocumentsWithExtensions(
    documentIds: string[],
    extensionTypes?: ExtensionType[]
  ): Promise<Array<CanonicalDocumentWithExtensions | null>> {
    return this.request<Array<CanonicalDocumentWithExtensions | null>>(
      '/canonical-documents/with-extensions',
      {
        method: 'POST',
        body: JSON.stringify({
          documentIds,
          extensionTypes,
        }),
      }
    );
  }

  /**
   * Get all artifact references for a document
   */
  async getArtifactRefs(id: string): Promise<ArtifactRef[]> {
    return this.request<ArtifactRef[]>(`/canonical-documents/${id}/artifacts`);
  }

  /**
   * Get artifact reference by MIME type
   */
  async getArtifactRefByMimeType(
    id: string,
    mimeType: string
  ): Promise<ArtifactRef> {
    return this.request<ArtifactRef>(`/canonical-documents/${id}/artifacts/${encodeURIComponent(mimeType)}`);
  }

  /**
   * Get artifact content as binary (Blob)
   * 
   * @param id - Document ID
   * @param mimeType - Optional MIME type filter
   */
  async getArtifactContent(
    id: string,
    mimeType?: string
  ): Promise<Blob> {
    const queryParams = new URLSearchParams();
    if (mimeType) {
      queryParams.append('mimeType', mimeType);
    }
    
    const url = `/canonical-documents/${id}/artifact-content${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.request<Blob>(url, { responseType: 'blob' });
  }

  /**
   * Get artifact content as text string
   * 
   * @param id - Document ID
   * @param mimeType - Optional MIME type filter
   * @param encoding - Text encoding (default: utf8)
   */
  async getArtifactAsString(
    id: string,
    mimeType?: string,
    encoding: 'utf8' | 'utf16le' | 'latin1' | 'ascii' | 'base64' | 'hex' = 'utf8'
  ): Promise<string> {
    const queryParams = new URLSearchParams();
    if (mimeType) {
      queryParams.append('mimeType', mimeType);
    }
    queryParams.append('encoding', encoding);
    
    const url = `/canonical-documents/${id}/artifact-content/text${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.request<string>(url);
  }

  /**
   * List all files in a document bundle
   * 
   * @param id - Document ID
   * @param bundleMimeType - Optional MIME type of the bundle (default: application/zip)
   */
  async listBundleFiles(
    id: string,
    bundleMimeType?: string
  ): Promise<BundleFileEntry[]> {
    const queryParams = new URLSearchParams();
    if (bundleMimeType) {
      queryParams.append('bundleMimeType', bundleMimeType);
    }
    
    const url = `/canonical-documents/${id}/bundle/files${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.request<BundleFileEntry[]>(url);
  }

  /**
   * Get bundle files filtered by format
   * 
   * @param id - Document ID
   * @param format - Document format to filter by
   * @param bundleMimeType - Optional MIME type of the bundle (default: application/zip)
   */
  async getBundleFilesByFormat(
    id: string,
    format: BundleFileEntry['format'],
    bundleMimeType?: string
  ): Promise<BundleFileEntry[]> {
    const queryParams = new URLSearchParams();
    if (bundleMimeType) {
      queryParams.append('bundleMimeType', bundleMimeType);
    }
    
    const url = `/canonical-documents/${id}/bundle/files/${format}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.request<BundleFileEntry[]>(url);
  }

  /**
   * Extract file from bundle as binary (Blob)
   * 
   * @param id - Document ID
   * @param filename - Filename/path within the bundle
   * @param bundleMimeType - Optional MIME type of the bundle (default: application/zip)
   */
  async extractFileFromBundle(
    id: string,
    filename: string,
    bundleMimeType?: string
  ): Promise<Blob> {
    const queryParams = new URLSearchParams();
    queryParams.append('filename', filename);
    if (bundleMimeType) {
      queryParams.append('bundleMimeType', bundleMimeType);
    }
    
    const url = `/canonical-documents/${id}/bundle/file-content?${queryParams.toString()}`;
    return this.request<Blob>(url, { responseType: 'blob' });
  }

  /**
   * Extract file from bundle as text string
   * 
   * @param id - Document ID
   * @param filename - Filename/path within the bundle
   * @param bundleMimeType - Optional MIME type of the bundle (default: application/zip)
   * @param encoding - Text encoding (default: utf8)
   */
  async extractFileFromBundleAsString(
    id: string,
    filename: string,
    bundleMimeType?: string,
    encoding: 'utf8' | 'utf16le' | 'latin1' | 'ascii' | 'base64' | 'hex' = 'utf8'
  ): Promise<string> {
    const queryParams = new URLSearchParams();
    queryParams.append('filename', filename);
    if (bundleMimeType) {
      queryParams.append('bundleMimeType', bundleMimeType);
    }
    queryParams.append('encoding', encoding);
    
    const url = `/canonical-documents/${id}/bundle/file-content/text?${queryParams.toString()}`;
    return this.request<string>(url);
  }
}

