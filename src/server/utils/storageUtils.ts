import fs from 'fs/promises';
import path from 'path';

/**
 * Calculate the total size of a directory recursively
 */
export async function calculateDirectorySize(dirPath: string): Promise<number> {
    try {
        const stats = await fs.stat(dirPath);
        if (!stats.isDirectory()) {
            return stats.size;
        }

        let totalSize = 0;
        const entries = await fs.readdir(dirPath);

        for (const entry of entries) {
            const entryPath = path.join(dirPath, entry);
            try {
                const entryStats = await fs.stat(entryPath);
                if (entryStats.isDirectory()) {
                    totalSize += await calculateDirectorySize(entryPath);
                } else {
                    totalSize += entryStats.size;
                }
            } catch (_error) {
                // Skip files/directories we can't access
                console.debug(`Skipping ${entryPath}:`, _error);
            }
        }

        return totalSize;
    } catch (_error) {
        console.error(`Error calculating size for ${dirPath}:`, _error);
        return 0;
    }
}

/**
 * Get storage breakdown by component
 */
export interface StorageBreakdown {
    knowledge_base: {
        size_mb: number;
        path: string;
    };
    logs: {
        size_mb: number;
        path: string;
    };
    database: {
        size_mb: number;
        type: string;
    };
    total_mb: number;
}

/**
 * Get storage breakdown by component
 */
export async function getStorageBreakdown(
    knowledgeBasePath: string,
    logsPath: string,
    databaseSizeMb: number
): Promise<StorageBreakdown> {
    const knowledgeBaseSize = await calculateDirectorySize(knowledgeBasePath);
    const logsSize = await calculateDirectorySize(logsPath);

    const knowledgeBaseSizeMb = Math.round(knowledgeBaseSize / 1024 / 1024);
    const logsSizeMb = Math.round(logsSize / 1024 / 1024);
    const totalMb = knowledgeBaseSizeMb + logsSizeMb + databaseSizeMb;

    return {
        knowledge_base: {
            size_mb: knowledgeBaseSizeMb,
            path: knowledgeBasePath,
        },
        logs: {
            size_mb: logsSizeMb,
            path: logsPath,
        },
        database: {
            size_mb: databaseSizeMb,
            type: 'MongoDB',
        },
        total_mb: totalMb,
    };
}

/**
 * Generate storage cleanup recommendations
 */
export interface CleanupRecommendation {
    component: string;
    recommendation: string;
    potential_savings_mb: number;
    priority: 'low' | 'medium' | 'high';
}

/**
 * Generate storage cleanup recommendations based on storage breakdown
 */
export async function generateCleanupRecommendations(
    breakdown: StorageBreakdown
): Promise<CleanupRecommendation[]> {
    const recommendations: CleanupRecommendation[] = [];

    // Check database size - most critical for large databases
    if (breakdown.database.size_mb > 5000) {
        const estimatedSavings = Math.round(breakdown.database.size_mb * 0.15); // Estimate 15% savings from cleanup
        recommendations.push({
            component: 'database',
            recommendation: 'Database size is large. Run automated cleanup to remove old records (scraping progress, job progress, audit logs, etc.)',
            potential_savings_mb: estimatedSavings,
            priority: breakdown.database.size_mb > 10000 ? 'high' : 'medium',
        });
    }

    // Check logs size
    if (breakdown.logs.size_mb > 1000) {
        recommendations.push({
            component: 'logs',
            recommendation: 'Consider archiving or deleting old log files (>30 days)',
            potential_savings_mb: Math.round(breakdown.logs.size_mb * 0.5), // Estimate 50% savings
            priority: breakdown.logs.size_mb > 5000 ? 'high' : 'medium',
        });
    }

    // Check knowledge base size
    if (breakdown.knowledge_base.size_mb > 5000) {
        recommendations.push({
            component: 'knowledge_base',
            recommendation: 'Consider reviewing and removing outdated or duplicate content',
            potential_savings_mb: Math.round(breakdown.knowledge_base.size_mb * 0.1), // Estimate 10% savings
            priority: breakdown.knowledge_base.size_mb > 10000 ? 'high' : 'medium',
        });
    }

    // Check total storage (only if no specific recommendations already added)
    if (breakdown.total_mb > 10000 && recommendations.length === 0) {
        recommendations.push({
            component: 'system',
            recommendation: 'Overall storage usage is high. Consider implementing automated cleanup policies',
            potential_savings_mb: Math.round(breakdown.total_mb * 0.15), // Estimate 15% savings
            priority: breakdown.total_mb > 20000 ? 'high' : 'medium',
        });
    }

    return recommendations;
}

