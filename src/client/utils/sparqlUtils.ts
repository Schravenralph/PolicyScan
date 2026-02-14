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
export function convertToCSV(records: Array<Record<string, string>>): string {
  if (records.length === 0) return '';
  
  const headers = Object.keys(records[0]);
  const csvRows = [
    headers.join(','),
    ...records.map(row => 
      headers.map(header => {
        const value = row[header] || '';
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ];
  
  return csvRows.join('\n');
}

/**
 * Download CSV data as a file
 * @param csv CSV string content
 * @param filename Name of the file to download
 */
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}
