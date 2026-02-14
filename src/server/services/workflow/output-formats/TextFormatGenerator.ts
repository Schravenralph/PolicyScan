import * as fs from 'fs/promises';
import type { WorkflowOutput } from '../WorkflowOutputService.js';
import type { FormatGenerator } from './FormatGenerator.js';

/**
 * Generates plain text format output from workflow results (no markdown formatting)
 */
export class TextFormatGenerator implements FormatGenerator {
  /**
   * Generate plain text string from workflow output
   */
  generate(output: WorkflowOutput): string {
    const lines: string[] = [];

    // Header
    lines.push('='.repeat(80));
    lines.push(`WORKFLOW-UITVOER: ${output.metadata.workflowName}`);
    lines.push('='.repeat(80));
    lines.push('');
    lines.push(`Gegenereerd: ${new Date().toISOString()}`);
    lines.push('');

    // Metadata section
    lines.push('METADATA');
    lines.push('-'.repeat(80));
    lines.push(`Run-ID: ${output.metadata.runId}`);
    lines.push(`Workflow-ID: ${output.metadata.workflowId}`);
    lines.push(`Status: ${output.metadata.status}`);
    lines.push(`Starttijd: ${output.metadata.startTime}`);
    lines.push(`Eindtijd: ${output.metadata.endTime || 'Lopend'}`);
    lines.push('');

    // Parameters section
    lines.push('PARAMETERS');
    lines.push('-'.repeat(80));
    lines.push(JSON.stringify(output.parameters, null, 2));
    lines.push('');

    // Summary section
    lines.push('SAMENVATTING');
    lines.push('-'.repeat(80));
    lines.push(`Totaal bezochte pagina's: ${output.results.summary.totalPages}`);
    lines.push(`Totaal gevonden documenten: ${output.results.summary.totalDocuments}`);
    lines.push(`Nieuw ontdekt: ${output.results.summary.newlyDiscovered}`);
    lines.push(`Bestaand: ${output.results.summary.existing}`);
    lines.push(`Fouten: ${output.results.summary.errors}`);
    
    // Add exploration stats if available
    const summaryWithExtras = output.results.summary as typeof output.results.summary & {
      externalLinksProcessed?: number;
      externalLinksCollected?: number;
      iploPagesScanned?: number;
      failedPages?: number;
      filteredLinks?: number;
    };
    if (summaryWithExtras.externalLinksProcessed !== undefined) {
      lines.push('');
      lines.push('Externe Links Verkenning:');
      lines.push(`  Verwerkte externe links: ${summaryWithExtras.externalLinksProcessed}`);
      lines.push(`  Verzamelde externe links: ${summaryWithExtras.externalLinksCollected ?? 0}`);
      lines.push(`  Gescande IPLO pagina's: ${summaryWithExtras.iploPagesScanned ?? 0}`);
      if (summaryWithExtras.failedPages && summaryWithExtras.failedPages > 0) {
        lines.push(`  Gefaalde pagina's: ${summaryWithExtras.failedPages}`);
      }
      if (summaryWithExtras.filteredLinks && summaryWithExtras.filteredLinks > 0) {
        lines.push(`  Gefilterde links: ${summaryWithExtras.filteredLinks}`);
      }
    }
    lines.push('');

    // Trace section
    lines.push('UITVOERINGSTRACE');
    lines.push('-'.repeat(80));
    lines.push(`Totaal bezochte URL's: ${output.trace.totalUrlsVisited}`);
    lines.push('');
    
    for (const step of output.trace.steps) {
      const statusIcon = step.status === 'success' ? '[OK]' : step.status === 'failed' ? '[FAIL]' : '[SKIP]';
      lines.push(`${statusIcon} ${step.stepName}`);
      lines.push(`  Actie: ${step.action}`);
      lines.push(`  Start: ${step.startTime}`);
      lines.push(`  Einde: ${step.endTime || 'n.v.t.'}`);
      lines.push(`  Status: ${step.status}`);
      
      if (step.urls && step.urls.length > 0) {
        lines.push(`  Verwerkte URL's: ${step.urls.length}`);
        if (step.urls.length <= 10) {
          for (const url of step.urls) {
            lines.push(`    - ${url}`);
          }
        } else {
          for (const url of step.urls.slice(0, 5)) {
            lines.push(`    - ${url}`);
          }
          lines.push(`    - ... en ${step.urls.length - 5} meer`);
        }
      }
      lines.push('');
    }

    // Documents section
    lines.push('DOCUMENTEN GEVONDEN');
    lines.push('-'.repeat(80));

    if (output.results.documents.length === 0) {
      lines.push('Geen documenten gevonden.');
    } else {
      lines.push(`Gevonden ${output.results.documents.length} documenten:`);
      lines.push('');

      for (const doc of output.results.documents) {
        lines.push(`${doc.title}`);
        lines.push(`  URL: ${doc.url}`);
        lines.push(`  Type: ${doc.type}`);
        lines.push(`  Bron: ${doc.sourceUrl}`);
        if (doc.relevanceScore !== undefined) {
          lines.push(`  Relevantiescore: ${doc.relevanceScore.toFixed(2)}`);
        }
        lines.push(`  Ontdekt: ${doc.discoveredAt}`);
        if (doc.metadata?.samenvatting) {
          lines.push(`  Samenvatting: ${doc.metadata.samenvatting}`);
        }
        lines.push('');
      }
    }

    // Endpoints section (final results)
    lines.push('EINDPUNTEN (EINDRESULTATEN)');
    lines.push('-'.repeat(80));

    if (output.results.endpoints.length === 0) {
      lines.push('Geen eindpunten gevonden.');
    } else {
      for (const endpoint of output.results.endpoints) {
        lines.push(`${endpoint.title} (${endpoint.type})`);
        lines.push(`  URL: ${endpoint.url}`);
        lines.push('');
      }
    }

    // Errors section
    if (output.errors.length > 0) {
      lines.push('FOUTEN');
      lines.push('-'.repeat(80));
      for (const error of output.errors) {
        lines.push(`${error.timestamp}: ${error.message}`);
        if (error.url) {
          lines.push(`  URL: ${error.url}`);
        }
      }
      lines.push('');
    }

    // Footer
    lines.push('='.repeat(80));
    lines.push('Dit rapport is automatisch gegenereerd door de Beleidsscan Workflow Engine.');
    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  /**
   * Write plain text output to file
   */
  async write(filePath: string, output: WorkflowOutput): Promise<void> {
    try {
      const text = this.generate(output);
      await fs.writeFile(filePath, text, 'utf-8');
    } catch (error) {
      console.error(`[WorkflowOutput] Failed to write TXT file ${filePath}:`, error);
      throw new Error(`Failed to write TXT output: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}


