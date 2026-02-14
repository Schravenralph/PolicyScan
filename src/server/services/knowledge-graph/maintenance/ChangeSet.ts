import { BaseEntity, Relation } from '../../../domain/ontology.js';
import { ScrapedDocument } from '../../infrastructure/types.js';

/**
 * Represents a detected change in an entity
 */
export interface EntityChange {
  entityId: string;
  entityType: string;
  changeType: 'new' | 'updated' | 'deleted';
  oldValue?: BaseEntity;
  newValue?: BaseEntity;
  changedFields?: string[];
  sourceDocument?: string; // URL of source document
  detectionTimestamp: Date;
}

/**
 * Represents a detected change in a relationship
 */
export interface RelationshipChange {
  sourceId: string;
  targetId: string;
  relationType: string;
  changeType: 'new' | 'updated' | 'deleted';
  oldValue?: Relation;
  newValue?: Relation;
  sourceDocument?: string; // URL of source document
  detectionTimestamp: Date;
}

/**
 * Represents a detected change in a document
 */
export interface DocumentChange {
  documentUrl: string;
  changeType: 'new' | 'updated' | 'deleted';
  oldContentHash?: string;
  newContentHash?: string;
  oldMetadata?: Partial<ScrapedDocument>;
  newMetadata?: Partial<ScrapedDocument>;
  changedFields?: string[];
  detectionTimestamp: Date;
}

/**
 * Change set containing all detected changes
 */
export interface ChangeSet {
  id: string;
  detectionTimestamp: Date;
  sourceDocument?: string; // URL of source document if single document
  sourceDocuments?: string[]; // URLs of source documents if batch
  
  // Entity changes
  newEntities: EntityChange[];
  updatedEntities: EntityChange[];
  deletedEntities: EntityChange[];
  
  // Relationship changes
  newRelationships: RelationshipChange[];
  updatedRelationships: RelationshipChange[];
  deletedRelationships: RelationshipChange[];
  
  // Document changes
  newDocuments: DocumentChange[];
  updatedDocuments: DocumentChange[];
  deletedDocuments: DocumentChange[];
  
  // Metadata
  totalChanges: number;
  detectionMethod: 'content_hash' | 'timestamp' | 'metadata_diff' | 'structured_diff' | 'entity_level_diff' | 'combined';
  processingTimeMs: number;
}

/**
 * Options for change detection
 */
export interface ChangeDetectionOptions {
  detectionMethods?: ('content_hash' | 'timestamp' | 'metadata_diff' | 'structured_diff' | 'entity_level_diff')[];
  includeMetadata?: boolean;
  includeRelationships?: boolean;
  batchSize?: number;
  contentHashAlgorithm?: 'sha256' | 'md5';
}

/**
 * Result of change detection operation
 */
export interface ChangeDetectionResult {
  changeSet: ChangeSet;
  documentsProcessed: number;
  changesDetected: number;
  processingTimeMs: number;
  errors?: string[];
}

