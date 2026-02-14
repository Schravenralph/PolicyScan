/**
 * Knowledge Graph Service Manager
 * Handles lazy initialization of optional services based on feature flags
 */

import { Driver } from 'neo4j-driver';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';
import { GraphTraversalService } from '../../graphrag/GraphTraversalService.js';
import { HierarchicalStructureService } from '../legal/HierarchicalStructureService.js';
import { DocumentDependencyTracker } from '../legal/DocumentDependencyTracker.js';
import { OntologyAlignmentService } from '../legal/OntologyAlignmentService.js';
import { ImpactAnalysisService } from '../legal/ImpactAnalysisService.js';
import { EntityVersioningService } from '../maintenance/EntityVersioningService.js';
import { TemporalQueryService } from '../maintenance/TemporalQueryService.js';
import { TruthDiscoveryService } from '../fusion/TruthDiscoveryService.js';
import { CypherQueryService } from './CypherQueryService.js';
import { GraphInferenceEngine } from '../inference/GraphInferenceEngine.js';
import { KnowledgeGraphPersistence, PersistenceOptions } from './KnowledgeGraphPersistence.js';
import type { BaseEntity, EntityType } from '../../../domain/ontology.js';

/**
 * Service getter functions for services that need access to KnowledgeGraph methods
 */
export interface KnowledgeGraphServiceDependencies {
    getNode: (id: string) => Promise<BaseEntity | undefined>;
    getNodesByType: (type: EntityType) => Promise<BaseEntity[]>;
    addNode: (entity: BaseEntity) => Promise<void>;
}

/**
 * Service Manager for Knowledge Graph optional services
 */
export class KnowledgeGraphServiceManager {
    private traversalService: GraphTraversalService | null = null;
    private hierarchicalStructureService: HierarchicalStructureService | null = null;
    private documentDependencyTracker: DocumentDependencyTracker | null = null;
    private ontologyAlignmentService: OntologyAlignmentService | null = null;
    private impactAnalysisService: ImpactAnalysisService | null = null;
    private versioningService: EntityVersioningService | null = null;
    private temporalQueryService: TemporalQueryService | null = null;
    private truthDiscoveryService: TruthDiscoveryService | null = null;
    private cypherQueryService: CypherQueryService | null = null;
    private inferenceEngine: GraphInferenceEngine | null = null;

    constructor(
        private driver: Driver,
        private dependencies: KnowledgeGraphServiceDependencies
    ) {}

    /**
     * Get or initialize the traversal service
     */
    getTraversalService(): GraphTraversalService | null {
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_TRAVERSAL_ENABLED, false)) {
            return null;
        }
        if (!this.traversalService) {
            // Initialize with driver only (vector service can be added if needed for relevance scoring)
            // Cache configuration from environment or defaults
            const cacheMaxSize = parseInt(process.env.KG_TRAVERSAL_CACHE_MAX_SIZE || '1000', 10);
            const cacheTTL = parseInt(process.env.KG_TRAVERSAL_CACHE_TTL || '3600000', 10); // 1 hour default
            this.traversalService = new GraphTraversalService(this.driver, undefined, {
                maxSize: cacheMaxSize,
                defaultTTL: cacheTTL,
            });
        }
        return this.traversalService;
    }

    /**
     * Get or initialize the hierarchical structure service
     */
    getHierarchicalStructureService(): HierarchicalStructureService | null {
        // Check master flag first
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED, false)) {
            return null;
        }
        // Then check specific flag
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_HIERARCHICAL_STRUCTURE_ENABLED, false)) {
            return null;
        }
        if (!this.hierarchicalStructureService) {
            this.hierarchicalStructureService = new HierarchicalStructureService(this.driver);
        }
        return this.hierarchicalStructureService;
    }

    /**
     * Get or initialize the document dependency tracker
     */
    getDocumentDependencyTracker(): DocumentDependencyTracker | null {
        // Check master flag first
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED, false)) {
            return null;
        }
        // Then check specific flag
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_DOCUMENT_DEPENDENCIES_ENABLED, false)) {
            return null;
        }
        if (!this.documentDependencyTracker) {
            this.documentDependencyTracker = new DocumentDependencyTracker(this.driver);
        }
        return this.documentDependencyTracker;
    }

    /**
     * Get or initialize the ontology alignment service
     */
    getOntologyAlignmentService(): OntologyAlignmentService | null {
        // Check master flag first
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED, false)) {
            return null;
        }
        // Then check specific flag
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_ONTOLOGY_ALIGNMENT_ENABLED, false)) {
            return null;
        }
        if (!this.ontologyAlignmentService) {
            this.ontologyAlignmentService = new OntologyAlignmentService();
        }
        return this.ontologyAlignmentService;
    }

    /**
     * Get or initialize the impact analysis service
     */
    getImpactAnalysisService(): ImpactAnalysisService | null {
        // Check master flag first
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED, false)) {
            return null;
        }
        // Then check specific flag (uses document dependencies flag)
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_DOCUMENT_DEPENDENCIES_ENABLED, false)) {
            return null;
        }
        if (!this.impactAnalysisService) {
            this.impactAnalysisService = new ImpactAnalysisService(this.driver);
        }
        return this.impactAnalysisService;
    }

    /**
     * Get or initialize the versioning service
     */
    getVersioningService(): EntityVersioningService | null {
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_ENTITY_VERSIONING_ENABLED, false)) {
            return null;
        }
        if (!this.versioningService) {
            this.versioningService = new EntityVersioningService(this.driver);
        }
        return this.versioningService;
    }

    /**
     * Get or initialize temporal query service
     */
    getTemporalQueryService(): TemporalQueryService | null {
        // Check master flag first
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED, false)) {
            return null;
        }
        // Then check specific flag
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_TEMPORAL_QUERIES_ENABLED, false)) {
            return null;
        }
        if (!this.temporalQueryService) {
            const versioningService = this.getVersioningService();
            if (!versioningService) {
                return null;
            }
            this.temporalQueryService = new TemporalQueryService(this.driver, versioningService);
        }
        return this.temporalQueryService;
    }

    /**
     * Get or initialize truth discovery service
     */
    getTruthDiscoveryService(): TruthDiscoveryService | null {
        if (!FeatureFlag.isTruthDiscoveryEnabled()) {
            return null;
        }

        if (!this.truthDiscoveryService) {
            this.truthDiscoveryService = new TruthDiscoveryService(
                async (id: string) => this.dependencies.getNode(id),
                async (type: string) => this.dependencies.getNodesByType(type as EntityType),
                async (entity: BaseEntity) => this.dependencies.addNode(entity) // Update by re-adding
            );
        }

        return this.truthDiscoveryService;
    }

    /**
     * Get or initialize Cypher query service
     */
    getCypherQueryService(): CypherQueryService {
        if (!this.cypherQueryService) {
            this.cypherQueryService = new CypherQueryService(this.driver);
        }
        return this.cypherQueryService;
    }

    /**
     * Get or initialize inference engine
     */
    getInferenceEngine(): GraphInferenceEngine | null {
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_REASONING_ENABLED, false)) {
            return null;
        }
        if (!this.inferenceEngine) {
            this.inferenceEngine = new GraphInferenceEngine(this.driver);
        }
        return this.inferenceEngine;
    }

    /**
     * Get or initialize persistence layer
     */
    getPersistence(options?: PersistenceOptions): KnowledgeGraphPersistence {
        // Persistence is managed separately in KnowledgeGraph, so this is just a helper
        // The actual persistence instance is created in the constructor if options are provided
        return new KnowledgeGraphPersistence(this.driver, options);
    }
}


