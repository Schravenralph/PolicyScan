/**
 * Background job service for automatically building graph structure
 * 
 * Runs on a schedule (default: daily at 2 AM) to maintain graph organization
 * by building structure from isolated nodes.
 */

import { logger } from '../../utils/logger.js';
import { NavigationGraph } from '../graphs/navigation/NavigationGraph.js';
import { RelationshipBuilderService } from '../graphs/navigation/RelationshipBuilderService.js';
import { GraphStructureBuilder, StructureBuildOptions } from '../graphs/navigation/GraphStructureBuilder.js';
import { getEnv } from '../../config/env.js';

/**
 * Background job for scheduled graph structure building
 */
export class GraphStructureScheduleJob {
    private navigationGraph: NavigationGraph;
    private relationshipBuilder: RelationshipBuilderService;
    private intervalId: NodeJS.Timeout | null = null;
    private readonly CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check every hour
    private lastRunDate: string | null = null;
    private enabled: boolean;
    private scheduleHour: number; // Hour of day (0-23) when job should run
    private strategy: StructureBuildOptions['strategy'];
    private maxDepth: number;
    private minGroupSize: number;

    constructor(
        navigationGraph: NavigationGraph,
        relationshipBuilder: RelationshipBuilderService
    ) {
        this.navigationGraph = navigationGraph;
        this.relationshipBuilder = relationshipBuilder;
        
        // Configuration from environment variables
        const env = getEnv();
        this.enabled = env.GRAPH_STRUCTURE_BUILD_ENABLED;
        this.scheduleHour = env.GRAPH_STRUCTURE_BUILD_HOUR;
        this.strategy = env.GRAPH_STRUCTURE_BUILD_STRATEGY;
        this.maxDepth = env.GRAPH_STRUCTURE_BUILD_MAX_DEPTH;
        this.minGroupSize = env.GRAPH_STRUCTURE_BUILD_MIN_GROUP_SIZE;
    }

    /**
     * Start the background job
     */
    start(): void {
        if (this.intervalId) {
            logger.warn('Graph structure schedule job already running');
            return;
        }

        if (!this.enabled) {
            logger.info('Graph structure building is disabled');
            return;
        }

        logger.info(
            {
                scheduleHour: this.scheduleHour,
                strategy: this.strategy,
                maxDepth: this.maxDepth,
                minGroupSize: this.minGroupSize
            },
            'Starting graph structure schedule job'
        );

        // Check immediately if we should run (for testing/debugging)
        this.checkAndRun().catch((error) => {
            logger.error({ error }, 'Error in initial graph structure building check');
        });

        // Then check every hour
        this.intervalId = setInterval(() => {
            this.checkAndRun().catch((error) => {
                logger.error({ error }, 'Error checking graph structure building schedule');
            });
        }, this.CHECK_INTERVAL_MS);

        logger.info(
            { scheduleHour: this.scheduleHour, checkInterval: this.CHECK_INTERVAL_MS },
            'Graph structure schedule job started (checking every hour)'
        );
    }

    /**
     * Stop the background job
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger.info('Graph structure schedule job stopped');
        }
    }

    /**
     * Check if it's time to run and execute if so
     */
    private async checkAndRun(): Promise<void> {
        const now = new Date();
        const currentHour = now.getHours();
        const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD

        // Check if it's the scheduled hour and we haven't run today
        if (currentHour === this.scheduleHour && this.lastRunDate !== currentDate) {
            logger.info(
                { currentHour, scheduleHour: this.scheduleHour, date: currentDate },
                'Scheduled time reached, starting graph structure building'
            );

            await this.runStructureBuilding();
            this.lastRunDate = currentDate;
        }
    }

    /**
     * Execute graph structure building
     */
    private async runStructureBuilding(): Promise<void> {
        const startTime = Date.now();
        logger.info('Starting scheduled graph structure building');

        try {
            const builder = new GraphStructureBuilder(this.navigationGraph, this.relationshipBuilder);
            const result = await builder.buildStructure({
                strategy: this.strategy,
                maxDepth: this.maxDepth,
                minGroupSize: this.minGroupSize,
                setRootIfMissing: true
            });

            const duration = Date.now() - startTime;
            logger.info(
                {
                    nodesProcessed: result.nodesProcessed,
                    relationshipsCreated: result.relationshipsCreated,
                    groupsCreated: result.groupsCreated,
                    rootNodeSet: result.rootNodeSet,
                    duration
                },
                'Scheduled graph structure building completed'
            );
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error(
                { error, duration },
                'Scheduled graph structure building failed'
            );
            // Don't throw - we want the job to continue running
        }
    }

    /**
     * Manually trigger structure building (for testing or manual execution)
     */
    async triggerNow(): Promise<void> {
        logger.info('Manually triggering graph structure building');
        await this.runStructureBuilding();
    }

    /**
     * Get job status
     */
    getStatus(): {
        enabled: boolean;
        scheduleHour: number;
        strategy: string;
        lastRunDate: string | null;
        isRunning: boolean;
    } {
        return {
            enabled: this.enabled,
            scheduleHour: this.scheduleHour,
            strategy: this.strategy || 'hierarchical',
            lastRunDate: this.lastRunDate,
            isRunning: this.intervalId !== null
        };
    }
}

