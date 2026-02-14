import { Request, Response, NextFunction } from 'express';
import { getDB } from '../../config/database.js';
import { ObjectId } from 'mongodb';

export interface PerformanceMetric {
    _id?: ObjectId;
    endpoint: string;
    method: string;
    response_time_ms: number;
    status_code: number;
    timestamp: Date;
    user_id?: ObjectId;
    error?: boolean;
    createdAt: Date;
}

const COLLECTION_NAME = 'performance_metrics';
const BASELINE_COLLECTION_NAME = 'performance_baselines';
const RETENTION_DAYS = 7; // Keep metrics for 7 days

export interface PerformanceBaseline {
    _id?: ObjectId;
    endpoint?: string; // undefined for global baseline
    method?: string; // undefined for global baseline
    p50: number;
    p95: number;
    p99: number;
    error_rate: number;
    throughput: number;
    average_response_time: number;
    calculated_at: Date;
    period_start: Date;
    period_end: Date;
    sample_count: number;
    createdAt: Date;
    updatedAt: Date;
}

export type ScalingAction = 'scale_up' | 'scale_down' | 'maintain';

export interface ScalingRecommendation {
    action: ScalingAction;
    confidence: number; // 0-1, how confident we are in this recommendation
    reasoning: string[];
    metrics: {
        current: {
            p50: number;
            p95: number;
            p99: number;
            error_rate: number;
            throughput: number;
        };
        thresholds?: {
            p50: number;
            p95: number;
            p99: number;
            error_rate: number;
        };
        baseline?: PerformanceBaseline;
    };
    suggested_instance_count?: number; // Optional: suggested number of instances
}

export interface ScalingConfig {
    enabled: boolean;
    minInstances: number;
    maxInstances: number;
    scaleUpThresholds: {
        p95_response_time_ms: number; // Scale up if p95 exceeds this
        error_rate: number; // Scale up if error rate exceeds this (0-1)
        throughput_increase_percent: number; // Scale up if throughput increased by this percent vs baseline
    };
    scaleDownThresholds: {
        p95_response_time_ms: number; // Scale down if p95 is below this
        error_rate: number; // Scale down if error rate is below this
        throughput_decrease_percent: number; // Scale down if throughput decreased by this percent vs baseline
    };
    cooldownPeriodMs: number; // Minimum time between scaling actions (ms)
    useBaseline: boolean; // Whether to use baseline comparisons for scaling decisions
}

/**
 * Performance Monitoring Service
 * Tracks response times, error rates, and throughput
 */
export class PerformanceMonitoringService {
    private responseTimeThresholds: {
        p50: number; // 50th percentile threshold (ms)
        p95: number; // 95th percentile threshold (ms)
        p99: number; // 99th percentile threshold (ms)
    };

    private scalingConfig: ScalingConfig;
    private lastScalingAction: { action: ScalingAction; timestamp: Date } | null = null;

    constructor() {
        // Default thresholds (can be configured via env vars)
        this.responseTimeThresholds = {
            p50: parseInt(process.env.PERF_THRESHOLD_P50 || '500', 10),
            p95: parseInt(process.env.PERF_THRESHOLD_P95 || '2000', 10),
            p99: parseInt(process.env.PERF_THRESHOLD_P99 || '5000', 10),
        };

        // Auto-scaling configuration
        this.scalingConfig = {
            enabled: process.env.AUTO_SCALING_ENABLED === 'true',
            minInstances: parseInt(process.env.AUTO_SCALING_MIN_INSTANCES || '1', 10),
            maxInstances: parseInt(process.env.AUTO_SCALING_MAX_INSTANCES || '10', 10),
            scaleUpThresholds: {
                p95_response_time_ms: parseInt(process.env.AUTO_SCALING_SCALE_UP_P95_MS || '3000', 10),
                error_rate: parseFloat(process.env.AUTO_SCALING_SCALE_UP_ERROR_RATE || '0.05'),
                throughput_increase_percent: parseFloat(process.env.AUTO_SCALING_SCALE_UP_THROUGHPUT_PCT || '20'),
            },
            scaleDownThresholds: {
                p95_response_time_ms: parseInt(process.env.AUTO_SCALING_SCALE_DOWN_P95_MS || '500', 10),
                error_rate: parseFloat(process.env.AUTO_SCALING_SCALE_DOWN_ERROR_RATE || '0.01'),
                throughput_decrease_percent: parseFloat(process.env.AUTO_SCALING_SCALE_DOWN_THROUGHPUT_PCT || '20'),
            },
            cooldownPeriodMs: parseInt(process.env.AUTO_SCALING_COOLDOWN_MS || '300000', 10), // 5 minutes default
            useBaseline: process.env.AUTO_SCALING_USE_BASELINE === 'true',
        };
    }

    /**
     * Middleware to track request performance
     */
    trackRequest() {
        return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            const startTime = Date.now();
            // Define interface locally for request with user
            interface RequestWithUser extends Request {
                user?: {
                    userId?: string;
                };
            }
            const userId = (req as RequestWithUser).user?.userId;
            const userObjectId =
                userId && ObjectId.isValid(userId) ? new ObjectId(userId) : undefined;

            res.once('finish', () => {
                const responseTime = Date.now() - startTime;
                PerformanceMonitoringService.recordMetric({
                    endpoint: req.path,
                    method: req.method,
                    response_time_ms: responseTime,
                    status_code: res.statusCode,
                    user_id: userObjectId,
                    error: res.statusCode >= 400,
                }).catch((err) => {
                    console.error('[PerformanceMonitoringService] Failed to record metric:', err);
                });
            });

            next();
        };
    }

    /**
     * Record a performance metric
     */
    private static async recordMetric(metric: Omit<PerformanceMetric, '_id' | 'timestamp' | 'createdAt'>): Promise<void> {
        try {
            const db = getDB();
            const now = new Date();

            await db.collection<PerformanceMetric>(COLLECTION_NAME).insertOne({
                ...metric,
                timestamp: now,
                createdAt: now,
            });
        } catch (error) {
            // Don't let metric recording errors break the application
            console.error('[PerformanceMonitoringService] Error recording metric:', error);
        }
    }

    /**
     * Get performance statistics
     */
    async getStatistics(options: {
        startDate?: Date;
        endDate?: Date;
        endpoint?: string;
        method?: string;
    } = {}): Promise<{
        p50: number;
        p95: number;
        p99: number;
        error_rate: number;
        throughput: number; // requests per hour
        average_response_time: number;
        total_requests: number;
        error_count: number;
    }> {
        const db = getDB();
        const { startDate, endDate, endpoint, method } = options;

        // Default to last 24 hours if no date range specified
        const queryStartDate = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
        const queryEndDate = endDate || new Date();

        const query: Record<string, unknown> = {
            timestamp: {
                $gte: queryStartDate,
                $lte: queryEndDate,
            },
        };

        if (endpoint) query.endpoint = endpoint;
        if (method) query.method = method;

        const metrics = await db
            .collection<PerformanceMetric>(COLLECTION_NAME)
            .find(query)
            .toArray();

        if (metrics.length === 0) {
            return {
                p50: 0,
                p95: 0,
                p99: 0,
                error_rate: 0,
                throughput: 0,
                average_response_time: 0,
                total_requests: 0,
                error_count: 0,
            };
        }

        // Sort response times for percentile calculation
        const responseTimes = metrics
            .map((m) => m.response_time_ms)
            .sort((a, b) => a - b);

        const p50 = this.percentile(responseTimes, 50);
        const p95 = this.percentile(responseTimes, 95);
        const p99 = this.percentile(responseTimes, 99);

        const errorCount = metrics.filter((m) => m.error).length;
        const errorRate = metrics.length > 0 ? errorCount / metrics.length : 0;

        const totalResponseTime = metrics.reduce((sum, m) => sum + m.response_time_ms, 0);
        const averageResponseTime = totalResponseTime / metrics.length;

        // Calculate throughput (requests per hour)
        const hours = (queryEndDate.getTime() - queryStartDate.getTime()) / (1000 * 60 * 60);
        const throughput = hours > 0 ? metrics.length / hours : 0;

        return {
            p50,
            p95,
            p99,
            error_rate: errorRate,
            throughput,
            average_response_time: averageResponseTime,
            total_requests: metrics.length,
            error_count: errorCount,
        };
    }

    /**
     * Backwards-compatible alias used by older routes/services.
     */
    async getStats(): Promise<{
        p50: number;
        p95: number;
        p99: number;
        error_rate: number;
        throughput: number;
        average_response_time: number;
        total_requests: number;
        error_count: number;
    }> {
        return this.getStatistics();
    }


    /**
     * Calculate percentile from sorted array
     */
    private percentile(sortedArray: number[], percentile: number): number {
        if (sortedArray.length === 0) return 0;
        const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
        return sortedArray[Math.max(0, index)] || 0;
    }

    /**
     * Calculate and store a performance baseline from historical metrics
     * @param options Configuration for baseline calculation
     * @returns The calculated baseline
     */
    async calculateBaseline(options: {
        endpoint?: string;
        method?: string;
        periodDays?: number; // Number of days to use for baseline calculation (default: 7)
        periodStart?: Date;
        periodEnd?: Date;
    } = {}): Promise<PerformanceBaseline> {
        const db = getDB();
        const { endpoint, method, periodDays = 7, periodStart, periodEnd } = options;

        // Determine the period for baseline calculation
        const endDate = periodEnd || new Date();
        const startDate = periodStart || new Date(endDate.getTime() - periodDays * 24 * 60 * 60 * 1000);

        // Get statistics for the period
        const stats = await this.getStatistics({
            startDate,
            endDate,
            endpoint,
            method,
        });

        if (stats.total_requests === 0) {
            throw new Error('Cannot calculate baseline: no metrics found for the specified period');
        }

        // Create baseline document
        const now = new Date();
        const baseline: Omit<PerformanceBaseline, '_id'> = {
            endpoint,
            method,
            p50: stats.p50,
            p95: stats.p95,
            p99: stats.p99,
            error_rate: stats.error_rate,
            throughput: stats.throughput,
            average_response_time: stats.average_response_time,
            calculated_at: now,
            period_start: startDate,
            period_end: endDate,
            sample_count: stats.total_requests,
            createdAt: now,
            updatedAt: now,
        };

        // Store or update baseline
        const query: Record<string, unknown> = {};
        if (endpoint) query.endpoint = endpoint;
        else query.endpoint = { $exists: false };
        if (method) query.method = method;
        else query.method = { $exists: false };

        await db.collection<PerformanceBaseline>(BASELINE_COLLECTION_NAME).updateOne(
            query,
            { $set: baseline },
            { upsert: true }
        );

        console.log(
            `[PerformanceMonitoringService] Baseline calculated and stored: ${endpoint || 'global'} ${method || ''} (${stats.total_requests} samples)`
        );

        return baseline as PerformanceBaseline;
    }

    /**
     * Get the stored baseline for a specific endpoint/method or global baseline
     * @param options Options to identify the baseline
     * @returns The baseline or null if not found
     */
    async getBaseline(options: {
        endpoint?: string;
        method?: string;
    } = {}): Promise<PerformanceBaseline | null> {
        const db = getDB();
        const { endpoint, method } = options;

        const query: Record<string, unknown> = {};
        if (endpoint) query.endpoint = endpoint;
        else query.endpoint = { $exists: false };
        if (method) query.method = method;
        else query.method = { $exists: false };

        const baseline = await db
            .collection<PerformanceBaseline>(BASELINE_COLLECTION_NAME)
            .findOne(query);

        return baseline;
    }

    /**
     * Compare current performance metrics against a baseline
     * @param options Options for comparison
     * @returns Comparison results with deviation percentages
     */
    async compareWithBaseline(options: {
        endpoint?: string;
        method?: string;
        startDate?: Date;
        endDate?: Date;
        baseline?: PerformanceBaseline; // Optional: provide baseline directly
    } = {}): Promise<{
        baseline: PerformanceBaseline | null;
        current: {
            p50: number;
            p95: number;
            p99: number;
            error_rate: number;
            throughput: number;
            average_response_time: number;
        };
        deviations: {
            p50: number; // percentage deviation
            p95: number;
            p99: number;
            error_rate: number;
            throughput: number;
            average_response_time: number;
        };
        alerts: Array<{
            metric: string;
            value: number;
            baseline_value: number;
            deviation_percent: number;
            severity: 'warning' | 'critical';
        }>;
    }> {
        const { baseline: providedBaseline, ...statsOptions } = options;

        // Get baseline
        const baseline =
            providedBaseline ||
            (await this.getBaseline({
                endpoint: options.endpoint,
                method: options.method,
            }));

        // Get current statistics
        const current = await this.getStatistics(statsOptions);

        if (!baseline) {
            return {
                baseline: null,
                current: {
                    p50: current.p50,
                    p95: current.p95,
                    p99: current.p99,
                    error_rate: current.error_rate,
                    throughput: current.throughput,
                    average_response_time: current.average_response_time,
                },
                deviations: {
                    p50: 0,
                    p95: 0,
                    p99: 0,
                    error_rate: 0,
                    throughput: 0,
                    average_response_time: 0,
                },
                alerts: [],
            };
        }

        // Calculate deviations (percentage change from baseline)
        const calculateDeviation = (current: number, baseline: number): number => {
            if (baseline === 0) return current === 0 ? 0 : 100;
            return ((current - baseline) / baseline) * 100;
        };

        const deviations = {
            p50: calculateDeviation(current.p50, baseline.p50),
            p95: calculateDeviation(current.p95, baseline.p95),
            p99: calculateDeviation(current.p99, baseline.p99),
            error_rate: calculateDeviation(current.error_rate, baseline.error_rate),
            throughput: calculateDeviation(current.throughput, baseline.throughput),
            average_response_time: calculateDeviation(current.average_response_time, baseline.average_response_time),
        };

        // Generate alerts based on deviations
        // Warning: >10% degradation, Critical: >25% degradation
        const alerts: Array<{
            metric: string;
            value: number;
            baseline_value: number;
            deviation_percent: number;
            severity: 'warning' | 'critical';
        }> = [];

        const checkDeviation = (
            metricName: string,
            currentValue: number,
            baselineValue: number,
            deviation: number
        ) => {
            if (deviation > 25) {
                alerts.push({
                    metric: metricName,
                    value: currentValue,
                    baseline_value: baselineValue,
                    deviation_percent: deviation,
                    severity: 'critical',
                });
            } else if (deviation > 10) {
                alerts.push({
                    metric: metricName,
                    value: currentValue,
                    baseline_value: baselineValue,
                    deviation_percent: deviation,
                    severity: 'warning',
                });
            }
        };

        checkDeviation('p50_response_time', current.p50, baseline.p50, deviations.p50);
        checkDeviation('p95_response_time', current.p95, baseline.p95, deviations.p95);
        checkDeviation('p99_response_time', current.p99, baseline.p99, deviations.p99);
        checkDeviation('error_rate', current.error_rate, baseline.error_rate, deviations.error_rate);
        checkDeviation('average_response_time', current.average_response_time, baseline.average_response_time, deviations.average_response_time);

        // For throughput, alert on decreases (negative deviation)
        if (deviations.throughput < -25) {
            alerts.push({
                metric: 'throughput',
                value: current.throughput,
                baseline_value: baseline.throughput,
                deviation_percent: deviations.throughput,
                severity: 'critical',
            });
        } else if (deviations.throughput < -10) {
            alerts.push({
                metric: 'throughput',
                value: current.throughput,
                baseline_value: baseline.throughput,
                deviation_percent: deviations.throughput,
                severity: 'warning',
            });
        }

        return {
            baseline,
            current: {
                p50: current.p50,
                p95: current.p95,
                p99: current.p99,
                error_rate: current.error_rate,
                throughput: current.throughput,
                average_response_time: current.average_response_time,
            },
            deviations,
            alerts,
        };
    }

    /**
     * Check if performance thresholds are exceeded and return alerts
     * Can optionally use baselines for comparison instead of fixed thresholds
     */
    async checkThresholds(options: {
        startDate?: Date;
        endDate?: Date;
        endpoint?: string;
        useBaseline?: boolean; // If true, compare against baseline instead of fixed thresholds
    } = {}): Promise<Array<{ metric: string; value: number; threshold: number; severity: 'warning' | 'critical' }>> {
        const { useBaseline = false, ...statsOptions } = options;

        // If using baseline, compare against baseline
        if (useBaseline) {
            const comparison = await this.compareWithBaseline(statsOptions);
            return comparison.alerts.map((alert) => ({
                metric: alert.metric,
                value: alert.value,
                threshold: alert.baseline_value,
                severity: alert.severity,
            }));
        }

        // Otherwise, use fixed thresholds (existing behavior)
        const stats = await this.getStatistics(statsOptions);
        const alerts: Array<{ metric: string; value: number; threshold: number; severity: 'warning' | 'critical' }> = [];

        // Check response time thresholds
        if (stats.p50 > this.responseTimeThresholds.p50) {
            alerts.push({
                metric: 'p50_response_time',
                value: stats.p50,
                threshold: this.responseTimeThresholds.p50,
                severity: 'warning',
            });
        }

        if (stats.p95 > this.responseTimeThresholds.p95) {
            alerts.push({
                metric: 'p95_response_time',
                value: stats.p95,
                threshold: this.responseTimeThresholds.p95,
                severity: 'critical',
            });
        }

        if (stats.p99 > this.responseTimeThresholds.p99) {
            alerts.push({
                metric: 'p99_response_time',
                value: stats.p99,
                threshold: this.responseTimeThresholds.p99,
                severity: 'critical',
            });
        }

        // Check error rate (threshold: 5% for warning, 10% for critical)
        if (stats.error_rate > 0.1) {
            alerts.push({
                metric: 'error_rate',
                value: stats.error_rate * 100,
                threshold: 10,
                severity: 'critical',
            });
        } else if (stats.error_rate > 0.05) {
            alerts.push({
                metric: 'error_rate',
                value: stats.error_rate * 100,
                threshold: 5,
                severity: 'warning',
            });
        }

        return alerts;
    }

    /**
     * Get scaling recommendation based on current performance metrics
     * @param options Options for scaling evaluation
     * @returns Scaling recommendation with action, confidence, and reasoning
     */
    async getScalingRecommendation(options: {
        endpoint?: string;
        method?: string;
        startDate?: Date;
        endDate?: Date;
        currentInstanceCount?: number;
    } = {}): Promise<ScalingRecommendation> {
        const { endpoint, method, startDate, endDate, currentInstanceCount } = options;

        // Get current statistics
        const stats = await this.getStatistics({
            endpoint,
            method,
            startDate,
            endDate,
        });

        // Get baseline if configured to use it
        let baseline: PerformanceBaseline | null = null;
        if (this.scalingConfig.useBaseline) {
            baseline = await this.getBaseline({ endpoint, method });
        }

        const reasoning: string[] = [];
        let action: ScalingAction = 'maintain';
        let confidence = 0.5;

        // Check if we're in cooldown period
        if (this.lastScalingAction) {
            const timeSinceLastAction = Date.now() - this.lastScalingAction.timestamp.getTime();
            if (timeSinceLastAction < this.scalingConfig.cooldownPeriodMs) {
                const remainingCooldown = Math.ceil(
                    (this.scalingConfig.cooldownPeriodMs - timeSinceLastAction) / 1000 / 60
                );
                reasoning.push(
                    `In cooldown period (${remainingCooldown} minutes remaining). Last action: ${this.lastScalingAction.action}`
                );
                return {
                    action: 'maintain',
                    confidence: 1.0,
                    reasoning,
                    metrics: {
                        current: {
                            p50: stats.p50,
                            p95: stats.p95,
                            p99: stats.p99,
                            error_rate: stats.error_rate,
                            throughput: stats.throughput,
                        },
                        baseline: baseline || undefined,
                    },
                };
            }
        }

        // Evaluate scaling conditions
        const scaleUpReasons: string[] = [];
        const scaleDownReasons: string[] = [];

        // Check response time thresholds for scale up
        if (stats.p95 > this.scalingConfig.scaleUpThresholds.p95_response_time_ms) {
            scaleUpReasons.push(
                `p95 response time (${Math.round(stats.p95)}ms) exceeds threshold (${this.scalingConfig.scaleUpThresholds.p95_response_time_ms}ms)`
            );
            confidence += 0.2;
        }

        // Check error rate for scale up
        if (stats.error_rate > this.scalingConfig.scaleUpThresholds.error_rate) {
            scaleUpReasons.push(
                `Error rate (${(stats.error_rate * 100).toFixed(2)}%) exceeds threshold (${(this.scalingConfig.scaleUpThresholds.error_rate * 100).toFixed(2)}%)`
            );
            confidence += 0.2;
        }

        // Check baseline comparison for scale up (if baseline available)
        if (baseline && this.scalingConfig.useBaseline) {
            const throughputIncrease =
                baseline.throughput > 0
                    ? ((stats.throughput - baseline.throughput) / baseline.throughput) * 100
                    : 0;
            if (throughputIncrease > this.scalingConfig.scaleUpThresholds.throughput_increase_percent) {
                scaleUpReasons.push(
                    `Throughput increased ${throughputIncrease.toFixed(1)}% vs baseline (${baseline.throughput.toFixed(1)} req/h)`
                );
                confidence += 0.15;
            }

            // Check if response times degraded significantly vs baseline
            const p95Degradation =
                baseline.p95 > 0 ? ((stats.p95 - baseline.p95) / baseline.p95) * 100 : 0;
            if (p95Degradation > 25) {
                scaleUpReasons.push(
                    `p95 response time degraded ${p95Degradation.toFixed(1)}% vs baseline (${baseline.p95}ms)`
                );
                confidence += 0.15;
            }
        }

        // Check response time thresholds for scale down
        if (stats.p95 < this.scalingConfig.scaleDownThresholds.p95_response_time_ms) {
            scaleDownReasons.push(
                `p95 response time (${Math.round(stats.p95)}ms) is below threshold (${this.scalingConfig.scaleDownThresholds.p95_response_time_ms}ms)`
            );
            confidence += 0.15;
        }

        // Check error rate for scale down
        if (stats.error_rate < this.scalingConfig.scaleDownThresholds.error_rate) {
            scaleDownReasons.push(
                `Error rate (${(stats.error_rate * 100).toFixed(2)}%) is below threshold (${(this.scalingConfig.scaleDownThresholds.error_rate * 100).toFixed(2)}%)`
            );
            confidence += 0.15;
        }

        // Check baseline comparison for scale down (if baseline available)
        if (baseline && this.scalingConfig.useBaseline) {
            const throughputDecrease =
                baseline.throughput > 0
                    ? ((baseline.throughput - stats.throughput) / baseline.throughput) * 100
                    : 0;
            if (throughputDecrease > this.scalingConfig.scaleDownThresholds.throughput_decrease_percent) {
                scaleDownReasons.push(
                    `Throughput decreased ${throughputDecrease.toFixed(1)}% vs baseline (${baseline.throughput.toFixed(1)} req/h)`
                );
                confidence += 0.15;
            }

            // Check if response times improved significantly vs baseline
            const p95Improvement =
                baseline.p95 > 0 ? ((baseline.p95 - stats.p95) / baseline.p95) * 100 : 0;
            if (p95Improvement > 25) {
                scaleDownReasons.push(
                    `p95 response time improved ${p95Improvement.toFixed(1)}% vs baseline (${baseline.p95}ms)`
                );
                confidence += 0.15;
            }
        }

        // Determine action based on reasons
        if (scaleUpReasons.length > 0 && scaleDownReasons.length === 0) {
            action = 'scale_up';
            reasoning.push(...scaleUpReasons);
            reasoning.push('Recommendation: Scale up to handle increased load');
        } else if (scaleDownReasons.length > 0 && scaleUpReasons.length === 0) {
            // Only scale down if we have more than minimum instances
            if (currentInstanceCount && currentInstanceCount > this.scalingConfig.minInstances) {
                action = 'scale_down';
                reasoning.push(...scaleDownReasons);
                reasoning.push('Recommendation: Scale down to optimize resource usage');
            } else {
                action = 'maintain';
                reasoning.push(...scaleDownReasons);
                reasoning.push('At minimum instance count, maintaining current scale');
            }
        } else if (scaleUpReasons.length > 0 && scaleDownReasons.length > 0) {
            // Conflicting signals - prioritize scale up for safety
            action = 'scale_up';
            reasoning.push('Conflicting signals detected, prioritizing scale up for safety');
            reasoning.push(...scaleUpReasons);
            confidence = Math.min(confidence, 0.6);
        } else {
            action = 'maintain';
            reasoning.push('Performance metrics within acceptable thresholds');
            if (baseline) {
                reasoning.push('Performance is consistent with baseline');
            }
        }

        // Clamp confidence to 0-1
        confidence = Math.min(Math.max(confidence, 0), 1);

        // Calculate suggested instance count (if current count provided)
        let suggestedInstanceCount: number | undefined;
        if (currentInstanceCount !== undefined) {
            if (action === 'scale_up') {
                suggestedInstanceCount = Math.min(
                    currentInstanceCount + 1,
                    this.scalingConfig.maxInstances
                );
            } else if (action === 'scale_down') {
                suggestedInstanceCount = Math.max(
                    currentInstanceCount - 1,
                    this.scalingConfig.minInstances
                );
            } else {
                suggestedInstanceCount = currentInstanceCount;
            }
        }

        return {
            action,
            confidence,
            reasoning,
            metrics: {
                current: {
                    p50: stats.p50,
                    p95: stats.p95,
                    p99: stats.p99,
                    error_rate: stats.error_rate,
                    throughput: stats.throughput,
                },
                thresholds: {
                    p50: this.responseTimeThresholds.p50,
                    p95: this.responseTimeThresholds.p95,
                    p99: this.responseTimeThresholds.p99,
                    error_rate: this.scalingConfig.scaleUpThresholds.error_rate,
                },
                baseline: baseline || undefined,
            },
            suggested_instance_count: suggestedInstanceCount,
        };
    }

    /**
     * Get scaling configuration
     * @returns Current scaling configuration
     */
    getScalingConfig(): ScalingConfig {
        return { ...this.scalingConfig };
    }

    /**
     * Update scaling configuration
     * @param config Partial scaling configuration to update
     */
    updateScalingConfig(config: Partial<ScalingConfig>): void {
        this.scalingConfig = { ...this.scalingConfig, ...config };
    }

    /**
     * Record a scaling action (for cooldown tracking)
     * @param action The scaling action that was taken
     */
    recordScalingAction(action: ScalingAction): void {
        this.lastScalingAction = {
            action,
            timestamp: new Date(),
        };
    }

    /**
     * Get the last scaling action and timestamp
     * @returns Last scaling action or null if none recorded
     */
    getLastScalingAction(): { action: ScalingAction; timestamp: Date } | null {
        return this.lastScalingAction ? { ...this.lastScalingAction } : null;
    }

    /**
     * Clean up old metrics (should be run periodically)
     */
    async cleanupOldMetrics(): Promise<void> {
        try {
            const db = getDB();
            const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

            const result = await db.collection<PerformanceMetric>(COLLECTION_NAME).deleteMany({
                timestamp: { $lt: cutoffDate },
            });

            console.log(`[PerformanceMonitoringService] Cleaned up ${result.deletedCount} old metrics`);
        } catch (error) {
            console.error('[PerformanceMonitoringService] Error cleaning up metrics:', error);
        }
    }
}

// Singleton instance
let performanceMonitoringService: PerformanceMonitoringService | null = null;

export function getPerformanceMonitoringService(): PerformanceMonitoringService {
    if (!performanceMonitoringService) {
        performanceMonitoringService = new PerformanceMonitoringService();
    }
    return performanceMonitoringService;
}
