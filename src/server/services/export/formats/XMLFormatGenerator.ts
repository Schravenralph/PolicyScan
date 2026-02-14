import type { FormatGenerator } from './FormatGenerator.js';
import type { ExportDocument, ExportOptions } from '../ExportService.js';

/**
 * XML format generator
 */
export class XMLFormatGenerator implements FormatGenerator {
    generate(documents: ExportDocument[], options?: ExportOptions): string {
        const escapeXml = (text: string): string => {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        };

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<beleidsscan-export>
    <metadata>
        ${options?.searchParams?.topic ? `<topic>${escapeXml(options.searchParams.topic)}</topic>` : ''}
        ${options?.searchParams?.location ? `<location>${escapeXml(options.searchParams.location)}</location>` : ''}
        ${options?.searchParams?.jurisdiction ? `<jurisdiction>${escapeXml(options.searchParams.jurisdiction)}</jurisdiction>` : ''}
        <export-date>${new Date().toISOString()}</export-date>
        <total-documents>${documents.length}</total-documents>
    </metadata>
    <documents>`;

        documents.forEach((doc, index) => {
            xml += `
        <document id="${index + 1}">
            <id>${escapeXml(doc.id)}</id>
            <title>${escapeXml(doc.title)}</title>
            <url>${escapeXml(doc.url)}</url>
            <source>${escapeXml(doc.source)}</source>
            ${doc.publicationDate ? `<publication-date>${escapeXml(doc.publicationDate)}</publication-date>` : ''}
            ${doc.jurisdiction ? `<jurisdiction>${escapeXml(doc.jurisdiction)}</jurisdiction>` : ''}
            <summary>${escapeXml(doc.summary)}</summary>
            ${doc.content ? `<content>${escapeXml(doc.content)}</content>` : ''}
            ${options?.includeCitations ? `<citation>${escapeXml(this.formatCitation(doc, options.citationFormat || 'apa'))}</citation>` : ''}
        </document>`;
        });

        xml += `
    </documents>
</beleidsscan-export>`;

        return xml;
    }

    /**
     * Format citation in APA or custom format
     * Used by XML format generator
     */
    private formatCitation(document: ExportDocument, format: 'apa' | 'custom' = 'apa'): string {
        if (format === 'apa') {
            // APA format: Author/Organization. (Year). Title. URL
            const date = document.publicationDate
                ? new Date(document.publicationDate).getFullYear()
                : 'n.d.';
            const source = document.source || 'Unknown';
            return `${source}. (${date}). ${document.title}. ${document.url}`;
        } else {
            // Custom format: [Title] - Source (Date). URL
            const date = document.publicationDate
                ? new Date(document.publicationDate).toLocaleDateString('nl-NL')
                : 'n.d.';
            return `[${document.title}] - ${document.source || 'Unknown'} (${date}). ${document.url}`;
        }
    }

    getMimeType(): string {
        return 'application/xml;charset=utf-8';
    }

    getExtension(): string {
        return 'xml';
    }
}

