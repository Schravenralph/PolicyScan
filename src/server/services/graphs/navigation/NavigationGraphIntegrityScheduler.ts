/**
 * Navigation Graph Integrity Scheduler
 * 
 * Runs periodic integrity checks and cleanup operations on the navigation graph
 * to ensure data consistency and remove broken relationships.
 */

import { logger } from '../../../utils/logger.js';
import { NavigationGraph } from './NavigationGraph.js';
// import type { Driver } from 'neo4j-driver'; // Unused
import {
    navigationGraphIntegrityChecks,
    navigationGraphIntegrityCheckDuration,
    navigationGraphIntegrityStatus,
    navigationGraphIntegrityIssues,
    navigationGraphBrokenRelationshipsCleaned,
    navigationGraphValidRelationships,
    navigationGraphBrokenRelationships,
} from '../../../utils/metrics.js';

export interface NavigationGraphIntegrityConfig {
    enabled: boolean;
    cronExpression: string; // e.g., '0 2 * * *' for daily at 2 AM
    timezone?: string; // Default: 'Europe/Amsterdam'
    runOnStartup?: boolean; // Run integrity check immediately on startup
    cleanupBrokenRelationships?: boolean; // Automatically cleanup broken relationships
    validateOnSchedule?: boolean; // Run validation checks on schedule
}

const DEFAULT_CONFIG: NavigationGraphIntegrityConfig = {
    enabled: true,
    cronExpression: '0 2 * * *', // Daily at 2 AM
    timezone: 'Europe/Amsterdam',
    runOnStartup: false,
    cleanupBrokenRelationships: true,
    validateOnSchedule: true,
};

/**
 * Service for scheduling navigation graph integrity checks and cleanup
 */
export class NavigationGraphIntegrityScheduler {
    private navigationGraph: NavigationGraph;
    private config: NavigationGraphIntegrityConfig;
    private cronJob: any = null;
    private isRunning: boolean = false;

    constructor(navigationGraph: NavigationGraph, config?: Partial<NavigationGraphIntegrityConfig>) {
        this.navigationGraph = navigationGraph;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Start the scheduled integrity checks
     */
    async start(): Promise<void> {
        if (!this.config.enabled) {
            logger.info('Navigation graph integrity scheduler is disabled');
            return;
        }

        if (this.cronJob) {
            logger.warn('Navigation graph integrity scheduler already running');
            return;
        }

        try {
            // Run on startup if configured
            if (this.config.runOnStartup) {
                logger.info('Running navigation graph integrity check on startup');
                await this.runIntegrityCheck();
            }

            // Import node-cron dynamically (it's an optional dependency)
            let cron: any;
            try {
                cron = await import('node-cron');
            } catch (error) {
                logger.warn(
                    { error },
                    'node-cron is not installed. Navigation graph integrity checks will not run on schedule. Install with: pnpm install node-cron'
                );
                return;
            }

            // Validate cron expression
            if (!cron.validate(this.config.cronExpression)) {
                throw new Error(`Invalid cron expression: ${this.config.cronExpression}`);
            }

            // Create and start cron job
            this.cronJob = cron.schedule(
                this.config.cronExpression,
                async () => {
                    await this.runIntegrityCheck();
                },
                {
                    scheduled: true,
                    timezone: this.config.timezone || 'Europe/Amsterdam',
                }
            );

            logger.info(
                {
                    cronExpression: this.config.cronExpression,
                    timezone: this.config.timezone,
                    nextRun: this.getNextRunTime(),
                },
                'Navigation graph integrity scheduler started'
            );
        } catch (error) {
            logger.error({ error }, 'Failed to start navigation graph integrity scheduler');
            throw error;
        }
    }

    /**
     * Stop the scheduled integrity checks
     */
    stop(): void {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            logger.info('Navigation graph integrity scheduler stopped');
        }
    }

    /**
     * Run integrity check manually
     */
    async runIntegrityCheck(): Promise<void> {
        if (this.isRunning) {
            logger.warn('Navigation graph integrity check already running, skipping');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            logger.info('Starting navigation graph integrity check');

            // Run validation if enabled
            if (this.config.validateOnSchedule) {
                const integrityResult = await this.navigationGraph.validateGraphIntegrity();
                
                // Update metrics
                navigationGraphIntegrityStatus.set(integrityResult.valid ? 1 : 0);
                
                // Reset all issue metrics to 0 first
                navigationGraphIntegrityIssues.reset();
                
                // Update issue metrics
                for (const issue of integrityResult.issues) {
                    navigationGraphIntegrityIssues.set({ issue_type: issue.type }, issue.count || 0);
                }
                
                logger.info(
                    {
                        valid: integrityResult.valid,
                        issueCount: integrityResult.issues.length,
                        issues: integrityResult.issues.map(i => ({ type: i.type, count: i.count })),
                    },
                    'Navigation graph integrity validation completed'
                );

                // If there are issues, log them
                if (!integrityResult.valid && integrityResult.issues.length > 0) {
                    for (const issue of integrityResult.issues) {
                        logger.warn(
                            {
                                type: issue.type,
                                description: issue.description,
                                count: issue.count,
                            },
                            'Navigation graph integrity issue detected'
                        );
                    }
                }
            }

            // Cleanup broken relationships if enabled
            if (this.config.cleanupBrokenRelationships) {
                // Get relationship validation before cleanup
                const relationshipValidation = await this.navigationGraph.validateRelationships();
                
                // Update relationship metrics
                navigationGraphValidRelationships.set(relationshipValidation.valid);
                navigationGraphBrokenRelationships.set(relationshipValidation.broken);
                
                const deletedCount = await this.navigationGraph.cleanupBrokenRelationships();
                
                if (deletedCount > 0) {
                    navigationGraphBrokenRelationshipsCleaned.inc(deletedCount);
                    logger.info(
                        { deletedCount },
                        'Cleaned up broken relationships in navigation graph'
                    );
                } else {
                    logger.debug('No broken relationships found in navigation graph');
                }
            }

            const duration = (Date.now() - startTime) / 1000;
            navigationGraphIntegrityCheckDuration.observe(duration);
            navigationGraphIntegrityChecks.inc({ status: 'success' });
            
            logger.info(
                { duration },
                'Navigation graph integrity check completed successfully'
            );
        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            navigationGraphIntegrityCheckDuration.observe(duration);
            navigationGraphIntegrityChecks.inc({ status: 'failed' });
            logger.error({ error }, 'Navigation graph integrity check failed');
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Get the next scheduled run time (approximate)
     */
    private getNextRunTime(): string {
        // Simple calculation - in production, use a proper cron parser
        // For now, return a placeholder
        const nextRun = new Date();
        nextRun.setHours(nextRun.getHours() + 24); // Approximate: next day
        return nextRun.toISOString();
    }

    /**
     * Check if the scheduler is running
     */
    isSchedulerRunning(): boolean {
        return this.cronJob !== null;
    }
}

