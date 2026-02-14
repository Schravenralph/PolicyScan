/**
 * Reporting Layer - Main exports
 * 
 * Central export point for the reporting layer.
 */

// Main service
export { ReportGenerator } from './ReportGenerator.js';

// Interfaces
export type { IReportingService } from './interfaces/IReportingService.js';
export type { IReportFormatter } from './interfaces/IReportFormatter.js';
export type { IDataAggregator, AggregatorResult } from './interfaces/IDataAggregator.js';

// Types
export type { Report, ReportFormat, ReportMetadata } from './types/Report.js';
export type { ReportData, ScoreData, CategoryData } from './types/ReportData.js';
export type {
  AggregatedData,
  ReportSummary,
  DocumentSummary,
  ScoreSummary,
  CategorySummary,
} from './types/AggregatedData.js';

// Aggregators
export { DocumentAggregator } from './aggregators/DocumentAggregator.js';
export { ScoreAggregator } from './aggregators/ScoreAggregator.js';
export { CategoryAggregator } from './aggregators/CategoryAggregator.js';

// Formatters
export { JsonReportFormatter } from './formatters/JsonReportFormatter.js';
export { MarkdownReportFormatter } from './formatters/MarkdownReportFormatter.js';
export { HtmlReportFormatter } from './formatters/HtmlReportFormatter.js';
export { PdfReportFormatter } from './formatters/PdfReportFormatter.js';

// Exporters
export { FileExporter, type FileExportDestination } from './exporters/FileExporter.js';
export { ApiExporter, type ApiExportDestination } from './exporters/ApiExporter.js';
export type { IExporter, ExportDestination } from './exporters/IExporter.js';
