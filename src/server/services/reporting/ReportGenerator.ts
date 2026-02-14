/**
 * Report Generator - Main reporting orchestrator
 * 
 * Coordinates data aggregation, report formatting, and export.
 */

import type { IReportingService } from './interfaces/IReportingService.js';
import type { IDataAggregator } from './interfaces/IDataAggregator.js';
import type { IReportFormatter } from './interfaces/IReportFormatter.js';
import type { Report, ReportFormat, ReportMetadata } from './types/Report.js';
import type { ReportData } from './types/ReportData.js';
import type { AggregatedData } from './types/AggregatedData.js';
import type { ScoredDocument } from '../scoring/types/ScoredDocument.js';
import type { ExportDestination } from './exporters/IExporter.js';

// Aggregators
import { DocumentAggregator } from './aggregators/DocumentAggregator.js';
import { ScoreAggregator } from './aggregators/ScoreAggregator.js';
import { CategoryAggregator } from './aggregators/CategoryAggregator.js';

// Formatters
import { JsonReportFormatter } from './formatters/JsonReportFormatter.js';
import { MarkdownReportFormatter } from './formatters/MarkdownReportFormatter.js';
import { HtmlReportFormatter } from './formatters/HtmlReportFormatter.js';
import { PdfReportFormatter } from './formatters/PdfReportFormatter.js';

// Exporters
import { FileExporter } from './exporters/FileExporter.js';
import { ApiExporter } from './exporters/ApiExporter.js';

/**
 * Main report generator orchestrator
 * 
 * Coordinates data aggregation, report formatting, and export.
 */
export class ReportGenerator implements IReportingService {
  private aggregators: Map<string, IDataAggregator<ScoredDocument>> = new Map();
  private formatters: Map<ReportFormat, IReportFormatter> = new Map();
  private fileExporter: FileExporter;
  private apiExporter: ApiExporter;

  constructor() {
    // Register aggregators
    this.aggregators.set('document', new DocumentAggregator());
    this.aggregators.set('score', new ScoreAggregator());
    this.aggregators.set('category', new CategoryAggregator());

    // Register formatters
    this.formatters.set('json', new JsonReportFormatter());
    this.formatters.set('markdown', new MarkdownReportFormatter());
    this.formatters.set('html', new HtmlReportFormatter());
    this.formatters.set('pdf', new PdfReportFormatter());

    // Initialize exporters
    this.fileExporter = new FileExporter();
    this.apiExporter = new ApiExporter();
  }

  /**
   * Generate a report from data
   * 
   * @param data - Report data
   * @param format - Report format
   * @param metadata - Optional metadata for the report
   * @returns Generated report
   */
  async generateReport(data: ReportData, format: ReportFormat, metadata?: ReportMetadata): Promise<Report> {
    // Aggregate data
    const aggregated = await this.aggregateData(data);

    // Format report
    const formatter = this.formatters.get(format);
    if (!formatter) {
      throw new Error(`No formatter found for format: ${format}`);
    }

    const report = await formatter.format(aggregated, metadata);
    return report as Report;
  }

  /**
   * Aggregate documents for reporting
   * 
   * @param documents - Documents to aggregate
   * @returns Aggregated data
   */
  async aggregateDocuments(documents: ScoredDocument[]): Promise<AggregatedData> {
    const documentAggregator = this.aggregators.get('document') as DocumentAggregator;
    const scoreAggregator = this.aggregators.get('score') as ScoreAggregator;
    const categoryAggregator = this.aggregators.get('category') as CategoryAggregator;

    if (!documentAggregator || !scoreAggregator || !categoryAggregator) {
      throw new Error('Aggregators not properly initialized');
    }

    const [docSummary, scoreSummary, categorySummary] = await Promise.all([
      documentAggregator.aggregate(documents),
      scoreAggregator.aggregate(documents),
      categoryAggregator.aggregate(documents),
    ]);

    // Extract top categories from category summary
    const topCategories = categorySummary.topCategories.map((cat) => cat.category);

    return {
      summary: {
        totalDocuments: documents.length,
        averageScore: scoreSummary.average,
        topCategories,
      },
      documents: docSummary,
      scores: scoreSummary,
      categories: categorySummary,
      metadata: {},
    };
  }

  /**
   * Export a report to a destination
   * 
   * @param report - Report to export
   * @param destination - Export destination
   */
  async exportReport(report: Report, destination: ExportDestination): Promise<void> {
    if ('type' in destination && destination.type === 'file') {
      await this.fileExporter.export(report, destination);
    } else if ('url' in destination) {
      // ApiExportDestination has 'url' property
      await this.apiExporter.export(report, destination);
    } else {
      throw new Error(`Unsupported export destination type: ${JSON.stringify(destination)}`);
    }
  }

  /**
   * Aggregate data from ReportData
   * 
   * @param data - Report data
   * @returns Aggregated data
   */
  private async aggregateData(data: ReportData): Promise<AggregatedData> {
    if (data.documents && data.documents.length > 0) {
      // Use documents directly
      return this.aggregateDocuments(data.documents);
    } else if (data.scores && data.scores.length > 0) {
      // Convert scores to ScoredDocument format
      // Note: This is a simplified conversion - in practice, you'd need full document data
      throw new Error('Generating reports from scores only is not yet supported. Please provide full documents.');
    } else {
      throw new Error('No documents or scores provided in report data');
    }
  }
}
