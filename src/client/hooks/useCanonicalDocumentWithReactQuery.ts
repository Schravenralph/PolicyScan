/**
 * React Query hooks for canonical documents
 * 
 * These hooks use the canonical document API service directly.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

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
export function useCanonicalDocumentsByQuery(
  queryId: string | null,
  options?: {
    page?: number;
    limit?: number;
    enabled?: boolean;
    refetchInterval?: number | false;
  }
) {
  return useQuery({
    queryKey: ['canonical-documents', 'query', queryId, options?.page, options?.limit],
    queryFn: async () => {
      if (!queryId) return [];
      const response = await api.canonicalDocument.getCanonicalDocumentsByQuery(queryId, {
        page: options?.page,
        limit: options?.limit,
      });
      return response.data || [];
    },
    enabled: !!queryId && (options?.enabled !== false),
    staleTime: 2 * 60 * 1000, // 2 minutes - documents may change
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * React Query hook for fetching canonical documents by workflow run ID
 * 
 * @param runId - The workflow run ID to fetch documents for
 * @param options - Optional pagination and query options
 */
export function useCanonicalDocumentsByWorkflowRun(
  runId: string | null,
  options?: {
    page?: number;
    limit?: number;
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['canonical-documents', 'workflow-run', runId, options?.page, options?.limit],
    queryFn: async () => {
      if (!runId) return [];
      const response = await api.canonicalDocument.getCanonicalDocumentsByWorkflowRun(runId, {
        page: options?.page,
        limit: options?.limit,
      });
      return response.data || [];
    },
    enabled: !!runId && (options?.enabled !== false),
    staleTime: 2 * 60 * 1000,
  });
}

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
export function useUpdateCanonicalDocumentAcceptance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      documentId: string;
      accepted: boolean | null;
    }) => {
      return await api.canonicalDocument.updateCanonicalDocumentAcceptance(
        params.documentId,
        params.accepted
      );
    },
    onSuccess: (_updatedDocument) => {
      // Invalidate canonical documents queries
      queryClient.invalidateQueries({ queryKey: ['canonical-documents'] });
    },
  });
}

/**
 * React Query hook for fetching a single canonical document by ID
 * 
 * @param documentId - The document ID to fetch
 * @param options - Optional query options
 */
export function useCanonicalDocument(
  documentId: string | null,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['canonical-documents', documentId],
    queryFn: async () => {
      if (!documentId) return null;
      return await api.canonicalDocument.getCanonicalDocumentById(documentId);
    },
    enabled: !!documentId && (options?.enabled !== false),
    staleTime: 5 * 60 * 1000, // 5 minutes - individual documents change less frequently
  });
}

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
export function useCanonicalDocumentWithExtensions(
  documentId: string | null,
  extensionTypes?: Array<'geo' | 'legal' | 'web'>,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['canonical-documents', documentId, 'with-extensions', extensionTypes],
    queryFn: async () => {
      if (!documentId) return null;
      return await api.canonicalDocument.getCanonicalDocumentWithExtensions(documentId, extensionTypes);
    },
    enabled: !!documentId && (options?.enabled !== false),
    staleTime: 5 * 60 * 1000, // 5 minutes - extensions change less frequently
  });
}

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
export function useCanonicalDocumentsWithExtensions(
  documentIds: string[],
  extensionTypes?: Array<'geo' | 'legal' | 'web'>,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['canonical-documents', 'batch-with-extensions', documentIds, extensionTypes],
    queryFn: async () => {
      if (!documentIds || documentIds.length === 0) return [];
      return await api.canonicalDocument.getCanonicalDocumentsWithExtensions(documentIds, extensionTypes);
    },
    enabled: (documentIds?.length ?? 0) > 0 && (options?.enabled !== false),
    staleTime: 5 * 60 * 1000, // 5 minutes - extensions change less frequently
  });
}

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
export function useArtifactRefs(
  documentId: string | null,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['canonical-documents', documentId, 'artifacts'],
    queryFn: async () => {
      if (!documentId) return [];
      return await api.canonicalDocument.getArtifactRefs(documentId);
    },
    enabled: !!documentId && (options?.enabled !== false),
    staleTime: 10 * 60 * 1000, // 10 minutes - artifacts rarely change
  });
}

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
export function useArtifactRefByMimeType(
  documentId: string | null,
  mimeType: string | null,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['canonical-documents', documentId, 'artifacts', mimeType],
    queryFn: async () => {
      if (!documentId || !mimeType) return null;
      return await api.canonicalDocument.getArtifactRefByMimeType(documentId, mimeType);
    },
    enabled: !!documentId && !!mimeType && (options?.enabled !== false),
    staleTime: 10 * 60 * 1000, // 10 minutes - artifacts rarely change
  });
}

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
export function useArtifactContent(
  documentId: string | null,
  mimeType?: string | null,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['canonical-documents', documentId, 'artifact-content', mimeType],
    queryFn: async () => {
      if (!documentId) return null;
      return await api.canonicalDocument.getArtifactContent(documentId, mimeType || undefined);
    },
    enabled: !!documentId && (options?.enabled !== false),
    staleTime: 10 * 60 * 1000, // 10 minutes - artifact content rarely changes
  });
}

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
export function useArtifactAsString(
  documentId: string | null,
  mimeType?: string | null,
  encoding: 'utf8' | 'utf16le' | 'latin1' | 'ascii' | 'base64' | 'hex' = 'utf8',
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['canonical-documents', documentId, 'artifact-content-text', mimeType, encoding],
    queryFn: async () => {
      if (!documentId) return null;
      return await api.canonicalDocument.getArtifactAsString(documentId, mimeType || undefined, encoding);
    },
    enabled: !!documentId && (options?.enabled !== false),
    staleTime: 10 * 60 * 1000, // 10 minutes - artifact content rarely changes
  });
}

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
export function useBundleFiles(
  documentId: string | null,
  bundleMimeType?: string | null,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['canonical-documents', documentId, 'bundle-files', bundleMimeType],
    queryFn: async () => {
      if (!documentId) return [];
      return await api.canonicalDocument.listBundleFiles(documentId, bundleMimeType || undefined);
    },
    enabled: !!documentId && (options?.enabled !== false),
    staleTime: 10 * 60 * 1000, // 10 minutes - bundle files rarely change
  });
}

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
export function useBundleFilesByFormat(
  documentId: string | null,
  format: 'PDF' | 'Web' | 'XML' | 'DOCX' | 'JSON' | 'GeoJSON' | 'Shapefile' | 'ZIP' | 'Other' | null,
  bundleMimeType?: string | null,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['canonical-documents', documentId, 'bundle-files-format', format, bundleMimeType],
    queryFn: async () => {
      if (!documentId || !format) return [];
      return await api.canonicalDocument.getBundleFilesByFormat(documentId, format, bundleMimeType || undefined);
    },
    enabled: !!documentId && !!format && (options?.enabled !== false),
    staleTime: 10 * 60 * 1000, // 10 minutes - bundle files rarely change
  });
}

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
export function useBundleFileContent(
  documentId: string | null,
  filename: string | null,
  bundleMimeType?: string | null,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['canonical-documents', documentId, 'bundle-file-content', filename, bundleMimeType],
    queryFn: async () => {
      if (!documentId || !filename) return null;
      return await api.canonicalDocument.extractFileFromBundle(documentId, filename, bundleMimeType || undefined);
    },
    enabled: !!documentId && !!filename && (options?.enabled !== false),
    staleTime: 10 * 60 * 1000, // 10 minutes - bundle file content rarely changes
  });
}

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
export function useBundleFileContentAsString(
  documentId: string | null,
  filename: string | null,
  bundleMimeType?: string | null,
  encoding: 'utf8' | 'utf16le' | 'latin1' | 'ascii' | 'base64' | 'hex' = 'utf8',
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['canonical-documents', documentId, 'bundle-file-content-text', filename, bundleMimeType, encoding],
    queryFn: async () => {
      if (!documentId || !filename) return null;
      return await api.canonicalDocument.extractFileFromBundleAsString(documentId, filename, bundleMimeType || undefined, encoding);
    },
    enabled: !!documentId && !!filename && (options?.enabled !== false),
    staleTime: 10 * 60 * 1000, // 10 minutes - bundle file content rarely changes
  });
}


