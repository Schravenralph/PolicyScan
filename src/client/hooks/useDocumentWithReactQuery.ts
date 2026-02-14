/**
 * React Query hooks for documents
 * 
 * These hooks use CanonicalDocumentApiService internally and transform to Bron format.
 * 
 * @deprecated For new code, use hooks from `useCanonicalDocumentWithReactQuery.ts` directly
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { CanonicalDocument } from '../services/api';
import type { BronDocument } from '../utils/transformations';
import { transformCanonicalDocumentToBron } from '../utils/transformations';
import { convertBronToCanonicalDraft } from '../utils/bronToCanonicalConverter';

/**
 * React Query hook for fetching documents by query ID
 * 
 * Uses canonical document API internally and transforms to Bron format.
 * 
 * @param queryId - The query ID to fetch documents for
 * @param options - Optional pagination and query options
 * @example
 * ```tsx
 * const { data: documents, isLoading } = useDocumentsByQuery('query-123', {
 *   page: 1,
 *   limit: 20,
 * });
 * ```
 * 
 * @deprecated For new code, use `useCanonicalDocumentsByQuery` from `useCanonicalDocumentWithReactQuery.ts`
 */
export function useDocumentsByQuery(
  queryId: string | null,
  options?: {
    page?: number;
    limit?: number;
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['documents', 'query', queryId, options?.page, options?.limit],
    queryFn: async () => {
      if (!queryId) return [];

      // Use canonical document API
      const response = await api.canonicalDocument.getCanonicalDocumentsByQuery(queryId, {
        page: options?.page,
        limit: options?.limit,
      });

      // Transform canonical documents to Bron format
      const canonicalDocs = response.data || [];
      return canonicalDocs.map((doc: CanonicalDocument) =>
        transformCanonicalDocumentToBron(doc)
      );
    },
    enabled: !!queryId && (options?.enabled !== false),
    staleTime: 2 * 60 * 1000, // 2 minutes - documents may change
  });
}

/**
 * React Query hook for creating a single document
 * 
 * Uses canonical document API internally.
 * 
 * @example
 * ```tsx
 * const createDocument = useCreateDocument();
 * 
 * const handleCreate = async () => {
 *   const document = await createDocument.mutateAsync({
 *     titel: 'Test Document',
 *     url: 'https://example.com',
 *     // ... other fields
 *   });
 * };
 * ```
 * 
 * @deprecated For new code, use `useCreateCanonicalDocument` from `useCanonicalDocumentWithReactQuery.ts`
 */
export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: BronDocument) => {
      // Convert legacy format to canonical draft
      const canonicalDraft = await convertBronToCanonicalDraft(data);

      // Create using canonical API
      const createdCanonical = await api.canonicalDocument.createCanonicalDocument(canonicalDraft);

      // Transform to Bron format
      return transformCanonicalDocumentToBron(createdCanonical);
    },
    onSuccess: (_newDocument, variables) => {
      // Invalidate canonical document queries
      queryClient.invalidateQueries({ queryKey: ['canonical-documents'] });

      // Invalidate documents list for the query if queryId is present
      if (variables.queryId) {
        queryClient.invalidateQueries({
          queryKey: ['documents', 'query', variables.queryId],
        });
        queryClient.invalidateQueries({
          queryKey: ['canonical-documents', 'query', variables.queryId],
        });
      }
    },
  });
}

/**
 * React Query hook for creating multiple documents (bulk)
 * 
 * Uses canonical document API internally.
 * 
 * @example
 * ```tsx
 * const createDocuments = useCreateDocuments();
 * 
 * const handleBulkCreate = async () => {
 *   const documents = await createDocuments.mutateAsync([
 *     { titel: 'Doc 1', url: 'https://example.com/1', ... },
 *     { titel: 'Doc 2', url: 'https://example.com/2', ... },
 *   ]);
 * };
 * ```
 * 
 * @deprecated For new code, use `useCreateCanonicalDocuments` from `useCanonicalDocumentWithReactQuery.ts`
 */
export function useCreateDocuments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: BronDocument[]) => {
      // Convert all legacy documents to canonical drafts
      const canonicalDrafts = await Promise.all(
        data.map(doc => convertBronToCanonicalDraft(doc))
      );

      // Create all documents using canonical API (sequential to avoid overwhelming server)
      const createdCanonicalDocuments: CanonicalDocument[] = [];
      for (const draft of canonicalDrafts) {
        const created = await api.canonicalDocument.createCanonicalDocument(draft);
        createdCanonicalDocuments.push(created);
      }

      // Transform to Bron format
      return createdCanonicalDocuments.map(doc => transformCanonicalDocumentToBron(doc));
    },
    onSuccess: (_newDocuments, variables) => {
      // Invalidate canonical document queries
      queryClient.invalidateQueries({ queryKey: ['canonical-documents'] });

      // Invalidate documents for all unique queryIds
      const queryIds = new Set(
        variables
          .map((doc) => doc.queryId)
          .filter((id): id is string => !!id)
      );

      queryIds.forEach((queryId) => {
        queryClient.invalidateQueries({
          queryKey: ['documents', 'query', queryId],
        });
        queryClient.invalidateQueries({
          queryKey: ['canonical-documents', 'query', queryId],
        });
      });
    },
  });
}

/**
 * React Query hook for updating document acceptance status
 * 
 * @example
 * ```tsx
 * const updateAcceptance = useUpdateDocumentAcceptance();
 * 
 * const handleAccept = async (documentId: string) => {
 *   await updateAcceptance.mutateAsync({
 *     documentId,
 *     accepted: true,
 *   });
 * };
 * ```
 */
/**
 * React Query hook for updating document acceptance status
 * 
 * Uses canonical document API internally.
 * 
 * @example
 * ```tsx
 * const updateAcceptance = useUpdateDocumentAcceptance();
 * 
 * const handleAccept = async (documentId: string) => {
 *   await updateAcceptance.mutateAsync({
 *     documentId,
 *     accepted: true,
 *   });
 * };
 * ```
 * 
 * @deprecated For new code, use `useUpdateCanonicalDocumentAcceptance` from `useCanonicalDocumentWithReactQuery.ts`
 */
export function useUpdateDocumentAcceptance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      documentId: string;
      accepted: boolean | null;
    }) => {
      // Use canonical document API
      const updated = await api.canonicalDocument.updateCanonicalDocumentAcceptance(
        params.documentId,
        params.accepted
      );

      // Transform to Bron format
      return transformCanonicalDocumentToBron(updated);
    },
    onSuccess: (updatedDocument) => {
      // Invalidate canonical document queries
      queryClient.invalidateQueries({ queryKey: ['canonical-documents'] });

      // Invalidate documents for the query if queryId is present
      const queryId = (updatedDocument as any).queryId;
      if (queryId) {
        queryClient.invalidateQueries({
          queryKey: ['documents', 'query', queryId],
        });
        queryClient.invalidateQueries({
          queryKey: ['canonical-documents', 'query', queryId],
        });
      }
    },
  });
}

/**
 * React Query hook for deleting a document
 * 
 * @example
 * ```tsx
 * const deleteDocument = useDeleteDocument();
 * 
 * const handleDelete = async (documentId: string) => {
 *   await deleteDocument.mutateAsync(documentId);
 * };
 * ```
 */
/**
 * React Query hook for deleting a document
 * 
 * Uses canonical document API internally.
 * 
 * @example
 * ```tsx
 * const deleteDocument = useDeleteDocument();
 * 
 * const handleDelete = async (documentId: string) => {
 *   await deleteDocument.mutateAsync(documentId);
 * };
 * ```
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      // Use canonical document API
      await api.canonicalDocument.deleteCanonicalDocument(documentId);
    },
    onSuccess: () => {
      // Invalidate canonical document queries
      queryClient.invalidateQueries({ queryKey: ['canonical-documents'] });
    },
  });
}


