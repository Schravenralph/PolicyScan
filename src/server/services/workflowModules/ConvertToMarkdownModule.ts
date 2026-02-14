/**
 * ConvertToMarkdownModule
 * 
 * Converts HTML content to Markdown format.
 * Wraps MarkdownConverter for HTML to Markdown conversion.
 */

import { BaseWorkflowModule, WorkflowContext, ModuleParameterSchema } from '../workflow/WorkflowModule.js';
import type { ModuleMetadata } from '../../types/module-metadata.js';
import { MarkdownConverter } from '../ingestion/processing/MarkdownConverter.js';
import { RunManager } from '../workflow/RunManager.js';
import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

export class ConvertToMarkdownModule extends BaseWorkflowModule {
    id = 'ConvertToMarkdown';
    name = 'Convert to Markdown';
    description = 'Convert HTML content to Markdown format';
    category = 'processing';

    private markdownConverter: MarkdownConverter;
    private runManager: RunManager;

    constructor() {
        super();
        this.markdownConverter = new MarkdownConverter();
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
                'No crawled pages to convert. Skipping conversion step.',
                'warn'
            );
            return context;
        }

        await this.runManager.log(
            runId,
            `Starting Markdown conversion for ${crawledPages.length} pages...`,
            'info'
        );

        const includeFrontmatter = params.includeFrontmatter !== false;
        const markdownContent: Array<{ url: string; markdown: string }> = [];
        const errors: Array<{ url: string; error: string }> = [];

        try {
            for (const page of crawledPages) {
                if (page.status !== 200) {
                    await this.runManager.log(
                        runId,
                        `Skipping conversion for ${page.url} (status: ${page.status})`,
                        'warn'
                    );
                    continue;
                }

                try {
                    // Convert HTML to Markdown
                    let markdown = this.markdownConverter.convert(page.html);

                    // Add frontmatter if requested
                    if (includeFrontmatter) {
                        const metadata = this.markdownConverter.extractMetadata(page.html, page.url);
                        markdown = await this.markdownConverter.convertWithFrontmatter(
                            page.html,
                            metadata
                        );
                    }

                    markdownContent.push({
                        url: page.url,
                        markdown
                    });

                    await this.runManager.log(
                        runId,
                        `Converted ${page.url} to Markdown`,
                        'info'
                    );
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    errors.push({ url: page.url, error: errorMessage });
                    await this.runManager.log(
                        runId,
                        `Error converting ${page.url}: ${errorMessage}`,
                        'error'
                    );
                }
            }

            await this.runManager.log(
                runId,
                `Converted ${markdownContent.length} pages to Markdown, ${errors.length} errors`,
                'info'
            );

            return {
                ...context,
                markdownContent,
                conversionErrors: errors,
                markdownCount: markdownContent.length
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.runManager.log(
                runId,
                `Error during Markdown conversion: ${errorMessage}`,
                'error'
            );
            logger.error({ error, runId }, 'Error in ConvertToMarkdownModule');
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
            tags: ['markdown', 'conversion', 'html'],
            published: true,
            dependencies: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    getDefaultParams(): Record<string, unknown> {
        return {
            includeFrontmatter: true
        };
    }

    getParameterSchema(): ModuleParameterSchema {
        return {
            includeFrontmatter: {
                type: 'boolean',
                label: 'Include Frontmatter',
                description: 'Include YAML frontmatter with metadata',
                required: false,
                default: true
            }
        };
    }
}

