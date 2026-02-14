import type { BronDocument } from '../services/api';
import * as ExcelJS from 'exceljs';
import { getApiBaseUrl } from './apiUrl';

/**
 * Helper to get status label from document
 */
export function getStatusLabel(doc: BronDocument): string {
    const statusLabels: Record<string, string> = {
        'pending': 'Te beoordelen',
        'approved': 'Goedgekeurd',
        'rejected': 'Afgekeurd'
    };

    if (doc.accepted === null) return statusLabels.pending;
    if (doc.accepted === true) return statusLabels.approved;
    return statusLabels.rejected;
}

/**
 * Helper to format export date for filenames
 */
export function formatExportDate(): string {
    return new Date().toISOString().split('T')[0];
}

/**
 * Helper to handle download and cleanup
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    // Debug: Wait before cleanup to ensure download starts
    setTimeout(() => {
        console.debug('Export: Cleaning up download link');
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 200);
}

/**
 * Helper to escape CSV values
 */
export function escapeCSV(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    // Escape quotes and wrap in quotes if contains comma, newline, or quote
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Helper to escape TSV values
 */
export function escapeTSV(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    // Replace tabs and newlines
    return str.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '');
}

/**
 * Helper to get document values for CSV/TSV/XLSX
 */
export function getDocumentValues(doc: BronDocument): (string | number | null | undefined)[] {
    const status = doc.accepted === null ? 'Te beoordelen' :
                   doc.accepted === true ? 'Goedgekeurd' : 'Afgekeurd';

    return [
        (doc.titel ?? null) as string | number | null | undefined,
        (doc.url ?? null) as string | number | null | undefined,
        (doc.website_url ?? null) as string | number | null | undefined,
        (doc.website_titel || '') as string | number | null | undefined,
        (doc.samenvatting ?? null) as string | number | null | undefined,
        (doc['relevantie voor zoekopdracht'] || '') as string | number | null | undefined,
        (doc.type_document || '') as string | number | null | undefined,
        (doc.publicatiedatum || '') as string | number | null | undefined,
        status,
        Array.isArray(doc.subjects) ? doc.subjects.join('; ') : '',
        Array.isArray(doc.themes) ? doc.themes.join('; ') : '',
        (doc.label || '') as string | number | null | undefined
    ];
}

/**
 * Export documents to CSV format
 */
export function exportToCSV(documents: BronDocument[], filename?: string): void {
    if (documents.length === 0) {
        throw new Error('No documents to export');
    }

    // Define CSV headers
    const headers = [
        'Titel',
        'URL',
        'Website URL',
        'Website Titel',
        'Samenvatting',
        'Relevantie voor zoekopdracht',
        'Type Document',
        'Publicatiedatum',
        'Status',
        'Subjects',
        'Themes',
        'Label'
    ];

    // Convert documents to CSV rows
    const rows = documents.map(doc => {
        return getDocumentValues(doc).map(escapeCSV).join(',');
    });

    // Combine headers and rows
    const csvContent = [headers.join(','), ...rows].join('\n');

    // Create blob and download
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
    downloadBlob(blob, filename || `beleidsscan-export-${formatExportDate()}.csv`);
}

/**
 * Export documents to JSON format
 */
export function exportToJSON(documents: BronDocument[], queryId?: string, filename?: string): void {
    if (documents.length === 0) {
        throw new Error('No documents to export');
    }

    const exportData = {
        queryId: queryId || null,
        exportDate: new Date().toISOString(),
        totalDocuments: documents.length,
        documents: documents.map(doc => ({
            _id: doc._id,
            titel: doc.titel,
            url: doc.url,
            website_url: doc.website_url,
            website_titel: doc.website_titel,
            samenvatting: doc.samenvatting,
            'relevantie voor zoekopdracht': doc['relevantie voor zoekopdracht'],
            type_document: doc.type_document,
            publicatiedatum: doc.publicatiedatum,
            accepted: doc.accepted,
            status: doc.accepted === null ? 'pending' : 
                   doc.accepted === true ? 'approved' : 'rejected',
            subjects: doc.subjects || [],
            themes: doc.themes || [],
            label: doc.label
        }))
    };

    const jsonContent = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    downloadBlob(blob, filename || `beleidsscan-export-${formatExportDate()}.json`);
}

/**
 * Export documents to Markdown format
 */
export function exportToMarkdown(documents: BronDocument[], queryId?: string, filename?: string): void {
    if (documents.length === 0) {
        throw new Error('No documents to export');
    }

    let markdown = `# Beleidsscan Document Export\n\n`;
    
    if (queryId) {
        markdown += `**Query ID:** ${queryId}\n\n`;
    }
    
    markdown += `**Export Date:** ${new Date().toLocaleString('nl-NL')}\n`;
    markdown += `**Total Documents:** ${documents.length}\n\n`;
    markdown += `---\n\n`;

    documents.forEach((doc, index) => {
        markdown += `## ${index + 1}. ${doc.titel}\n\n`;
        markdown += `- **URL:** [${doc.url}](${doc.url})\n`;
        
        if (doc.website_url) {
            markdown += `- **Website:** ${doc.website_titel || 'N/A'} ([${doc.website_url}](${doc.website_url}))\n`;
        }
        
        if (doc.type_document) {
            markdown += `- **Type:** ${doc.type_document}\n`;
        }
        
        markdown += `- **Status:** ${getStatusLabel(doc)}\n`;
        
        if (doc.publicatiedatum) {
            markdown += `- **Publication Date:** ${doc.publicatiedatum}\n`;
        }
        
        if (doc.label) {
            markdown += `- **Label:** ${doc.label}\n`;
        }
        
        if (doc.samenvatting) {
            markdown += `\n### Summary\n\n${doc.samenvatting}\n\n`;
        }
        
        if (doc['relevantie voor zoekopdracht']) {
            markdown += `### Relevance\n\n${doc['relevantie voor zoekopdracht']}\n\n`;
        }
        
        const subjects = Array.isArray(doc.subjects) ? doc.subjects : [];
        if (subjects.length > 0) {
            markdown += `**Subjects:** ${subjects.map(s => String(s)).join(', ')}\n\n`;
        }
        
        const themes = Array.isArray(doc.themes) ? doc.themes : [];
        if (themes.length > 0) {
            markdown += `**Themes:** ${themes.map(t => String(t)).join(', ')}\n\n`;
        }
        
        markdown += `---\n\n`;
    });

    // Debug: log export details
    console.debug('Markdown export:', { documentsCount: documents.length, markdownLength: markdown.length });

    const blob = new Blob([markdown], { type: 'text/markdown' });
    downloadBlob(blob, filename || `beleidsscan-export-${formatExportDate()}.md`);
}

/**
 * Export documents to XLSX format (Excel)
 * Uses exceljs instead of xlsx for better security posture
 */
export async function exportToXLSX(documents: BronDocument[], filename?: string): Promise<void> {
    if (documents.length === 0) {
        throw new Error('No documents to export');
    }

    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Documenten');

    // Define headers
    const headers = [
        'Titel',
        'URL',
        'Website URL',
        'Website Titel',
        'Samenvatting',
        'Relevantie voor zoekopdracht',
        'Type Document',
        'Publicatiedatum',
        'Status',
        'Subjects',
        'Themes',
        'Label'
    ];

    // Add headers
    worksheet.addRow(headers);

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows
    documents.forEach(doc => {
        worksheet.addRow(getDocumentValues(doc));
    });

    // Set column widths for better readability
    worksheet.columns = [
        { width: 40 }, // Titel
        { width: 50 }, // URL
        { width: 50 }, // Website URL
        { width: 30 }, // Website Titel
        { width: 60 }, // Samenvatting
        { width: 60 }, // Relevantie
        { width: 20 }, // Type Document
        { width: 15 }, // Publicatiedatum
        { width: 15 }, // Status
        { width: 30 }, // Subjects
        { width: 30 }, // Themes
        { width: 20 }  // Label
    ];

    // Generate file and download
    const excelBuffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    downloadBlob(blob, filename || `beleidsscan-export-${formatExportDate()}.xlsx`);
}

/**
 * Export documents to TSV format (Tab-Separated Values)
 */
export function exportToTSV(documents: BronDocument[], filename?: string): void {
    if (documents.length === 0) {
        throw new Error('No documents to export');
    }

    // Define TSV headers
    const headers = [
        'Titel',
        'URL',
        'Website URL',
        'Website Titel',
        'Samenvatting',
        'Relevantie voor zoekopdracht',
        'Type Document',
        'Publicatiedatum',
        'Status',
        'Subjects',
        'Themes',
        'Label'
    ];

    // Convert documents to TSV rows
    const rows = documents.map(doc => {
        return getDocumentValues(doc).map(escapeTSV).join('\t');
    });

    // Combine headers and rows
    const tsvContent = [headers.join('\t'), ...rows].join('\n');

    // Create blob and download
    const blob = new Blob(['\ufeff' + tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' }); // BOM for Excel
    downloadBlob(blob, filename || `beleidsscan-export-${formatExportDate()}.tsv`);
}

/**
 * Export documents to HTML format
 */
export function exportToHTML(documents: BronDocument[], queryId?: string, filename?: string): void {
    if (documents.length === 0) {
        throw new Error('No documents to export');
    }

    const escapeHtml = (text: string): string => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
        .status-pending {
            color: #ff9800;
            font-weight: bold;
        }
        .status-approved {
            color: #4caf50;
            font-weight: bold;
        }
        .status-rejected {
            color: #f44336;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <h1>Beleidsscan Document Export</h1>
    <div class="metadata">
        ${queryId ? `<p><strong>Query ID:</strong> ${escapeHtml(queryId)}</p>` : ''}
        <p><strong>Export Date:</strong> ${new Date().toLocaleString('nl-NL')}</p>
        <p><strong>Total Documents:</strong> ${documents.length}</p>
    </div>
    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Titel</th>
                <th>URL</th>
                <th>Website</th>
                <th>Type</th>
                <th>Publicatiedatum</th>
                <th>Status</th>
                <th>Subjects</th>
                <th>Themes</th>
                <th>Label</th>
            </tr>
        </thead>
        <tbody>`;

    documents.forEach((doc, index) => {
        const statusClass = doc.accepted === null ? 'status-pending' : 
                           doc.accepted === true ? 'status-approved' : 'status-rejected';
        
        html += `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(doc.titel || '')}</td>
                <td><a href="${escapeHtml(doc.url)}" target="_blank">${escapeHtml(doc.url)}</a></td>
                <td>${escapeHtml(String(doc.website_titel || doc.website_url || ''))}</td>
                <td>${escapeHtml(String(doc.type_document || ''))}</td>
                <td>${escapeHtml(String(doc.publicatiedatum || ''))}</td>
                <td class="${statusClass}">${escapeHtml(getStatusLabel(doc))}</td>
                <td>${escapeHtml(Array.isArray(doc.subjects) ? doc.subjects.map(s => String(s)).join(', ') : '')}</td>
                <td>${escapeHtml(Array.isArray(doc.themes) ? doc.themes.map(t => String(t)).join(', ') : '')}</td>
                <td>${escapeHtml(String(doc.label || ''))}</td>
            </tr>`;
    });

    html += `
        </tbody>
    </table>
    ${documents.some(doc => doc.samenvatting) ? `
    <h2>Samenvattingen</h2>
    ${documents.map((doc, index) => 
        doc.samenvatting ? `
    <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #4CAF50;">
        <h3>${index + 1}. ${escapeHtml(doc.titel || '')}</h3>
        <p>${escapeHtml(doc.samenvatting)}</p>
        ${doc['relevantie voor zoekopdracht'] ? `<p><strong>Relevantie:</strong> ${escapeHtml(doc['relevantie voor zoekopdracht'])}</p>` : ''}
    </div>` : ''
    ).join('')}
    ` : ''}
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    downloadBlob(blob, filename || `beleidsscan-export-${formatExportDate()}.html`);
}

/**
 * Export documents to XML format
 */
export function exportToXML(documents: BronDocument[], queryId?: string, filename?: string): void {
    if (documents.length === 0) {
        throw new Error('No documents to export');
    }

    const escapeXml = (text: string): string => {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    };

    const getStatusLabel = (doc: BronDocument): string => {
        if (doc.accepted === null) return 'pending';
        if (doc.accepted === true) return 'approved';
        return 'rejected';
    };

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<beleidsscan-export>
    <metadata>
        ${queryId ? `<query-id>${escapeXml(queryId)}</query-id>` : ''}
        <export-date>${new Date().toISOString()}</export-date>
        <total-documents>${documents.length}</total-documents>
    </metadata>
    <documents>`;

    documents.forEach((doc, index) => {
        xml += `
        <document id="${index + 1}">
            <id>${doc._id ? escapeXml(String(doc._id)) : ''}</id>
            <titel>${escapeXml(doc.titel || '')}</titel>
            <url>${escapeXml(String(doc.url))}</url>
            <website-url>${escapeXml(String(doc.website_url || ''))}</website-url>
            <website-titel>${escapeXml(String(doc.website_titel || ''))}</website-titel>
            <samenvatting>${escapeXml(String(doc.samenvatting || ''))}</samenvatting>
            <relevantie-voor-zoekopdracht>${escapeXml(String(doc['relevantie voor zoekopdracht'] || ''))}</relevantie-voor-zoekopdracht>
            <type-document>${escapeXml(String(doc.type_document || ''))}</type-document>
            <publicatiedatum>${escapeXml(String(doc.publicatiedatum || ''))}</publicatiedatum>
            <status>${escapeXml(getStatusLabel(doc))}</status>
            <accepted>${doc.accepted === null ? 'null' : doc.accepted ? 'true' : 'false'}</accepted>
            <subjects>${Array.isArray(doc.subjects) ? doc.subjects.map(s => `<subject>${escapeXml(String(s))}</subject>`).join('') : ''}</subjects>
            <themes>${Array.isArray(doc.themes) ? doc.themes.map(t => `<theme>${escapeXml(String(t))}</theme>`).join('') : ''}</themes>
            <label>${escapeXml(String(doc.label || ''))}</label>
        </document>`;
    });

    xml += `
    </documents>
</beleidsscan-export>`;

    const blob = new Blob([xml], { type: 'application/xml' });
    downloadBlob(blob, filename || `beleidsscan-export-${formatExportDate()}.xml`);
}

/**
 * Export documents to PDF format via server API
 */
export async function exportToPDF(
    documents: BronDocument[],
    options?: {
        queryId?: string;
        filename?: string;
        includeCitations?: boolean;
        citationFormat?: 'apa' | 'custom';
        searchParams?: {
            topic?: string;
            location?: string;
            jurisdiction?: string;
        };
    }
): Promise<void> {
    if (documents.length === 0) {
        throw new Error('No documents to export');
    }

    // Use the normalized API base URL that handles localhost:4000 normalization
    const API_BASE_URL = getApiBaseUrl();
    const token = localStorage.getItem('auth_token');

    // Convert BronDocument to the format expected by the server
    const documentsForExport = documents.map(doc => ({
        id: doc._id || '',
        content: doc.samenvatting || '',
        sourceUrl: doc.url,
        metadata: {
            title: doc.titel,
            titel: doc.titel,
            url: doc.url,
            website_url: doc.website_url,
            website_titel: doc.website_titel,
            samenvatting: doc.samenvatting,
            'relevantie voor zoekopdracht': doc['relevantie voor zoekopdracht'],
            type_document: doc.type_document,
            publicatiedatum: doc.publicatiedatum,
            publicationDate: doc.publicatiedatum,
            jurisdiction: doc.website_titel,
            source: doc.website_titel || doc.website_url,
            summary: doc.samenvatting,
        },
    }));

    try {
        const response = await fetch(`${API_BASE_URL}/export`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
                documents: documentsForExport,
                format: 'pdf',
                includeCitations: options?.includeCitations || false,
                citationFormat: options?.citationFormat || 'apa',
                searchParams: options?.searchParams,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorData: { error?: string; message?: string };
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { message: errorText || response.statusText };
            }
            throw new Error(errorData.error || errorData.message || `Failed to export PDF: ${response.status}`);
        }

        // Get PDF blob
        const blob = await response.blob();
        downloadBlob(blob, options?.filename || `beleidsscan-export-${formatExportDate()}.pdf`);
    } catch (error) {
        if (error instanceof Error) {
            throw error;
        }
        throw new Error('Failed to export PDF: Unknown error');
    }
}

/**
 * Export documents in the specified format
 * Note: For XLSX and PDF formats, this function is async due to external dependencies/API calls
 */
export async function exportDocuments(
    documents: BronDocument[],
    format: 'csv' | 'json' | 'markdown' | 'xlsx' | 'tsv' | 'html' | 'xml' | 'pdf',
    options?: {
        queryId?: string;
        filename?: string;
        includeCitations?: boolean;
        citationFormat?: 'apa' | 'custom';
        searchParams?: {
            topic?: string;
            location?: string;
            jurisdiction?: string;
        };
    }
): Promise<void> {
    if (documents.length === 0) {
        throw new Error('No documents to export');
    }

    switch (format) {
        case 'csv':
            exportToCSV(documents, options?.filename);
            break;
        case 'json':
            exportToJSON(documents, options?.queryId, options?.filename);
            break;
        case 'markdown':
            exportToMarkdown(documents, options?.queryId, options?.filename);
            break;
        case 'xlsx':
            await exportToXLSX(documents, options?.filename);
            break;
        case 'tsv':
            exportToTSV(documents, options?.filename);
            break;
        case 'html':
            exportToHTML(documents, options?.queryId, options?.filename);
            break;
        case 'xml':
            exportToXML(documents, options?.queryId, options?.filename);
            break;
        case 'pdf':
            await exportToPDF(documents, options);
            break;
        default:
            throw new Error(`Unsupported export format: ${format}`);
    }
}
