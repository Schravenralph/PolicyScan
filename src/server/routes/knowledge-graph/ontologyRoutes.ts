import express, { Router } from 'express';
import { asyncHandler } from '../../utils/errorHandling.js';
import { BadRequestError, ServiceUnavailableError, NotFoundError } from '../../types/errors.js';
import { getFeatureFlagsService } from '../../services/knowledge-graph/KnowledgeGraphFeatureFlags.js';
import { KGFeatureFlag } from '../../models/FeatureFlag.js';
import { OntologyAlignmentService } from '../../services/knowledge-graph/legal/OntologyAlignmentService.js';
import { BaseEntity, EntityType } from '../../domain/ontology.js';
import { KnowledgeGraphService } from '../../services/knowledge-graph/core/KnowledgeGraph.js';

// GraphDB is the knowledge graph backend
type GraphDBKnowledgeGraphServiceType = import('../../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService;

// Initialize ontology alignment service (lazy initialization)
let ontologyAlignmentService: OntologyAlignmentService | null = null;
function getOntologyAlignmentService(): OntologyAlignmentService {
    if (!ontologyAlignmentService) {
        ontologyAlignmentService = new OntologyAlignmentService();
    }
    return ontologyAlignmentService;
}

export function createOntologyRouter(
    getKGService: () => KnowledgeGraphService | import('../../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService
): Router {
    const router = express.Router();

    // Helper function to check ontology alignment feature flag
    function checkOntologyAlignmentEnabled(): boolean {
        try {
            const featureFlagsService = getFeatureFlagsService();
            return featureFlagsService.isEnabled(KGFeatureFlag.KG_ONTOLOGY_ALIGNMENT_ENABLED, false);
        } catch (_error) {
            return false;
        }
    }

    // POST /align
    // Align entities with IMBOR and EuroVoc ontologies
    router.post('/align', asyncHandler(async (req, res) => {
        if (!checkOntologyAlignmentEnabled()) {
            throw new ServiceUnavailableError('Ontology alignment feature is disabled', {
                message: 'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint'
            });
        }

        const { entityIds, includeIMBOR, includeEuroVoc, minConfidence } = req.body;

        if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
            throw new BadRequestError('entityIds array is required and must not be empty', {
                received: { entityIds: !!entityIds, isArray: Array.isArray(entityIds), length: entityIds?.length || 0 }
            });
        }

        const kgService = getKGService() as GraphDBKnowledgeGraphServiceType;
        await kgService.initialize();

        // Fetch entities from knowledge graph
        const entities: BaseEntity[] = [];
        for (const entityId of entityIds) {
            const entity = await kgService.getNode(entityId);
            if (entity) {
                entities.push(entity);
            }
        }

        if (entities.length === 0) {
            throw new NotFoundError('Entities', entityIds.join(', '), {
                message: 'None of the provided entity IDs were found in the knowledge graph'
            });
        }

        // Align entities
        const alignmentService = getOntologyAlignmentService();
        if (!alignmentService.isEnabled()) {
            throw new ServiceUnavailableError('Ontology alignment service is disabled', {
                message: 'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint'
            });
        }

        const result = await alignmentService.alignEntities(entities, {
            includeIMBOR: includeIMBOR !== false,
            includeEuroVoc: includeEuroVoc !== false,
            minConfidence: minConfidence ?? 0.6,
            validateAlignments: true,
        });

        res.json({
            success: true,
            ...result,
        });
    }));

    // POST /align-entity/:id
    // Align a single entity with ontologies
    router.post('/align-entity/:id', asyncHandler(async (req, res) => {
        if (!checkOntologyAlignmentEnabled()) {
            throw new ServiceUnavailableError('Ontology alignment feature is disabled', {
                message: 'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint'
            });
        }

        const { id } = req.params;

        const kgService = getKGService();
        await kgService.initialize();

        const entity = await kgService.getNode(id);
        if (!entity) {
            throw new NotFoundError('Entity', id);
        }

        const alignmentService = getOntologyAlignmentService();
        const alignment = await alignmentService.alignEntity(entity);

        res.json({
            success: true,
            alignment,
        });
    }));

    // GET /query
    // Query entities by ontology term
    router.get('/query', asyncHandler(async (req, res) => {
        if (!checkOntologyAlignmentEnabled()) {
            throw new ServiceUnavailableError(
                'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint',
                { error: 'Ontology alignment feature is disabled' }
            );
        }

        const { term, ontology } = req.query;

        if (!term || typeof term !== 'string') {
            throw new BadRequestError('term parameter is required and must be a string', {
                error: 'Invalid term parameter'
            });
        }

        const ontologyType = (ontology as 'imbor' | 'eurovoc' | 'both') || 'both';
        if (!['imbor', 'eurovoc', 'both'].includes(ontologyType)) {
            throw new BadRequestError('ontology must be one of: imbor, eurovoc, both', {
                error: 'Invalid ontology parameter'
            });
        }

        // For now, we need alignments to query. In a full implementation,
        // alignments would be stored in the database.
        // This endpoint would typically query stored alignments.
        res.json({
            success: true,
            message: 'Query functionality requires stored alignments. Use POST /ontology/align first.',
            term,
            ontology: ontologyType,
        });
    }));

    // POST /query
    // Query entities by ontology term (IMBOR or EuroVoc)
    router.post('/query', asyncHandler(async (req, res) => {
        const { term, ontology, entityType } = req.body;

        if (!term || !ontology) {
            throw new BadRequestError('term and ontology are required', {
                received: { term: !!term, ontology: !!ontology }
            });
        }

        if (ontology !== 'IMBOR' && ontology !== 'EuroVoc') {
            throw new BadRequestError('ontology must be either "IMBOR" or "EuroVoc"', {
                received: ontology
            });
        }

        const kgService = getKGService() as GraphDBKnowledgeGraphServiceType;
        const alignmentService = getOntologyAlignmentService();

        // Get entities (optionally filtered by type)
        let entities;
        if (entityType) {
            entities = await kgService.getNodesByType(entityType);
        } else {
            entities = await kgService.getAllNodes();
        }

        const matchingEntities = await alignmentService.queryByOntologyTerm(term, ontology, entities);

        res.json({
            success: true,
            term,
            ontology,
            entityType: entityType || 'all',
            matchingEntities: matchingEntities.map(e => ({
                id: e.id,
                name: e.name,
                type: e.type,
            })),
            count: matchingEntities.length,
        });
    }));

    // POST /report
    // Generate alignment report
    router.post('/report', asyncHandler(async (req, res) => {
        if (!checkOntologyAlignmentEnabled()) {
            throw new ServiceUnavailableError('Ontology alignment feature is disabled', {
                message: 'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint'
            });
        }

        const { entityIds } = req.body;

        if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
            throw new BadRequestError('entityIds array is required and must not be empty', {
                received: { entityIds: !!entityIds, isArray: Array.isArray(entityIds), length: entityIds?.length || 0 }
            });
        }

        const kgService = getKGService();
        await kgService.initialize();

        // Fetch entities
        const entities: BaseEntity[] = [];
        for (const entityId of entityIds) {
            const entity = await kgService.getNode(entityId);
            if (entity) {
                entities.push(entity);
            }
        }

        if (entities.length === 0) {
            throw new NotFoundError('Entities', entityIds.join(', '));
        }

        // Align and generate report
        const alignmentService = getOntologyAlignmentService();
        if (!alignmentService.isEnabled()) {
            throw new ServiceUnavailableError('Ontology alignment feature is disabled', {
                message: 'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint'
            });
        }

        const report = await alignmentService.generateAlignmentReport(entities);

        res.json({
            success: true,
            ...report,
        });
    }));

    // GET /report
    // Generate alignment report for all entities or entities of a specific type
    router.get('/report', asyncHandler(async (req, res) => {
        const { entityType } = req.query;

        const kgService = getKGService() as GraphDBKnowledgeGraphServiceType;
        const alignmentService = getOntologyAlignmentService();

        // Get entities (optionally filtered by type)
        let entities;
        if (entityType) {
            entities = await kgService.getNodesByType(entityType as EntityType);
        } else {
            entities = await kgService.getAllNodes();
        }

        const report = await alignmentService.generateAlignmentReport(entities);

        res.json({
            success: true,
            entityType: entityType || 'all',
            ...report,
        });
    }));

    // POST /validate
    // Validate entity alignment
    router.post('/validate', asyncHandler(async (req, res) => {
        if (!checkOntologyAlignmentEnabled()) {
            throw new ServiceUnavailableError('Ontology alignment feature is disabled', {
                message: 'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint'
            });
        }

        const { entityId } = req.body;

        if (!entityId || typeof entityId !== 'string') {
            throw new BadRequestError('entityId is required and must be a string', {
                received: { entityIdType: typeof entityId, entityIdValue: entityId }
            });
        }

        const kgService = getKGService();
        await kgService.initialize();

        const entity = await kgService.getNode(entityId);
        if (!entity) {
            throw new NotFoundError('Entity', entityId);
        }

        const alignmentService = getOntologyAlignmentService();
        if (!alignmentService.isEnabled()) {
            throw new ServiceUnavailableError('Ontology alignment feature is disabled', {
                message: 'Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to use this endpoint'
            });
        }

        const alignment = await alignmentService.alignEntity(entity);

        res.json({
            success: true,
            entityId,
            alignment,
            needsReview: alignment.needsManualReview,
            confidence: alignment.overallConfidence,
        });
    }));

    // GET /entity/:id
    // Get ontology alignments for a specific entity
    router.get('/entity/:id', asyncHandler(async (req, res) => {
        const { id } = req.params;

        const kgService = getKGService() as GraphDBKnowledgeGraphServiceType;
        const alignmentService = getOntologyAlignmentService();

        const entity = await kgService.getNode(id);
        if (!entity) {
            throw new NotFoundError('Entity', id);
        }

        const alignment = await alignmentService.getEntityAlignments(id, entity);

        if (!alignment) {
            throw new BadRequestError('Ontology alignment not enabled', {
                message: 'Set KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to enable alignment'
            });
        }

        res.json({
            success: true,
            alignment,
        });
    }));

    // GET /review
    // Get entities needing manual review
    router.get('/review', asyncHandler(async (req, res) => {
        const { entityType } = req.query;

        const kgService = getKGService() as GraphDBKnowledgeGraphServiceType;
        const alignmentService = getOntologyAlignmentService();

        // Get entities (optionally filtered by type)
        let entities;
        if (entityType) {
            entities = await kgService.getNodesByType(entityType as EntityType);
        } else {
            entities = await kgService.getAllNodes();
        }

        const entitiesNeedingReview = await alignmentService.getEntitiesNeedingReview(entities);

        res.json({
            success: true,
            entityType: entityType || 'all',
            entitiesNeedingReview,
            count: entitiesNeedingReview.length,
        });
    }));

    return router;
}
