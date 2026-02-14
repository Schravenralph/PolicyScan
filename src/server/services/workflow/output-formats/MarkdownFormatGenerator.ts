import * as fs from 'fs/promises';
import type { WorkflowOutput } from '../WorkflowOutputService.js';
import type { FormatGenerator } from './FormatGenerator.js';

/**
 * Generates Markdown format output from workflow results
 */
export class MarkdownFormatGenerator implements FormatGenerator {
  /**
   * Generate Markdown string from workflow output
   */
  generate(output: WorkflowOutput): string {
    const lines: string[] = [];

    // Header
    lines.push(`# Workflow-uitvoer: ${output.metadata.workflowName}`);
    lines.push('');
    lines.push(`> Gegenereerd: ${new Date().toISOString()}`);
    lines.push('');

    // Metadata section
    lines.push('## Metadata');
    lines.push('');
    lines.push('| Eigenschap | Waarde |');
    lines.push('|------------|--------|');
    lines.push(`| Run-ID | \`${output.metadata.runId}\` |`);
    lines.push(`| Workflow-ID | \`${output.metadata.workflowId}\` |`);
    lines.push(`| Status | **${output.metadata.status}** |`);
    lines.push(`| Starttijd | ${output.metadata.startTime} |`);
    lines.push(`| Eindtijd | ${output.metadata.endTime || 'Lopend'} |`);
    lines.push('');

    // Parameters section
    lines.push('## Parameters');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(output.parameters, null, 2));
    lines.push('```');
    lines.push('');

    // Summary section
    lines.push('## Samenvatting');
    lines.push('');
    lines.push('| Maatstaf | Aantal |');
    lines.push('|----------|--------|');
    lines.push(`| Totaal bezochte pagina's | ${output.results.summary.totalPages} |`);
    lines.push(`| Totaal gevonden documenten | ${output.results.summary.totalDocuments} |`);
    lines.push(`| Nieuw ontdekt | ${output.results.summary.newlyDiscovered} |`);
    lines.push(`| Bestaand | ${output.results.summary.existing} |`);
    lines.push(`| Fouten | ${output.results.summary.errors} |`);
    
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
      lines.push('### Externe Links Verkenning');
      lines.push('');
      lines.push('| Maatstaf | Aantal |');
      lines.push('|----------|--------|');
      lines.push(`| Verwerkte externe links | ${summaryWithExtras.externalLinksProcessed} |`);
      lines.push(`| Verzamelde externe links | ${summaryWithExtras.externalLinksCollected ?? 0} |`);
      lines.push(`| Gescande IPLO pagina's | ${summaryWithExtras.iploPagesScanned ?? 0} |`);
      if (summaryWithExtras.failedPages && summaryWithExtras.failedPages > 0) {
        lines.push(`| Gefaalde pagina's | ${summaryWithExtras.failedPages} |`);
      }
      if (summaryWithExtras.filteredLinks && summaryWithExtras.filteredLinks > 0) {
        lines.push(`| Gefilterde links | ${summaryWithExtras.filteredLinks} |`);
      }
    }
    lines.push('');

    // Trace section
    lines.push('## Uitvoeringstrace');
    lines.push('');
    lines.push(`Totaal bezochte URL's: **${output.trace.totalUrlsVisited}**`);
    lines.push('');
    
    for (const step of output.trace.steps) {
      const statusIcon = step.status === 'success' ? '✅' : step.status === 'failed' ? '❌' : '⏭️';
      lines.push(`### ${statusIcon} ${step.stepName}`);
      lines.push('');
      lines.push(`- **Actie**: \`${step.action}\``);
      lines.push(`- **Start**: ${step.startTime}`);
      lines.push(`- **Einde**: ${step.endTime || 'n.v.t.'}`);
      lines.push(`- **Status**: ${step.status}`);
      
      if (step.urls && step.urls.length > 0) {
        lines.push(`- **Verwerkte URL's**: ${step.urls.length}`);
        if (step.urls.length <= 10) {
          for (const url of step.urls) {
            lines.push(`  - ${url}`);
          }
        } else {
          for (const url of step.urls.slice(0, 5)) {
            lines.push(`  - ${url}`);
          }
          lines.push(`  - ... en ${step.urls.length - 5} meer`);
        }
      }
      lines.push('');
    }

    // Documents section
    lines.push('## Documenten gevonden');
    lines.push('');

    if (output.results.documents.length === 0) {
      lines.push('*Geen documenten gevonden.*');
    } else {
      lines.push(`Gevonden **${output.results.documents.length}** documenten:`);
      lines.push('');

      for (const doc of output.results.documents) {
        lines.push(`### ${doc.title}`);
        lines.push('');
        lines.push(`- **URL**: [${doc.url}](${doc.url})`);
        lines.push(`- **Type**: ${doc.type}`);
        lines.push(`- **Bron**: ${doc.sourceUrl}`);
        if (doc.relevanceScore !== undefined) {
          lines.push(`- **Relevantiescore**: ${doc.relevanceScore.toFixed(2)}`);
        }
        lines.push(`- **Ontdekt**: ${doc.discoveredAt}`);
        if (doc.metadata?.samenvatting) {
          lines.push('');
          lines.push(`> ${doc.metadata.samenvatting}`);
        }
        lines.push('');
      }
    }

    // Endpoints section (final results)
    lines.push('## Eindpunten (eindresultaten)');
    lines.push('');

    if (output.results.endpoints.length === 0) {
      lines.push('*Geen eindpunten gevonden.*');
    } else {
      lines.push('| Titel | Type | URL |');
      lines.push('|-------|------|-----|');
      for (const endpoint of output.results.endpoints) {
        const shortUrl = endpoint.url.length > 60 
          ? endpoint.url.substring(0, 57) + '...' 
          : endpoint.url;
        lines.push(`| ${endpoint.title} | ${endpoint.type} | [${shortUrl}](${endpoint.url}) |`);
      }
    }
    lines.push('');

    // Errors section
    if (output.errors.length > 0) {
      lines.push('## Fouten');
      lines.push('');
      for (const error of output.errors) {
        lines.push(`- **${error.timestamp}**: ${error.message}`);
        if (error.url) {
          lines.push(`  - URL: ${error.url}`);
        }
      }
      lines.push('');
    }

    // Footer
    lines.push('---');
    lines.push('');
    lines.push('*Dit rapport is automatisch gegenereerd door de Beleidsscan Workflow Engine.*');

    return lines.join('\n');
  }

  /**
   * Write Markdown output to file
   */
  async write(filePath: string, output: WorkflowOutput): Promise<void> {
    try {
      const md = this.generate(output);
      await fs.writeFile(filePath, md, 'utf-8');
    } catch (error) {
      console.error(`[WorkflowOutput] Failed to write Markdown file ${filePath}:`, error);
      throw new Error(`Failed to write Markdown output: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

