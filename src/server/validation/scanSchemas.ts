import { z } from 'zod';
import { commonSchemas } from '../middleware/validation.js';

export const scanSchemas = {
    getProgress: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    generateSuggestions: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    generateMockSuggestions: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    scrape: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
        body: z.object({
            websiteIds: z.array(commonSchemas.mongoId).min(1, 'At least one website ID is required'),
        }),
    },

    queueScan: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    getJobStatus: {
        params: z.object({
            id: commonSchemas.mongoId,
            jobId: z.string().min(1, 'Job ID is required'),
        }),
    },

    getJobsForQuery: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    cancelJob: {
        params: z.object({
            id: commonSchemas.mongoId,
            jobId: z.string().min(1, 'Job ID is required'),
        }),
    },

    getScanStatus: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },
};

