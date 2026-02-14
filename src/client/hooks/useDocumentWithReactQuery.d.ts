/**
 * React Query hooks for documents
 *
 * These hooks use CanonicalDocumentApiService internally and transform to Bron format.
 *
 * @deprecated For new code, use hooks from `useCanonicalDocumentWithReactQuery.ts` directly
 */
import type { BronDocument } from '../utils/transformations';
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
export declare function useDocumentsByQuery(queryId: string | null, options?: {
    page?: number;
    limit?: number;
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<import("../utils/transformations").Bron[], Error>;
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
export declare function useCreateDocument(): import("@tanstack/react-query").UseMutationResult<import("../utils/transformations").Bron, Error, BronDocument, unknown>;
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
export declare function useCreateDocuments(): import("@tanstack/react-query").UseMutationResult<import("../utils/transformations").Bron[], Error, BronDocument[], unknown>;
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
export declare function useUpdateDocumentAcceptance(): import("@tanstack/react-query").UseMutationResult<import("../utils/transformations").Bron, Error, {
    documentId: string;
    accepted: boolean | null;
}, unknown>;
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
export declare function useDeleteDocument(): import("@tanstack/react-query").UseMutationResult<void, Error, string, unknown>;
