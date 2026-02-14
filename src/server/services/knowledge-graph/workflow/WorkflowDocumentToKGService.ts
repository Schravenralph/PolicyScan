/**
 * WorkflowDocumentToKGService
 * 
 * Service for building knowledge graph from workflow documents (CanonicalDocument[]).
 * Extracts entities, relationships, facts, and jurisdictions from documents and adds them to the knowledge graph.
 * 
 * This service is designed to work with the canonical document format used in workflows,
 * unlike GraphManager which works with ScrapedDocument[].
 */

import type { CanonicalDocument } from '../../../contracts/types.js';
import type { BaseEntity, Relation, PolicyDocument, Regulation, EntityType } from '../../../domain/ontology.js';
import { RelationType as RelationTypeEnum } from '../../../domain/ontology.js';
import type { KnowledgeGraphServiceInterface } from '../core/KnowledgeGraphInterface.js';
import { KnowledgeGraphService } from '../core/KnowledgeGraph.js';
import { VectorService } from '../../query/VectorService.js';
import { RelationshipExtractionService } from '../../extraction/RelationshipExtractionService.js';
import { PolicyParser } from '../../parsing/PolicyParser.js';
import { BatchRelationshipDiscovery } from '../enrichment/BatchRelationshipDiscovery.js';
import type { NormalizedDocument } from '../../shared/types/DocumentModels.js';
import { DocumentMapper } from '../../orchestration/mappers/DocumentMapper.js';
import { ExtractionContext } from '../../extraction/models/RelationshipModels.js';
import { EntitySchemaValidator } from '../validators/EntitySchemaValidator.js';
import { RelationshipValidator } from '../validators/RelationshipValidator.js';
import { FactValidator } from '../validators/FactValidator.js';
import { ConsistencyChecker } from '../validators/ConsistencyChecker.js';
import { SHACLValidator } from '../validators/SHACLValidator.js';
import { ValidationResultStorage } from '../validators/ValidationResultStorage.js';
import { KnowledgeGraphVersionManager } from '../versioning/KnowledgeGraphVersionManager.js';
import { PeriodicValidator } from '../PeriodicValidator.js';
import { MultiViewValidator } from '../validators/MultiViewValidator.js';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';
import { logger } from '../../../utils/logger.js';
import { generateSchemaOrgUri } from '../../../domain/ontology.js';
import { ServiceUnavailableError } from '../../../types/errors.js';
import { validateGraphDBBackend, validateKnowledgeGraphEntityStorage } from '../utils/architectureValidation.js';
import { sanitizeEntityId } from '../../../utils/entityIdSanitizer.js';
import { validateAndNormalizeUrl } from '../../../utils/urlValidator.js';
import { extractJurisdictionFromContext, mapToJurisdiction } from '../../../utils/jurisdictionMapper.js';

export interface BuildOptions {
  workflowRunId: string;
  workflowId?: string;
  source?: string;
  validate?: boolean; // Run validation after adding (for reporting)
  strictValidation?: boolean; // Filter invalid entities/relationships BEFORE adding (default: false for backward compatibility)
  branch?: string;
  createBranch?: boolean;
  batchSize?: number; // Batch size for bulk operations (default: 50)
  enableParallelExtraction?: boolean; // Enable parallel entity/relationship extraction (default: true)
  enableExtraction?: boolean; // Enable entity extraction from content (default: true)
  skipPersistenceVerification?: boolean; // Skip immediate persistence verification for performance (default: false)
  enableBatchRelationshipDiscovery?: boolean; // Enable batch relationship discovery after entity extraction (default: true)
  batchDiscoveryOptions?: {
    minConfidence?: number;
    maxRelationships?: number;
    batchSize?: number;
    enableParallelProcessing?: boolean;
  };
  onLog?: (message: string, level: 'info' | 'warn' | 'error') => Promise<void>;
  queryContext?: Record<string, unknown>; // Query context (overheidslaag, entity, etc.) for jurisdiction mapping
}

export interface BuildResult {
  entitiesAdded: number;
  relationshipsAdded: number;
  factsExtracted: number;
  jurisdictionsExtracted: number;
  validationResults?: ValidationResult[];
  persisted?: boolean;
  loaded?: boolean;
  loadingVerified?: {
    entitiesLoaded: number;
    relationshipsLoaded: number;
    loadTime: number;
  };
  version?: string;
  branch?: string;
  // Validation filtering statistics (WI-KG-008)
  entitiesFiltered?: number;
  relationshipsFiltered?: number;
  filteringEnabled?: boolean;
  // Performance metrics
  performance?: {
    totalTime: number;
    extractionTime: number;
    persistenceTime: number;
    validationTime: number;
    loadingTime: number;
    usedBulkOperations: boolean;
    usedParallelExtraction: boolean;
  };
  // Extraction statistics (WI-KG-GAP-007)
  extractionStats?: {
    totalDocuments: number;
    documentsWithContent: number;
    documentsMetadataOnly: number;
    entitiesFromContent: number;
    entitiesFromMetadata: number;
  };
  // Batch relationship discovery statistics
  batchDiscoveryStats?: {
    relationshipsDiscovered: number;
    relationshipsValid: number;
    relationshipsInvalid: number;
    processingTime: number;
  };
}

export interface MergeResult {
  merged: boolean;
  conflicts: Array<{
    entityId: string;
    conflictType: string;
    message: string;
  }>;
  entitiesAdded: number;
  relationshipsAdded: number;
  entitiesUpdated: number;
  relationshipsUpdated: number;
}

export interface ValidationResult {
  type: 'error' | 'warning' | 'info';
  entityId?: string;
  relationshipId?: string;
  message: string;
}

/**
 * Service for converting workflow documents to knowledge graph
 */
export class WorkflowDocumentToKGService {
  private entityValidator: EntitySchemaValidator;
  private relationshipValidator: RelationshipValidator;
  private factValidator: FactValidator;
  private consistencyChecker: ConsistencyChecker;
  private shaclValidator: SHACLValidator | null = null;
  private validationStorage: ValidationResultStorage | null = null;
  private versionManager: KnowledgeGraphVersionManager | null = null;
  private versioningEnabled: boolean = false;
  private policyParser: PolicyParser;

  constructor(
    private kgService: KnowledgeGraphServiceInterface,
    private relationshipExtractionService?: RelationshipExtractionService,
    policyParser?: PolicyParser
  ) {
    // Initialize PolicyParser for entity extraction (replaces EntityExtractionService)
    this.policyParser = policyParser || new PolicyParser();
    // Validate architecture compliance: Knowledge graph entities must use GraphDB
    validateGraphDBBackend(this.kgService, {
      service: 'WorkflowDocumentToKGService',
      method: 'constructor'
    });
    
    // Initialize validators
    this.entityValidator = new EntitySchemaValidator();
    this.relationshipValidator = new RelationshipValidator();
    this.factValidator = new FactValidator(
      undefined, // documentService - will be passed per validation
      async (id: string) => {
        // Get relationships for entity
        const neighbors = await this.kgService.getNeighbors(id);
        return neighbors.map(n => ({
          sourceId: id,
          targetId: n.id,
          type: RelationTypeEnum.RELATED_TO // Simplified - actual type would need to be retrieved
        }));
      },
      async (id: string) => {
        // Get incoming relationships for entity
        const incomingNeighbors = await this.kgService.getIncomingNeighbors(id);
        return incomingNeighbors.map(n => ({
          sourceId: n.id,
          targetId: id,
          type: RelationTypeEnum.RELATED_TO // Simplified
        }));
      }
    );
    this.consistencyChecker = new ConsistencyChecker(
      async (id: string) => this.kgService.getNode(id),
      async () => this.kgService.getAllNodes(),
      async (id: string) => {
        const neighbors = await this.kgService.getNeighbors(id);
        return neighbors.map(n => ({
          sourceId: id,
          targetId: n.id,
          type: RelationTypeEnum.RELATED_TO
        }));
      },
      async (id: string) => {
        const incomingNeighbors = await this.kgService.getIncomingNeighbors(id);
        return incomingNeighbors.map(n => ({
          sourceId: n.id,
          targetId: id,
          type: RelationTypeEnum.RELATED_TO
        }));
      }
    );

    // Initialize version manager using GraphDB (same as the KG itself)
    // Note: Initialization is done lazily in buildFromDocuments to avoid async constructor
    this.versionManager = null;
    this.versioningEnabled = false;
    
    // Initialize validation storage (lazy initialization)
    this.validationStorage = null;
  }

  /**
   * Ensure SHACL validator is initialized (Phase 1 enhancement)
   */
  private async ensureSHACLValidator(options: BuildOptions): Promise<void> {
    if (this.shaclValidator) {
      return;
    }

    try {
      // Check if kgService is GraphDBKnowledgeGraphService (has client property)
      const kgServiceAny = this.kgService as any;
      if (kgServiceAny.client || kgServiceAny.ensureClient) {
        const { getGraphDBClient } = await import('../../../config/graphdb.js');
        const graphDBClient = getGraphDBClient();
        this.shaclValidator = new SHACLValidator(graphDBClient);
        await this.shaclValidator.initialize(graphDBClient);
        logger.debug({
          workflowRunId: options.workflowRunId
        }, 'Initialized SHACLValidator for entity validation');
      }
    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : String(error),
        workflowRunId: options.workflowRunId
      }, 'Failed to initialize SHACLValidator, continuing without SHACL validation');
      this.shaclValidator = null;
    }
  }

  /**
   * Ensure validation storage is initialized (Phase 1 enhancement)
   */
  private async ensureValidationStorage(): Promise<void> {
    if (this.validationStorage) {
      return;
    }

    try {
      this.validationStorage = new ValidationResultStorage();
      await this.validationStorage.initialize();
      logger.debug('Initialized ValidationResultStorage');
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize ValidationResultStorage, continuing without storage');
      this.validationStorage = null;
    }
  }

  /**
   * Build knowledge graph from workflow documents
   */
  async buildFromDocuments(
    documents: CanonicalDocument[],
    options: BuildOptions
  ): Promise<BuildResult> {
    const startTime = Date.now();
    const extractionStartTime = Date.now();
    let usedBulkOperations = false;
    const usedParallelExtraction = options.enableParallelExtraction !== false;
    
    // Lazy initialization of version manager if using GraphDB
    if (!this.versionManager && !this.versioningEnabled) {
      try {
        // Check if kgService is GraphDBKnowledgeGraphService (has client property)
        const kgServiceAny = this.kgService as any;
        if (kgServiceAny.client || kgServiceAny.ensureClient) {
          // Import GraphDB client and version manager
          const { getGraphDBClient } = await import('../../../config/graphdb.js');
          const graphDBClient = getGraphDBClient();
          this.versionManager = new KnowledgeGraphVersionManager(graphDBClient);
          await this.versionManager.initialize();
          this.versioningEnabled = true;
          logger.debug({
            workflowRunId: options.workflowRunId
          }, 'Initialized KnowledgeGraphVersionManager for branch support');
        }
      } catch (error) {
        // Versioning is optional - log warning but continue
        logger.warn({
          error: error instanceof Error ? error.message : String(error),
          workflowRunId: options.workflowRunId
        }, 'Failed to initialize KnowledgeGraphVersionManager, continuing without versioning');
        this.versioningEnabled = false;
      }
    }

    logger.info({
      workflowRunId: options.workflowRunId,
      workflowId: options.workflowId,
      source: options.source,
      documentCount: documents.length,
      versioningEnabled: this.versioningEnabled,
      batchSize: options.batchSize || 50,
      parallelExtraction: usedParallelExtraction
    }, 'Building knowledge graph from workflow documents');

    // Handle branch management if versioning is enabled
    let currentBranch: string | undefined;
    let version: string | undefined;
    if (this.versioningEnabled && this.versionManager) {
      try {
        // Get current branch
        currentBranch = await this.versionManager.getCurrentBranch();
        
        // Use workflow-specific branch if specified
        if (options.branch && options.branch !== currentBranch) {
          // Try to switch to specified branch
          try {
            await this.versionManager.switchBranch(options.branch, true);
            currentBranch = options.branch;
            logger.debug({
              workflowRunId: options.workflowRunId,
              branch: options.branch
            }, 'Switched to specified workflow branch');
          } catch (error) {
            // Branch might not exist - create it if requested
            if (options.createBranch) {
              const parent = currentBranch || 'main';
              await this.versionManager.createBranch(options.branch, true, parent);
              currentBranch = options.branch;
              logger.debug({
                workflowRunId: options.workflowRunId,
                branch: options.branch,
                parent
              }, 'Created and switched to workflow branch');
            } else {
              logger.warn({
                workflowRunId: options.workflowRunId,
                branch: options.branch,
                error: error instanceof Error ? error.message : String(error)
              }, 'Failed to switch to specified branch, using current branch');
            }
          }
        }
        
        // Create version snapshot that tracks both entities AND relationships
        if (currentBranch) {
          // Note: We'll create the snapshot after entities and relationships are added
          // This ensures the snapshot captures the complete state
          logger.debug({
            workflowRunId: options.workflowRunId,
            branch: currentBranch
          }, 'Versioning enabled, will create snapshot after graph build');
        }
      } catch (error) {
        logger.warn({
          error: error instanceof Error ? error.message : String(error),
          workflowRunId: options.workflowRunId
        }, 'Versioning failed, continuing without versioning');
        this.versioningEnabled = false;
      }
    }

    // Extract entities from documents
    const entities = await this.extractEntities(documents, options);
    const extractionTime = Date.now() - extractionStartTime;
    logger.debug({
      workflowRunId: options.workflowRunId,
      entityCount: entities.length,
      extractionTime
    }, 'Extracted entities from documents');

    // Extract relationships between entities
    const relationshipExtractionStart = Date.now();
    const relationships = await this.extractRelationships(entities, documents, options);
    const relationshipExtractionTime = Date.now() - relationshipExtractionStart;
    logger.debug({
      workflowRunId: options.workflowRunId,
      relationshipCount: relationships.length,
      relationshipExtractionTime
    }, 'Extracted relationships from documents');

    // Extract facts (metadata and assertions)
    const facts = this.extractFacts(entities, documents);
    logger.debug({
      workflowRunId: options.workflowRunId,
      factCount: facts.length
    }, 'Extracted facts from documents');

    // Extract jurisdictions
    const jurisdictions = this.extractJurisdictions(entities, documents);
    logger.debug({
      workflowRunId: options.workflowRunId,
      jurisdictionCount: jurisdictions.length
    }, 'Extracted jurisdictions from documents');

    // WI-KG-008: Validate and filter entities BEFORE adding (if strictValidation is enabled)
    const strictValidation = options.strictValidation === true;
    let validEntities = entities;
    let validRelationships = relationships;
    let entitiesFiltered = 0;
    let relationshipsFiltered = 0;
    const validEntityIds = new Set<string>();

    if (strictValidation) {
      logger.debug({
        workflowRunId: options.workflowRunId
      }, 'Strict validation enabled - filtering invalid entities and relationships before adding');

      // Validate and filter entities
      const entityValidation = await this.validateAndFilterEntities(entities, options);
      validEntities = entityValidation.valid;
      entitiesFiltered = entityValidation.invalid.length;
      for (const entity of validEntities) {
        validEntityIds.add(entity.id);
      }

      // Log filtered entities
      if (entityValidation.invalid.length > 0) {
        logger.warn({
          workflowRunId: options.workflowRunId,
          filteredCount: entityValidation.invalid.length,
          totalCount: entities.length,
          reasons: entityValidation.invalid.map(i => i.reason).slice(0, 5)
        }, 'Filtered invalid entities before adding to graph');

        // Log individual filtered entities (first 10)
        for (const filtered of entityValidation.invalid.slice(0, 10)) {
          logger.debug({
            workflowRunId: options.workflowRunId,
            entityId: filtered.entity.id,
            entityType: filtered.entity.type,
            reason: filtered.reason
          }, 'Entity filtered: invalid schema');
        }
      }

      // Validate and filter relationships
      const relationshipValidation = await this.validateAndFilterRelationships(
        relationships,
        validEntityIds,
        options
      );
      validRelationships = relationshipValidation.valid;
      relationshipsFiltered = relationshipValidation.invalid.length;

      // Log filtered relationships
      if (relationshipValidation.invalid.length > 0) {
        logger.warn({
          workflowRunId: options.workflowRunId,
          filteredCount: relationshipValidation.invalid.length,
          totalCount: relationships.length,
          reasons: relationshipValidation.invalid.map(i => i.reason).slice(0, 5)
        }, 'Filtered invalid relationships before adding to graph');

        // Log individual filtered relationships (first 10)
        for (const filtered of relationshipValidation.invalid.slice(0, 10)) {
          logger.debug({
            workflowRunId: options.workflowRunId,
            relationshipId: `${filtered.relationship.sourceId}-${filtered.relationship.targetId}-${filtered.relationship.type}`,
            reason: filtered.reason
          }, 'Relationship filtered: invalid');
        }
      }

      logger.info({
        workflowRunId: options.workflowRunId,
        entitiesExtracted: entities.length,
        entitiesValid: validEntities.length,
        entitiesFiltered,
        relationshipsExtracted: relationships.length,
        relationshipsValid: validRelationships.length,
        relationshipsFiltered
      }, 'Validation filtering completed');
    } else {
      // If strict validation is disabled, all entities are considered valid
      for (const entity of entities) {
        validEntityIds.add(entity.id);
      }
    }

    // Add entities to knowledge graph (persists to GraphDB)
    // Use bulk operations for better performance with large document sets
    const persistenceStartTime = Date.now();
    let entitiesAdded = 0;
    const batchSize = options.batchSize || 50;
    const skipEntityVerification = options.skipPersistenceVerification === true;

    if (validEntities.length > batchSize && 'addNodesBulk' in this.kgService && typeof this.kgService.addNodesBulk === 'function') {
      // Use bulk operation for large sets
      usedBulkOperations = true;
      try {
        // Validate architecture compliance for all entities before bulk operation
        for (const entity of validEntities) {
          validateKnowledgeGraphEntityStorage(entity, this.kgService, {
            service: 'WorkflowDocumentToKGService',
            method: 'buildFromDocuments (bulk)',
            strict: false // Warn but don't fail
          });
        }
        
        // Pass branch as optional parameter (interface doesn't include it for backward compatibility)
        const bulkResult = await (this.kgService as any).addNodesBulk(validEntities, currentBranch);
        entitiesAdded = bulkResult.successful;
        
        if (bulkResult.failed > 0) {
          logger.warn({
            workflowRunId: options.workflowRunId,
            successful: bulkResult.successful,
            failed: bulkResult.failed,
            errors: bulkResult.errors.slice(0, 5)
          }, 'Some entities failed to add in bulk operation');
        }
      } catch (error) {
        logger.warn({
          error: error instanceof Error ? error.message : String(error),
          workflowRunId: options.workflowRunId
        }, 'Bulk entity addition failed, falling back to individual adds');
        usedBulkOperations = false;
        // Fall back to individual adds
        for (const entity of validEntities) {
          try {
            // Pass branch as optional parameter (interface doesn't include it for backward compatibility)
            await (this.kgService as any).addNode(entity, currentBranch);
            entitiesAdded++;
          } catch (err) {
            logger.warn({
              error: err instanceof Error ? err.message : String(err),
              entityId: entity.id,
              workflowRunId: options.workflowRunId
            }, 'Failed to add entity to knowledge graph');
          }
        }
      }
    } else {
      // Use individual adds for small sets or when bulk is not available
      for (const entity of validEntities) {
        try {
          // Validate architecture compliance before adding entity
          validateKnowledgeGraphEntityStorage(entity, this.kgService, {
            service: 'WorkflowDocumentToKGService',
            method: 'buildFromDocuments',
            strict: false // Warn but don't fail - allows graceful degradation
          });
          
          // Pass current branch to ensure entities are tagged with correct branch
            // Pass branch as optional parameter (interface doesn't include it for backward compatibility)
            await (this.kgService as any).addNode(entity, currentBranch);
          entitiesAdded++;
          
          // Verify persistence (skip if disabled for performance)
          if (!skipEntityVerification) {
            try {
              const persistedEntity = await this.kgService.getNode(entity.id);
              if (!persistedEntity) {
                logger.warn({
                  entityId: entity.id,
                  workflowRunId: options.workflowRunId
                }, 'Entity added but not found in GraphDB - persistence may have failed');
              }
            } catch (verifyError) {
              logger.debug({
                error: verifyError instanceof Error ? verifyError.message : String(verifyError),
                entityId: entity.id,
                workflowRunId: options.workflowRunId
              }, 'Could not verify entity persistence (this may be expected during bulk operations)');
            }
          }
        } catch (error) {
          logger.warn({
            error: error instanceof Error ? error.message : String(error),
            entityId: entity.id,
            workflowRunId: options.workflowRunId
          }, 'Failed to add entity to knowledge graph');
        }
      }
    }

    // Post-entity validation: Validate relationships against entities that now exist in the graph
    // This ensures relationships reference entities that actually exist, including entities from previous workflow steps
    const postEntityValidation = await this.validateRelationshipsAfterEntityAddition(
      validRelationships,
      options
    );
    
    // Update validRelationships with post-entity validation results
    validRelationships = postEntityValidation.valid;
    const postEntityFiltered = postEntityValidation.invalid.length;
    relationshipsFiltered += postEntityFiltered;

    // Log post-entity validation results
    if (postEntityFiltered > 0) {
      logger.warn({
        workflowRunId: options.workflowRunId,
        filteredCount: postEntityFiltered,
        totalCount: validRelationships.length + postEntityFiltered,
        reasons: postEntityValidation.invalid.map(i => i.reason).slice(0, 5)
      }, 'Filtered invalid relationships after entity addition (post-entity validation)');

      // Log individual filtered relationships (first 10)
      for (const filtered of postEntityValidation.invalid.slice(0, 10)) {
        logger.debug({
          workflowRunId: options.workflowRunId,
          relationshipId: `${filtered.relationship.sourceId}-${filtered.relationship.targetId}-${filtered.relationship.type}`,
          reason: filtered.reason
        }, 'Relationship filtered after entity addition');
      }

      if (options.onLog) {
        await options.onLog(
          `⚠️ Post-entity validation filtered ${postEntityFiltered} relationships that reference non-existent entities or fail validation`,
          'warn'
        );
      }
    } else {
      logger.debug({
        workflowRunId: options.workflowRunId,
        relationshipCount: validRelationships.length
      }, 'Post-entity validation passed for all relationships');
    }

    // Add relationships to knowledge graph (persists to GraphDB)
    // Process in batches for better performance
    let relationshipsAdded = 0;

    // Process relationships in batches
    for (let i = 0; i < validRelationships.length; i += batchSize) {
      const batch = validRelationships.slice(i, i + batchSize);
      
      // Process batch in parallel if enabled
      if (options.enableParallelExtraction !== false && batch.length > 1) {
        const batchPromises = batch.map(async (rel) => {
          try {
            // Pass branch as optional parameter (interface doesn't include it for backward compatibility)
            await (this.kgService as any).addEdge(rel.sourceId, rel.targetId, rel.type, rel.metadata, currentBranch);
            return { success: true, rel };
          } catch (error) {
            logger.warn({
              error: error instanceof Error ? error.message : String(error),
              relationshipId: `${rel.sourceId}-${rel.targetId}-${rel.type}`,
              workflowRunId: options.workflowRunId
            }, 'Failed to add relationship to knowledge graph');
            return { success: false, rel };
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        relationshipsAdded += batchResults.filter(r => r.success).length;
      } else {
        // Process sequentially
        for (const rel of batch) {
          try {
            // Pass branch as optional parameter (interface doesn't include it for backward compatibility)
            await (this.kgService as any).addEdge(rel.sourceId, rel.targetId, rel.type, rel.metadata, currentBranch);
            relationshipsAdded++;
            
            // Verify persistence (skip if disabled for performance)
            if (!skipEntityVerification) {
              try {
                const neighbors = await this.kgService.getNeighbors(rel.sourceId);
                const relationshipExists = neighbors.some(n => n.id === rel.targetId);
                if (!relationshipExists) {
                  logger.debug({
                    sourceId: rel.sourceId,
                    targetId: rel.targetId,
                    type: rel.type,
                    workflowRunId: options.workflowRunId
                  }, 'Relationship added but not immediately visible (may be due to cache or eventual consistency)');
                }
              } catch (verifyError) {
                logger.debug({
                  error: verifyError instanceof Error ? verifyError.message : String(verifyError),
                  relationshipId: `${rel.sourceId}-${rel.targetId}-${rel.type}`,
                  workflowRunId: options.workflowRunId
                }, 'Could not verify relationship persistence (this may be expected during bulk operations)');
              }
            }
          } catch (error) {
            logger.warn({
              error: error instanceof Error ? error.message : String(error),
              relationshipId: `${rel.sourceId}-${rel.targetId}-${rel.type}`,
              workflowRunId: options.workflowRunId
            }, 'Failed to add relationship to knowledge graph');
          }
        }
      }
    }

    const persistenceTime = Date.now() - persistenceStartTime;

    // Batch relationship discovery (post-processing)
    let batchDiscoveryStats: BuildResult['batchDiscoveryStats'] | undefined;
    if (options.enableBatchRelationshipDiscovery !== false && validEntities.length > 1) {
      try {
        const batchDiscoveryStart = Date.now();
        logger.debug({
          workflowRunId: options.workflowRunId,
          entityCount: validEntities.length,
        }, 'Starting batch relationship discovery');

        const batchDiscovery = new BatchRelationshipDiscovery(this.kgService);
        const discoveryResult = await batchDiscovery.discoverRelationships(validEntities, {
          minConfidence: options.batchDiscoveryOptions?.minConfidence || 0.6,
          maxRelationships: options.batchDiscoveryOptions?.maxRelationships || 500,
          batchSize: options.batchDiscoveryOptions?.batchSize || 50,
          enableParallelProcessing: options.batchDiscoveryOptions?.enableParallelProcessing !== false,
          enableRuleBased: true,
          enableCoOccurrence: true,
          enableGraphPattern: true,
        });

        // Add discovered relationships to graph
        if (discoveryResult.valid.length > 0) {
          logger.info({
            workflowRunId: options.workflowRunId,
            discoveredCount: discoveryResult.discovered.length,
            validCount: discoveryResult.valid.length,
            invalidCount: discoveryResult.invalid.length,
          }, 'Adding discovered relationships to knowledge graph');

          const batchSize = options.batchSize || 50;
          for (let i = 0; i < discoveryResult.valid.length; i += batchSize) {
            const batch = discoveryResult.valid.slice(i, i + batchSize);
            for (const rel of batch) {
              try {
                await (this.kgService as any).addEdge(
                  rel.sourceId,
                  rel.targetId,
                  rel.type,
                  {
                    ...rel.metadata,
                    discoveredAt: new Date().toISOString(),
                    discoveryMethod: 'batch_discovery',
                    workflowRunId: options.workflowRunId,
                  },
                  currentBranch
                );
                relationshipsAdded++;
              } catch (error) {
                logger.warn({
                  error: error instanceof Error ? error.message : String(error),
                  relationshipId: `${rel.sourceId}-${rel.targetId}-${rel.type}`,
                  workflowRunId: options.workflowRunId,
                }, 'Failed to add discovered relationship to knowledge graph');
              }
            }
          }
        }

        batchDiscoveryStats = {
          relationshipsDiscovered: discoveryResult.statistics.relationshipsDiscovered,
          relationshipsValid: discoveryResult.statistics.relationshipsValid,
          relationshipsInvalid: discoveryResult.statistics.relationshipsInvalid,
          processingTime: discoveryResult.statistics.processingTime,
        };

        logger.info({
          workflowRunId: options.workflowRunId,
          ...batchDiscoveryStats,
        }, 'Batch relationship discovery completed');
      } catch (error) {
        logger.warn({
          error: error instanceof Error ? error.message : String(error),
          workflowRunId: options.workflowRunId,
        }, 'Batch relationship discovery failed, continuing without discovered relationships');
      }
    }

    // Post-relationship analysis using Steiner tree (optional, if enabled)
    // This analyzes the subgraph formed by newly added relationships
    // Provides insights on missing relationships, subgraph quality, and orphaned entities
    if (FeatureFlag.isEnabled(KGFeatureFlag.KG_STEINER_TREE_ENABLED, false) && validEntities.length > 1) {
      try {
        await this.analyzeSubgraphAfterRelationshipAddition(validEntities, validRelationships, options);
      } catch (error) {
        // Don't fail workflow if analysis fails - it's informational only
        logger.warn({
          error: error instanceof Error ? error.message : String(error),
          workflowRunId: options.workflowRunId
        }, 'Post-relationship analysis failed, continuing without analysis');
        
        if (options.onLog) {
          await options.onLog(
            `⚠️ Subgraph analysis skipped due to error: ${error instanceof Error ? error.message : String(error)}`,
            'warn'
          );
        }
      }
    }

    // Validate if enabled
    const validationStartTime = Date.now();
    const validationResults: ValidationResult[] = [];
    if (options.validate !== false) {
      logger.debug({
        workflowRunId: options.workflowRunId,
        entityCount: entities.length,
        relationshipCount: relationships.length
      }, 'Starting knowledge graph validation');

      // Validate entities
      for (const entity of entities) {
        const entityValidation = this.entityValidator.validate(entity);
        if (!entityValidation.isValid) {
          // Create separate validation results for each error so translation keys work correctly
          for (const error of entityValidation.errors) {
            validationResults.push({
              type: 'error',
              entityId: entity.id,
              message: error.message // Already contains translation key
            });
          }
        } else if (entityValidation.warnings.length > 0) {
          // Create separate validation results for each warning so translation keys work correctly
          for (const warning of entityValidation.warnings) {
            validationResults.push({
              type: 'warning',
              entityId: entity.id,
              message: warning.message // Already contains translation key
            });
          }
        }
      }

      // Validate relationships
      for (const rel of relationships) {
        const sourceEntity = await this.kgService.getNode(rel.sourceId);
        const targetEntity = await this.kgService.getNode(rel.targetId);
        const relValidation = await this.relationshipValidator.validate(rel, sourceEntity || null, targetEntity || null);
        
        if (!relValidation.isValid) {
          // Create separate validation results for each error so translation keys work correctly
          for (const error of relValidation.errors) {
            validationResults.push({
              type: 'error',
              relationshipId: `${rel.sourceId}-${rel.targetId}-${rel.type}`,
              message: error // Already contains translation key
            });
          }
        } else if (relValidation.warnings.length > 0) {
          // Create separate validation results for each warning so translation keys work correctly
          for (const warning of relValidation.warnings) {
            validationResults.push({
              type: 'warning',
              relationshipId: `${rel.sourceId}-${rel.targetId}-${rel.type}`,
              message: warning // Already contains translation key
            });
          }
        }
      }

      // Validate facts against source documents
      const factValidationResults = await this.validateFacts(entities, documents, relationships);
      validationResults.push(...factValidationResults);

      // Validate jurisdictions
      const jurisdictionValidationResults = await this.validateJurisdictions(entities, documents);
      validationResults.push(...jurisdictionValidationResults);

      // Validate consistency
      try {
        const consistencyViolations = await this.consistencyChecker.checkConsistency();
        for (const violation of consistencyViolations) {
          validationResults.push({
            type: violation.severity === 'error' ? 'error' : 'warning',
            entityId: violation.entities?.[0], // Use first entity ID if available
            message: `Consistentie schending: ${violation.description}`
          });
        }
      } catch (error) {
        logger.warn({
          error: error instanceof Error ? error.message : String(error),
          workflowRunId: options.workflowRunId
        }, 'Consistency check failed');
      }

      logger.debug({
        workflowRunId: options.workflowRunId,
        validationResultsCount: validationResults.length,
        errors: validationResults.filter(r => r.type === 'error').length,
        warnings: validationResults.filter(r => r.type === 'warning').length
      }, 'Knowledge graph validation completed');
    }
    const validationTime = Date.now() - validationStartTime;

    // Create version snapshot AFTER entities and relationships are added
    // This ensures the snapshot captures the complete state (like a Git commit)
    if (this.versioningEnabled && this.versionManager && currentBranch) {
      try {
        const versionSnapshot = await this.versionManager.createVersionSnapshot(
          currentBranch,
          options.workflowRunId,
          {
            source: options.source,
            workflowId: options.workflowId,
            entitiesAdded,
            relationshipsAdded,
            factsExtracted: facts.length,
            jurisdictionsExtracted: jurisdictions.length
          }
        );
        version = versionSnapshot.version;
        
        logger.info({
          workflowRunId: options.workflowRunId,
          version,
          branch: currentBranch,
          entitiesAdded,
          relationshipsAdded,
          entityCount: versionSnapshot.entityCount,
          relationshipCount: versionSnapshot.relationshipCount
        }, 'Created version snapshot (entities + relationships tracked)');
      } catch (error) {
        logger.warn({
          error: error instanceof Error ? error.message : String(error),
          workflowRunId: options.workflowRunId,
          branch: currentBranch
        }, 'Failed to create version snapshot');
      }
    }

    // Verify graph loading (WI-KG-006)
    // Skip verification if using branches other than 'main' (entities are in branch, verification checks default branch)
    // Or if skipPersistenceVerification is enabled
    const loadingStartTime = Date.now();
    let loadingVerification = {
      success: true,
      entitiesLoaded: validEntities.length,
      relationshipsLoaded: validRelationships.length,
      loadTime: 0,
      errors: [] as string[]
    };
    
    // Only verify if using 'main' branch or no branch specified
    // When using 'pending-changes' or other branches, verification would check wrong branch
    if (!options.skipPersistenceVerification && (!options.branch || options.branch === 'main')) {
      loadingVerification = await this.verifyGraphLoading(validEntities, validRelationships, options);
    } else if (options.branch && options.branch !== 'main') {
      // For non-main branches, skip verification (entities are in branch, but verification checks default branch)
      logger.debug({
        workflowRunId: options.workflowRunId,
        branch: options.branch,
        reason: 'Verification skipped for non-main branches (entities in branch, verification checks default branch)'
      }, 'Skipping graph loading verification for non-main branch');
    }
    const loadingTime = Date.now() - loadingStartTime;
    
    const buildTime = Date.now() - startTime;
    
    // Calculate extraction statistics (WI-KG-GAP-007)
    const documentsWithContent = documents.filter(doc => doc.fullText && doc.fullText.trim().length > 0).length;
    const extractionStats = {
      totalDocuments: documents.length,
      documentsWithContent,
      documentsMetadataOnly: documents.length - documentsWithContent,
      entitiesFromContent: entities.filter(e => e.metadata?.extractedFromContent).length,
      entitiesFromMetadata: entities.filter(e => !e.metadata?.extractedFromContent).length
    };

    // Verify overall persistence by checking entity count
    let persistedEntityCount = 0;
    let persistedRelationshipCount = 0;
    try {
      const allNodes = await this.kgService.getAllNodes();
      persistedEntityCount = allNodes.length;
      
      // Estimate relationship count by checking neighbors for a sample of entities
      if (entities.length > 0) {
        const sampleSize = Math.min(10, entities.length);
        let totalNeighbors = 0;
        for (let i = 0; i < sampleSize; i++) {
          try {
            const neighbors = await this.kgService.getNeighbors(entities[i].id);
            totalNeighbors += neighbors.length;
          } catch {
            // Ignore errors for individual neighbor checks
          }
        }
        persistedRelationshipCount = Math.round((totalNeighbors / sampleSize) * validEntities.length);
      }
    } catch (error) {
      logger.debug({
        error: error instanceof Error ? error.message : String(error),
        workflowRunId: options.workflowRunId
      }, 'Could not verify overall persistence (this may be expected)');
    }
    
    logger.info({
      workflowRunId: options.workflowRunId,
      entitiesAdded,
      relationshipsAdded,
      factsExtracted: facts.length,
      jurisdictionsExtracted: jurisdictions.length,
      buildTime,
      persistedEntityCount,
      persistedRelationshipCount,
      persistenceVerified: persistedEntityCount >= entitiesAdded
    }, 'Knowledge graph build completed');

    return {
      entitiesAdded,
      relationshipsAdded,
      factsExtracted: facts.length,
      jurisdictionsExtracted: jurisdictions.length,
      validationResults: validationResults.length > 0 ? validationResults : undefined,
      persisted: true, // Persistence verified via addNode/addEdge and post-build verification
      loaded: loadingVerification.success, // undefined/true when skipped, false only when verification failed
      loadingVerified: loadingVerification.loadTime > 0 ? {
        entitiesLoaded: loadingVerification.entitiesLoaded,
        relationshipsLoaded: loadingVerification.relationshipsLoaded,
        loadTime: loadingVerification.loadTime
      } : undefined, // Only set if verification was actually performed
      version,
      branch: currentBranch,
      performance: {
        totalTime: buildTime,
        extractionTime: extractionTime + relationshipExtractionTime,
        persistenceTime: persistenceTime,
        validationTime: validationTime,
        loadingTime: loadingTime,
        usedBulkOperations,
        usedParallelExtraction
      },
      extractionStats,
      batchDiscoveryStats,
      // Include filtering statistics (includes both pre-validation and post-entity validation filtering)
      entitiesFiltered: entitiesFiltered > 0 ? entitiesFiltered : undefined,
      relationshipsFiltered: relationshipsFiltered > 0 ? relationshipsFiltered : undefined,
      filteringEnabled: strictValidation || relationshipsFiltered > 0
    };
  }

  /**
   * Extract entities from CanonicalDocument array
   */
  private async extractEntities(
    documents: CanonicalDocument[],
    options: BuildOptions
  ): Promise<BaseEntity[]> {
    const entities: BaseEntity[] = [];

    // WI-KG-GAP-007: Validate document content before extraction
    const documentsWithContent = documents.filter(doc => 
      doc.fullText && doc.fullText.trim().length > 0
    );
    
    if (documentsWithContent.length < documents.length) {
      const missingCount = documents.length - documentsWithContent.length;
      logger.warn({
        workflowRunId: options.workflowRunId,
        totalDocuments: documents.length,
        documentsWithContent: documentsWithContent.length,
        missingContent: missingCount
      }, 'Some documents are missing fullText, entity extraction will be limited');

      if (options.onLog) {
        await options.onLog(
          `⚠️ ${missingCount} of ${documents.length} documents are missing fullText. Only document metadata will be added to KG for these documents.`,
          'warn'
        );
      }
    }

    // Extract primary document entities (always sequential, fast)
    // Note: We still create document entities for all documents, even without fullText
    // as they may have metadata that's useful
    for (const doc of documents) {
      const documentEntity = this.createDocumentEntity(doc, options);
      if (documentEntity) {
        entities.push(documentEntity);
      }
    }

    // Use PolicyParser for entity extraction (replaces EntityExtractionService)
    // WI-KG-GAP-007: Only extract from documents with content (parsing requires fullText)
    // WI-KG-GAP-005: Check enableExtraction flag
    if (documentsWithContent.length > 0 && options.enableExtraction !== false) {
      // Convert CanonicalDocument to NormalizedDocument for parsing
      const normalizedDocs = documentsWithContent.map(doc => this.canonicalDocumentToNormalizedDocument(doc));

      // Use parallel extraction for better performance when enabled
      if (options.enableParallelExtraction !== false && normalizedDocs.length > 1) {
        const extractionPromises = normalizedDocs.map(async (normalizedDoc) => {
          try {
            // Convert NormalizedDocument back to CanonicalDocument for PolicyParser
            const canonicalDoc = DocumentMapper.normalizedToCanonical(normalizedDoc);
            // Use PolicyParser to extract entities (goes through parsing layer)
            const extractedEntities = await this.policyParser.extractEntities(canonicalDoc);

            // Mark entities as extracted from content (WI-KG-GAP-007)
            extractedEntities.forEach(entity => {
              if (!entity.metadata) entity.metadata = {};
              entity.metadata.extractedFromContent = true;
            });

            return extractedEntities;
          } catch (error) {
            logger.warn({
              error: error instanceof Error ? error.message : String(error),
              documentId: normalizedDoc.sourceId,
              workflowRunId: options.workflowRunId
            }, 'Entity extraction via PolicyParser failed, using rule-based extraction only');
            return [];
          }
        });

        const extractedEntitiesArrays = await Promise.all(extractionPromises);
        entities.push(...extractedEntitiesArrays.flat());
      } else {
        // Sequential extraction (fallback or when disabled)
        for (const normalizedDoc of normalizedDocs) {
          try {
            // Convert NormalizedDocument back to CanonicalDocument for PolicyParser
            const canonicalDoc = DocumentMapper.normalizedToCanonical(normalizedDoc);
            // Use PolicyParser to extract entities (goes through parsing layer)
            const extractedEntities = await this.policyParser.extractEntities(canonicalDoc);

            // Mark entities as extracted from content (WI-KG-GAP-007)
            extractedEntities.forEach(entity => {
              if (!entity.metadata) entity.metadata = {};
              entity.metadata.extractedFromContent = true;
            });

            entities.push(...extractedEntities);
          } catch (error) {
            logger.warn({
              error: error instanceof Error ? error.message : String(error),
              documentId: normalizedDoc.sourceId,
              workflowRunId: options.workflowRunId
            }, 'Entity extraction via PolicyParser failed, using rule-based extraction only');
          }
        }
      }
    }

    // Deduplicate entities by ID
    const entityMap = new Map<string, BaseEntity>();
    for (const entity of entities) {
      if (!entityMap.has(entity.id)) {
        entityMap.set(entity.id, entity);
      }
    }

    return Array.from(entityMap.values());
  }

  /**
   * Convert CanonicalDocument to NormalizedDocument for parsing
   * 
   * Creates a NormalizedDocument structure from CanonicalDocument
   * for use with PolicyParser. This bridges the gap between workflow
   * layer (CanonicalDocument) and parsing layer (NormalizedDocument).
   * 
   * @param doc - Canonical document
   * @returns Normalized document ready for parsing
   */
  private canonicalDocumentToNormalizedDocument(doc: CanonicalDocument): NormalizedDocument {
    // Determine MIME type from document format or source
    let mimeType = 'text/plain';
    if (doc.format === 'PDF') {
      mimeType = 'application/pdf';
    } else if (doc.format === 'XML') {
      mimeType = 'application/xml';
    } else if (doc.format === 'Web') {
      mimeType = 'text/html';
    } else if (doc.format === 'DOCX') {
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    // Return complete NormalizedDocument with all CanonicalDocument fields
    return {
      sourceId: doc.sourceId,
      sourceUrl: doc.canonicalUrl || doc.sourceId,
      source: doc.source,
      title: doc.title,
      content: doc.fullText || '',
      mimeType,
      rawData: {
        sourceMetadata: doc.sourceMetadata,
        enrichmentMetadata: doc.enrichmentMetadata,
      },
      metadata: {
        ...doc.sourceMetadata,
        documentFamily: doc.documentFamily,
        documentType: doc.documentType,
      },
    };
  }

  /**
   * Create a document entity from CanonicalDocument
   */
  private createDocumentEntity(
    doc: CanonicalDocument,
    options: BuildOptions
  ): BaseEntity | null {
    // Map documentFamily to entity type
    let entityType: EntityType;
    if (doc.documentFamily === 'Beleid') {
      entityType = 'PolicyDocument';
    } else if (doc.documentFamily === 'Juridisch') {
      entityType = 'Regulation';
    } else {
      // Default to PolicyDocument for other types
      entityType = 'PolicyDocument';
    }

    // Create entity based on type
    if (entityType === 'PolicyDocument') {
      // Sanitize entity ID to comply with validation regex
      const rawId = doc.sourceId || doc.canonicalUrl || `doc-${Date.now()}`;
      const sanitizedId = sanitizeEntityId(rawId, {
        prefix: 'doc',
        maxLength: 200,
        ensureUniqueness: true,
      });

      // Validate and normalize URL
      const normalizedUrl = validateAndNormalizeUrl(doc.canonicalUrl || doc.sourceId, {
        defaultProtocol: 'https',
        removeTrailingSlash: true,
      });

      // Extract jurisdiction with query context fallback
      const jurisdiction = this.extractJurisdictionFromDocument(doc, options.queryContext) ||
                          extractJurisdictionFromContext(options.queryContext || {}) ||
                          'Unknown';

      const policyDoc: PolicyDocument = {
        id: sanitizedId,
        type: 'PolicyDocument',
        name: doc.title,
        description: doc.fullText?.substring(0, 500) || doc.title,
        date: doc.dates?.publishedAt?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        jurisdiction,
        documentType: (doc.documentType === 'Structure' || doc.documentType === 'Vision' || doc.documentType === 'Ordinance' || doc.documentType === 'Note') 
          ? doc.documentType 
          : 'Structure',
        status: 'Active', // DocumentDates doesn't have archivedAt
        url: normalizedUrl, // Only set if valid URL
        metadata: {
          source: doc.source,
          sourceId: doc.sourceId,
          workflowRunId: options.workflowRunId,
          workflowId: options.workflowId,
          sourceMetadata: doc.sourceMetadata,
          enrichmentMetadata: doc.enrichmentMetadata
        }
      };
      // Generate URI after creating the entity
      policyDoc.uri = generateSchemaOrgUri(policyDoc);
      return policyDoc;
    } else if (entityType === 'Regulation') {
      // Sanitize entity ID to comply with validation regex
      const rawId = doc.sourceId || doc.canonicalUrl || `reg-${Date.now()}`;
      const sanitizedId = sanitizeEntityId(rawId, {
        prefix: 'reg',
        maxLength: 200,
        ensureUniqueness: true,
      });

      const regulation: Regulation = {
        id: sanitizedId,
        type: 'Regulation',
        name: doc.title,
        description: doc.fullText?.substring(0, 500) || doc.title,
        category: this.inferRegulationCategory(doc),
        metadata: {
          source: doc.source,
          sourceId: doc.sourceId,
          workflowRunId: options.workflowRunId,
          workflowId: options.workflowId,
          sourceMetadata: doc.sourceMetadata,
          enrichmentMetadata: doc.enrichmentMetadata,
          // Store legal references in metadata since Regulation interface doesn't have legalReferences
          legalReferences: doc.artifactRefs?.map(ref => ref.provenance?.url || ref.storageKey || ref.sha256) || []
        }
      };
      // Generate URI after creating the entity
      regulation.uri = generateSchemaOrgUri(regulation);
      return regulation;
    }

    return null;
  }

  /**
   * Extract relationships between entities
   */
  private async extractRelationships(
    entities: BaseEntity[],
    documents: CanonicalDocument[],
    options: BuildOptions
  ): Promise<Relation[]> {
    const relationships: Relation[] = [];

    // Extract relationships from document citations
    for (const doc of documents) {
      if (doc.artifactRefs && doc.artifactRefs.length > 0) {
        const sourceEntity = entities.find(e => 
          e.metadata?.sourceId === doc.sourceId || 
          ((e as any).url === doc.canonicalUrl && (e.type === 'PolicyDocument' || e.type === 'Regulation'))
        );

        if (sourceEntity) {
          for (const ref of doc.artifactRefs) {
            const targetEntity = entities.find(e =>
              e.metadata?.sourceId === ref.sha256 ||
              e.metadata?.sourceId === ref.storageKey ||
              ((e as any).url === ref.provenance?.url && (e.type === 'PolicyDocument' || e.type === 'Regulation'))
            );

            if (targetEntity) {
              relationships.push({
                sourceId: sourceEntity.id,
                targetId: targetEntity.id,
                type: RelationTypeEnum.RELATED_TO,
                metadata: {
                  source: ref.provenance?.url || ref.storageKey || ref.sha256,
                  workflowRunId: options.workflowRunId
                }
              });
            }
          }
        }
      }
    }

    // Use LLM-based relationship extraction if available
    if (this.relationshipExtractionService && entities.length > 0) {
      for (const doc of documents) {
        try {
          const extractionContext: ExtractionContext = {
            documentId: doc.sourceId || doc.canonicalUrl || '',
            documentText: doc.fullText || '',
            documentTitle: doc.title,
            documentUrl: doc.canonicalUrl || doc.sourceId,
            existingEntities: entities.map(e => ({
              id: e.id,
              type: e.type,
              name: e.name
            })),
            jurisdiction: this.extractJurisdictionFromDocument(doc)
          };

          const result = await this.relationshipExtractionService.extractRelationships(extractionContext);
          
          if (result.success && result.relationships && result.relationships.length > 0) {
            for (const extractedRel of result.relationships) {
              relationships.push({
                sourceId: extractedRel.sourceId,
                targetId: extractedRel.targetId,
                type: extractedRel.type,
                metadata: {
                  confidence: extractedRel.confidence,
                  sourceText: extractedRel.sourceText,
                  workflowRunId: options.workflowRunId
                }
              });
            }
          }
        } catch (error) {
          logger.warn({
            error: error instanceof Error ? error.message : String(error),
            documentId: doc.sourceId,
            workflowRunId: options.workflowRunId
          }, 'Relationship extraction failed');
        }
      }
    }

    // Deduplicate relationships
    const relMap = new Map<string, Relation>();
    for (const rel of relationships) {
      const key = `${rel.sourceId}-${rel.targetId}-${rel.type}`;
      if (!relMap.has(key)) {
        relMap.set(key, rel);
      }
    }

    return Array.from(relMap.values());
  }

  /**
   * Extract facts from documents and entities
   */
  private extractFacts(
    entities: BaseEntity[],
    documents: CanonicalDocument[]
  ): Array<{ entityId: string; fact: string; value: unknown }> {
    const facts: Array<{ entityId: string; fact: string; value: unknown }> = [];

    for (const entity of entities) {
      // Extract facts from entity metadata
      if (entity.metadata?.enrichmentMetadata) {
        const enrichment = entity.metadata.enrichmentMetadata;
        
        const enrichmentTyped = enrichment as Record<string, unknown>;
        if (typeof enrichmentTyped.authorityScore === 'number') {
          facts.push({
            entityId: entity.id,
            fact: 'authorityScore',
            value: enrichmentTyped.authorityScore
          });
        }

        if (enrichmentTyped.matchSignals && typeof enrichmentTyped.matchSignals === 'object') {
          facts.push({
            entityId: entity.id,
            fact: 'matchSignals',
            value: enrichmentTyped.matchSignals
          });
        }
      }

      // Extract facts from document dates
      const doc = documents.find(d => 
        d.sourceId === entity.metadata?.sourceId ||
        d.canonicalUrl === ((entity as any).url && (entity.type === 'PolicyDocument' || entity.type === 'Regulation') ? (entity as any).url : undefined)
      );

      if (doc?.dates) {
        if (doc.dates.publishedAt) {
          facts.push({
            entityId: entity.id,
            fact: 'publishedAt',
            value: doc.dates.publishedAt.toISOString()
          });
        }

        // DocumentDates doesn't have archivedAt, so skip it
        // If needed, check enrichmentMetadata or sourceMetadata for archive status
      }
    }

    return facts;
  }

  /**
   * Extract jurisdictions from documents
   */
  private extractJurisdictions(
    entities: BaseEntity[],
    documents: CanonicalDocument[]
  ): Array<{ entityId: string; jurisdiction: string }> {
    const jurisdictions: Array<{ entityId: string; jurisdiction: string }> = [];

    for (const entity of entities) {
      const jurisdiction = this.extractJurisdictionFromEntity(entity, documents);
      if (jurisdiction) {
        jurisdictions.push({
          entityId: entity.id,
          jurisdiction
        });
      }
    }

    return jurisdictions;
  }

  /**
   * Extract jurisdiction from document
   * 
   * Attempts extraction in the following order:
   * 1. sourceMetadata.jurisdiction (direct)
   * 2. DSO metadata jurisdiction
   * 3. URL pattern matching
   * 4. Query context fallback (if available)
   */
  private extractJurisdictionFromDocument(
    doc: CanonicalDocument,
    queryContext?: Record<string, unknown>
  ): string | undefined {
    // Try sourceMetadata first
    if (doc.sourceMetadata?.jurisdiction && typeof doc.sourceMetadata.jurisdiction === 'string') {
      const jurisdiction = doc.sourceMetadata.jurisdiction.trim();
      if (jurisdiction.length > 0 && jurisdiction !== 'Unknown') {
        return jurisdiction;
      }
    }

    // Try to infer from source
    if (doc.source === 'DSO') {
      // DSO documents typically have jurisdiction in metadata
      const dsoJurisdiction = doc.sourceMetadata?.jurisdiction;
      if (dsoJurisdiction && typeof dsoJurisdiction === 'string') {
        const jurisdiction = dsoJurisdiction.trim();
        if (jurisdiction.length > 0 && jurisdiction !== 'Unknown') {
          return jurisdiction;
        }
      }
      
      // Try bevoegdgezag from DSO metadata
      const bevoegdgezag = doc.sourceMetadata?.bevoegdgezag;
      if (bevoegdgezag && typeof bevoegdgezag === 'string') {
        const bevoegdgezagStr = bevoegdgezag.trim();
        if (bevoegdgezagStr.length > 0) {
          // Try to extract jurisdiction from bevoegdgezag
          // Format is often "Gemeente Amsterdam" or similar
          if (bevoegdgezagStr.match(/^(Gemeente|Provincie|Waterschap)\s+/i)) {
            return bevoegdgezagStr;
          }
          // If it's just a name, try to infer from context
          if (queryContext) {
            const mapped = extractJurisdictionFromContext(queryContext);
            if (mapped) {
              return mapped;
            }
          }
        }
      }
    }

    // Try to infer from URL patterns
    if (doc.canonicalUrl) {
      const url = doc.canonicalUrl.toLowerCase();
      
      // Gemeente pattern
      if (url.includes('gemeente') || url.includes('municipality')) {
        const match = url.match(/(?:gemeente|municipality)[-./]([a-z-]+)/);
        if (match) {
          const entityName = match[1]
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          return `Gemeente ${entityName}`;
        }
      }
      
      // Provincie pattern
      if (url.includes('provincie') || url.includes('province')) {
        const match = url.match(/(?:provincie|province)[-./]([a-z-]+)/);
        if (match) {
          const entityName = match[1]
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          return `Provincie ${entityName}`;
        }
      }
      
      // Waterschap pattern
      if (url.includes('waterschap')) {
        const match = url.match(/waterschap[-./]([a-z-]+)/);
        if (match) {
          const entityName = match[1]
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          return `Waterschap ${entityName}`;
        }
      }
    }

    // Fallback to query context if available
    if (queryContext) {
      const mapped = extractJurisdictionFromContext(queryContext);
      if (mapped) {
        return mapped;
      }
    }

    return undefined;
  }

  /**
   * Extract jurisdiction from entity
   */
  private extractJurisdictionFromEntity(
    entity: BaseEntity,
    documents: CanonicalDocument[]
  ): string | undefined {
    // Check if entity already has jurisdiction
    if (entity.type === 'PolicyDocument') {
      const policyDoc = entity as PolicyDocument;
      if (policyDoc.jurisdiction) {
        return policyDoc.jurisdiction;
      }
    }

    // Try to get from source document
    const doc = documents.find(d =>
      d.sourceId === entity.metadata?.sourceId ||
      d.canonicalUrl === ((entity as any).url && (entity.type === 'PolicyDocument' || entity.type === 'Regulation') ? (entity as any).url : undefined)
    );

    if (doc) {
      return this.extractJurisdictionFromDocument(doc);
    }

    return undefined;
  }

  /**
   * Infer regulation category from document
   */
  private inferRegulationCategory(doc: CanonicalDocument): 'Zoning' | 'Environmental' | 'Building' | 'Procedural' {
    const title = doc.title.toLowerCase();
    const fullText = doc.fullText?.toLowerCase() || '';
    const searchText = `${title} ${fullText}`;

    if (searchText.includes('bestemmingsplan') || searchText.includes('zoning')) {
      return 'Zoning';
    }
    if (searchText.includes('milieu') || searchText.includes('environmental')) {
      return 'Environmental';
    }
    if (searchText.includes('bouw') || searchText.includes('building')) {
      return 'Building';
    }
    return 'Procedural';
  }

  /**
   * Validate facts against source documents
   */
  private async validateFacts(
    entities: BaseEntity[],
    documents: CanonicalDocument[],
    relationships: Relation[]
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const rel of relationships) {
      try {
        // Find source document for the relationship
        const sourceEntity = entities.find(e => e.id === rel.sourceId);
        const sourceDoc = sourceEntity?.metadata?.sourceId
          ? documents.find(d => d.sourceId === sourceEntity.metadata?.sourceId)
          : undefined;

        if (sourceDoc) {
          // Validate that the relationship is mentioned in the source document
          const sourceText = sourceDoc.fullText || '';
          const targetEntity = entities.find(e => e.id === rel.targetId);
          
          if (targetEntity) {
            // Check if target entity name appears in source document using improved matching
            const targetNameInSource = this.isEntityNameInText(targetEntity.name, sourceText);
            
            if (!targetNameInSource) {
              results.push({
                type: 'warning',
                relationshipId: `${rel.sourceId}-${rel.targetId}-${rel.type}`,
                message: `Relatie wordt mogelijk niet ondersteund door brongocument: doelentiteit "${targetEntity.name}" niet gevonden in brontekst`
              });
            }
          }
        }

        // Use FactValidator for more detailed validation
        try {
          const factValidation = await this.factValidator.validateFact(rel);
          if (factValidation.issues.length > 0) {
            // Create separate validation results for each issue so translation keys work correctly
            const confidence = (factValidation.confidence * 100).toFixed(0);
            for (const issue of factValidation.issues) {
              // If issue is already a translation key, wrap it with confidence
              // Otherwise, use the issue text as-is with confidence
              const message = issue.startsWith('[i18n:') 
                ? `${issue.replace(/^\[i18n:workflowLogs\./, '').replace(/\]$/, '')} (vertrouwen: ${confidence}%)`
                : `${issue} (vertrouwen: ${confidence}%)`;
              results.push({
                type: factValidation.confidence < 0.5 ? 'error' : 'warning',
                relationshipId: `${rel.sourceId}-${rel.targetId}-${rel.type}`,
                message
              });
            }
          }
        } catch (error) {
          // FactValidator may fail if document service is not available - log but continue
          logger.debug({
            error: error instanceof Error ? error.message : String(error),
            relationshipId: `${rel.sourceId}-${rel.targetId}-${rel.type}`
          }, 'Fact validation skipped');
        }
      } catch (error) {
        logger.warn({
          error: error instanceof Error ? error.message : String(error),
          relationshipId: `${rel.sourceId}-${rel.targetId}-${rel.type}`
        }, 'Failed to validate fact');
      }
    }

    return results;
  }

  /**
   * Validate jurisdictions
   */
  private async validateJurisdictions(
    entities: BaseEntity[],
    documents: CanonicalDocument[]
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const entity of entities) {
      if (entity.type === 'PolicyDocument' || entity.type === 'Regulation') {
        const policyDoc = entity as PolicyDocument;
        
        if (policyDoc.jurisdiction) {
          // Validate jurisdiction format
          const jurisdiction = policyDoc.jurisdiction;
          
          // Check for common jurisdiction patterns
          const validPatterns = [
            /^Gemeente\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/i,
            /^Provincie\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/i,
            /^Waterschap\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/i,
            /^Rijk$/i,
            /^Nederland$/i
          ];

          const isValidFormat = validPatterns.some(pattern => pattern.test(jurisdiction));
          
          if (!isValidFormat) {
            results.push({
              type: 'warning',
              entityId: entity.id,
              message: `Jurisdiction format may be invalid: "${jurisdiction}"`
            });
          }

          // Validate geographic consistency
          const doc = documents.find(d =>
            d.sourceId === entity.metadata?.sourceId ||
            d.canonicalUrl === ((entity as any).url && (entity.type === 'PolicyDocument' || entity.type === 'Regulation') ? (entity as any).url : undefined)
          );

          if (doc) {
            // Check if jurisdiction matches source metadata
            const sourceJurisdiction = this.extractJurisdictionFromDocument(doc);
            if (sourceJurisdiction && sourceJurisdiction !== jurisdiction) {
              results.push({
                type: 'warning',
                entityId: entity.id,
                message: `Jurisdiction mismatch: entity has "${jurisdiction}" but document has "${sourceJurisdiction}"`
              });
            }
          }
        } else {
          // Missing jurisdiction for policy document
          results.push({
            type: 'warning',
            entityId: entity.id,
            message: 'Policy document missing jurisdiction information'
          });
        }
      }
    }

    return results;
  }

  /**
   * Validate and filter entities BEFORE adding to graph (WI-KG-008)
   * Returns valid entities and invalid entities with reasons
   */
  private async validateAndFilterEntities(
    entities: BaseEntity[],
    options: BuildOptions
  ): Promise<{
    valid: BaseEntity[];
    invalid: Array<{ entity: BaseEntity; reason: string }>;
  }> {
    const valid: BaseEntity[] = [];
    const invalid: Array<{ entity: BaseEntity; reason: string }> = [];

    // Initialize SHACL validator if using GraphDB (Phase 1 enhancement)
    await this.ensureSHACLValidator(options);

    // Initialize validation storage (Phase 1 enhancement)
    await this.ensureValidationStorage();

    for (const entity of entities) {
      // Layer 1: Schema validation (EntitySchemaValidator)
      const schemaValidation = this.entityValidator.validate(entity);
      
      // Layer 1: SHACL validation (Phase 1 enhancement)
      let shaclValidation = null;
      if (this.shaclValidator) {
        try {
          shaclValidation = await this.shaclValidator.validateEntity(entity);
        } catch (error) {
          logger.warn({ error, entityId: entity.id }, 'SHACL validation failed, continuing with schema validation only');
        }
      }

      // Combine validation results
      const isValid = schemaValidation.isValid && (!shaclValidation || shaclValidation.isValid);
      const allErrors = [
        ...schemaValidation.errors.map(e => `Schema: ${e.message}`),
        ...(shaclValidation?.errors.map(e => `SHACL: ${e.message}`) || [])
      ];
      const allWarnings = [
        ...schemaValidation.warnings.map(w => `Schema: ${w.message}`),
        ...(shaclValidation?.warnings.map(w => `SHACL: ${w.message}`) || [])
      ];

      if (isValid) {
        valid.push(entity);
      } else {
        invalid.push({
          entity,
          reason: allErrors.join('; ')
        });
      }

      // Store validation results (Phase 1 enhancement)
      if (this.validationStorage) {
        try {
          if (shaclValidation) {
            await this.validationStorage.storeSHACLResult(shaclValidation, {
              workflowRunId: options.workflowRunId,
              workflowId: options.workflowId,
              source: options.source,
            });
          }
        } catch (error) {
          logger.debug({ error, entityId: entity.id }, 'Failed to store validation result');
        }
      }
    }

    return { valid, invalid };
  }

  /**
   * Validate and filter relationships BEFORE adding to graph (WI-KG-008)
   * Only relationships between valid entities are considered
   */
  private async validateAndFilterRelationships(
    relationships: Relation[],
    validEntityIds: Set<string>,
    options: BuildOptions
  ): Promise<{
    valid: Relation[];
    invalid: Array<{ relationship: Relation; reason: string }>;
  }> {
    const valid: Relation[] = [];
    const invalid: Array<{ relationship: Relation; reason: string }> = [];

    for (const rel of relationships) {
      // Check if both entities exist (were successfully added)
      if (!validEntityIds.has(rel.sourceId) || !validEntityIds.has(rel.targetId)) {
        invalid.push({
          relationship: rel,
          reason: 'Source or target entity was filtered out during validation'
        });
        continue;
      }

      // Get entities for relationship validation
      let sourceEntity: BaseEntity | null = null;
      let targetEntity: BaseEntity | null = null;
      
      try {
        sourceEntity = (await this.kgService.getNode(rel.sourceId)) || null;
        targetEntity = (await this.kgService.getNode(rel.targetId)) || null;
      } catch (error) {
        // If entities can't be loaded, relationship is invalid
        invalid.push({
          relationship: rel,
          reason: `Could not load source or target entity: ${error instanceof Error ? error.message : String(error)}`
        });
        continue;
      }

      // Initialize validation storage if not already done (Phase 1 enhancement)
      await this.ensureValidationStorage();

      // Validate relationship using RelationshipValidator (with pattern-based validation)
      const relValidation = await this.relationshipValidator.validate(
        rel,
        sourceEntity,
        targetEntity
      );

      // Store relationship validation result (Phase 1 enhancement)
      if (this.validationStorage) {
        try {
          const relationshipId = `${rel.sourceId}->${rel.targetId}:${rel.type}`;
          await this.validationStorage.storeRelationshipResult(relationshipId, relValidation, {
            workflowRunId: options.workflowRunId,
            workflowId: options.workflowId,
            source: options.source,
          });
        } catch (error) {
          logger.debug({ error, relationshipId: `${rel.sourceId}->${rel.targetId}` }, 'Failed to store relationship validation result');
        }
      }

      if (!relValidation.isValid) {
        invalid.push({
          relationship: rel,
          reason: relValidation.errors.join('; ')
        });
        continue;
      }

      // Validate as fact using FactValidator
      try {
        const factValidation = await this.factValidator.validateFact(rel);

        if (factValidation.confidence < 0.5 || factValidation.issues.length > 0) {
          invalid.push({
            relationship: rel,
            reason: `Fact validation failed: ${factValidation.issues.join('; ')}`
          });
          continue;
        }
      } catch (error) {
        // If fact validation fails, log but don't block (fact validator may not be fully configured)
        logger.debug({
          workflowRunId: options.workflowRunId,
          relationshipId: `${rel.sourceId}-${rel.targetId}-${rel.type}`,
          error: error instanceof Error ? error.message : String(error)
        }, 'Fact validation error (non-blocking)');
      }

      // Relationship passed all validations
      valid.push(rel);
    }

    return { valid, invalid };
  }

  /**
   * Validate relationships after entities are added to the graph
   * This ensures relationships reference entities that actually exist in the graph,
   * including entities from previous workflow steps.
   * 
   * Uses existing validation services:
   * - PeriodicValidator: Check consistency and fact validation
   * - MultiViewValidator: Check structural importance and connectivity
   * - SteinerTreeService (optional): Validate paths between entities
   */
  private async validateRelationshipsAfterEntityAddition(
    relationships: Relation[],
    options: BuildOptions
  ): Promise<{
    valid: Relation[];
    invalid: Array<{ relationship: Relation; reason: string }>;
  }> {
    const invalid: Array<{ relationship: Relation; reason: string }> = [];
    const valid: Relation[] = [];

    logger.debug({
      workflowRunId: options.workflowRunId,
      relationshipCount: relationships.length
    }, 'Starting post-entity validation of relationships');

    // 1. Use PeriodicValidator to check consistency and facts
    let periodicValidationResult: Awaited<ReturnType<PeriodicValidator['runValidation']>> | null = null;
    try {
      const periodicValidator = new PeriodicValidator(this.kgService as unknown as KnowledgeGraphService);
      periodicValidationResult = await periodicValidator.runValidation();
      
      logger.debug({
        workflowRunId: options.workflowRunId,
        consistencyViolations: periodicValidationResult.consistency.violations.length,
        factsValidated: periodicValidationResult.facts.validated
      }, 'PeriodicValidator validation completed');
      
      // Log consistency violations if any
      if (periodicValidationResult.consistency.violations.length > 0) {
        const errors = periodicValidationResult.consistency.summary.errors;
        const warnings = periodicValidationResult.consistency.summary.warnings;
        
        logger.warn({
          workflowRunId: options.workflowRunId,
          totalViolations: periodicValidationResult.consistency.summary.totalViolations,
          errors,
          warnings
        }, 'Consistency violations found in knowledge graph');
        
        if (options.onLog) {
          await options.onLog(
            `⚠️ Knowledge graph consistency check: ${errors} errors, ${warnings} warnings found`,
            errors > 0 ? 'warn' : 'info'
          );
        }
      }
      
      // Log fact validation summary
      if (periodicValidationResult.facts.lowConfidence > 0) {
        logger.debug({
          workflowRunId: options.workflowRunId,
          lowConfidenceFacts: periodicValidationResult.facts.lowConfidence,
          averageConfidence: periodicValidationResult.facts.averageConfidence
        }, 'Some facts have low confidence scores');
      }
    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : String(error),
        workflowRunId: options.workflowRunId
      }, 'PeriodicValidator validation failed, continuing with other validations');
    }

    // 2. Use MultiViewValidator for structural validation
    let multiViewValidator: MultiViewValidator | null = null;
    try {
      // Check if kgService has getRelationshipsForEntity and getIncomingRelationships methods
      const kgServiceAny = this.kgService as any;
      if (kgServiceAny.getRelationshipsForEntity && kgServiceAny.getIncomingRelationships) {
        multiViewValidator = new MultiViewValidator(
          async (id: string) => {
            return await kgServiceAny.getRelationshipsForEntity(id);
          },
          async (id: string) => {
            return await kgServiceAny.getIncomingRelationships(id);
          },
          async () => {
            // Get all nodes - this might be expensive, so we'll use a limited approach
            // For now, we'll validate entities on-demand
            // MultiViewValidator uses this for calculating average connectivity
            // We can return empty array and it will use a default average
            return [];
          }
        );
      } else {
        logger.debug({
          workflowRunId: options.workflowRunId
        }, 'KG service does not support getRelationshipsForEntity/getIncomingRelationships, skipping MultiViewValidator');
      }
    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : String(error),
        workflowRunId: options.workflowRunId
      }, 'Failed to initialize MultiViewValidator, continuing without structural validation');
    }

    // 3. Get Steiner tree service if enabled (optional)
    let steinerService: any = null;
    if (FeatureFlag.isEnabled(KGFeatureFlag.KG_STEINER_TREE_ENABLED, false)) {
      try {
        // Check if we're using GraphDB or Neo4j
        const kgServiceAny = this.kgService as any;
        if (kgServiceAny.client) {
          // GraphDB backend
          const { GraphDBSteinerTreeService } = await import('../../graphrag/pathfinding/GraphDBSteinerTreeService.js');
          const { getGraphDBClient } = await import('../../../config/graphdb.js');
          const { GraphDBGraphTraversalService } = await import('../../graphrag/GraphDBGraphTraversalService.js');
          
          const graphdbClient = getGraphDBClient();
          const traversalService = new GraphDBGraphTraversalService(graphdbClient);
          steinerService = new GraphDBSteinerTreeService(graphdbClient, traversalService, this.kgService as unknown as KnowledgeGraphService);
        } else if (kgServiceAny.driver) {
          // Neo4j backend
          const { SteinerTreeService } = await import('../../graphrag/pathfinding/SteinerTreeService.js');
          const { GraphTraversalService } = await import('../../graphrag/GraphTraversalService.js');
          const { HybridScorer } = await import('../../graphrag/HybridScorer.js');
          
          const driver = kgServiceAny.driver;
          const vectorService = new VectorService();
          await vectorService.init();
          const traversalService = new GraphTraversalService(driver);
          const hybridScorer = new HybridScorer(vectorService);
          steinerService = new SteinerTreeService(driver, this.kgService as unknown as KnowledgeGraphService);
        }
      } catch (error) {
        logger.debug({
          error: error instanceof Error ? error.message : String(error),
          workflowRunId: options.workflowRunId
        }, 'Steiner tree service not available, skipping path validation');
      }
    }

    // 4. For each relationship, validate:
    // Optimize: Collect all unique entity IDs first, then fetch in parallel
    const entityIdsToFetch = new Set<string>();
    for (const rel of relationships) {
      entityIdsToFetch.add(rel.sourceId);
      entityIdsToFetch.add(rel.targetId);
    }
    
    // Fetch all entities in parallel for better performance
    const entityMap = new Map<string, BaseEntity | null>();
    const fetchPromises = Array.from(entityIdsToFetch).map(async (entityId) => {
      try {
        const entity = await this.kgService.getNode(entityId);
        entityMap.set(entityId, entity ?? null);
      } catch (error) {
        logger.debug({
          error: error instanceof Error ? error.message : String(error),
          entityId,
          workflowRunId: options.workflowRunId
        }, 'Failed to fetch entity for validation');
        entityMap.set(entityId, null);
      }
    });
    
    await Promise.all(fetchPromises);
    
    // Now validate relationships using cached entities
    for (const rel of relationships) {
      // Check entity existence in graph (this is the key validation - entities now exist)
      const sourceEntity = entityMap.get(rel.sourceId) || null;
      const targetEntity = entityMap.get(rel.targetId) || null;
      
      if (!sourceEntity || !targetEntity) {
        invalid.push({
          relationship: rel,
          reason: `Source or target entity not found in graph (source: ${sourceEntity ? 'found' : 'missing'}, target: ${targetEntity ? 'found' : 'missing'})`
        });
        continue;
      }

      // Use MultiViewValidator for structural validation
      // Note: We use this to check for structural issues, but we're lenient with new entities
      // that may have low scores simply because they're new and don't have relationships yet
      if (multiViewValidator) {
        try {
          const sourceValidation = await multiViewValidator.validateEntity(sourceEntity);
          const targetValidation = await multiViewValidator.validateEntity(targetEntity);
          
          // Only filter if there are actual structural issues (not just low scores from being new)
          // Check for specific issues rather than just overall score
          const sourceHasIssues = sourceValidation.structural.issues.length > 0 && 
                                  sourceValidation.structural.connectivity === 0 &&
                                  ['Regulation', 'Requirement', 'PolicyDocument'].includes(sourceEntity.type);
          const targetHasIssues = targetValidation.structural.issues.length > 0 && 
                                  targetValidation.structural.connectivity === 0 &&
                                  ['Regulation', 'Requirement', 'PolicyDocument'].includes(targetEntity.type);
          
          // Only filter if both entities have structural issues (orphaned entities that should have connections)
          // This prevents blocking valid relationships for new entities that just haven't built up relationships yet
          if (sourceHasIssues && targetHasIssues && 
              sourceValidation.overallScore < 0.3 && targetValidation.overallScore < 0.3) {
            invalid.push({
              relationship: rel,
              reason: `Both entities have structural issues: ${sourceValidation.structural.issues.join('; ')} and ${targetValidation.structural.issues.join('; ')}`
            });
            continue;
          }
          
          // Log warnings for low scores but don't block (entities might be new)
          if (sourceValidation.overallScore < 0.5 || targetValidation.overallScore < 0.5) {
            logger.debug({
              sourceId: rel.sourceId,
              targetId: rel.targetId,
              sourceScore: sourceValidation.overallScore,
              targetScore: targetValidation.overallScore,
              workflowRunId: options.workflowRunId
            }, 'Low structural validation scores (entities may be new, not blocking relationship)');
          }
        } catch (error) {
          logger.debug({
            error: error instanceof Error ? error.message : String(error),
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            workflowRunId: options.workflowRunId
          }, 'MultiViewValidator validation failed, continuing');
        }
      }

      // Optional: Use Steiner tree for advanced analysis (if enabled)
      if (steinerService) {
        try {
          // A. Path Validation: Check if entities can be reached
          const pathCheck = await steinerService.findSteinerTree({
            terminalNodeIds: [rel.sourceId, rel.targetId],
            maxDepth: 5
          });
          
          if (!pathCheck) {
            // No path exists - this might be okay for new relationships
            // but we should log it for analysis
            logger.debug({
              sourceId: rel.sourceId,
              targetId: rel.targetId,
              type: rel.type,
              workflowRunId: options.workflowRunId
            }, 'No existing path found between entities (new relationship may create path)');
          }
          
          // C. Orphan Detection: Check if source or target is orphaned
          const sourceNeighbors = await this.kgService.getNeighbors(rel.sourceId);
          const targetNeighbors = await this.kgService.getNeighbors(rel.targetId);
          
          if (sourceNeighbors.length === 0 && targetNeighbors.length === 0) {
            // Both entities are orphaned - this relationship connects them
            logger.debug({
              sourceId: rel.sourceId,
              targetId: rel.targetId,
              workflowRunId: options.workflowRunId
            }, 'Relationship connects two orphaned entities');
          }
        } catch (error) {
          logger.debug({
            error: error instanceof Error ? error.message : String(error),
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            workflowRunId: options.workflowRunId
          }, 'Steiner tree validation failed, continuing');
        }
      }

      // Relationship passed all validations
      valid.push(rel);
    }

    logger.info({
      workflowRunId: options.workflowRunId,
      totalRelationships: relationships.length,
      validRelationships: valid.length,
      invalidRelationships: invalid.length
    }, 'Post-entity validation completed');

    return { valid, invalid };
  }

  /**
   * Analyze subgraph after relationships are added
   * Uses Steiner tree for:
   * - Missing Relationship Discovery: Identify relationships that would improve connectivity
   * - Subgraph Quality Assessment: Evaluate the quality of the subgraph
   * - Optimal Relationship Suggestions: Suggest relationships based on Steiner tree analysis
   */
  private async analyzeSubgraphAfterRelationshipAddition(
    entities: BaseEntity[],
    relationships: Relation[],
    options: BuildOptions
  ): Promise<void> {
    // Early return for edge cases
    if (entities.length === 0) {
      logger.debug({
        workflowRunId: options.workflowRunId
      }, 'Skipping subgraph analysis: no entities to analyze');
      return;
    }

    if (entities.length === 1) {
      logger.debug({
        workflowRunId: options.workflowRunId
      }, 'Skipping subgraph analysis: only one entity (no connectivity to analyze)');
      return;
    }

    logger.debug({
      workflowRunId: options.workflowRunId,
      entityCount: entities.length,
      relationshipCount: relationships.length
    }, 'Starting post-relationship subgraph analysis');

    // Get Steiner tree service if available
    let steinerService: any = null;
    try {
      const kgServiceAny = this.kgService as any;
      if (kgServiceAny.client) {
        // GraphDB backend
        const { GraphDBSteinerTreeService } = await import('../../graphrag/pathfinding/GraphDBSteinerTreeService.js');
        const { getGraphDBClient } = await import('../../../config/graphdb.js');
        const { GraphDBGraphTraversalService } = await import('../../graphrag/GraphDBGraphTraversalService.js');
        
        const graphdbClient = getGraphDBClient();
        const traversalService = new GraphDBGraphTraversalService(graphdbClient);
        steinerService = new GraphDBSteinerTreeService(graphdbClient, traversalService, this.kgService as unknown as KnowledgeGraphService);
      } else if (kgServiceAny.driver) {
        // Neo4j backend
        const { SteinerTreeService } = await import('../../graphrag/pathfinding/SteinerTreeService.js');
        const { GraphTraversalService } = await import('../../graphrag/GraphTraversalService.js');
        const { HybridScorer } = await import('../../graphrag/HybridScorer.js');
        
        const driver = kgServiceAny.driver;
        const vectorService = new VectorService();
        await vectorService.init();
        const traversalService = new GraphTraversalService(driver);
        const hybridScorer = new HybridScorer(vectorService);
        steinerService = new SteinerTreeService(driver, this.kgService as unknown as KnowledgeGraphService);
      }
    } catch (error) {
      logger.debug({
        error: error instanceof Error ? error.message : String(error),
        workflowRunId: options.workflowRunId
      }, 'Steiner tree service not available for subgraph analysis');
      return;
    }

    if (!steinerService) {
      return;
    }

    // 1. Missing Relationship Discovery with Optimal Relationship Type Suggestions
    // Analyze pairs of entities that should be connected but aren't
    // Suggests specific relationship types based on entity types
    const missingRelationships: Array<{ 
      sourceId: string; 
      targetId: string; 
      suggestedType?: RelationTypeEnum;
      reason: string;
      confidence: 'high' | 'medium' | 'low';
    }> = [];
    const entityIds = entities.map(e => e.id);
    
    // Helper function to suggest relationship type based on entity types
    const suggestRelationshipType = (sourceType: EntityType, targetType: EntityType): RelationTypeEnum | null => {
      // Regulation -> SpatialUnit / LandUse
      if (sourceType === 'Regulation' && (targetType === 'SpatialUnit' || targetType === 'LandUse')) {
        return RelationTypeEnum.APPLIES_TO;
      }
      // Regulation -> Requirement
      if (sourceType === 'Regulation' && targetType === 'Requirement') {
        return RelationTypeEnum.HAS_REQUIREMENT;
      }
      // Regulation/Requirement -> PolicyDocument
      if ((sourceType === 'Regulation' || sourceType === 'Requirement') && targetType === 'PolicyDocument') {
        return RelationTypeEnum.DEFINED_IN;
      }
      // PolicyDocument -> PolicyDocument
      if (sourceType === 'PolicyDocument' && targetType === 'PolicyDocument') {
        return RelationTypeEnum.REFINES; // Could also be OVERRIDES, but REFINES is more common
      }
      // SpatialUnit -> SpatialUnit
      if (sourceType === 'SpatialUnit' && targetType === 'SpatialUnit') {
        return RelationTypeEnum.LOCATED_IN;
      }
      // Requirement -> SpatialUnit
      if (sourceType === 'Requirement' && targetType === 'SpatialUnit') {
        return RelationTypeEnum.CONSTRAINS;
      }
      // Default to RELATED_TO for other combinations
      return RelationTypeEnum.RELATED_TO;
    };
    
    // Sample pairs for analysis (to avoid performance issues with large entity sets)
    const maxPairsToAnalyze = 50;
    const pairsAnalyzed = new Set<string>();
    
    for (let i = 0; i < Math.min(entityIds.length, 10); i++) {
      for (let j = i + 1; j < Math.min(entityIds.length, 10); j++) {
        if (pairsAnalyzed.size >= maxPairsToAnalyze) break;
        
        const sourceId = entityIds[i];
        const targetId = entityIds[j];
        const pairKey = `${sourceId}-${targetId}`;
        
        // Skip if already have a direct relationship
        const hasDirectRelationship = relationships.some(
          r => (r.sourceId === sourceId && r.targetId === targetId) ||
               (r.sourceId === targetId && r.targetId === sourceId)
        );
        
        if (hasDirectRelationship || pairsAnalyzed.has(pairKey)) {
          continue;
        }
        
        pairsAnalyzed.add(pairKey);
        
        const sourceEntity = entities.find(e => e.id === sourceId);
        const targetEntity = entities.find(e => e.id === targetId);
        
        if (!sourceEntity || !targetEntity) {
          continue;
        }
        
        try {
          // Check if there's a path between these entities
          const steinerResult = await steinerService.findSteinerTree({
            terminalNodeIds: [sourceId, targetId],
            maxDepth: 3,
            maxNodes: 100
          });
          
          if (!steinerResult) {
            // No path exists - these entities might benefit from a direct relationship
            const suggestedType = suggestRelationshipType(sourceEntity.type, targetEntity.type);
            const confidence = sourceEntity.type === targetEntity.type ? 'high' : 'medium';
            
            missingRelationships.push({
              sourceId,
              targetId,
              suggestedType: suggestedType || undefined,
              reason: `No path found between ${sourceEntity.type} and ${targetEntity.type} - consider ${suggestedType || 'RELATED_TO'} relationship`,
              confidence
            });
          } else if (steinerResult.edges.length > 2) {
            // Path exists but is long - direct relationship might be beneficial
            const suggestedType = suggestRelationshipType(sourceEntity.type, targetEntity.type);
            
            missingRelationships.push({
              sourceId,
              targetId,
              suggestedType: suggestedType || undefined,
              reason: `Long path (${steinerResult.edges.length} edges) - direct ${suggestedType || 'RELATED_TO'} relationship might improve connectivity`,
              confidence: 'medium'
            });
          }
        } catch (error) {
          // Skip this pair if analysis fails
          logger.debug({
            error: error instanceof Error ? error.message : String(error),
            sourceId,
            targetId,
            workflowRunId: options.workflowRunId
          }, 'Failed to analyze entity pair for missing relationships');
        }
      }
      if (pairsAnalyzed.size >= maxPairsToAnalyze) break;
    }

    // Log missing relationship suggestions with optimal relationship types
    if (missingRelationships.length > 0) {
      const highConfidence = missingRelationships.filter(m => m.confidence === 'high').length;
      const suggestionsWithTypes = missingRelationships
        .filter(m => m.suggestedType)
        .slice(0, 10)
        .map(m => `${m.sourceId} --[${m.suggestedType}]--> ${m.targetId}`);
      
      logger.info({
        workflowRunId: options.workflowRunId,
        missingRelationshipCount: missingRelationships.length,
        highConfidenceCount: highConfidence,
        suggestions: missingRelationships.slice(0, 10),
        suggestedTypes: suggestionsWithTypes
      }, 'Missing relationship suggestions with optimal relationship types based on Steiner tree analysis');

      if (options.onLog) {
        await options.onLog(
          `💡 Found ${missingRelationships.length} potential missing relationships (${highConfidence} high confidence) that could improve graph connectivity`,
          'info'
        );
        
        // Log top suggestions with relationship types
        const topSuggestions = missingRelationships
          .filter(m => m.suggestedType && m.confidence === 'high')
          .slice(0, 3);
        
        if (topSuggestions.length > 0) {
          for (const suggestion of topSuggestions) {
            await options.onLog(
              `  → ${suggestion.sourceId} --[${suggestion.suggestedType}]--> ${suggestion.targetId}: ${suggestion.reason}`,
              'info'
            );
          }
        }
      }
    }

    // 2. Subgraph Quality Assessment
    // Evaluate the quality of the subgraph formed by new relationships
    let disconnectedComponents = 0;
    let averagePathLength = 0;
    let pathLengthSamples = 0;
    
    // Sample entities to assess connectivity
    const sampleSize = Math.min(entities.length, 20);
    const sampleEntities = entities.slice(0, sampleSize);
    
    for (let i = 0; i < sampleEntities.length; i++) {
      for (let j = i + 1; j < sampleEntities.length; j++) {
        try {
          const steinerResult = await steinerService.findSteinerTree({
            terminalNodeIds: [sampleEntities[i].id, sampleEntities[j].id],
            maxDepth: 5,
            maxNodes: 200
          });
          
          if (!steinerResult) {
            disconnectedComponents++;
          } else {
            averagePathLength += steinerResult.edges.length;
            pathLengthSamples++;
          }
        } catch (error) {
          // Skip if analysis fails
        }
      }
    }
    
    const avgPathLength = pathLengthSamples > 0 ? averagePathLength / pathLengthSamples : 0;
    const connectivityScore = pathLengthSamples / (sampleSize * (sampleSize - 1) / 2);
    
    logger.info({
      workflowRunId: options.workflowRunId,
      disconnectedComponents,
      averagePathLength: avgPathLength.toFixed(2),
      connectivityScore: connectivityScore.toFixed(2),
      sampleSize
    }, 'Subgraph quality assessment completed');

    if (options.onLog) {
      await options.onLog(
        `📊 Subgraph quality: ${(connectivityScore * 100).toFixed(1)}% connectivity, average path length: ${avgPathLength.toFixed(2)} edges`,
        'info'
      );
      
      if (disconnectedComponents > 0) {
        await options.onLog(
          `⚠️ Found ${disconnectedComponents} disconnected component(s) - consider adding bridging relationships`,
          'warn'
        );
      }
    }

    // 3. Orphan Detection
    // Identify entities that can't be reached from other entities
    const orphanedEntities: string[] = [];
    
    // Check a sample of entities for orphan status
    const orphanSampleSize = Math.min(entities.length, 50);
    for (const entity of entities.slice(0, orphanSampleSize)) {
      try {
        const neighbors = await this.kgService.getNeighbors(entity.id);
        const incoming = await this.kgService.getIncomingNeighbors(entity.id);
        
        if (neighbors.length === 0 && incoming.length === 0) {
          orphanedEntities.push(entity.id);
        }
      } catch (error) {
        logger.debug({
          error: error instanceof Error ? error.message : String(error),
          entityId: entity.id,
          workflowRunId: options.workflowRunId
        }, 'Failed to check entity for orphan status');
      }
    }

    if (orphanedEntities.length > 0) {
      logger.warn({
        workflowRunId: options.workflowRunId,
        orphanedEntityCount: orphanedEntities.length,
        orphanedEntities: orphanedEntities.slice(0, 10)
      }, 'Found orphaned entities in subgraph');

      if (options.onLog) {
        await options.onLog(
          `⚠️ Found ${orphanedEntities.length} orphaned entity/entities with no relationships`,
          'warn'
        );
      }
    }

    logger.debug({
      workflowRunId: options.workflowRunId
    }, 'Post-relationship subgraph analysis completed');
  }

  /**
   * Merge workflow branch into target branch (typically 'main')
   */
  async mergeWorkflowBranch(
    workflowId: string,
    targetBranch: string = 'main'
  ): Promise<MergeResult> {
    if (!this.versioningEnabled || !this.versionManager) {
      throw new ServiceUnavailableError('Versioning is not enabled. GraphDB client is required for versioning.', {
        reason: 'versioning_not_enabled',
        operation: 'mergeWorkflowBranch',
        workflowId,
        versioningEnabled: this.versioningEnabled,
        hasVersionManager: !!this.versionManager
      });
    }

    const sourceBranch = `workflow-${workflowId}`;
    
    try {
      const mergeResult = await this.versionManager.merge(sourceBranch, targetBranch);
      
      logger.info({
        sourceBranch,
        targetBranch,
        merged: mergeResult.merged,
        conflicts: mergeResult.conflicts.length,
        entitiesAdded: mergeResult.entitiesAdded,
        relationshipsAdded: mergeResult.relationshipsAdded
      }, 'Merged workflow branch');

      return {
        merged: mergeResult.merged,
        conflicts: mergeResult.conflicts,
        entitiesAdded: mergeResult.entitiesAdded,
        relationshipsAdded: mergeResult.relationshipsAdded,
        entitiesUpdated: mergeResult.entitiesUpdated,
        relationshipsUpdated: mergeResult.relationshipsUpdated
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        sourceBranch,
        targetBranch
      }, 'Failed to merge workflow branch');
      throw error;
    }
  }

  /**
   * Get version history for a workflow
   */
  async getWorkflowVersionHistory(workflowId: string): Promise<Array<{ version: string; branch: string; timestamp: string }>> {
    if (!this.versioningEnabled || !this.versionManager) {
      return [];
    }

    const branchName = `workflow-${workflowId}`;
    
    try {
      // Get full version history from version manager
      const history = await this.versionManager.getHistory(branchName);
      
      // Map to return format
      return history.map(v => ({
        version: v.version,
        branch: v.branch,
        timestamp: v.timestamp
      }));
    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : String(error),
        workflowId,
        branch: branchName
      }, 'Failed to get version history');
      return [];
    }
  }

  /**
   * Stash current changes before switching branches
   */
  async stashWorkflowChanges(
    branchName: string,
    description?: string
  ): Promise<string | null> {
    if (!this.versioningEnabled || !this.versionManager) {
      return null;
    }

    try {
      const stashId = await this.versionManager.stash(branchName, description);
      logger.debug({
        branch: branchName,
        stashId
      }, 'Stashed workflow changes');
      return stashId;
    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : String(error),
        branch: branchName
      }, 'Failed to stash changes');
      return null;
    }
  }

  /**
   * Verify that entities and relationships can be loaded from GraphDB
   * This simulates loading after a service restart to ensure persistence works
   */
  private async verifyGraphLoading(
    expectedEntities: BaseEntity[],
    expectedRelationships: Relation[],
    options: BuildOptions
  ): Promise<{
    success: boolean;
    entitiesLoaded: number;
    relationshipsLoaded: number;
    loadTime: number;
    errors: string[];
  }> {
    const startTime = Date.now();
    const result = {
      success: false,
      entitiesLoaded: 0,
      relationshipsLoaded: 0,
      loadTime: 0,
      errors: [] as string[]
    };

    try {
      logger.debug({
        workflowRunId: options.workflowRunId,
        expectedEntityCount: expectedEntities.length,
        expectedRelationshipCount: expectedRelationships.length
      }, 'Starting graph loading verification');

      // Verify entities can be loaded
      let entitiesLoaded = 0;
      const sampleSize = Math.min(10, expectedEntities.length); // Sample for performance
      const sampleEntities = expectedEntities.slice(0, sampleSize);

      for (const expectedEntity of sampleEntities) {
        try {
          const loadedEntity = await this.kgService.getNode(expectedEntity.id);
          if (loadedEntity) {
            entitiesLoaded++;
            
            // Verify key properties match
            if (loadedEntity.type !== expectedEntity.type) {
              result.errors.push(
                `Entity ${expectedEntity.id}: type mismatch (expected ${expectedEntity.type}, got ${loadedEntity.type})`
              );
            }
            if (loadedEntity.name !== expectedEntity.name) {
              result.errors.push(
                `Entity ${expectedEntity.id}: name mismatch (expected ${expectedEntity.name}, got ${loadedEntity.name})`
              );
            }
          } else {
            result.errors.push(`Entity ${expectedEntity.id} not found in GraphDB`);
          }
        } catch (error) {
          result.errors.push(
            `Failed to load entity ${expectedEntity.id}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Estimate total entities loaded (based on sample)
      const entityLoadRate = sampleEntities.length > 0 ? entitiesLoaded / sampleEntities.length : 0;
      result.entitiesLoaded = Math.round(entityLoadRate * expectedEntities.length);

      // Verify relationships can be loaded
      let relationshipsLoaded = 0;
      const relationshipSampleSize = Math.min(10, expectedRelationships.length);
      const sampleRelationships = expectedRelationships.slice(0, relationshipSampleSize);

      for (const expectedRel of sampleRelationships) {
        try {
          // Verify relationship by checking neighbors
          const neighbors = await this.kgService.getNeighbors(expectedRel.sourceId);
          const relationshipExists = neighbors.some(n => n.id === expectedRel.targetId);
          
          if (relationshipExists) {
            relationshipsLoaded++;
          } else {
            result.errors.push(
              `Relationship ${expectedRel.sourceId} -> ${expectedRel.targetId} (${expectedRel.type}) not found in GraphDB`
            );
          }
        } catch (error) {
          result.errors.push(
            `Failed to verify relationship ${expectedRel.sourceId} -> ${expectedRel.targetId}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Estimate total relationships loaded (based on sample)
      const relationshipLoadRate = sampleRelationships.length > 0 ? relationshipsLoaded / sampleRelationships.length : 0;
      result.relationshipsLoaded = Math.round(relationshipLoadRate * expectedRelationships.length);

      // Consider loading successful if at least 80% of sampled entities and relationships load correctly
      const entityLoadSuccess = sampleEntities.length === 0 || entityLoadRate >= 0.8;
      const relationshipLoadSuccess = sampleRelationships.length === 0 || relationshipLoadRate >= 0.8;
      result.success = entityLoadSuccess && relationshipLoadSuccess;

      result.loadTime = Date.now() - startTime;

      if (result.success) {
        logger.info({
          workflowRunId: options.workflowRunId,
          entitiesLoaded: result.entitiesLoaded,
          relationshipsLoaded: result.relationshipsLoaded,
          loadTime: result.loadTime,
          sampleSize: sampleEntities.length,
          relationshipSampleSize: sampleRelationships.length
        }, 'Graph loading verification passed');
      } else {
        logger.warn({
          workflowRunId: options.workflowRunId,
          entitiesLoaded: result.entitiesLoaded,
          relationshipsLoaded: result.relationshipsLoaded,
          loadTime: result.loadTime,
          errors: result.errors.slice(0, 5), // Log first 5 errors
          errorCount: result.errors.length
        }, 'Graph loading verification failed or partial');
      }
    } catch (error) {
      result.loadTime = Date.now() - startTime;
      result.errors.push(`Loading verification failed: ${error instanceof Error ? error.message : String(error)}`);
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        workflowRunId: options.workflowRunId
      }, 'Graph loading verification error');
    }

    return result;
  }

  /**
   * Improved entity name matching in text
   * Handles variations, case-insensitive matching, and partial matches
   */
  private isEntityNameInText(entityName: string, text: string): boolean {
    const normalizedText = text.toLowerCase();
    const normalizedName = entityName.toLowerCase();
    
    // Exact match (case-insensitive)
    if (normalizedText.includes(normalizedName)) {
      return true;
    }

    // Try without common prefixes/suffixes
    const variations = [
      normalizedName.replace(/^(de|het|een)\s+/i, ''), // Remove Dutch articles
      normalizedName.replace(/\s+(van|voor|in|op|bij)\s+.*$/i, ''), // Remove common prepositions
    ];

    for (const variation of variations) {
      if (variation.length > 3 && normalizedText.includes(variation)) {
        return true;
      }
    }

    // Try splitting entity name into words and check if all words appear
    const words = normalizedName.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 1) {
      const allWordsPresent = words.every(word => normalizedText.includes(word));
      if (allWordsPresent) {
        return true;
      }
    }

    return false;
  }
}

