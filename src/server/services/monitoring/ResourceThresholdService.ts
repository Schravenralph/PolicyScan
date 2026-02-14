import { getDB } from '../../config/database.js';
import { AlertingService } from './AlertingService.js';
import { ObjectId } from 'mongodb';

export interface ResourceThresholds {
    database_size_mb?: number;
    knowledge_base_size_mb?: number;
    error_rate_24h?: number;
    api_response_time_p95_ms?: number;
    disk_usage_mb?: number;
}

export interface ResourceMetrics {
    database_size_mb: number;
    knowledge_base_size_mb: number;
    error_rate_24h: number;
    api_response_time_p95_ms?: number;
    disk_usage_mb?: number;
}

export interface ThresholdAlert {
    metric: string;
    current_value: number;
    threshold: number;
    severity: 'warning' | 'critical';
    timestamp: Date;
}

export interface ThresholdTemplate {
    name: string;
    description: string;
    thresholds: ResourceThresholds;
}

export interface ThresholdHistoryEntry {
    timestamp: Date;
    changedBy?: string;
    previousThresholds: ResourceThresholds;
    newThresholds: ResourceThresholds;
    reason?: string;
}

export interface ThresholdRecommendation {
    metric: string;
    currentThreshold: number;
    recommendedThreshold: number;
    reason: string;
    confidence: number; // 0.0 to 1.0
}

export interface ThresholdGroup {
    id: string;
    name: string;
    category: 'storage' | 'performance' | 'errors' | 'custom';
    thresholds: ResourceThresholds;
    enabled: boolean;
}

export interface ThresholdEscalation {
    level: 'warning' | 'critical' | 'emergency';
    threshold: number;
    multiplier: number; // Multiplier of base threshold
}

export interface ThresholdSchedule {
    id: string;
    name: string;
    timeRange: {
        start: string; // HH:mm format
        end: string; // HH:mm format
    };
    daysOfWeek: number[]; // 0-6, Sunday-Saturday
    thresholds: ResourceThresholds;
    enabled: boolean;
}

export interface NotificationPreferences {
    metric: string;
    channels: ('email' | 'slack' | 'sms')[];
    severity: ('warning' | 'critical' | 'emergency')[];
}

/**
 * Service for monitoring resource usage and alerting when thresholds are exceeded
 */
export class ResourceThresholdService {
    private alertingService: AlertingService;
    private defaultThresholds: ResourceThresholds;
    private readonly THRESHOLD_COLLECTION = 'resource_thresholds';
    private readonly THRESHOLD_HISTORY_COLLECTION = 'threshold_history';
    private readonly ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown between alerts

    // Iteration 1: Threshold Templates/Presets
    private readonly TEMPLATES: Record<string, ThresholdTemplate> = {
        small: {
            name: 'Small Deployment',
            description: 'For small deployments (< 10 users, < 1M documents)',
            thresholds: {
                database_size_mb: 1000, // 1 GB
                knowledge_base_size_mb: 5000, // 5 GB
                error_rate_24h: 50,
                api_response_time_p95_ms: 3000, // 3 seconds
                disk_usage_mb: 10000, // 10 GB
            },
        },
        medium: {
            name: 'Medium Deployment',
            description: 'For medium deployments (10-100 users, 1M-10M documents)',
            thresholds: {
                database_size_mb: 5000, // 5 GB
                knowledge_base_size_mb: 50000, // 50 GB
                error_rate_24h: 200, // Increased from 100 to reduce alert fatigue (WI-ERROR-006)
                api_response_time_p95_ms: 5000, // 5 seconds
                disk_usage_mb: 100000, // 100 GB
            },
        },
        large: {
            name: 'Large Deployment',
            description: 'For large deployments (> 100 users, > 10M documents)',
            thresholds: {
                database_size_mb: 50000, // 50 GB
                knowledge_base_size_mb: 500000, // 500 GB
                error_rate_24h: 500,
                api_response_time_p95_ms: 10000, // 10 seconds
                disk_usage_mb: 1000000, // 1 TB
            },
        },
    };

    constructor() {
        this.alertingService = new AlertingService();
        
        // Default thresholds (medium template)
        this.defaultThresholds = this.TEMPLATES.medium.thresholds;
    }

    /**
     * Get configured thresholds (from database or defaults)
     */
    async getThresholds(): Promise<ResourceThresholds> {
        try {
            const db = getDB();
            const config = await db.collection(this.THRESHOLD_COLLECTION).findOne({ type: 'default' });
            
            if (config && config.thresholds) {
                return { ...this.defaultThresholds, ...config.thresholds };
            }
            
            return this.defaultThresholds;
        } catch (error) {
            console.error('[ResourceThresholdService] Error fetching thresholds:', error);
            return this.defaultThresholds;
        }
    }

    /**
     * Get available threshold templates
     */
    getTemplates(): ThresholdTemplate[] {
        return Object.values(this.TEMPLATES);
    }

    /**
     * Apply a threshold template
     */
    async applyTemplate(templateName: string, changedBy?: string): Promise<void> {
        const template = this.TEMPLATES[templateName];
        if (!template) {
            throw new Error(`Template "${templateName}" not found`);
        }
        await this.updateThresholds(template.thresholds, changedBy, `Applied template: ${template.name}`);
    }

    /**
     * Update thresholds (Iteration 2: with history tracking)
     */
    async updateThresholds(
        thresholds: Partial<ResourceThresholds>,
        changedBy?: string,
        reason?: string
    ): Promise<void> {
        try {
            const db = getDB();
            
            // Get current thresholds for history
            const current = await this.getThresholds();
            
            // Update thresholds
            const newThresholds = { ...this.defaultThresholds, ...current, ...thresholds };
            await db.collection(this.THRESHOLD_COLLECTION).updateOne(
                { type: 'default' },
                { 
                    $set: { 
                        thresholds: newThresholds,
                        updatedAt: new Date(),
                        updatedBy: changedBy,
                    } 
                },
                { upsert: true }
            );

            // Iteration 2: Record in history
            await db.collection(this.THRESHOLD_HISTORY_COLLECTION).insertOne({
                timestamp: new Date(),
                changedBy,
                previousThresholds: current,
                newThresholds,
                reason,
            });
        } catch (error) {
            console.error('[ResourceThresholdService] Error updating thresholds:', error);
            throw error;
        }
    }

    /**
     * Get threshold history (Iteration 2)
     */
    async getThresholdHistory(limit: number = 50): Promise<ThresholdHistoryEntry[]> {
        try {
            const db = getDB();
            const history = await db.collection(this.THRESHOLD_HISTORY_COLLECTION)
                .find({})
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();
            
            return history.map(h => ({
                timestamp: h.timestamp,
                changedBy: h.changedBy,
                previousThresholds: h.previousThresholds,
                newThresholds: h.newThresholds,
                reason: h.reason,
            }));
        } catch (error) {
            console.error('[ResourceThresholdService] Error fetching threshold history:', error);
            return [];
        }
    }

    /**
     * Check metrics against thresholds and alert if exceeded
     * Uses escalation levels (Iteration 5) if enabled
     */
    async checkThresholds(metrics: ResourceMetrics, useEscalation: boolean = true): Promise<ThresholdAlert[]> {
        // Iteration 6: Check for active schedule first
        const activeSchedule = await this.getActiveSchedule();
        if (activeSchedule) {
            // Temporarily use scheduled thresholds
            const originalThresholds = await this.getThresholds();
            await this.updateThresholds(activeSchedule.thresholds, undefined, `Active schedule: ${activeSchedule.name}`);
            const alerts = useEscalation 
                ? await this.checkThresholdsWithEscalation(metrics)
                : await this.checkThresholdsLegacy(metrics);
            // Restore original thresholds
            await this.updateThresholds(originalThresholds);
            return alerts;
        }

        // Use escalation if enabled
        if (useEscalation) {
            return await this.checkThresholdsWithEscalation(metrics);
        }

        return await this.checkThresholdsLegacy(metrics);
    }

    /**
     * Legacy threshold checking (original implementation)
     */
    private async checkThresholdsLegacy(metrics: ResourceMetrics): Promise<ThresholdAlert[]> {
        const thresholds = await this.getThresholds();
        const alerts: ThresholdAlert[] = [];
        const now = new Date();

        // Check database size
        if (thresholds.database_size_mb && metrics.database_size_mb > thresholds.database_size_mb) {
            const severity = metrics.database_size_mb > thresholds.database_size_mb * 1.5 ? 'critical' : 'warning';
            alerts.push({
                metric: 'database_size_mb',
                current_value: metrics.database_size_mb,
                threshold: thresholds.database_size_mb,
                severity,
                timestamp: now,
            });
        }

        // Check knowledge base size
        if (thresholds.knowledge_base_size_mb && metrics.knowledge_base_size_mb > thresholds.knowledge_base_size_mb) {
            const severity = metrics.knowledge_base_size_mb > thresholds.knowledge_base_size_mb * 1.5 ? 'critical' : 'warning';
            alerts.push({
                metric: 'knowledge_base_size_mb',
                current_value: metrics.knowledge_base_size_mb,
                threshold: thresholds.knowledge_base_size_mb,
                severity,
                timestamp: now,
            });
        }

        // Check error rate
        if (thresholds.error_rate_24h && metrics.error_rate_24h > thresholds.error_rate_24h) {
            const severity = metrics.error_rate_24h > thresholds.error_rate_24h * 2 ? 'critical' : 'warning';
            alerts.push({
                metric: 'error_rate_24h',
                current_value: metrics.error_rate_24h,
                threshold: thresholds.error_rate_24h,
                severity,
                timestamp: now,
            });
        }

        // Check API response time (if available)
        if (thresholds.api_response_time_p95_ms && metrics.api_response_time_p95_ms && 
            metrics.api_response_time_p95_ms > thresholds.api_response_time_p95_ms) {
            const severity = metrics.api_response_time_p95_ms > thresholds.api_response_time_p95_ms * 2 ? 'critical' : 'warning';
            alerts.push({
                metric: 'api_response_time_p95_ms',
                current_value: metrics.api_response_time_p95_ms,
                threshold: thresholds.api_response_time_p95_ms,
                severity,
                timestamp: now,
            });
        }

        // Check disk usage (if available)
        if (thresholds.disk_usage_mb && metrics.disk_usage_mb && 
            metrics.disk_usage_mb > thresholds.disk_usage_mb) {
            const severity = metrics.disk_usage_mb > thresholds.disk_usage_mb * 1.5 ? 'critical' : 'warning';
            alerts.push({
                metric: 'disk_usage_mb',
                current_value: metrics.disk_usage_mb,
                threshold: thresholds.disk_usage_mb,
                severity,
                timestamp: now,
            });
        }

        // Send alerts (with cooldown to prevent spam)
        for (const alert of alerts) {
            await this.sendThresholdAlert(alert, metrics);
        }

        return alerts;
    }

    /**
     * Send alert for threshold violation (with cooldown)
     */
    private async sendThresholdAlert(alert: ThresholdAlert, metrics: ResourceMetrics): Promise<void> {
        try {
            const db = getDB();
            
            // Check if we've sent an alert for this metric recently (cooldown)
            const lastAlert = await db.collection('threshold_alerts').findOne(
                { 
                    metric: alert.metric,
                    timestamp: { $gte: new Date(Date.now() - this.ALERT_COOLDOWN_MS) }
                },
                { sort: { timestamp: -1 } }
            );

            if (lastAlert) {
                // Still in cooldown, skip alert
                return;
            }

            // Record alert
            await db.collection('threshold_alerts').insertOne({
                ...alert,
                metrics_snapshot: metrics,
            });

            // Broadcast via WebSocket (Phase 3.2)
            try {
                const { getWebSocketService } = await import('../infrastructure/WebSocketService.js');
                const webSocketService = getWebSocketService();
                webSocketService.broadcastThresholdAlert({
                    metric: alert.metric,
                    current_value: alert.current_value,
                    threshold: alert.threshold,
                    severity: alert.severity,
                    timestamp: alert.timestamp,
                });
            } catch (error) {
                // WebSocket might not be initialized yet, don't fail
                console.debug('[ResourceThresholdService] WebSocket not available for alert broadcast:', error);
            }

            // Create error log for critical alerts (uses existing alerting infrastructure)
            if (alert.severity === 'critical') {
                const { getErrorMonitoringService } = await import('./ErrorMonitoringService.js');
                const error = new Error(`Critical threshold exceeded: ${alert.metric} is ${alert.current_value} (threshold: ${alert.threshold})`);
                error.name = 'ResourceThresholdExceeded';
                // Add stack trace pointing to this monitoring service
                Error.captureStackTrace(error, this.sendThresholdAlert);
                
                const errorMonitoringService = getErrorMonitoringService();
                await errorMonitoringService.captureError(error, {
                    component: 'other',
                    metadata: {
                        metric: alert.metric,
                        current_value: alert.current_value,
                        threshold: alert.threshold,
                        metrics_snapshot: metrics,
                    },
                });
            } else {
                // For warnings, log but don't create error log (to avoid noise)
                console.warn(`[ResourceThresholdService] Warning threshold exceeded: ${alert.metric} is ${alert.current_value} (threshold: ${alert.threshold})`);
            }
        } catch (error) {
            console.error('[ResourceThresholdService] Error sending threshold alert:', error);
        }
    }

    /**
     * Get recent threshold alerts
     */
    async getRecentAlerts(limit: number = 50): Promise<ThresholdAlert[]> {
        try {
            const db = getDB();
            const alerts = await db.collection('threshold_alerts')
                .find({})
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();
            
            return alerts.map(a => ({
                metric: a.metric,
                current_value: a.current_value,
                threshold: a.threshold,
                severity: a.severity,
                timestamp: a.timestamp,
            }));
        } catch (error) {
            console.error('[ResourceThresholdService] Error fetching recent alerts:', error);
            return [];
        }
    }

    /**
     * Iteration 3: Get threshold recommendations based on usage patterns
     */
    async getRecommendations(metrics: ResourceMetrics, daysOfHistory: number = 30): Promise<ThresholdRecommendation[]> {
        try {
            const db = getDB();
            const thresholds = await this.getThresholds();
            const recommendations: ThresholdRecommendation[] = [];
            const cutoffDate = new Date(Date.now() - daysOfHistory * 24 * 60 * 60 * 1000);

            // Analyze historical metrics from alerts
            const historicalAlerts = await db.collection('threshold_alerts')
                .find({
                    timestamp: { $gte: cutoffDate },
                })
                .toArray();

            // Calculate average usage for each metric
            const metricStats: Record<string, { sum: number; count: number; max: number }> = {};

            for (const alert of historicalAlerts) {
                if (!metricStats[alert.metric]) {
                    metricStats[alert.metric] = { sum: 0, count: 0, max: 0 };
                }
                metricStats[alert.metric].sum += alert.current_value;
                metricStats[alert.metric].count++;
                metricStats[alert.metric].max = Math.max(metricStats[alert.metric].max, alert.current_value);
            }

            // Generate recommendations
            for (const [metric, stats] of Object.entries(metricStats)) {
                if (stats.count < 5) continue; // Need at least 5 data points

                const avgUsage = stats.sum / stats.count;
                const currentThreshold = thresholds[metric as keyof ResourceThresholds] as number;
                
                // Recommend threshold at 1.2x average usage (20% buffer)
                const recommendedThreshold = Math.max(avgUsage * 1.2, stats.max * 1.1);
                
                if (Math.abs(currentThreshold - recommendedThreshold) / currentThreshold > 0.1) {
                    // More than 10% difference
                    const confidence = Math.min(stats.count / 30, 1.0); // Higher confidence with more data
                    recommendations.push({
                        metric,
                        currentThreshold,
                        recommendedThreshold: Math.round(recommendedThreshold),
                        reason: `Based on ${stats.count} data points over ${daysOfHistory} days. Average usage: ${Math.round(avgUsage)}, Peak: ${Math.round(stats.max)}`,
                        confidence,
                    });
                }
            }

            return recommendations.sort((a, b) => b.confidence - a.confidence);
        } catch (error) {
            console.error('[ResourceThresholdService] Error generating recommendations:', error);
            return [];
        }
    }

    /**
     * Iteration 4: Threshold Groups/Categories
     */
    async getThresholdGroups(): Promise<ThresholdGroup[]> {
        try {
            const db = getDB();
            const groups = await db.collection('threshold_groups')
                .find({ enabled: true })
                .toArray();
            
            return groups.map(g => ({
                id: g.id || g._id?.toString(),
                name: g.name,
                category: g.category,
                thresholds: g.thresholds,
                enabled: g.enabled,
            }));
        } catch (error) {
            console.error('[ResourceThresholdService] Error fetching threshold groups:', error);
            return [];
        }
    }

    async createThresholdGroup(group: Omit<ThresholdGroup, 'id'>): Promise<string> {
        try {
            const db = getDB();
            const result = await db.collection('threshold_groups').insertOne({
                ...group,
                createdAt: new Date(),
            });
            return result.insertedId.toString();
        } catch (error) {
            console.error('[ResourceThresholdService] Error creating threshold group:', error);
            throw error;
        }
    }

    /**
     * Iteration 5: Threshold Escalation Levels
     */
    async checkThresholdsWithEscalation(metrics: ResourceMetrics): Promise<ThresholdAlert[]> {
        const thresholds = await this.getThresholds();
        const alerts: ThresholdAlert[] = [];
        const now = new Date();

        // Define escalation levels
        const escalationLevels: Record<string, ThresholdEscalation[]> = {
            database_size_mb: [
                { level: 'warning', threshold: thresholds.database_size_mb || 0, multiplier: 1.0 },
                { level: 'critical', threshold: (thresholds.database_size_mb || 0) * 1.5, multiplier: 1.5 },
                { level: 'emergency', threshold: (thresholds.database_size_mb || 0) * 2.0, multiplier: 2.0 },
            ],
            knowledge_base_size_mb: [
                { level: 'warning', threshold: thresholds.knowledge_base_size_mb || 0, multiplier: 1.0 },
                { level: 'critical', threshold: (thresholds.knowledge_base_size_mb || 0) * 1.5, multiplier: 1.5 },
                { level: 'emergency', threshold: (thresholds.knowledge_base_size_mb || 0) * 2.0, multiplier: 2.0 },
            ],
            error_rate_24h: [
                { level: 'warning', threshold: thresholds.error_rate_24h || 0, multiplier: 1.0 },
                { level: 'critical', threshold: (thresholds.error_rate_24h || 0) * 2.0, multiplier: 2.0 },
                { level: 'emergency', threshold: (thresholds.error_rate_24h || 0) * 3.0, multiplier: 3.0 },
            ],
        };

        // Check each metric with escalation
        const metricChecks: Array<{ metric: keyof ResourceMetrics; value: number }> = [
            { metric: 'database_size_mb', value: metrics.database_size_mb },
            { metric: 'knowledge_base_size_mb', value: metrics.knowledge_base_size_mb },
            { metric: 'error_rate_24h', value: metrics.error_rate_24h },
        ];

        for (const check of metricChecks) {
            const levels = escalationLevels[check.metric];
            if (!levels) continue;

            // Find highest escalation level exceeded
            let highestLevel: ThresholdEscalation | null = null;
            for (const level of levels) {
                if (check.value > level.threshold) {
                    highestLevel = level;
                } else {
                    break;
                }
            }

            if (highestLevel) {
                alerts.push({
                    metric: check.metric,
                    current_value: check.value,
                    threshold: highestLevel.threshold,
                    severity: highestLevel.level === 'emergency' ? 'critical' : highestLevel.level,
                    timestamp: now,
                });
            }
        }

        // Send alerts
        for (const alert of alerts) {
            await this.sendThresholdAlert(alert, metrics);
        }

        return alerts;
    }

    /**
     * Iteration 6: Threshold Scheduling
     */
    async getActiveSchedule(): Promise<ThresholdSchedule | null> {
        try {
            const db = getDB();
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            const currentTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
            const currentDay = now.getDay();

            const schedules = await db.collection('threshold_schedules')
                .find({ enabled: true })
                .toArray();

            for (const schedule of schedules) {
                const { start, end } = schedule.timeRange;
                const daysOfWeek = schedule.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];

                if (daysOfWeek.includes(currentDay) && currentTime >= start && currentTime <= end) {
                    return {
                        id: schedule._id?.toString() || schedule.id,
                        name: schedule.name,
                        timeRange: schedule.timeRange,
                        daysOfWeek: schedule.daysOfWeek,
                        thresholds: schedule.thresholds,
                        enabled: schedule.enabled,
                    };
                }
            }

            return null;
        } catch (error) {
            console.error('[ResourceThresholdService] Error fetching active schedule:', error);
            return null;
        }
    }

    /**
     * Create a new threshold schedule
     */
    async createSchedule(schedule: Omit<ThresholdSchedule, 'id'>): Promise<string> {
        try {
            const db = getDB();
            
            // Validate time range format (HH:mm)
            const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(schedule.timeRange.start) || !timeRegex.test(schedule.timeRange.end)) {
                throw new Error('Invalid time format. Use HH:mm format (e.g., "09:00", "17:30")');
            }

            // Validate days of week (0-6)
            if (schedule.daysOfWeek.some(day => day < 0 || day > 6)) {
                throw new Error('Invalid days of week. Use values 0-6 (Sunday-Saturday)');
            }

            // Validate start < end (handle midnight boundary)
            const [startHour, startMin] = schedule.timeRange.start.split(':').map(Number);
            const [endHour, endMin] = schedule.timeRange.end.split(':').map(Number);
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;
            
            // Allow schedules that cross midnight (e.g., 23:00 to 01:00)
            // If endMinutes < startMinutes, it means the schedule crosses midnight, which is valid
            // Otherwise, startMinutes must be < endMinutes
            if (startMinutes === endMinutes) {
                throw new Error('Start time must be different from end time');
            }
            // If endMinutes < startMinutes, it's a midnight crossing (valid, no error)
            // If startMinutes >= endMinutes, it's invalid (end should be after start in same day)
            // But we allow midnight crossing, so only error if times are equal

            const result = await db.collection('threshold_schedules').insertOne({
                ...schedule,
                createdAt: new Date(),
            });

            return result.insertedId.toString();
        } catch (error) {
            console.error('[ResourceThresholdService] Error creating schedule:', error);
            throw error;
        }
    }

    /**
     * List all threshold schedules
     */
    async listSchedules(enabled?: boolean): Promise<ThresholdSchedule[]> {
        try {
            const db = getDB();
            const query = enabled !== undefined ? { enabled } : {};
            
            const schedules = await db.collection('threshold_schedules')
                .find(query)
                .sort({ createdAt: -1 })
                .toArray();

            return schedules.map(s => ({
                id: s._id?.toString() || s.id,
                name: s.name,
                timeRange: s.timeRange,
                daysOfWeek: s.daysOfWeek,
                thresholds: s.thresholds,
                enabled: s.enabled,
            }));
        } catch (error) {
            console.error('[ResourceThresholdService] Error listing schedules:', error);
            return [];
        }
    }

    /**
     * Update a threshold schedule
     */
    async updateSchedule(
        scheduleId: string,
        updates: Partial<Omit<ThresholdSchedule, 'id'>>
    ): Promise<void> {
        try {
            const db = getDB();
            const updateDoc: {
                updatedAt: Date;
                name?: string;
                timeRange?: { start: string; end: string };
                daysOfWeek?: number[];
                thresholds?: ResourceThresholds;
                enabled?: boolean;
            } = { updatedAt: new Date() };

            if (updates.name !== undefined) updateDoc.name = updates.name;
            if (updates.timeRange !== undefined) {
                // Validate time range format
                const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
                if (updates.timeRange.start && !timeRegex.test(updates.timeRange.start)) {
                    throw new Error('Invalid start time format. Use HH:mm format');
                }
                if (updates.timeRange.end && !timeRegex.test(updates.timeRange.end)) {
                    throw new Error('Invalid end time format. Use HH:mm format');
                }
                updateDoc.timeRange = updates.timeRange;
            }
            if (updates.daysOfWeek !== undefined) {
                if (updates.daysOfWeek.some(day => day < 0 || day > 6)) {
                    throw new Error('Invalid days of week. Use values 0-6 (Sunday-Saturday)');
                }
                updateDoc.daysOfWeek = updates.daysOfWeek;
            }
            if (updates.thresholds !== undefined) updateDoc.thresholds = updates.thresholds;
            if (updates.enabled !== undefined) updateDoc.enabled = updates.enabled;

            const result = await db.collection('threshold_schedules').updateOne(
                { _id: new ObjectId(scheduleId) },
                { $set: updateDoc }
            );

            if (result.matchedCount === 0) {
                throw new Error(`Schedule with id ${scheduleId} not found`);
            }
        } catch (error) {
            console.error('[ResourceThresholdService] Error updating schedule:', error);
            throw error;
        }
    }

    /**
     * Delete a threshold schedule
     */
    async deleteSchedule(scheduleId: string): Promise<void> {
        try {
            const db = getDB();
            const result = await db.collection('threshold_schedules').deleteOne({
                _id: new ObjectId(scheduleId),
            });

            if (result.deletedCount === 0) {
                throw new Error(`Schedule with id ${scheduleId} not found`);
            }
        } catch (error) {
            console.error('[ResourceThresholdService] Error deleting schedule:', error);
            throw error;
        }
    }

    /**
     * Get a specific schedule by ID
     */
    async getSchedule(scheduleId: string): Promise<ThresholdSchedule | null> {
        try {
            const db = getDB();
            const schedule = await db.collection('threshold_schedules').findOne({
                _id: new ObjectId(scheduleId),
            });

            if (!schedule) return null;

            return {
                id: schedule._id?.toString() || schedule.id,
                name: schedule.name,
                timeRange: schedule.timeRange,
                daysOfWeek: schedule.daysOfWeek,
                thresholds: schedule.thresholds,
                enabled: schedule.enabled,
            };
        } catch (error) {
            console.error('[ResourceThresholdService] Error fetching schedule:', error);
            return null;
        }
    }

    /**
     * Iteration 7: Notification Preferences
     */
    async getNotificationPreferences(metric?: string): Promise<NotificationPreferences[]> {
        try {
            const db = getDB();
            const query = metric ? { metric } : {};
            const prefs = await db.collection('threshold_notification_preferences')
                .find(query)
                .toArray();
            
            return prefs.map(p => ({
                metric: p.metric,
                channels: p.channels,
                severity: p.severity,
            }));
        } catch (error) {
            console.error('[ResourceThresholdService] Error fetching notification preferences:', error);
            return [];
        }
    }

    /**
     * Iteration 9: Auto-adjustment based on trends
     */
    async autoAdjustThresholds(metrics: ResourceMetrics, autoAdjustEnabled: boolean = false): Promise<ResourceThresholds | null> {
        if (!autoAdjustEnabled) return null;

        try {
            const recommendations = await this.getRecommendations(metrics, 7); // Last 7 days
            const currentThresholds = await this.getThresholds();
            const adjustments: Partial<ResourceThresholds> = {};

            for (const rec of recommendations) {
                if (rec.confidence >= 0.7) { // High confidence
                    adjustments[rec.metric as keyof ResourceThresholds] = rec.recommendedThreshold as number;
                }
            }

            if (Object.keys(adjustments).length > 0) {
                await this.updateThresholds(adjustments, 'system', 'Auto-adjusted based on usage trends');
                return { ...currentThresholds, ...adjustments };
            }

            return null;
        } catch (error) {
            console.error('[ResourceThresholdService] Error auto-adjusting thresholds:', error);
            return null;
        }
    }

    /**
     * Iteration 10: Export/Import thresholds
     */
    async exportThresholds(): Promise<{ thresholds: ResourceThresholds; metadata: { exportedAt: Date; version: string } }> {
        const thresholds = await this.getThresholds();
        return {
            thresholds,
            metadata: {
                exportedAt: new Date(),
                version: '1.0',
            },
        };
    }

    async importThresholds(
        data: { thresholds: ResourceThresholds; metadata?: { exportedAt?: Date; version?: string } },
        changedBy?: string
    ): Promise<void> {
        await this.updateThresholds(data.thresholds, changedBy, `Imported from backup (version: ${data.metadata?.version || 'unknown'})`);
    }
}

let resourceThresholdService: ResourceThresholdService | null = null;

export function getResourceThresholdService(): ResourceThresholdService {
    if (!resourceThresholdService) {
        resourceThresholdService = new ResourceThresholdService();
    }
    return resourceThresholdService;
}
