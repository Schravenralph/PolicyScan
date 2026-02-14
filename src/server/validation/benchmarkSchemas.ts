import { z } from 'zod';
import { commonSchemas } from '../middleware/validation.js';

export const benchmarkSchemas = {
    run: {
        body: z.object({
            name: z.string().optional(),
            query: z.string().optional().refine(
                (val) => !val || val.trim().length > 0,
                { message: 'Query cannot be empty or whitespace only' }
            ), // Optional for backward compatibility
            queries: z.array(z.string().refine(
                (val) => val.trim().length > 0,
                { message: 'Query cannot be empty or whitespace only' }
            )).min(1, 'At least one query is required').optional(),
            benchmarkTypes: z.array(z.string()).min(1, 'At least one benchmark type is required'),
            workflowIds: z.array(z.string()).optional(),
            maxWorkflowTemplates: z.number().int().positive().max(100).optional(),
            runsPerWorkflow: z.number().int().positive().max(100).optional(),
            executionMode: z.enum(['sequential', 'parallel']).optional(), // Execution mode (default: 'sequential')
            maxConcurrent: z.number().int().positive().max(20).optional(), // Max concurrent workflows for parallel mode (default: 5)
            workflowConfigs: z.array(
                z.object({
                    workflowId: z.string().min(1, 'workflowId is required'),
                    featureFlags: z.record(z.string(), z.boolean()).optional(),
                })
            ).optional(), // Per-workflow feature flag configuration
        }).refine(
            (data) => {
                // For non-workflow benchmarks, require at least one non-empty query
                if (data.benchmarkTypes.includes('workflow')) {
                    return true; // Workflow benchmarks don't require queries
                }
                // Check if query is provided and non-empty (after trim)
                const hasQuery = data.query && data.query.trim().length > 0;
                // Check if queries array is provided and has at least one non-empty query
                const hasQueries = data.queries && data.queries.length > 0 && data.queries.some(q => q.trim().length > 0);
                return hasQuery || hasQueries;
            },
            { message: 'Either query/queries must be provided for non-workflow benchmarks, or benchmarkTypes must include "workflow". Queries cannot be empty or whitespace only.' }
        ),
    },

    getRun: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    getResult: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    aggregate: {
        query: z.object({
            query: z.string().optional(),
            benchmarkType: z.string().optional(),
        }),
    },

    compare: {
        query: z.object({
            workflowIds: z.union([
                z.string(),
                z.array(z.string()),
            ]).transform((val) => Array.isArray(val) ? val : [val]).refine(
                (arr) => arr.length > 0,
                { message: 'At least one workflowId is required' }
            ),
            query: z.string().optional(),
        }),
    },

    stats: {
        query: z.object({
            configName: z.string().min(1, 'configName is required'),
            query: z.string().optional(),
            benchmarkType: z.string().optional(),
        }),
    },

    scoreDocument: {
        body: z.object({
            workflow: z.enum(['A', 'B']),
            url: z.string().url('url must be a valid URL'),
            relevanceScore: z.enum(['relevant', 'irrelevant']),
            scoredBy: z.string().min(1, 'scoredBy is required'),
        }),
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    scoreDocuments: {
        body: z.object({
            scores: z.array(
                z.object({
                    workflow: z.enum(['A', 'B']),
                    url: z.string().url('url must be a valid URL'),
                    relevanceScore: z.enum(['relevant', 'irrelevant']),
                    scoredBy: z.string().min(1, 'scoredBy is required'),
                })
            ).min(1, 'At least one score is required').max(100, 'Maximum 100 documents per request'),
        }),
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    workflowComparison: {
        body: z.object({
            workflowAId: z.string().min(1, 'workflowAId is required'),
            workflowBId: z.string().min(1, 'workflowBId is required'),
            configAName: z.string().min(1, 'configAName is required'),
            configBName: z.string().min(1, 'configBName is required'),
            query: z.string().min(1, 'query is required'),
            name: z.string().optional(),
            timeout: z.number().int().positive().optional(),
        }),
    },

    getWorkflowComparison: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    listWorkflowComparisons: {
        query: z.object({
            limit: z.coerce.number().int().positive().max(100).optional(),
            skip: z.coerce.number().int().nonnegative().optional(),
            workflowId: z.string().optional(),
            configName: z.string().optional(),
            status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
        }),
    },

    stepBenchmark: {
        body: z.object({
            workflowId: z.string().min(1, 'workflowId is required'),
            stepId: z.string().min(1, 'stepId is required'),
            context: z.record(z.string(), z.unknown()).optional(),
            useRealContext: z.boolean().optional(),
            featureFlags: z.record(z.string(), z.boolean()).optional(),
            query: z.string().optional(),
            runsPerStep: z.number().int().positive().max(100).optional(),
            name: z.string().optional(),
        }),
    },

    groundTruthCreate: {
        body: z.object({
            name: z.string().min(1, 'Dataset name is required').max(200, 'Dataset name must be 200 characters or less'),
            description: z.string().max(1000, 'Dataset description must be 1000 characters or less').optional(),
            queries: z.array(
                z.object({
                    query: z.string().min(1, 'Query string is required'),
                    relevant_documents: z.array(
                        z.object({
                            url: z.string().url('URL must be a valid URL'),
                            relevance: z.number().int().min(0).max(4, 'Relevance must be between 0 and 4'),
                        })
                    ).min(1, 'At least one relevant document is required'),
                })
            ).min(1, 'At least one query is required'),
        }),
    },

    groundTruthUpdate: {
        body: z.object({
            name: z.string().min(1, 'Dataset name is required').max(200, 'Dataset name must be 200 characters or less').optional(),
            description: z.string().max(1000, 'Dataset description must be 1000 characters or less').optional(),
            queries: z.array(
                z.object({
                    query: z.string().min(1, 'Query string is required'),
                    relevant_documents: z.array(
                        z.object({
                            url: z.string().url('URL must be a valid URL'),
                            relevance: z.number().int().min(0).max(4, 'Relevance must be between 0 and 4'),
                        })
                    ).min(1, 'At least one relevant document is required'),
                })
            ).min(1, 'At least one query is required').optional(),
        }),
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    groundTruthGet: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    groundTruthExists: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    groundTruthList: {
        query: z.object({
            name: z.string().optional(),
            created_by: z.string().optional(),
            search: z.string().optional(),
            limit: z.coerce.number().int().positive().max(1000).optional(),
            skip: z.coerce.number().int().nonnegative().optional(),
            sort: z.string().optional(), // e.g., "created_at:-1" or "name:1"
        }),
    },

    groundTruthDelete: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    getStepBenchmark: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    listStepBenchmarks: {
        query: z.object({
            limit: z.coerce.number().optional().default(50),
            skip: z.coerce.number().optional().default(0),
        }),
    },

    cancelStepBenchmark: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    documentSetBenchmark: {
        body: z.object({
            name: z.string().min(1, 'name is required'),
            description: z.string().optional(),
            documentSet: z.object({
                type: z.enum(['urls', 'queryId', 'runId', 'filter']),
                urls: z.array(z.string().url()).optional(),
                queryId: z.string().optional(),
                runId: z.string().optional(),
                filters: z.object({
                    type_document: z.string().optional(),
                    dateRange: z.object({
                        start: z.union([z.string().datetime(), z.date()]),
                        end: z.union([z.string().datetime(), z.date()]),
                    }).optional(),
                    source: z.array(z.string()).optional(),
                    minScore: z.number().optional(),
                    maxScore: z.number().optional(),
                }).optional(),
                sampling: z.object({
                    strategy: z.enum(['all', 'random', 'top-n', 'stratified']),
                    count: z.number().int().positive().optional(),
                    seed: z.number().int().optional(),
                }).optional(),
            }),
            workflowId: z.string().min(1, 'workflowId is required'),
            skipSteps: z.array(z.string()).optional(),
            featureFlags: z.record(z.string(), z.boolean()).optional(),
            runsPerBenchmark: z.number().int().positive().max(100).optional(),
        }),
    },

    getDocumentSetBenchmark: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    listDocumentSetBenchmarks: {
        query: z.object({
            limit: z.coerce.number().optional().default(50),
            skip: z.coerce.number().optional().default(0),
        }),
    },

    cancelDocumentSetBenchmark: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    compareWorkflowGroundTruth: {
        body: z.object({
            workflowId: z.string().min(1, 'workflowId is required'),
            groundTruthId: z.string().min(1, 'groundTruthId is required'),
            query: z.string().min(1, 'query is required'),
            runtimeSettings: z.object({
                featureFlags: z.record(z.string(), z.boolean()).optional(),
                params: z.record(z.string(), z.unknown()).optional(),
                timeout: z.number().int().positive().optional(),
                maxRetries: z.number().int().positive().optional(),
                maxMemoryMB: z.number().int().positive().optional(),
                maxConcurrentRequests: z.number().int().positive().optional(),
            }).optional(),
        }),
    },

    getGroundTruthEvaluation: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    listGroundTruthEvaluations: {
        query: z.object({
            workflowId: z.string().optional(),
            groundTruthId: z.string().optional(),
            query: z.string().optional(),
            limit: z.coerce.number().optional().default(50),
            skip: z.coerce.number().optional().default(0),
        }),
    },

    createConfigTemplate: {
        body: z.object({
            name: z.string().min(1, 'Template name is required'),
            description: z.string().optional(),
            benchmarkTypes: z.array(z.string()).min(1, 'At least one benchmark type is required'),
            featureFlags: z.record(z.string(), z.boolean()).optional(),
            isPublic: z.boolean().optional(),
            isDefault: z.boolean().optional(),
        }),
    },

    updateConfigTemplate: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
        body: z.object({
            name: z.string().min(1).optional(),
            description: z.string().optional(),
            benchmarkTypes: z.array(z.string()).min(1).optional(),
            featureFlags: z.record(z.string(), z.boolean()).optional(),
            isPublic: z.boolean().optional(),
            isDefault: z.boolean().optional(),
        }),
    },

    getConfigTemplate: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    deleteConfigTemplate: {
        params: z.object({
            id: commonSchemas.mongoId,
        }),
    },

    listConfigTemplates: {
        query: z.object({
            name: z.string().optional(),
            createdBy: z.string().optional(),
            isPublic: z.preprocess(
                (val) => val === undefined || val === null ? undefined : (typeof val === 'string' ? val === 'true' : val),
                z.boolean().optional()
            ),
            isDefault: z.preprocess(
                (val) => val === undefined || val === null ? undefined : (typeof val === 'string' ? val === 'true' : val),
                z.boolean().optional()
            ),
            search: z.string().optional(),
            limit: z.coerce.number().int().positive().max(100).optional(),
            skip: z.coerce.number().int().nonnegative().optional(),
        }),
    },

    startWorkflowComparison: {
        body: z.object({
            name: z.string().min(1, 'name is required'),
            description: z.string().optional(),
            workflowA: z.object({
                workflowId: z.string().min(1, 'workflowId is required'),
                workflowName: z.string().optional(),
                label: z.string().optional(),
                runtimeSettings: z.object({
                    featureFlags: z.record(z.string(), z.boolean()).optional(),
                    params: z.record(z.string(), z.unknown()).optional(),
                    timeout: z.number().int().positive().optional(),
                    maxRetries: z.number().int().positive().optional(),
                    maxMemoryMB: z.number().int().positive().optional(),
                    maxConcurrentRequests: z.number().int().positive().optional(),
                }).optional(),
            }),
            workflowB: z.object({
                workflowId: z.string().min(1, 'workflowId is required'),
                workflowName: z.string().optional(),
                label: z.string().optional(),
                runtimeSettings: z.object({
                    featureFlags: z.record(z.string(), z.boolean()).optional(),
                    params: z.record(z.string(), z.unknown()).optional(),
                    timeout: z.number().int().positive().optional(),
                    maxRetries: z.number().int().positive().optional(),
                    maxMemoryMB: z.number().int().positive().optional(),
                    maxConcurrentRequests: z.number().int().positive().optional(),
                }).optional(),
            }),
            query: z.string().optional(),
            queries: z.array(z.string()).optional(),
            querySpace: z.object({
                type: z.enum(['all', 'manual', 'filter']),
                queries: z.array(z.string()).optional(),
                filters: z.object({
                    dateRange: z.object({
                        start: z.union([z.string().datetime(), z.date()]),
                        end: z.union([z.string().datetime(), z.date()]),
                    }).optional(),
                    minRuns: z.number().int().positive().optional(),
                    maxRuns: z.number().int().positive().optional(),
                }).optional(),
                sampling: z.object({
                    strategy: z.enum(['all', 'random', 'top-n']),
                    count: z.number().int().positive().optional(),
                    seed: z.number().int().optional(),
                }).optional(),
            }).optional(),
            documentSetSpace: z.object({
                maxDocuments: z.number().int().positive().optional(),
                minDocuments: z.number().int().positive().optional(),
                filters: z.object({
                    type_document: z.array(z.string()).optional(),
                    dateRange: z.object({
                        start: z.union([z.string().datetime(), z.date()]),
                        end: z.union([z.string().datetime(), z.date()]),
                    }).optional(),
                    sources: z.array(z.string()).optional(),
                    minScore: z.number().optional(),
                    maxScore: z.number().optional(),
                    websites: z.array(z.string()).optional(),
                }).optional(),
                sampling: z.object({
                    strategy: z.enum(['all', 'random', 'top-n', 'bottom-n', 'stratified']),
                    count: z.number().int().positive().optional(),
                    seed: z.number().int().optional(),
                    stratifyBy: z.enum(['type', 'source', 'website']).optional(),
                }).optional(),
                manualSelection: z.array(z.string().url()).optional(),
                preset: z.string().optional(),
            }).optional(),
            runsPerQuery: z.number().int().positive().max(100).optional(),
        }),
    },
};

