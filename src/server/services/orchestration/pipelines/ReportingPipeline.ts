/**
 * Reporting Pipeline
 * 
 * Coordinates report generation from scored documents.
 * This pipeline:
 * 1. Aggregates documents for reporting
 * 2. Generates reports in specified format
 * 3. Optionally exports reports to destinations
 */

import type { IPipeline } from '../interfaces/IPipeline.js';
import type { PipelineInput } from '../types/PipelineInput.js';
import type { PipelineResult } from '../types/PipelineResult.js';
import type { ReportGenerator } from '../../reporting/ReportGenerator.js';
import type { ScoredDocument } from '../../scoring/types/ScoredDocument.js';
import type { ReportFormat } from '../../reporting/types/Report.js';
import type { ReportMetadata } from '../../reporting/types/Report.js';
import type { ReportData } from '../../reporting/types/ReportData.js';
import type { ExportDestination } from '../../reporting/exporters/IExporter.js';
import { logger } from '../../../utils/logger.js';

/**
 * Configuration for ReportingPipeline
 */
export interface ReportingPipelineConfig {
  /** Default report format (default: 'json') */
  defaultFormat?: ReportFormat;
  /** Whether to automatically export reports (default: false) */
  autoExport?: boolean;
  /** Default export destination (if autoExport is true) */
  defaultExportDestination?: ExportDestination;
}

/**
 * Reporting Pipeline
 * 
 * Coordinates document aggregation and report generation.
 *
 * Returns Report in the report field (documents field is not used for reporting pipeline).
 */
export class ReportingPipeline implements IPipeline<PipelineInput, never> {
  private defaultFormat: ReportFormat;
  private autoExport: boolean;
  private defaultExportDestination?: ExportDestination;

  constructor(
    private reportGenerator: ReportGenerator,
    config: ReportingPipelineConfig = {}
  ) {
    this.defaultFormat = config.defaultFormat || 'json';
    this.autoExport = config.autoExport || false;
    this.defaultExportDestination = config.defaultExportDestination;
  }

  /**
   * Get the name of this pipeline
   *
   * @returns Pipeline name
   */
  getName(): string {
    return 'reporting';
  }

  /**
   * Execute the reporting pipeline
   *
   * @param input - Pipeline input
   * @returns Pipeline result with generated report
   */
  async execute(input: PipelineInput): Promise<PipelineResult<never>> {
    const startTime = Date.now();
    const errors: Array<{ message: string; stack?: string; timestamp: Date }> = [];

    // Extract documents from input
    // Documents can come from:
    // 1. input.documents (direct ScoredDocument[])
    // 2. input.metadata.documents (from AnalysisPipeline)
    let documents: ScoredDocument[] = [];

    if (input.documents && Array.isArray(input.documents)) {
      documents = input.documents as ScoredDocument[];
    } else {
      const metadata = input.metadata;
      if (metadata && typeof metadata === 'object' && 'documents' in metadata) {
        const docs = metadata.documents;
        if (Array.isArray(docs)) {
          documents = docs as ScoredDocument[];
        }
      }
    }

    if (documents.length === 0) {
      logger.warn('[ReportingPipeline] No documents provided for reporting');
      return {
        success: false,
        report: undefined,
        metadata: {
          pipelineName: this.getName(),
          startedAt: new Date(startTime),
          completedAt: new Date(),
          duration: Date.now() - startTime,
          documentsProcessed: 0,
        },
        errors: [
          {
            message: 'No documents provided for reporting',
            timestamp: new Date(),
          },
        ],
      };
    }

    // Determine report format
    const format = (input.options?.reportFormat as ReportFormat) || 
                   (input.options?.format as ReportFormat) || 
                   this.defaultFormat;

    // Extract report metadata
    const reportMetadata: ReportMetadata = {
      title: input.options?.reportTitle as string,
      description: input.options?.reportDescription as string,
      author: input.options?.reportAuthor as string,
      version: input.options?.reportVersion as string,
      ...(input.options?.reportMetadata as Record<string, unknown> || {}),
    };

    logger.debug(
      { documentCount: documents.length, format, autoExport: this.autoExport },
      '[ReportingPipeline] Starting report generation'
    );

    // Aggregate documents
    let aggregated;
    try {
      logger.debug({ documentCount: documents.length }, '[ReportingPipeline] Starting aggregation');

      aggregated = await this.reportGenerator.aggregateDocuments(documents);

      logger.debug(
        {
          totalDocuments: aggregated.summary.totalDocuments,
          averageScore: aggregated.summary.averageScore,
          topCategories: aggregated.summary.topCategories,
        },
        '[ReportingPipeline] Aggregation completed'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      errors.push({
        message: `Failed to aggregate documents: ${errorMessage}`,
        stack: errorStack,
        timestamp: new Date(),
      });
      logger.error({ error }, '[ReportingPipeline] Failed to aggregate documents');
      // If aggregation fails, we can still try to generate a basic report
    }

    // Generate report
    let report;
    try {
      logger.debug({ format, documentCount: documents.length }, '[ReportingPipeline] Starting report generation');

      const reportData: ReportData = {
        documents,
        metadata: {
          ...(input.metadata || {}),
          aggregated: aggregated ? {
            summary: aggregated.summary,
            scores: aggregated.scores,
            categories: aggregated.categories,
          } : undefined,
        },
      };

      report = await this.reportGenerator.generateReport(reportData, format, reportMetadata);

      logger.debug(
        { format, reportId: report.id, contentLength: report.content.length },
        '[ReportingPipeline] Report generation completed'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      errors.push({
        message: `Failed to generate report: ${errorMessage}`,
        stack: errorStack,
        timestamp: new Date(),
      });
      logger.error({ error }, '[ReportingPipeline] Failed to generate report');
      // If report generation fails, we can't continue
      return {
        success: false,
        report: undefined,
        metadata: {
          pipelineName: this.getName(),
          startedAt: new Date(startTime),
          completedAt: new Date(),
          duration: Date.now() - startTime,
          documentsProcessed: documents.length,
          format,
        },
        errors,
      };
    }

    // Optionally export report
    let exported = false;
    let exportDestination: ExportDestination | undefined;
    if (this.autoExport && this.defaultExportDestination) {
      try {
        logger.debug(
          { reportId: report.id, destination: this.defaultExportDestination },
          '[ReportingPipeline] Starting report export'
        );

        await this.reportGenerator.exportReport(report, this.defaultExportDestination);
        exported = true;
        exportDestination = this.defaultExportDestination;

        logger.debug(
          { reportId: report.id, destination: this.defaultExportDestination },
          '[ReportingPipeline] Report export completed'
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        errors.push({
          message: `Failed to export report: ${errorMessage}`,
          stack: errorStack,
          timestamp: new Date(),
        });
        logger.error({ error }, '[ReportingPipeline] Failed to export report');
        // Export failure doesn't fail the pipeline, just logs the error
      }
    }

    // Also check if export destination is provided in input
    const inputExportDestination = input.options?.exportDestination as ExportDestination | undefined;
    if (inputExportDestination && !exported) {
      try {
        logger.debug(
          { reportId: report.id, destination: inputExportDestination },
          '[ReportingPipeline] Starting report export from input'
        );

        await this.reportGenerator.exportReport(report, inputExportDestination);
        exported = true;
        exportDestination = inputExportDestination;

        logger.debug(
          { reportId: report.id, destination: inputExportDestination },
          '[ReportingPipeline] Report export from input completed'
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        errors.push({
          message: `Failed to export report from input: ${errorMessage}`,
          stack: errorStack,
          timestamp: new Date(),
        });
        logger.error({ error }, '[ReportingPipeline] Failed to export report from input');
      }
    }

    const completedAt = Date.now();
    const duration = completedAt - startTime;

    // Build result - reporting pipeline returns Report in report field
    const result: PipelineResult<never> = {
      success: errors.length === 0 || report !== undefined,
      report, // ✅ Report is returned in report field
      metadata: {
        pipelineName: this.getName(),
        startedAt: new Date(startTime),
        completedAt: new Date(completedAt),
        duration,
        documentsProcessed: documents.length,
        format,
        totalDocuments: documents.length,
        averageScore: aggregated?.summary.averageScore,
        topCategories: aggregated?.summary.topCategories,
        exported,
        exportDestination: exportDestination ? {
          type: ('type' in exportDestination && exportDestination.type === 'file') ? 'file' : 'api',
          // Don't include sensitive information like file paths or API keys
        } : undefined,
      },
      errors: errors.length > 0 ? errors : undefined,
    };

    logger.debug(
      {
        success: result.success,
        reportId: report.id,
        format,
        exported,
        errorCount: errors.length,
        duration,
      },
      '[ReportingPipeline] Reporting completed'
    );

    return result;
  }
}
