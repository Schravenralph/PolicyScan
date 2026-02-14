/**
 * Scheduled job for graph structure building
 * 
 * Automatically runs the graph structure builder on a schedule to maintain
 * graph organization as new nodes are added.
 */

import { logger } from '../../utils/logger.js';
import { NavigationGraph } from '../graphs/navigation/NavigationGraph.js';
import { RelationshipBuilderService } from '../graphs/navigation/RelationshipBuilderService.js';
import { GraphStructureBuilder, StructureBuildOptions } from '../graphs/navigation/GraphStructureBuilder.js';
import { getNeo4jDriver } from '../../config/neo4j.js';
import { LocalEmbeddingProvider } from '../query/VectorService.js';

/**
 * Configuration for graph structure building schedule
 */
export interface GraphStructureBuilderScheduleConfig {
  /** Cron expression for schedule (default: '0 2 * * *' = daily at 2 AM) */
  cronExpression?: string;
  /** Whether the job is enabled (default: true) */
  enabled?: boolean;
  /** Strategy to use for building structure (default: 'hierarchical') */
  strategy?: StructureBuildOptions['strategy'];
  /** Maximum depth for hierarchical structure (default: 3) */
  maxDepth?: number;
  /** Minimum group size (default: 2) */
  minGroupSize?: number;
  /** Whether to set root if missing (default: true) */
  setRootIfMissing?: boolean;
}

/**
 * Background job service for automatically building graph structure
 */
export class GraphStructureBuilderScheduleJob {
  private cronJob: any = null;
  private navigationGraph: NavigationGraph | null = null;
  private relationshipBuilder: RelationshipBuilderService | null = null;
  private structureBuilder: GraphStructureBuilder | null = null;
  private config: Required<GraphStructureBuilderScheduleConfig>;
  private isRunning: boolean = false;
  private lastRunAt: Date | null = null;
  private lastResult: any = null;

  constructor(config: GraphStructureBuilderScheduleConfig = {}) {
    // Load configuration from environment variables or use defaults
    const cronExpression = config.cronExpression || 
      process.env.GRAPH_STRUCTURE_BUILDER_CRON || 
      '0 2 * * *'; // Daily at 2 AM

    this.config = {
      cronExpression,
      enabled: config.enabled ?? (process.env.GRAPH_STRUCTURE_BUILDER_ENABLED !== 'false'),
      strategy: config.strategy || 'hierarchical',
      maxDepth: config.maxDepth || 3,
      minGroupSize: config.minGroupSize || 2,
      setRootIfMissing: config.setRootIfMissing ?? true,
    };

    logger.info(
      {
        cronExpression: this.config.cronExpression,
        enabled: this.config.enabled,
        strategy: this.config.strategy,
      },
      'GraphStructureBuilderScheduleJob initialized'
    );
  }

  /**
   * Initialize services (lazy initialization)
   */
  private async initializeServices(): Promise<void> {
    if (this.navigationGraph && this.relationshipBuilder && this.structureBuilder) {
      return; // Already initialized
    }

    const driver = getNeo4jDriver();
    if (!driver) {
      throw new Error('Neo4j driver is not available. Cannot initialize graph structure builder.');
    }

    this.navigationGraph = new NavigationGraph(driver);
    await this.navigationGraph.initialize();

    const embeddingProvider = new LocalEmbeddingProvider();
    this.relationshipBuilder = new RelationshipBuilderService(
      driver,
      this.navigationGraph,
      embeddingProvider
    );

    this.structureBuilder = new GraphStructureBuilder(
      this.navigationGraph,
      this.relationshipBuilder
    );

    logger.debug('Graph structure builder services initialized');
  }

  /**
   * Start the scheduled job
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Graph structure builder schedule is disabled');
      return;
    }

    if (this.cronJob) {
      logger.warn('Graph structure builder schedule job already running');
      return;
    }

    try {
      // Initialize services
      await this.initializeServices();

      // Import node-cron dynamically (it's an optional dependency)
      let cron: any;
        try {
          cron = await import('node-cron');
      } catch (error) {
        logger.error(
          { error },
          'node-cron is not installed. Install it with: pnpm install node-cron'
        );
        throw new Error('node-cron is required for scheduled graph structure building');
      }

      // Validate cron expression
      if (!cron.validate(this.config.cronExpression)) {
        throw new Error(`Invalid cron expression: ${this.config.cronExpression}`);
      }

      // Create and start cron job
      this.cronJob = cron.schedule(
        this.config.cronExpression,
        async () => {
          await this.runStructureBuilding();
        },
        {
          scheduled: true,
          timezone: 'Europe/Amsterdam', // Default timezone, can be made configurable
        }
      );

      logger.info(
        {
          cronExpression: this.config.cronExpression,
          nextRun: this.getNextRunTime(),
        },
        'Graph structure builder schedule job started'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to start graph structure builder schedule job');
      throw error;
    }
  }

  /**
   * Stop the scheduled job
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Graph structure builder schedule job stopped');
    }
  }

  /**
   * Run structure building manually (can be called outside of schedule)
   */
  async runStructureBuilding(): Promise<any> {
    if (this.isRunning) {
      logger.warn('Graph structure building is already running, skipping');
      return this.lastResult;
    }

    if (!this.config.enabled) {
      logger.debug('Graph structure building is disabled');
      return null;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      // Ensure services are initialized
      await this.initializeServices();

      if (!this.structureBuilder) {
        throw new Error('Structure builder is not initialized');
      }

      logger.info('Starting scheduled graph structure building');

      // Build structure with configured options
      const result = await this.structureBuilder.buildStructure({
        strategy: this.config.strategy,
        maxDepth: this.config.maxDepth,
        minGroupSize: this.config.minGroupSize,
        setRootIfMissing: this.config.setRootIfMissing,
      });

      const duration = Date.now() - startTime;
      this.lastRunAt = new Date();
      this.lastResult = result;

      logger.info(
        {
          nodesProcessed: result.nodesProcessed,
          relationshipsCreated: result.relationshipsCreated,
          groupsCreated: result.groupsCreated,
          rootNodeSet: result.rootNodeSet,
          duration,
        },
        'Graph structure building completed successfully'
      );

      return result;
    } catch (error) {
      logger.error(
        { error, duration: Date.now() - startTime },
        'Graph structure building failed'
      );
      // Don't throw - we want the job to continue running
      return null;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get job status
   */
  getStatus(): {
    enabled: boolean;
    running: boolean;
    lastRunAt: Date | null;
    nextRunTime: Date | null;
    config: GraphStructureBuilderScheduleConfig;
    lastResult: any;
  } {
    return {
      enabled: this.config.enabled,
      running: this.isRunning,
      lastRunAt: this.lastRunAt,
      nextRunTime: this.getNextRunTime(),
      config: this.config,
      lastResult: this.lastResult,
    };
  }

  /**
   * Get next run time based on cron expression
   */
  private getNextRunTime(): Date | null {
    if (!this.cronJob || !this.config.enabled) {
      return null;
    }

    try {
      // node-cron doesn't provide a direct way to get next run time
      // We'll calculate it manually or return null
      // For now, return null and let the caller handle it
      return null;
    } catch (error) {
      logger.warn({ error }, 'Failed to calculate next run time');
      return null;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GraphStructureBuilderScheduleConfig>): void {
    const wasRunning = this.cronJob !== null;

    // Stop if running
    if (wasRunning) {
      this.stop();
    }

    // Update config
    this.config = {
      ...this.config,
      ...config,
    };

    // Restart if it was running
    if (wasRunning && this.config.enabled) {
      this.start().catch((error) => {
        logger.error({ error }, 'Failed to restart graph structure builder schedule');
      });
    }

    logger.info({ config: this.config }, 'Graph structure builder schedule config updated');
  }
}

