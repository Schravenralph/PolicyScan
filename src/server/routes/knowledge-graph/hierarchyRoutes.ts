import express, { Router } from 'express';
import { asyncHandler } from '../../utils/errorHandling.js';
import { BadRequestError, ServiceUnavailableError, NotFoundError } from '../../types/errors.js';
import { getFeatureFlagsService } from '../../services/knowledge-graph/KnowledgeGraphFeatureFlags.js';
import { KGFeatureFlag } from '../../models/FeatureFlag.js';
import { HierarchyLevel } from '../../domain/ontology.js';
import { HierarchicalQueryOptions } from '../../services/knowledge-graph/legal/HierarchicalStructureService.js';
import { KnowledgeGraphService } from '../../services/knowledge-graph/core/KnowledgeGraph.js';

export function createHierarchyRouter(
    getKGService: () => KnowledgeGraphService | import('../../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService,
    isGraphDB: () => boolean
): Router {
    const router = express.Router();

    // Helper function to check hierarchical structure feature flag
    function checkHierarchicalStructureEnabled(): boolean {
        try {
            const featureFlagsService = getFeatureFlagsService();
            return featureFlagsService.isEnabled(KGFeatureFlag.KG_HIERARCHICAL_STRUCTURE_ENABLED, false);
        } catch (_error) {
            return false;
        }
    }

    // GET /jurisdiction/:id/regulations
    // Get regulations in jurisdiction and parent jurisdictions
    // GraphDB backend
    router.get('/jurisdiction/:id/regulations', asyncHandler(async (req, res) => {
        if (isGraphDB()) {
            throw new BadRequestError('Hierarchy features are not supported with GraphDB backend', { error: 'GraphDB backend not supported' });
        }

        if (!checkHierarchicalStructureEnabled()) {
            throw new ServiceUnavailableError(
                'Enable KG_HIERARCHICAL_STRUCTURE_ENABLED feature flag to use this endpoint',
                { error: 'Hierarchical structure feature is disabled' }
            );
        }

        const { id } = req.params;
        const { includeChildren, includeParents, maxDepth, levelFilter } = req.query;

        const kgService = getKGService();
        await kgService.initialize();

        const parsedMaxDepth = maxDepth ? parseInt(maxDepth as string, 10) : undefined;

        const options: HierarchicalQueryOptions = {
            includeChildren: includeChildren === 'true',
            includeParents: includeParents !== 'false', // Default to true
            maxDepth: parsedMaxDepth !== undefined && !isNaN(parsedMaxDepth) ? parsedMaxDepth : undefined,
            levelFilter: levelFilter ? (levelFilter as string).split(',') as HierarchyLevel[] : undefined,
        };

        const regulations = await (kgService as KnowledgeGraphService).findRegulationsInJurisdictionAndParents(id, options);

        res.json({
            success: true,
            jurisdictionId: id,
            regulations,
            count: regulations.length,
        });
    }));

    // GET /jurisdiction/:id/children
    // Get child jurisdictions
    // GraphDB backend
    router.get('/jurisdiction/:id/children', asyncHandler(async (req, res) => {
        if (isGraphDB()) {
            throw new BadRequestError('Hierarchy features are not supported with GraphDB backend', { error: 'GraphDB backend not supported' });
        }

        if (!checkHierarchicalStructureEnabled()) {
            throw new ServiceUnavailableError(
                'Enable KG_HIERARCHICAL_STRUCTURE_ENABLED feature flag to use this endpoint',
                { error: 'Hierarchical structure feature is disabled' }
            );
        }

        const { id } = req.params;
        const { maxDepth, levelFilter } = req.query;

        const kgService = getKGService();
        await kgService.initialize();

        const parsedMaxDepth = maxDepth ? parseInt(maxDepth as string, 10) : undefined;

        const options = {
            maxDepth: parsedMaxDepth !== undefined && !isNaN(parsedMaxDepth) ? parsedMaxDepth : undefined,
            levelFilter: levelFilter ? (levelFilter as string).split(',') as HierarchyLevel[] : undefined,
        };

        const children = await (kgService as KnowledgeGraphService).findChildJurisdictions(id, options);

        res.json({
            success: true,
            jurisdictionId: id,
            children,
            count: children.length,
        });
    }));

    // GET /level/:level
    // Get regulations at specific hierarchy level
    // GraphDB backend
    router.get('/level/:level', asyncHandler(async (req, res) => {
        if (isGraphDB()) {
            throw new BadRequestError('Hierarchy features are not supported with GraphDB backend', { error: 'GraphDB backend not supported' });
        }

        if (!checkHierarchicalStructureEnabled()) {
            throw new ServiceUnavailableError(
                'Enable KG_HIERARCHICAL_STRUCTURE_ENABLED feature flag to use this endpoint',
                { error: 'Hierarchical structure feature is disabled' }
            );
        }

        const { level } = req.params;

        if (!['municipality', 'province', 'national', 'european'].includes(level)) {
            throw new BadRequestError('Level must be one of: municipality, province, national, european', {
                error: 'Invalid hierarchy level'
            });
        }

        const kgService = getKGService();
        await kgService.initialize();

        const regulations = await (kgService as KnowledgeGraphService).findRegulationsAtLevel(level as HierarchyLevel);

        res.json({
            success: true,
            level,
            regulations,
            count: regulations.length,
        });
    }));

    // GET /jurisdiction/:id/subtree
    // Get jurisdiction subtree
    // GraphDB backend
    router.get('/jurisdiction/:id/subtree', asyncHandler(async (req, res) => {
        if (isGraphDB()) {
            throw new BadRequestError('Hierarchy features are not supported with GraphDB backend', { error: 'GraphDB backend not supported' });
        }

        if (!checkHierarchicalStructureEnabled()) {
            throw new ServiceUnavailableError(
                'Enable KG_HIERARCHICAL_STRUCTURE_ENABLED feature flag to use this endpoint',
                { error: 'Hierarchical structure feature is disabled' }
            );
        }

        const { id } = req.params;
        const { includeChildren, includeParents, maxDepth, levelFilter } = req.query;

        const kgService = getKGService();
        await kgService.initialize();

        const parsedMaxDepth = maxDepth ? parseInt(maxDepth as string, 10) : undefined;

        const options = {
            includeChildren: includeChildren !== 'false', // Default to true
            includeParents: includeParents !== 'false', // Default to true
            maxDepth: parsedMaxDepth !== undefined && !isNaN(parsedMaxDepth) ? parsedMaxDepth : undefined,
            levelFilter: levelFilter ? (levelFilter as string).split(',') as HierarchyLevel[] : undefined,
        };

        const subtree = await (kgService as KnowledgeGraphService).findJurisdictionSubtree(id, options);

        if (!subtree) {
            throw new NotFoundError('Jurisdiction', id);
        }

        res.json({
            success: true,
            jurisdictionId: id,
            subtree,
        });
    }));

    // POST /jurisdiction/:id/update
    // Update hierarchy for entity
    // GraphDB backend
    router.post('/jurisdiction/:id/update', asyncHandler(async (req, res) => {
        if (isGraphDB()) {
            throw new BadRequestError('Hierarchy features are not supported with GraphDB backend', { error: 'GraphDB backend not supported' });
        }

        if (!checkHierarchicalStructureEnabled()) {
            throw new ServiceUnavailableError(
                'Enable KG_HIERARCHICAL_STRUCTURE_ENABLED feature flag to use this endpoint',
                { error: 'Hierarchical structure feature is disabled' }
            );
        }

        const { id } = req.params;
        const { hierarchy } = req.body;

        if (!hierarchy || !hierarchy.level) {
            throw new BadRequestError('Hierarchy object with level is required', {
                error: 'Invalid hierarchy data'
            });
        }

        // Validate hierarchy level
        const validLevels = ['municipality', 'province', 'national', 'european'];
        if (!validLevels.includes(hierarchy.level)) {
            throw new BadRequestError(`Level must be one of: ${validLevels.join(', ')}`, {
                error: 'Invalid hierarchy level'
            });
        }

        const kgService = getKGService();
        await kgService.initialize();

        // Check if entity exists
        const entity = await kgService.getNode(id);
        if (!entity) {
            throw new NotFoundError('Entity', id);
        }

        // Update hierarchy
        await (kgService as KnowledgeGraphService).updateHierarchy(id, hierarchy);

        res.json({
            success: true,
            entityId: id,
            hierarchy,
            message: 'Hierarchy updated successfully',
        });
    }));

    // GET /validate/:id
    // Validate hierarchy for entity
    // GraphDB backend
    router.get('/validate/:id', asyncHandler(async (req, res) => {
        if (isGraphDB()) {
            throw new BadRequestError('Hierarchy features are not supported with GraphDB backend', { error: 'GraphDB backend not supported' });
        }

        if (!checkHierarchicalStructureEnabled()) {
            throw new ServiceUnavailableError(
                'Hierarchical structure feature is disabled',
                { message: 'Enable KG_HIERARCHICAL_STRUCTURE_ENABLED feature flag to use this endpoint' }
            );
        }

        const { id } = req.params;
        const { includeParent } = req.query;

        const kgService = getKGService();
        await kgService.initialize();

        const entity = await kgService.getNode(id);

        if (!entity) {
            throw new NotFoundError('Entity', id);
        }

        if (entity.type !== 'PolicyDocument') {
            throw new BadRequestError('Entity is not a PolicyDocument', {
                entityId: id,
                entityType: entity.type
            });
        }

        // Get parent entity if requested
        let parentEntity: import('../../domain/ontology.js').PolicyDocument | undefined;
        const policyDoc = entity as import('../../domain/ontology.js').PolicyDocument;
        if (includeParent === 'true' && policyDoc.hierarchy?.parentId) {
            const parent = await kgService.getNode(policyDoc.hierarchy.parentId);
            if (parent && parent.type === 'PolicyDocument') {
                parentEntity = parent as import('../../domain/ontology.js').PolicyDocument;
            }
        }

        // Validate hierarchy
        const validation = (kgService as KnowledgeGraphService).validateHierarchy(entity as import('../../domain/ontology.js').PolicyDocument, parentEntity);

        res.json({
            success: true,
            entityId: id,
            validation,
        });
    }));

    return router;
}
