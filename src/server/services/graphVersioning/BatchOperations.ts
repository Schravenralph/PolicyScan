/**
 * Batch Operations Service
 * 
 * Supports batch operations for multiple scrapers:
 * - Seed multiple scrapers
 * - Pull from parent for multiple scrapers
 * - Validate multiple scrapers
 * - Generate reports for multiple scrapers
 */

import { Driver } from 'neo4j-driver';
import { UnifiedGraphSeeder, SeedOptions, SeedResult } from '../scraperGraph/UnifiedGraphSeeder.js';
import { ScraperMetadata, ScraperGraphVersioning } from '../scraperGraph/ScraperGraphVersioning.js';
import { BaseScraper } from '../scrapers/baseScraper.js';
import { GraphValidator, ValidationResult } from './GraphValidator.js';
import { ConflictReporter, ConflictReport } from './ConflictReporter.js';
import { GraphDiffService, GraphDiffResult } from './GraphDiff.js';
import { GraphVersionManager } from './GraphVersionManager.js';

export interface BatchSeedOptions extends SeedOptions {
    /**
     * Continue on error (default: false)
     */
    continueOnError?: boolean;
    
    /**
     * Maximum number of concurrent operations (default: 3)
     */
    concurrency?: number;
    
    /**
     * Progress callback with detailed progress information
     */
    onProgress?: (scraperId: string, status: 'pending' | 'running' | 'completed' | 'failed', result?: SeedResult | Error, progress?: ProgressInfo) => void;
    
    /**
     * Retry configuration
     */
    retry?: {
        maxAttempts?: number;
        initialDelay?: number;
        backoffMultiplier?: number;
        maxDelay?: number;
    };
}

export interface ProgressInfo {
    current: number;
    total: number;
    percentage: number;
    elapsed: number;
    estimatedTimeRemaining?: number;
    throughput?: number; // operations per second
}

export interface BatchSeedResult {
    total: number;
    successful: number;
    failed: number;
    results: Map<string, SeedResult | Error>;
    summary: string;
}

export interface BatchValidationResult {
    total: number;
    valid: number;
    invalid: number;
    results: Map<string, ValidationResult>;
    summary: string;
}

export interface BatchPullResult {
    total: number;
    successful: number;
    failed: number;
    results: Map<string, {
        success: boolean;
        nodesPulled?: number;
        nodesUpdated?: number;
        conflicts?: number;
        error?: string;
    }>;
    summary: string;
}

export interface BatchReport {
    scraperId: string;
    validation?: ValidationResult;
    conflicts?: ConflictReport;
    diff?: GraphDiffResult;
    seedResult?: SeedResult;
    error?: string;
}

/**
 * Service for batch operations on multiple scrapers
 */
export class BatchOperations {
    private seeder: UnifiedGraphSeeder;
    private validator: GraphValidator;
    private _conflictReporter: ConflictReporter;
    private graphDiff: GraphDiffService;

    private _driver: Driver;
    private versionManager: GraphVersionManager;
    private versioning: ScraperGraphVersioning;

    constructor(driver: Driver) {
        this._driver = driver;
        this.seeder = new UnifiedGraphSeeder(driver);
        this.validator = new GraphValidator(driver);
        this._conflictReporter = new ConflictReporter();
        this.versionManager = new GraphVersionManager();
        this.versioning = new ScraperGraphVersioning(driver);
        this.graphDiff = new GraphDiffService(this.versionManager, driver, this.versioning);
    }

    /**
     * Initialize batch operations service
     */
    async initialize(): Promise<void> {
        await this.seeder.initialize();
    }

    /**
     * Seed multiple scrapers in batch with improved progress tracking and retry logic
     */
    async batchSeed(
        scrapers: Array<{
            scraper: BaseScraper;
            metadata: ScraperMetadata;
        }>,
        options: BatchSeedOptions = {}
    ): Promise<BatchSeedResult> {
        const results = new Map<string, SeedResult | Error>();
        const continueOnError = options.continueOnError ?? false;
        const concurrency = options.concurrency ?? 3;
        const onProgress = options.onProgress;
        const retryConfig = options.retry || {
            maxAttempts: 3,
            initialDelay: 1000,
            backoffMultiplier: 2,
            maxDelay: 10000
        };

        const startTime = Date.now();
        let completed = 0;
        const total = scrapers.length;

        // Process in batches with concurrency limit
        for (let i = 0; i < scrapers.length; i += concurrency) {
            const batch = scrapers.slice(i, i + concurrency);
            
            await Promise.all(
                batch.map(async ({ scraper, metadata }) => {
                    // Notify progress: running
                    if (onProgress) {
                        const progress = this.calculateProgress(completed, total, startTime);
                        onProgress(metadata.scraperId, 'running', undefined, progress);
                    }

                    let lastError: Error | null = null;
                    
                    // Retry logic
                    for (let attempt = 0; attempt < retryConfig.maxAttempts!; attempt++) {
                        try {
                            const result = await this.seeder.seedScraper(scraper, metadata, options);
                            results.set(metadata.scraperId, result);
                            completed++;
                            
                            if (onProgress) {
                                const progress = this.calculateProgress(completed, total, startTime);
                                onProgress(metadata.scraperId, 'completed', result, progress);
                            }
                            return; // Success, exit retry loop
                        } catch (error) {
                            lastError = error instanceof Error ? error : new Error(String(error));
                            
                            // If not last attempt, wait and retry
                            if (attempt < retryConfig.maxAttempts! - 1) {
                                const delay = Math.min(
                                    retryConfig.initialDelay! * Math.pow(retryConfig.backoffMultiplier!, attempt),
                                    retryConfig.maxDelay!
                                );
                                await new Promise(resolve => setTimeout(resolve, delay));
                                continue;
                            }
                        }
                    }

                    // All retries failed
                    completed++;
                    results.set(metadata.scraperId, lastError!);
                    
                    if (onProgress) {
                        const progress = this.calculateProgress(completed, total, startTime);
                        onProgress(metadata.scraperId, 'failed', lastError!, progress);
                    }
                    
                    if (!continueOnError) {
                        throw lastError!;
                    }
                })
            );
        }

        const successful = Array.from(results.values()).filter(r => !(r instanceof Error)).length;
        const failed = results.size - successful;

        return {
            total: scrapers.length,
            successful,
            failed,
            results,
            summary: this.generateBatchSeedSummary(results)
        };
    }

    /**
     * Pull from parent for multiple scrapers
     */
    async batchPull(
        scraperIds: string[],
        options: SeedOptions = {}
    ): Promise<BatchPullResult> {
        const results = new Map<string, {
            success: boolean;
            nodesPulled?: number;
            nodesUpdated?: number;
            conflicts?: number;
            error?: string;
        }>();

        for (const scraperId of scraperIds) {
            try {
                const pullResult = await this.seeder.pullFromParent(scraperId, options);
                results.set(scraperId, {
                    success: true,
                    nodesPulled: pullResult.nodesPulled,
                    nodesUpdated: pullResult.nodesUpdated,
                    conflicts: pullResult.conflicts.length
                });
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                results.set(scraperId, {
                    success: false,
                    error: errorMsg
                });
            }
        }

        const successful = Array.from(results.values()).filter(r => r.success).length;
        const failed = results.size - successful;

        return {
            total: scraperIds.length,
            successful,
            failed,
            results,
            summary: this.generateBatchPullSummary(results)
        };
    }

    /**
     * Validate multiple scrapers
     */
    async batchValidate(scraperIds: string[]): Promise<BatchValidationResult> {
        const results = await this.validator.validateMultipleScrapers(scraperIds);

        const valid = Array.from(results.values()).filter(r => r.isValid).length;
        const invalid = results.size - valid;

        return {
            total: scraperIds.length,
            valid,
            invalid,
            results,
            summary: this.generateBatchValidationSummary(results)
        };
    }

    /**
     * Generate comprehensive reports for multiple scrapers
     */
    async batchReport(
        scraperIds: string[],
        options: {
            includeValidation?: boolean;
            includeConflicts?: boolean;
            includeDiff?: boolean;
            diffFromVersion?: string;
            diffToVersion?: string;
        } = {}
    ): Promise<Map<string, BatchReport>> {
        const reports = new Map<string, BatchReport>();

        const {
            includeValidation = true,
            includeConflicts = true,
            includeDiff = false,
            diffFromVersion,
            diffToVersion
        } = options;

        for (const scraperId of scraperIds) {
            const report: BatchReport = { scraperId };

            try {
                // Validation
                if (includeValidation) {
                    try {
                        report.validation = await this.validator.validateScraperGraph(scraperId);
                    } catch (error) {
                        report.error = `Validation failed: ${error instanceof Error ? error.message : String(error)}`;
                    }
                }

                // Conflicts (from last pull)
                if (includeConflicts) {
                    try {
                        // Get conflicts from last pull operation
                        // This would require tracking conflicts, for now we'll skip
                        // or get from versioning service directly
                    } catch {
                        // Ignore conflict errors
                    }
                }

                // Diff
                if (includeDiff) {
                    try {
                        report.diff = await this.graphDiff.compareVersions(
                            scraperId,
                            diffFromVersion,
                            diffToVersion
                        );
                    } catch {
                        // Ignore diff errors
                    }
                }
            } catch (error) {
                report.error = error instanceof Error ? error.message : String(error);
            }

            reports.set(scraperId, report);
        }

        return reports;
    }

    /**
     * Generate a comprehensive batch report as markdown
     */
    async generateBatchReportMarkdown(
        scraperIds: string[],
        options: {
            includeValidation?: boolean;
            includeConflicts?: boolean;
            includeDiff?: boolean;
            diffFromVersion?: string;
            diffToVersion?: string;
        } = {}
    ): Promise<string> {
        const reports = await this.batchReport(scraperIds, options);
        const lines: string[] = [];

        lines.push('# Batch Scraper Report');
        lines.push('');
        lines.push(`Generated: ${new Date().toISOString()}`);
        lines.push(`Scrapers: ${scraperIds.length}`);
        lines.push('');

        for (const [scraperId, report] of reports.entries()) {
            lines.push(`## ${scraperId}`);
            lines.push('');

            if (report.error) {
                lines.push(`**Error:** ${report.error}`);
                lines.push('');
                continue;
            }

            // Validation section
            if (report.validation) {
                lines.push('### Validation');
                lines.push('');
                lines.push(`**Status:** ${report.validation.isValid ? '✅ VALID' : '❌ INVALID'}`);
                lines.push(`**Nodes:** ${report.validation.summary.totalNodes}`);
                lines.push(`**Edges:** ${report.validation.summary.totalEdges}`);
                lines.push(`**Errors:** ${report.validation.summary.errors}`);
                lines.push(`**Warnings:** ${report.validation.summary.warnings}`);
                lines.push('');

                if (report.validation.issues.length > 0) {
                    lines.push('**Issues:**');
                    lines.push('');
                    for (const issue of report.validation.issues.slice(0, 10)) {
                        const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
                        lines.push(`- ${icon} ${issue.message}`);
                        if (issue.nodeUrl) {
                            lines.push(`  - Node: ${issue.nodeUrl}`);
                        }
                    }
                    if (report.validation.issues.length > 10) {
                        lines.push(`- ... and ${report.validation.issues.length - 10} more issues`);
                    }
                    lines.push('');
                }
            }

            // Diff section
            if (report.diff) {
                lines.push('### Changes');
                lines.push('');
                lines.push(`**From:** ${report.diff.fromVersion} → **To:** ${report.diff.toVersion}`);
                lines.push(`**Nodes Added:** ${report.diff.summary.nodesAdded}`);
                lines.push(`**Nodes Removed:** ${report.diff.summary.nodesRemoved}`);
                lines.push(`**Nodes Modified:** ${report.diff.summary.nodesModified}`);
                lines.push('');
            }

            lines.push('---');
            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Generate summary for batch seed results
     */
    private generateBatchSeedSummary(results: Map<string, SeedResult | Error>): string {
        const successful = Array.from(results.values()).filter(r => !(r instanceof Error)).length;
        const failed = results.size - successful;

        const lines: string[] = [];
        lines.push(`Batch Seed Summary: ${successful} successful, ${failed} failed out of ${results.size} total`);

        if (failed > 0) {
            lines.push('');
            lines.push('Failed scrapers:');
            for (const [scraperId, result] of results.entries()) {
                if (result instanceof Error) {
                    lines.push(`  - ${scraperId}: ${result.message}`);
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * Generate summary for batch pull results
     */
    private generateBatchPullSummary(
        results: Map<string, { success: boolean; nodesPulled?: number; nodesUpdated?: number; conflicts?: number; error?: string }>
    ): string {
        const successful = Array.from(results.values()).filter(r => r.success).length;
        const failed = results.size - successful;
        const totalPulled = Array.from(results.values())
            .filter(r => r.success)
            .reduce((sum, r) => sum + (r.nodesPulled || 0), 0);
        const totalUpdated = Array.from(results.values())
            .filter(r => r.success)
            .reduce((sum, r) => sum + (r.nodesUpdated || 0), 0);
        const totalConflicts = Array.from(results.values())
            .filter(r => r.success)
            .reduce((sum, r) => sum + (r.conflicts || 0), 0);

        const lines: string[] = [];
        lines.push(`Batch Pull Summary: ${successful} successful, ${failed} failed out of ${results.size} total`);
        lines.push(`Total nodes pulled: ${totalPulled}`);
        lines.push(`Total nodes updated: ${totalUpdated}`);
        lines.push(`Total conflicts: ${totalConflicts}`);

        if (failed > 0) {
            lines.push('');
            lines.push('Failed scrapers:');
            for (const [scraperId, result] of results.entries()) {
                if (!result.success) {
                    lines.push(`  - ${scraperId}: ${result.error || 'Unknown error'}`);
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * Generate summary for batch validation results
     */
    private generateBatchValidationSummary(results: Map<string, ValidationResult>): string {
        const valid = Array.from(results.values()).filter(r => r.isValid).length;
        const invalid = results.size - valid;
        const totalErrors = Array.from(results.values())
            .reduce((sum, r) => sum + r.summary.errors, 0);
        const totalWarnings = Array.from(results.values())
            .reduce((sum, r) => sum + r.summary.warnings, 0);

        const lines: string[] = [];
        lines.push(`Batch Validation Summary: ${valid} valid, ${invalid} invalid out of ${results.size} total`);
        lines.push(`Total errors: ${totalErrors}`);
        lines.push(`Total warnings: ${totalWarnings}`);

        if (invalid > 0) {
            lines.push('');
            lines.push('Invalid scrapers:');
            for (const [scraperId, result] of results.entries()) {
                if (!result.isValid) {
                    lines.push(`  - ${scraperId}: ${result.summary.errors} errors, ${result.summary.warnings} warnings`);
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * Batch diff operations - compare multiple scrapers with versions
     */
    async batchDiff(
        scraperIds: string[],
        options: {
            fromVersion?: string;
            toVersion?: string;
            compareWithCurrent?: boolean;
            filters?: {
                changeTypes?: Array<'added' | 'removed' | 'modified'>;
                nodeTypes?: Array<'page' | 'section' | 'document'>;
            };
        } = {}
    ): Promise<Map<string, GraphDiffResult>> {
        const results = new Map<string, GraphDiffResult>();

        for (const scraperId of scraperIds) {
            try {
                let diff: GraphDiffResult;

                if (options.compareWithCurrent) {
                    // Compare current Neo4j state with version
                    diff = await this.graphDiff.compareCurrentWithVersion(
                        scraperId,
                        options.fromVersion || '1.0.0'
                    );
                } else {
                    // Compare two versions
                    diff = await this.graphDiff.compareVersions(
                        scraperId,
                        options.fromVersion,
                        options.toVersion
                    );
                }

                // Apply filters if provided
                if (options.filters) {
                    diff = this.graphDiff.filterDiff(diff, options.filters);
                }

                results.set(scraperId, diff);
            } catch (error) {
                // Skip failed diffs - could add error tracking here
                console.warn(`Failed to diff ${scraperId}:`, error);
            }
        }

        return results;
    }

    /**
     * Calculate progress information
     */
    private calculateProgress(
        current: number,
        total: number,
        startTime: number
    ): ProgressInfo {
        const elapsed = Date.now() - startTime;
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        const throughput = elapsed > 0 ? (current / elapsed) * 1000 : 0; // ops per second
        const estimatedTimeRemaining = throughput > 0 
            ? Math.round((total - current) / throughput * 1000) 
            : undefined;

        return {
            current,
            total,
            percentage,
            elapsed,
            estimatedTimeRemaining,
            throughput
        };
    }
}
