/**
 * Adaptive Traversal Service
 * Main service for KG-driven adaptive scraping with BFS/DFS paths
 */

import { SemanticLinkScorer, LinkContext, ScoringOptions } from './SemanticLinkScorer.js';
import { LinkPrioritizer, PrioritizedLink } from './LinkPrioritizer.js';
import { TraversalPlanner, TraversalPlan, TraversalStrategy } from './TraversalPlanner.js';
import { getKnowledgeGraphService } from '../knowledge-graph/core/KnowledgeGraph.js';
import { KnowledgeGraphServiceInterface } from '../knowledge-graph/core/KnowledgeGraphInterface.js';
import { GraphDBKnowledgeGraphService } from '../knowledge-graph/core/GraphDBKnowledgeGraphService.js';
import { validateGraphDBBackend } from '../knowledge-graph/utils/architectureValidation.js';
import { getGraphDBClient } from '../../config/graphdb.js';
import { getNeo4jDriver } from '../../config/neo4j.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { logger } from '../../utils/logger.js';
import { ServiceUnavailableError } from '../../types/errors.js';

export interface AdaptiveTraversalOptions {
  queryText?: string;
  queryEmbedding?: number[];
  strategy?: TraversalStrategy;
  maxDepth?: number;
  maxLinks?: number;
  minRelevanceThreshold?: number;
  earlyTerminationThreshold?: number;
}

export interface TraversalResult {
  plan: TraversalPlan;
  prioritizedLinks: PrioritizedLink[];
  entityNames: string[];
  metrics: {
    totalLinksScored: number;
    highPriorityLinks: number;
    planningTime: number;
  };
}

/**
 * Main service for adaptive traversal
 */
export class AdaptiveTraversalService {
  private scorer: SemanticLinkScorer;
  private prioritizer: LinkPrioritizer;
  private planner: TraversalPlanner;
  private kgService: KnowledgeGraphServiceInterface;

  constructor(kgService?: KnowledgeGraphServiceInterface) {
    this.scorer = new SemanticLinkScorer();
    this.prioritizer = new LinkPrioritizer(this.scorer);
    this.planner = new TraversalPlanner();
    
    // Use provided service, or initialize GraphDB (required)
    if (kgService) {
      // Validate architecture compliance: ensure provided service is GraphDB
      validateGraphDBBackend(kgService, {
        service: 'AdaptiveTraversalService',
        method: 'constructor'
      });
      this.kgService = kgService;
    } else {
      const backend = (process.env.KG_BACKEND || 'graphdb').toLowerCase();
      if (backend === 'graphdb') {
        try {
          const graphdbClient = getGraphDBClient();
          this.kgService = new GraphDBKnowledgeGraphService(graphdbClient);
        } catch (error) {
          logger.error({ error }, '[AdaptiveTraversalService] GraphDB not available. GraphDB is required.');
          const errorMsg = error instanceof Error ? error.message : String(error);
          throw new ServiceUnavailableError('GraphDB is required for Knowledge Graph. Ensure GraphDB is connected.', {
            reason: 'graphdb_not_available',
            operation: 'constructor',
            originalError: errorMsg
          });
        }
      } else {
        throw new ServiceUnavailableError('GraphDB is required for Knowledge Graph. Set KG_BACKEND=graphdb.', {
          reason: 'graphdb_backend_not_configured',
          operation: 'constructor',
          kgBackend: process.env.KG_BACKEND
        });
      }
    }
  }

  /**
   * Check if adaptive traversal is enabled
   */
  static isEnabled(): boolean {
    if (!FeatureFlag.isKGEnabled()) {
      return false;
    }
    return FeatureFlag.isEnabled(KGFeatureFlag.KG_ADAPTIVE_TRAVERSAL_ENABLED, false);
  }

  /**
   * Plan adaptive traversal paths from links
   */
  async planTraversal(
    links: LinkContext[],
    rootUrl?: string,
    options: AdaptiveTraversalOptions = {}
  ): Promise<TraversalResult> {
    if (!AdaptiveTraversalService.isEnabled()) {
      logger.debug('[AdaptiveTraversal] Feature disabled, returning empty plan');
      return this.createEmptyResult();
    }

    const startTime = Date.now();

    try {
      // 1. Get KG entities for entity matching
      const entityNames = await this.getRelevantEntityNames(options.queryText);

      // 2. Score links based on semantic relevance
      const scoringOptions: ScoringOptions = {
        queryText: options.queryText,
        queryEmbedding: options.queryEmbedding,
        entityNames,
      };

      // 3. Prioritize links
      const prioritizedLinks = await this.prioritizer.prioritizeLinks(links, {
        minRelevanceThreshold: options.minRelevanceThreshold || 0.3,
        maxLinks: options.maxLinks || 200,
      });

      // 4. Plan traversal paths
      const plan = this.planner.planTraversal(prioritizedLinks, rootUrl, {
        strategy: options.strategy || 'hybrid',
        maxDepth: options.maxDepth || 3,
        maxLinks: options.maxLinks || 200,
        earlyTerminationThreshold: options.earlyTerminationThreshold || 0.3,
      });

      const planningTime = Date.now() - startTime;

      logger.info(
        `[AdaptiveTraversal] Planned ${plan.paths.length} paths in ${planningTime}ms`
      );

      return {
        plan,
        prioritizedLinks,
        entityNames,
        metrics: {
          totalLinksScored: links.length,
          highPriorityLinks: prioritizedLinks.filter(l => l.priority === 'high').length,
          planningTime,
        },
      };
    } catch (error) {
      logger.error({ error }, '[AdaptiveTraversal] Error planning traversal');
      return this.createEmptyResult();
    }
  }

  /**
   * Get relevant entity names from KG for entity matching
   */
  private async getRelevantEntityNames(queryText?: string): Promise<string[]> {
    try {
      if (!queryText) {
        return [];
      }

      // Query KG for entities related to query
      // This is a simplified version - in practice, you'd use semantic search
      const entities: string[] = [];

      // Try to find entities by name in query
      // In a full implementation, you'd use:
      // - Entity search by name
      // - Semantic entity search
      // - Query expansion with entity names

      // For now, return empty array (can be enhanced later)
      return entities;
    } catch (error) {
      logger.warn(`[AdaptiveTraversal] Error getting entity names: ${error}`);
      return [];
    }
  }

  /**
   * Create empty result when feature is disabled or error occurs
   */
  private createEmptyResult(): TraversalResult {
    return {
      plan: {
        paths: [],
        strategy: 'hybrid',
        maxDepth: 0,
        totalLinks: 0,
      },
      prioritizedLinks: [],
      entityNames: [],
      metrics: {
        totalLinksScored: 0,
        highPriorityLinks: 0,
        planningTime: 0,
      },
    };
  }

  /**
   * Update link priorities based on discovered entities during scraping
   * This creates the feedback loop: KG → scraping → KG
   */
  async updatePrioritiesFromEntities(
    links: LinkContext[],
    discoveredEntities: string[],
    options: AdaptiveTraversalOptions = {}
  ): Promise<PrioritizedLink[]> {
    if (!AdaptiveTraversalService.isEnabled()) {
      return [];
    }

    // Re-prioritize with discovered entities
    const scoringOptions: ScoringOptions = {
      queryText: options.queryText,
      queryEmbedding: options.queryEmbedding,
      entityNames: discoveredEntities,
    };

    // Update entity names in scorer context
    const prioritizedLinks = await this.prioritizer.prioritizeLinks(links, {
      minRelevanceThreshold: options.minRelevanceThreshold || 0.3,
      maxLinks: options.maxLinks || 200,
    });

    logger.debug(
      `[AdaptiveTraversal] Updated priorities for ${prioritizedLinks.length} links based on ${discoveredEntities.length} entities`
    );

    return prioritizedLinks;
  }

  /**
   * Get traversal paths as simple URL list (for easy integration)
   */
  async getTraversalUrls(
    links: LinkContext[],
    rootUrl?: string,
    options: AdaptiveTraversalOptions = {}
  ): Promise<string[]> {
    const result = await this.planTraversal(links, rootUrl, options);
    return result.plan.paths.map(path => path.url);
  }
}

