/**
 * PDF Report Formatter
 * 
 * Formats aggregated data as PDF.
 */

import { randomUUID } from 'crypto';
import PDFDocument from 'pdfkit';
import type { IReportFormatter } from '../interfaces/IReportFormatter.js';
import type { Report, ReportFormat, ReportMetadata } from '../types/Report.js';
import type { AggregatedData } from '../types/AggregatedData.js';

/**
 * Formats aggregated data as PDF
 */
export class PdfReportFormatter implements IReportFormatter {
  /**
   * Get the format this formatter produces
   * 
   * @returns Format identifier
   */
  getFormat(): ReportFormat {
    return 'pdf';
  }

  /**
   * Format aggregated data into a PDF report
   * 
   * @param data - Aggregated data to format
   * @param metadata - Optional metadata for the report
   * @returns PDF report
   */
  async format(data: AggregatedData, metadata?: ReportMetadata): Promise<Report> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve({
            id: randomUUID(),
            format: 'pdf',
            content: pdfBuffer,
            metadata: {
              ...metadata,
              title: metadata?.title || 'Document Report',
              format: 'pdf',
              generatedAt: new Date().toISOString(),
            },
            generatedAt: new Date(),
          });
        });

        doc.on('error', (err) => {
          reject(err);
        });

        // Title
        doc.fontSize(24).text(metadata?.title || 'Document Report', { align: 'center' });
        doc.moveDown();

        // Metadata
        if (metadata?.description) {
          doc.fontSize(12).text(metadata.description as string);
          doc.moveDown();
        }
        doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
        doc.moveDown(2);

        // Summary Section
        doc.fontSize(18).text('Summary');
        doc.moveDown(0.5);
        doc.fontSize(12);
        doc.text(`Total Documents: ${data.summary.totalDocuments}`);
        doc.text(`Average Score: ${data.summary.averageScore.toFixed(2)}`);
        doc.text(`Top Categories: ${data.summary.topCategories.join(', ')}`);

        if (data.summary.dateRange) {
          const start = data.summary.dateRange.start instanceof Date
            ? data.summary.dateRange.start
            : new Date(data.summary.dateRange.start);
          const end = data.summary.dateRange.end instanceof Date
            ? data.summary.dateRange.end
            : new Date(data.summary.dateRange.end);

          doc.text(`Date Range: ${start.toLocaleDateString()} - ${end.toLocaleDateString()}`);
        }
        doc.moveDown();

        // Score Distribution
        doc.fontSize(18).text('Score Statistics');
        doc.moveDown(0.5);
        doc.fontSize(12);
        doc.text(`Average: ${data.scores.average.toFixed(2)}`);
        doc.text(`Min: ${data.scores.min.toFixed(2)}`);
        doc.text(`Max: ${data.scores.max.toFixed(2)}`);
        doc.moveDown();

        // Categories
        doc.fontSize(18).text('Top Categories');
        doc.moveDown(0.5);
        doc.fontSize(12);
        data.categories.topCategories.forEach(cat => {
          doc.text(`${cat.category}: ${cat.count} (${cat.percentage}%)`);
        });
        doc.moveDown();

        // Top Documents
        doc.fontSize(18).text('Top Documents');
        doc.moveDown(0.5);
        doc.fontSize(12);
        data.documents.topDocuments.forEach((d, index) => {
          doc.text(`${index + 1}. ${d.title} (Score: ${d.score.toFixed(2)})`);
        });

        doc.end();

      } catch (error) {
        reject(error);
      }
    });
  }
}
