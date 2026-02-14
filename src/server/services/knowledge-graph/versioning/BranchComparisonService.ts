/**
 * Branch Comparison Service
 * 
 * Compares two knowledge graph branches to identify differences:
 * - Entities added, removed, or modified
 * - Relationships added, removed, or modified
 * - Property-level changes
 * - Statistics and summaries
 * 
 * @see WI-KG-003: Advanced Branch Management Features
 */

import { Driver, Session } from 'neo4j-driver';
import { getNeo4jDriver } from '../../../config/neo4j.js';
import { logger } from '../../../utils/logger.js';

export interface PropertyChange {
  property: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface EntityChange {
  entityId: string;
  entityType: string;
  changeType: 'added' | 'removed' | 'modified';
  properties?: PropertyChange[];
  entity?: Record<string, unknown>;
}

export interface RelationshipChange {
  sourceId: string;
  targetId: string;
  relationshipType: string;
  changeType: 'added' | 'removed' | 'modified';
  properties?: PropertyChange[];
  relationship?: Record<string, unknown>;
}

export interface BranchComparison {
  sourceBranch: string;
  targetBranch: string;
  entities: {
    added: EntityChange[];
    removed: EntityChange[];
    modified: EntityChange[];
  };
  relationships: {
    added: RelationshipChange[];
    removed: RelationshipChange[];
    modified: RelationshipChange[];
  };
  statistics: {
    entityCountDiff: number;
    relationshipCountDiff: number;
    changeCount: number;
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
  };
  timestamp: string;
}

/**
 * Service for comparing knowledge graph branches
 */
export class BranchComparisonService {
  private driver: Driver;

  constructor(driver?: Driver) {
    this.driver = driver || getNeo4jDriver();
  }

  /**
   * Compare two branches
   * 
   * @param sourceBranch - Source branch to compare from
   * @param targetBranch - Target branch to compare to
   * @returns Comparison result with entities, relationships, and statistics
   */
  async compareBranches(sourceBranch: string, targetBranch: string): Promise<BranchComparison> {
    const session = this.driver.session();
    const comparison: BranchComparison = {
      sourceBranch,
      targetBranch,
      entities: {
        added: [],
        removed: [],
        modified: [],
      },
      relationships: {
        added: [],
        removed: [],
        modified: [],
      },
      statistics: {
        entityCountDiff: 0,
        relationshipCountDiff: 0,
        changeCount: 0,
        addedCount: 0,
        removedCount: 0,
        modifiedCount: 0,
      },
      timestamp: new Date().toISOString(),
    };

    try {
      // Normalize branch names (main branch uses null)
      const sourceBranchFilter = sourceBranch === 'main' ? 'IS NULL' : `= '${sourceBranch}'`;
      const targetBranchFilter = targetBranch === 'main' ? 'IS NULL' : `= '${targetBranch}'`;

      // Get entities from source branch
      const sourceEntitiesResult = await session.run(
        `MATCH (e:Entity)
         WHERE e.branch ${sourceBranchFilter}
         RETURN e.id as id, e.type as type, e, labels(e) as labels`,
        {}
      );

      // Get entities from target branch
      const targetEntitiesResult = await session.run(
        `MATCH (e:Entity)
         WHERE e.branch ${targetBranchFilter}
         RETURN e.id as id, e.type as type, e, labels(e) as labels`,
        {}
      );

      // Build entity maps for comparison
      const sourceEntityMap = new Map<string, any>();
      const targetEntityMap = new Map<string, any>();

      for (const record of sourceEntitiesResult.records) {
        const id = record.get('id');
        const entity = record.get('e');
        sourceEntityMap.set(id, entity);
      }

      for (const record of targetEntitiesResult.records) {
        const id = record.get('id');
        const entity = record.get('e');
        targetEntityMap.set(id, entity);
      }

      // Compare entities
      for (const [id, sourceEntity] of Array.from(sourceEntityMap.entries())) {
        const targetEntity = targetEntityMap.get(id);

        if (!targetEntity) {
          // Entity exists in source but not in target (added in source)
          comparison.entities.added.push({
            entityId: id,
            entityType: sourceEntity.properties.type || 'Unknown',
            changeType: 'added',
            entity: sourceEntity.properties,
          });
        } else {
          // Entity exists in both - check for modifications
          const propertyChanges = this.compareProperties(sourceEntity.properties, targetEntity.properties);
          if (propertyChanges.length > 0) {
            comparison.entities.modified.push({
              entityId: id,
              entityType: sourceEntity.properties.type || 'Unknown',
              changeType: 'modified',
              properties: propertyChanges,
              entity: sourceEntity.properties,
            });
          }
        }
      }

      // Find removed entities (in target but not in source)
      for (const [id, targetEntity] of Array.from(targetEntityMap.entries())) {
        if (!sourceEntityMap.has(id)) {
          comparison.entities.removed.push({
            entityId: id,
            entityType: targetEntity.properties.type || 'Unknown',
            changeType: 'removed',
            entity: targetEntity.properties,
          });
        }
      }

      // Get relationships from source branch
      const sourceRelationshipsResult = await session.run(
        `MATCH (a:Entity)-[r]->(b:Entity)
         WHERE a.branch ${sourceBranchFilter} AND b.branch ${sourceBranchFilter}
         RETURN a.id as sourceId, b.id as targetId, type(r) as type, r, a.branch as sourceBranch, b.branch as targetBranch`,
        {}
      );

      // Get relationships from target branch
      const targetRelationshipsResult = await session.run(
        `MATCH (a:Entity)-[r]->(b:Entity)
         WHERE a.branch ${targetBranchFilter} AND b.branch ${targetBranchFilter}
         RETURN a.id as sourceId, b.id as targetId, type(r) as type, r, a.branch as sourceBranch, b.branch as targetBranch`,
        {}
      );

      // Build relationship maps for comparison
      const sourceRelationshipMap = new Map<string, any>();
      const targetRelationshipMap = new Map<string, any>();

      for (const record of sourceRelationshipsResult.records) {
        const key = `${record.get('sourceId')}-${record.get('type')}-${record.get('targetId')}`;
        const relationship = record.get('r');
        sourceRelationshipMap.set(key, {
          sourceId: record.get('sourceId'),
          targetId: record.get('targetId'),
          type: record.get('type'),
          properties: relationship.properties,
        });
      }

      for (const record of targetRelationshipsResult.records) {
        const key = `${record.get('sourceId')}-${record.get('type')}-${record.get('targetId')}`;
        const relationship = record.get('r');
        targetRelationshipMap.set(key, {
          sourceId: record.get('sourceId'),
          targetId: record.get('targetId'),
          type: record.get('type'),
          properties: relationship.properties,
        });
      }

      // Compare relationships
      for (const [key, sourceRel] of Array.from(sourceRelationshipMap.entries())) {
        const targetRel = targetRelationshipMap.get(key);

        if (!targetRel) {
          // Relationship exists in source but not in target (added in source)
          comparison.relationships.added.push({
            sourceId: sourceRel.sourceId,
            targetId: sourceRel.targetId,
            relationshipType: sourceRel.type,
            changeType: 'added',
            relationship: sourceRel.properties,
          });
        } else {
          // Relationship exists in both - check for modifications
          const propertyChanges = this.compareProperties(sourceRel.properties, targetRel.properties);
          if (propertyChanges.length > 0) {
            comparison.relationships.modified.push({
              sourceId: sourceRel.sourceId,
              targetId: sourceRel.targetId,
              relationshipType: sourceRel.type,
              changeType: 'modified',
              properties: propertyChanges,
              relationship: sourceRel.properties,
            });
          }
        }
      }

      // Find removed relationships (in target but not in source)
      for (const [key, targetRel] of Array.from(targetRelationshipMap.entries())) {
        if (!sourceRelationshipMap.has(key)) {
          comparison.relationships.removed.push({
            sourceId: targetRel.sourceId,
            targetId: targetRel.targetId,
            relationshipType: targetRel.type,
            changeType: 'removed',
            relationship: targetRel.properties,
          });
        }
      }

      // Calculate statistics
      comparison.statistics.entityCountDiff = comparison.entities.added.length - comparison.entities.removed.length;
      comparison.statistics.relationshipCountDiff = comparison.relationships.added.length - comparison.relationships.removed.length;
      comparison.statistics.addedCount = comparison.entities.added.length + comparison.relationships.added.length;
      comparison.statistics.removedCount = comparison.entities.removed.length + comparison.relationships.removed.length;
      comparison.statistics.modifiedCount = comparison.entities.modified.length + comparison.relationships.modified.length;
      comparison.statistics.changeCount = comparison.statistics.addedCount + comparison.statistics.removedCount + comparison.statistics.modifiedCount;

      logger.info(
        {
          sourceBranch,
          targetBranch,
          statistics: comparison.statistics,
        },
        'Branch comparison completed'
      );

      return comparison;
    } catch (error) {
      logger.error({ error, sourceBranch, targetBranch }, 'Failed to compare branches');
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Compare properties between two entities/relationships
   * 
   * @param sourceProps - Source properties
   * @param targetProps - Target properties
   * @returns Array of property changes
   */
  private compareProperties(sourceProps: Record<string, unknown>, targetProps: Record<string, unknown>): PropertyChange[] {
    const changes: PropertyChange[] = [];
    const allKeys = new Set([...Object.keys(sourceProps), ...Object.keys(targetProps)]);

    // Exclude internal properties from comparison
    const excludeKeys = ['branch', 'createdAt', 'updatedAt', 'id'];

    for (const key of Array.from(allKeys)) {
      if (excludeKeys.includes(key)) {
        continue;
      }

      const sourceValue = sourceProps[key];
      const targetValue = targetProps[key];

      // Compare values (deep comparison for objects/arrays)
      if (!this.valuesEqual(sourceValue, targetValue)) {
        changes.push({
          property: key,
          oldValue: targetValue,
          newValue: sourceValue,
        });
      }
    }

    return changes;
  }

  /**
   * Deep equality check for values
   */
  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
      return true;
    }

    if (a === null || b === null || a === undefined || b === undefined) {
      return false;
    }

    if (typeof a !== typeof b) {
      return false;
    }

    if (typeof a === 'object') {
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
          return false;
        }
        return a.every((item, index) => this.valuesEqual(item, b[index]));
      }

      if (Array.isArray(a) || Array.isArray(b)) {
        return false;
      }

      const aKeys = Object.keys(a as Record<string, unknown>);
      const bKeys = Object.keys(b as Record<string, unknown>);

      if (aKeys.length !== bKeys.length) {
        return false;
      }

      return aKeys.every((key) => this.valuesEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
    }

    return false;
  }
}

let branchComparisonService: BranchComparisonService | null = null;

/**
 * Get singleton instance of BranchComparisonService
 */
export function getBranchComparisonService(): BranchComparisonService {
  if (!branchComparisonService) {
    branchComparisonService = new BranchComparisonService();
  }
  return branchComparisonService;
}

