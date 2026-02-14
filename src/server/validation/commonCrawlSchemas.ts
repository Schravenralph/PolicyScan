import { z } from 'zod';
import { commonSchemas } from '../middleware/validation.js';

export const commonCrawlSchemas = {
    getQuery: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    saveResults: {
        params: z.object({
            queryId: commonSchemas.mongoId,
        }),
        body: z.object({
            results: z.array(z.object({
                url: z.string().url('Invalid URL format'),
                title: z.string().optional(),
                snippet: z.string().optional(),
                timestamp: z.string().optional(),
                crawlId: z.string().optional(),
            })).min(1, 'Results array must not be empty'),
        }),
    },

    getResults: {
        params: z.object({
            queryId: commonSchemas.mongoId,
        }),
        query: z.object({
            approved: z.string().optional(),
            limit: z.coerce.number().optional(),
            skip: z.coerce.number().optional(),
        }).optional(),
    },

    approveResult: {
        params: z.object({
            resultId: commonSchemas.mongoId,
        }),
    },

    approveMany: {
        body: z.object({
            resultIds: z.array(commonSchemas.mongoId).min(1, 'At least one result ID is required'),
        }),
    },

    deleteQuery: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    validateCrawlId: {
        params: z.object({
            crawlId: z.string().min(1, 'Crawl ID is required').regex(/^CC-MAIN-\d{4}-\d{2}$/, 'Invalid crawl ID format'),
        }),
    },

    saveQuery: {
        body: z.object({
            query: z.string().min(1, 'Query is required'),
            domainFilter: z.string().optional(),
            crawlId: z.string().min(1, 'Crawl ID is required'),
            status: z.enum(['pending', 'approved', 'rejected']).optional(),
        }),
    },

    getQueries: {
        query: z.object({
            status: z.enum(['pending', 'approved', 'rejected']).optional(),
            limit: z.coerce.number().optional(),
            skip: z.coerce.number().optional(),
        }).optional(),
    },

    query: {
        body: z.object({
            query: z.string().trim().min(1, 'Query parameter is required'),
            domainFilter: z.string().optional(),
            crawlId: z.string().regex(/^CC-MAIN-\d{4}-\d{2}$/, 'Invalid crawl ID format').optional(),
            limit: z.union([z.number().int().min(1).max(1000), z.string().regex(/^\d+$/).transform(Number)]).optional(),
        }),
    },

    /**
     * SessionId validation schema
     * Validates sessionId to prevent path traversal and injection attacks
     * - Only allows alphanumeric, underscore, hyphen
     * - Limits length to 100 characters
     * - Prevents path traversal patterns (.., /, \)
     */
    sessionId: z.string()
        .min(1, 'SessionId is required')
        .max(100, 'SessionId must not exceed 100 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'SessionId must contain only alphanumeric characters, underscores, or hyphens')
        .refine((val) => !val.includes('..') && !val.includes('/') && !val.includes('\\'), {
            message: 'SessionId must not contain path traversal patterns (.., /, \\)',
        }),

    load: {
        body: z.object({
            pattern: z.string().min(1, 'Pattern is required'),
            crawlId: z.string()
                .min(1, 'CrawlId is required')
                .regex(/^CC-MAIN-\d{4}-\d{2}$/, 'Invalid crawl ID format. Must match CC-MAIN-YYYY-WW pattern')
                .refine((val) => {
                    // Additional safety: ensure no path traversal or protocol injection
                    return !val.includes('..') && 
                           !val.includes('/') && 
                           !val.includes('\\') &&
                           !val.includes(':') &&
                           !val.includes('http') &&
                           !val.includes('file');
                }, {
                    message: 'CrawlId contains invalid characters that could lead to SSRF',
                }),
            limit: z.number().int().min(1).max(10000000).optional(),
            sessionId: z.string()
                .max(100, 'SessionId must not exceed 100 characters')
                .regex(/^[a-zA-Z0-9_-]+$/, 'SessionId must contain only alphanumeric characters, underscores, or hyphens')
                .refine((val) => !val.includes('..') && !val.includes('/') && !val.includes('\\'), {
                    message: 'SessionId must not contain path traversal patterns (.., /, \\)',
                })
                .optional(),
            filters: z.any().optional(),
        }),
    },

    stats: {
        params: z.object({
            sessionId: z.string()
                .min(1, 'SessionId is required')
                .max(100, 'SessionId must not exceed 100 characters')
                .regex(/^[a-zA-Z0-9_-]+$/, 'SessionId must contain only alphanumeric characters, underscores, or hyphens')
                .refine((val) => !val.includes('..') && !val.includes('/') && !val.includes('\\'), {
                    message: 'SessionId must not contain path traversal patterns (.., /, \\)',
                }),
        }),
    },

    findDomains: {
        body: z.object({
            sessionId: z.string()
                .min(1, 'SessionId is required')
                .max(100, 'SessionId must not exceed 100 characters')
                .regex(/^[a-zA-Z0-9_-]+$/, 'SessionId must contain only alphanumeric characters, underscores, or hyphens')
                .refine((val) => !val.includes('..') && !val.includes('/') && !val.includes('\\'), {
                    message: 'SessionId must not contain path traversal patterns (.., /, \\)',
                }),
            substring: z.string().min(1, 'Substring is required'),
            limit: z.number().int().min(1).max(10000).optional(),
        }),
    },

    findUrls: {
        body: z.object({
            sessionId: z.string()
                .min(1, 'SessionId is required')
                .max(100, 'SessionId must not exceed 100 characters')
                .regex(/^[a-zA-Z0-9_-]+$/, 'SessionId must contain only alphanumeric characters, underscores, or hyphens')
                .refine((val) => !val.includes('..') && !val.includes('/') && !val.includes('\\'), {
                    message: 'SessionId must not contain path traversal patterns (.., /, \\)',
                }),
            substring: z.string().min(1, 'Substring is required'),
            domainPattern: z.string().optional(),
            limit: z.number().int().min(1).max(10000).optional(),
        }),
    },

    deleteSession: {
        params: z.object({
            sessionId: z.string()
                .min(1, 'SessionId is required')
                .max(100, 'SessionId must not exceed 100 characters')
                .regex(/^[a-zA-Z0-9_-]+$/, 'SessionId must contain only alphanumeric characters, underscores, or hyphens')
                .refine((val) => !val.includes('..') && !val.includes('/') && !val.includes('\\'), {
                    message: 'SessionId must not contain path traversal patterns (.., /, \\)',
                }),
        }),
    },
};
