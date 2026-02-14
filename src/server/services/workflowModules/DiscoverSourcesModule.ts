/**
 * DiscoverSourcesModule
 * 
 * Finds URLs to crawl using Google Search, sitemaps, or seed URLs.
 * Wraps GoogleSearchService for source discovery.
 */

import { BaseWorkflowModule, WorkflowContext, ModuleParameterSchema } from '../workflow/WorkflowModule.js';
import type { ModuleMetadata } from '../../types/module-metadata.js';
import { GoogleSearchService } from '../external/googleSearch.js';
import { RunManager } from '../workflow/RunManager.js';
import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

export class DiscoverSourcesModule extends BaseWorkflowModule {
    id = 'DiscoverSources';
    name = 'Discover Sources';
    description = 'Find URLs to crawl using Google Search, sitemaps, or seed URLs';
    category = 'discovery';

    private googleSearch: GoogleSearchService;
    private runManager: RunManager;

    constructor() {
        super();
        this.googleSearch = new GoogleSearchService();
        this.runManager = new RunManager(getDB());
    }

    async execute(
        context: WorkflowContext,
        params: Record<string, unknown>,
        runId: string
    ): Promise<WorkflowContext> {
        await this.runManager.log(runId, 'Starting source discovery...', 'info');

        const onderwerp = params.onderwerp as string | undefined;
        const thema = params.thema as string | undefined;
        const overheidslaag = params.overheidslaag as string | undefined;
        const allowedDomains = (params.allowedDomains as string[]) || [];
        const useGoogleSearch = params.useGoogleSearch !== false;
        const seedUrls = (params.seedUrls as string[]) || [];
        const maxResults = (params.maxResults as number) || 10;

        try {
            const discoveredUrls: string[] = [];
            const sources: Array<{ url: string; title: string; snippet: string }> = [];

            // Use Google Search if enabled and query parameters provided
            if (useGoogleSearch && (onderwerp || thema)) {
                await this.runManager.log(
                    runId,
                    `Searching for sources with onderwerp: ${onderwerp || 'N/A'}, thema: ${thema || 'N/A'}`,
                    'info'
                );

                const searchResults = await this.googleSearch.searchGovernmentSources(
                    onderwerp || '',
                    thema || '',
                    overheidslaag || ''
                );

                // Filter by allowed domains if specified
                let filteredResults = searchResults;
                if (allowedDomains.length > 0) {
                    filteredResults = searchResults.filter(result =>
                        allowedDomains.some(domain => result.url.includes(domain))
                    );
                    await this.runManager.log(
                        runId,
                        `Filtered ${searchResults.length} results to ${filteredResults.length} based on allowed domains`,
                        'info'
                    );
                }

                // Limit results
                const limitedResults = filteredResults.slice(0, maxResults);

                for (const result of limitedResults) {
                    discoveredUrls.push(result.url);
                    sources.push({
                        url: result.url,
                        title: result.titel || '',
                        snippet: result.samenvatting || ''
                    });
                }

                await this.runManager.log(
                    runId,
                    `Found ${limitedResults.length} sources via Google Search`,
                    'info'
                );
            }

            // Add seed URLs if provided
            if (seedUrls.length > 0) {
                for (const url of seedUrls) {
                    if (!discoveredUrls.includes(url)) {
                        discoveredUrls.push(url);
                        sources.push({
                            url,
                            title: '',
                            snippet: ''
                        });
                    }
                }
                await this.runManager.log(
                    runId,
                    `Added ${seedUrls.length} seed URLs`,
                    'info'
                );
            }

            if (discoveredUrls.length === 0) {
                await this.runManager.log(
                    runId,
                    'Warning: No sources discovered. Check query parameters or seed URLs.',
                    'warn'
                );
            }

            return {
                ...context,
                discoveredUrls,
                sources,
                documents: [...(Array.isArray(context.documents) ? context.documents : []), ...sources]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.runManager.log(
                runId,
                `Error during source discovery: ${errorMessage}`,
                'error'
            );
            logger.error({ error, runId }, 'Error in DiscoverSourcesModule');
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
            tags: ['discovery', 'google-search', 'sources'],
            published: true,
            dependencies: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    getDefaultParams(): Record<string, unknown> {
        return {
            allowedDomains: [],
            maxResults: 10,
            useGoogleSearch: true,
            useSitemaps: false,
            seedUrls: []
        };
    }

    getParameterSchema(): ModuleParameterSchema {
        return {
            onderwerp: {
                type: 'string',
                label: 'Onderwerp',
                description: 'Search topic/subject',
                required: false
            },
            thema: {
                type: 'string',
                label: 'Thema',
                description: 'Search theme',
                required: false
            },
            overheidslaag: {
                type: 'string',
                label: 'Overheidslaag',
                description: 'Government layer (national, provincial, municipal)',
                required: false
            },
            allowedDomains: {
                type: 'array',
                label: 'Allowed Domains',
                description: 'List of allowed domains (e.g., ["rijksoverheid.nl", "pbl.nl"])',
                required: false,
                default: []
            },
            useGoogleSearch: {
                type: 'boolean',
                label: 'Use Google Search',
                description: 'Enable Google Search for discovery',
                required: false,
                default: true
            },
            seedUrls: {
                type: 'array',
                label: 'Seed URLs',
                description: 'Initial URLs to start crawling from',
                required: false,
                default: []
            },
            maxResults: {
                type: 'number',
                label: 'Max Results',
                description: 'Maximum number of results to return',
                required: false,
                default: 10,
                validation: {
                    min: 1,
                    max: 100
                }
            }
        };
    }
}










