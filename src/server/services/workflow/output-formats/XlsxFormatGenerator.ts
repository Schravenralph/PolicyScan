import * as fs from 'fs/promises';
import ExcelJS from 'exceljs';
import type { WorkflowOutput } from '../WorkflowOutputService.js';
import type { FormatGenerator } from './FormatGenerator.js';

/**
 * Generates XLSX format output from workflow results
 */
export class XlsxFormatGenerator implements FormatGenerator {
  /**
   * Generate XLSX Buffer from workflow output
   */
  async generate(output: WorkflowOutput): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['Metric', 'Value']);
    summarySheet.addRow(['Run ID', output.metadata.runId]);
    summarySheet.addRow(['Workflow ID', output.metadata.workflowId]);
    summarySheet.addRow(['Workflow Name', output.metadata.workflowName]);
    summarySheet.addRow(['Status', output.metadata.status]);
    summarySheet.addRow(['Start Time', output.metadata.startTime]);
    if (output.metadata.endTime) {
      summarySheet.addRow(['End Time', output.metadata.endTime]);
    }
    summarySheet.addRow([]);
    summarySheet.addRow(['Total Pages', output.results.summary.totalPages]);
    summarySheet.addRow(['Total Documents', output.results.summary.totalDocuments]);
    summarySheet.addRow(['Newly Discovered', output.results.summary.newlyDiscovered]);
    summarySheet.addRow(['Existing', output.results.summary.existing]);
    summarySheet.addRow(['Errors', output.results.summary.errors]);

    // Style header row
    const headerRow = summarySheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Documents sheet
    if (output.results.documents.length > 0) {
      const documentsSheet = workbook.addWorksheet('Documents');
      documentsSheet.addRow(['Title', 'URL', 'Type', 'Source URL', 'Relevance Score', 'Discovered At']);

      const docHeaderRow = documentsSheet.getRow(1);
      docHeaderRow.font = { bold: true };
      docHeaderRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };

      output.results.documents.forEach(doc => {
        documentsSheet.addRow([
          doc.title,
          doc.url,
          doc.type,
          doc.sourceUrl,
          doc.relevanceScore ?? '',
          doc.discoveredAt
        ]);
      });

      // Set column widths
      documentsSheet.columns = [
        { width: 40 }, // Title
        { width: 50 }, // URL
        { width: 20 }, // Type
        { width: 50 }, // Source URL
        { width: 15 }, // Relevance Score
        { width: 20 }, // Discovered At
      ];
    }

    // Endpoints sheet
    if (output.results.endpoints.length > 0) {
      const endpointsSheet = workbook.addWorksheet('Endpoints');
      endpointsSheet.addRow(['Title', 'URL', 'Type', 'Source URL', 'Relevance Score']);

      const epHeaderRow = endpointsSheet.getRow(1);
      epHeaderRow.font = { bold: true };
      epHeaderRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };

      output.results.endpoints.forEach(endpoint => {
        endpointsSheet.addRow([
          endpoint.title,
          endpoint.url,
          endpoint.type,
          endpoint.sourceUrl,
          endpoint.relevanceScore ?? ''
        ]);
      });

      // Set column widths
      endpointsSheet.columns = [
        { width: 40 }, // Title
        { width: 50 }, // URL
        { width: 20 }, // Type
        { width: 50 }, // Source URL
        { width: 15 }, // Relevance Score
      ];
    }

    // Errors sheet
    if (output.errors.length > 0) {
      const errorsSheet = workbook.addWorksheet('Errors');
      errorsSheet.addRow(['Timestamp', 'Message', 'URL', 'Step ID']);

      const errHeaderRow = errorsSheet.getRow(1);
      errHeaderRow.font = { bold: true };
      errHeaderRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };

      output.errors.forEach(error => {
        errorsSheet.addRow([
          error.timestamp,
          error.message,
          error.url ?? '',
          error.stepId ?? ''
        ]);
      });

      // Set column widths
      errorsSheet.columns = [
        { width: 20 }, // Timestamp
        { width: 60 }, // Message
        { width: 50 }, // URL
        { width: 20 }, // Step ID
      ];
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /**
   * Write XLSX output to file
   */
  async write(filePath: string, output: WorkflowOutput): Promise<void> {
    try {
      const xlsxBuffer = await this.generate(output);
      await fs.writeFile(filePath, xlsxBuffer);
    } catch (error) {
      console.error(`[WorkflowOutput] Failed to write XLSX file ${filePath}:`, error);
      throw new Error(`Failed to write XLSX output: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}



