/**
 * Enrichment Orchestrator
 * 
 * Coordinates enrichment workflows, manages rate limiting, prioritizes tasks,
 * and tracks enrichment history and success rates.
 */

import type { BaseEntity, Relation, RelationType } from '../../../domain/ontology.js';
import type { KnowledgeGraphServiceInterface } from '../core/KnowledgeGraphInterface.js';
import { ExternalSourceEnrichmentService } from './ExternalSourceEnrichmentService.js';
import { WebSearchEntityDiscovery } from './WebSearchEntityDiscovery.js';
import { RelationshipDiscoveryService } from './RelationshipDiscoveryService.js';
import { logger } from '../../../utils/logger.js';

export interface EnrichmentTask {
  id: string;
  type: 'entity_discovery' | 'relationship_discovery' | 'gap_filling' | 'source_expansion';
  priority: 'high' | 'medium' | 'low';
  query: string;
  entityIds?: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: EnrichmentWorkflowResult;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface EnrichmentWorkflowResult {
  entitiesAdded: number;
  relationshipsAdded: number;
  entitiesDiscovered: number;
  relationshipsDiscovered: number;
  qualityScore: number;
  sources: string[];
  duration: number;
}

export interface EnrichmentReport {
  timestamp: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  entitiesAdded: number;
  relationshipsAdded: number;
  averageQualityScore: number;
  tasks: EnrichmentTask[];
  successRate: number;
}

export class EnrichmentOrchestrator {
  private enrichmentService: ExternalSourceEnrichmentService;
  private entityDiscovery: WebSearchEntityDiscovery;
  private relationshipDiscovery: RelationshipDiscoveryService;
  private kgService: KnowledgeGraphServiceInterface;
  private tasks: Map<string, EnrichmentTask> = new Map();
  private rateLimiter: Map<string, number[]> = new Map(); // Track API calls per service

  constructor(kgService: KnowledgeGraphServiceInterface) {
    this.kgService = kgService;
    this.enrichmentService = new ExternalSourceEnrichmentService(kgService);
    this.entityDiscovery = new WebSearchEntityDiscovery(kgService);
    this.relationshipDiscovery = new RelationshipDiscoveryService(kgService);
  }

  /**
   * Run enrichment workflow
   */
  async runEnrichment(
    tasks: Array<{ type: EnrichmentTask['type']; query: string; priority?: EnrichmentTask['priority']; entityIds?: string[] }>
  ): Promise<EnrichmentReport> {
    logger.info({ taskCount: tasks.length }, 'Starting enrichment workflow');

    // Create enrichment tasks
    const enrichmentTasks: EnrichmentTask[] = tasks.map((task, index) => ({
      id: `enrichment-${Date.now()}-${index}`,
      type: task.type,
      priority: task.priority || 'medium',
      query: task.query,
      entityIds: task.entityIds,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }));

    // Sort by priority
    enrichmentTasks.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    // Execute tasks
    let entitiesAdded = 0;
    let relationshipsAdded = 0;
    let totalQualityScore = 0;
    let completedCount = 0;
    let failedCount = 0;

    for (const task of enrichmentTasks) {
      this.tasks.set(task.id, task);
      task.status = 'in_progress';

      try {
        const result = await this.executeTask(task);
        task.status = 'completed';
        task.result = result;
        task.completedAt = new Date().toISOString();

        entitiesAdded += result.entitiesAdded;
        relationshipsAdded += result.relationshipsAdded;
        totalQualityScore += result.qualityScore;
        completedCount++;
      } catch (error) {
        task.status = 'failed';
        task.error = error instanceof Error ? error.message : String(error);
        task.completedAt = new Date().toISOString();
        failedCount++;

        logger.error({ error, taskId: task.id }, 'Enrichment task failed');
      }

      // Rate limiting: wait between tasks
      await this.waitForRateLimit();
    }

    const averageQualityScore = completedCount > 0 ? totalQualityScore / completedCount : 0;
    const successRate = enrichmentTasks.length > 0 ? completedCount / enrichmentTasks.length : 0;

    const report: EnrichmentReport = {
      timestamp: new Date().toISOString(),
      totalTasks: enrichmentTasks.length,
      completedTasks: completedCount,
      failedTasks: failedCount,
      entitiesAdded,
      relationshipsAdded,
      averageQualityScore,
      tasks: enrichmentTasks,
      successRate,
    };

    logger.info(report, 'Enrichment workflow completed');
    return report;
  }

  /**
   * Execute a single enrichment task
   */
  private async executeTask(task: EnrichmentTask): Promise<EnrichmentWorkflowResult> {
    const startTime = Date.now();
    let result: EnrichmentWorkflowResult;

    switch (task.type) {
      case 'entity_discovery':
        return await this.executeEntityDiscovery(task);
      case 'relationship_discovery':
        return await this.executeRelationshipDiscovery(task);
      case 'gap_filling':
        return await this.executeGapFilling(task);
      case 'source_expansion':
        result = await this.executeSourceExpansion(task);
        break;
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }

    // Update duration
    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Execute entity discovery task
   */
  private async executeEntityDiscovery(task: EnrichmentTask): Promise<EnrichmentWorkflowResult> {
    const discovered = await this.entityDiscovery.discoverEntities({
      topic: task.query,
    }, 20);

    // Filter by quality and add to KG
    const highQualityEntities = discovered.filter(e => e.confidence >= 0.7);
    let entitiesAdded = 0;

    for (const discoveredEntity of highQualityEntities) {
      try {
        // Check if entity already exists
        const existing = await this.kgService.getNode(discoveredEntity.entity.id);
        if (!existing) {
          await this.kgService.addNode(discoveredEntity.entity);
          entitiesAdded++;
        }
      } catch (error) {
        logger.debug({ error, entityId: discoveredEntity.entity.id }, 'Failed to add entity');
      }
    }

    const averageConfidence = discovered.length > 0
      ? discovered.reduce((sum, e) => sum + e.confidence, 0) / discovered.length
      : 0;

    return {
      entitiesAdded,
      relationshipsAdded: 0,
      entitiesDiscovered: discovered.length,
      relationshipsDiscovered: 0,
      qualityScore: averageConfidence,
      sources: [...new Set(discovered.map(e => e.sourceUrl))],
      duration: 0, // Will be set by executeTask
    };
  }

  /**
   * Execute relationship discovery task
   */
  private async executeRelationshipDiscovery(task: EnrichmentTask): Promise<EnrichmentWorkflowResult> {
    if (!task.entityIds || task.entityIds.length < 2) {
      throw new Error('Relationship discovery requires at least 2 entity IDs');
    }

    // Get entities
    const entities = await Promise.all(
      task.entityIds.map(id => this.kgService.getNode(id))
    );
    const validEntities = entities.filter((e): e is BaseEntity => e !== undefined);

    if (validEntities.length < 2) {
      throw new Error('Not enough valid entities found');
    }

    // Discover relationships between entity pairs
    const allRelationships: Array<{ relationship: Relation; confidence: number }> = [];

    for (let i = 0; i < validEntities.length; i++) {
      for (let j = i + 1; j < validEntities.length; j++) {
        const discovered = await this.relationshipDiscovery.discoverRelationships(
          validEntities[i],
          validEntities[j],
          { maxRelationships: 5, minConfidence: 0.6 }
        );

        allRelationships.push(...discovered.map(d => ({
          relationship: d.relationship,
          confidence: d.confidence,
        })));
      }
    }

    // Add high-quality relationships to KG
    let relationshipsAdded = 0;
    for (const rel of allRelationships.filter(r => r.confidence >= 0.7)) {
      try {
        // Check if relationship already exists
        const existingRels = await this.kgService.getRelationshipsForEntity?.(rel.relationship.sourceId) || [];
        const exists = existingRels.some(
          (r: { sourceId: string; targetId: string; type: RelationType }) => r.targetId === rel.relationship.targetId && r.type === rel.relationship.type
        );

        if (!exists) {
          await this.kgService.addEdge(
            rel.relationship.sourceId,
            rel.relationship.targetId,
            rel.relationship.type,
            rel.relationship.metadata
          );
          relationshipsAdded++;
        }
      } catch (error) {
        logger.debug({ error }, 'Failed to add relationship');
      }
    }

    const averageConfidence = allRelationships.length > 0
      ? allRelationships.reduce((sum, r) => sum + r.confidence, 0) / allRelationships.length
      : 0;

    return {
      entitiesAdded: 0,
      relationshipsAdded,
      entitiesDiscovered: 0,
      relationshipsDiscovered: allRelationships.length,
      qualityScore: averageConfidence,
      sources: [...new Set(allRelationships.flatMap(r => 
        Array.isArray(r.relationship.metadata?.source) 
          ? r.relationship.metadata.source 
          : [r.relationship.metadata?.source].filter(Boolean) as string[]
      ))],
      duration: 0, // Will be set by executeTask
    };
  }

  /**
   * Execute gap filling task
   */
  private async executeGapFilling(task: EnrichmentTask): Promise<EnrichmentWorkflowResult> {
    // Use enrichment service to discover entities and relationships
    const result = await this.enrichmentService.discoverEntities(task.query, {
      maxEntities: 20,
      maxRelationships: 30,
      minQualityScore: 0.6,
    });

    // Add entities and relationships to KG
    let entitiesAdded = 0;
    let relationshipsAdded = 0;

    for (const entity of result.entities) {
      try {
        const existing = await this.kgService.getNode(entity.id);
        if (!existing) {
          await this.kgService.addNode(entity);
          entitiesAdded++;
        }
      } catch (error) {
        logger.debug({ error }, 'Failed to add entity');
      }
    }

    for (const relationship of result.relationships) {
      try {
        const existingRels = await this.kgService.getRelationshipsForEntity?.(relationship.sourceId) || [];
        const exists = existingRels.some(
          (r: { sourceId: string; targetId: string; type: RelationType }) => r.targetId === relationship.targetId && r.type === relationship.type
        );

        if (!exists) {
          await this.kgService.addEdge(
            relationship.sourceId,
            relationship.targetId,
            relationship.type,
            relationship.metadata
          );
          relationshipsAdded++;
        }
      } catch (error) {
        logger.debug({ error }, 'Failed to add relationship');
      }
    }

    return {
      entitiesAdded,
      relationshipsAdded,
      entitiesDiscovered: result.entities.length,
      relationshipsDiscovered: result.relationships.length,
      qualityScore: result.qualityScore,
      sources: result.sources,
      duration: 0, // Will be set by executeTask
    };
  }

  /**
   * Execute source expansion task
   */
  private async executeSourceExpansion(task: EnrichmentTask): Promise<EnrichmentWorkflowResult> {
    // Similar to gap filling but focused on finding authoritative sources
    return await this.executeGapFilling(task);
  }

  /**
   * Wait for rate limit (simple implementation)
   */
  private async waitForRateLimit(): Promise<void> {
    // Wait 1 second between tasks to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Get enrichment history
   */
  getEnrichmentHistory(): EnrichmentTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): EnrichmentTask | undefined {
    return this.tasks.get(taskId);
  }
}
