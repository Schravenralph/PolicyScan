/**
 * Pagination utility functions for consistent pagination across all list endpoints
 */

export interface PaginationParams {
  page?: number;
  limit?: number;
  skip?: number;
}

export interface PaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  skip: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMetadata;
}

/**
 * Parse pagination parameters from request query
 * Supports both page-based and skip-based pagination
 */
export function parsePaginationParams(
  query: Record<string, unknown>,
  options: PaginationOptions = {}
): { limit: number; skip: number; page: number } {
  const { defaultLimit = 50, maxLimit = 1000 } = options;

  // Support both page-based and skip-based pagination
  let page = 1;
  let skip = 0;
  let limit = defaultLimit;

  // Parse page parameter
  if (query.page !== undefined) {
    const pageNum = parseInt(String(query.page), 10);
    if (!isNaN(pageNum) && pageNum > 0) {
      page = pageNum;
    }
  }

  // Parse limit parameter
  if (query.limit !== undefined) {
    const limitNum = parseInt(String(query.limit), 10);
    if (!isNaN(limitNum) && limitNum > 0) {
      limit = Math.min(limitNum, maxLimit);
    }
  }

  // Parse skip parameter (takes precedence over page if both are provided)
  if (query.skip !== undefined) {
    const skipNum = parseInt(String(query.skip), 10);
    if (!isNaN(skipNum) && skipNum >= 0) {
      skip = skipNum;
      // Calculate page from skip (skip takes precedence)
      page = Math.floor(skip / limit) + 1;
    }
  } else {
    // Calculate skip from page
    skip = (page - 1) * limit;
  }

  return { limit, skip, page };
}

/**
 * Create pagination metadata from results
 */
export function createPaginationMetadata(
  total: number,
  limit: number,
  page: number,
  skip: number
): PaginationMetadata {
  const totalPages = Math.ceil(total / limit);
  const hasMore = page < totalPages;

  return {
    page,
    limit,
    total,
    totalPages,
    hasMore,
    skip,
  };
}

/**
 * Create a paginated response
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  limit: number,
  page: number,
  skip: number
): PaginatedResponse<T> {
  return {
    data,
    pagination: createPaginationMetadata(total, limit, page, skip),
  };
}

/**
 * Count total items for pagination
 * Helper function to get total count from a MongoDB collection
 */
export async function getTotalCount(
  countFn: () => Promise<number>
): Promise<number> {
  try {
    return await countFn();
  } catch (error) {
    // If count fails, return 0 to prevent pagination errors
    console.error('Error counting items:', error);
    return 0;
  }
}

