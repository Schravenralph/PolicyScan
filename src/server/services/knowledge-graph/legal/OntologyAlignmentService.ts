/**
 * Ontology Alignment Service
 * Maps knowledge graph entities to IMBOR (Dutch infrastructure ontology) and EuroVoc (European vocabulary)
 */

import { BaseEntity, EntityType } from '../../../domain/ontology.js';
import { IMBORMapper, IMBORAlignment, IMBORAlignmentResult } from './IMBORMapper.js';
import { EuroVocMapper, EuroVocAlignment, EuroVocAlignmentResult } from './EuroVocMapper.js';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';
import { logger } from '../../../utils/logger.js';

export interface OntologyAlignment {
  entityId: string;
  entityName: string;
  entityType: EntityType;
  imborAlignments?: IMBORAlignment[];
  euroVocAlignments?: EuroVocAlignment[];
  overallConfidence: number;
  needsManualReview: boolean;
  createdAt: Date;
}

export interface AlignmentOptions {
  includeIMBOR?: boolean;
  includeEuroVoc?: boolean;
  minConfidence?: number;
  validateAlignments?: boolean;
}

export interface AlignmentResult {
  alignments: OntologyAlignment[];
  totalEntities: number;
  alignedEntities: number;
  imborResult?: IMBORAlignmentResult;
  euroVocResult?: EuroVocAlignmentResult;
  averageConfidence: number;
  entitiesNeedingReview: number;
}

export interface AlignmentReport {
  totalEntities: number;
  alignedEntities: number;
  alignmentRate: number;
  averageConfidence: number;
  imborReport?: {
    alignedEntities: number;
    averageConfidence: number;
    topTerms: Array<{ term: string; count: number }>;
  };
  euroVocReport?: {
    alignedEntities: number;
    averageConfidence: number;
    alignmentsByLanguage: Record<string, number>;
  };
  entitiesNeedingReview: number;
}

/**
 * Service for aligning knowledge graph entities with legal ontologies (IMBOR, EuroVoc)
 */
export class OntologyAlignmentService {
  private imborMapper: IMBORMapper;
  private euroVocMapper: EuroVocMapper;
  private readonly DEFAULT_MIN_CONFIDENCE = 0.6;

  constructor(imborMapper?: IMBORMapper, euroVocMapper?: EuroVocMapper) {
    this.imborMapper = imborMapper || new IMBORMapper();
    this.euroVocMapper = euroVocMapper || new EuroVocMapper();
  }

  /**
   * Check if ontology alignment is enabled
   */
  isEnabled(): boolean {
    return FeatureFlag.isEnabled(KGFeatureFlag.KG_ONTOLOGY_ALIGNMENT_ENABLED, false);
  }

  /**
   * Align a single entity with ontologies
   */
  async alignEntity(
    entity: BaseEntity,
    options: AlignmentOptions = {}
  ): Promise<OntologyAlignment> {
    if (!this.isEnabled()) {
      throw new Error('Ontology alignment is not enabled. Set KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag.');
    }

    const {
      includeIMBOR = true,
      includeEuroVoc = true,
      minConfidence = this.DEFAULT_MIN_CONFIDENCE,
      validateAlignments = true,
    } = options;

    const alignment: OntologyAlignment = {
      entityId: entity.id,
      entityName: entity.name,
      entityType: entity.type,
      overallConfidence: 0,
      needsManualReview: false,
      createdAt: new Date(),
    };

    let totalConfidence = 0;
    let confidenceCount = 0;

    // IMBOR alignment
    if (includeIMBOR) {
      try {
        const imborAlignments = await this.imborMapper.mapEntity(entity);
        
        // Filter by minimum confidence
        const filteredAlignments = imborAlignments.filter(a => a.confidence >= minConfidence);
        
        // Set alignments (empty array if all filtered out, to indicate we tried but none met threshold)
        alignment.imborAlignments = imborAlignments.length > 0 ? filteredAlignments : [];
        
        if (filteredAlignments.length > 0) {
          // Validate if requested
          if (validateAlignments) {
            for (const a of filteredAlignments) {
              const validation = this.imborMapper.validateAlignment(a);
              if (!validation.valid) {
                alignment.needsManualReview = true;
                logger.warn({ validationIssues: validation.issues, entityId: entity.id }, `[OntologyAlignmentService] IMBOR alignment validation failed for entity ${entity.id}`);
              }
            }
          }

          const avgConfidence = filteredAlignments.reduce((sum, a) => sum + a.confidence, 0) / filteredAlignments.length;
          totalConfidence += avgConfidence;
          confidenceCount++;
        } else if (imborAlignments.length > 0) {
          // We had alignments but they were all filtered out - use original alignments for confidence calculation
          const avgConfidence = imborAlignments.reduce((sum, a) => sum + a.confidence, 0) / imborAlignments.length;
          totalConfidence += avgConfidence;
          confidenceCount++;
        }
      } catch (error) {
        logger.error({ error, entityId: entity.id }, '[OntologyAlignmentService] Error aligning entity with IMBOR');
      }
    }

    // EuroVoc alignment
    if (includeEuroVoc) {
      try {
        const euroVocAlignments = await this.euroVocMapper.mapEntity(entity);
        
        // Filter by minimum confidence
        const filteredAlignments = euroVocAlignments.filter(a => a.confidence >= minConfidence);
        
        // Set alignments (empty array if all filtered out, to indicate we tried but none met threshold)
        alignment.euroVocAlignments = euroVocAlignments.length > 0 ? filteredAlignments : [];
        
        if (filteredAlignments.length > 0) {
          // Validate if requested
          if (validateAlignments) {
            for (const a of filteredAlignments) {
              const validation = this.euroVocMapper.validateAlignment(a);
              if (!validation.valid) {
                alignment.needsManualReview = true;
                logger.warn({ validationIssues: validation.issues, entityId: entity.id }, `[OntologyAlignmentService] EuroVoc alignment validation failed for entity ${entity.id}`);
              }
            }
          }

          const avgConfidence = filteredAlignments.reduce((sum, a) => sum + a.confidence, 0) / filteredAlignments.length;
          totalConfidence += avgConfidence;
          confidenceCount++;
        } else if (euroVocAlignments.length > 0) {
          // We had alignments but they were all filtered out - use original alignments for confidence calculation
          const avgConfidence = euroVocAlignments.reduce((sum, a) => sum + a.confidence, 0) / euroVocAlignments.length;
          totalConfidence += avgConfidence;
          confidenceCount++;
        }
      } catch (error) {
        logger.error({ error, entityId: entity.id }, '[OntologyAlignmentService] Error aligning entity with EuroVoc');
      }
    }

    // Calculate overall confidence
    alignment.overallConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    // Flag for manual review if confidence is low or validation failed
    if (alignment.overallConfidence < minConfidence) {
      alignment.needsManualReview = true;
    }

    return alignment;
  }

  /**
   * Align multiple entities with ontologies
   */
  async alignEntities(
    entities: BaseEntity[],
    options: AlignmentOptions = {}
  ): Promise<AlignmentResult> {
    if (!this.isEnabled()) {
      throw new Error('Ontology alignment is not enabled. Set KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag.');
    }

    const {
      includeIMBOR = true,
      includeEuroVoc = true,
      minConfidence = this.DEFAULT_MIN_CONFIDENCE,
      validateAlignments = true,
    } = options;

    const alignments: OntologyAlignment[] = [];
    let totalConfidence = 0;
    let alignedCount = 0;
    let needsReviewCount = 0;

    let imborResult: IMBORAlignmentResult | undefined;
    let euroVocResult: EuroVocAlignmentResult | undefined;

    // Batch IMBOR alignment
    if (includeIMBOR) {
      try {
        imborResult = await this.imborMapper.mapEntities(entities);
      } catch (error) {
        logger.error({ error }, '[OntologyAlignmentService] Error in batch IMBOR alignment');
      }
    }

    // Batch EuroVoc alignment
    if (includeEuroVoc) {
      try {
        euroVocResult = await this.euroVocMapper.mapEntities(entities);
      } catch (error) {
        logger.error({ error }, '[OntologyAlignmentService] Error in batch EuroVoc alignment');
      }
    }

    // Combine results per entity
    const imborMap = new Map<string, IMBORAlignment[]>();
    if (imborResult) {
      for (const alignment of imborResult.alignments) {
        const existing = imborMap.get(alignment.entityId) || [];
        existing.push(alignment);
        imborMap.set(alignment.entityId, existing);
      }
    }

    const euroVocMap = new Map<string, EuroVocAlignment[]>();
    if (euroVocResult) {
      for (const alignment of euroVocResult.alignments) {
        const existing = euroVocMap.get(alignment.entityId) || [];
        existing.push(alignment);
        euroVocMap.set(alignment.entityId, existing);
      }
    }

    // Create combined alignments
    for (const entity of entities) {
      // Get all alignments (before filtering) to calculate overall confidence
      const allImborAlignments = imborMap.get(entity.id) || [];
      const allEuroVocAlignments = euroVocMap.get(entity.id) || [];

      // Only process entities that have at least one alignment
      if (allImborAlignments.length > 0 || allEuroVocAlignments.length > 0) {
        let entityConfidence = 0;
        let confidenceCount = 0;

        if (allImborAlignments.length > 0) {
          const avg = allImborAlignments.reduce((sum, a) => sum + a.confidence, 0) / allImborAlignments.length;
          entityConfidence += avg;
          confidenceCount++;
        }

        if (allEuroVocAlignments.length > 0) {
          const avg = allEuroVocAlignments.reduce((sum, a) => sum + a.confidence, 0) / allEuroVocAlignments.length;
          entityConfidence += avg;
          confidenceCount++;
        }

        const overallConfidence = confidenceCount > 0 ? entityConfidence / confidenceCount : 0;
        const needsManualReview = overallConfidence < minConfidence;

        // Filter alignments by minConfidence for the final result
        const imborAlignments = allImborAlignments.filter(a => a.confidence >= minConfidence);
        const euroVocAlignments = allEuroVocAlignments.filter(a => a.confidence >= minConfidence);

        alignments.push({
          entityId: entity.id,
          entityName: entity.name,
          entityType: entity.type,
          imborAlignments: imborAlignments.length > 0 ? imborAlignments : undefined,
          euroVocAlignments: euroVocAlignments.length > 0 ? euroVocAlignments : undefined,
          overallConfidence,
          needsManualReview,
          createdAt: new Date(),
        });

        alignedCount++;
        totalConfidence += overallConfidence;
        if (needsManualReview) {
          needsReviewCount++;
        }
      }
    }

    const averageConfidence = alignedCount > 0 ? totalConfidence / alignedCount : 0;

    return {
      alignments,
      totalEntities: entities.length,
      alignedEntities: alignedCount,
      imborResult,
      euroVocResult,
      averageConfidence,
      entitiesNeedingReview: needsReviewCount,
    };
  }

  /**
   * Get ontology alignments for a specific entity
   */
  async getEntityAlignments(entityId: string, entity: BaseEntity): Promise<OntologyAlignment | null> {
    if (!this.isEnabled()) {
      return null;
    }

    return await this.alignEntity(entity);
  }

  /**
   * Query entities by ontology term (IMBOR or EuroVoc)
   */
  async queryByOntologyTerm(
    term: string,
    ontology: 'IMBOR' | 'EuroVoc',
    entities: BaseEntity[]
  ): Promise<BaseEntity[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const matchingEntities: BaseEntity[] = [];

    for (const entity of entities) {
      const alignment = await this.alignEntity(entity);
      
      if (ontology === 'IMBOR' && alignment.imborAlignments) {
        const matches = alignment.imborAlignments.some(a => 
          a.imborTerm.toLowerCase().includes(term.toLowerCase())
        );
        if (matches) {
          matchingEntities.push(entity);
        }
      } else if (ontology === 'EuroVoc' && alignment.euroVocAlignments) {
        const matches = alignment.euroVocAlignments.some(a => 
          a.euroVocLabel.toLowerCase().includes(term.toLowerCase())
        );
        if (matches) {
          matchingEntities.push(entity);
        }
      }
    }

    return matchingEntities;
  }

  /**
   * Generate alignment report
   */
  async generateAlignmentReport(entities: BaseEntity[]): Promise<AlignmentReport> {
    if (!this.isEnabled()) {
      throw new Error('Ontology alignment is not enabled. Set KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag.');
    }

    const result = await this.alignEntities(entities);

    let imborReport;
    let euroVocReport;

    if (result.imborResult) {
      const imborReportData = await this.imborMapper.generateAlignmentReport(entities);
      imborReport = {
        alignedEntities: imborReportData.alignedEntities,
        averageConfidence: imborReportData.averageConfidence,
        topTerms: imborReportData.topIMBORTerms,
      };
    }

    if (result.euroVocResult) {
      const euroVocReportData = await this.euroVocMapper.generateAlignmentReport(entities);
      euroVocReport = {
        alignedEntities: euroVocReportData.alignedEntities,
        averageConfidence: euroVocReportData.averageConfidence,
        alignmentsByLanguage: euroVocReportData.alignmentsByLanguage,
      };
    }

    return {
      totalEntities: result.totalEntities,
      alignedEntities: result.alignedEntities,
      alignmentRate: result.totalEntities > 0 ? result.alignedEntities / result.totalEntities : 0,
      averageConfidence: result.averageConfidence,
      imborReport,
      euroVocReport,
      entitiesNeedingReview: result.entitiesNeedingReview,
    };
  }

  /**
   * Get entities needing manual review
   */
  async getEntitiesNeedingReview(entities: BaseEntity[]): Promise<OntologyAlignment[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = await this.alignEntities(entities, { validateAlignments: true });
    return result.alignments.filter(a => a.needsManualReview);
  }
}
