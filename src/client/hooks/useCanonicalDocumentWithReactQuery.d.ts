/**
 * React Query hooks for canonical documents
 *
 * These hooks use the canonical document API service directly.
 */
/**
 * React Query hook for fetching canonical documents by query ID
 *
 * @param queryId - The query ID to fetch documents for
 * @param options - Optional pagination and query options
 * @example
 * ```tsx
 * const { data: documents, isLoading } = useCanonicalDocumentsByQuery('query-123', {
 *   page: 1,
 *   limit: 20,
 *   refetchInterval: 3000, // Poll every 3 seconds
 * });
 * ```
 */
export declare function useCanonicalDocumentsByQuery(queryId: string | null, options?: {
    page?: number;
    limit?: number;
    enabled?: boolean;
    refetchInterval?: number | false;
}): import("@tanstack/react-query").UseQueryResult<import("../services/api").CanonicalDocument[], Error>;
/**
 * React Query hook for fetching canonical documents by workflow run ID
 *
 * @param runId - The workflow run ID to fetch documents for
 * @param options - Optional pagination and query options
 */
export declare function useCanonicalDocumentsByWorkflowRun(runId: string | null, options?: {
    page?: number;
    limit?: number;
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<import("../services/api").CanonicalDocument[], Error>;
/**
 * React Query hook for updating canonical document acceptance status
 *
 * @example
 * ```tsx
 * const updateAcceptance = useUpdateCanonicalDocumentAcceptance();
 *
 * const handleAccept = async (documentId: string) => {
 *   await updateAcceptance.mutateAsync({
 *     documentId,
 *     accepted: true,
 *   });
 * };
 * ```
 */
export declare function useUpdateCanonicalDocumentAcceptance(): import("@tanstack/react-query").UseMutationResult<import("../services/api").CanonicalDocument, Error, {
    documentId: string;
    accepted: boolean | null;
}, unknown>;
/**
 * React Query hook for fetching a single canonical document by ID
 *
 * @param documentId - The document ID to fetch
 * @param options - Optional query options
 */
export declare function useCanonicalDocument(documentId: string | null, options?: {
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<import("../services/api").CanonicalDocument | null, Error>;
/**
 * React Query hook for fetching a canonical document with extensions loaded
 *
 * @param documentId - The document ID to fetch
 * @param extensionTypes - Optional array of extension types to load (geo, legal, web)
 *                         If not provided, loads all available extensions
 * @param options - Optional query options
 * @example
 * ```tsx
 * const { data: document, isLoading } = useCanonicalDocumentWithExtensions('doc-123', ['geo', 'legal']);
 * ```
 */
export declare function useCanonicalDocumentWithExtensions(documentId: string | null, extensionTypes?: Array<'geo' | 'legal' | 'web'>, options?: {
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<import("../services/api").CanonicalDocumentWithExtensions | null, Error>;
/**
 * React Query hook for batch loading canonical documents with extensions
 *
 * @param documentIds - Array of document IDs to load
 * @param extensionTypes - Optional array of extension types to load (geo, legal, web)
 *                         If not provided, loads all available extensions
 * @param options - Optional query options
 * @example
 * ```tsx
 * const { data: documents, isLoading } = useCanonicalDocumentsWithExtensions(
 *   ['doc-1', 'doc-2'],
 *   ['geo', 'legal']
 * );
 * ```
 */
export declare function useCanonicalDocumentsWithExtensions(documentIds: string[], extensionTypes?: Array<'geo' | 'legal' | 'web'>, options?: {
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<(import("../services/api").CanonicalDocumentWithExtensions | null)[], Error>;
/**
 * React Query hook for fetching artifact references for a document
 *
 * @param documentId - The document ID
 * @param options - Optional query options
 * @example
 * ```tsx
 * const { data: artifacts, isLoading } = useArtifactRefs('doc-123');
 * ```
 */
export declare function useArtifactRefs(documentId: string | null, options?: {
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<import("../services/api").ArtifactRef[], Error>;
/**
 * React Query hook for fetching an artifact reference by MIME type
 *
 * @param documentId - The document ID
 * @param mimeType - The MIME type to filter by
 * @param options - Optional query options
 * @example
 * ```tsx
 * const { data: artifact, isLoading } = useArtifactRefByMimeType('doc-123', 'application/pdf');
 * ```
 */
export declare function useArtifactRefByMimeType(documentId: string | null, mimeType: string | null, options?: {
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<import("../services/api").ArtifactRef | null, Error>;
/**
 * React Query hook for fetching artifact content as binary Blob
 *
 * @param documentId - The document ID
 * @param mimeType - Optional MIME type filter
 * @param options - Optional query options
 * @example
 * ```tsx
 * const { data: blob, isLoading } = useArtifactContent('doc-123', 'application/pdf');
 * ```
 */
export declare function useArtifactContent(documentId: string | null, mimeType?: string | null, options?: {
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<Blob | null, Error>;
/**
 * React Query hook for fetching artifact content as text string
 *
 * @param documentId - The document ID
 * @param mimeType - Optional MIME type filter
 * @param encoding - Text encoding (default: utf8)
 * @param options - Optional query options
 * @example
 * ```tsx
 * const { data: text, isLoading } = useArtifactAsString('doc-123', 'application/xml', 'utf8');
 * ```
 */
export declare function useArtifactAsString(documentId: string | null, mimeType?: string | null, encoding?: 'utf8' | 'utf16le' | 'latin1' | 'ascii' | 'base64' | 'hex', options?: {
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<string | null, Error>;
/**
 * React Query hook for listing files in a document bundle
 *
 * @param documentId - The document ID
 * @param bundleMimeType - Optional MIME type of the bundle (default: application/zip)
 * @param options - Optional query options
 * @example
 * ```tsx
 * const { data: files, isLoading } = useBundleFiles('doc-123');
 * ```
 */
export declare function useBundleFiles(documentId: string | null, bundleMimeType?: string | null, options?: {
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<import("../services/api").BundleFileEntry[], Error>;
/**
 * React Query hook for fetching bundle files filtered by format
 *
 * @param documentId - The document ID
 * @param format - Document format to filter by
 * @param bundleMimeType - Optional MIME type of the bundle (default: application/zip)
 * @param options - Optional query options
 * @example
 * ```tsx
 * const { data: xmlFiles, isLoading } = useBundleFilesByFormat('doc-123', 'XML');
 * ```
 */
export declare function useBundleFilesByFormat(documentId: string | null, format: 'PDF' | 'Web' | 'XML' | 'DOCX' | 'JSON' | 'GeoJSON' | 'Shapefile' | 'ZIP' | 'Other' | null, bundleMimeType?: string | null, options?: {
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<import("../services/api").BundleFileEntry[], Error>;
/**
 * React Query hook for extracting a file from bundle as binary Blob
 *
 * @param documentId - The document ID
 * @param filename - Filename/path within the bundle
 * @param bundleMimeType - Optional MIME type of the bundle (default: application/zip)
 * @param options - Optional query options
 * @example
 * ```tsx
 * const { data: blob, isLoading } = useBundleFileContent('doc-123', 'juridische-tekst/regeling.xml');
 * ```
 */
export declare function useBundleFileContent(documentId: string | null, filename: string | null, bundleMimeType?: string | null, options?: {
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<Blob | null, Error>;
/**
 * React Query hook for extracting a file from bundle as text string
 *
 * @param documentId - The document ID
 * @param filename - Filename/path within the bundle
 * @param bundleMimeType - Optional MIME type of the bundle (default: application/zip)
 * @param encoding - Text encoding (default: utf8)
 * @param options - Optional query options
 * @example
 * ```tsx
 * const { data: text, isLoading } = useBundleFileContentAsString('doc-123', 'juridische-tekst/regeling.xml', undefined, 'utf8');
 * ```
 */
export declare function useBundleFileContentAsString(documentId: string | null, filename: string | null, bundleMimeType?: string | null, encoding?: 'utf8' | 'utf16le' | 'latin1' | 'ascii' | 'base64' | 'hex', options?: {
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<string | null, Error>;
