/**
 * CrawlPagesModule
 * 
 * Fetches HTML content from URLs with rate limiting.
 * Wraps WebsiteScraper for page crawling.
 */

import { BaseWorkflowModule, WorkflowContext, ModuleParameterSchema } from '../workflow/WorkflowModule.js';
import type { ModuleMetadata } from '../../types/module-metadata.js';
import { WebsiteScraper } from '../scraping/websiteScraper.js';
import { RunManager } from '../workflow/RunManager.js';
import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import axios from 'axios';

export class CrawlPagesModule extends BaseWorkflowModule {
    id = 'CrawlPages';
    name = 'Crawl Pages';
    description = 'Fetch HTML content from URLs with rate limiting';
    category = 'crawling';

    private websiteScraper: WebsiteScraper;
    private runManager: RunManager;

    constructor() {
        super();
        this.websiteScraper = new WebsiteScraper();
        this.runManager = new RunManager(getDB());
    }

    async execute(
        context: WorkflowContext,
        params: Record<string, unknown>,
        runId: string
    ): Promise<WorkflowContext> {
        const urls = (context.discoveredUrls as string[]) || [];
        
        if (urls.length === 0) {
            await this.runManager.log(
                runId,
                'No URLs to crawl. Skipping crawl step.',
                'warn'
            );
            return context;
        }

        await this.runManager.log(
            runId,
            `Starting to crawl ${urls.length} URLs...`,
            'info'
        );

        const rateLimit = (params.rateLimit as number) || 2; // requests per second
        const timeout = (params.timeout as number) || 10000; // milliseconds
        const maxPages = (params.maxPages as number) || urls.length;

        const crawledPages: Array<{ url: string; html: string; status: number }> = [];
        const errors: Array<{ url: string; error: string }> = [];

        try {
            // Process URLs with rate limiting
            for (let i = 0; i < Math.min(urls.length, maxPages); i++) {
                const url = urls[i];
                
                // Rate limiting: wait between requests
                if (i > 0) {
                    const delay = 1000 / rateLimit; // milliseconds between requests
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                try {
                    await this.runManager.log(
                        runId,
                        `Crawling ${i + 1}/${Math.min(urls.length, maxPages)}: ${url}`,
                        'info'
                    );

                    const response = await axios.get(url, {
                        timeout,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (compatible; Beleidsscan/1.0)'
                        },
                        validateStatus: (status) => status < 500 // Don't throw on 4xx
                    });

                    crawledPages.push({
                        url,
                        html: response.data,
                        status: response.status
                    });

                    await this.runManager.log(
                        runId,
                        `Successfully crawled ${url} (status: ${response.status})`,
                        'info'
                    );
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    errors.push({ url, error: errorMessage });
                    await this.runManager.log(
                        runId,
                        `Error crawling ${url}: ${errorMessage}`,
                        'error'
                    );
                }
            }

            await this.runManager.log(
                runId,
                `Crawled ${crawledPages.length} pages successfully, ${errors.length} errors`,
                'info'
            );

            return {
                ...context,
                crawledPages,
                crawlErrors: errors,
                crawledCount: crawledPages.length
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.runManager.log(
                runId,
                `Error during page crawling: ${errorMessage}`,
                'error'
            );
            logger.error({ error, runId }, 'Error in CrawlPagesModule');
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
            tags: ['crawling', 'http', 'scraping'],
            published: true,
            dependencies: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    getDefaultParams(): Record<string, unknown> {
        return {
            rateLimit: 2,
            timeout: 10000,
            maxPages: 50
        };
    }

    getParameterSchema(): ModuleParameterSchema {
        return {
            rateLimit: {
                type: 'number',
                label: 'Rate Limit',
                description: 'Requests per second',
                required: false,
                default: 2,
                validation: {
                    min: 0.1,
                    max: 10
                }
            },
            timeout: {
                type: 'number',
                label: 'Timeout',
                description: 'Request timeout in milliseconds',
                required: false,
                default: 10000,
                validation: {
                    min: 1000,
                    max: 60000
                }
            },
            maxPages: {
                type: 'number',
                label: 'Max Pages',
                description: 'Maximum number of pages to crawl',
                required: false,
                default: 50,
                validation: {
                    min: 1,
                    max: 1000
                }
            }
        };
    }
}










