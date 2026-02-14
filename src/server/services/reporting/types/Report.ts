/**
 * Report Type
 * 
 * Represents a generated report.
 */

/**
 * Report format types
 */
export type ReportFormat = 'json' | 'markdown' | 'pdf' | 'html' | 'csv';

/**
 * Report metadata
 */
export interface ReportMetadata {
  /** Report title */
  title?: string;
  /** Report description */
  description?: string;
  /** Report author */
  author?: string;
  /** Report version */
  version?: string;
  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * Generated report
 */
export interface Report {
  /** Report identifier */
  id: string;
  /** Report format */
  format: ReportFormat;
  /** Report content (string for text formats, Buffer for binary formats) */
  content: string | Buffer;
  /** Report metadata */
  metadata: ReportMetadata;
  /** Timestamp when report was generated */
  generatedAt: Date;
}
