/**
 * Pagination metadata for API responses
 * Matches the server-side PaginationMetadata structure
 */
export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  skip: number;
}

/**
 * Alternative pagination structure used by some endpoints
 */
export interface AlternativePaginationMetadata {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Union type for pagination metadata
 * Supports both standard and alternative pagination formats
 */
export type PaginationMetadataUnion = PaginationMetadata | AlternativePaginationMetadata;










