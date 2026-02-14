/**
 * Knowledge Graph Cleanup Service
 * 
 * Identifies and fixes problematic relationships in the knowledge graph:
 * - Self-loop relationships (sourceId === targetId)
 * - Relationships with unsupported target entities (target not found in source text)
 * - Suspicious relationship patterns (too many RELATED_TO, only one relationship type)
 */

import type { BaseEntity, Relation, RelationType } from '../../../domain/ontology.js';
import type { KnowledgeGraphServiceInterface } from '../core/KnowledgeGraphInterface.js';
import { RelationType as RelationTypeEnum } from '../../../domain/ontology.js';
import { CanonicalDocumentService, getCanonicalDocumentService } from '../../canonical/CanonicalDocumentService.js';
import { logger } from '../../../utils/logger.js';
import type { GraphDBClient } from '../../../config/graphdb.js';

// Extended interface for services that support relationship deletion
interface ExtendedKGService extends KnowledgeGraphServiceInterface {
  deleteEdge?(sourceId: string, targetId: string, type: RelationType): Promise<void>;
}

const KG_GRAPH_URI = 'http://data.example.org/graph/knowledge';
const BELEID_NAMESPACE = 'http://data.example.org/def/beleid#';
const PREFIXES = `
PREFIX beleid: <${BELEID_NAMESPACE}>
PREFIX kg: <http://data.example.org/def/kg#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

export interface ProblematicRelationship {
  sourceId: string;
  targetId: string;
  type: RelationType;
  issue: string;
  severity: 'error' | 'warning';
}

export interface SuspiciousEntity {
  entityId: string;
  entityName: string;
  issue: string;
  relationshipCount: number;
  relatedToCount: number;
  uniqueTypes: string[];
}

export interface CleanupReport {
  selfLoops: ProblematicRelationship[];
  unsupportedRelationships: ProblematicRelationship[];
  suspiciousEntities: SuspiciousEntity[];
  summary: {
    totalSelfLoops: number;
    totalUnsupported: number;
    totalSuspicious: number;
    deletedSelfLoops: number;
    deletedUnsupported: number;
  };
}

export class KGCleanupService {
  private documentService: CanonicalDocumentService;
  private kgService: ExtendedKGService;
  private client: GraphDBClient;

  constructor(
    kgService: KnowledgeGraphServiceInterface,
    client: GraphDBClient,
    documentService?: CanonicalDocumentService
  ) {
    this.kgService = kgService as ExtendedKGService;
    this.client = client;
    this.documentService = documentService || getCanonicalDocumentService();
  }

  /**
   * Find all self-loop relationships (sourceId === targetId)
   */
  async findSelfLoops(): Promise<ProblematicRelationship[]> {
    const client = this.getClient();
    const selfLoops: ProblematicRelationship[] = [];

    try {
      const query = `
${PREFIXES}
SELECT ?sourceId ?targetId ?relationType
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a beleid:Relation ;
         beleid:source ?s ;
         beleid:target ?t ;
         beleid:relationType ?relationType .
    ?s beleid:id ?sourceId .
    ?t beleid:id ?targetId .
    FILTER(?s = ?t)
  }
}
`;

      const results = await client.query(query);

      for (const row of results) {
        selfLoops.push({
          sourceId: row.sourceId,
          targetId: row.targetId,
          type: row.relationType as RelationType,
          issue: 'Self-loop relationship detected',
          severity: 'warning',
        });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to find self-loops');
      throw error;
    }

    return selfLoops;
  }

  /**
   * Find relationships where target entity name is not found in source document text
   */
  async findUnsupportedRelationships(): Promise<ProblematicRelationship[]> {
    const unsupported: ProblematicRelationship[] = [];
    const allEntities = await this.kgService.getAllNodes();
    const entityMap = new Map<string, BaseEntity>();
    allEntities.forEach(e => entityMap.set(e.id, e));

    // Get all relationships
    const allRelationships = await this.getAllRelationships();

    for (const rel of allRelationships) {
      const sourceEntity = entityMap.get(rel.sourceId);
      const targetEntity = entityMap.get(rel.targetId);

      if (!sourceEntity || !targetEntity) {
        continue;
      }

      // Find source document
      const sourceDocId = sourceEntity.metadata?.sourceId as string | undefined;
      if (!sourceDocId) {
        continue;
      }

      try {
        const sourceDoc = await this.documentService.findById(sourceDocId);
        if (!sourceDoc || !sourceDoc.fullText) {
          continue;
        }

        // Check if target entity name appears in source document text
        const sourceText = sourceDoc.fullText.toLowerCase();
        const targetName = targetEntity.name.toLowerCase();
        
        // Improved matching: check for exact match, partial match, and variations
        const targetNameInSource = this.isEntityNameInText(targetName, sourceText);

        if (!targetNameInSource) {
          unsupported.push({
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            type: rel.type,
            issue: `Target entity "${targetEntity.name}" not found in source document text`,
            severity: 'warning',
          });
        }
      } catch (error) {
        // If document lookup fails, skip this relationship
        logger.debug(
          { error, sourceId: rel.sourceId, targetId: rel.targetId },
          'Failed to validate relationship against source document'
        );
      }
    }

    return unsupported;
  }

  /**
   * Find entities with suspicious relationship patterns
   */
  async findSuspiciousPatterns(): Promise<SuspiciousEntity[]> {
    const suspicious: SuspiciousEntity[] = [];
    const allEntities = await this.kgService.getAllNodes();
    const RELATED_TO_THRESHOLD = 10; // From FactValidator
    const MIN_RELATIONSHIPS_FOR_SINGLE_TYPE = 5; // From FactValidator

    for (const entity of allEntities) {
      try {
        if (!this.kgService.getRelationshipsForEntity) {
          // Fallback: query relationships directly
          const relationships = await this.getRelationshipsForEntity(entity.id);
          await this.checkEntityForSuspiciousPatterns(entity, relationships, suspicious, RELATED_TO_THRESHOLD, MIN_RELATIONSHIPS_FOR_SINGLE_TYPE);
          continue;
        }
        const relationships = await this.kgService.getRelationshipsForEntity(entity.id);
        
        await this.checkEntityForSuspiciousPatterns(entity, relationships, suspicious, RELATED_TO_THRESHOLD, MIN_RELATIONSHIPS_FOR_SINGLE_TYPE);
      } catch (error) {
        logger.debug(
          { error, entityId: entity.id },
          'Failed to check suspicious patterns for entity'
        );
      }
    }

    return suspicious;
  }

  /**
   * Check an entity for suspicious relationship patterns
   */
  private async checkEntityForSuspiciousPatterns(
    entity: BaseEntity,
    relationships: Array<{ sourceId: string; targetId: string; type: RelationType }>,
    suspicious: SuspiciousEntity[],
    RELATED_TO_THRESHOLD: number,
    MIN_RELATIONSHIPS_FOR_SINGLE_TYPE: number
  ): Promise<void> {
    if (relationships.length === 0) {
      return;
    }

    // Count RELATED_TO relationships
    const relatedToCount = relationships.filter(
      r => r.type === RelationTypeEnum.RELATED_TO
    ).length;

    // Get unique relationship types
    const uniqueTypes = new Set(relationships.map(r => r.type));
    const uniqueTypesArray = Array.from(uniqueTypes);

    // Check for suspicious patterns
    if (relatedToCount > RELATED_TO_THRESHOLD) {
      suspicious.push({
        entityId: entity.id,
        entityName: entity.name,
        issue: `Entity has ${relatedToCount} relationships of type RELATED_TO (suspicious pattern)`,
        relationshipCount: relationships.length,
        relatedToCount,
        uniqueTypes: uniqueTypesArray,
      });
    } else if (uniqueTypes.size === 1 && relationships.length > MIN_RELATIONSHIPS_FOR_SINGLE_TYPE) {
      suspicious.push({
        entityId: entity.id,
        entityName: entity.name,
        issue: `Entity has only one relationship type (${uniqueTypesArray[0]}) - may indicate incomplete data`,
        relationshipCount: relationships.length,
        relatedToCount,
        uniqueTypes: uniqueTypesArray,
      });
    }
  }

  /**
   * Delete all self-loop relationships
   */
  async deleteSelfLoops(dryRun: boolean = false): Promise<number> {
    const selfLoops = await this.findSelfLoops();
    
    if (dryRun) {
      logger.info({ count: selfLoops.length }, 'Dry run: Would delete self-loops');
      return 0;
    }

    let deleted = 0;
    for (const rel of selfLoops) {
      try {
        if (this.kgService.deleteEdge) {
          await this.kgService.deleteEdge(rel.sourceId, rel.targetId, rel.type);
          deleted++;
        } else {
          logger.warn('deleteEdge method not available on KG service');
        }
      } catch (error) {
        logger.error(
          { error, sourceId: rel.sourceId, targetId: rel.targetId, type: rel.type },
          'Failed to delete self-loop'
        );
      }
    }

    logger.info({ deleted, total: selfLoops.length }, 'Deleted self-loops');
    return deleted;
  }

  /**
   * Delete relationships where target entity is not found in source document
   */
  async deleteUnsupportedRelationships(dryRun: boolean = false): Promise<number> {
    const unsupported = await this.findUnsupportedRelationships();
    
    if (dryRun) {
      logger.info({ count: unsupported.length }, 'Dry run: Would delete unsupported relationships');
      return 0;
    }

    let deleted = 0;
    for (const rel of unsupported) {
      try {
        if (this.kgService.deleteEdge) {
          await this.kgService.deleteEdge(rel.sourceId, rel.targetId, rel.type);
          deleted++;
        } else {
          logger.warn('deleteEdge method not available on KG service');
        }
      } catch (error) {
        logger.error(
          { error, sourceId: rel.sourceId, targetId: rel.targetId, type: rel.type },
          'Failed to delete unsupported relationship'
        );
      }
    }

    logger.info({ deleted, total: unsupported.length }, 'Deleted unsupported relationships');
    return deleted;
  }

  /**
   * Generate comprehensive cleanup report
   */
  async generateCleanupReport(): Promise<CleanupReport> {
    logger.info('Generating cleanup report...');

    const [selfLoops, unsupported, suspicious] = await Promise.all([
      this.findSelfLoops(),
      this.findUnsupportedRelationships(),
      this.findSuspiciousPatterns(),
    ]);

    return {
      selfLoops,
      unsupportedRelationships: unsupported,
      suspiciousEntities: suspicious,
      summary: {
        totalSelfLoops: selfLoops.length,
        totalUnsupported: unsupported.length,
        totalSuspicious: suspicious.length,
        deletedSelfLoops: 0,
        deletedUnsupported: 0,
      },
    };
  }

  /**
   * Run cleanup with options
   */
  async runCleanup(options: {
    deleteSelfLoops?: boolean;
    deleteUnsupported?: boolean;
    dryRun?: boolean;
  }): Promise<CleanupReport> {
    const { deleteSelfLoops: shouldDeleteSelfLoops = true, deleteUnsupported: shouldDeleteUnsupported = false, dryRun = false } = options;

    const report = await this.generateCleanupReport();

    if (shouldDeleteSelfLoops && !dryRun) {
      const deleted = await this.deleteSelfLoops(dryRun);
      report.summary.deletedSelfLoops = deleted;
    }

    if (shouldDeleteUnsupported && !dryRun) {
      const deleted = await this.deleteUnsupportedRelationships(dryRun);
      report.summary.deletedUnsupported = deleted;
    }

    return report;
  }

  /**
   * Get all relationships from the knowledge graph
   */
  private async getAllRelationships(): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
    const client = this.getClient();

    const query = `
${PREFIXES}
SELECT ?sourceId ?targetId ?relationType
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a beleid:Relation ;
         beleid:source ?s ;
         beleid:target ?t ;
         beleid:relationType ?relationType .
    ?s beleid:id ?sourceId .
    ?t beleid:id ?targetId .
  }
}
`;

    const results = await client.query(query);
    return results.map((row) => ({
      sourceId: row.sourceId,
      targetId: row.targetId,
      type: row.relationType as RelationType,
    }));
  }

  /**
   * Improved entity name matching in text
   * Handles variations, case-insensitive matching, and partial matches
   */
  private isEntityNameInText(entityName: string, text: string): boolean {
    // Exact match (case-insensitive)
    if (text.includes(entityName)) {
      return true;
    }

    // Try without common prefixes/suffixes
    const variations = [
      entityName.replace(/^(de|het|een)\s+/i, ''), // Remove Dutch articles
      entityName.replace(/\s+(van|voor|in|op|bij)\s+.*$/i, ''), // Remove common prepositions
    ];

    for (const variation of variations) {
      if (variation.length > 3 && text.includes(variation)) {
        return true;
      }
    }

    // Try splitting entity name into words and check if all words appear
    const words = entityName.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 1) {
      const allWordsPresent = words.every(word => text.includes(word));
      if (allWordsPresent) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get relationships for a specific entity (fallback method)
   */
  private async getRelationshipsForEntity(entityId: string): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
    const entityUri = `http://data.example.org/id/${encodeURIComponent(entityId)}`;
    const query = `
${PREFIXES}
SELECT ?sourceId ?targetId ?relationType
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a beleid:Relation ;
         beleid:source <${entityUri}> ;
         beleid:target ?t ;
         beleid:relationType ?relationType .
    <${entityUri}> beleid:id ?sourceId .
    ?t beleid:id ?targetId .
  }
}
`;
    const results = await this.client.query(query);
    return results.map((row) => ({
      sourceId: row.sourceId,
      targetId: row.targetId,
      type: row.relationType as RelationType,
    }));
  }

  /**
   * Get GraphDB client
   */
  private getClient(): GraphDBClient {
    return this.client;
  }
}
