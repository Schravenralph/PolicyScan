import { RelationType, EntityType } from '../../../domain/ontology.js';

/**
 * Extracted relationship from LLM
 */
export interface ExtractedRelationship {
  sourceId: string;
  targetId: string;
  type: RelationType;
  confidence: number; // 0-1
  sourceText?: string; // Text snippet that indicates the relationship
  metadata?: Record<string, unknown>;
}

/**
 * Relationship extraction result for a document
 */
export interface RelationshipExtractionResult {
  relationships: ExtractedRelationship[];
  documentId: string;
  extractionTime: number; // milliseconds
  success: boolean;
  error?: string;
  cost?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number; // USD
  };
}

/**
 * Batch extraction result
 */
export interface BatchExtractionResult {
  results: RelationshipExtractionResult[];
  totalRelationships: number;
  totalTime: number;
  totalCost: number;
  successCount: number;
  failureCount: number;
}

/**
 * Relationship extraction context
 */
export interface ExtractionContext {
  documentId: string;
  documentText: string;
  documentTitle?: string;
  documentUrl?: string;
  existingEntities: Array<{
    id: string;
    type: EntityType;
    name: string;
  }>;
  jurisdiction?: string;
}

