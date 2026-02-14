import * as fs from 'fs/promises';
import type { WorkflowOutput } from '../WorkflowOutputService.js';
import type { FormatGenerator } from './FormatGenerator.js';

/**
 * Generates TSV (Tab-Separated Values) format output from workflow results
 */
export class TsvFormatGenerator implements FormatGenerator {
  /**
   * Escape TSV field value
   */
  private escapeTsvField(value: string | null | undefined): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes('\t') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Generate TSV string from workflow output
   */
  generate(output: WorkflowOutput): string {
    const lines: string[] = [];

    // Documents TSV
    if (output.results.documents.length > 0) {
      lines.push('DOCUMENTS');
      lines.push('Title\tURL\tType\tSource URL\tRelevance Score\tDiscovered At');
      for (const doc of output.results.documents) {
        lines.push([
          this.escapeTsvField(doc.title),
          this.escapeTsvField(doc.url),
          this.escapeTsvField(doc.type),
          this.escapeTsvField(doc.sourceUrl),
          this.escapeTsvField(doc.relevanceScore?.toString()),
          this.escapeTsvField(doc.discoveredAt)
        ].join('\t'));
      }
      lines.push('');
    }

    // Endpoints TSV
    if (output.results.endpoints.length > 0) {
      lines.push('ENDPOINTS');
      lines.push('Title\tURL\tType\tSource URL\tRelevance Score');
      for (const endpoint of output.results.endpoints) {
        lines.push([
          this.escapeTsvField(endpoint.title),
          this.escapeTsvField(endpoint.url),
          this.escapeTsvField(endpoint.type),
          this.escapeTsvField(endpoint.sourceUrl),
          this.escapeTsvField(endpoint.relevanceScore?.toString())
        ].join('\t'));
      }
      lines.push('');
    }

    // Summary TSV
    lines.push('SUMMARY');
    lines.push('Metric\tValue');
    lines.push(`Total Pages\t${output.results.summary.totalPages}`);
    lines.push(`Total Documents\t${output.results.summary.totalDocuments}`);
    lines.push(`Newly Discovered\t${output.results.summary.newlyDiscovered}`);
    lines.push(`Existing\t${output.results.summary.existing}`);
    lines.push(`Errors\t${output.results.summary.errors}`);

    return lines.join('\n');
  }

  /**
   * Write TSV output to file
   */
  async write(filePath: string, output: WorkflowOutput): Promise<void> {
    try {
      const tsv = this.generate(output);
      await fs.writeFile(filePath, tsv, 'utf-8');
    } catch (error) {
      console.error(`[WorkflowOutput] Failed to write TSV file ${filePath}:`, error);
      throw new Error(`Failed to write TSV output: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}


