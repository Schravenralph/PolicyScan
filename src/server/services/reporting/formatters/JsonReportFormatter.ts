/**
 * JSON Report Formatter
 * 
 * Formats aggregated data as JSON.
 */

import { randomUUID } from 'crypto';
import type { IReportFormatter } from '../interfaces/IReportFormatter.js';
import type { Report, ReportFormat, ReportMetadata } from '../types/Report.js';
import type { AggregatedData } from '../types/AggregatedData.js';

/**
 * Formats aggregated data as JSON
 */
export class JsonReportFormatter implements IReportFormatter {
  /**
   * Get the format this formatter produces
   * 
   * @returns Format identifier
   */
  getFormat(): ReportFormat {
    return 'json';
  }

  /**
   * Format aggregated data into a JSON report
   * 
   * @param data - Aggregated data to format
   * @param metadata - Optional metadata for the report
   * @returns JSON report
   */
  async format(data: AggregatedData, metadata?: ReportMetadata): Promise<Report> {
    const content = JSON.stringify(data, null, 2);

    return {
      id: randomUUID(),
      format: 'json',
      content,
      metadata: {
        title: metadata?.title || 'Document Report',
        format: 'json',
        generatedAt: new Date().toISOString(),
        ...metadata,
      },
      generatedAt: new Date(),
    };
  }
}
