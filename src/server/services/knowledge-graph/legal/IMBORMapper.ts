/**
 * IMBOR Mapper
 * Maps knowledge graph entities to IMBOR (Dutch infrastructure ontology) concepts
 */

import { ImborService, ExtractedKeyword } from '../../external/imborService.js';
import { BaseEntity } from '../../../domain/ontology.js';
import { logger } from '../../../utils/logger.js';

export interface IMBORAlignment {
  entityId: string;
  imborTerm: string;
  imborUri?: string;
  confidence: number;
  canonicalTerm?: string;
  parentTerms?: string[];
  alignmentMethod: 'exact' | 'fuzzy' | 'semantic';
  createdAt: Date;
}

export interface IMBORAlignmentResult {
  alignments: IMBORAlignment[];
  totalEntities: number;
  alignedEntities: number;
  averageConfidence: number;
}

/**
 * Service for mapping entities to IMBOR concepts
 */
export class IMBORMapper {
  private imborService: ImborService;
  private readonly MIN_CONFIDENCE = 0.6; // Minimum confidence for alignment

  constructor(imborService?: ImborService) {
    this.imborService = imborService || new ImborService();
  }

  /**
   * Map a single entity to IMBOR concepts
   */
  async mapEntity(entity: BaseEntity): Promise<IMBORAlignment[]> {
    const alignments: IMBORAlignment[] = [];

    // Skip if entity doesn't have a name
    if (!entity.name) {
      return alignments;
    }

    // Extract IMBOR keywords from entity name and description
    const content = [entity.name, entity.description].filter(Boolean).join(' ');
    
    try {
      const keywords = await this.imborService.extractKeywords(content);

      for (const keyword of keywords) {
        if (keyword.confidence >= this.MIN_CONFIDENCE) {
          alignments.push({
            entityId: entity.id,
            imborTerm: keyword.canonicalTerm || keyword.term,
            confidence: keyword.confidence,
            canonicalTerm: keyword.canonicalTerm,
            parentTerms: keyword.parentTerms,
            alignmentMethod: keyword.confidence >= 0.9 ? 'exact' : keyword.confidence >= 0.75 ? 'fuzzy' : 'semantic',
            createdAt: new Date(),
          });
        }
      }
    } catch (error) {
      logger.error({ error, entityId: entity.id }, '[IMBORMapper] Error mapping entity');
    }

    return alignments;
  }

  /**
   * Map multiple entities to IMBOR concepts
   */
  async mapEntities(entities: BaseEntity[]): Promise<IMBORAlignmentResult> {
    const allAlignments: IMBORAlignment[] = [];
    let totalConfidence = 0;
    let alignedCount = 0;

    for (const entity of entities) {
      const alignments = await this.mapEntity(entity);
      
      if (alignments.length > 0) {
        allAlignments.push(...alignments);
        alignedCount++;
        totalConfidence += alignments.reduce((sum, a) => sum + a.confidence, 0) / alignments.length;
      }
    }

    const averageConfidence = alignedCount > 0 ? totalConfidence / alignedCount : 0;

    return {
      alignments: allAlignments,
      totalEntities: entities.length,
      alignedEntities: alignedCount,
      averageConfidence,
    };
  }

  /**
   * Get IMBOR terms for a specific entity
   */
  async getIMBORTerms(entityId: string, entity: BaseEntity): Promise<string[]> {
    const alignments = await this.mapEntity(entity);
    return alignments.map(a => a.imborTerm);
  }

  /**
   * Validate alignment quality
   */
  validateAlignment(alignment: IMBORAlignment): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (alignment.confidence < this.MIN_CONFIDENCE) {
      issues.push(`Confidence ${alignment.confidence} below minimum threshold ${this.MIN_CONFIDENCE}`);
    }

    if (!alignment.imborTerm) {
      issues.push('Missing IMBOR term');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Get alignment report for entities
   */
  async generateAlignmentReport(entities: BaseEntity[]): Promise<{
    totalEntities: number;
    alignedEntities: number;
    alignmentRate: number;
    averageConfidence: number;
    alignmentsByMethod: Record<string, number>;
    topIMBORTerms: Array<{ term: string; count: number }>;
  }> {
    const result = await this.mapEntities(entities);

    // Count alignments by method
    const alignmentsByMethod: Record<string, number> = {
      exact: 0,
      fuzzy: 0,
      semantic: 0,
    };

    // Count IMBOR terms
    const termCounts = new Map<string, number>();

    for (const alignment of result.alignments) {
      alignmentsByMethod[alignment.alignmentMethod] = (alignmentsByMethod[alignment.alignmentMethod] || 0) + 1;
      termCounts.set(alignment.imborTerm, (termCounts.get(alignment.imborTerm) || 0) + 1);
    }

    // Get top IMBOR terms
    const topIMBORTerms = Array.from(termCounts.entries())
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEntities: result.totalEntities,
      alignedEntities: result.alignedEntities,
      alignmentRate: result.totalEntities > 0 ? result.alignedEntities / result.totalEntities : 0,
      averageConfidence: result.averageConfidence,
      alignmentsByMethod,
      topIMBORTerms,
    };
  }
}
