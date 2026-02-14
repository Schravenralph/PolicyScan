import { LLMService } from '../llm/LLMService.js';
import { KnowledgeGraphClusteringService, KnowledgeClusterNode } from '../knowledge-graph/clustering/KnowledgeGraphClusteringService.js';
import { KnowledgeGraphService } from '../knowledge-graph/core/KnowledgeGraph.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { CommunityLabel, CommunityLabelDocument, CommunityLabelCreateInput } from '../../models/CommunityLabel.js';
import {
  getCommunitySummaryPrompt,
  getSemanticLabelPrompt,
  getLabelValidationPrompt,
  CommunityLabelingContext,
} from './prompts/communityLabelingPrompts.js';
import { logger } from '../../utils/logger.js';
import crypto from 'crypto';
import { getErrorMonitoringService } from '../monitoring/ErrorMonitoringService.js';

export interface LabelGenerationResult {
  clusterId: string;
  label: string;
  summary?: string;
  quality?: {
    score?: number;
    validated?: boolean;
  };
  cost?: {
    llmCalls: number;
    tokensUsed: number;
    estimatedCost: number;
  };
  performance?: {
    generationTimeMs: number;
    exceededThreshold?: boolean;
  };
  cached: boolean;
}

export interface BatchLabelingOptions {
  batchSize?: number;
  parallel?: boolean;
  skipExisting?: boolean;
  minQualityScore?: number;
}

/**
 * Service for generating semantic labels for knowledge graph communities
 * Replaces structural cluster IDs with meaningful semantic labels
 */
export class SemanticCommunityLabeler {
  private llmService: LLMService;
  private knowledgeGraph: KnowledgeGraphService;
  private labelCache: Map<string, CommunityLabelDocument> = new Map();
  private readonly PERFORMANCE_THRESHOLD_MS = 5000; // 5 seconds threshold

  constructor(
    _clusteringService: KnowledgeGraphClusteringService,
    knowledgeGraph: KnowledgeGraphService,
    llmService?: LLMService
  ) {
    this.knowledgeGraph = knowledgeGraph;
    this.llmService = llmService || new LLMService();
  }

  /**
   * Check if semantic labeling is enabled
   */
  async isEnabled(): Promise<boolean> {
    if (!FeatureFlag.isKGEnabled()) {
      return false;
    }
    return FeatureFlag.isEnabled(KGFeatureFlag.KG_SEMANTIC_LABELING_ENABLED, false);
  }

  /**
   * Generate a semantic label for a single community
   */
  async generateLabel(
    cluster: KnowledgeClusterNode,
    options: {
      forceRegenerate?: boolean;
      validate?: boolean;
    } = {}
  ): Promise<LabelGenerationResult> {
    const { forceRegenerate = false, validate = false } = options;

    // Check if feature is enabled
    if (!(await this.isEnabled())) {
      throw new Error('Semantic labeling is disabled. Enable KG_SEMANTIC_LABELING_ENABLED feature flag.');
    }

    // Check cache first
    if (!forceRegenerate) {
      const cached = await this.getCachedLabel(cluster.id);
      if (cached) {
        logger.debug(`[SemanticLabeler] Using cached label for cluster ${cluster.id}: ${cached.label}`);
        return {
          clusterId: cluster.id,
          label: cached.label,
          summary: cached.summary,
          quality: cached.quality,
          cost: cached.cost ? {
            llmCalls: cached.cost.llmCalls ?? 0,
            tokensUsed: cached.cost.tokensUsed ?? 0,
            estimatedCost: cached.cost.estimatedCost ?? 0,
          } : undefined,
          performance: {
            generationTimeMs: 0, // Cached, no generation time
            exceededThreshold: false,
          },
          cached: true,
        };
      }
    }

    const startTime = Date.now();
    let llmCalls = 0;
    let tokensUsed = 0;
    const estimatedCostPerToken = 0.000002; // Approximate cost per token for GPT-4o-mini

    try {
      // Step 1: Extract context from cluster
      const context = await this.extractContext(cluster);

      // Step 2: Generate community summary
      const summaryPrompt = getCommunitySummaryPrompt(context);
      const summaryResponse = await this.llmService.generate([
        { role: 'user', content: summaryPrompt },
      ]);
      llmCalls++;
      tokensUsed += summaryResponse.usage?.totalTokens || 0;
      const summary = summaryResponse.content.trim();

      // Step 3: Generate semantic label from summary
      const labelPrompt = getSemanticLabelPrompt(summary);
      const labelResponse = await this.llmService.generate([
        { role: 'user', content: labelPrompt },
      ]);
      llmCalls++;
      tokensUsed += labelResponse.usage?.totalTokens || 0;
      let label = labelResponse.content.trim();

      // Remove quotes if present
      label = label.replace(/^["']|["']$/g, '');

      // Step 4: Optional validation
      let qualityScore: number | undefined;
      if (validate) {
        const validationPrompt = getLabelValidationPrompt(label, summary, context);
        const validationResponse = await this.llmService.generate([
          { role: 'user', content: validationPrompt },
        ]);
        llmCalls++;
        tokensUsed += validationResponse.usage?.totalTokens || 0;

        try {
          const validation = JSON.parse(validationResponse.content);
          qualityScore = validation.score;
        } catch (error) {
          logger.warn(`[SemanticLabeler] Failed to parse validation response: ${error}`);
        }
      }

      // Step 5: Calculate community hash for change detection
      const communityHash = this.calculateCommunityHash(cluster);

      // Step 6: Save label to database
      const labelData: CommunityLabelCreateInput = {
        clusterId: cluster.id,
        label,
        summary,
        communityHash,
        metadata: {
          entityCount: cluster.nodeCount,
          entityTypes: context.entityTypes,
          domain: context.domain,
          jurisdiction: context.jurisdiction,
        },
        quality: qualityScore !== undefined ? { score: qualityScore, validated: validate } : undefined,
        cost: {
          llmCalls,
          tokensUsed,
          estimatedCost: tokensUsed * estimatedCostPerToken,
        },
      };

      const savedLabel = await CommunityLabel.upsert(cluster.id, labelData);
      this.labelCache.set(cluster.id, savedLabel);

      const elapsed = Date.now() - startTime;
      const exceededThreshold = elapsed > this.PERFORMANCE_THRESHOLD_MS;
      
      if (exceededThreshold) {
        logger.warn(
          `[SemanticLabeler] Label generation exceeded threshold (${elapsed}ms > ${this.PERFORMANCE_THRESHOLD_MS}ms) for cluster ${cluster.id}`
        );
      }

      logger.info(
        `[SemanticLabeler] Generated label for cluster ${cluster.id} in ${elapsed}ms: "${label}"`
      );

      return {
        clusterId: cluster.id,
        label,
        summary,
        quality: savedLabel.quality,
        cost: savedLabel.cost ? {
          llmCalls: savedLabel.cost.llmCalls ?? 0,
          tokensUsed: savedLabel.cost.tokensUsed ?? 0,
          estimatedCost: savedLabel.cost.estimatedCost ?? 0,
        } : undefined,
        performance: {
          generationTimeMs: elapsed,
          exceededThreshold,
        },
        cached: false,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error, clusterId: cluster.id }, `[SemanticLabeler] Failed to generate label for cluster ${cluster.id}: ${errorMessage}`);
      
      // Capture error in monitoring system for alerting
      const errorMonitoringService = getErrorMonitoringService();
      if (error instanceof Error) {
        errorMonitoringService.captureError(error, {
          component: 'other',
          metadata: {
            service: 'SemanticCommunityLabeler',
            operation: 'generateLabel',
            clusterId: cluster.id,
            nodeCount: cluster.nodeCount,
            domain: cluster.metadata?.domain,
            jurisdiction: cluster.metadata?.jurisdiction,
          },
        }).catch((monitoringError: unknown) => {
          const monitoringErrorMessage = monitoringError instanceof Error ? monitoringError.message : String(monitoringError);
          logger.error({ error: monitoringError }, `[SemanticLabeler] Failed to capture error in monitoring system: ${monitoringErrorMessage}`);
        });
      }
      
      throw error;
    }
  }

  /**
   * Generate labels for multiple communities (batch processing)
   */
  async generateLabelsBatch(
    clusters: KnowledgeClusterNode[],
    options: BatchLabelingOptions = {}
  ): Promise<LabelGenerationResult[]> {
    const {
      batchSize = 10,
      parallel = false,
      skipExisting = true,
      minQualityScore,
    } = options;

    // Filter out clusters that already have labels if skipExisting is true
    let clustersToProcess = clusters;
    if (skipExisting) {
      const existingLabels = await CommunityLabel.findByClusterIds(clusters.map((c) => c.id));
      const existingClusterIds = new Set(existingLabels.map((l) => l.clusterId));
      clustersToProcess = clusters.filter((c) => !existingClusterIds.has(c.id));
      logger.info(
        `[SemanticLabeler] Skipping ${clusters.length - clustersToProcess.length} clusters with existing labels`
      );
    }

    if (clustersToProcess.length === 0) {
      return [];
    }

    const results: LabelGenerationResult[] = [];

    if (parallel) {
      // Process in parallel batches
      for (let i = 0; i < clustersToProcess.length; i += batchSize) {
        const batch = clustersToProcess.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map((cluster) =>
            this.generateLabel(cluster, { validate: minQualityScore !== undefined }).catch((error) => {
              const errorMessage = error instanceof Error ? error.message : String(error);
              logger.error({ error, clusterId: cluster.id }, `[SemanticLabeler] Failed to generate label for cluster ${cluster.id}: ${errorMessage}`);
              // Error monitoring is handled in generateLabel catch block
              return null;
            })
          )
        );

        // Filter out null results and apply quality filter
        const validResults = batchResults.filter(
          (r): r is LabelGenerationResult =>
            r !== null && (minQualityScore === undefined || (r.quality?.score || 0) >= minQualityScore)
        );

        results.push(...validResults);
      }
    } else {
      // Process sequentially
      for (const cluster of clustersToProcess) {
        try {
          const result = await this.generateLabel(cluster, { validate: minQualityScore !== undefined });
          if (minQualityScore === undefined || (result.quality?.score || 0) >= minQualityScore) {
            results.push(result);
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error({ error, clusterId: cluster.id }, `[SemanticLabeler] Failed to generate label for cluster ${cluster.id}: ${errorMessage}`);
          // Error monitoring is handled in generateLabel catch block
        }
      }
    }

    // Calculate batch processing metrics
    const totalTime = results.reduce((sum, r) => sum + (r.performance?.generationTimeMs || 0), 0);
    const avgTime = results.length > 0 ? totalTime / results.length : 0;
    const exceededThreshold = results.filter(r => r.performance?.exceededThreshold).length;
    const qualityScores = results
      .map(r => r.quality?.score)
      .filter((s): s is number => s !== undefined);
    const avgQuality = qualityScores.length > 0 
      ? qualityScores.reduce((sum, s) => sum + s, 0) / qualityScores.length 
      : undefined;

    logger.info(
      `[SemanticLabeler] Generated ${results.length} labels from ${clustersToProcess.length} clusters. ` +
      `Avg time: ${avgTime.toFixed(0)}ms, Exceeded threshold: ${exceededThreshold}, ` +
      `Avg quality: ${avgQuality !== undefined ? avgQuality.toFixed(2) : 'N/A'}`
    );

    return results;
  }

  /**
   * Get performance metrics for label generation
   */
  async getPerformanceMetrics(options: {
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    totalLabels: number;
    averageGenerationTime: number;
    p50: number;
    p95: number;
    p99: number;
    exceededThresholdCount: number;
    averageQualityScore?: number;
    totalCost: number;
  }> {
    // Note: CommunityLabel.findAll doesn't support date filtering directly
    // This is a placeholder - in a full implementation, you'd add date filtering to the model
    const labels = await CommunityLabel.findAll();
    
    // Filter by date in memory (not ideal for large datasets, but works for now)
    const filteredLabels = labels.filter(label => {
      if (options.startDate && label.createdAt < options.startDate) {
        return false;
      }
      if (options.endDate && label.createdAt > options.endDate) {
        return false;
      }
      return true;
    });

    // Note: Generation time is not stored in the database, so we can't calculate exact metrics
    // This is a placeholder for future enhancement where we'd store performance metrics
    const qualityScores = filteredLabels
      .map(l => l.quality?.score)
      .filter((s): s is number => s !== undefined);
    
    const totalCost = filteredLabels.reduce((sum, l) => sum + (l.cost?.estimatedCost || 0), 0);
    const avgQuality = qualityScores.length > 0
      ? qualityScores.reduce((sum, s) => sum + s, 0) / qualityScores.length
      : undefined;

    return {
      totalLabels: filteredLabels.length,
      averageGenerationTime: 0, // Would need to store this in the database
      p50: 0,
      p95: 0,
      p99: 0,
      exceededThresholdCount: 0,
      averageQualityScore: avgQuality,
      totalCost,
    };
  }

  /**
   * Get cached label for a cluster
   */
  async getCachedLabel(clusterId: string): Promise<CommunityLabelDocument | null> {
    // Check in-memory cache first
    if (this.labelCache.has(clusterId)) {
      return this.labelCache.get(clusterId)!;
    }

    // Check database
    const label = await CommunityLabel.findByClusterId(clusterId);
    if (label) {
      this.labelCache.set(clusterId, label);
      return label;
    }

    return null;
  }

  /**
   * Check if a cluster's content has changed (requires label regeneration)
   */
  async needsRegeneration(cluster: KnowledgeClusterNode): Promise<boolean> {
    const cached = await this.getCachedLabel(cluster.id);
    if (!cached || !cached.communityHash) {
      return true;
    }

    const currentHash = this.calculateCommunityHash(cluster);
    return currentHash !== cached.communityHash;
  }

  /**
   * Extract context from a cluster for label generation
   */
  private async extractContext(cluster: KnowledgeClusterNode): Promise<CommunityLabelingContext> {
    // Get sample entities from the cluster
    const sampleEntities: Array<{ id: string; type: string; name?: string; description?: string }> = [];

    // Try to get representative entity
    if (cluster.representativeEntity) {
      const entity = cluster.representativeEntity;
      const entityName = entity.name || (entity.metadata && typeof entity.metadata === 'object' && 'title' in entity.metadata && typeof entity.metadata.title === 'string' ? entity.metadata.title : undefined);
      sampleEntities.push({
        id: entity.id,
        type: entity.type,
        name: entityName,
        description: entity.description,
      });
    }

    // Get additional sample entities if available
    if (cluster.entityIds && cluster.entityIds.length > 0) {
      const sampleIds = cluster.entityIds.slice(0, 9); // Get up to 9 more (10 total)
      for (const entityId of sampleIds) {
        try {
          const entity = await this.knowledgeGraph.getNode(entityId);
          if (entity) {
            const entityName = entity.name || (entity.metadata && typeof entity.metadata === 'object' && 'title' in entity.metadata && typeof entity.metadata.title === 'string' ? entity.metadata.title : undefined);
            sampleEntities.push({
              id: entity.id,
              type: entity.type,
              name: entityName,
              description: entity.description,
            });
          }
        } catch (error) {
          // Skip if entity not found
        }
      }
    }

    // Extract entity types
    const entityTypes = Array.from(
      new Set(sampleEntities.map((e) => e.type).filter((t): t is string => !!t))
    );

    // Extract relationships if available (limited for performance)
    const relationships: Array<{ type: string; source: string; target: string }> = [];
    // Note: Relationship extraction can be expensive, so we limit it
    // In a full implementation, you might want to get relationships from the cluster metadata

    return {
      entityTypes,
      entityCount: cluster.nodeCount,
      sampleEntities,
      relationships,
      domain: cluster.metadata?.domain,
      jurisdiction: cluster.metadata?.jurisdiction,
    };
  }

  /**
   * Calculate hash of community content for change detection
   */
  private calculateCommunityHash(cluster: KnowledgeClusterNode): string {
    const hashInput = JSON.stringify({
      id: cluster.id,
      nodeCount: cluster.nodeCount,
      entityIds: cluster.entityIds?.slice(0, 100).sort(), // Use first 100 for performance
      metadata: cluster.metadata,
    });

    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Get label for a cluster (from cache or generate if needed)
   */
  async getLabel(cluster: KnowledgeClusterNode): Promise<string> {
    const cached = await this.getCachedLabel(cluster.id);
    if (cached) {
      return cached.label;
    }

    // Generate if not cached
    const result = await this.generateLabel(cluster);
    return result.label;
  }

  /**
   * Update labels when community content changes
   */
  async updateLabelsIfNeeded(clusters: KnowledgeClusterNode[]): Promise<LabelGenerationResult[]> {
    const needsUpdate: KnowledgeClusterNode[] = [];

    for (const cluster of clusters) {
      if (await this.needsRegeneration(cluster)) {
        needsUpdate.push(cluster);
      }
    }

    if (needsUpdate.length === 0) {
      return [];
    }

    logger.info(`[SemanticLabeler] Updating ${needsUpdate.length} labels due to content changes`);
    return this.generateLabelsBatch(needsUpdate, { skipExisting: false });
  }

  /**
   * Generate a hierarchical label with parent-child relationships
   * 
   * @param cluster Cluster to generate hierarchical label for
   * @param parentLabel Optional parent label for context
   * @param options Labeling options
   * @returns Label generation result with hierarchy information
   */
  async generateHierarchicalLabel(
    cluster: KnowledgeClusterNode,
    options: {
      parentLabel?: {
        clusterId: string;
        label: string;
        level: number;
      };
      validate?: boolean;
      forceRegenerate?: boolean;
    } = {}
  ): Promise<LabelGenerationResult & {
    hierarchy?: {
      level: number;
      parentId?: string;
      childrenIds: string[];
      path: string[];
    };
  }> {
    const { parentLabel, validate = false, forceRegenerate = false } = options;

    // Generate base label first
    const baseResult = await this.generateLabel(cluster, {
      validate,
      forceRegenerate,
    });

    // Build hierarchy information
    const level = parentLabel ? parentLabel.level + 1 : 0;
    const path = parentLabel
      ? [...(await this.getLabelPath(parentLabel.clusterId)), baseResult.label]
      : [baseResult.label];

    // Get or create parent label document
    let parentLabelDoc = null;
    if (parentLabel) {
      parentLabelDoc = await CommunityLabel.findByClusterId(parentLabel.clusterId);
      if (!parentLabelDoc) {
        // Create parent label document if it doesn't exist
        parentLabelDoc = await CommunityLabel.upsert(parentLabel.clusterId, {
          clusterId: parentLabel.clusterId,
          label: parentLabel.label,
          metadata: {
            entityCount: 0,
          },
          hierarchy: {
            level: parentLabel.level,
            path: await this.getLabelPath(parentLabel.clusterId),
          },
        });
      }
    }

    // Update current label with hierarchy information
    const currentLabelDoc = await CommunityLabel.findByClusterId(cluster.id);
    if (currentLabelDoc) {
      await CommunityLabel.upsert(cluster.id, {
        ...currentLabelDoc,
        hierarchy: {
          level,
          parentId: parentLabel?.clusterId,
          childrenIds: [], // Will be populated when children are created
          path,
        },
      });

      // Update parent's children list
      if (parentLabelDoc && parentLabel) {
        const parentChildren = parentLabelDoc.hierarchy?.childrenIds || [];
        if (!parentChildren.includes(cluster.id)) {
          await CommunityLabel.upsert(parentLabel.clusterId, {
            ...parentLabelDoc,
            hierarchy: {
              level: parentLabelDoc.hierarchy?.level ?? parentLabel.level,
              parentId: parentLabelDoc.hierarchy?.parentId,
              childrenIds: [...parentChildren, cluster.id],
              path: parentLabelDoc.hierarchy?.path,
            },
          });
        }
      }
    }

    return {
      ...baseResult,
      hierarchy: {
        level,
        parentId: parentLabel?.clusterId,
        childrenIds: [],
        path,
      },
    };
  }

  /**
   * Get label path from root to cluster
   */
  private async getLabelPath(clusterId: string): Promise<string[]> {
    const label = await CommunityLabel.findByClusterId(clusterId);
    if (!label || !label.hierarchy?.path) {
      return label ? [label.label] : [];
    }
    return label.hierarchy.path;
  }

  /**
   * Build hierarchical structure from existing labels
   * Groups labels by domain and creates parent-child relationships
   */
  async buildHierarchicalStructure(
    clusters: KnowledgeClusterNode[]
  ): Promise<Map<string, LabelGenerationResult & {
    hierarchy?: {
      level: number;
      parentId?: string;
      childrenIds: string[];
      path: string[];
    };
  }>> {
    const hierarchy = new Map<string, LabelGenerationResult & {
      hierarchy?: {
        level: number;
        parentId?: string;
        childrenIds: string[];
        path: string[];
      };
    }>();

    // Generate flat labels first
    const flatResults = await this.generateLabelsBatch(clusters, {
      skipExisting: true,
    });

    // Group clusters by domain
    const domainGroups = new Map<string, string[]>();
    for (const result of flatResults) {
      if (!result.label) continue;

      const cluster = clusters.find((c) => c.id === result.clusterId);
      if (!cluster) continue;

      const domain = this.extractDomain(cluster, result.label);
      if (!domainGroups.has(domain)) {
        domainGroups.set(domain, []);
      }
      domainGroups.get(domain)!.push(result.clusterId);
    }

    // Create parent labels for domains with multiple children
    const parentLabels = new Map<string, { clusterId: string; label: string; level: number }>();

    for (const [domain, childIds] of domainGroups.entries()) {
      if (childIds.length < 2) continue;

      const parentId = `parent-${domain}`;
      const parentLabelText = this.getDomainLabel(domain);

      parentLabels.set(domain, {
        clusterId: parentId,
        label: parentLabelText,
        level: 0,
      });

      // Create parent label document
      await CommunityLabel.upsert(parentId, {
        clusterId: parentId,
        label: parentLabelText,
        metadata: {
          entityCount: 0,
        },
        hierarchy: {
          level: 0,
          path: [parentLabelText],
        },
      });
    }

    // Update child labels with hierarchy
    for (const result of flatResults) {
      if (!result.label) continue;

      const cluster = clusters.find((c) => c.id === result.clusterId);
      if (!cluster) continue;

      const domain = this.extractDomain(cluster, result.label);
      const parent = parentLabels.get(domain);

      const hierarchicalResult = await this.generateHierarchicalLabel(cluster, {
        parentLabel: parent,
        validate: false,
      });

      hierarchy.set(result.clusterId, hierarchicalResult);
    }

    return hierarchy;
  }

  /**
   * Extract domain from cluster metadata or label
   */
  private extractDomain(cluster: KnowledgeClusterNode, label: string): string {
    const metadata = cluster.metadata || {};
    if (metadata.domain) {
      return metadata.domain;
    }

    const labelLower = label.toLowerCase();
    const domainKeywords: Record<string, string> = {
      'milieu': 'milieu',
      'bodem': 'bodem',
      'water': 'water',
      'lucht': 'lucht',
      'ruimtelijk': 'ruimtelijk',
      'wonen': 'ruimtelijk',
      'woon': 'ruimtelijk',
      'verkeer': 'verkeer',
      'energie': 'energie',
    };

    for (const [keyword, domain] of Object.entries(domainKeywords)) {
      if (labelLower.includes(keyword)) {
        return domain;
      }
    }

    return 'overig';
  }

  /**
   * Get domain label in Dutch
   */
  private getDomainLabel(domain: string): string {
    const domainLabels: Record<string, string> = {
      'milieu': 'Milieu',
      'bodem': 'Bodem',
      'water': 'Water',
      'lucht': 'Lucht',
      'ruimtelijk': 'Ruimtelijke Ordening',
      'verkeer': 'Verkeer en Mobiliteit',
      'energie': 'Energie',
      'overig': 'Overig',
    };

    return domainLabels[domain] || domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  /**
   * Get hierarchical label with ancestors and descendants
   */
  async getHierarchicalLabel(clusterId: string): Promise<{
    label: string;
    level: number;
    parentId?: string;
    childrenIds: string[];
    ancestors: Array<{ clusterId: string; label: string; level: number }>;
    descendants: Array<{ clusterId: string; label: string; level: number }>;
    path: string[];
  } | null> {
    const label = await CommunityLabel.findByClusterId(clusterId);
    if (!label || !label.hierarchy) {
      return null;
    }

    const ancestors = await CommunityLabel.getAncestors(clusterId);
    const descendants = await CommunityLabel.getDescendants(clusterId);

    return {
      label: label.label,
      level: label.hierarchy.level,
      parentId: label.hierarchy.parentId,
      childrenIds: label.hierarchy.childrenIds || [],
      ancestors: ancestors.map((a) => ({
        clusterId: a.clusterId,
        label: a.label,
        level: a.hierarchy?.level || 0,
      })),
      descendants: descendants.map((d) => ({
        clusterId: d.clusterId,
        label: d.label,
        level: d.hierarchy?.level || 0,
      })),
      path: label.hierarchy.path || [label.label],
    };
  }
}
