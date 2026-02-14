/**
 * ExtractMetadataModule
 * 
 * Extracts metadata (title, date, IMBOR keywords) from crawled pages.
 * Wraps MetadataExtractionService for metadata extraction.
 */

import { BaseWorkflowModule, WorkflowContext, ModuleParameterSchema } from '../workflow/WorkflowModule.js';
import type { ModuleMetadata } from '../../types/module-metadata.js';
import { MetadataExtractionService } from '../ingestion/metadata/MetadataExtractionService.js';
import { RunManager } from '../workflow/RunManager.js';
import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import type { ScrapedDocument } from '../infrastructure/types.js';

export class ExtractMetadataModule extends BaseWorkflowModule {
    id = 'ExtractMetadata';
    name = 'Extract Metadata';
    description = 'Extract metadata (title, date, IMBOR keywords) from crawled pages';
    category = 'processing';

    private metadataService: MetadataExtractionService;
    private runManager: RunManager;

    constructor() {
        super();
        this.metadataService = new MetadataExtractionService();
        this.runManager = new RunManager(getDB());
    }

    async execute(
        context: WorkflowContext,
        params: Record<string, unknown>,
        runId: string
    ): Promise<WorkflowContext> {
        const crawledPages = (context.crawledPages as Array<{ url: string; html: string; status: number }>) || [];
        
        if (crawledPages.length === 0) {
            await this.runManager.log(
                runId,
                'No crawled pages to extract metadata from. Skipping extraction step.',
                'warn'
            );
            return context;
        }

        await this.runManager.log(
            runId,
            `Starting metadata extraction for ${crawledPages.length} pages...`,
            'info'
        );

        const extractIMBOR = params.extractIMBOR !== false;
        const extractedMetadata: Array<{
            url: string;
            title: string;
            date?: string;
            imborKeywords?: string[];
            documentType?: string;
            themes?: string[];
        }> = [];
        const errors: Array<{ url: string; error: string }> = [];

        try {
            for (const page of crawledPages) {
                if (page.status !== 200) {
                    await this.runManager.log(
                        runId,
                        `Skipping metadata extraction for ${page.url} (status: ${page.status})`,
                        'warn'
                    );
                    continue;
                }

                try {
                    // Convert page to ScrapedDocument format for metadata extraction
                    const document: ScrapedDocument = {
                        titel: '',
                        url: page.url,
                        website_url: page.url,
                        website_titel: '',
                        samenvatting: '',
                        type_document: 'Webpagina',
                        publicatiedatum: null
                    };

                    // Extract metadata using the service
                    const metadata = await this.metadataService.extractMetadata(document);

                    // Extract title from HTML if available
                    const titleMatch = page.html.match(/<title[^>]*>(.*?)<\/title>/i);
                    const title = titleMatch ? titleMatch[1].trim() : '';

                    extractedMetadata.push({
                        url: page.url,
                        title: title || document.titel || 'Untitled',
                        date: metadata.publicationDate?.toISOString().split('T')[0],
                        documentType: metadata.documentType || undefined,
                        themes: metadata.themes.length > 0 ? metadata.themes : undefined,
                        imborKeywords: extractIMBOR ? metadata.themes : undefined // Using themes as IMBOR keywords for now
                    });

                    await this.runManager.log(
                        runId,
                        `Extracted metadata for ${page.url}`,
                        'info'
                    );
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    errors.push({ url: page.url, error: errorMessage });
                    await this.runManager.log(
                        runId,
                        `Error extracting metadata for ${page.url}: ${errorMessage}`,
                        'error'
                    );
                }
            }

            await this.runManager.log(
                runId,
                `Extracted metadata for ${extractedMetadata.length} pages, ${errors.length} errors`,
                'info'
            );

            return {
                ...context,
                extractedMetadata,
                metadataErrors: errors,
                metadataCount: extractedMetadata.length
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.runManager.log(
                runId,
                `Error during metadata extraction: ${errorMessage}`,
                'error'
            );
            logger.error({ error, runId }, 'Error in ExtractMetadataModule');
            throw error;
        }
    }

    getMetadata(): ModuleMetadata {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            version: '1.0.0',
            category: this.category,
            author: {
                name: 'Beleidsscan Team',
                email: 'team@beleidsscan.nl'
            },
            license: 'MIT',
            tags: ['metadata', 'extraction', 'imbor'],
            published: true,
            dependencies: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    getDefaultParams(): Record<string, unknown> {
        return {
            extractIMBOR: true
        };
    }

    getParameterSchema(): ModuleParameterSchema {
        return {
            extractIMBOR: {
                type: 'boolean',
                label: 'Extract IMBOR Keywords',
                description: 'Extract IMBOR keywords from documents',
                required: false,
                default: true
            }
        };
    }
}










