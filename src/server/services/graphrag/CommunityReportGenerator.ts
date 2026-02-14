import { LLMService } from '../llm/LLMService.js';
import { KnowledgeClusterNode } from '../knowledge-graph/clustering/KnowledgeGraphClusteringService.js';
import { KnowledgeGraphService } from '../knowledge-graph/core/KnowledgeGraph.js';
import { BaseEntity } from '../../domain/ontology.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { SemanticCommunityLabeler } from './SemanticCommunityLabeler.js';
import { CommunityReport, CommunityReportDocument, CommunityReportCreateInput } from '../../models/CommunityReport.js';
import {
  getKeyEntitiesPrompt,
  getKeyRelationshipsPrompt,
  getRepresentativeExamplesPrompt,
  ReportGenerationContext,
} from './prompts/reportGenerationPrompts.js';
import { logger } from '../../utils/logger.js';
import { ErrorMonitoringService } from '../monitoring/ErrorMonitoringService.js';
import { ErrorComponent } from '../../models/ErrorLog.js';

export interface ReportGenerationResult {
  clusterId: string;
  report: CommunityReportDocument;
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

export interface BatchReportOptions {
  batchSize?: number;
  parallel?: boolean;
  skipExisting?: boolean;
}

/**
 * Service for generating structured community reports
 * Generates reports containing semantic label, summary, key entities, key relationships, and representative examples
 */
export class CommunityReportGenerator {
  private llmService: LLMService;
  private knowledgeGraph: KnowledgeGraphService;
  private semanticLabeler: SemanticCommunityLabeler;
  private reportCache: Map<string, CommunityReportDocument> = new Map();
  private errorMonitoring: ErrorMonitoringService;
  private readonly PERFORMANCE_THRESHOLD_MS = 10000; // 10 seconds threshold for reports

  constructor(
    knowledgeGraph: KnowledgeGraphService,
    semanticLabeler: SemanticCommunityLabeler,
    llmService?: LLMService,
    errorMonitoring?: ErrorMonitoringService
  ) {
    this.knowledgeGraph = knowledgeGraph;
    this.semanticLabeler = semanticLabeler;
    this.llmService = llmService || new LLMService();
    this.errorMonitoring = errorMonitoring || new ErrorMonitoringService();
  }

  /**
   * Check if community reports are enabled
   */
  async isEnabled(): Promise<boolean> {
    if (!FeatureFlag.isKGEnabled()) {
      return false;
    }
    return FeatureFlag.isEnabled(KGFeatureFlag.KG_COMMUNITY_REPORTS_ENABLED, false);
  }

  /**
   * Generate a community report for a single cluster
   */
  async generateReport(
    cluster: KnowledgeClusterNode,
    options: {
      forceRegenerate?: boolean;
    } = {}
  ): Promise<ReportGenerationResult> {
    const { forceRegenerate = false } = options;

    // Check if feature is enabled
    if (!(await this.isEnabled())) {
      throw new Error('Community reports are disabled. Enable KG_COMMUNITY_REPORTS_ENABLED feature flag.');
    }

    // Check cache first
    if (!forceRegenerate) {
      const cached = await this.getCachedReport(cluster.id);
      if (cached) {
        logger.debug(`[CommunityReportGenerator] Using cached report for cluster ${cluster.id}`);
        return {
          clusterId: cluster.id,
          report: cached,
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
      // Step 1: Get semantic label and summary from SemanticCommunityLabeler
      const labelResult = await this.semanticLabeler.generateLabel(cluster);
      const label = labelResult.label;
      const summary = labelResult.summary || '';

      // Step 2: Retrieve entities from the cluster
      const entities = await this.retrieveEntities(cluster);
      
      // Step 3: Retrieve relationships from the cluster
      const relationships = await this.retrieveRelationships(cluster, entities);

      // Step 4: Generate context for LLM prompts
      const context: ReportGenerationContext = {
        label,
        summary,
        entities: entities.map((e) => ({
          id: e.id,
          type: e.type,
          name: e.name,
          description: e.description,
        })),
        relationships,
        entityCount: cluster.nodeCount,
        relationshipCount: relationships.length,
        domain: cluster.metadata?.domain,
        jurisdiction: cluster.metadata?.jurisdiction,
      };

      // Step 5: Extract key entities using LLM
      const keyEntitiesResult = await this.extractKeyEntities(context);
      llmCalls += keyEntitiesResult.llmCalls;
      tokensUsed += keyEntitiesResult.tokensUsed;

      // Step 6: Extract key relationships using LLM
      const keyRelationshipsResult = await this.extractKeyRelationships(context);
      llmCalls += keyRelationshipsResult.llmCalls;
      tokensUsed += keyRelationshipsResult.tokensUsed;

      // Step 7: Generate representative examples using LLM
      const examplesResult = await this.generateRepresentativeExamples(context);
      llmCalls += examplesResult.llmCalls;
      tokensUsed += examplesResult.tokensUsed;

      // Step 8: Build key entities with full entity information
      const keyEntities = keyEntitiesResult.entities
        .map((ke) => {
          const entity = entities.find((e) => e.id === ke.id);
          if (!entity) return null;
          return {
            id: entity.id,
            type: entity.type,
            name: entity.name,
            description: entity.description,
            importanceScore: ke.importanceScore,
          };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null);

      // Step 9: Build key relationships with full relationship information
      const keyRelationships = keyRelationshipsResult.relationships
        .map((kr) => {
          const relationship = relationships.find(
            (r) => r.sourceId === kr.sourceId && r.targetId === kr.targetId && r.type === kr.type
          );
          if (!relationship) return null;
          return {
            sourceId: relationship.sourceId,
            targetId: relationship.targetId,
            type: relationship.type,
            sourceName: relationship.sourceName,
            targetName: relationship.targetName,
            importanceScore: kr.importanceScore,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      // Step 10: Save report to database
      const reportData: CommunityReportCreateInput = {
        clusterId: cluster.id,
        label,
        summary,
        keyEntities: keyEntities.slice(0, 10), // Ensure max 10
        keyRelationships: keyRelationships.slice(0, 10), // Ensure max 10
        representativeExamples: examplesResult.examples.slice(0, 5), // Ensure max 5
        metadata: {
          entityCount: cluster.nodeCount,
          relationshipCount: relationships.length,
          domain: cluster.metadata?.domain,
          jurisdiction: cluster.metadata?.jurisdiction,
          generationTimestamp: new Date(),
        },
        cost: {
          llmCalls,
          tokensUsed,
          estimatedCost: tokensUsed * estimatedCostPerToken,
        },
      };

      const savedReport = await CommunityReport.upsert(cluster.id, reportData);
      this.reportCache.set(cluster.id, savedReport);

      const elapsed = Date.now() - startTime;
      const exceededThreshold = elapsed > this.PERFORMANCE_THRESHOLD_MS;
      
      if (exceededThreshold) {
        logger.warn(
          `[CommunityReportGenerator] Report generation exceeded threshold (${elapsed}ms > ${this.PERFORMANCE_THRESHOLD_MS}ms) for cluster ${cluster.id}`
        );
      }

      logger.info(
        `[CommunityReportGenerator] Generated report for cluster ${cluster.id} in ${elapsed}ms with ${keyEntities.length} entities and ${keyRelationships.length} relationships`
      );

      return {
        clusterId: cluster.id,
        report: savedReport,
        cost: savedReport.cost ? {
          llmCalls: savedReport.cost.llmCalls ?? 0,
          tokensUsed: savedReport.cost.tokensUsed ?? 0,
          estimatedCost: savedReport.cost.estimatedCost ?? 0,
        } : undefined,
        performance: {
          generationTimeMs: elapsed,
          exceededThreshold,
        },
        cached: false,
      };
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      logger.error({ 
        error: errorObj,
        clusterId: cluster.id 
      }, `[CommunityReportGenerator] Failed to generate report for cluster ${cluster.id}`);
      
      // Capture error in monitoring system for alerting
      try {
        await this.errorMonitoring.captureError(errorObj, {
          component: 'other' as ErrorComponent,
          metadata: {
            service: 'CommunityReportGenerator',
            operation: 'generateReport',
            clusterId: cluster.id,
            nodeCount: cluster.nodeCount,
            domain: cluster.metadata?.domain,
            jurisdiction: cluster.metadata?.jurisdiction,
            elapsedTime: Date.now() - startTime,
          },
        });
      } catch (monitoringError: unknown) {
        const monitoringErrorObj = monitoringError instanceof Error ? monitoringError : new Error(String(monitoringError));
        logger.warn({ error: monitoringErrorObj }, `[CommunityReportGenerator] Failed to report error to monitoring`);
      }
      
      throw error;
    }
  }

  /**
   * Generate reports for multiple communities (batch processing)
   */
  async generateReportsBatch(
    clusters: KnowledgeClusterNode[],
    options: BatchReportOptions = {}
  ): Promise<ReportGenerationResult[]> {
    const {
      batchSize = 10,
      parallel = false,
      skipExisting = true,
    } = options;

    // Filter out clusters that already have reports if skipExisting is true
    let clustersToProcess = clusters;
    if (skipExisting) {
      const existingReports = await CommunityReport.findByClusterIds(clusters.map((c) => c.id));
      const existingClusterIds = new Set(existingReports.map((r) => r.clusterId));
      clustersToProcess = clusters.filter((c) => !existingClusterIds.has(c.id));
      logger.info(
        `[CommunityReportGenerator] Skipping ${clusters.length - clustersToProcess.length} clusters with existing reports`
      );
    }

    if (clustersToProcess.length === 0) {
      return [];
    }

    const results: ReportGenerationResult[] = [];

    if (parallel) {
      // Process in parallel batches
      for (let i = 0; i < clustersToProcess.length; i += batchSize) {
        const batch = clustersToProcess.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map((cluster) =>
            this.generateReport(cluster).catch((error) => {
              logger.error({ 
                error: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
                clusterId: cluster.id 
              }, `[CommunityReportGenerator] Failed to generate report for cluster ${cluster.id}`);
              // Error monitoring is handled in generateReport catch block
              return null;
            })
          )
        );

        const validResults = batchResults.filter((r): r is ReportGenerationResult => r !== null);
        results.push(...validResults);
      }
    } else {
      // Process sequentially
      for (const cluster of clustersToProcess) {
        try {
          const result = await this.generateReport(cluster);
          results.push(result);
        } catch (error) {
          logger.error({ 
            error: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            clusterId: cluster.id 
          }, `[CommunityReportGenerator] Failed to generate report for cluster ${cluster.id}`);
          // Error monitoring is handled in generateReport catch block
        }
      }
    }

    // Calculate batch processing metrics
    const totalTime = results.reduce((sum, r) => sum + (r.performance?.generationTimeMs || 0), 0);
    const avgTime = results.length > 0 ? totalTime / results.length : 0;
    const exceededThreshold = results.filter(r => r.performance?.exceededThreshold).length;

    logger.info(
      `[CommunityReportGenerator] Generated ${results.length} reports from ${clustersToProcess.length} clusters. ` +
      `Avg time: ${avgTime.toFixed(0)}ms, Exceeded threshold: ${exceededThreshold}`
    );

    return results;
  }

  /**
   * Get cached report for a cluster
   */
  async getCachedReport(clusterId: string): Promise<CommunityReportDocument | null> {
    // Check in-memory cache first
    if (this.reportCache.has(clusterId)) {
      return this.reportCache.get(clusterId)!;
    }

    // Check database
    const report = await CommunityReport.findByClusterId(clusterId);
    if (report) {
      this.reportCache.set(clusterId, report);
      return report;
    }

    return null;
  }

  /**
   * Retrieve entities from a cluster
   */
  private async retrieveEntities(cluster: KnowledgeClusterNode): Promise<BaseEntity[]> {
    const entities: BaseEntity[] = [];

    if (cluster.entityIds && cluster.entityIds.length > 0) {
      // Retrieve entities by IDs
      for (const entityId of cluster.entityIds) {
        try {
          const entity = await this.knowledgeGraph.getNode(entityId);
          if (entity) {
            entities.push(entity);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn({ 
            error: errorMessage,
            errorStack: error instanceof Error ? error.stack : undefined,
            entityId 
          }, `[CommunityReportGenerator] Failed to retrieve entity ${entityId}:`);
        }
      }
    } else if (cluster.representativeEntity) {
      entities.push(cluster.representativeEntity);
    }

    return entities;
  }

  /**
   * Retrieve relationships from a cluster
   */
  private async retrieveRelationships(
    cluster: KnowledgeClusterNode,
    entities: BaseEntity[]
  ): Promise<Array<{ sourceId: string; targetId: string; type: string; sourceName?: string; targetName?: string }>> {
    if (entities.length === 0) {
      return [];
    }

    const entityIds = entities.map((e) => e.id);
    
    try {
      // Get relationships between entities in the cluster
      const relationships = await this.knowledgeGraph.getRelationshipsBetweenEntities(entityIds);

      // Enrich with entity names
      return relationships.map((rel) => {
        const sourceEntity = entities.find((e) => e.id === rel.sourceId);
        const targetEntity = entities.find((e) => e.id === rel.targetId);
        return {
          sourceId: rel.sourceId,
          targetId: rel.targetId,
          type: rel.type,
          sourceName: sourceEntity?.name,
          targetName: targetEntity?.name,
        };
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn({ 
        error: errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined,
        clusterId: cluster.id 
      }, `[CommunityReportGenerator] Failed to retrieve relationships for cluster ${cluster.id}:`);
      return [];
    }
  }

  /**
   * Extract key entities using LLM
   */
  private async extractKeyEntities(context: ReportGenerationContext): Promise<{
    entities: Array<{ id: string; importanceScore: number }>;
    llmCalls: number;
    tokensUsed: number;
  }> {
    const prompt = getKeyEntitiesPrompt(context);
    const response = await this.llmService.generate([
      { role: 'user', content: prompt },
    ]);

    let entities: Array<{ id: string; importanceScore: number }> = [];

    try {
      const parsed = JSON.parse(response.content);
      if (Array.isArray(parsed)) {
        entities = parsed.map((item: { id?: string; importanceScore?: number }) => ({
          id: item.id || '',
          importanceScore: typeof item.importanceScore === 'number' ? item.importanceScore : 0.5,
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn({ 
        error: errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined
      }, `[CommunityReportGenerator] Failed to parse key entities response:`);
      // Fallback: use first 10 entities
      entities = context.entities.slice(0, 10).map((e) => ({ id: e.id, importanceScore: 0.5 }));
    }

    return {
      entities,
      llmCalls: 1,
      tokensUsed: response.usage?.totalTokens || 0,
    };
  }

  /**
   * Extract key relationships using LLM
   */
  private async extractKeyRelationships(context: ReportGenerationContext): Promise<{
    relationships: Array<{ sourceId: string; targetId: string; type: string; importanceScore: number }>;
    llmCalls: number;
    tokensUsed: number;
  }> {
    if (context.relationships.length === 0) {
      return { relationships: [], llmCalls: 0, tokensUsed: 0 };
    }

    const prompt = getKeyRelationshipsPrompt(context);
    const response = await this.llmService.generate([
      { role: 'user', content: prompt },
    ]);

    let relationships: Array<{ sourceId: string; targetId: string; type: string; importanceScore: number }> = [];

    try {
      const parsed = JSON.parse(response.content);
      if (Array.isArray(parsed)) {
        relationships = parsed.map((item: { sourceId?: string; targetId?: string; type?: string; importanceScore?: number }) => ({
          sourceId: item.sourceId || '',
          targetId: item.targetId || '',
          type: item.type || '',
          importanceScore: typeof item.importanceScore === 'number' ? item.importanceScore : 0.5,
        }));
      }
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      logger.warn({ 
        error: errorObj
      }, `[CommunityReportGenerator] Failed to parse key relationships response:`);
      // Fallback: use first 10 relationships
      relationships = context.relationships.slice(0, 10).map((r) => ({
        sourceId: r.sourceId,
        targetId: r.targetId,
        type: r.type,
        importanceScore: 0.5,
      }));
    }

    return {
      relationships,
      llmCalls: 1,
      tokensUsed: response.usage?.totalTokens || 0,
    };
  }

  /**
   * Generate representative examples using LLM
   */
  private async generateRepresentativeExamples(context: ReportGenerationContext): Promise<{
    examples: Array<{
      type: 'entity' | 'relationship';
      entityId?: string;
      relationshipId?: string;
      description: string;
    }>;
    llmCalls: number;
    tokensUsed: number;
  }> {
    const prompt = getRepresentativeExamplesPrompt(context);
    const response = await this.llmService.generate([
      { role: 'user', content: prompt },
    ]);

    let examples: Array<{
      type: 'entity' | 'relationship';
      entityId?: string;
      relationshipId?: string;
      description: string;
    }> = [];

    try {
      const parsed = JSON.parse(response.content);
      if (Array.isArray(parsed)) {
        examples = parsed.map((item: { type?: string; entityId?: string; relationshipId?: string; description?: string }) => ({
          type: item.type === 'relationship' ? 'relationship' : 'entity',
          entityId: item.entityId || '',
          relationshipId: item.relationshipId || '',
          description: item.description || '',
        }));
      }
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      logger.warn({ 
        error: errorObj
      }, `[CommunityReportGenerator] Failed to parse representative examples response:`);
      // Fallback: create simple examples from top entities
      examples = context.entities.slice(0, 3).map((e) => ({
        type: 'entity' as const,
        entityId: e.id,
        description: `Example entity: ${e.name} (${e.type})`,
      }));
    }

    return {
      examples: examples.slice(0, 5), // Ensure max 5
      llmCalls: 1,
      tokensUsed: response.usage?.totalTokens || 0,
    };
  }
}
















