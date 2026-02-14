/**
 * Shared Response Helpers for Admin Routes
 * 
 * Common response formatting functions used across admin route handlers.
 */

import { Response } from 'express';
import { parsePaginationParams, createPaginatedResponse } from '../../../utils/pagination.js';
import type { Request } from 'express';

/**
 * Parse pagination parameters from request query
 * 
 * @param query - Request query object
 * @param options - Pagination options
 * @returns Parsed pagination parameters
 */
export function parsePagination(query: Request['query'], options?: { defaultLimit?: number; maxLimit?: number }) {
    return parsePaginationParams(query, options);
}

/**
 * Create paginated response
 * 
 * @param data - Array of data items
 * @param total - Total count of items
 * @param limit - Items per page
 * @param page - Current page number
 * @param skip - Number of items to skip
 * @returns Paginated response object
 */
export function createPaginated<T>(data: T[], total: number, limit: number, page: number, skip: number) {
    return createPaginatedResponse(data, total, limit, page, skip);
}

/**
 * Send paginated response or array based on query parameter
 * 
 * @param res - Express response object
 * @param data - Array of data items
 * @param total - Total count of items
 * @param limit - Items per page
 * @param page - Current page number
 * @param skip - Number of items to skip
 */
export function sendPaginatedOrArray<T>(
    res: Response,
    data: T[],
    total: number,
    limit: number,
    page: number,
    skip: number,
    includePagination?: boolean
) {
    if (includePagination) {
        const response = createPaginatedResponse(data, total, limit, page, skip);
        res.json(response);
    } else {
        res.json(data);
    }
}

/**
 * Send success response with message
 * 
 * @param res - Express response object
 * @param message - Success message
 * @param data - Optional data to include
 */
export function sendSuccess(res: Response, message: string, data?: Record<string, unknown>) {
    res.json({
        success: true,
        message,
        ...data,
        timestamp: new Date().toISOString(),
    });
}

/**
 * Send error response
 * 
 * @param res - Express response object
 * @param message - Error message
 * @param statusCode - HTTP status code
 * @param details - Optional error details
 */
export function sendError(res: Response, message: string, statusCode: number = 400, details?: Record<string, unknown>) {
    res.status(statusCode).json({
        success: false,
        message,
        ...details,
        timestamp: new Date().toISOString(),
    });
}



