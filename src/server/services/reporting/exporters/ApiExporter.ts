/**
 * API Exporter
 * 
 * Exports reports to API endpoints via HTTP.
 */

import type { Report } from '../types/Report.js';

/**
 * Export destination for API export
 */
export interface ApiExportDestination {
  /** API endpoint URL */
  url: string;
  /** HTTP method (default: POST) */
  method?: 'POST' | 'PUT' | 'PATCH';
  /** Additional headers */
  headers?: Record<string, string>;
  /** Authentication token (optional) */
  authToken?: string;
}

/**
 * Exports reports to API endpoints
 */
export class ApiExporter {
  /**
   * Export a report to an API endpoint
   * 
   * @param report - Report to export
   * @param destination - API export destination
   * @throws Error if API call fails
   */
  async export(report: Report, destination: ApiExportDestination): Promise<void> {
    try {
      const apiDest = destination as ApiExportDestination;
      const method = apiDest.method || 'POST';
      const headers: Record<string, string> = {
        'Content-Type': this.getContentType(report.format),
        ...apiDest.headers,
      };

      // Add authentication if provided
      if (apiDest.authToken) {
        headers['Authorization'] = `Bearer ${apiDest.authToken}`;
      }

      // Prepare body
      // fetch accepts string, Buffer, or ArrayBuffer
      let body: string | Buffer | ArrayBuffer;
      if (Buffer.isBuffer(report.content)) {
        body = report.content;
      } else if (typeof report.content === 'string') {
        body = report.content;
      } else {
        // Convert to string if needed
        body = String(report.content);
      }

      // Make API call
      const response = await fetch(apiDest.url, {
        method,
        headers,
        body: body as BodyInit,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(
          `API export failed: ${response.status} ${response.statusText}. ${errorText}`
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to export report to API: ${error.message}`);
      }
      throw new Error(
        `Failed to export report to API: ${String(error)}`
      );
    }
  }

  /**
   * Get the appropriate Content-Type header for a report format
   * 
   * @param format - Report format
   * @returns Content-Type header value
   */
  private getContentType(format: Report['format']): string {
    const contentTypes: Record<Report['format'], string> = {
      json: 'application/json',
      markdown: 'text/markdown',
      pdf: 'application/pdf',
      html: 'text/html',
      csv: 'text/csv',
    };

    return contentTypes[format] || 'application/octet-stream';
  }
}
