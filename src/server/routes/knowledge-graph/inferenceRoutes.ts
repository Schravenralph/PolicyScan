import express, { Router } from 'express';
import { asyncHandler } from '../../utils/errorHandling.js';
import { BadRequestError, ServiceUnavailableError, NotFoundError } from '../../types/errors.js';
import { getFeatureFlagsService as defaultGetFeatureFlagsService, FeatureFlagsService } from '../../services/knowledge-graph/KnowledgeGraphFeatureFlags.js';
import { KGFeatureFlag } from '../../models/FeatureFlag.js';
import { InferenceOptions, InferenceRuleType } from '../../services/knowledge-graph/inference/GraphInferenceEngine.js';
import { KnowledgeGraphServiceType } from './shared/types.js';
import { BaseEntity, RelationType } from '../../domain/ontology.js';
import { getInferenceEngine } from './shared/services.js';

export function createInferenceRouter(
    getKGService: () => KnowledgeGraphServiceType,
    isGraphDB: () => boolean,
    getFeatureFlags: () => FeatureFlagsService = defaultGetFeatureFlagsService
): Router {
    const router = express.Router();

    // Helper function to check inference feature flag
    function checkInferenceEnabled(): boolean {
        try {
            const featureFlagsService = getFeatureFlags();
            return featureFlagsService.isEnabled(KGFeatureFlag.KG_REASONING_ENABLED, false);
        } catch (_error) {
            return false;
        }
    }

    // POST /api/knowledge-graph/inference/run
    // Run inference rules on the knowledge graph
    router.post('/inference/run', asyncHandler(async (req, res) => {
        if (!checkInferenceEnabled()) {
            throw new ServiceUnavailableError('Inference feature is disabled', {
                message: 'Enable KG_REASONING_ENABLED feature flag to use this endpoint'
            });
        }

        const { ruleTypes, maxDepth, minConfidence, storeResults, entityIds } = req.body;

        const kgService = getKGService();
        await kgService.initialize();

        const options: InferenceOptions = {};
        if (ruleTypes !== undefined) {
            if (!Array.isArray(ruleTypes)) {
                throw new BadRequestError('ruleTypes must be an array of: transitive, type-based, temporal, hierarchical, or all', {
                    received: { ruleTypesType: typeof ruleTypes, ruleTypesValue: ruleTypes }
                });
            }
            const validTypes: InferenceRuleType[] = ['transitive', 'type-based', 'temporal', 'hierarchical', 'all'];
            const invalidTypes = ruleTypes.filter((t: string) => !validTypes.includes(t as InferenceRuleType));
            if (invalidTypes.length > 0) {
                throw new BadRequestError(`Invalid rule types: ${invalidTypes.join(', ')}. Valid types are: ${validTypes.join(', ')}`, {
                    received: ruleTypes,
                    invalidTypes
                });
            }
            options.ruleTypes = ruleTypes as InferenceRuleType[];
        }

        if (maxDepth !== undefined) {
            if (typeof maxDepth !== 'number' || maxDepth < 1 || maxDepth > 10) {
                throw new BadRequestError('maxDepth must be a number between 1 and 10', {
                    received: maxDepth
                });
            }
            options.maxDepth = maxDepth;
        }

        if (minConfidence !== undefined) {
            if (typeof minConfidence !== 'number' || minConfidence < 0 || minConfidence > 1) {
                throw new BadRequestError('minConfidence must be a number between 0 and 1', {
                    received: minConfidence
                });
            }
            options.minConfidence = minConfidence;
        }

        if (storeResults !== undefined) {
            if (typeof storeResults !== 'boolean') {
                throw new BadRequestError('storeResults must be a boolean', {
                    received: { storeResultsType: typeof storeResults, storeResultsValue: storeResults }
                });
            }
            options.storeResults = storeResults;
        }

        if (entityIds !== undefined) {
            if (!Array.isArray(entityIds) || entityIds.length === 0) {
                throw new BadRequestError('entityIds must be a non-empty array of entity IDs', {
                    received: { entityIds: !!entityIds, isArray: Array.isArray(entityIds), length: entityIds?.length || 0 }
                });
            }
            options.entityIds = entityIds;
        }

        // Get inference engine (GraphDB or Neo4j based on backend)
        const inferenceEngine = await getInferenceEngine(getKGService, isGraphDB);
        if (!inferenceEngine) {
            throw new ServiceUnavailableError('Inference engine is not available', {
                message: 'Inference engine could not be initialized. Check backend configuration.'
            });
        }

        // Use inference engine directly or via KG service
        let result;
        if (isGraphDB()) {
            // GraphDB: Use KG service's runInference method
            const graphDBService = kgService as import('../../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService;
            result = await graphDBService.runInference(options);
        } else {
            // Neo4j: Use KG service's runInference method
            const neo4jService = kgService as import('../../services/knowledge-graph/core/KnowledgeGraph.js').KnowledgeGraphService;
            result = await neo4jService.runInference(options);
        }

        res.json({
            success: true,
            ...result,
            summary: {
                relationshipsInferred: result.relationshipsInferred,
                propertiesInferred: result.propertiesInferred,
                executionTime: `${result.executionTime}ms`,
                averageConfidence: result.relationships.length > 0
                    ? result.relationships.reduce((sum: number, r: { inference: { confidence: number } }) => sum + r.inference.confidence, 0) / result.relationships.length
                    : 0,
            },
        });
    }));

    // GET /api/knowledge-graph/entity/:id/inference
    // Query an entity including inferred relationships
    // Note: GraphDB inference not yet implemented
    // Note: This endpoint is mounted at / (as part of inferenceRouter) but handled here.
    // Ideally should be /inference/entity/:id or similar, but preserving API compatibility.
    // WAIT: The plan said "router.use('/inference', createInferenceRouter...)".
    // So this route would become /inference/entity/:id/inference.
    // The original route was /entity/:id/inference.
    // So I should mount it at / and use the full path, OR change the mounting strategy.
    // The plan said: "router.use('/', createInferenceRouter(getKGService, isGraphDB));" in the corrected Step 4.
    // So I will use the full path /entity/:id/inference here.

    router.get('/entity/:id/inference', asyncHandler(async (req, res) => {
        if (!checkInferenceEnabled()) {
            throw new ServiceUnavailableError('Inference feature is disabled', {
                message: 'Enable KG_REASONING_ENABLED feature flag to use this endpoint'
            });
        }

        const { id } = req.params;
        const { includeInferred } = req.query;

        const kgService = getKGService();
        await kgService.initialize();

        // Check if entity exists
        const entity = await kgService.getNode(id);
        if (!entity) {
            throw new NotFoundError('Entity', id);
        }

        const shouldIncludeInferred = includeInferred !== 'false'; // Default to true

        // Use KG service's queryEntityWithInference method (works for both GraphDB and Neo4j)
        let result;
        if (isGraphDB()) {
            // GraphDB: Use KG service's queryEntityWithInference method
            const graphDBService = kgService as import('../../services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService;
            result = await graphDBService.queryEntityWithInference(id, shouldIncludeInferred);
        } else {
            // Neo4j: Use KG service's queryEntityWithInference method
            const neo4jService = kgService as import('../../services/knowledge-graph/core/KnowledgeGraph.js').KnowledgeGraphService;
            result = await neo4jService.queryEntityWithInference(id, shouldIncludeInferred);
        }

        // Separate explicit and inferred relationships for clarity
        const explicitRelationships = result.relationships.filter((r: { inferred: boolean }) => !r.inferred);
        const inferredRelationships = result.relationships.filter((r: { inferred: boolean }) => r.inferred);

        res.json({
            success: true,
            entity: {
                id: result.entity.id,
                type: result.entity.type,
                name: result.entity.name,
                description: result.entity.description,
                uri: result.entity.uri,
            },
            relationships: {
                total: result.relationships.length,
                explicit: explicitRelationships.length,
                inferred: inferredRelationships.length,
                all: result.relationships.map((r: { target: BaseEntity; type: RelationType; inferred: boolean; confidence?: number }) => ({
                    target: {
                        id: r.target.id,
                        type: r.target.type,
                        name: r.target.name,
                    },
                    type: r.type,
                    inferred: r.inferred,
                    confidence: r.confidence ?? undefined,
                })),
            },
            metadata: {
                entityId: id,
                includeInferred: shouldIncludeInferred,
            },
        });
    }));

    return router;
}
