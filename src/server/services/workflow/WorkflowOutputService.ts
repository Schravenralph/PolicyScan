import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Run, type WorkflowResultEndpoint } from '../infrastructure/types.js';
import { Template, TemplateValidationResult } from '../../types/template.js';
import { MarkdownFormatGenerator } from './output-formats/MarkdownFormatGenerator.js';
import { TextFormatGenerator } from './output-formats/TextFormatGenerator.js';
import { JsonFormatGenerator } from './output-formats/JsonFormatGenerator.js';
import { CsvFormatGenerator } from './output-formats/CsvFormatGenerator.js';
import { TsvFormatGenerator } from './output-formats/TsvFormatGenerator.js';
import { HtmlFormatGenerator } from './output-formats/HtmlFormatGenerator.js';
import { XmlFormatGenerator } from './output-formats/XmlFormatGenerator.js';
import { PdfFormatGenerator } from './output-formats/PdfFormatGenerator.js';
import { XlsxFormatGenerator } from './output-formats/XlsxFormatGenerator.js';
import { WorkflowOutputBuilder } from './output-builders/WorkflowOutputBuilder.js';
import { WorkflowOutputTemplateService } from './output-templates/WorkflowOutputTemplateService.js';
import { WorkflowOutputStorage } from './output-storage/WorkflowOutputStorage.js';
import { logger } from '../../utils/logger.js';

/**
 * Represents a single step in the workflow trace
 */
export interface WorkflowTraceStep {
    stepId: string;
    stepName: string;
    action: string;
    startTime: string;
    endTime?: string;
    status: 'success' | 'failed' | 'skipped';
    input?: unknown;
    output?: unknown;
    urls?: string[];  // URLs visited/processed in this step
}

/**
 * Represents the complete workflow trace
 */
export interface WorkflowTrace {
    workflowId: string;
    workflowName: string;
    runId: string;
    startTime: string;
    endTime?: string;
    status: 'completed' | 'failed' | 'cancelled' | 'running';
    steps: WorkflowTraceStep[];
    totalUrlsVisited: number;
    totalDocumentsFound: number;
}

/**
 * The complete workflow output structure
 */
export interface WorkflowOutput {
    metadata: {
        runId: string;
        workflowId: string;
        workflowName: string;
        startTime: string;
        endTime?: string;
        status: string;
        version: string;
    };
    parameters: Record<string, unknown>;
    trace: WorkflowTrace;
    results: {
        summary: {
            totalPages: number;
            totalDocuments: number;
            newlyDiscovered: number;
            existing: number;
            errors: number;
            externalLinksProcessed?: number;
            externalLinksCollected?: number;
            iploPagesScanned?: number;
            failedPages?: number;
            filteredLinks?: number;
        };
        webPages: Array<{
            url: string;
            title: string;
            type: 'page' | 'section' | 'document';
            status: 'new' | 'existing' | 'updated' | 'error';
            visitedAt: string;
            depth: number;
            parentUrl?: string;
            filePath?: string;
        }>;
        documents: Array<{
            url: string;
            title: string;
            type: string;  // PDF, HTML, etc.
            sourceUrl: string;  // Page where this was found
            relevanceScore?: number;
            discoveredAt: string;
            metadata?: Record<string, unknown>;
        }>;
        endpoints: WorkflowResultEndpoint[];  // Final relevant documents/links
    };
    errors: Array<{
        timestamp: string;
        message: string;
        url?: string;
        stepId?: string;
    }>;
}

/**
 * Service for generating workflow output files
 */
export class WorkflowOutputService {
    private outputDir: string;
    private templateService: WorkflowOutputTemplateService;
    private storage: WorkflowOutputStorage;
    private markdownGenerator: MarkdownFormatGenerator;
    private textGenerator: TextFormatGenerator;
    private jsonGenerator: JsonFormatGenerator;
    private csvGenerator: CsvFormatGenerator;
    private tsvGenerator: TsvFormatGenerator;
    private htmlGenerator: HtmlFormatGenerator;
    private xmlGenerator: XmlFormatGenerator;
    private pdfGenerator: PdfFormatGenerator;
    private xlsxGenerator: XlsxFormatGenerator;
    private outputBuilder: WorkflowOutputBuilder;

    constructor(outputBaseDir?: string) {
        this.outputDir = outputBaseDir || path.join(process.cwd(), 'data', 'workflow-outputs');
        this.templateService = new WorkflowOutputTemplateService(this.outputDir);
        this.storage = new WorkflowOutputStorage(this.outputDir);
        this.markdownGenerator = new MarkdownFormatGenerator();
        this.textGenerator = new TextFormatGenerator();
        this.jsonGenerator = new JsonFormatGenerator();
        this.csvGenerator = new CsvFormatGenerator();
        this.tsvGenerator = new TsvFormatGenerator();
        this.htmlGenerator = new HtmlFormatGenerator();
        this.xmlGenerator = new XmlFormatGenerator();
        this.pdfGenerator = new PdfFormatGenerator();
        this.xlsxGenerator = new XlsxFormatGenerator();
        this.outputBuilder = new WorkflowOutputBuilder();
    }

    /**
     * Initialize the output directory
     * Falls back to temp directory if the configured directory is not writable (e.g., in Dropbox)
     */
    async initialize(): Promise<void> {
        try {
            await fs.mkdir(this.outputDir, { recursive: true, mode: 0o777 });
            // Verify directory is writable
            const testFile = path.join(this.outputDir, '.write-test');
            await fs.writeFile(testFile, 'test', 'utf-8');
            await fs.unlink(testFile);
        } catch (error) {
            // In test environments or when permission errors occur (e.g., Dropbox), fall back to temp directory
            const isPermissionError = error instanceof Error && (
                error.message.includes('EACCES') ||
                error.message.includes('permission denied') ||
                error.message.includes('EACCES')
            );
            const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
            
            if (isPermissionError || isTestEnv) {
                // Fall back to temp directory
                const tempDir = path.join(os.tmpdir(), 'workflow-outputs');
                logger.warn(
                    { 
                        originalDir: this.outputDir, 
                        fallbackDir: tempDir, 
                        error: error instanceof Error ? error.message : String(error),
                        reason: isPermissionError ? 'permission denied' : 'test environment'
                    },
                    'Output directory not writable, falling back to temp directory'
                );
                
                // Update outputDir to temp directory
                this.outputDir = tempDir;
                
                // Update dependent services to use new directory
                this.templateService = new WorkflowOutputTemplateService(this.outputDir);
                this.storage = new WorkflowOutputStorage(this.outputDir);
                
                // Try to initialize temp directory
                try {
                    await fs.mkdir(this.outputDir, { recursive: true, mode: 0o777 });
                    const testFile = path.join(this.outputDir, '.write-test');
                    await fs.writeFile(testFile, 'test', 'utf-8');
                    await fs.unlink(testFile);
                } catch (tempError) {
                    logger.error({ error: tempError, tempDir: this.outputDir }, 'Failed to initialize temp output directory');
                    throw new Error(`Cannot create or write to output directory (tried original and temp): ${error instanceof Error ? error.message : String(error)}`);
                }
            } else {
                logger.error({ error, outputDir: this.outputDir }, 'Failed to initialize output directory');
                throw new Error(`Cannot create or write to output directory: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /**
     * Generate output files from a completed run
     */
    async generateOutput(run: Run, context: Record<string, unknown> = {}): Promise<{
        jsonPath: string;
        markdownPath: string;
        txtPath: string;
        csvPath: string;
        htmlPath: string;
        xmlPath: string;
        pdfPath: string;
        xlsxPath: string;
        tsvPath: string;
        output: WorkflowOutput;
    }> {
        await this.initialize();

        const runId = run._id?.toString() || 'unknown';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const workflowName = String(run.params?.workflowName || run.type || 'workflow');
        const safeWorkflowName = workflowName.replace(/[^a-zA-Z0-9-]/g, '-');

        // Build the output structure
        const output = this.buildOutput(run, context);

        // Generate file paths
        const baseName = `${safeWorkflowName}_${timestamp}_${runId}`;
        const jsonPath = path.join(this.outputDir, `${baseName}.json`);
        const markdownPath = path.join(this.outputDir, `${baseName}.md`);
        const txtPath = path.join(this.outputDir, `${baseName}.txt`);
        const csvPath = path.join(this.outputDir, `${baseName}.csv`);
        const htmlPath = path.join(this.outputDir, `${baseName}.html`);
        const xmlPath = path.join(this.outputDir, `${baseName}.xml`);
        const pdfPath = path.join(this.outputDir, `${baseName}.pdf`);
        const xlsxPath = path.join(this.outputDir, `${baseName}.xlsx`);
        const tsvPath = path.join(this.outputDir, `${baseName}.tsv`);

        // Write JSON output (machine-readable)
        await this.writeJson(jsonPath, output);

        // Write Markdown output (human/AI readable)
        await this.writeMarkdown(markdownPath, output);

        // Write TXT output (plain text, no formatting)
        await this.writeText(txtPath, output);

        // Write CSV output (tabular data)
        await this.writeCsv(csvPath, output);

        // Write HTML output (browser-viewable)
        await this.writeHtml(htmlPath, output);

        // Write XML output (structured data exchange)
        await this.writeXml(xmlPath, output);

        // Write PDF output (portable document format)
        await this.writePdf(pdfPath, output);

        // Write XLSX output (Excel workbook)
        await this.writeXlsx(xlsxPath, output);

        // Write TSV output (tab-separated values)
        await this.writeTsv(tsvPath, output);

        logger.info({
            jsonPath,
            markdownPath,
            txtPath,
            csvPath,
            htmlPath,
            xmlPath,
            pdfPath,
            xlsxPath,
            tsvPath,
        }, 'Generated workflow output files');

        return { jsonPath, markdownPath, txtPath, csvPath, htmlPath, xmlPath, pdfPath, xlsxPath, tsvPath, output };
    }

    /**
     * Build the output structure from run data
     */
    private buildOutput(run: Run, context: Record<string, unknown>): WorkflowOutput {
        return this.outputBuilder.buildOutput(run, context);
    }


    /**
     * Write JSON output file
     */
    private async writeJson(filePath: string, output: WorkflowOutput): Promise<void> {
        await this.jsonGenerator.write(filePath, output);
    }

    /**
     * Write Markdown output file for human/AI readability
     */
    private async writeMarkdown(filePath: string, output: WorkflowOutput): Promise<void> {
        await this.markdownGenerator.write(filePath, output);
    }

    /**
     * Write plain text output file
     */
    private async writeText(filePath: string, output: WorkflowOutput): Promise<void> {
        await this.textGenerator.write(filePath, output);
    }

    /**
     * Write CSV output file
     */
    private async writeCsv(filePath: string, output: WorkflowOutput): Promise<void> {
        await this.csvGenerator.write(filePath, output);
    }

    /**
     * Write HTML output file
     */
    private async writeHtml(filePath: string, output: WorkflowOutput): Promise<void> {
        await this.htmlGenerator.write(filePath, output);
    }

    /**
     * Write XML output file
     */
    private async writeXml(filePath: string, output: WorkflowOutput): Promise<void> {
        await this.xmlGenerator.write(filePath, output);
    }

    /**
     * Write PDF output file
     */
    private async writePdf(filePath: string, output: WorkflowOutput): Promise<void> {
        await this.pdfGenerator.write(filePath, output);
    }

    /**
     * Write XLSX output file
     */
    private async writeXlsx(filePath: string, output: WorkflowOutput): Promise<void> {
        await this.xlsxGenerator.write(filePath, output);
    }

    /**
     * Write TSV output file
     */
    private async writeTsv(filePath: string, output: WorkflowOutput): Promise<void> {
        await this.tsvGenerator.write(filePath, output);
    }







    /**
     * Get list of all output files
     */
    async listOutputs(): Promise<Array<{
        name: string;
        jsonPath: string;
        markdownPath: string;
        txtPath: string;
        csvPath: string;
        htmlPath: string;
        xmlPath: string;
        pdfPath?: string;
        xlsxPath?: string;
        tsvPath?: string;
        createdAt: Date;
    }>> {
        await this.initialize();
        return this.storage.listOutputs();
    }

    /**
     * Load a specific output by name
     */
    async loadOutput(name: string): Promise<WorkflowOutput | null> {
        return this.storage.loadOutput(name);
    }

    /**
     * Search within a workflow output
     * Searches through documents, endpoints, and webPages for matching query terms
     */
    async searchOutput(name: string, query: string, limit?: number): Promise<{
        query: string;
        workflowName: string;
        results: Array<{
            title: string;
            url: string;
            type: string;
            sourceUrl?: string;
            relevanceScore?: number;
            matchType: 'title' | 'url' | 'metadata';
        }>;
        count: number;
    }> {
        const output = await this.loadOutput(name);
        if (!output) {
            throw new Error(`Output not found: ${name}`);
        }

        const queryLower = query.toLowerCase();
        const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 0);
        const results: Array<{
            title: string;
            url: string;
            type: string;
            sourceUrl?: string;
            relevanceScore?: number;
            matchType: 'title' | 'url' | 'metadata';
        }> = [];

        // Search in documents
        for (const doc of output.results.documents) {
            const titleLower = (doc.title || '').toLowerCase();
            const urlLower = (doc.url || '').toLowerCase();
            const metadataStr = JSON.stringify(doc.metadata || {}).toLowerCase();

            let matchType: 'title' | 'url' | 'metadata' | null = null;
            let matchCount = 0;

            // Check title matches
            if (titleLower.includes(queryLower) || queryTerms.some(term => titleLower.includes(term))) {
                matchType = 'title';
                matchCount = queryTerms.filter(term => titleLower.includes(term)).length;
            }
            // Check URL matches
            else if (urlLower.includes(queryLower) || queryTerms.some(term => urlLower.includes(term))) {
                matchType = 'url';
                matchCount = queryTerms.filter(term => urlLower.includes(term)).length;
            }
            // Check metadata matches
            else if (metadataStr.includes(queryLower) || queryTerms.some(term => metadataStr.includes(term))) {
                matchType = 'metadata';
                matchCount = queryTerms.filter(term => metadataStr.includes(term)).length;
            }

            if (matchType) {
                results.push({
                    title: doc.title,
                    url: doc.url,
                    type: doc.type,
                    sourceUrl: doc.sourceUrl,
                    relevanceScore: doc.relevanceScore,
                    matchType,
                });
            }
        }

        // Search in endpoints
        for (const endpoint of output.results.endpoints) {
            const titleLower = (endpoint.title || '').toLowerCase();
            const urlLower = (endpoint.url || '').toLowerCase();

            let matchType: 'title' | 'url' | 'metadata' | null = null;

            if (titleLower.includes(queryLower) || queryTerms.some(term => titleLower.includes(term))) {
                matchType = 'title';
            } else if (urlLower.includes(queryLower) || queryTerms.some(term => urlLower.includes(term))) {
                matchType = 'url';
            }

            if (matchType) {
                // Avoid duplicates (endpoints might overlap with documents)
                const existing = results.find(r => r.url === endpoint.url);
                if (!existing) {
                    results.push({
                        title: endpoint.title || '',
                        url: endpoint.url,
                        type: endpoint.type || 'endpoint',
                        relevanceScore: endpoint.relevanceScore,
                        matchType,
                    });
                }
            }
        }

        // Sort by relevance (title matches first, then by relevanceScore if available)
        results.sort((a, b) => {
            // Title matches are most relevant
            if (a.matchType === 'title' && b.matchType !== 'title') return -1;
            if (b.matchType === 'title' && a.matchType !== 'title') return 1;
            // Then by relevanceScore if available
            if (a.relevanceScore !== undefined && b.relevanceScore !== undefined) {
                return b.relevanceScore - a.relevanceScore;
            }
            if (a.relevanceScore !== undefined) return -1;
            if (b.relevanceScore !== undefined) return 1;
            return 0;
        });

        // Apply limit if specified
        const limitedResults = limit ? results.slice(0, limit) : results;

        return {
            query,
            workflowName: output.metadata.workflowName,
            results: limitedResults,
            count: limitedResults.length,
        };
    }

    /**
     * Get the output directory path
     */
    getOutputDir(): string {
        return this.storage.getOutputDir();
    }

    /**
     * Store a custom template
     */
    storeTemplate(template: Template): void {
        this.templateService.storeTemplate(template);
    }

    /**
     * Get a template by ID
     */
    getTemplate(templateId: string): Template | undefined {
        return this.templateService.getTemplate(templateId);
    }

    /**
     * List all stored templates
     */
    listTemplates(): Template[] {
        return this.templateService.listTemplates();
    }

    /**
     * Delete a template
     */
    deleteTemplate(templateId: string): boolean {
        return this.templateService.deleteTemplate(templateId);
    }

    /**
     * Validate a template
     */
    validateTemplate(template: Template): TemplateValidationResult {
        return this.templateService.validateTemplate(template);
    }

    /**
     * Generate output using a custom template
     */
    async generateOutputWithTemplate(
        run: Run,
        templateId: string,
        context: Record<string, unknown> = {}
    ): Promise<{
        outputPath: string;
        content: string;
    }> {
        await this.initialize();
        // Build the output structure
        const output = this.buildOutput(run, context);
        return this.templateService.generateOutputWithTemplate(run, templateId, output, context);
    }
}

// Singleton instance
let workflowOutputService: WorkflowOutputService | null = null;

export function getWorkflowOutputService(): WorkflowOutputService {
    if (!workflowOutputService) {
        workflowOutputService = new WorkflowOutputService();
    }
    return workflowOutputService;
}

/**
 * Convert a file path to an API endpoint for downloading workflow output
 * @param filePath The full file path
 * @param format Optional format override (json, md, txt, csv, html, xml)
 * @returns API endpoint path
 */
export function pathToApiEndpoint(filePath: string, format?: string): string {
    if (!filePath) {
        return '';
    }

    // Extract base filename without extension
    const basename = path.basename(filePath, path.extname(filePath));
    
    // Determine format from parameter or file extension
    let outputFormat = format;
    if (!outputFormat) {
        const ext = path.extname(filePath).slice(1).toLowerCase();
        
        // Define known formats
        const knownFormats = ['json', 'md', 'markdown', 'txt', 'csv', 'html', 'xml', 'pdf', 'xlsx', 'tsv'];
        
        if (knownFormats.includes(ext)) {
             outputFormat = ext === 'markdown' ? 'md' : ext;
        } else {
             outputFormat = 'json';
        }
    }
    
    // Normalize format (markdown -> md)
    if (outputFormat === 'markdown') {
        outputFormat = 'md';
    }

    return `/api/workflow-outputs/${basename}/download/${outputFormat}`;
}

/**
 * Convert all output paths to API endpoints
 * @param outputPaths Object containing all output file paths
 * @returns Object with API endpoint URLs
 */
export function pathsToApiEndpoints(outputPaths: {
    jsonPath?: string;
    markdownPath?: string;
    txtPath?: string;
    csvPath?: string;
    htmlPath?: string;
    xmlPath?: string;
}): {
    jsonUrl: string;
    markdownUrl: string;
    txtUrl: string;
    csvUrl: string;
    htmlUrl: string;
    xmlUrl: string;
} {
    return {
        jsonUrl: pathToApiEndpoint(outputPaths.jsonPath || '', 'json'),
        markdownUrl: pathToApiEndpoint(outputPaths.markdownPath || '', 'md'),
        txtUrl: pathToApiEndpoint(outputPaths.txtPath || '', 'txt'),
        csvUrl: pathToApiEndpoint(outputPaths.csvPath || '', 'csv'),
        htmlUrl: pathToApiEndpoint(outputPaths.htmlPath || '', 'html'),
        xmlUrl: pathToApiEndpoint(outputPaths.xmlPath || '', 'xml')
    };
}


