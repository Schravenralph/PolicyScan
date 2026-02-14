/**
 * Document Pagination Utility
 *
 * Provides pagination functionality for large document lists.
 */
export interface PaginationOptions {
    pageSize?: number;
    currentPage?: number;
}
export interface PaginationResult<T> {
    items: T[];
    totalItems: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}
/**
 * Paginate an array of documents
 */
export declare function paginateDocuments<T>(documents: T[], options?: PaginationOptions): PaginationResult<T>;
/**
 * Calculate pagination metadata
 */
export declare function getPaginationMetadata(totalItems: number, pageSize: number, currentPage: number): {
    totalPages: number;
    startIndex: number;
    endIndex: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};
