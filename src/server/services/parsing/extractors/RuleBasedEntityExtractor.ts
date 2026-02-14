/**
 * RuleBasedEntityExtractor - Rule-based entity extraction
 * 
 * Extracts entities (Regulation, SpatialUnit, LandUse, Requirement)
 * from documents using rule-based patterns and text analysis.
 * 
 * Extracted from ContentProcessor to separate parsing concerns.
 */

import { logger } from '../../../utils/logger.js';
import { ContentProcessor } from '../../content-processing/ContentProcessor.js';
import type { IExtractor } from '../interfaces/IExtractor.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import type { BaseEntity } from '../../../domain/ontology.js';

/**
 * Rule-based Entity Extractor
 * 
 * Extracts entities from normalized documents using rule-based patterns.
 * This extractor uses ContentProcessor internally.
 */
export class RuleBasedEntityExtractor implements IExtractor<BaseEntity> {
  private contentProcessor: ContentProcessor;

  constructor() {
    this.contentProcessor = new ContentProcessor();
  }

  /**
   * Extract entities from a document using rule-based patterns
   * 
   * @param document - Canonical document to extract entities from
   * @returns Array of extracted entities
   */
  async extract(document: CanonicalDocument): Promise<BaseEntity[]> {
    logger.debug(
      { sourceId: document.sourceId, source: document.source },
      '[RuleBasedEntityExtractor] Extracting entities from document using rule-based patterns'
    );

    try {
      // Extract entities and relationships using ContentProcessor
      const extractionResult = this.contentProcessor.extractEntitiesAndRelationships(
        document.fullText || '',
        {
          sourceId: document.sourceId,
          sourceTitle: document.title,
          jurisdiction: document.publisherAuthority,
        }
      );

      // Return only entities (relationships are handled separately)
      const entities = extractionResult.entities;

      logger.info(
        {
          sourceId: document.sourceId,
          entityCount: entities.length,
          entityTypes: this.countEntityTypes(entities),
        },
        '[RuleBasedEntityExtractor] Extracted entities from document using rule-based patterns'
      );

      return entities;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          sourceId: document.sourceId,
        },
        '[RuleBasedEntityExtractor] Failed to extract entities using rule-based patterns'
      );
      
      // Return empty array on error
      return [];
    }
  }

  /**
   * Count entities by type for logging
   * 
   * @param entities - Array of entities
   * @returns Count by entity type
   */
  private countEntityTypes(entities: BaseEntity[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const entity of entities) {
      counts[entity.type] = (counts[entity.type] || 0) + 1;
    }
    return counts;
  }
}
