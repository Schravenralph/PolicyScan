import { z } from 'zod';
import { commonSchemas } from '../middleware/validation.js';

export const bronWebsiteSchemas = {
    create: {
        body: z.object({
            titel: commonSchemas.nonEmptyString,
            url: commonSchemas.url,
            label: z.string().optional(),
            samenvatting: z.string().optional(),
            'relevantie voor zoekopdracht': z.string().optional(),
            subjects: z.array(z.string()).optional(),
            themes: z.array(z.string()).optional(),
            website_types: z.array(z.string()).optional(),
            queryId: commonSchemas.mongoId.optional(),
            accepted: z.boolean().nullable().optional(),
        }).passthrough(), // Allow additional fields to pass through
    },

    createMany: {
        body: z.array(
            z.object({
                titel: commonSchemas.nonEmptyString,
                url: commonSchemas.url,
                label: z.string().optional(),
                samenvatting: z.string().optional(),
                'relevantie voor zoekopdracht': z.string().optional(),
                subjects: z.array(z.string()).optional(),
                themes: z.array(z.string()).optional(),
                website_types: z.array(z.string()).optional(),
                queryId: commonSchemas.mongoId.optional(),
                accepted: z.boolean().nullable().optional(),
            })
        ).min(1).max(100), // Limit bulk operations
    },

    getById: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    getByQuery: {
        params: z.object({
            queryId: commonSchemas.mongoId,
        }),
    },

    update: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
        body: z.object({
            titel: commonSchemas.nonEmptyString.optional(),
            url: commonSchemas.url.optional(),
            samenvatting: z.string().optional(),
            'relevantie voor zoekopdracht': z.string().optional(),
            website_types: z.array(z.string()).optional(),
            accepted: z.boolean().nullable().optional(),
        }).refine((data) => Object.keys(data).length > 0, {
            message: 'At least one field must be provided for update',
        }),
    },

    updateAcceptance: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
        body: z.object({
            accepted: z.boolean().nullable(),
        }),
    },

    delete: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },
};


