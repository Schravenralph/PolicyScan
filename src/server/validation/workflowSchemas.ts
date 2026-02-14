import { z } from 'zod';
import { commonSchemas } from '../middleware/validation.js';

export const workflowSchemas = {
    runWorkflow: {
        params: z.object({
            id: z.string().min(1, 'Workflow ID is required'), // Allow any string (predefined or MongoDB ObjectId)
        }),
        body: z.object({
            reviewMode: z.boolean().optional(),
        }).passthrough(), // Allow additional params for workflow-specific parameters
    },

    queueWorkflow: {
        params: z.object({
            id: z.string().min(1, 'Workflow ID is required'), // Allow any string (predefined or MongoDB ObjectId)
        }),
        body: z.object({
            reviewMode: z.boolean().optional(),
            priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
            delay: z.union([z.string().regex(/^\d+$/).transform(Number), z.number()]).optional(), // Delay in milliseconds
        }).passthrough(), // Allow additional params for workflow-specific parameters
    },

    listRuns: {
        query: z.object({
            status: z.string().optional(),
            type: z.string().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            limit: z.string().regex(/^\d+$/).transform(Number).optional(),
            page: z.string().regex(/^\d+$/).transform(Number).optional(),
            skip: z.string().regex(/^\d+$/).transform(Number).optional(),
            format: z.enum(['array', 'paginated']).optional(), // Request response format
        }).optional(),
    },

    getRun: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    cancelRun: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    pauseRun: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    resumeRun: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    getCluster: {
        params: z.object({
            id: z.string().min(1, 'Cluster ID is required'),
        }),
    },

    expandCluster: {
        params: z.object({
            id: z.string().min(1, 'Cluster ID is required'),
        }),
        query: z.object({
            maxNodes: z.string().regex(/^\d+$/).transform(Number).optional(),
            maxDepth: z.string().regex(/^\d+$/).transform(Number).optional(),
        }).optional(),
    },

    getMetaGraphVisualization: {
        query: z.object({
            pathDepth: z.string().regex(/^\d+$/).transform(Number).optional(),
            minClusterSize: z.string().regex(/^\d+$/).transform(Number).optional(),
            layout: z.enum(['grid', 'force', 'circular', 'hierarchical']).optional(),
            width: z.string().regex(/^\d+$/).transform(Number).optional(),
            height: z.string().regex(/^\d+$/).transform(Number).optional(),
            nodeSpacing: z.string().regex(/^\d+$/).transform(Number).optional(),
            iterations: z.string().regex(/^\d+$/).transform(Number).optional(),
        }).optional(),
    },

    exportMetaGraph: {
        query: z.object({
            pathDepth: z.string().regex(/^\d+$/).transform(Number).optional(),
            minClusterSize: z.string().regex(/^\d+$/).transform(Number).optional(),
            format: z.enum(['json', 'graphml']).optional(),
            includePositions: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
            includeMetadata: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
        }).optional(),
    },

    getModule: {
        params: z.object({
            id: z.string().min(1, 'Module ID is required'),
        }),
    },

    getModuleByCategory: {
        params: z.object({
            category: z.string().min(1, 'Category is required'),
        }),
    },

    getReview: {
        params: z.object({
            runId: commonSchemas.mongoId,
        }),
    },

    reviewCandidate: {
        params: z.object({
            reviewId: commonSchemas.mongoId,
            candidateId: z.string().min(1, 'Candidate ID is required'),
        }),
        body: z.object({
            status: z.enum(['accepted', 'rejected']),
            notes: z.string().optional(),
        }),
    },

    reviewCandidates: {
        params: z.object({
            reviewId: commonSchemas.mongoId,
        }),
        body: z.object({
            decisions: z.array(
                z.object({
                    candidateId: z.string().min(1, 'Candidate ID is required'),
                    status: z.enum(['accepted', 'rejected']),
                })
            ).min(1, 'At least one decision is required'),
        }),
    },

    completeReview: {
        params: z.object({
            reviewId: commonSchemas.mongoId,
        }),
        body: z.object({
            workflowId: z.string().min(1, 'Workflow ID is required'),
        }),
    },

    getReviewStats: {
        params: z.object({
            workflowId: commonSchemas.mongoId,
        }),
    },

    getReviewHistory: {
        params: z.object({
            workflowId: commonSchemas.mongoId,
        }),
    },

    getReviewByIdStats: {
        params: z.object({
            reviewId: commonSchemas.mongoId,
        }),
    },

    getPendingReviews: {
        params: z.object({
            runId: commonSchemas.mongoId,
        }),
    },

    deleteReview: {
        params: z.object({
            reviewId: commonSchemas.mongoId,
        }),
    },

    deleteRunReviews: {
        params: z.object({
            runId: commonSchemas.mongoId,
        }),
    },

    compareReviews: {
        params: z.object({
            reviewId1: commonSchemas.mongoId,
            reviewId2: commonSchemas.mongoId,
        }),
    },

    exportReview: {
        params: z.object({
            reviewId: commonSchemas.mongoId,
        }),
    },

    getReviewTemplate: {
        params: z.object({
            templateId: commonSchemas.mongoId,
        }),
    },

    updateReviewTemplate: {
        params: z.object({
            templateId: commonSchemas.mongoId,
        }),
        body: z.object({
            name: z.string().min(1).optional(),
            description: z.string().optional(),
            criteria: z.record(z.string(), z.any()).optional(),
        }).refine((data) => Object.keys(data).length > 0, {
            message: 'At least one field must be provided for update',
        }),
    },

    deleteReviewTemplate: {
        params: z.object({
            templateId: commonSchemas.mongoId,
        }),
    },

    applyReviewTemplate: {
        params: z.object({
            reviewId: commonSchemas.mongoId,
            templateId: commonSchemas.mongoId,
        }),
    },
};

