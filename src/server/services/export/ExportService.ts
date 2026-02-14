import { Readable } from 'stream';
import { TemplateEngine } from '../templates/TemplateEngine.js';
import { TemplateContext } from '../../types/template.js';
import { getExportTemplateModel, type ExportTemplateDocument } from '../../models/ExportTemplate.js';
import type { FormatGenerator } from './formats/FormatGenerator.js';
import { CSVFormatGenerator } from './formats/CSVFormatGenerator.js';
import { PDFFormatGenerator } from './formats/PDFFormatGenerator.js';
import { JSONFormatGenerator } from './formats/JSONFormatGenerator.js';
import { XLSXFormatGenerator } from './formats/XLSXFormatGenerator.js';
import { MarkdownFormatGenerator } from './formats/MarkdownFormatGenerator.js';
import { TSVFormatGenerator } from './formats/TSVFormatGenerator.js';
import { HTMLFormatGenerator } from './formats/HTMLFormatGenerator.js';
import { XMLFormatGenerator } from './formats/XMLFormatGenerator.js';
import { RTFFormatGenerator } from './formats/RTFFormatGenerator.js';
import { YAMLFormatGenerator } from './formats/YAMLFormatGenerator.js';
import { BadRequestError, NotFoundError } from '../../types/errors.js';

export interface ExportDocument {
    id: string;
    title: string;
    url: string;
    source: string;
    publicationDate?: string;
    jurisdiction?: string;
    summary: string;
    content?: string;
}

export type ExportFormat = 'csv' | 'pdf' | 'json' | 'xlsx' | 'markdown' | 'tsv' | 'html' | 'xml' | 'rtf' | 'yaml';

export interface ExportOptions {
    format: ExportFormat;
    includeCitations?: boolean;
    citationFormat?: 'apa' | 'custom';
    searchParams?: {
        topic?: string;
        location?: string;
        jurisdiction?: string;
    };
    templateId?: string; // Optional custom template ID to use for export
}

/**
 * Service for exporting search results to various formats
 * Supports multiple export formats through format abstraction
 */
export class ExportService {
    private formatGenerators: Map<ExportFormat, FormatGenerator>;
    private templateEngine: TemplateEngine;

    constructor() {
        this.formatGenerators = new Map();
        this.templateEngine = new TemplateEngine();
        this.initializeFormats();
    }

    /**
     * Initialize format generators
     * Format generators are implemented as separate classes for better code organization
     */
    private initializeFormats(): void {
        this.formatGenerators.set('csv', new CSVFormatGenerator());
        this.formatGenerators.set('pdf', new PDFFormatGenerator());
        this.formatGenerators.set('json', new JSONFormatGenerator());
        this.formatGenerators.set('xlsx', new XLSXFormatGenerator());
        this.formatGenerators.set('markdown', new MarkdownFormatGenerator());
        this.formatGenerators.set('tsv', new TSVFormatGenerator());
        this.formatGenerators.set('html', new HTMLFormatGenerator());
        this.formatGenerators.set('xml', new XMLFormatGenerator());
        this.formatGenerators.set('rtf', new RTFFormatGenerator());
        this.formatGenerators.set('yaml', new YAMLFormatGenerator());
    }

    /**
     * Generate export content using format abstraction
     * @param documents Documents to export
     * @param options Export options
     * @returns Export content (string for text formats, Readable stream for binary formats)
     */
    async generate(documents: ExportDocument[], options: ExportOptions): Promise<string | Readable> {
        // If a custom template is specified, use it
        if (options.templateId) {
            return this.generateWithTemplate(documents, options);
        }

        // Use format generators for all supported formats
        const generator = this.formatGenerators.get(options.format);
        if (generator) {
            return generator.generate(documents, options);
        }

        throw new BadRequestError(`Unsupported export format: ${options.format}`, {
            reason: 'unsupported_export_format',
            operation: 'generate',
            format: options.format,
            supportedFormats: Array.from(this.formatGenerators.keys())
        });
    }

    /**
     * Generate export content using a custom template
     * @param documents Documents to export
     * @param options Export options (must include templateId)
     * @returns Export content (string for text formats, Readable stream for binary formats)
     */
    private async generateWithTemplate(
        documents: ExportDocument[],
        options: ExportOptions
    ): Promise<string | Readable> {
        if (!options.templateId) {
            throw new BadRequestError('templateId is required for custom template generation', {
                reason: 'missing_template_id',
                operation: 'generateWithTemplate'
            });
        }

        // Load the template
        const templateModel = getExportTemplateModel();
        const template = await templateModel.getTemplateById(options.templateId);
        
        if (!template) {
            throw new NotFoundError('Template', options.templateId, {
                reason: 'template_not_found',
                operation: 'generateWithTemplate',
            });
        }

        // Verify format matches
        if (template.format !== options.format) {
            throw new BadRequestError(`Template format (${template.format}) does not match requested format (${options.format})`, {
                reason: 'template_format_mismatch',
                operation: 'generateWithTemplate',
                templateId: options.templateId,
                templateFormat: template.format,
                requestedFormat: options.format
            });
        }

        // Increment usage count
        await templateModel.incrementUsage(options.templateId).catch(err => {
            console.warn('Failed to increment template usage:', err);
        });

        // Build template context
        const context = this.createTemplateContext(documents, options, template);

        // Render template
        const rendered = this.templateEngine.render(template.template, context);

        // For binary formats (PDF, XLSX), we need to handle them differently
        // For now, we only support text-based templates
        if (options.format === 'pdf' || options.format === 'xlsx') {
            throw new BadRequestError(`Custom templates are not yet supported for ${options.format} format. Use text-based formats (csv, markdown, html, xml, tsv, json).`, {
                reason: 'unsupported_template_format',
                operation: 'generateWithTemplate',
                format: options.format,
                templateId: options.templateId
            });
        }

        return rendered;
    }

    /**
     * Create template context from documents and options
     */
    private createTemplateContext(
        documents: ExportDocument[],
        options: ExportOptions,
        _template: ExportTemplateDocument
    ): TemplateContext {
        return {
            documents: documents.map(doc => ({
                id: doc.id,
                title: doc.title,
                url: doc.url,
                source: doc.source,
                publicationDate: doc.publicationDate,
                jurisdiction: doc.jurisdiction,
                summary: doc.summary,
                content: doc.content,
                citation: options.includeCitations
                    ? this.formatCitation(doc, options.citationFormat || 'apa')
                    : undefined
            })),
            searchParams: options.searchParams || {},
            metadata: {
                totalDocuments: documents.length,
                format: options.format,
                exportDate: new Date().toISOString(),
                includeCitations: options.includeCitations || false,
                citationFormat: options.citationFormat || 'apa'
            }
        };
    }

    /**
     * Get MIME type for export format
     */
    getMimeType(format: ExportFormat): string {
        const generator = this.formatGenerators.get(format);
        if (generator) {
            return generator.getMimeType();
        }

        // Fallback MIME types for when format generators aren't available
        const mimeTypes: Record<ExportFormat, string> = {
            csv: 'text/csv;charset=utf-8',
            pdf: 'application/pdf',
            json: 'application/json;charset=utf-8',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            markdown: 'text/markdown;charset=utf-8',
            tsv: 'text/tab-separated-values;charset=utf-8',
            html: 'text/html;charset=utf-8',
            xml: 'application/xml;charset=utf-8',
            rtf: 'application/rtf',
            yaml: 'application/x-yaml'
        };

        if (mimeTypes[format]) {
            return mimeTypes[format];
        }

        throw new BadRequestError(`Unsupported export format: ${format}`, {
            reason: 'unsupported_export_format',
            operation: 'getMimeType',
            format
        });
    }

    /**
     * Get file extension for export format
     */
    getExtension(format: ExportFormat): string {
        const generator = this.formatGenerators.get(format);
        if (generator) {
            return generator.getExtension();
        }

        // Fallback extensions
        const extensions: Record<ExportFormat, string> = {
            csv: 'csv',
            pdf: 'pdf',
            json: 'json',
            xlsx: 'xlsx',
            markdown: 'md',
            tsv: 'tsv',
            html: 'html',
            xml: 'xml',
            rtf: 'rtf',
            yaml: 'yaml'
        };

        if (extensions[format]) {
            return extensions[format];
        }

        throw new BadRequestError(`Unsupported export format: ${format}`, {
            reason: 'unsupported_export_format',
            operation: 'getMimeType',
            format
        });
    }

    /**
     * Escape CSV field value
     */
    private escapeCsvField(value: string | null | undefined): string {
        if (!value) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    /**
     * Generate CSV as a stream for large result sets
     * Uses streaming to avoid loading entire CSV into memory
     * @param documents Documents to export
     * @returns Readable stream of CSV content
     */
    generateCSVStream(documents: ExportDocument[]): Readable {
        const stream = new Readable({
            objectMode: false,
            read() {
                // Push is handled in the implementation below
            },
        });

        // Push headers immediately
        const headers = ['Title', 'URL', 'Source', 'Publication Date', 'Jurisdiction', 'Summary'];
        stream.push(headers.map((h) => this.escapeCsvField(h)).join(',') + '\n');

        // Push rows with proper backpressure handling
        let index = 0;
        const pushRows = () => {
            while (index < documents.length) {
                const doc = documents[index];
                const row = [
                    this.escapeCsvField(doc.title),
                    this.escapeCsvField(doc.url),
                    this.escapeCsvField(doc.source),
                    this.escapeCsvField(doc.publicationDate),
                    this.escapeCsvField(doc.jurisdiction),
                    this.escapeCsvField(doc.summary),
                ].join(',') + '\n';

                if (!stream.push(row)) {
                    // Stream is backpressured, pause and wait for drain
                    stream.once('drain', pushRows);
                    return;
                }
                index++;
            }
            // All rows pushed, end stream
            stream.push(null);
        };

        // Start pushing rows asynchronously
        setImmediate(pushRows);

        return stream;
    }

    /**
     * Format citation in APA or custom format
     * Used by template generation and format generators
     */
    formatCitation(document: ExportDocument, format: 'apa' | 'custom' = 'apa'): string {
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

    /**
     * Format filename for export
     */
    formatFilename(topic: string, format: ExportFormat, date?: Date): string {
        const timestamp = (date || new Date()).toISOString().split('T')[0];
        const sanitizedTopic = topic
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .substring(0, 50);
        const extension = this.getExtension(format);
        return `beleidsscan-${sanitizedTopic}-${timestamp}.${extension}`;
    }

    /**
     * Convert search result documents to export format
     */
    convertToExportDocuments(documents: Array<{
        id: string;
        content: string;
        sourceUrl?: string;
        metadata?: Record<string, unknown>;
    }>): ExportDocument[] {
        return documents.map((doc) => {
            const getMetadataValue = (key: string): string | undefined => {
                const value = doc.metadata?.[key];
                return value ? String(value) : undefined;
            };

            const title =
                getMetadataValue('title') ||
                getMetadataValue('name') ||
                getMetadataValue('titel') ||
                'Untitled';
            const url =
                doc.sourceUrl ||
                getMetadataValue('url') ||
                getMetadataValue('sourceUrl') ||
                getMetadataValue('website_url') ||
                '';
            const source =
                getMetadataValue('source') ||
                getMetadataValue('website_titel') ||
                getMetadataValue('jurisdiction') ||
                'Unknown';
            const publicationDate = getMetadataValue('publicationDate') || getMetadataValue('publicatiedatum') || getMetadataValue('date');
            const jurisdiction = getMetadataValue('jurisdiction');
            const summary =
                getMetadataValue('summary') ||
                getMetadataValue('samenvatting') ||
                doc.content.substring(0, 500) ||
                '';

            return {
                id: doc.id,
                title,
                url,
                source,
                publicationDate,
                jurisdiction,
                summary,
                content: doc.content,
            };
        });
    }
}
