import { Router, Request, Response } from 'express';
import { QueryService } from '../services/query/QueryService.js';
import { Query } from '../models/Query.js';
import { mapQueryToDto } from '../utils/mappers.js';
import { logger } from '../utils/logger.js';
import { parsePaginationParams, createPaginatedResponse } from '../utils/pagination.js';
import { asyncHandler, throwIfNotFound } from '../utils/errorHandling.js';
import { NotFoundError } from '../types/errors.js';
import { requireResourceAuthorization } from '../middleware/resourceAuthorizationMiddleware.js';

const router = Router();

// Lazy initialization of query service (Neo4j must be connected first)
let queryService: QueryService | null = null;
let queryServiceInitializing = false;
let queryServiceInitialized = false;

async function getQueryService(): Promise<QueryService> {
    if (queryServiceInitialized && queryService) {
        return queryService;
    }

    if (!queryService) {
        queryService = new QueryService();
    }

    if (!queryServiceInitialized && !queryServiceInitializing) {
        queryServiceInitializing = true;
        try {
            await queryService.initialize();
            queryServiceInitialized = true;
        } catch (err) {
            logger.error({ error: err }, 'Failed to initialize QueryService');
            queryServiceInitializing = false;
            throw err;
        } finally {
            queryServiceInitializing = false;
        }
    }

    return queryService;
}

// Create a new query
router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const service = await getQueryService();
    // Ensure createdBy is set from authenticated user
    const queryData = {
        ...req.body,
        createdBy: req.user?.userId || req.body.createdBy,
    };
    const query = await service.createQuery(queryData);
    res.status(201).json(mapQueryToDto(query));
}));

// Get all queries with pagination (optional auth - returns empty if not authenticated)
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const { limit, skip, page } = parsePaginationParams(req.query, { maxLimit: 1000 });

    // If user is not authenticated, return empty array
    if (!req.user) {
        const response = createPaginatedResponse([], 0, limit, page, skip);
        return res.json(response);
    }

    // Get queries and total count for authenticated user
    const service = await getQueryService();
    const [userQueries, total] = await Promise.all([
        service.getAllQueries({ limit, skip, createdBy: req.user.userId }),
        Query.count({ createdBy: req.user.userId })
    ]);

    const response = createPaginatedResponse(userQueries.map(mapQueryToDto), total, limit, page, skip);
    res.json(response);
}));

// Get a query by ID (requires resource authorization)
router.get('/:id',
    requireResourceAuthorization('query', 'id', 'view'),
    asyncHandler(async (req: Request, res: Response) => {
        const service = await getQueryService();
        const query = await service.getQueryById(req.params.id);
        throwIfNotFound(query, 'Query', req.params.id);
        res.json(mapQueryToDto(query));
    })
);

// Update a query (requires resource authorization)
router.patch('/:id',
    requireResourceAuthorization('query', 'id', 'edit'),
    asyncHandler(async (req: Request, res: Response) => {
        const service = await getQueryService();
        const query = await service.updateQuery(req.params.id, req.body);
        throwIfNotFound(query, 'Query', req.params.id);
        res.json(mapQueryToDto(query));
    })
);

// Delete a query (requires resource authorization)
router.delete('/:id',
    requireResourceAuthorization('query', 'id', 'delete'),
    asyncHandler(async (req: Request, res: Response) => {
        const service = await getQueryService();
        const deleted = await service.deleteQuery(req.params.id);
        throwIfNotFound(deleted, 'Query', req.params.id);
        res.status(204).send();
    })
);

// Scan knowledge base for relevant content (requires resource authorization)
router.post('/:id/scan',
    requireResourceAuthorization('query', 'id', 'view'),
    asyncHandler(async (req: Request, res: Response) => {
        const service = await getQueryService();
        const query = await service.getQueryById(req.params.id);
        throwIfNotFound(query, 'Query', req.params.id);
        const result = await service.scanKnowledgeBase(req.params.id, query.onderwerp, 5);
        res.json(result);
    })
);

// Finalize a draft query (convert to completed) (requires resource authorization)
router.post('/:id/finalize',
    requireResourceAuthorization('query', 'id', 'edit'),
    asyncHandler(async (req: Request, res: Response) => {
        const service = await getQueryService();
        const query = await service.getQueryById(req.params.id);
        throwIfNotFound(query, 'Query', req.params.id);
        const updatedQuery = await service.updateQuery(req.params.id, {
            status: 'completed'
        });
        if (!updatedQuery) {
            throw new NotFoundError('Query', req.params.id);
        }
        res.json(mapQueryToDto(updatedQuery));
    })
);

// Get all completed queries
router.get('/completed', asyncHandler(async (req: Request, res: Response) => {
    const { limit, skip, page } = parsePaginationParams(req.query, { maxLimit: 1000 });
    const service = await getQueryService();
    const [queries, total] = await Promise.all([
        service.getAllQueries({ limit, skip, status: 'completed' }),
        Query.count({ status: 'completed' })
    ]);
    const response = createPaginatedResponse(queries.map(mapQueryToDto), total, limit, page, skip);
    res.json(response);
}));

// Duplicate a query (create a new query based on an existing one) (requires resource authorization)
router.post('/:id/duplicate',
    requireResourceAuthorization('query', 'id', 'view'),
    asyncHandler(async (req: Request, res: Response) => {
        const service = await getQueryService();
        const originalQuery = await service.getQueryById(req.params.id);
        throwIfNotFound(originalQuery, 'Query', req.params.id);

        // Allow optional modifications in request body
        const modifications = req.body || {};
        // Ensure duplicated query is owned by current user
        const duplicatedQuery = await service.duplicateQuery(req.params.id, {
            ...modifications,
            createdBy: req.user?.userId || modifications.createdBy,
        });
        res.status(201).json(mapQueryToDto(duplicatedQuery));
    })
);

// Get query progress (requires resource authorization)
router.get('/:id/progress',
    requireResourceAuthorization('query', 'id', 'view'),
    asyncHandler(async (req: Request, res: Response) => {
        // Import dynamically to avoid circular dependencies if any
        const { getProgressService } = await import('../services/progress/ProgressService.js');
        const progressService = getProgressService();

        // Get all jobs for this query
        const progressList = await progressService.getProgressForQuery(req.params.id);

        // Aggregate progress (simple implementation for now)
        // If there are multiple jobs, we take the one that is most relevant or latest
        // For now, let's assume if any job is running, we return its status

        const activeJob = progressList.find(p => ['pending', 'processing'].includes(p.status));
        const latestJob = progressList[0]; // Assuming they are sorted or we just take the first one

        const effectiveJob = activeJob || latestJob;

        if (!effectiveJob) {
            // No jobs found, check query status
            const service = await getQueryService();
            const query = await service.getQueryById(req.params.id);

            if (query && query.status === 'completed') {
                res.json({
                    queryId: req.params.id,
                    progress: 100,
                    status: 'completed',
                    startedAt: query.createdAt ? new Date(query.createdAt).getTime() : Date.now(),
                    lastUpdated: query.updatedAt ? new Date(query.updatedAt).getTime() : Date.now(),
                });
                return;
            }

            // Default empty/pending state
            res.json({
                queryId: req.params.id,
                progress: 0,
                status: 'analyzing', // Default start state
                startedAt: Date.now(),
                lastUpdated: Date.now(),
            });
            return;
        }

        // Map JobProgress to QueryProgress response expected by frontend
        res.json({
            queryId: req.params.id,
            progress: effectiveJob.progress,
            status: effectiveJob.status, // JobProgressStatus matches mostly (pending, processing, completed, failed)
            estimatedSecondsRemaining: undefined,
            currentStep: effectiveJob.currentStep,
            totalSteps: effectiveJob.totalSteps,
            startedAt: effectiveJob.createdAt ? new Date(effectiveJob.createdAt).getTime() : Date.now(),
            lastUpdated: effectiveJob.updatedAt ? new Date(effectiveJob.updatedAt).getTime() : Date.now(),
            error: effectiveJob.error,
        });
    })
);

export default router;
