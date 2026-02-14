import type { FormatGenerator } from './FormatGenerator.js';
import type { ExportDocument } from '../ExportService.js';

/**
 * TSV (Tab-Separated Values) format generator
 */
export class TSVFormatGenerator implements FormatGenerator {
    generate(documents: ExportDocument[]): string {
        const headers = ['Title', 'URL', 'Source', 'Publication Date', 'Jurisdiction', 'Summary'];
        const rows = documents.map((doc) => {
            const escapeTSV = (value: string | null | undefined): string => {
                if (!value) return '';
                const str = String(value);
                // Replace tabs and newlines
                return str.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '');
            };

            return [
                escapeTSV(doc.title),
                escapeTSV(doc.url),
                escapeTSV(doc.source),
                escapeTSV(doc.publicationDate),
                escapeTSV(doc.jurisdiction),
                escapeTSV(doc.summary),
            ].join('\t');
        });

        return [headers.join('\t'), ...rows].join('\n');
    }

    getMimeType(): string {
        return 'text/tab-separated-values;charset=utf-8';
    }

    getExtension(): string {
        return 'tsv';
    }
}

