import type { FormatGenerator } from './FormatGenerator.js';
import type { ExportDocument, ExportOptions } from '../ExportService.js';

/**
 * HTML format generator
 */
export class HTMLFormatGenerator implements FormatGenerator {
    generate(documents: ExportDocument[], options?: ExportOptions): string {
        const escapeHtml = (text: string): string => {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };

        let html = `<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Beleidsscan Document Export</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            line-height: 1.6;
        }
        h1 {
            color: #333;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
        }
        .metadata {
            background-color: #f5f5f5;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        th {
            background-color: #4CAF50;
            color: white;
            font-weight: bold;
        }
        tr:nth-child(even) {
            background-color: #f2f2f2;
        }
        tr:hover {
            background-color: #e8f5e9;
        }
        a {
            color: #0066cc;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <h1>Beleidsscan Document Export</h1>
    <div class="metadata">
        ${options?.searchParams?.topic ? `<p><strong>Topic:</strong> ${escapeHtml(options.searchParams.topic)}</p>` : ''}
        ${options?.searchParams?.location ? `<p><strong>Location:</strong> ${escapeHtml(options.searchParams.location)}</p>` : ''}
        ${options?.searchParams?.jurisdiction ? `<p><strong>Jurisdiction:</strong> ${escapeHtml(options.searchParams.jurisdiction)}</p>` : ''}
        <p><strong>Export Date:</strong> ${new Date().toLocaleString('nl-NL')}</p>
        <p><strong>Total Documents:</strong> ${documents.length}</p>
    </div>
    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Title</th>
                <th>URL</th>
                <th>Source</th>
                <th>Publication Date</th>
                <th>Jurisdiction</th>
            </tr>
        </thead>
        <tbody>`;

        documents.forEach((doc, index) => {
            html += `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(doc.title)}</td>
                <td><a href="${escapeHtml(doc.url)}" target="_blank">${escapeHtml(doc.url)}</a></td>
                <td>${escapeHtml(doc.source)}</td>
                <td>${escapeHtml(doc.publicationDate || '')}</td>
                <td>${escapeHtml(doc.jurisdiction || '')}</td>
            </tr>`;
        });

        html += `
        </tbody>
    </table>
    <h2>Summaries</h2>`;

        documents.forEach((doc, index) => {
            html += `
    <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #4CAF50;">
        <h3>${index + 1}. ${escapeHtml(doc.title)}</h3>
        <p>${escapeHtml(doc.summary)}</p>
        ${options?.includeCitations ? `<p><strong>Citation:</strong> ${escapeHtml(this.formatCitation(doc, options.citationFormat || 'apa'))}</p>` : ''}
    </div>`;
        });

        html += `
</body>
</html>`;

        return html;
    }

    /**
     * Format citation in APA or custom format
     * Used by HTML format generator
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
        return 'text/html;charset=utf-8';
    }

    getExtension(): string {
        return 'html';
    }
}

