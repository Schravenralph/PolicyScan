/**
 * File Exporter
 * 
 * Exports reports to files on the filesystem.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Report } from '../types/Report.js';
import type { IExporter, ExportDestination } from './IExporter.js';

/**
 * Export destination for file export
 */
export interface FileExportDestination {
  type: 'file';
  /** File path including filename and extension */
  path: string;
  /** Optional: base directory for exports, defaults to 'data/exports' */
  baseDir?: string;
}

/**
 * Exports reports to files
 */
export class FileExporter implements IExporter {
  /**
   * Get the type of destination this exporter handles
   * 
   * @returns The exporter type
   */
  getType(): string {
    return 'file';
  }

  /**
   * Export a report to a file
   * 
   * @param report - Report to export
   * @param destination - Export destination (can be FileExportDestination or string for backward compatibility)
   * @throws Error if file writing fails
   */
  async export(report: Report, destination: ExportDestination | string): Promise<void> {
    // Handle backward compatibility: accept string path directly
    const filePath = typeof destination === 'string' 
      ? destination 
      : ('type' in destination && destination.type === 'file')
        ? destination.path 
        : (() => { throw new Error('Invalid destination type for FileExporter'); })();
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Write report content to file
      if (Buffer.isBuffer(report.content)) {
        // Binary content (e.g., PDF)
        await fs.writeFile(filePath, report.content);
      } else {
        // String content (e.g., JSON, Markdown, HTML)
        await fs.writeFile(filePath, report.content, 'utf-8');
      }
    } catch (error) {
      throw new Error(
        `Failed to export report to file: ${filePath}. ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get the appropriate file extension for a report format
   * 
   * @param format - Report format
   * @returns File extension (without dot)
   */
  getExtension(format: Report['format']): string {
    const extensions: Record<Report['format'], string> = {
      json: 'json',
      markdown: 'md',
      pdf: 'pdf',
      html: 'html',
      csv: 'csv',
    };

    return extensions[format] || 'txt';
  }

  /**
   * Generate a filename for a report
   * 
   * @param report - Report to generate filename for
   * @param baseName - Optional base name (default: 'report')
   * @returns Generated filename
   */
  generateFilename(report: Report, baseName: string = 'report'): string {
    const extension = this.getExtension(report.format);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${baseName}_${timestamp}.${extension}`;
  }
}
