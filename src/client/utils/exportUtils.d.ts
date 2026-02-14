import type { BronDocument } from '../services/api';
/**
 * Helper to get status label from document
 */
export declare function getStatusLabel(doc: BronDocument): string;
/**
 * Helper to format export date for filenames
 */
export declare function formatExportDate(): string;
/**
 * Helper to handle download and cleanup
 */
export declare function downloadBlob(blob: Blob, filename: string): void;
/**
 * Helper to escape CSV values
 */
export declare function escapeCSV(value: unknown): string;
/**
 * Helper to escape TSV values
 */
export declare function escapeTSV(value: unknown): string;
/**
 * Helper to get document values for CSV/TSV/XLSX
 */
export declare function getDocumentValues(doc: BronDocument): (string | number | null | undefined)[];
/**
 * Export documents to CSV format
 */
export declare function exportToCSV(documents: BronDocument[], filename?: string): void;
/**
 * Export documents to JSON format
 */
export declare function exportToJSON(documents: BronDocument[], queryId?: string, filename?: string): void;
/**
 * Export documents to Markdown format
 */
export declare function exportToMarkdown(documents: BronDocument[], queryId?: string, filename?: string): void;
/**
 * Export documents to XLSX format (Excel)
 * Uses exceljs instead of xlsx for better security posture
 */
export declare function exportToXLSX(documents: BronDocument[], filename?: string): Promise<void>;
/**
 * Export documents to TSV format (Tab-Separated Values)
 */
export declare function exportToTSV(documents: BronDocument[], filename?: string): void;
/**
 * Export documents to HTML format
 */
export declare function exportToHTML(documents: BronDocument[], queryId?: string, filename?: string): void;
/**
 * Export documents to XML format
 */
export declare function exportToXML(documents: BronDocument[], queryId?: string, filename?: string): void;
/**
 * Export documents to PDF format via server API
 */
export declare function exportToPDF(documents: BronDocument[], options?: {
    queryId?: string;
    filename?: string;
    includeCitations?: boolean;
    citationFormat?: 'apa' | 'custom';
    searchParams?: {
        topic?: string;
        location?: string;
        jurisdiction?: string;
    };
}): Promise<void>;
/**
 * Export documents in the specified format
 * Note: For XLSX and PDF formats, this function is async due to external dependencies/API calls
 */
export declare function exportDocuments(documents: BronDocument[], format: 'csv' | 'json' | 'markdown' | 'xlsx' | 'tsv' | 'html' | 'xml' | 'pdf', options?: {
    queryId?: string;
    filename?: string;
    includeCitations?: boolean;
    citationFormat?: 'apa' | 'custom';
    searchParams?: {
        topic?: string;
        location?: string;
        jurisdiction?: string;
    };
}): Promise<void>;
