import type { FormatGenerator } from './FormatGenerator.js';
import type { ExportDocument, ExportOptions } from '../ExportService.js';

/**
 * RTF (Rich Text Format) format generator
 * RTF is a cross-platform document format that can be opened by Microsoft Word and other word processors
 */
export class RTFFormatGenerator implements FormatGenerator {
    generate(documents: ExportDocument[], options?: ExportOptions): string {
        const lines: string[] = [];

        // RTF header
        lines.push('{\\rtf1\\ansi\\deff0');
        lines.push('{\\fonttbl{\\f0 Times New Roman;}}');
        lines.push('{\\colortbl;\\red0\\green0\\blue0;}');
        lines.push('\\f0\\fs24'); // Default font, size 12pt

        // Title
        lines.push('{\\b\\fs32 Beleidsscan Search Results}\\par\\par');

        // Metadata section
        if (options?.searchParams) {
            lines.push('{\\b Search Parameters}\\par');
            const params = options.searchParams;
            if (params.topic) {
                lines.push(`Topic: ${this.escapeRTF(params.topic)}\\par`);
            }
            if (params.location) {
                lines.push(`Location: ${this.escapeRTF(params.location)}\\par`);
            }
            if (params.jurisdiction) {
                lines.push(`Jurisdiction: ${this.escapeRTF(params.jurisdiction)}\\par`);
            }
            lines.push(`Total Results: ${documents.length}\\par`);
            lines.push(`Exported: ${new Date().toLocaleString('nl-NL')}\\par`);
            lines.push('\\par');
            lines.push('\\par');
        }

        // Documents
        documents.forEach((doc, index) => {
            lines.push(`{\\b ${index + 1}. ${this.escapeRTF(doc.title)}}\\par`);
            lines.push(`URL: {\\field{\\*\\fldinst HYPERLINK "${this.escapeRTF(doc.url)}"}{\\fldrslt ${this.escapeRTF(doc.url)}}}\\par`);

            const metadata: string[] = [];
            if (doc.source) {
                metadata.push(`Source: ${this.escapeRTF(doc.source)}`);
            }
            if (doc.publicationDate) {
                metadata.push(`Publication Date: ${this.escapeRTF(doc.publicationDate)}`);
            }
            if (doc.jurisdiction) {
                metadata.push(`Jurisdiction: ${this.escapeRTF(doc.jurisdiction)}`);
            }
            if (metadata.length > 0) {
                lines.push(metadata.join(' | ') + '\\par');
            }

            if (doc.summary) {
                lines.push('\\par');
                lines.push('{\\b Summary}\\par');
                lines.push(this.escapeRTF(doc.summary) + '\\par');
            }

            if (options?.includeCitations) {
                lines.push('\\par');
                lines.push(`{\\b Citation:} ${this.escapeRTF(this.formatCitation(doc, options.citationFormat || 'apa'))}\\par`);
            }

            lines.push('\\par');
            lines.push('\\par');
        });

        // RTF footer
        lines.push('}');

        return lines.join('\n');
    }

    private escapeRTF(text: string): string {
        // Escape RTF special characters
        return text
            .replace(/\\/g, '\\\\')
            .replace(/{/g, '\\{')
            .replace(/}/g, '\\}')
            .replace(/\n/g, '\\par ');
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
        return 'application/rtf';
    }

    getExtension(): string {
        return 'rtf';
    }
}

