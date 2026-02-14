/**
 * Sustainability Report Generator
 * 
 * Generates sustainability reports in multiple formats (JSON, CSV, PDF).
 * 
 * Note: This is a domain-specific report generator for sustainability metrics.
 * It works with SustainabilityMetrics and KPIs, not ScoredDocuments.
 * For document-based reporting, see the reporting layer in services/reporting/.
 * 
 * @see {@link ../../reporting/ReportGenerator} - Main report generator for ScoredDocuments
 */

import { sustainabilityMetricsService, type SustainabilityMetrics, type SustainabilityKPI } from './SustainabilityMetricsService.js';
import { logger } from '../../utils/logger.js';

export interface ReportOptions {
  format: 'json' | 'csv' | 'pdf';
  startDate: Date;
  endDate: Date;
  includeBaseline?: boolean;
  baselineStartDate?: Date;
  baselineEndDate?: Date;
  title?: string;
}

export class ReportGenerator {
  /**
   * Generate a sustainability report
   */
  async generateReport(options: ReportOptions): Promise<Buffer | string> {
    const { format, startDate, endDate, includeBaseline, baselineStartDate, baselineEndDate } = options;

    // Get metrics
    const metrics = await sustainabilityMetricsService.getMetrics(startDate, endDate);
    const kpis = await sustainabilityMetricsService.getKPIs(
      startDate,
      endDate,
      baselineStartDate,
      baselineEndDate
    );

    switch (format) {
      case 'json':
        return this.generateJSONReport(metrics, kpis, options);
      case 'csv':
        return this.generateCSVReport(metrics, kpis, options);
      case 'pdf':
        return this.generatePDFReport(metrics, kpis, options);
      default:
        throw new Error(`Unsupported report format: ${format}`);
    }
  }

  /**
   * Generate JSON report
   */
  private async generateJSONReport(
    metrics: SustainabilityMetrics,
    kpis: SustainabilityKPI[],
    options: ReportOptions
  ): Promise<string> {
    const report: {
      title: string;
      period: { startDate: string; endDate: string };
      generatedAt: string;
      metrics: typeof metrics;
      kpis: typeof kpis;
      baselineComparison?: unknown;
    } = {
      title: options.title || 'Sustainability Report',
      period: {
        startDate: metrics.startDate.toISOString(),
        endDate: metrics.endDate.toISOString(),
      },
      generatedAt: new Date().toISOString(),
      metrics,
      kpis,
    };

    if (options.includeBaseline && options.baselineStartDate && options.baselineEndDate) {
      const baselineComparison = await sustainabilityMetricsService.compareWithBaseline(
        metrics.startDate,
        metrics.endDate,
        options.baselineStartDate,
        options.baselineEndDate
      );
      report.baselineComparison = baselineComparison;
    }

    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate CSV report
   */
  private async generateCSVReport(
    metrics: SustainabilityMetrics,
    kpis: SustainabilityKPI[],
    options: ReportOptions
  ): Promise<string> {
    const lines: string[] = [];

    // Header
    lines.push('Sustainability Report');
    lines.push(`Period: ${metrics.startDate.toISOString().split('T')[0]} to ${metrics.endDate.toISOString().split('T')[0]}`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    // Metrics section
    lines.push('Metrics');
    lines.push('Metric,Value,Unit');
    lines.push(`API Calls Avoided,${metrics.apiCallsAvoided},calls`);
    lines.push(`CO2 Savings,${metrics.co2Savings.toFixed(4)},kg CO2`);
    lines.push(`Energy Cost Savings,${metrics.energyCostSavings.toFixed(2)},USD`);
    lines.push(`Cache Hit Rate,${(metrics.cacheHitRate * 100).toFixed(2)},%`);
    lines.push(`Cache Hits,${metrics.cacheHits},calls`);
    lines.push(`Cache Misses,${metrics.cacheMisses},calls`);
    lines.push(`Total Cache Requests,${metrics.totalCacheRequests},calls`);
    lines.push(`Cost Savings,${metrics.costSavings.toFixed(2)},USD`);
    lines.push(`Total API Calls,${metrics.totalAPICalls},calls`);
    lines.push(`Total Tokens,${metrics.totalTokens},tokens`);
    lines.push(`Total CO2 Emitted,${metrics.totalCO2Emitted.toFixed(4)},kg CO2`);
    lines.push(`Total Cost,${metrics.totalCost.toFixed(2)},USD`);
    lines.push('');

    // KPIs section
    lines.push('Key Performance Indicators');
    lines.push('KPI,Value,Unit,Target,Trend,Description');
    for (const kpi of kpis) {
      lines.push(
        `${kpi.name},${kpi.value.toFixed(2)},${kpi.unit},${kpi.target?.toFixed(2) || 'N/A'},${kpi.trend || 'N/A'},${kpi.description}`
      );
    }

    if (options.includeBaseline && options.baselineStartDate && options.baselineEndDate) {
      lines.push('');
      lines.push('Baseline Comparison');
      const baselineComparison = await sustainabilityMetricsService.compareWithBaseline(
        metrics.startDate,
        metrics.endDate,
        options.baselineStartDate,
        options.baselineEndDate
      );
      lines.push(`Baseline Period,${baselineComparison.period}`);
      lines.push(`CO2 Savings Improvement,${baselineComparison.improvement.co2SavingsIncrease.toFixed(2)},%`);
      lines.push(`Cost Savings Improvement,${baselineComparison.improvement.costSavingsIncrease.toFixed(2)},%`);
      lines.push(`Cache Hit Rate Improvement,${baselineComparison.improvement.cacheHitRateIncrease.toFixed(2)},%`);
    }

    return lines.join('\n');
  }

  /**
   * Generate PDF report using pdfkit
   */
  private async generatePDFReport(
    metrics: SustainabilityMetrics,
    kpis: SustainabilityKPI[],
    options: ReportOptions
  ): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ margin: 50 });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    // Title
    doc.fontSize(20).text(options.title || 'Sustainability Report', { align: 'center' });
    doc.moveDown();

    // Period
    doc.fontSize(12).text(
      `Period: ${metrics.startDate.toISOString().split('T')[0]} to ${metrics.endDate.toISOString().split('T')[0]}`,
      { align: 'center' }
    );
    doc.text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
    doc.moveDown(2);

    // Metrics section
    doc.fontSize(16).text('Metrics', { underline: true });
    doc.moveDown();
    doc.fontSize(11);

    const metricsData = [
      ['API Calls Avoided', `${metrics.apiCallsAvoided} calls`],
      ['CO2 Savings', `${metrics.co2Savings.toFixed(4)} kg CO2`],
      ['Energy Cost Savings', `$${metrics.energyCostSavings.toFixed(2)}`],
      ['Cache Hit Rate', `${(metrics.cacheHitRate * 100).toFixed(2)}%`],
      ['Cache Hits', `${metrics.cacheHits} calls`],
      ['Cache Misses', `${metrics.cacheMisses} calls`],
      ['Total Cache Requests', `${metrics.totalCacheRequests} calls`],
      ['Cost Savings', `$${metrics.costSavings.toFixed(2)}`],
      ['Total API Calls', `${metrics.totalAPICalls} calls`],
      ['Total Tokens', `${metrics.totalTokens.toLocaleString()} tokens`],
      ['Total CO2 Emitted', `${metrics.totalCO2Emitted.toFixed(4)} kg CO2`],
      ['Total Cost', `$${metrics.totalCost.toFixed(2)}`],
    ];

    for (const [label, value] of metricsData) {
      doc.text(`${label}: ${value}`);
    }

    doc.moveDown(2);

    // KPIs section
    doc.fontSize(16).text('Key Performance Indicators', { underline: true });
    doc.moveDown();
    doc.fontSize(11);

    for (const kpi of kpis) {
      const targetText = kpi.target ? ` (Target: ${kpi.target}${kpi.unit})` : '';
      const trendText = kpi.trend ? ` [${kpi.trend}]` : '';
      doc.text(`${kpi.name}: ${kpi.value.toFixed(2)} ${kpi.unit}${targetText}${trendText}`);
      doc.fontSize(9).text(`  ${kpi.description}`, { indent: 20 });
      doc.fontSize(11);
      doc.moveDown(0.5);
    }

    // Baseline comparison if available
    if (options.includeBaseline && options.baselineStartDate && options.baselineEndDate) {
      doc.moveDown();
      doc.fontSize(16).text('Baseline Comparison', { underline: true });
      doc.moveDown();
      doc.fontSize(11);

      const baselineComparison = await sustainabilityMetricsService.compareWithBaseline(
        metrics.startDate,
        metrics.endDate,
        options.baselineStartDate,
        options.baselineEndDate
      );

      doc.text(`Baseline Period: ${baselineComparison.period}`);
      doc.text(
        `CO2 Savings Improvement: ${baselineComparison.improvement.co2SavingsIncrease.toFixed(2)}%`
      );
      doc.text(
        `Cost Savings Improvement: ${baselineComparison.improvement.costSavingsIncrease.toFixed(2)}%`
      );
      doc.text(
        `Cache Hit Rate Improvement: ${baselineComparison.improvement.cacheHitRateIncrease.toFixed(2)}%`
      );
    }

    doc.end();

    // Wait for PDF to be generated
    return new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }

  /**
   * Generate monthly report
   */
  async generateMonthlyReport(year: number, month: number, format: 'json' | 'csv' | 'pdf' = 'json'): Promise<Buffer | string> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return this.generateReport({
      format,
      startDate,
      endDate,
      title: `Sustainability Report - ${year}-${month.toString().padStart(2, '0')}`,
    });
  }

  /**
   * Generate quarterly report
   */
  async generateQuarterlyReport(
    year: number,
    quarter: 1 | 2 | 3 | 4,
    format: 'json' | 'csv' | 'pdf' = 'json'
  ): Promise<Buffer | string> {
    const startMonth = (quarter - 1) * 3 + 1;
    const startDate = new Date(year, startMonth - 1, 1);
    const endMonth = startMonth + 2;
    const endDate = new Date(year, endMonth, 0, 23, 59, 59, 999);

    return this.generateReport({
      format,
      startDate,
      endDate,
      title: `Sustainability Report - Q${quarter} ${year}`,
    });
  }
}

// Singleton instance
export const reportGenerator = new ReportGenerator();

