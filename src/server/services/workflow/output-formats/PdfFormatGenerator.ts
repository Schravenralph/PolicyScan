import * as fs from 'fs/promises';
import PDFDocument from 'pdfkit';
import type { WorkflowOutput } from '../WorkflowOutputService.js';
import type { FormatGenerator } from './FormatGenerator.js';

/**
 * Generates PDF format output from workflow results
 */
export class PdfFormatGenerator implements FormatGenerator {
  /**
   * Generate PDF Buffer from workflow output
   */
  async generate(output: WorkflowOutput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, bufferPages: true });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(16).font('Helvetica-Bold').text(`Workflow Output: ${output.metadata.workflowName}`, { align: 'center' });
      doc.moveDown(0.5);

      // Metadata
      doc.fontSize(10).font('Helvetica');
      doc.text(`Run ID: ${output.metadata.runId}`);
      doc.text(`Workflow ID: ${output.metadata.workflowId}`);
      doc.text(`Status: ${output.metadata.status}`);
      doc.text(`Start Time: ${output.metadata.startTime}`);
      if (output.metadata.endTime) {
        doc.text(`End Time: ${output.metadata.endTime}`);
      }
      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);

      // Summary
      doc.fontSize(12).font('Helvetica-Bold').text('Summary', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Total Pages: ${output.results.summary.totalPages}`);
      doc.text(`Total Documents: ${output.results.summary.totalDocuments}`);
      doc.text(`Newly Discovered: ${output.results.summary.newlyDiscovered}`);
      doc.text(`Existing: ${output.results.summary.existing}`);
      doc.text(`Errors: ${output.results.summary.errors}`);
      doc.moveDown(1);

      // Documents
      if (output.results.documents.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold').text('Documents', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');

        output.results.documents.forEach((document, index) => {
          if (index > 0 && doc.y > 700) {
            doc.addPage();
          }

          doc.fontSize(11).font('Helvetica-Bold').text(`${index + 1}. ${document.title}`, {
            link: document.url,
            underline: true,
          });
          doc.moveDown(0.2);
          doc.fontSize(9).font('Helvetica').fillColor('gray');
          doc.text(`URL: ${document.url}`);
          doc.text(`Type: ${document.type}`);
          doc.text(`Source: ${document.sourceUrl}`);
          if (document.relevanceScore !== undefined) {
            doc.text(`Relevance Score: ${document.relevanceScore}`);
          }
          doc.moveDown(0.5);
          doc.fillColor('black');
        });
        doc.moveDown(1);
      }

      // Endpoints
      if (output.results.endpoints.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold').text('Endpoints', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');

        output.results.endpoints.forEach((endpoint, index) => {
          if (index > 0 && doc.y > 700) {
            doc.addPage();
          }

          doc.fontSize(11).font('Helvetica-Bold').text(`${index + 1}. ${endpoint.title}`, {
            link: endpoint.url,
            underline: true,
          });
          doc.moveDown(0.2);
          doc.fontSize(9).font('Helvetica').fillColor('gray');
          doc.text(`URL: ${endpoint.url}`);
          doc.text(`Type: ${endpoint.type}`);
          doc.moveDown(0.5);
          doc.fillColor('black');
        });
        doc.moveDown(1);
      }

      // Errors
      if (output.errors.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold').text('Errors', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica').fillColor('red');

        output.errors.forEach((error, index) => {
          if (index > 0 && doc.y > 700) {
            doc.addPage();
          }

          doc.text(`${index + 1}. ${error.message}`);
          if (error.url) {
            doc.fontSize(9).text(`   URL: ${error.url}`);
          }
          if (error.stepId) {
            doc.fontSize(9).text(`   Step: ${error.stepId}`);
          }
          doc.moveDown(0.3);
        });
        doc.fillColor('black');
      }

      // Footer
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).font('Helvetica').fillColor('gray');
        doc.text(
          `Generated: ${new Date().toLocaleString('nl-NL')}`,
          50,
          doc.page.height - 30,
          { align: 'left' }
        );
      }

      doc.end();
    });
  }

  /**
   * Write PDF output to file
   */
  async write(filePath: string, output: WorkflowOutput): Promise<void> {
    try {
      const pdfBuffer = await this.generate(output);
      await fs.writeFile(filePath, pdfBuffer);
    } catch (error) {
      console.error(`[WorkflowOutput] Failed to write PDF file ${filePath}:`, error);
      throw new Error(`Failed to write PDF output: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
