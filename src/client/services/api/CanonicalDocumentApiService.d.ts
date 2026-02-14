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
    [key: string]: unknown;
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
    filename: string;
    format: 'PDF' | 'Web' | 'XML' | 'DOCX' | 'JSON' | 'GeoJSON' | 'Shapefile' | 'ZIP' | 'Other';
    sizeBytes?: number;
    purpose?: string;
    mimeType?: string;
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
export declare class CanonicalDocumentApiService extends BaseApiService {
    /**
     * Get all canonical documents with pagination and optional filters
     */
    getCanonicalDocuments(params?: PaginationParams & DocumentFilterParams): Promise<PaginatedResponse<CanonicalDocument>>;
    /**
     * Get canonical document by ID
     */
    getCanonicalDocumentById(id: string): Promise<CanonicalDocument>;
    /**
     * Get canonical documents by query ID
     */
    getCanonicalDocumentsByQuery(queryId: string, params?: PaginationParams): Promise<PaginatedResponse<CanonicalDocument>>;
    /**
     * Get canonical documents by workflow run ID
     */
    getCanonicalDocumentsByWorkflowRun(runId: string, params?: PaginationParams): Promise<PaginatedResponse<CanonicalDocument>>;
    /**
     * Get canonical documents by website URL
     */
    getCanonicalDocumentsByWebsite(url: string, params?: PaginationParams): Promise<PaginatedResponse<CanonicalDocument>>;
    /**
     * Create a new canonical document
     *
     * Note: Most documents are created via workflow services.
     * This endpoint is provided for direct creation if needed.
     */
    createCanonicalDocument(data: CanonicalDocumentDraft): Promise<CanonicalDocument>;
    /**
     * Extract content from a URL
     *
     * @param url - The URL to extract content from
     * @returns Extracted text, optional title, and metadata
     */
    extractContentFromUrl(url: string): Promise<{
        text: string;
        title?: string;
        metadata: Record<string, unknown>;
    }>;
    /**
     * Update a canonical document
     */
    updateCanonicalDocument(id: string, data: Partial<CanonicalDocumentDraft>): Promise<CanonicalDocument>;
    /**
     * Update document acceptance status
     */
    updateCanonicalDocumentAcceptance(id: string, accepted: boolean | null): Promise<CanonicalDocument>;
    /**
     * Delete a canonical document
     */
    deleteCanonicalDocument(id: string): Promise<void>;
    /**
     * Get canonical document with extensions loaded
     *
     * @param id - Document ID
     * @param extensionTypes - Optional array of extension types to load (geo, legal, web)
     *                         If not provided, loads all available extensions
     */
    getCanonicalDocumentWithExtensions(id: string, extensionTypes?: ExtensionType[]): Promise<CanonicalDocumentWithExtensions>;
    /**
     * Batch load canonical documents with extensions
     *
     * @param documentIds - Array of document IDs to load
     * @param extensionTypes - Optional array of extension types to load (geo, legal, web)
     *                         If not provided, loads all available extensions
     */
    getCanonicalDocumentsWithExtensions(documentIds: string[], extensionTypes?: ExtensionType[]): Promise<Array<CanonicalDocumentWithExtensions | null>>;
    /**
     * Get all artifact references for a document
     */
    getArtifactRefs(id: string): Promise<ArtifactRef[]>;
    /**
     * Get artifact reference by MIME type
     */
    getArtifactRefByMimeType(id: string, mimeType: string): Promise<ArtifactRef>;
    /**
     * Get artifact content as binary (Blob)
     *
     * @param id - Document ID
     * @param mimeType - Optional MIME type filter
     */
    getArtifactContent(id: string, mimeType?: string): Promise<Blob>;
    /**
     * Get artifact content as text string
     *
     * @param id - Document ID
     * @param mimeType - Optional MIME type filter
     * @param encoding - Text encoding (default: utf8)
     */
    getArtifactAsString(id: string, mimeType?: string, encoding?: 'utf8' | 'utf16le' | 'latin1' | 'ascii' | 'base64' | 'hex'): Promise<string>;
    /**
     * List all files in a document bundle
     *
     * @param id - Document ID
     * @param bundleMimeType - Optional MIME type of the bundle (default: application/zip)
     */
    listBundleFiles(id: string, bundleMimeType?: string): Promise<BundleFileEntry[]>;
    /**
     * Get bundle files filtered by format
     *
     * @param id - Document ID
     * @param format - Document format to filter by
     * @param bundleMimeType - Optional MIME type of the bundle (default: application/zip)
     */
    getBundleFilesByFormat(id: string, format: BundleFileEntry['format'], bundleMimeType?: string): Promise<BundleFileEntry[]>;
    /**
     * Extract file from bundle as binary (Blob)
     *
     * @param id - Document ID
     * @param filename - Filename/path within the bundle
     * @param bundleMimeType - Optional MIME type of the bundle (default: application/zip)
     */
    extractFileFromBundle(id: string, filename: string, bundleMimeType?: string): Promise<Blob>;
    /**
     * Extract file from bundle as text string
     *
     * @param id - Document ID
     * @param filename - Filename/path within the bundle
     * @param bundleMimeType - Optional MIME type of the bundle (default: application/zip)
     * @param encoding - Text encoding (default: utf8)
     */
    extractFileFromBundleAsString(id: string, filename: string, bundleMimeType?: string, encoding?: 'utf8' | 'utf16le' | 'latin1' | 'ascii' | 'base64' | 'hex'): Promise<string>;
}
