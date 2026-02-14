/**
 * SPARQL Query Utilities
 *
 * Helper functions for SPARQL query result processing and export
 */
/**
 * Convert SPARQL query results to CSV format
 * @param records Array of record objects with string values
 * @returns CSV string
 */
export declare function convertToCSV(records: Array<Record<string, string>>): string;
/**
 * Download CSV data as a file
 * @param csv CSV string content
 * @param filename Name of the file to download
 */
export declare function downloadCSV(csv: string, filename: string): void;
