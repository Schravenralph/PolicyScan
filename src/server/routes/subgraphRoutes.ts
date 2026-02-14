import express from 'express';
import { WorkflowSubgraphModel, type WorkflowSubgraphDocument } from '../models/WorkflowSubgraph.js';
import { NavigationGraph } from '../services/graphs/navigation/NavigationGraph.js';
import { getWorkflowOutputService } from '../services/workflow/WorkflowOutputService.js';
import { getWorkflowResultsConverter } from '../services/workflow/WorkflowResultsConverter.js';
import { parsePaginationParams, createPaginatedResponse } from '../utils/pagination.js';
import { asyncHandler, throwIfNotFound } from '../utils/errorHandling.js';
import { NotFoundError, BadRequestError } from '../types/errors.js';
import { sanitizeInput } from '../middleware/sanitize.js';

export function createSubgraphRouter(graph: NavigationGraph) {
    const router = express.Router();

    /**
     * GET /api/subgraphs
     * List all workflow subgraphs
     */
    router.get('/', asyncHandler(async (req, res) => {
        const { limit, skip, page } = parsePaginationParams(req.query, { 
            defaultLimit: 20, 
            maxLimit: 100 
        });
        const status = req.query.status as WorkflowSubgraphDocument['status'] | undefined;

        const result = await WorkflowSubgraphModel.list({ limit, skip, status });
        
        const response = createPaginatedResponse(
            result.subgraphs,
            result.total,
            limit,
            page,
            skip
        );
        
        res.json(response);
    }));

    /**
     * GET /api/subgraphs/current
     * Get the current active subgraph
     */
    router.get('/current', asyncHandler(async (_req, res) => {
        const current = await WorkflowSubgraphModel.getCurrent();
        throwIfNotFound(current, 'Active subgraph');
        res.json(current);
    }));

    /**
     * POST /api/subgraphs
     * Create a new workflow subgraph
     */
    router.post('/', sanitizeInput, asyncHandler(async (req, res) => {
        const { name, description, workflowId, runId, queryId, includedNodes, rootUrl, maxDepth } = req.body;

        if (!name) {
            throw new BadRequestError('Name is required');
        }

        const subgraph = await WorkflowSubgraphModel.create({
            name,
            description,
            workflowId,
            runId,
            queryId,
            includedNodes,
            rootUrl,
            maxDepth
        });

        res.status(201).json(subgraph);
    }));

    /**
     * POST /api/subgraphs/from-graph
     * Create a subgraph from the main navigation graph with filtering
     */
    router.post('/from-graph', sanitizeInput, asyncHandler(async (req, res) => {
        const { name, description, startNode, maxDepth = 3, maxNodes = 500, urlPattern, queryId } = req.body;
        
        if (!name) {
            throw new BadRequestError('Name is required');
        }

        // Get subgraph from main graph
        const subgraphData = await graph.getSubgraph({
            startNode,
            maxDepth,
            maxNodes
        });

        // Filter by URL pattern if provided
        let includedNodes = Object.keys(subgraphData.nodes);
        if (urlPattern) {
            const pattern = new RegExp(urlPattern);
            includedNodes = includedNodes.filter(url => pattern.test(url));
        }

        // Create the subgraph model
        const subgraph = await WorkflowSubgraphModel.create({
            name,
            description,
            queryId,
            includedNodes,
            rootUrl: startNode || subgraphData.rootUrl,
            maxDepth
        });

        res.status(201).json({
            subgraph,
            metadata: {
                totalNodesInGraph: subgraphData.metadata.totalNodesInGraph,
                nodesSelected: includedNodes.length,
                startNode: startNode || subgraphData.rootUrl
            }
        });
    }));

    /**
     * GET /api/subgraphs/:id
     * Get a specific subgraph
     */
    router.get('/:id', asyncHandler(async (req, res) => {
        const subgraph = await WorkflowSubgraphModel.findById(req.params.id);
        throwIfNotFound(subgraph, 'Subgraph', req.params.id);
        res.json(subgraph);
    }));

    /**
     * GET /api/subgraphs/:id/nodes
     * Get nodes with their data from the navigation graph
     */
    router.get('/:id/nodes', asyncHandler(async (req, res) => {
        const subgraph = await WorkflowSubgraphModel.findById(req.params.id);
        throwIfNotFound(subgraph, 'Subgraph', req.params.id);

        // Get node data for included nodes
        const foundNodes = await graph.getNodes(subgraph.includedNodes);

        // Create map for O(1) lookup
        const nodeMap = new Map(foundNodes.map(node => [node.url, node]));

        const nodes = subgraph.includedNodes.map((url: string) => {
            const node = nodeMap.get(url);
            if (!node) return { url, exists: false };

            // Check approval status
            const isApproved = subgraph.approvedEndpoints.some((e) => e.url === url);
            const isRejected = subgraph.rejectedEndpoints.some((e) => e.url === url);
            const status = isApproved ? 'approved' : isRejected ? 'rejected' : 'pending';

            return {
                url,
                exists: true,
                title: node.title,
                type: node.type,
                filePath: node.filePath,
                childCount: node.children?.length || 0,
                status,
            };
        });

        res.json({
            subgraphId: subgraph.id,
            name: subgraph.name,
            nodes,
            metadata: subgraph.metadata
        });
    }));

    /**
     * PATCH /api/subgraphs/:id
     * Update a subgraph
     */
    router.patch('/:id', sanitizeInput, asyncHandler(async (req, res) => {
        const { name, description, status } = req.body;
        const update: Partial<WorkflowSubgraphDocument> = {};
        if (name) update.name = name;
        if (description) update.description = description;
        if (status) update.status = status;

        const subgraph = await WorkflowSubgraphModel.update(req.params.id, update);
        throwIfNotFound(subgraph, 'Subgraph', req.params.id);
        res.json(subgraph);
    }));

    /**
     * POST /api/subgraphs/:id/nodes
     * Add nodes to the subgraph
     */
    router.post('/:id/nodes', sanitizeInput, asyncHandler(async (req, res) => {
        const { urls } = req.body;
        if (!urls || !Array.isArray(urls)) {
            throw new BadRequestError('urls array is required');
        }

        const subgraph = await WorkflowSubgraphModel.addNodes(req.params.id, urls);
        throwIfNotFound(subgraph, 'Subgraph', req.params.id);
        res.json(subgraph);
    }));

    /**
     * DELETE /api/subgraphs/:id/nodes
     * Remove nodes from the subgraph (exclude them)
     */
    router.delete('/:id/nodes', asyncHandler(async (req, res) => {
        const { urls } = req.body;
        if (!urls || !Array.isArray(urls)) {
            throw new BadRequestError('urls array is required');
        }

        const subgraph = await WorkflowSubgraphModel.excludeNodes(req.params.id, urls);
        throwIfNotFound(subgraph, 'Subgraph', req.params.id);
        res.json(subgraph);
    }));

    /**
     * POST /api/subgraphs/:id/endpoints/approve
     * Approve an endpoint in the subgraph
     */
    router.post('/:id/endpoints/approve', sanitizeInput, asyncHandler(async (req, res) => {
        const { url, title, type } = req.body;
        
        if (!url || !title) {
            throw new BadRequestError('url and title are required');
        }

        const userId = req.user?.userId;
        const subgraph = await WorkflowSubgraphModel.approveEndpoint(
            req.params.id,
            { url, title, type: type || 'unknown' },
            userId
        );

        throwIfNotFound(subgraph, 'Subgraph', req.params.id);
        res.json(subgraph);
    }));

    /**
     * POST /api/subgraphs/:id/endpoints/reject
     * Reject an endpoint in the subgraph
     */
    router.post('/:id/endpoints/reject', sanitizeInput, asyncHandler(async (req, res) => {
        const { url, title, reason } = req.body;
        
        if (!url || !title) {
            throw new BadRequestError('url and title are required');
        }

        const userId = req.user?.userId;
        const subgraph = await WorkflowSubgraphModel.rejectEndpoint(
            req.params.id,
            { url, title },
            reason,
            userId
        );

        throwIfNotFound(subgraph, 'Subgraph', req.params.id);
        res.json(subgraph);
    }));

    /**
     * POST /api/subgraphs/:id/endpoints/reset
     * Reset an endpoint to pending status
     */
    router.post('/:id/endpoints/reset', sanitizeInput, asyncHandler(async (req, res) => {
        const { url } = req.body;
        
        if (!url) {
            throw new BadRequestError('url is required');
        }

        const subgraph = await WorkflowSubgraphModel.resetEndpoint(req.params.id, url);
        throwIfNotFound(subgraph, 'Subgraph', req.params.id);
        res.json(subgraph);
    }));

    /**
     * POST /api/subgraphs/:id/activate
     * Activate a subgraph (make it the "current" one)
     */
    router.post('/:id/activate', asyncHandler(async (req, res) => {
        const subgraph = await WorkflowSubgraphModel.setStatus(req.params.id, 'active');
        throwIfNotFound(subgraph, 'Subgraph', req.params.id);
        res.json(subgraph);
    }));

    /**
     * POST /api/subgraphs/:id/archive
     * Archive a subgraph
     */
    router.post('/:id/archive', asyncHandler(async (req, res) => {
        const subgraph = await WorkflowSubgraphModel.setStatus(req.params.id, 'archived');
        throwIfNotFound(subgraph, 'Subgraph', req.params.id);
        res.json(subgraph);
    }));

    /**
     * DELETE /api/subgraphs/:id
     * Delete a subgraph
     */
    router.delete('/:id', asyncHandler(async (req, res) => {
        const success = await WorkflowSubgraphModel.delete(req.params.id);
        if (!success) {
            throw new NotFoundError('Subgraph', req.params.id);
        }
        res.json({ message: '[i18n:apiMessages.subgraphDeleted]' });
    }));

    /**
     * GET /api/subgraphs/by-query/:queryId
     * Get subgraphs for a specific query
     */
    router.get('/by-query/:queryId', asyncHandler(async (req, res) => {
        const subgraphs = await WorkflowSubgraphModel.findByQueryId(req.params.queryId);
        res.json(subgraphs);
    }));

    return router;
}

/**
 * Create routes for workflow outputs
 * @param outputService - Optional WorkflowOutputService instance (for testing)
 */
export function createOutputRouter(outputService?: import('../services/workflow/WorkflowOutputService.js').WorkflowOutputService) {
    const router = express.Router();

    /**
     * GET /api/workflow-outputs
     * List all workflow output files
     */
    router.get('/', asyncHandler(async (_req, res) => {
        const service = outputService || getWorkflowOutputService();
        const outputs = await service.listOutputs();
        res.json(outputs);
    }));

    /**
     * GET /api/workflow-outputs/:name
     * Get a specific workflow output
     */
    router.get('/:name', asyncHandler(async (req, res) => {
        const service = outputService || getWorkflowOutputService();
        const output = await service.loadOutput(req.params.name);
        throwIfNotFound(output, 'Output', req.params.name);
        res.json(output);
    }));

    /**
     * POST /api/workflow-outputs/:name/to-documents
     * Convert a workflow output to canonical documents for a query
     * (Returns legacy format for backward compatibility)
     */
    router.post('/:name/to-documents', sanitizeInput, asyncHandler(async (req, res) => {
        const { queryId } = req.body;
        
        if (!queryId) {
            throw new BadRequestError('queryId is required');
        }

        const service = outputService || getWorkflowOutputService();
        const output = await service.loadOutput(req.params.name);
        throwIfNotFound(output, 'Output', req.params.name);

        const converter = getWorkflowResultsConverter();
        const result = await converter.saveToDatabase(output, queryId);

        res.json({
            message: '[i18n:apiMessages.documentsCreated]',
            documentsCreated: result.documents.length,
            websitesCreated: result.websites.length,
            documents: result.documents,
            websites: result.websites
        });
    }));

    /**
     * GET /api/workflow-outputs/:name/search
     * Search within a workflow output
     * Query parameters:
     *   - q: Search query (required)
     *   - limit: Maximum number of results (optional)
     */
    router.get('/:name/search', asyncHandler(async (req, res) => {
        const { name } = req.params;
        const query = req.query.q as string;
        const limitParam = req.query.limit as string | undefined;

        if (!query) {
            throw new BadRequestError('Query parameter "q" is required');
        }

        const limit = limitParam ? parseInt(limitParam, 10) : undefined;
        if (limit !== undefined && (isNaN(limit) || limit < 1)) {
            throw new BadRequestError('Invalid limit parameter: must be a positive integer');
        }

        const service = outputService || getWorkflowOutputService();
        const result = await service.searchOutput(name, query, limit);

        res.json(result);
    }));

    /**
     * GET /api/workflow-outputs/:name/download/:format
     * Download a workflow output file in the specified format (json, md, txt)
     */
    router.get('/:name/download/:format', asyncHandler(async (req, res) => {
        const { name, format } = req.params;
        const service = outputService || getWorkflowOutputService();
        const outputs = await service.listOutputs();
        const output = outputs.find(o => o.name === name);

        throwIfNotFound(output, 'Output', name);

        let filePath: string;
        let contentType: string;
        let fileName: string;

        switch (format.toLowerCase()) {
            case 'json':
                filePath = output.jsonPath;
                contentType = 'application/json';
                fileName = `${name}.json`;
                break;
            case 'md':
            case 'markdown':
                if (!output.markdownPath) {
                    throw new NotFoundError('Markdown file for this output', name);
                }
                filePath = output.markdownPath;
                contentType = 'text/markdown';
                fileName = `${name}.md`;
                break;
            case 'txt':
            case 'text':
                if (!output.txtPath) {
                    throw new NotFoundError('Text file for this output', name);
                }
                filePath = output.txtPath;
                contentType = 'text/plain';
                fileName = `${name}.txt`;
                break;
            default:
                throw new BadRequestError('Invalid format. Use: json, md, or txt');
        }

        // Check if file exists
        const fs = await import('fs/promises');
        try {
            await fs.access(filePath);
        } catch {
            throw new NotFoundError('File', filePath);
        }

        // Log workflow output download for audit
        const { AuditLogService } = await import('../services/AuditLogService.js');
        const { logger } = await import('../utils/logger.js');
        AuditLogService.logDataAccess(
            req,
            'workflow',
            name,
            'download',
            {
                format,
                fileName,
                filePath,
            }
        ).catch((error) => {
            // Don't fail request if audit logging fails
            logger.error({ error, outputName: name }, 'Failed to log workflow output download audit event');
        });

        // Read and send file
        const fileContent = await fs.readFile(filePath, 'utf-8');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(fileContent);
    }));

    return router;
}
