import * as fs from 'fs/promises';
import type { WorkflowOutput } from '../WorkflowOutputService.js';
import type { FormatGenerator } from './FormatGenerator.js';

/**
 * Generates CSV format output from workflow results
 */
export class CsvFormatGenerator implements FormatGenerator {
  /**
   * Escape CSV field value
   */
  private escapeCsvField(value: string | null | undefined): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Generate CSV string from workflow output
   */
  generate(output: WorkflowOutput): string {
    const lines: string[] = [];

    // Documents CSV
    if (output.results.documents.length > 0) {
      lines.push('DOCUMENTS');
      lines.push('Title,URL,Type,Source URL,Relevance Score,Discovered At');
      for (const doc of output.results.documents) {
        lines.push([
          this.escapeCsvField(doc.title),
          this.escapeCsvField(doc.url),
          this.escapeCsvField(doc.type),
          this.escapeCsvField(doc.sourceUrl),
          this.escapeCsvField(doc.relevanceScore?.toString()),
          this.escapeCsvField(doc.discoveredAt)
        ].join(','));
      }
      lines.push('');
    }

    // Endpoints CSV
    if (output.results.endpoints.length > 0) {
      lines.push('ENDPOINTS');
      lines.push('Title,URL,Type,Source URL,Relevance Score');
      for (const endpoint of output.results.endpoints) {
        lines.push([
          this.escapeCsvField(endpoint.title),
          this.escapeCsvField(endpoint.url),
          this.escapeCsvField(endpoint.type),
          this.escapeCsvField(endpoint.sourceUrl),
          this.escapeCsvField(endpoint.relevanceScore?.toString())
        ].join(','));
      }
      lines.push('');
    }

    // Summary CSV
    lines.push('SUMMARY');
    lines.push('Metric,Value');
    lines.push(`Total Pages,${output.results.summary.totalPages}`);
    lines.push(`Total Documents,${output.results.summary.totalDocuments}`);
    lines.push(`Newly Discovered,${output.results.summary.newlyDiscovered}`);
    lines.push(`Existing,${output.results.summary.existing}`);
    lines.push(`Errors,${output.results.summary.errors}`);

    return lines.join('\n');
  }

  /**
   * Write CSV output to file
   */
  async write(filePath: string, output: WorkflowOutput): Promise<void> {
    try {
      const csv = this.generate(output);
      await fs.writeFile(filePath, csv, 'utf-8');
    } catch (error) {
      console.error(`[WorkflowOutput] Failed to write CSV file ${filePath}:`, error);
      throw new Error(`Failed to write CSV output: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}


