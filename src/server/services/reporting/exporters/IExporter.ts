/**
 * Exporter Interface and Types
 * 
 * Defines the contract for report exporters and export destination types.
 */

import type { Report } from '../types/Report.js';
import type { ApiExportDestination } from './ApiExporter.js';
import type { FileExportDestination } from './FileExporter.js';

/**
 * Union type for all possible export destinations
 */
export type ExportDestination = FileExportDestination | ApiExportDestination;

/**
 * Interface for report exporters
 */
export interface IExporter {
  /**
   * Exports a generated report to a specified destination.
   *
   * @param report - The report to export.
   * @param destination - The destination for the report (e.g., file path, API endpoint).
   */
  export(report: Report, destination: ExportDestination): Promise<void>;

  /**
   * Get the type of destination this exporter handles.
   *
   * @returns The exporter type.
   */
  getType(): string;
}
