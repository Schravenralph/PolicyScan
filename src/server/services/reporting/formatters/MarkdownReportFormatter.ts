/**
 * Markdown Report Formatter
 * 
 * Formats aggregated data as Markdown.
 */

import { randomUUID } from 'crypto';
import type { IReportFormatter } from '../interfaces/IReportFormatter.js';
import type { Report, ReportFormat, ReportMetadata } from '../types/Report.js';
import type { AggregatedData } from '../types/AggregatedData.js';

/**
 * Formats aggregated data as Markdown
 */
export class MarkdownReportFormatter implements IReportFormatter {
  /**
   * Get the format this formatter produces
   * 
   * @returns Format identifier
   */
  getFormat(): ReportFormat {
    return 'markdown';
  }

  /**
   * Format aggregated data into a Markdown report
   * 
   * @param data - Aggregated data to format
   * @param metadata - Optional metadata for the report
   * @returns Markdown report
   */
  async format(data: AggregatedData, metadata?: ReportMetadata): Promise<Report> {
    const markdown = this.generateMarkdown(data, metadata);

    return {
      id: randomUUID(),
      format: 'markdown',
      content: markdown,
      metadata: {
        title: metadata?.title || 'Document Report',
        format: 'markdown',
        generatedAt: new Date().toISOString(),
        ...metadata,
      },
      generatedAt: new Date(),
    };
  }

  /**
   * Generate Markdown content from aggregated data
   * 
   * @param data - Aggregated data
   * @returns Markdown string
   */
  private generateMarkdown(data: AggregatedData, metadata?: ReportMetadata): string {
    const lines: string[] = [];

    // Header
    lines.push(`# ${metadata?.title || 'Document Report'}`);
    lines.push('');
    lines.push(`> Generated: ${new Date().toISOString()}`);
    lines.push('');

    // Summary section
    lines.push('## Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total Documents | ${data.summary.totalDocuments} |`);
    lines.push(`| Average Score | ${data.summary.averageScore.toFixed(3)} |`);
    lines.push(`| Top Categories | ${data.summary.topCategories.join(', ')} |`);
    if (data.summary.dateRange) {
      lines.push(`| Date Range | ${data.summary.dateRange.start.toISOString()} - ${data.summary.dateRange.end.toISOString()} |`);
    }
    lines.push('');

    // Documents section
    lines.push('## Documents');
    lines.push('');
    lines.push(`**Total:** ${data.documents.total}`);
    lines.push('');

    // Documents by type
    if (Object.keys(data.documents.byType).length > 0) {
      lines.push('### By Type');
      lines.push('');
      lines.push('| Type | Count |');
      lines.push('|------|-------|');
      for (const [type, count] of Object.entries(data.documents.byType)) {
        lines.push(`| ${type} | ${count} |`);
      }
      lines.push('');
    }

    // Documents by source
    if (Object.keys(data.documents.bySource).length > 0) {
      lines.push('### By Source');
      lines.push('');
      lines.push('| Source | Count |');
      lines.push('|--------|-------|');
      for (const [source, count] of Object.entries(data.documents.bySource)) {
        lines.push(`| ${source} | ${count} |`);
      }
      lines.push('');
    }

    // Top documents
    if (data.documents.topDocuments.length > 0) {
      lines.push('### Top Documents');
      lines.push('');
      lines.push('| Title | Score |');
      lines.push('|-------|-------|');
      for (const doc of data.documents.topDocuments.slice(0, 10)) {
        lines.push(`| ${doc.title} | ${doc.score.toFixed(3)} |`);
      }
      lines.push('');
    }

    // Scores section
    lines.push('## Scores');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Average | ${data.scores.average.toFixed(3)} |`);
    lines.push(`| Minimum | ${data.scores.min.toFixed(3)} |`);
    lines.push(`| Maximum | ${data.scores.max.toFixed(3)} |`);
    lines.push('');

    // Score distribution
    if (data.scores.distribution.length > 0) {
      lines.push('### Distribution');
      lines.push('');
      lines.push('| Range | Count |');
      lines.push('|-------|-------|');
      for (const dist of data.scores.distribution) {
        lines.push(`| ${dist.range} | ${dist.count} |`);
      }
      lines.push('');
    }

    // Categories section
    lines.push('## Categories');
    lines.push('');
    lines.push(`**Total Categories:** ${data.categories.totalCategories}`);
    lines.push('');

    // Top categories
    if (data.categories.topCategories.length > 0) {
      lines.push('### Top Categories');
      lines.push('');
      lines.push('| Category | Count | Percentage |');
      lines.push('|----------|-------|------------|');
      for (const cat of data.categories.topCategories) {
        lines.push(`| ${cat.category} | ${cat.count} | ${cat.percentage.toFixed(1)}% |`);
      }
      lines.push('');
    }

    // Category distribution
    if (Object.keys(data.categories.distribution).length > 0) {
      lines.push('### Distribution');
      lines.push('');
      lines.push('| Category | Count |');
      lines.push('|----------|-------|');
      for (const [category, count] of Object.entries(data.categories.distribution)) {
        lines.push(`| ${category} | ${count} |`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
