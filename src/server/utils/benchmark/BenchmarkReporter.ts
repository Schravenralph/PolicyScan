/**
 * BenchmarkReporter - Generate reports in various formats
 * 
 * Supports JSON, table, markdown, and CSV output formats.
 */

import type { BenchmarkResult, BenchmarkComparison, ReporterConfig, ReportFormat } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

export class BenchmarkReporter {
  /**
   * Generate report for a single benchmark result
   */
  generateReport(result: BenchmarkResult, config: ReporterConfig = {}): string {
    const formats = Array.isArray(config.format) ? config.format : [config.format ?? 'table'];
    const reports: string[] = [];

    for (const format of formats) {
      let report: string;
      switch (format) {
        case 'json':
          report = this.toJSON(result, config);
          break;
        case 'table':
          report = this.toTable(result, config);
          break;
        case 'markdown':
          report = this.toMarkdown(result, config);
          break;
        case 'csv':
          report = this.toCSV(result, config);
          break;
        default:
          report = this.toTable(result, config);
      }
      reports.push(report);
    }

    const combined = reports.join('\n\n---\n\n');

    // Save to file if specified
    if (config.outputFile) {
      fs.writeFileSync(config.outputFile, combined, 'utf-8');
    }

    return combined;
  }

  /**
   * Generate comparison report between two results
   */
  generateComparison(comparison: BenchmarkComparison, config: ReporterConfig = {}): string {
    const formats = Array.isArray(config.format) ? config.format : [config.format ?? 'table'];
    const reports: string[] = [];

    for (const format of formats) {
      let report: string;
      switch (format) {
        case 'json':
          report = this.comparisonToJSON(comparison, config);
          break;
        case 'table':
          report = this.comparisonToTable(comparison, config);
          break;
        case 'markdown':
          report = this.comparisonToMarkdown(comparison, config);
          break;
        default:
          report = this.comparisonToTable(comparison, config);
      }
      reports.push(report);
    }

    const combined = reports.join('\n\n---\n\n');

    if (config.outputFile) {
      fs.writeFileSync(config.outputFile, combined, 'utf-8');
    }

    return combined;
  }

  /**
   * JSON format
   */
  private toJSON(result: BenchmarkResult, config: ReporterConfig): string {
    const output: Record<string, unknown> = {
      name: result.name,
      description: result.description,
      startTime: result.startTime.toISOString(),
      endTime: result.endTime.toISOString(),
      totalDuration: result.totalDuration,
      statistics: result.statistics,
      memory: result.memory,
      customMetrics: result.customMetrics,
      tags: result.tags,
    };

    if (config.includeIterations) {
      output.iterations = result.iterations;
    }

    return JSON.stringify(output, null, 2);
  }

  /**
   * Table format (console-friendly)
   */
  private toTable(result: BenchmarkResult, config: ReporterConfig): string {
    const lines: string[] = [];
    const stats = result.statistics;

    lines.push('='.repeat(80));
    lines.push(`📊 BENCHMARK: ${result.name}`);
    if (result.description) {
      lines.push(`   ${result.description}`);
    }
    lines.push('='.repeat(80));
    lines.push('');

    // Statistics
    lines.push('Statistics:');
    lines.push(`  Iterations:     ${stats.count}`);
    lines.push(`  Success Rate:   ${(stats.successRate * 100).toFixed(1)}% (${stats.successCount}/${stats.count})`);
    if (stats.errorCount > 0) {
      lines.push(`  Errors:         ${stats.errorCount}`);
    }
    lines.push('');
    lines.push('Duration (ms):');
    lines.push(`  Min:            ${stats.min.toFixed(2)}`);
    lines.push(`  Max:            ${stats.max.toFixed(2)}`);
    lines.push(`  Average:        ${stats.avg.toFixed(2)}`);
    lines.push(`  Median:         ${stats.median.toFixed(2)}`);
    lines.push(`  P95:            ${stats.p95.toFixed(2)}`);
    lines.push(`  P99:            ${stats.p99.toFixed(2)}`);
    lines.push(`  Std Dev:        ${stats.stdDev.toFixed(2)}`);
    lines.push('');

    // Memory statistics
    if (config.includeMemory !== false && result.memory) {
      const mem = result.memory;
      lines.push('Memory (bytes):');
      lines.push(`  Initial:        ${this.formatBytes(mem.initial)}`);
      lines.push(`  Peak:           ${this.formatBytes(mem.peak)}`);
      lines.push(`  Final:          ${this.formatBytes(mem.final)}`);
      lines.push(`  Delta:          ${this.formatBytes(mem.delta)} (${mem.delta >= 0 ? '+' : ''}${((mem.delta / mem.initial) * 100).toFixed(2)}%)`);
      lines.push(`  Average:        ${this.formatBytes(mem.avg)}`);
      lines.push('');
    }

    // Custom metrics
    if (result.customMetrics && Object.keys(result.customMetrics).length > 0) {
      lines.push('Custom Metrics:');
      for (const [key, value] of Object.entries(result.customMetrics)) {
        lines.push(`  ${key}:         ${value}`);
      }
      lines.push('');
    }

    // Tags
    if (result.tags && result.tags.length > 0) {
      lines.push(`Tags: ${result.tags.join(', ')}`);
      lines.push('');
    }

    // Iterations (if requested)
    if (config.includeIterations && result.iterations.length > 0) {
      lines.push('Iterations:');
      lines.push('  #    Duration (ms)  Success  Memory Δ');
      lines.push('  ' + '-'.repeat(50));
      result.iterations.forEach((iter, idx) => {
        const memDelta = iter.memoryDelta !== undefined
          ? this.formatBytes(iter.memoryDelta)
          : 'N/A';
        const status = iter.success ? '✓' : '✗';
        lines.push(`  ${(idx + 1).toString().padStart(3)}  ${iter.duration.toFixed(2).padStart(12)}  ${status.padEnd(7)}  ${memDelta}`);
        if (iter.error) {
          lines.push(`       Error: ${iter.error}`);
        }
      });
      lines.push('');
    }

    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  /**
   * Markdown format
   */
  private toMarkdown(result: BenchmarkResult, config: ReporterConfig): string {
    const lines: string[] = [];
    const stats = result.statistics;

    lines.push(`# Benchmark: ${result.name}`);
    if (result.description) {
      lines.push(`\n${result.description}\n`);
    }

    lines.push('## Summary');
    lines.push('');
    lines.push(`- **Start Time**: ${result.startTime.toISOString()}`);
    lines.push(`- **End Time**: ${result.endTime.toISOString()}`);
    lines.push(`- **Total Duration**: ${result.totalDuration}ms`);
    lines.push(`- **Iterations**: ${stats.count}`);
    lines.push(`- **Success Rate**: ${(stats.successRate * 100).toFixed(1)}%`);
    lines.push('');

    lines.push('## Statistics');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Min | ${stats.min.toFixed(2)} ms |`);
    lines.push(`| Max | ${stats.max.toFixed(2)} ms |`);
    lines.push(`| Average | ${stats.avg.toFixed(2)} ms |`);
    lines.push(`| Median | ${stats.median.toFixed(2)} ms |`);
    lines.push(`| P95 | ${stats.p95.toFixed(2)} ms |`);
    lines.push(`| P99 | ${stats.p99.toFixed(2)} ms |`);
    lines.push(`| Std Dev | ${stats.stdDev.toFixed(2)} ms |`);
    lines.push('');

    if (config.includeMemory !== false && result.memory) {
      const mem = result.memory;
      lines.push('## Memory');
      lines.push('');
      lines.push('| Metric | Value |');
      lines.push('|--------|-------|');
      lines.push(`| Initial | ${this.formatBytes(mem.initial)} |`);
      lines.push(`| Peak | ${this.formatBytes(mem.peak)} |`);
      lines.push(`| Final | ${this.formatBytes(mem.final)} |`);
      lines.push(`| Delta | ${this.formatBytes(mem.delta)} |`);
      lines.push(`| Average | ${this.formatBytes(mem.avg)} |`);
      lines.push('');
    }

    if (result.customMetrics && Object.keys(result.customMetrics).length > 0) {
      lines.push('## Custom Metrics');
      lines.push('');
      lines.push('| Metric | Value |');
      lines.push('|--------|-------|');
      for (const [key, value] of Object.entries(result.customMetrics)) {
        lines.push(`| ${key} | ${value} |`);
      }
      lines.push('');
    }

    if (config.includeIterations && result.iterations.length > 0) {
      lines.push('## Iterations');
      lines.push('');
      lines.push('| # | Duration (ms) | Success | Memory Δ |');
      lines.push('|---|--------------|--------|---------|');
      result.iterations.forEach((iter, idx) => {
        const memDelta = iter.memoryDelta !== undefined
          ? this.formatBytes(iter.memoryDelta)
          : 'N/A';
        const status = iter.success ? '✓' : '✗';
        lines.push(`| ${idx + 1} | ${iter.duration.toFixed(2)} | ${status} | ${memDelta} |`);
      });
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * CSV format
   */
  private toCSV(result: BenchmarkResult, config: ReporterConfig): string {
    const lines: string[] = [];
    const stats = result.statistics;

    // Header
    lines.push('Metric,Value');
    lines.push(`Name,${result.name}`);
    if (result.description) {
      lines.push(`Description,${result.description}`);
    }
    lines.push(`Start Time,${result.startTime.toISOString()}`);
    lines.push(`End Time,${result.endTime.toISOString()}`);
    lines.push(`Total Duration,${result.totalDuration}`);
    lines.push(`Iterations,${stats.count}`);
    lines.push(`Success Rate,${(stats.successRate * 100).toFixed(1)}%`);
    lines.push(`Min,${stats.min.toFixed(2)}`);
    lines.push(`Max,${stats.max.toFixed(2)}`);
    lines.push(`Average,${stats.avg.toFixed(2)}`);
    lines.push(`Median,${stats.median.toFixed(2)}`);
    lines.push(`P95,${stats.p95.toFixed(2)}`);
    lines.push(`P99,${stats.p99.toFixed(2)}`);
    lines.push(`Std Dev,${stats.stdDev.toFixed(2)}`);

    if (config.includeMemory !== false && result.memory) {
      const mem = result.memory;
      lines.push(`Memory Initial,${mem.initial}`);
      lines.push(`Memory Peak,${mem.peak}`);
      lines.push(`Memory Final,${mem.final}`);
      lines.push(`Memory Delta,${mem.delta}`);
      lines.push(`Memory Average,${mem.avg}`);
    }

    if (result.customMetrics) {
      for (const [key, value] of Object.entries(result.customMetrics)) {
        lines.push(`${key},${value}`);
      }
    }

    if (config.includeIterations && result.iterations.length > 0) {
      lines.push('');
      lines.push('Iteration #,Duration (ms),Success,Memory Delta');
      result.iterations.forEach((iter, idx) => {
        const memDelta = iter.memoryDelta ?? '';
        lines.push(`${idx + 1},${iter.duration.toFixed(2)},${iter.success},${memDelta}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Comparison to table
   */
  private comparisonToTable(comparison: BenchmarkComparison, config: ReporterConfig): string {
    const lines: string[] = [];
    const { baseline, comparison: comp } = comparison;

    lines.push('='.repeat(80));
    lines.push('📊 BENCHMARK COMPARISON');
    lines.push('='.repeat(80));
    lines.push('');

    lines.push(`Baseline:   ${baseline.name}`);
    lines.push(`Comparison: ${comp.name}`);
    lines.push('');

    lines.push('Performance Comparison:');
    lines.push(`  Baseline Avg:   ${baseline.statistics.avg.toFixed(2)} ms`);
    lines.push(`  Comparison Avg: ${comp.statistics.avg.toFixed(2)} ms`);
    lines.push(`  Delta:          ${comparison.avgDurationDelta >= 0 ? '+' : ''}${comparison.avgDurationDelta.toFixed(2)} ms (${comparison.avgDurationDeltaPercent >= 0 ? '+' : ''}${comparison.avgDurationDeltaPercent.toFixed(2)}%)`);
    lines.push(`  Speedup:        ${comparison.isFaster ? '✓' : '✗'} ${comparison.speedup ? `${comparison.speedup.toFixed(2)}x` : 'N/A'}`);
    lines.push('');

    if (comparison.memoryDelta !== undefined) {
      lines.push('Memory Comparison:');
      lines.push(`  Baseline:   ${this.formatBytes(baseline.memory?.delta ?? 0)}`);
      lines.push(`  Comparison: ${this.formatBytes(comp.memory?.delta ?? 0)}`);
      lines.push(`  Delta:      ${this.formatBytes(comparison.memoryDelta)}`);
      lines.push('');
    }

    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  /**
   * Comparison to JSON
   */
  private comparisonToJSON(comparison: BenchmarkComparison, config: ReporterConfig): string {
    return JSON.stringify(comparison, null, 2);
  }

  /**
   * Comparison to markdown
   */
  private comparisonToMarkdown(comparison: BenchmarkComparison, config: ReporterConfig): string {
    const lines: string[] = [];
    const { baseline, comparison: comp } = comparison;

    lines.push('# Benchmark Comparison');
    lines.push('');
    lines.push(`**Baseline**: ${baseline.name}`);
    lines.push(`**Comparison**: ${comp.name}`);
    lines.push('');

    lines.push('## Performance');
    lines.push('');
    lines.push('| Metric | Baseline | Comparison | Delta |');
    lines.push('|--------|----------|------------|-------|');
    lines.push(`| Average | ${baseline.statistics.avg.toFixed(2)} ms | ${comp.statistics.avg.toFixed(2)} ms | ${comparison.avgDurationDelta >= 0 ? '+' : ''}${comparison.avgDurationDelta.toFixed(2)} ms (${comparison.avgDurationDeltaPercent >= 0 ? '+' : ''}${comparison.avgDurationDeltaPercent.toFixed(2)}%) |`);
    lines.push(`| Speedup | - | - | ${comparison.isFaster ? '✓' : '✗'} ${comparison.speedup ? `${comparison.speedup.toFixed(2)}x` : 'N/A'} |`);
    lines.push('');

    if (comparison.memoryDelta !== undefined) {
      lines.push('## Memory');
      lines.push('');
      lines.push('| Metric | Baseline | Comparison | Delta |');
      lines.push('|--------|----------|------------|-------|');
      lines.push(`| Delta | ${this.formatBytes(baseline.memory?.delta ?? 0)} | ${this.formatBytes(comp.memory?.delta ?? 0)} | ${this.formatBytes(comparison.memoryDelta)} |`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }
}

/**
 * Compare two benchmark results
 */
export function compareBenchmarks(
  baseline: BenchmarkResult,
  comparison: BenchmarkResult
): BenchmarkComparison {
  const avgDurationDelta = comparison.statistics.avg - baseline.statistics.avg;
  const avgDurationDeltaPercent = (avgDurationDelta / baseline.statistics.avg) * 100;
  const isFaster = avgDurationDelta < 0;
  const speedup = isFaster ? baseline.statistics.avg / comparison.statistics.avg : undefined;
  const memoryDelta = comparison.memory && baseline.memory
    ? comparison.memory.delta - baseline.memory.delta
    : undefined;

  return {
    baseline,
    comparison,
    avgDurationDelta,
    avgDurationDeltaPercent,
    memoryDelta,
    isFaster,
    speedup,
  };
}

