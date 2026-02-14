/**
 * Performance Metrics Service for Workflow Steps
 * 
 * Collects and tracks performance metrics for individual workflow steps,
 * including execution time, result counts, and performance cap applications.
 */

import { getDB } from '../../config/database.js';
import { ObjectId } from 'mongodb';
import { logger } from '../../utils/logger.js';
import type { StepIdentifier } from '../../types/performanceConfig.js';

/**
 * Performance metric for a workflow step
 */
export interface StepPerformanceMetric {
    _id?: ObjectId;
    runId: string;
    workflowId?: string;
    stepIdentifier: StepIdentifier;
    stepName?: string;
    startTime: Date;
    endTime?: Date;
    duration?: number; // milliseconds
    resultsCount: number;
    requestedMaxResults?: number;
    actualMaxResults?: number;
    capped: boolean;
    hybridRetrievalUsed?: boolean;
    error?: boolean;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
}

const COLLECTION_NAME = 'workflow_step_metrics';

/**
 * Performance Metrics Collector for Workflow Steps
 */
export class PerformanceMetricsCollector {
    private metrics: Map<string, StepPerformanceMetric> = new Map();

    /**
     * Start tracking a step execution
     * 
     * @param runId - Workflow run ID
     * @param stepIdentifier - Step identifier (e.g., 'step1', 'step2')
     * @param stepName - Optional step name
     * @param workflowId - Optional workflow ID
     * @param requestedMaxResults - Optional requested maxResults
     * @returns Metric ID for tracking
     */
    startStep(
        runId: string,
        stepIdentifier: StepIdentifier,
        stepName?: string,
        workflowId?: string,
        requestedMaxResults?: number
    ): string {
        const metricId = `${runId}-${stepIdentifier}-${Date.now()}`;
        const metric: StepPerformanceMetric = {
            runId,
            workflowId,
            stepIdentifier,
            stepName,
            startTime: new Date(),
            resultsCount: 0,
            requestedMaxResults,
            capped: false,
            createdAt: new Date(),
        };
        
        this.metrics.set(metricId, metric);
        return metricId;
    }

    /**
     * End tracking a step execution
     * 
     * @param metricId - Metric ID from startStep
     * @param resultsCount - Number of results produced
     * @param actualMaxResults - Actual maxResults used (after capping)
     * @param capped - Whether results were capped
     * @param hybridRetrievalUsed - Whether hybrid retrieval was used
     * @param error - Whether an error occurred
     * @param errorMessage - Error message if error occurred
     * @param metadata - Additional metadata
     */
    endStep(
        metricId: string,
        resultsCount: number,
        actualMaxResults?: number,
        capped?: boolean,
        hybridRetrievalUsed?: boolean,
        error?: boolean,
        errorMessage?: string,
        metadata?: Record<string, unknown>
    ): void {
        const metric = this.metrics.get(metricId);
        if (!metric) {
            logger.warn({ metricId }, 'PerformanceMetricsCollector: Metric not found for endStep');
            return;
        }

        metric.endTime = new Date();
        metric.duration = metric.endTime.getTime() - metric.startTime.getTime();
        metric.resultsCount = resultsCount;
        metric.actualMaxResults = actualMaxResults;
        metric.capped = capped ?? (metric.requestedMaxResults !== undefined && actualMaxResults !== undefined && actualMaxResults < metric.requestedMaxResults);
        metric.hybridRetrievalUsed = hybridRetrievalUsed;
        metric.error = error ?? false;
        metric.errorMessage = errorMessage;
        if (metadata) {
            metric.metadata = { ...metric.metadata, ...metadata };
        }

        // Persist metric asynchronously (don't block workflow execution)
        this.persistMetric(metric).catch(err => {
            logger.error({ error: err, metricId }, 'PerformanceMetricsCollector: Failed to persist metric');
        });

        // Remove from memory after a delay (allow time for persistence)
        setTimeout(() => {
            this.metrics.delete(metricId);
        }, 5000);
    }

    /**
     * Persist a metric to the database
     */
    private async persistMetric(metric: StepPerformanceMetric): Promise<void> {
        try {
            const db = getDB();
            await db.collection<StepPerformanceMetric>(COLLECTION_NAME).insertOne({
                ...metric,
                createdAt: new Date(),
            });
        } catch (error) {
            // Don't let metric recording errors break the application
            logger.error({ error, metricId: metric._id }, 'PerformanceMetricsCollector: Error persisting metric');
        }
    }

    /**
     * Get performance metrics for a workflow run
     * 
     * @param runId - Workflow run ID
     * @returns Array of step performance metrics
     */
    async getRunMetrics(runId: string): Promise<StepPerformanceMetric[]> {
        try {
            const db = getDB();
            return await db.collection<StepPerformanceMetric>(COLLECTION_NAME)
                .find({ runId })
                .sort({ startTime: 1 })
                .toArray();
        } catch (error) {
            logger.error({ error, runId }, 'PerformanceMetricsCollector: Error fetching run metrics');
            return [];
        }
    }

    /**
     * Get aggregated performance statistics for a step
     * 
     * @param stepIdentifier - Step identifier
     * @param limit - Number of recent executions to analyze (default: 100)
     * @returns Aggregated statistics
     */
    async getStepStatistics(
        stepIdentifier: StepIdentifier,
        limit: number = 100
    ): Promise<{
        stepIdentifier: StepIdentifier;
        totalExecutions: number;
        averageDuration: number;
        averageResultsCount: number;
        averageCapped: number; // Percentage of executions that were capped
        averageHybridRetrievalUsed: number; // Percentage of executions using hybrid retrieval
        errorRate: number; // Percentage of executions with errors
    }> {
        try {
            const db = getDB();
            const metrics = await db.collection<StepPerformanceMetric>(COLLECTION_NAME)
                .find({ stepIdentifier })
                .sort({ startTime: -1 })
                .limit(limit)
                .toArray();

            if (metrics.length === 0) {
                return {
                    stepIdentifier,
                    totalExecutions: 0,
                    averageDuration: 0,
                    averageResultsCount: 0,
                    averageCapped: 0,
                    averageHybridRetrievalUsed: 0,
                    errorRate: 0,
                };
            }

            const completedMetrics = metrics.filter(m => m.duration !== undefined);
            const totalExecutions = completedMetrics.length;
            
            if (totalExecutions === 0) {
                return {
                    stepIdentifier,
                    totalExecutions: 0,
                    averageDuration: 0,
                    averageResultsCount: 0,
                    averageCapped: 0,
                    averageHybridRetrievalUsed: 0,
                    errorRate: 0,
                };
            }

            const averageDuration = completedMetrics.reduce((sum, m) => sum + (m.duration ?? 0), 0) / totalExecutions;
            const averageResultsCount = completedMetrics.reduce((sum, m) => sum + m.resultsCount, 0) / totalExecutions;
            const averageCapped = (completedMetrics.filter(m => m.capped).length / totalExecutions) * 100;
            const averageHybridRetrievalUsed = (completedMetrics.filter(m => m.hybridRetrievalUsed).length / totalExecutions) * 100;
            const errorRate = (completedMetrics.filter(m => m.error).length / totalExecutions) * 100;

            return {
                stepIdentifier,
                totalExecutions,
                averageDuration,
                averageResultsCount,
                averageCapped,
                averageHybridRetrievalUsed,
                errorRate,
            };
        } catch (error) {
            logger.error({ error, stepIdentifier }, 'PerformanceMetricsCollector: Error fetching step statistics');
            return {
                stepIdentifier,
                totalExecutions: 0,
                averageDuration: 0,
                averageResultsCount: 0,
                averageCapped: 0,
                averageHybridRetrievalUsed: 0,
                errorRate: 0,
            };
        }
    }

    /**
     * Clean up old metrics (older than specified days)
     * 
     * @param daysToKeep - Number of days to keep (default: 30)
     */
    async cleanupOldMetrics(daysToKeep: number = 30): Promise<void> {
        try {
            const db = getDB();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            const result = await db.collection<StepPerformanceMetric>(COLLECTION_NAME)
                .deleteMany({ createdAt: { $lt: cutoffDate } });

            logger.info(
                { deletedCount: result.deletedCount, cutoffDate },
                'PerformanceMetricsCollector: Cleaned up old metrics'
            );
        } catch (error) {
            logger.error({ error }, 'PerformanceMetricsCollector: Error cleaning up old metrics');
        }
    }
}

// Singleton instance
let performanceMetricsCollector: PerformanceMetricsCollector | null = null;

/**
 * Get the singleton PerformanceMetricsCollector instance
 */
export function getPerformanceMetricsCollector(): PerformanceMetricsCollector {
    if (!performanceMetricsCollector) {
        performanceMetricsCollector = new PerformanceMetricsCollector();
    }
    return performanceMetricsCollector;
}

