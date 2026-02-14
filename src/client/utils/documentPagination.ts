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
export function paginateDocuments<T>(
  documents: T[],
  options: PaginationOptions = {}
): PaginationResult<T> {
  const pageSize = options.pageSize || 20;
  const currentPage = options.currentPage || 1;

  const totalItems = documents.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  const items = documents.slice(startIndex, endIndex);

  return {
    items,
    totalItems,
    totalPages,
    currentPage,
    pageSize,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
  };
}

/**
 * Calculate pagination metadata
 */
export function getPaginationMetadata(
  totalItems: number,
  pageSize: number,
  currentPage: number
): {
  totalPages: number;
  startIndex: number;
  endIndex: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
} {
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  return {
    totalPages,
    startIndex,
    endIndex,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
  };
}


