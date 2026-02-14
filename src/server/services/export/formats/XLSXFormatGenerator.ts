import ExcelJS from 'exceljs';
import { PassThrough, Readable } from 'stream';
import type { FormatGenerator } from './FormatGenerator.js';
import type { ExportDocument, ExportOptions } from '../ExportService.js';

/**
 * XLSX format generator
 */
export class XLSXFormatGenerator implements FormatGenerator {
    async generateAsync(documents: ExportDocument[], options?: ExportOptions): Promise<Buffer> {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Search Results');

        // Add header row
        worksheet.addRow([
            'Title',
            'URL',
            'Source',
            'Publication Date',
            'Jurisdiction',
            'Summary',
            ...(options?.includeCitations ? ['Citation'] : []),
        ]);

        // Style header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' },
        };

        // Add data rows
        documents.forEach((doc) => {
            const row = [
                doc.title,
                doc.url,
                doc.source,
                doc.publicationDate || '',
                doc.jurisdiction || '',
                doc.summary,
            ];

            if (options?.includeCitations) {
                row.push(this.formatCitation(doc, options.citationFormat || 'apa'));
            }

            worksheet.addRow(row);
        });

        // Set column widths
        worksheet.columns = [
            { width: 40 }, // Title
            { width: 50 }, // URL
            { width: 30 }, // Source
            { width: 15 }, // Publication Date
            { width: 20 }, // Jurisdiction
            { width: 60 }, // Summary
            ...(options?.includeCitations ? [{ width: 60 }] : []), // Citation
        ];

        // Add metadata sheet
        if (options?.searchParams) {
            const metadataSheet = workbook.addWorksheet('Metadata');
            metadataSheet.addRow(['Export Date', new Date().toISOString()]);
            if (options.searchParams.topic) {
                metadataSheet.addRow(['Topic', options.searchParams.topic]);
            }
            if (options.searchParams.location) {
                metadataSheet.addRow(['Location', options.searchParams.location]);
            }
            if (options.searchParams.jurisdiction) {
                metadataSheet.addRow(['Jurisdiction', options.searchParams.jurisdiction]);
            }
            metadataSheet.addRow(['Total Documents', documents.length]);
        }

        return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    }

    generate(documents: ExportDocument[], options?: ExportOptions): Readable {
        const stream = new PassThrough();
        
        // Generate XLSX asynchronously and pipe to stream
        this.generateAsync(documents, options)
            .then((buffer) => {
                stream.push(buffer);
                stream.push(null); // End stream
            })
            .catch((error) => {
                stream.destroy(error);
            });

        return stream;
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
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    getExtension(): string {
        return 'xlsx';
    }
}

