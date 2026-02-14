/**
 * Export Validation - Validates data before export
 *
 * Provides utilities for validating export data, formats, and browser capabilities
 * to prevent export failures.
 */
export interface ExportValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    estimatedSize?: number;
    willFitInMemory?: boolean;
}
export type ExportFormat = 'csv' | 'json' | 'markdown' | 'xlsx' | 'tsv' | 'html' | 'xml' | 'pdf';
/**
 * Validate export data before export
 */
export declare function validateExportData(documents: unknown[], format: ExportFormat): ExportValidationResult;
/**
 * Validate export format
 */
export declare function validateExportFormat(format: unknown): format is ExportFormat;
/**
 * Check if export should use server-side processing
 */
export declare function shouldUseServerSideExport(documents: unknown[], format: ExportFormat): boolean;
