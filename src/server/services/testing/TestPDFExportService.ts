/**
 * Test PDF Export Service
 * 
 * Generates PDF reports for test data with charts and visualizations.
 */

import PDFDocument from 'pdfkit';
import { logger } from '../../utils/logger.js';
import type { TestSummaryDocument } from './TestSummaryService.js';

export interface TestPDFExportOptions {
  format: 'pdf';
  testType?: string;
  branch?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface TestPDFExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export class TestPDFExportService {
  private static instance: TestPDFExportService | null = null;

  static getInstance(): TestPDFExportService {
    if (!TestPDFExportService.instance) {
      TestPDFExportService.instance = new TestPDFExportService();
    }
    return TestPDFExportService.instance;
  }

  /**
   * Generate PDF report
   */
  async generatePDFReport(
    summaries: TestSummaryDocument[],
    options: TestPDFExportOptions
  ): Promise<TestPDFExportResult> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            buffer,
            filename: `test-report-${new Date().toISOString().split('T')[0]}.pdf`,
            mimeType: 'application/pdf',
          });
        });
        doc.on('error', reject);

        // Generate PDF content
        this.generatePDFContent(doc, summaries, options);

        doc.end();
      } catch (error) {
        logger.error({ error }, 'Failed to generate PDF report');
        reject(error);
      }
    });
  }

  /**
   * Generate PDF content
   */
  private generatePDFContent(
    doc: PDFKit.PDFDocument,
    summaries: TestSummaryDocument[],
    options: TestPDFExportOptions
  ): void {
    // Title page
    doc.fontSize(24).text('Test Dashboard Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    // Export metadata
    doc.fontSize(14).text('Export Information', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Total Test Runs: ${summaries.length}`);
    if (options.testType) {
      doc.text(`Test Type: ${options.testType}`);
    }
    if (options.branch) {
      doc.text(`Branch: ${options.branch}`);
    }
    if (options.startDate) {
      doc.text(`Start Date: ${options.startDate.toISOString()}`);
    }
    if (options.endDate) {
      doc.text(`End Date: ${options.endDate.toISOString()}`);
    }

    doc.addPage();

    // Summary statistics
    const totalTests = summaries.reduce((sum, s) => sum + (s.summary.total || 0), 0);
    const totalPassed = summaries.reduce((sum, s) => sum + (s.summary.passed || 0), 0);
    const totalFailed = summaries.reduce((sum, s) => sum + (s.summary.failed || 0), 0);
    const totalSkipped = summaries.reduce((sum, s) => sum + (s.summary.skipped || 0), 0);
    const totalDuration = summaries.reduce((sum, s) => sum + (s.duration || 0), 0);
    const passRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

    doc.fontSize(14).text('Summary Statistics', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Total Tests: ${totalTests}`);
    doc.text(`Passed: ${totalPassed}`);
    doc.text(`Failed: ${totalFailed}`);
    doc.text(`Skipped: ${totalSkipped}`);
    doc.text(`Pass Rate: ${passRate.toFixed(2)}%`);
    doc.text(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    doc.text(`Average Duration: ${(totalDuration / summaries.length / 1000).toFixed(2)}s`);

    doc.addPage();

    // Test runs table
    doc.fontSize(14).text('Test Runs', { underline: true });
    doc.moveDown(0.5);

    // Table headers
    const tableTop = doc.y;
    const tableLeft = 50;
    const colWidths = [80, 60, 80, 60, 50, 50, 50];
    const headers = ['Run ID', 'Type', 'Timestamp', 'Duration', 'Total', 'Passed', 'Failed'];

    doc.fontSize(9).font('Helvetica-Bold');
    let x = tableLeft;
    headers.forEach((header, i) => {
      doc.text(header, x, tableTop, { width: colWidths[i] });
      x += colWidths[i];
    });

    // Table rows
    doc.font('Helvetica').fontSize(8);
    let y = tableTop + 20;
    const rowHeight = 15;
    const maxRowsPerPage = Math.floor((doc.page.height - y - 50) / rowHeight);

    summaries.slice(0, 50).forEach((summary, index) => {
      if (index > 0 && index % maxRowsPerPage === 0) {
        doc.addPage();
        y = 50;
      }

      const passRate = summary.summary.total > 0
        ? (summary.summary.passed / summary.summary.total) * 100
        : 0;

      x = tableLeft;
      const rowData = [
        summary.runId.substring(0, 12) + '...',
        summary.testType || 'unknown',
        summary.executionTimestamp.toISOString().split('T')[0],
        `${(summary.duration / 1000).toFixed(1)}s`,
        summary.summary.total.toString(),
        summary.summary.passed.toString(),
        summary.summary.failed.toString(),
      ];

      rowData.forEach((cell, i) => {
        doc.text(cell, x, y, { width: colWidths[i] });
        x += colWidths[i];
      });

      y += rowHeight;
    });

    // Trends section
    if (summaries.length > 0) {
      doc.addPage();
      doc.fontSize(14).text('Daily Trends', { underline: true });
      doc.moveDown(0.5);

      // Group by date
      const dailyStats = new Map<string, {
        date: string;
        total: number;
        passed: number;
        failed: number;
      }>();

      summaries.forEach((summary) => {
        const dateKey = summary.executionTimestamp.toISOString().split('T')[0];
        const existing = dailyStats.get(dateKey) || {
          date: dateKey,
          total: 0,
          passed: 0,
          failed: 0,
        };

        existing.total += summary.summary.total || 0;
        existing.passed += summary.summary.passed || 0;
        existing.failed += summary.summary.failed || 0;

        dailyStats.set(dateKey, existing);
      });

      // Display trends
      doc.fontSize(10);
      const sortedDates = Array.from(dailyStats.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-30); // Last 30 days

      sortedDates.forEach((stats) => {
        const passRate = stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;
        doc.text(
          `${stats.date}: ${stats.total} tests, ${stats.passed} passed, ${stats.failed} failed (${passRate.toFixed(1)}% pass rate)`
        );
        doc.moveDown(0.3);
      });
    }
  }
}

export function getTestPDFExportService(): TestPDFExportService {
  return TestPDFExportService.getInstance();
}


