/**
 * TypeScript interfaces for entity extraction models
 * These mirror Pydantic models for structured LLM output
 */

import {
  PolicyDocument,
  Regulation,
  SpatialUnit,
  LandUse,
  Requirement,
  BaseEntity
} from '../../../../domain/ontology.js';

/**
 * Base extraction result with provenance
 */
export interface ExtractionProvenance {
  sourceUrl: string;
  documentId: string;
  extractionTimestamp: string;
  extractionMethod: 'llm' | 'rule-based';
  confidence?: number;
}

/**
 * PolicyDocument extraction model
 */
export interface PolicyDocumentExtractionModel extends PolicyDocument {
  provenance?: ExtractionProvenance;
}

/**
 * Regulation extraction model
 */
export interface RegulationExtractionModel extends Regulation {
  provenance?: ExtractionProvenance;
  legalReferences?: string[];
}

/**
 * SpatialUnit extraction model
 */
export interface SpatialUnitExtractionModel extends SpatialUnit {
  provenance?: ExtractionProvenance;
}

/**
 * LandUse extraction model
 */
export interface LandUseExtractionModel extends LandUse {
  provenance?: ExtractionProvenance;
}

/**
 * Requirement extraction model
 */
export interface RequirementExtractionModel extends Requirement {
  provenance?: ExtractionProvenance;
}

/**
 * Combined extraction result for a document
 */
export interface EntityExtractionResult {
  policyDocuments: PolicyDocumentExtractionModel[];
  regulations: RegulationExtractionModel[];
  spatialUnits: SpatialUnitExtractionModel[];
  landUses: LandUseExtractionModel[];
  requirements: RequirementExtractionModel[];
  metadata: {
    extractionTime: number;
    totalEntities: number;
    confidence: number;
    cost?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      estimatedCost: number;
    };
  };
}

/**
 * Parsed LLM extraction response structure
 * This matches the JSON structure returned by the LLM
 */
export interface ParsedLLMExtractionResponse {
  policyDocuments?: Array<{
    id?: string;
    name?: string;
    documentType?: string;
    status?: string;
    jurisdiction?: string;
    date?: string;
    url?: string;
    description?: string;
  }>;
  regulations?: Array<{
    id?: string;
    name?: string;
    category?: string;
    description?: string;
    legalReferences?: string[];
  }>;
  spatialUnits?: Array<{
    id?: string;
    name?: string;
    spatialType?: string;
    description?: string;
  }>;
  landUses?: Array<{
    id?: string;
    name?: string;
    category?: string;
  }>;
  requirements?: Array<{
    id?: string;
    name?: string;
    operator?: string;
    value?: unknown;
    description?: string;
    metric?: string;
    unit?: string;
  }>;
}

/**
 * Batch extraction result
 */
export interface BatchExtractionResult {
  results: EntityExtractionResult[];
  summary: {
    totalDocuments: number;
    successful: number;
    failed: number;
    totalEntities: number;
    totalCost: number;
    averageExtractionTime: number;
  };
}

