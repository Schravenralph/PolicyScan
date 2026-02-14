/**
 * TypeScript Type Helpers for Canonical Documents
 *
 * Provides type-safe helpers and utilities for working with CanonicalDocument.
 * These types help ensure type safety during migration and beyond.
 *
 * @see CanonicalDocument interface in CanonicalDocumentApiService
 */
import type { CanonicalDocument } from '../services/api';
/**
 * Document acceptance status type
 */
export type DocumentAcceptance = boolean | null;
/**
 * Document review status type
 */
export type DocumentStatus = 'approved' | 'rejected' | 'pending';
/**
 * Document filter type for filtering by acceptance status
 */
export type DocumentFilter = 'all' | 'approved' | 'rejected' | 'pending';
/**
 * Type guard to check if a document is approved
 */
export declare function isDocumentApproved(doc: CanonicalDocument): boolean;
/**
 * Type guard to check if a document is rejected
 */
export declare function isDocumentRejected(doc: CanonicalDocument): boolean;
/**
 * Type guard to check if a document is pending review
 */
export declare function isDocumentPending(doc: CanonicalDocument): boolean;
/**
 * Type for document display properties
 * Combines canonical and display-friendly properties
 */
export interface CanonicalDocumentDisplay {
    id: string;
    title: string;
    url: string | null;
    status: DocumentStatus;
    acceptance: DocumentAcceptance;
    date: string | null;
    type: string;
    source: string;
    hasFullText: boolean;
    preview: string;
}
/**
 * Type for document list item (simplified for lists)
 */
export interface CanonicalDocumentListItem {
    id: string;
    title: string;
    url: string | null;
    status: DocumentStatus;
    date: string | null;
    type: string;
}
/**
 * Type for document card props (common component pattern)
 */
export interface CanonicalDocumentCardProps {
    document: CanonicalDocument;
    onSelect?: (document: CanonicalDocument) => void;
    onAccept?: (documentId: string) => void;
    onReject?: (documentId: string) => void;
    showActions?: boolean;
}
/**
 * Type for document filter state
 */
export interface DocumentFilterState {
    status: DocumentFilter;
    searchQuery: string;
    typeFilter?: string;
    dateFilter?: {
        from?: Date;
        to?: Date;
    };
    sourceFilter?: string[];
}
/**
 * Type for paginated document response
 */
export interface PaginatedCanonicalDocuments {
    documents: CanonicalDocument[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
/**
 * Helper type for document operations
 */
export type DocumentOperation = 'accept' | 'reject' | 'delete' | 'view' | 'export';
/**
 * Type for document operation handler
 */
export type DocumentOperationHandler = (document: CanonicalDocument, operation: DocumentOperation) => void | Promise<void>;
