/**
 * WorkflowQuotaService
 * 
 * Service for tracking and enforcing per-user workflow execution quotas.
 * Provides daily, weekly, and monthly quota limits to prevent resource exhaustion
 * and cost overruns from excessive workflow executions.
 * 
 * Quotas are tracked per user and reset based on time periods (daily, weekly, monthly).
 * This complements the rate limiting middleware which provides short-term throttling.
 */

import { getDB } from '../../config/database.js';
import { ObjectId } from 'mongodb';
import { logger } from '../../utils/logger.js';

/**
 * Quota period types
 */
export type QuotaPeriod = 'daily' | 'weekly' | 'monthly';

/**
 * Quota configuration
 */
export interface QuotaConfig {
    /** Daily execution limit (default: 50) */
    dailyLimit: number;
    /** Weekly execution limit (default: 200) */
    weeklyLimit: number;
    /** Monthly execution limit (default: 500) */
    monthlyLimit: number;
}

/**
 * Quota check result
 */
export interface QuotaCheckResult {
    /** Whether execution is allowed */
    allowed: boolean;
    /** Remaining executions in current period */
    remaining: number;
    /** Current count for the period */
    current: number;
    /** Limit for the period */
    limit: number;
    /** Period type */
    period: QuotaPeriod;
    /** When the quota resets (ISO date string) */
    resetAt: string;
    /** Error message if quota exceeded */
    error?: string;
}

/**
 * Workflow execution quota tracking document
 */
interface WorkflowQuotaDocument {
    _id?: ObjectId;
    userId: string;
    daily: {
        count: number;
        resetAt: Date;
    };
    weekly: {
        count: number;
        resetAt: Date;
    };
    monthly: {
        count: number;
        resetAt: Date;
    };
    updatedAt: Date;
}

/**
 * Default quota limits (configurable via environment variables)
 */
const DEFAULT_QUOTA_CONFIG: QuotaConfig = {
    dailyLimit: parseInt(process.env.WORKFLOW_QUOTA_DAILY_LIMIT || '50', 10),
    weeklyLimit: parseInt(process.env.WORKFLOW_QUOTA_WEEKLY_LIMIT || '200', 10),
    monthlyLimit: parseInt(process.env.WORKFLOW_QUOTA_MONTHLY_LIMIT || '500', 10),
};

/**
 * Service for managing workflow execution quotas
 */
export class WorkflowQuotaService {
    private readonly collectionName = 'workflowQuotas';
    private readonly quotaConfig: QuotaConfig;

    constructor(config?: Partial<QuotaConfig>) {
        this.quotaConfig = { ...DEFAULT_QUOTA_CONFIG, ...config };
    }

    /**
     * Check if user has quota remaining for workflow execution
     * 
     * @param userId - User ID to check quota for
     * @param period - Quota period to check (default: checks all periods, fails if any exceeded)
     * @returns Quota check result
     */
    async checkQuota(userId: string, period?: QuotaPeriod): Promise<QuotaCheckResult> {
        const db = getDB();
        const now = new Date();

        // Get or create quota document
        let quotaDoc: WorkflowQuotaDocument | null = await db.collection<WorkflowQuotaDocument>(this.collectionName).findOne({ userId });

        if (!quotaDoc) {
            // Create new quota document with reset dates
            quotaDoc = this.createNewQuotaDocument(userId, now);
            await db.collection<WorkflowQuotaDocument>(this.collectionName).insertOne(quotaDoc as any);
        }

        // Check and reset quotas if needed
        quotaDoc = await this.resetQuotasIfNeeded(quotaDoc, now);

        // Check quota for specified period or all periods
        if (period) {
            return this.checkPeriodQuota(quotaDoc, period, now);
        }

        // Check all periods - fail if any exceeded
        const dailyCheck = this.checkPeriodQuota(quotaDoc, 'daily', now);
        if (!dailyCheck.allowed) {
            return dailyCheck;
        }

        const weeklyCheck = this.checkPeriodQuota(quotaDoc, 'weekly', now);
        if (!weeklyCheck.allowed) {
            return weeklyCheck;
        }

        const monthlyCheck = this.checkPeriodQuota(quotaDoc, 'monthly', now);
        return monthlyCheck;
    }

    /**
     * Record a workflow execution for quota tracking
     * 
     * @param userId - User ID who executed the workflow
     * @param workflowId - Workflow ID that was executed
     */
    async recordExecution(userId: string, workflowId: string): Promise<void> {
        const db = getDB();
        const now = new Date();

        try {
            // Get or create quota document
            let quotaDoc: WorkflowQuotaDocument | null = await db.collection<WorkflowQuotaDocument>(this.collectionName).findOne({ userId });

            if (!quotaDoc) {
                quotaDoc = this.createNewQuotaDocument(userId, now);
                await db.collection<WorkflowQuotaDocument>(this.collectionName).insertOne(quotaDoc as any);
            } else {
                // Reset quotas if needed before incrementing
                quotaDoc = await this.resetQuotasIfNeeded(quotaDoc, now);
            }

            // Increment counters for all periods
            await db.collection<WorkflowQuotaDocument>(this.collectionName).updateOne(
                { userId },
                {
                    $inc: {
                        'daily.count': 1,
                        'weekly.count': 1,
                        'monthly.count': 1,
                    },
                    $set: {
                        updatedAt: now,
                    },
                }
            );

            logger.debug(
                { userId, workflowId },
                'Recorded workflow execution for quota tracking'
            );
        } catch (error) {
            // Don't throw - quota tracking failure shouldn't break workflow execution
            logger.error(
                { error, userId, workflowId },
                'Failed to record workflow execution for quota tracking'
            );
        }
    }

    /**
     * Get current quota status for a user
     * 
     * @param userId - User ID to get quota status for
     * @returns Quota status for all periods
     */
    async getQuotaStatus(userId: string): Promise<{
        daily: QuotaCheckResult;
        weekly: QuotaCheckResult;
        monthly: QuotaCheckResult;
    }> {
        const db = getDB();
        const now = new Date();

        let quotaDoc: WorkflowQuotaDocument | null = await db.collection<WorkflowQuotaDocument>(this.collectionName).findOne({ userId });

        if (!quotaDoc) {
            quotaDoc = this.createNewQuotaDocument(userId, now);
        } else {
            quotaDoc = await this.resetQuotasIfNeeded(quotaDoc, now);
        }

        return {
            daily: this.checkPeriodQuota(quotaDoc, 'daily', now),
            weekly: this.checkPeriodQuota(quotaDoc, 'weekly', now),
            monthly: this.checkPeriodQuota(quotaDoc, 'monthly', now),
        };
    }

    /**
     * Create a new quota document with reset dates
     */
    private createNewQuotaDocument(userId: string, now: Date): WorkflowQuotaDocument {
        return {
            userId,
            daily: {
                count: 0,
                resetAt: this.getNextDailyReset(now),
            },
            weekly: {
                count: 0,
                resetAt: this.getNextWeeklyReset(now),
            },
            monthly: {
                count: 0,
                resetAt: this.getNextMonthlyReset(now),
            },
            updatedAt: now,
        };
    }

    /**
     * Reset quotas if their reset time has passed
     */
    private async resetQuotasIfNeeded(
        quotaDoc: WorkflowQuotaDocument,
        now: Date
    ): Promise<WorkflowQuotaDocument> {
        const db = getDB();
        const updates: Record<string, unknown> = {};
        let needsUpdate = false;

        // Check daily reset
        if (now >= quotaDoc.daily.resetAt) {
            updates['daily.count'] = 0;
            updates['daily.resetAt'] = this.getNextDailyReset(now);
            needsUpdate = true;
        }

        // Check weekly reset
        if (now >= quotaDoc.weekly.resetAt) {
            updates['weekly.count'] = 0;
            updates['weekly.resetAt'] = this.getNextWeeklyReset(now);
            needsUpdate = true;
        }

        // Check monthly reset
        if (now >= quotaDoc.monthly.resetAt) {
            updates['monthly.count'] = 0;
            updates['monthly.resetAt'] = this.getNextMonthlyReset(now);
            needsUpdate = true;
        }

        if (needsUpdate) {
            updates['updatedAt'] = now;
            await db.collection<WorkflowQuotaDocument>(this.collectionName).updateOne(
                { userId: quotaDoc.userId },
                { $set: updates }
            );

            // Return updated document
            const updated = await db.collection<WorkflowQuotaDocument>(this.collectionName).findOne({
                userId: quotaDoc.userId,
            });
            if (updated) {
                return updated;
            }
        }

        return quotaDoc;
    }

    /**
     * Check quota for a specific period
     */
    private checkPeriodQuota(
        quotaDoc: WorkflowQuotaDocument,
        period: QuotaPeriod,
        now: Date
    ): QuotaCheckResult {
        const periodData = quotaDoc[period];
        const limit = this.quotaConfig[`${period}Limit` as keyof QuotaConfig] as number;
        const current = periodData.count;
        const remaining = Math.max(0, limit - current);
        const allowed = current < limit;

        return {
            allowed,
            remaining,
            current,
            limit,
            period,
            resetAt: periodData.resetAt.toISOString(),
            error: allowed
                ? undefined
                : `Workflow execution quota exceeded for ${period} period. Limit: ${limit}, Current: ${current}. Resets at: ${periodData.resetAt.toISOString()}`,
        };
    }

    /**
     * Get next daily reset time (midnight)
     */
    private getNextDailyReset(now: Date): Date {
        const reset = new Date(now);
        reset.setHours(24, 0, 0, 0); // Next midnight
        return reset;
    }

    /**
     * Get next weekly reset time (Monday midnight)
     */
    private getNextWeeklyReset(now: Date): Date {
        const reset = new Date(now);
        const dayOfWeek = reset.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek; // Next Monday
        reset.setDate(reset.getDate() + daysUntilMonday);
        reset.setHours(0, 0, 0, 0);
        return reset;
    }

    /**
     * Get next monthly reset time (1st of next month)
     */
    private getNextMonthlyReset(now: Date): Date {
        const reset = new Date(now);
        reset.setMonth(reset.getMonth() + 1, 1); // 1st of next month
        reset.setHours(0, 0, 0, 0);
        return reset;
    }
}

/**
 * Singleton instance
 */
let quotaServiceInstance: WorkflowQuotaService | null = null;

/**
 * Get or create WorkflowQuotaService instance
 */
export function getWorkflowQuotaService(): WorkflowQuotaService {
    if (!quotaServiceInstance) {
        quotaServiceInstance = new WorkflowQuotaService();
    }
    return quotaServiceInstance;
}

