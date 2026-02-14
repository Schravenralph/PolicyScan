/**
 * HTML Report Formatter
 * 
 * Formats aggregated data as HTML.
 */

import { randomUUID } from 'crypto';
import type { IReportFormatter } from '../interfaces/IReportFormatter.js';
import type { Report, ReportFormat, ReportMetadata } from '../types/Report.js';
import type { AggregatedData } from '../types/AggregatedData.js';

/**
 * Formats aggregated data as HTML
 */
export class HtmlReportFormatter implements IReportFormatter {
  /**
   * Get the format this formatter produces
   * 
   * @returns Format identifier
   */
  getFormat(): ReportFormat {
    return 'html';
  }

  /**
   * Format aggregated data into an HTML report
   * 
   * @param data - Aggregated data to format
   * @param metadata - Optional metadata for the report
   * @returns HTML report
   */
  async format(data: AggregatedData, metadata?: ReportMetadata): Promise<Report> {
    const html = this.generateHtml(data, metadata);

    return {
      id: randomUUID(),
      format: 'html',
      content: html,
      metadata: {
        title: metadata?.title || 'Document Report',
        format: 'html',
        generatedAt: new Date().toISOString(),
        ...metadata,
      },
      generatedAt: new Date(),
    };
  }

  /**
   * Generate HTML content from aggregated data
   * 
   * @param data - Aggregated data
   * @param metadata - Optional metadata for the report
   * @returns HTML string
   */
  private generateHtml(data: AggregatedData, metadata?: ReportMetadata): string {
    const html: string[] = [];

    html.push('<!DOCTYPE html>');
    html.push('<html lang="en">');
    html.push('<head>');
    html.push('<meta charset="UTF-8">');
    html.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
    html.push(`<title>${this.escapeHtml(metadata?.title || 'Document Report')}</title>`);
    html.push('<style>');
    html.push('body { font-family: Arial, sans-serif; margin: 20px; }');
    html.push('h1 { color: #333; }');
    html.push('h2 { color: #666; margin-top: 30px; }');
    html.push('h3 { color: #888; margin-top: 20px; }');
    html.push('table { border-collapse: collapse; width: 100%; margin: 10px 0; }');
    html.push('th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }');
    html.push('th { background-color: #f2f2f2; font-weight: bold; }');
    html.push('tr:nth-child(even) { background-color: #f9f9f9; }');
    html.push('</style>');
    html.push('</head>');
    html.push('<body>');

    // Header
    html.push(`<h1>${this.escapeHtml(metadata?.title || 'Document Report')}</h1>`);
    html.push(`<p><em>Generated: ${new Date().toISOString()}</em></p>`);

    // Summary section
    html.push('<h2>Summary</h2>');
    html.push('<table>');
    html.push('<tr><th>Metric</th><th>Value</th></tr>');
    html.push(`<tr><td>Total Documents</td><td>${data.summary.totalDocuments}</td></tr>`);
    html.push(`<tr><td>Average Score</td><td>${data.summary.averageScore.toFixed(3)}</td></tr>`);
    html.push(`<tr><td>Top Categories</td><td>${data.summary.topCategories.join(', ')}</td></tr>`);
    if (data.summary.dateRange) {
      html.push(`<tr><td>Date Range</td><td>${data.summary.dateRange.start.toISOString()} - ${data.summary.dateRange.end.toISOString()}</td></tr>`);
    }
    html.push('</table>');

    // Documents section
    html.push('<h2>Documents</h2>');
    html.push(`<p><strong>Total:</strong> ${data.documents.total}</p>`);

    // Documents by type
    if (Object.keys(data.documents.byType).length > 0) {
      html.push('<h3>By Type</h3>');
      html.push('<table>');
      html.push('<tr><th>Type</th><th>Count</th></tr>');
      for (const [type, count] of Object.entries(data.documents.byType)) {
        html.push(`<tr><td>${this.escapeHtml(type)}</td><td>${count}</td></tr>`);
      }
      html.push('</table>');
    }

    // Documents by source
    if (Object.keys(data.documents.bySource).length > 0) {
      html.push('<h3>By Source</h3>');
      html.push('<table>');
      html.push('<tr><th>Source</th><th>Count</th></tr>');
      for (const [source, count] of Object.entries(data.documents.bySource)) {
        html.push(`<tr><td>${this.escapeHtml(source)}</td><td>${count}</td></tr>`);
      }
      html.push('</table>');
    }

    // Top documents
    if (data.documents.topDocuments.length > 0) {
      html.push('<h3>Top Documents</h3>');
      html.push('<table>');
      html.push('<tr><th>Title</th><th>Score</th></tr>');
      for (const doc of data.documents.topDocuments.slice(0, 10)) {
        html.push(`<tr><td>${this.escapeHtml(doc.title)}</td><td>${doc.score.toFixed(3)}</td></tr>`);
      }
      html.push('</table>');
    }

    // Scores section
    html.push('<h2>Scores</h2>');
    html.push('<table>');
    html.push('<tr><th>Metric</th><th>Value</th></tr>');
    html.push(`<tr><td>Average</td><td>${data.scores.average.toFixed(3)}</td></tr>`);
    html.push(`<tr><td>Minimum</td><td>${data.scores.min.toFixed(3)}</td></tr>`);
    html.push(`<tr><td>Maximum</td><td>${data.scores.max.toFixed(3)}</td></tr>`);
    html.push('</table>');

    // Score distribution
    if (data.scores.distribution.length > 0) {
      html.push('<h3>Distribution</h3>');
      html.push('<table>');
      html.push('<tr><th>Range</th><th>Count</th></tr>');
      for (const dist of data.scores.distribution) {
        html.push(`<tr><td>${dist.range}</td><td>${dist.count}</td></tr>`);
      }
      html.push('</table>');
    }

    // Categories section
    html.push('<h2>Categories</h2>');
    html.push(`<p><strong>Total Categories:</strong> ${data.categories.totalCategories}</p>`);

    // Top categories
    if (data.categories.topCategories.length > 0) {
      html.push('<h3>Top Categories</h3>');
      html.push('<table>');
      html.push('<tr><th>Category</th><th>Count</th><th>Percentage</th></tr>');
      for (const cat of data.categories.topCategories) {
        html.push(`<tr><td>${this.escapeHtml(cat.category)}</td><td>${cat.count}</td><td>${cat.percentage.toFixed(1)}%</td></tr>`);
      }
      html.push('</table>');
    }

    // Category distribution
    if (Object.keys(data.categories.distribution).length > 0) {
      html.push('<h3>Distribution</h3>');
      html.push('<table>');
      html.push('<tr><th>Category</th><th>Count</th></tr>');
      for (const [category, count] of Object.entries(data.categories.distribution)) {
        html.push(`<tr><td>${this.escapeHtml(category)}</td><td>${count}</td></tr>`);
      }
      html.push('</table>');
    }

    html.push('</body>');
    html.push('</html>');

    return html.join('\n');
  }

  /**
   * Escape HTML special characters
   * 
   * @param text - Text to escape
   * @returns Escaped text
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
