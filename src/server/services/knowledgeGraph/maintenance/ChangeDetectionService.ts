import { getDB } from '../../../config/database.js';
import { ObjectId } from 'mongodb';
import { BaseEntity, Relation } from '../../../domain/ontology.js';
import { ScrapedDocument } from '../../infrastructure/types.js';
import { KnowledgeGraphService, getKnowledgeGraphService } from '../../knowledge-graph/core/KnowledgeGraph.js';
import { getNeo4jDriver } from '../../../config/neo4j.js';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';
import { logger } from '../../../utils/logger.js';
import { ContentHasher } from '../../knowledge-graph/maintenance/ContentHasher.js';
import { getCanonicalDocumentService } from '../../canonical/CanonicalDocumentService.js';
import { transformCanonicalToLegacy } from '../../../utils/canonicalToLegacyTransformer.js';
import {
  ChangeSet,
  ChangeDetectionOptions,
  ChangeDetectionResult,
  EntityChange,
  RelationshipChange,
  DocumentChange
} from '../../knowledge-graph/maintenance/ChangeSet.js';

/**
 * Service for detecting changes in source documents and knowledge graph entities
 */
export class ChangeDetectionService {
  private kgService: KnowledgeGraphService;
  private db = getDB();

  constructor(kgService?: KnowledgeGraphService) {
    if (kgService) {
      this.kgService = kgService;
    } else {
      const driver = getNeo4jDriver();
      this.kgService = getKnowledgeGraphService(driver);
    }
  }

  /**
   * Check if change detection is enabled
   */
  private isEnabled(): boolean {
    return FeatureFlag.isEnabled(KGFeatureFlag.KG_CHANGE_DETECTION_ENABLED, false);
  }

  /**
   * Detect changes in a single document
   */
  async detectDocumentChanges(
    document: ScrapedDocument,
    options: ChangeDetectionOptions = {}
  ): Promise<ChangeSet> {
    if (!this.isEnabled()) {
      logger.debug('[ChangeDetection] Change detection is disabled');
      return this.createEmptyChangeSet('combined');
    }

    const startTime = Date.now();
    const detectionMethods = options.detectionMethods || ['content_hash', 'timestamp', 'metadata_diff'];
    
    // Get existing document from database using canonical service
    const documentService = getCanonicalDocumentService();
    const canonicalDoc = await documentService.findByUrl(document.url);
    const existingDoc = canonicalDoc ? transformCanonicalToLegacy(canonicalDoc) : null;
    
    const changeSet: ChangeSet = {
      id: new ObjectId().toString(),
      detectionTimestamp: new Date(),
      sourceDocument: document.url,
      newEntities: [],
      updatedEntities: [],
      deletedEntities: [],
      newRelationships: [],
      updatedRelationships: [],
      deletedRelationships: [],
      newDocuments: [],
      updatedDocuments: [],
      deletedDocuments: [],
      totalChanges: 0,
      detectionMethod: detectionMethods.length > 1 ? 'combined' : detectionMethods[0] as any,
      processingTimeMs: 0
    };

    // Detect document changes
    if (!existingDoc) {
      // New document
      const docChange: DocumentChange = {
        documentUrl: document.url,
        changeType: 'new',
        newContentHash: ContentHasher.hashDocument(document),
        newMetadata: document,
        detectionTimestamp: new Date()
      };
      changeSet.newDocuments.push(docChange);
    } else {
      // Check for updates
      const changes: DocumentChange[] = [];
      
      if (detectionMethods.includes('content_hash')) {
        const oldHash = ContentHasher.hashDocument({
          titel: existingDoc.titel,
          samenvatting: existingDoc.samenvatting || '',
          url: existingDoc.url
        });
        const newHash = ContentHasher.hashDocument(document);
        
        if (!ContentHasher.compare(oldHash, newHash)) {
          changes.push({
            documentUrl: document.url,
            changeType: 'updated',
            oldContentHash: oldHash,
            newContentHash: newHash,
            oldMetadata: existingDoc as unknown as Partial<ScrapedDocument>,
            newMetadata: document,
            detectionTimestamp: new Date()
          });
        }
      }
      
      if (detectionMethods.includes('timestamp')) {
        const existingUpdated = existingDoc.updatedAt || existingDoc.createdAt;
        const docDate = document.publicatiedatum ? new Date(document.publicatiedatum) : new Date();
        
        if (docDate > existingUpdated) {
          // Document was updated
          if (changes.length === 0) {
            changes.push({
              documentUrl: document.url,
              changeType: 'updated',
              oldMetadata: existingDoc as unknown as Partial<ScrapedDocument>,
              newMetadata: document,
              detectionTimestamp: new Date()
            });
          }
        }
      }
      
      if (detectionMethods.includes('metadata_diff')) {
        const changedFields = this.detectMetadataChanges(existingDoc as unknown as Partial<ScrapedDocument>, document);
        if (changedFields.length > 0) {
          if (changes.length === 0) {
            changes.push({
              documentUrl: document.url,
              changeType: 'updated',
              oldMetadata: existingDoc as unknown as Partial<ScrapedDocument>,
              newMetadata: document,
              changedFields,
              detectionTimestamp: new Date()
            });
          } else {
            changes[0].changedFields = changedFields;
          }
        }
      }
      
      if (changes.length > 0) {
        changeSet.updatedDocuments.push(...changes);
      }
    }

    // Detect entity changes if enabled
    if (options.includeMetadata !== false) {
      const entityChanges = await this.detectEntityChanges(document, detectionMethods);
      changeSet.newEntities.push(...entityChanges.newEntities);
      changeSet.updatedEntities.push(...entityChanges.updatedEntities);
      changeSet.deletedEntities.push(...entityChanges.deletedEntities);
    }

    // Detect relationship changes if enabled
    if (options.includeRelationships !== false) {
      const relationshipChanges = await this.detectRelationshipChanges(document, detectionMethods);
      changeSet.newRelationships.push(...relationshipChanges.newRelationships);
      changeSet.updatedRelationships.push(...relationshipChanges.updatedRelationships);
      changeSet.deletedRelationships.push(...relationshipChanges.deletedRelationships);
    }

    changeSet.totalChanges = 
      changeSet.newDocuments.length +
      changeSet.updatedDocuments.length +
      changeSet.deletedDocuments.length +
      changeSet.newEntities.length +
      changeSet.updatedEntities.length +
      changeSet.deletedEntities.length +
      changeSet.newRelationships.length +
      changeSet.updatedRelationships.length +
      changeSet.deletedRelationships.length;
    
    changeSet.processingTimeMs = Date.now() - startTime;

    return changeSet;
  }

  /**
   * Detect changes in multiple documents (batch processing)
   */
  async detectBatchChanges(
    documents: ScrapedDocument[],
    options: ChangeDetectionOptions = {}
  ): Promise<ChangeDetectionResult> {
    if (!this.isEnabled()) {
      logger.debug('[ChangeDetection] Change detection is disabled');
      return {
        changeSet: this.createEmptyChangeSet('combined'),
        documentsProcessed: 0,
        changesDetected: 0,
        processingTimeMs: 0
      };
    }

    const startTime = Date.now();
    const batchSize = options.batchSize || 10;
    const errors: string[] = [];
    let totalChanges = 0;

    const combinedChangeSet: ChangeSet = {
      id: new ObjectId().toString(),
      detectionTimestamp: new Date(),
      sourceDocuments: documents.map(d => d.url),
      newEntities: [],
      updatedEntities: [],
      deletedEntities: [],
      newRelationships: [],
      updatedRelationships: [],
      deletedRelationships: [],
      newDocuments: [],
      updatedDocuments: [],
      deletedDocuments: [],
      totalChanges: 0,
      detectionMethod: 'combined',
      processingTimeMs: 0
    };

    // Process in batches
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      
      for (const document of batch) {
        try {
          const changeSet = await this.detectDocumentChanges(document, options);
          
          // Merge into combined change set
          combinedChangeSet.newDocuments.push(...changeSet.newDocuments);
          combinedChangeSet.updatedDocuments.push(...changeSet.updatedDocuments);
          combinedChangeSet.deletedDocuments.push(...changeSet.deletedDocuments);
          combinedChangeSet.newEntities.push(...changeSet.newEntities);
          combinedChangeSet.updatedEntities.push(...changeSet.updatedEntities);
          combinedChangeSet.deletedEntities.push(...changeSet.deletedEntities);
          combinedChangeSet.newRelationships.push(...changeSet.newRelationships);
          combinedChangeSet.updatedRelationships.push(...changeSet.updatedRelationships);
          combinedChangeSet.deletedRelationships.push(...changeSet.deletedRelationships);
          
          totalChanges += changeSet.totalChanges;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Failed to detect changes for ${document.url}: ${errorMsg}`);
          logger.error({ error, url: document.url }, '[ChangeDetection] Error detecting changes for document');
        }
      }
    }

    combinedChangeSet.totalChanges = totalChanges;
    combinedChangeSet.processingTimeMs = Date.now() - startTime;

    return {
      changeSet: combinedChangeSet,
      documentsProcessed: documents.length,
      changesDetected: totalChanges,
      processingTimeMs: combinedChangeSet.processingTimeMs,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Detect entity changes for a document
   */
  private async detectEntityChanges(
    document: ScrapedDocument,
    detectionMethods: string[]
  ): Promise<{
    newEntities: EntityChange[];
    updatedEntities: EntityChange[];
    deletedEntities: EntityChange[];
  }> {
    const result = {
      newEntities: [] as EntityChange[],
      updatedEntities: [] as EntityChange[],
      deletedEntities: [] as EntityChange[]
    };

    if (!detectionMethods.includes('entity_level_diff')) {
      return result;
    }

    try {
      // Get entities linked to this document URL
      // Note: This assumes entities have a metadata field with sourceUrl
      // If not, we'll need to query by document URL pattern
      const allEntities = await this.kgService.getAllNodes();
      const documentEntities = allEntities.filter(e => {
        const metadata = e.metadata || {};
        return metadata.sourceUrl === document.url || metadata.documentUrl === document.url;
      });

      // For now, we'll detect entity changes by comparing entity hashes
      // In a full implementation, we'd extract entities from the document and compare
      for (const entity of documentEntities) {
        const entityHash = ContentHasher.hashEntity(entity);
        
        // Check if entity exists in KG
        const existingEntity = await this.kgService.getNode(entity.id);
        
        if (!existingEntity) {
          result.newEntities.push({
            entityId: entity.id,
            entityType: entity.type,
            changeType: 'new',
            newValue: entity,
            sourceDocument: document.url,
            detectionTimestamp: new Date()
          });
        } else {
          const existingHash = ContentHasher.hashEntity(existingEntity);
          if (!ContentHasher.compare(entityHash, existingHash)) {
            // Detect changed fields
            const changedFields = this.detectEntityFieldChanges(existingEntity, entity);
            
            result.updatedEntities.push({
              entityId: entity.id,
              entityType: entity.type,
              changeType: 'updated',
              oldValue: existingEntity,
              newValue: entity,
              changedFields,
              sourceDocument: document.url,
              detectionTimestamp: new Date()
            });
          }
        }
      }
    } catch (error) {
      logger.error({ error }, '[ChangeDetection] Error detecting entity changes');
    }

    return result;
  }

  /**
   * Detect relationship changes for a document
   */
  private async detectRelationshipChanges(
    document: ScrapedDocument,
    detectionMethods: string[]
  ): Promise<{
    newRelationships: RelationshipChange[];
    updatedRelationships: RelationshipChange[];
    deletedRelationships: RelationshipChange[];
  }> {
    const result = {
      newRelationships: [] as RelationshipChange[],
      updatedRelationships: [] as RelationshipChange[],
      deletedRelationships: [] as RelationshipChange[]
    };

    // Relationship change detection would require comparing relationships
    // extracted from the document with existing relationships in the KG
    // This is a simplified implementation
    
    return result;
  }

  /**
   * Detect metadata changes between two documents
   */
  private detectMetadataChanges(
    oldDoc: Partial<ScrapedDocument>,
    newDoc: ScrapedDocument
  ): string[] {
    const changedFields: string[] = [];
    
    const fieldsToCheck: (keyof ScrapedDocument)[] = [
      'titel',
      'samenvatting',
      'type_document',
      'publicatiedatum',
      'subjects',
      'themes'
    ];

    for (const field of fieldsToCheck) {
      const oldValue = oldDoc[field];
      const newValue = newDoc[field];
      
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changedFields.push(field);
      }
    }

    return changedFields;
  }

  /**
   * Detect field changes between two entities
   */
  private detectEntityFieldChanges(
    oldEntity: BaseEntity,
    newEntity: BaseEntity
  ): string[] {
    const changedFields: string[] = [];
    
    if (oldEntity.name !== newEntity.name) changedFields.push('name');
    if (oldEntity.description !== newEntity.description) changedFields.push('description');
    if (JSON.stringify(oldEntity.metadata) !== JSON.stringify(newEntity.metadata)) {
      changedFields.push('metadata');
    }

    return changedFields;
  }

  /**
   * Create an empty change set
   */
  private createEmptyChangeSet(method: ChangeSet['detectionMethod']): ChangeSet {
    return {
      id: new ObjectId().toString(),
      detectionTimestamp: new Date(),
      newEntities: [],
      updatedEntities: [],
      deletedEntities: [],
      newRelationships: [],
      updatedRelationships: [],
      deletedRelationships: [],
      newDocuments: [],
      updatedDocuments: [],
      deletedDocuments: [],
      totalChanges: 0,
      detectionMethod: method,
      processingTimeMs: 0
    };
  }

  /**
   * Get the knowledge graph service instance
   */
  getKnowledgeGraphService(): KnowledgeGraphService {
    return this.kgService;
  }
}

