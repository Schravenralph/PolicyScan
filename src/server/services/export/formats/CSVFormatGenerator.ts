import type { FormatGenerator } from './FormatGenerator.js';
import type { ExportDocument } from '../ExportService.js';

/**
 * CSV format generator
 */
export class CSVFormatGenerator implements FormatGenerator {
    generate(documents: ExportDocument[]): string {
        const headers = ['Title', 'URL', 'Source', 'Publication Date', 'Jurisdiction', 'Summary'];
        const rows = documents.map((doc) => {
            const escapeCsvField = (value: string | null | undefined): string => {
                if (!value) return '';
                const str = String(value);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            return [
                escapeCsvField(doc.title),
                escapeCsvField(doc.url),
                escapeCsvField(doc.source),
                escapeCsvField(doc.publicationDate),
                escapeCsvField(doc.jurisdiction),
                escapeCsvField(doc.summary),
            ].join(',');
        });

        return [headers.join(','), ...rows].join('\n');
    }

    getMimeType(): string {
        return 'text/csv;charset=utf-8';
    }

    getExtension(): string {
        return 'csv';
    }
}

