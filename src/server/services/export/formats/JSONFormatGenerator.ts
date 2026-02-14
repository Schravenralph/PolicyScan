import type { FormatGenerator } from './FormatGenerator.js';
import type { ExportDocument, ExportOptions } from '../ExportService.js';

/**
 * JSON format generator
 */
export class JSONFormatGenerator implements FormatGenerator {
    generate(documents: ExportDocument[], options?: ExportOptions): string {
        const exportData = {
            metadata: {
                exportedAt: new Date().toISOString(),
                format: 'json',
                version: '1.0',
                searchParams: options?.searchParams,
                totalDocuments: documents.length,
            },
            documents: documents.map((doc) => ({
                id: doc.id,
                title: doc.title,
                url: doc.url,
                source: doc.source,
                publicationDate: doc.publicationDate,
                jurisdiction: doc.jurisdiction,
                summary: doc.summary,
                ...(options?.includeCitations && {
                    citation: this.formatCitation(doc, options.citationFormat || 'apa'),
                }),
            })),
        };

        return JSON.stringify(exportData, null, 2);
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
        return 'application/json;charset=utf-8';
    }

    getExtension(): string {
        return 'json';
    }
}

