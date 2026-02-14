import type { FormatGenerator } from './FormatGenerator.js';
import type { ExportDocument, ExportOptions } from '../ExportService.js';

/**
 * YAML format generator
 * YAML is useful for structured data exports and configuration files
 */
export class YAMLFormatGenerator implements FormatGenerator {
    generate(documents: ExportDocument[], options?: ExportOptions): string {
        const lines: string[] = [];

        // YAML header
        lines.push('---');
        lines.push('export_info:');
        lines.push('  title: "Beleidsscan Search Results"');
        lines.push(`  exported: "${new Date().toISOString()}"`);
        lines.push(`  total_results: ${documents.length}`);

        // Metadata section
        if (options?.searchParams) {
            lines.push('  search_parameters:');
            const params = options.searchParams;
            if (params.topic) {
                lines.push(`    topic: "${this.escapeYAML(params.topic)}"`);
            }
            if (params.location) {
                lines.push(`    location: "${this.escapeYAML(params.location)}"`);
            }
            if (params.jurisdiction) {
                lines.push(`    jurisdiction: "${this.escapeYAML(params.jurisdiction)}"`);
            }
        }

        lines.push('');
        lines.push('documents:');

        // Documents
        documents.forEach((doc, index) => {
            lines.push(`  - index: ${index + 1}`);
            lines.push(`    title: "${this.escapeYAML(doc.title)}"`);
            lines.push(`    url: "${this.escapeYAML(doc.url)}"`);

            if (doc.source) {
                lines.push(`    source: "${this.escapeYAML(doc.source)}"`);
            }
            if (doc.publicationDate) {
                lines.push(`    publication_date: "${doc.publicationDate}"`);
            }
            if (doc.jurisdiction) {
                lines.push(`    jurisdiction: "${this.escapeYAML(doc.jurisdiction)}"`);
            }
            if (doc.summary) {
                // YAML multiline string for summary
                lines.push('    summary: |');
                const summaryLines = doc.summary.split('\n');
                summaryLines.forEach(line => {
                    lines.push(`      ${this.escapeYAML(line)}`);
                });
            }
            if (doc.content) {
                // YAML multiline string for content
                lines.push('    content: |');
                const contentLines = doc.content.split('\n');
                contentLines.forEach(line => {
                    lines.push(`      ${this.escapeYAML(line)}`);
                });
            }

            if (options?.includeCitations) {
                lines.push(`    citation: "${this.escapeYAML(this.formatCitation(doc, options.citationFormat || 'apa'))}"`);
            }

            lines.push('');
        });

        lines.push('...');

        return lines.join('\n');
    }

    private escapeYAML(text: string): string {
        // Escape YAML special characters
        return text
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
    }

    private formatCitation(document: ExportDocument, format: 'apa' | 'custom' = 'apa'): string {
        if (format === 'apa') {
            const date = document.publicationDate
                ? new Date(document.publicationDate).getFullYear()
                : 'n.d.';
            const source = document.source || 'Unknown';
            return `${source}. (${date}). ${document.title}. ${document.url}`;
        } else {
            const date = document.publicationDate
                ? new Date(document.publicationDate).toLocaleDateString('nl-NL')
                : 'n.d.';
            return `[${document.title}] - ${document.source || 'Unknown'} (${date}). ${document.url}`;
        }
    }

    getMimeType(): string {
        return 'application/x-yaml';
    }

    getExtension(): string {
        return 'yaml';
    }
}

