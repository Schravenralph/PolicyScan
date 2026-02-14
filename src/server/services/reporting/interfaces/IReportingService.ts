/**
 * Main reporting service interface
 * 
 * Defines the contract for generating, aggregating, and exporting reports.
 */

import type { Report, ReportFormat, ReportMetadata } from '../types/Report.js';
import type { ReportData } from '../types/ReportData.js';
import type { AggregatedData } from '../types/AggregatedData.js';
import type { ScoredDocument } from '../../scoring/types/ScoredDocument.js';
import type { ExportDestination } from '../exporters/IExporter.js';

/**
 * Main interface for reporting service
 */
export interface IReportingService {
  /**
   * Generate a report from data
   * 
   * @param data - Report data
   * @param format - Report format (json, markdown, pdf, html, csv)
   * @param metadata - Optional metadata for the report
   * @returns Generated report
   */
  generateReport(data: ReportData, format: ReportFormat, metadata?: ReportMetadata): Promise<Report>;

  /**
   * Aggregate documents for reporting
   * 
   * @param documents - Documents to aggregate
   * @returns Aggregated data
   */
  aggregateDocuments(documents: ScoredDocument[]): Promise<AggregatedData>;

  /**
   * Export a report to a destination
   * 
   * @param report - Report to export
   * @param destination - Export destination
   */
  exportReport(report: Report, destination: ExportDestination): Promise<void>;
}
