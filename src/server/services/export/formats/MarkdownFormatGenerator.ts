import type { FormatGenerator } from './FormatGenerator.js';
import type { ExportDocument, ExportOptions } from '../ExportService.js';

/**
 * Markdown format generator
 */
export class MarkdownFormatGenerator implements FormatGenerator {
    generate(documents: ExportDocument[], options?: ExportOptions): string {
        const lines: string[] = [];

        // Header
        lines.push('# Beleidsscan Search Results\n');

        // Metadata section
        if (options?.searchParams) {
            lines.push('## Search Parameters\n');
            const params = options.searchParams;
            if (params.topic) {
                lines.push(`- **Topic:** ${params.topic}`);
            }
            if (params.location) {
                lines.push(`- **Location:** ${params.location}`);
            }
            if (params.jurisdiction) {
                lines.push(`- **Jurisdiction:** ${params.jurisdiction}`);
            }
            lines.push(`- **Total Results:** ${documents.length}`);
            lines.push(`- **Exported:** ${new Date().toLocaleString('nl-NL')}\n`);
            lines.push('---\n');
        }

        // Documents
        documents.forEach((doc, index) => {
            lines.push(`## ${index + 1}. ${this.escapeMarkdown(doc.title)}\n`);
            lines.push(`**URL:** [${doc.url}](${doc.url})\n`);
            
            const metadata: string[] = [];
            if (doc.source) {
                metadata.push(`**Source:** ${doc.source}`);
            }
            if (doc.publicationDate) {
                metadata.push(`**Publication Date:** ${doc.publicationDate}`);
            }
            if (doc.jurisdiction) {
                metadata.push(`**Jurisdiction:** ${doc.jurisdiction}`);
            }
            if (metadata.length > 0) {
                lines.push(metadata.join(' | '));
                lines.push('');
            }

            if (doc.summary) {
                lines.push('### Summary\n');
                lines.push(doc.summary);
                lines.push('');
            }

            if (options?.includeCitations) {
                lines.push(`**Citation:** ${this.formatCitation(doc, options.citationFormat || 'apa')}\n`);
            }

            lines.push('---\n');
        });

        return lines.join('\n');
    }

    private escapeMarkdown(text: string): string {
        // Escape markdown special characters
        return text.replace(/([#*_`[\]()])/g, '\\$1');
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
        return 'text/markdown;charset=utf-8';
    }

    getExtension(): string {
        return 'md';
    }
}

