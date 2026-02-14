import PDFDocument from 'pdfkit';
import { PassThrough, Readable } from 'stream';
import type { FormatGenerator } from './FormatGenerator.js';
import type { ExportDocument, ExportOptions } from '../ExportService.js';

/**
 * PDF format generator
 */
export class PDFFormatGenerator implements FormatGenerator {
    generate(documents: ExportDocument[], options?: ExportOptions): Readable {
        const doc = new PDFDocument({ margin: 50 });
        const stream = new PassThrough();

        doc.pipe(stream);

        // Header with search parameters
        if (options?.searchParams) {
            doc.fontSize(16).font('Helvetica-Bold').text('Beleidsscan Search Results', { align: 'center' });
            doc.moveDown(0.5);
            
            const params = options.searchParams;
            doc.fontSize(10).font('Helvetica').text(`Topic: ${params.topic || 'N/A'}`, { align: 'left' });
            if (params.location) {
                doc.text(`Location: ${params.location}`, { align: 'left' });
            }
            if (params.jurisdiction) {
                doc.text(`Jurisdiction: ${params.jurisdiction}`, { align: 'left' });
            }
            doc.text(`Results: ${documents.length}`, { align: 'left' });
            doc.moveDown(1);
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(1);
        }

        // Document results
        documents.forEach((document, index) => {
            // Check if we need a new page
            if (index > 0 && doc.y > 700) {
                doc.addPage();
            }

            // Title with link
            doc.fontSize(14).font('Helvetica-Bold').text(`${index + 1}. ${document.title}`, {
                link: document.url,
                underline: true,
            });
            doc.moveDown(0.3);

            // Metadata
            doc.fontSize(10).font('Helvetica').fillColor('gray');
            const metadata = [
                document.source && `Source: ${document.source}`,
                document.publicationDate && `Date: ${document.publicationDate}`,
                document.jurisdiction && `Jurisdiction: ${document.jurisdiction}`,
            ].filter(Boolean);
            if (metadata.length > 0) {
                doc.text(metadata.join(' | '));
            }
            doc.moveDown(0.3);

            // Summary
            doc.fontSize(11).font('Helvetica').fillColor('black');
            doc.text(document.summary, {
                width: 500,
                align: 'justify',
            });

            // Citation if enabled
            if (options?.includeCitations) {
                doc.moveDown(0.5);
                doc.fontSize(9).font('Helvetica-Oblique').fillColor('gray');
                const citation = this.formatCitation(document, options.citationFormat || 'apa');
                doc.text(`Citation: ${citation}`, {
                    width: 500,
                    indent: 20,
                });
            }

            doc.moveDown(1);
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(0.5);
        });

        // Footer with export timestamp
        const totalPages = doc.bufferedPageRange().count;
        for (let i = 0; i < totalPages; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).font('Helvetica').fillColor('gray');
            doc.text(
                `Exported: ${new Date().toLocaleString('nl-NL')}`,
                50,
                doc.page.height - 30,
                { align: 'left' }
            );
        }

        doc.end();
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
        return 'application/pdf';
    }

    getExtension(): string {
        return 'pdf';
    }
}

