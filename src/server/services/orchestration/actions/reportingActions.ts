/**
 * Reporting Actions
 * 
 * Workflow actions for the reporting layer.
 * These actions coordinate report generation and export.
 */

import type { StepAction } from '../../../services/workflow/WorkflowActionRegistry.js';
import type { ReportGenerator } from '../../reporting/ReportGenerator.js';
import type { ScoredDocument } from '../../scoring/types/ScoredDocument.js';
import type { ReportData } from '../../reporting/types/ReportData.js';
import type { Report, ReportFormat, ReportMetadata } from '../../reporting/types/Report.js';
import type { ExportDestination } from '../../reporting/exporters/IExporter.js';
import { logger } from '../../../utils/logger.js';

/**
 * Create a report generation action
 * 
 * @param reportGenerator - Report generator instance
 * @returns Workflow action function
 */
export function createReportGenerationAction(
  reportGenerator: ReportGenerator
): StepAction {
  return async (params: Record<string, unknown>, runId: string) => {
    try {
      const documents = params.documents as ScoredDocument[] | undefined;
      const reportData = params.reportData as ReportData | undefined;
      const format = (params.format as ReportFormat) || 'json';
      const metadata = params.metadata as ReportMetadata | undefined;

      // Build report data from documents if not provided
      const data: ReportData = reportData || {
        documents: documents || [],
        metadata: metadata || {},
      };

      logger.debug({ format, documentCount: data.documents?.length || 0, runId }, '[ReportGenerationAction] Starting report generation');

      const report = await reportGenerator.generateReport(data, format, metadata);

      logger.debug({ format, reportId: report.id, runId }, '[ReportGenerationAction] Report generation completed');

      return {
        report,
      };
    } catch (error) {
      logger.error({ error, runId }, '[ReportGenerationAction] Report generation failed');
      throw error;
    }
  };
}

/**
 * Create a report aggregation action
 * 
 * @param reportGenerator - Report generator instance
 * @returns Workflow action function
 */
export function createReportAggregationAction(
  reportGenerator: ReportGenerator
): StepAction {
  return async (params: Record<string, unknown>, runId: string) => {
    try {
      const documents = params.documents as ScoredDocument[];
      if (!documents || !Array.isArray(documents)) {
        throw new Error('documents array is required for report aggregation action');
      }

      logger.debug({ documentCount: documents.length, runId }, '[ReportAggregationAction] Starting aggregation');

      const aggregated = await reportGenerator.aggregateDocuments(documents);

      logger.debug(
        { documentCount: documents.length, runId },
        '[ReportAggregationAction] Aggregation completed'
      );

      return {
        aggregatedData: aggregated,
      };
    } catch (error) {
      logger.error({ error, runId }, '[ReportAggregationAction] Aggregation failed');
      throw error;
    }
  };
}

/**
 * Create a report export action
 * 
 * @param reportGenerator - Report generator instance
 * @returns Workflow action function
 */
export function createReportExportAction(
  reportGenerator: ReportGenerator
): StepAction {
  return async (params: Record<string, unknown>, runId: string) => {
    try {
      const reportData = params.report as { id: string; format: string; content: string | Buffer; metadata: Record<string, unknown>; generatedAt: Date };
      if (!reportData) {
        throw new Error('report is required for report export action');
      }

      const destination = params.destination as ExportDestination;
      if (!destination) {
        throw new Error('destination is required for report export action');
      }

      // Convert to Report type
      const report: Report = {
        id: reportData.id,
        format: reportData.format as ReportFormat,
        content: reportData.content,
        metadata: reportData.metadata as ReportMetadata,
        generatedAt: reportData.generatedAt,
      };

      logger.debug({ reportId: report.id, destination, runId }, '[ReportExportAction] Starting export');

      await reportGenerator.exportReport(report, destination);

      logger.debug({ reportId: report.id, destination, runId }, '[ReportExportAction] Export completed');

      return {
        exported: true,
        destination,
      };
    } catch (error) {
      logger.error({ error, runId }, '[ReportExportAction] Export failed');
      throw error;
    }
  };
}
