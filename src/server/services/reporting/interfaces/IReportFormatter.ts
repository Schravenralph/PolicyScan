/**
 * Report formatter interface
 * 
 * Defines the contract for formatting aggregated data into reports.
 */

import type { AggregatedData } from '../types/AggregatedData.js';
import type { Report, ReportFormat, ReportMetadata } from '../types/Report.js';

/**
 * Interface for report formatters
 */
export interface IReportFormatter {
  /**
   * Format aggregated data into a report
   * 
   * @param data - Aggregated data to format
   * @param metadata - Optional metadata for the report
   * @returns Formatted report
   */
  format(data: AggregatedData, metadata?: ReportMetadata): Promise<Report>;

  /**
   * Get the format this formatter produces
   * 
   * @returns Format identifier
   */
  getFormat(): ReportFormat;
}
