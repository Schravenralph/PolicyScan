import express, { Router } from 'express';
import { asyncHandler } from '../../utils/errorHandling.js';
import { BadRequestError, ServiceUnavailableError } from '../../types/errors.js';
import { getFeatureFlagsService } from '../../services/knowledge-graph/KnowledgeGraphFeatureFlags.js';
import { KGFeatureFlag } from '../../models/FeatureFlag.js';
import { KnowledgeGraphService } from '../../services/knowledge-graph/core/KnowledgeGraph.js';

export function createDependencyRouter(
    getKGService: () => KnowledgeGraphService | import('../../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService,
    _isGraphDB: () => boolean
): Router {
    const router = express.Router();

    // Helper function to check document dependencies feature flag
    function checkDocumentDependenciesEnabled(): boolean {
        try {
            const featureFlagsService = getFeatureFlagsService();
            return featureFlagsService.isEnabled(KGFeatureFlag.KG_DOCUMENT_DEPENDENCIES_ENABLED, false);
        } catch (_error) {
            return false;
        }
    }

    // POST /extract
    // Extract dependencies from a document
    // GraphDB backend
    router.post('/extract', asyncHandler(async (req, res) => {
        if (!checkDocumentDependenciesEnabled()) {
            throw new ServiceUnavailableError(
                'Document dependency tracking feature is disabled',
                { message: 'Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to use this endpoint' }
            );
        }

        const { documentId, documentText, documentTitle } = req.body;

        if (!documentId || !documentText) {
            throw new BadRequestError('documentId and documentText are required', {
                received: { documentId: !!documentId, documentText: !!documentText }
            });
        }

        const kgService = getKGService();
        await kgService.initialize();

        const result = await kgService.extractDocumentDependencies(documentId, documentText, documentTitle);

        res.json({
            ...result,
        });
    }));

    // POST /store
    // Store dependencies in the knowledge graph
    // GraphDB backend
    router.post('/store', asyncHandler(async (req, res) => {
        if (!checkDocumentDependenciesEnabled()) {
            throw new ServiceUnavailableError(
                'Document dependency tracking feature is disabled',
                { message: 'Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to use this endpoint' }
            );
        }

        const { dependencies } = req.body;

        if (!dependencies || !Array.isArray(dependencies)) {
            throw new BadRequestError('dependencies array is required', {
                received: { dependencies: !!dependencies, isArray: Array.isArray(dependencies) }
            });
        }

        const kgService = getKGService();
        await kgService.initialize();

        const result = await kgService.storeDocumentDependencies(dependencies);

        res.json({
            success: true,
            ...result,
        });
    }));

    // GET /document/:id
    // Get dependencies for a document
    // GraphDB backend
    router.get('/document/:id', asyncHandler(async (req, res) => {
        if (!checkDocumentDependenciesEnabled()) {
            throw new ServiceUnavailableError(
                'Document dependency tracking feature is disabled',
                { message: 'Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to use this endpoint' }
            );
        }

        const { id } = req.params;

        const kgService = getKGService();
        await kgService.initialize();

        const result = await kgService.getDocumentDependencies(id);

        res.json({
            success: true,
            ...result,
        });
    }));

    // GET /validate
    // Validate dependency integrity
    // GraphDB backend
    router.get('/validate', asyncHandler(async (_req, res) => {
        if (!checkDocumentDependenciesEnabled()) {
            throw new ServiceUnavailableError(
                'Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to use this endpoint',
                { error: 'Document dependency tracking feature is disabled' }
            );
        }

        const kgService = getKGService();
        await kgService.initialize();

        const result = await kgService.validateDependencyIntegrity();

        res.json({
            success: true,
            ...result,
        });
    }));

    // GET /document/:id/impact
    // Analyze impact of document changes
    // GraphDB backend
    router.get('/document/:id/impact', asyncHandler(async (req, res) => {
        if (!checkDocumentDependenciesEnabled()) {
            throw new ServiceUnavailableError('Document dependency tracking feature is disabled', {
                message: 'Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to use this endpoint'
            });
        }

        const { id } = req.params;
        const { maxDepth } = req.query;

        const depth = maxDepth ? parseInt(maxDepth as string, 10) : 3;

        if (isNaN(depth) || depth < 1 || depth > 10) {
            throw new BadRequestError('maxDepth must be a number between 1 and 10', {
                received: maxDepth,
                parsed: depth
            });
        }

        const kgService = getKGService();
        await kgService.initialize();

        const result = await kgService.analyzeDocumentImpact(id, depth);

        res.json({
            success: true,
            ...result,
            documentId: id,
        });
    }));

    // GET /document/:id/impact-report
    // Generate impact report for a document
    // GraphDB backend
    router.get('/document/:id/impact-report', asyncHandler(async (req, res) => {
        if (!checkDocumentDependenciesEnabled()) {
            throw new ServiceUnavailableError(
                'Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to use this endpoint',
                { error: 'Document dependency tracking feature is disabled' }
            );
        }

        const { id } = req.params;
        const { maxDepth } = req.query;

        const depth = maxDepth ? parseInt(maxDepth as string, 10) : 3;

        if (isNaN(depth) || depth < 1 || depth > 10) {
            throw new BadRequestError('maxDepth must be a number between 1 and 10', {
                error: 'Invalid maxDepth parameter'
            });
        }

        const kgService = getKGService();
        await kgService.initialize();

        const result = await kgService.generateImpactReport(id, depth);

        res.json({
            success: true,
            ...result,
            documentId: id,
        });
    }));

    return router;
}
