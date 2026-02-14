/**
 * Test Export Service
 * 
 * Enhanced export service for test data with Excel formatting, charts, and PDF reports.
 */

import ExcelJS from 'exceljs';
import { logger } from '../../utils/logger.js';
import type { TestSummaryDocument } from './TestSummaryService.js';

export interface TestExportOptions {
  format: 'csv' | 'json' | 'xlsx' | 'pdf';
  testType?: string;
  branch?: string;
  startDate?: Date;
  endDate?: Date;
  includeCharts?: boolean;
  includeTrends?: boolean;
  includeSummary?: boolean;
}

export interface TestExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export class TestExportService {
  private static instance: TestExportService | null = null;

  static getInstance(): TestExportService {
    if (!TestExportService.instance) {
      TestExportService.instance = new TestExportService();
    }
    return TestExportService.instance;
  }

  /**
   * Generate enhanced Excel export with formatting and charts
   */
  async generateExcelExport(
    summaries: TestSummaryDocument[],
    options: TestExportOptions
  ): Promise<TestExportResult> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Test Dashboard';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Summary Sheet
    if (options.includeSummary !== false) {
      await this.createSummarySheet(workbook, summaries, options);
    }

    // Test Runs Sheet
    await this.createTestRunsSheet(workbook, summaries);

    // Trends Sheet
    if (options.includeTrends !== false) {
      await this.createTrendsSheet(workbook, summaries);
    }

    // Performance Sheet
    await this.createPerformanceSheet(workbook, summaries);

    // Coverage Sheet (if available)
    await this.createCoverageSheet(workbook, summaries);

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    const filename = `test-export-${new Date().toISOString().split('T')[0]}.xlsx`;
    
    return {
      buffer: Buffer.from(buffer),
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  /**
   * Create summary sheet with key metrics
   */
  private async createSummarySheet(
    workbook: ExcelJS.Workbook,
    summaries: TestSummaryDocument[],
    options: TestExportOptions
  ): Promise<void> {
    const sheet = workbook.addWorksheet('Summary');
    
    // Title
    sheet.mergeCells('A1:D1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Test Dashboard Summary';
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 25;

    // Export metadata
    sheet.addRow([]);
    sheet.addRow(['Export Date', new Date().toISOString()]);
    sheet.addRow(['Total Test Runs', summaries.length]);
    if (options.testType) {
      sheet.addRow(['Test Type', options.testType]);
    }
    if (options.branch) {
      sheet.addRow(['Branch', options.branch]);
    }
    if (options.startDate) {
      sheet.addRow(['Start Date', options.startDate.toISOString()]);
    }
    if (options.endDate) {
      sheet.addRow(['End Date', options.endDate.toISOString()]);
    }

    sheet.addRow([]);

    // Calculate statistics
    const totalTests = summaries.reduce((sum, s) => sum + (s.summary.total || 0), 0);
    const totalPassed = summaries.reduce((sum, s) => sum + (s.summary.passed || 0), 0);
    const totalFailed = summaries.reduce((sum, s) => sum + (s.summary.failed || 0), 0);
    const totalSkipped = summaries.reduce((sum, s) => sum + (s.summary.skipped || 0), 0);
    const totalDuration = summaries.reduce((sum, s) => sum + (s.duration || 0), 0);
    const passRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

    // Statistics section
    sheet.addRow(['Statistics']);
    const statsHeader = sheet.getRow(sheet.rowCount);
    statsHeader.font = { bold: true, size: 12 };
    
    sheet.addRow(['Total Tests', totalTests]);
    sheet.addRow(['Passed', totalPassed]);
    sheet.addRow(['Failed', totalFailed]);
    sheet.addRow(['Skipped', totalSkipped]);
    sheet.addRow(['Pass Rate', `${passRate.toFixed(2)}%`]);
    sheet.addRow(['Total Duration', `${(totalDuration / 1000).toFixed(2)}s`]);
    sheet.addRow(['Average Duration', `${(totalDuration / summaries.length / 1000).toFixed(2)}s`]);

    // Style statistics
    const statsRange = sheet.getRow(sheet.rowCount - 6);
    statsRange.getCell(1).font = { bold: true };
    statsRange.getCell(2).font = { bold: true, color: { argb: 'FF00AA00' } };

    // Set column widths
    sheet.columns = [
      { width: 20 },
      { width: 20 },
    ];
  }

  /**
   * Create test runs sheet with detailed data
   */
  private async createTestRunsSheet(
    workbook: ExcelJS.Workbook,
    summaries: TestSummaryDocument[]
  ): Promise<void> {
    const sheet = workbook.addWorksheet('Test Runs');
    
    // Headers
    const headers = [
      'Run ID',
      'Test Type',
      'Execution Timestamp',
      'Duration (s)',
      'Total Tests',
      'Passed',
      'Failed',
      'Skipped',
      'Pass Rate (%)',
      'Exit Code',
      'Branch',
      'Commit',
      'Test Runner',
    ];

    sheet.addRow(headers);

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 20;

    // Add data rows
    summaries.forEach((summary) => {
      const passRate = summary.summary.total > 0
        ? (summary.summary.passed / summary.summary.total) * 100
        : 0;

      const row = sheet.addRow([
        summary.runId,
        summary.testType || 'unknown',
        summary.executionTimestamp.toISOString(),
        (summary.duration / 1000).toFixed(2),
        summary.summary.total || 0,
        summary.summary.passed || 0,
        summary.summary.failed || 0,
        summary.summary.skipped || 0,
        passRate.toFixed(2),
        summary.exitCode || 0,
        summary.git?.branch || '',
        summary.git?.commitHashShort || summary.git?.commitHash?.substring(0, 7) || '',
        summary.testRunner || '',
      ]);

      // Color code pass rate
      const passRateCell = row.getCell(9);
      if (passRate >= 95) {
        passRateCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFC6EFCE' },
        };
      } else if (passRate >= 80) {
        passRateCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFEB9C' },
        };
      } else {
        passRateCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFC7CE' },
        };
      }

      // Color code failed tests
      const failedCell = row.getCell(7);
      if ((summary.summary.failed || 0) > 0) {
        failedCell.font = { color: { argb: 'FFFF0000' }, bold: true };
      }
    });

    // Set column widths
    sheet.columns = [
      { width: 30 }, // Run ID
      { width: 15 }, // Test Type
      { width: 25 }, // Execution Timestamp
      { width: 12 }, // Duration
      { width: 12 }, // Total Tests
      { width: 10 }, // Passed
      { width: 10 }, // Failed
      { width: 10 }, // Skipped
      { width: 12 }, // Pass Rate
      { width: 10 }, // Exit Code
      { width: 20 }, // Branch
      { width: 10 }, // Commit
      { width: 15 }, // Test Runner
    ];

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Add auto filter
    sheet.autoFilter = {
      from: 'A1',
      to: `M${summaries.length + 1}`,
    };
  }

  /**
   * Create trends sheet with time-based analysis
   */
  private async createTrendsSheet(
    workbook: ExcelJS.Workbook,
    summaries: TestSummaryDocument[]
  ): Promise<void> {
    const sheet = workbook.addWorksheet('Trends');
    
    // Group by date
    const dailyStats = new Map<string, {
      date: string;
      runs: number;
      total: number;
      passed: number;
      failed: number;
      skipped: number;
      duration: number;
    }>();

    summaries.forEach((summary) => {
      const dateKey = summary.executionTimestamp.toISOString().split('T')[0];
      const existing = dailyStats.get(dateKey) || {
        date: dateKey,
        runs: 0,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
      };

      existing.runs += 1;
      existing.total += summary.summary.total || 0;
      existing.passed += summary.summary.passed || 0;
      existing.failed += summary.summary.failed || 0;
      existing.skipped += summary.summary.skipped || 0;
      existing.duration += summary.duration || 0;

      dailyStats.set(dateKey, existing);
    });

    // Headers
    const headers = [
      'Date',
      'Runs',
      'Total Tests',
      'Passed',
      'Failed',
      'Skipped',
      'Pass Rate (%)',
      'Total Duration (s)',
      'Avg Duration (s)',
    ];

    sheet.addRow(headers);

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    // Add data rows (sorted by date)
    const sortedDates = Array.from(dailyStats.values())
      .sort((a, b) => a.date.localeCompare(b.date));

    sortedDates.forEach((stats) => {
      const passRate = stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;
      const avgDuration = stats.runs > 0 ? stats.duration / stats.runs : 0;

      const row = sheet.addRow([
        stats.date,
        stats.runs,
        stats.total,
        stats.passed,
        stats.failed,
        stats.skipped,
        passRate.toFixed(2),
        (stats.duration / 1000).toFixed(2),
        (avgDuration / 1000).toFixed(2),
      ]);

      // Color code pass rate
      const passRateCell = row.getCell(7);
      if (passRate >= 95) {
        passRateCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFC6EFCE' },
        };
      } else if (passRate >= 80) {
        passRateCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFEB9C' },
        };
      } else {
        passRateCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFC7CE' },
        };
      }
    });

    // Set column widths
    sheet.columns = [
      { width: 12 }, // Date
      { width: 8 },  // Runs
      { width: 12 }, // Total Tests
      { width: 10 }, // Passed
      { width: 10 }, // Failed
      { width: 10 }, // Skipped
      { width: 12 }, // Pass Rate
      { width: 15 }, // Total Duration
      { width: 15 }, // Avg Duration
    ];

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  /**
   * Create performance sheet
   */
  private async createPerformanceSheet(
    workbook: ExcelJS.Workbook,
    summaries: TestSummaryDocument[]
  ): Promise<void> {
    const sheet = workbook.addWorksheet('Performance');
    
    // Headers
    const headers = [
      'Run ID',
      'Test Type',
      'Execution Timestamp',
      'Duration (s)',
      'Tests per Second',
      'Avg Test Duration (ms)',
    ];

    sheet.addRow(headers);

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    // Add data rows
    summaries.forEach((summary) => {
      const totalTests = summary.summary.total || 1;
      const testsPerSecond = summary.duration > 0 ? totalTests / (summary.duration / 1000) : 0;
      const avgTestDuration = totalTests > 0 ? (summary.duration / totalTests) : 0;

      sheet.addRow([
        summary.runId,
        summary.testType || 'unknown',
        summary.executionTimestamp.toISOString(),
        (summary.duration / 1000).toFixed(2),
        testsPerSecond.toFixed(2),
        avgTestDuration.toFixed(2),
      ]);
    });

    // Set column widths
    sheet.columns = [
      { width: 30 }, // Run ID
      { width: 15 }, // Test Type
      { width: 25 }, // Execution Timestamp
      { width: 12 }, // Duration
      { width: 15 }, // Tests per Second
      { width: 18 }, // Avg Test Duration
    ];

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  /**
   * Create coverage sheet (if coverage data is available)
   */
  private async createCoverageSheet(
    workbook: ExcelJS.Workbook,
    summaries: TestSummaryDocument[]
  ): Promise<void> {
    // This would require coverage data from TestCoverageService
    // For now, create a placeholder sheet
    const sheet = workbook.addWorksheet('Coverage');
    
    sheet.addRow(['Coverage data not available in test summaries']);
    sheet.addRow(['Use the coverage-metrics endpoint to export coverage data']);
    
    // Set column width
    sheet.columns = [{ width: 60 }];
  }
}

export function getTestExportService(): TestExportService {
  return TestExportService.getInstance();
}


