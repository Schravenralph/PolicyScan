/**
 * RankResultsModule
 * 
 * Scores and ranks documents using vector embeddings and re-ranking.
 * Wraps RerankerService for document ranking.
 */

import { BaseWorkflowModule, WorkflowContext, ModuleParameterSchema } from '../workflow/WorkflowModule.js';
import type { ModuleMetadata } from '../../types/module-metadata.js';
import { RerankerService } from '../retrieval/RerankerService.js';
import { RunManager } from '../workflow/RunManager.js';
import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import type { ScrapedDocument } from '../infrastructure/types.js';

export class RankResultsModule extends BaseWorkflowModule {
    id = 'RankResults';
    name = 'Rank Results';
    description = 'Score and rank documents using vector embeddings and re-ranking';
    category = 'ranking';

    private rerankerService: RerankerService;
    private runManager: RunManager;

    constructor() {
        super();
        this.rerankerService = new RerankerService();
        this.runManager = new RunManager(getDB());
    }

    async execute(
        context: WorkflowContext,
        params: Record<string, unknown>,
        runId: string
    ): Promise<WorkflowContext> {
        const documents = (context.documents as ScrapedDocument[]) || [];
        const crawledPages = (context.crawledPages as Array<{ url: string; html: string; status: number }>) || [];
        
        // Build documents list from available sources (compatible with score_documents action)
        let allDocuments: ScrapedDocument[] = [...documents];
        
        // Collect from various sources (same as score_documents action)
        if (context.iploDocuments && Array.isArray(context.iploDocuments)) {
            allDocuments.push(...(context.iploDocuments as ScrapedDocument[]));
        }
        if (context.knownSourceDocuments && Array.isArray(context.knownSourceDocuments)) {
            allDocuments.push(...(context.knownSourceDocuments as ScrapedDocument[]));
        }
        if (context.googleDocuments && Array.isArray(context.googleDocuments)) {
            allDocuments.push(...(context.googleDocuments as ScrapedDocument[]));
        }
        
        // Convert crawled pages to documents if needed
        if (allDocuments.length === 0 && crawledPages.length > 0) {
            allDocuments = crawledPages
                .filter(page => page.status === 200)
                .map(page => ({
                    titel: '',
                    url: page.url,
                    website_url: page.url,
                    website_titel: '',
                    samenvatting: '',
                    type_document: 'Webpagina',
                    publicatiedatum: null
                }));
        }
        
        if (allDocuments.length === 0) {
            await this.runManager.log(
                runId,
                'No documents to rank. Skipping ranking step.',
                'warn'
            );
            return context;
        }

        await this.runManager.log(
            runId,
            `Starting ranking for ${allDocuments.length} documents...`,
            'info'
        );

        const query = (params.query as string) || (params.onderwerp as string) || '';
        const useSemanticSearch = params.useSemanticSearch !== false;
        const topK = (params.topK as number) || 10;

        try {
            if (!query) {
                await this.runManager.log(
                    runId,
                    'No query provided for ranking. Returning documents unranked.',
                    'warn'
                );
                return {
                    ...context,
                    rankedResults: allDocuments.map((doc, index) => ({
                        url: doc.url,
                        score: 0.5,
                        rank: index + 1
                    }))
                };
            }

            // Use re-ranker service if enabled
            if (useSemanticSearch && this.rerankerService) {
                await this.runManager.log(
                    runId,
                    `Re-ranking ${allDocuments.length} documents with query: ${query}`,
                    'info'
                );

                try {
                    // Limit to topK for re-ranking (re-ranker works best on smaller sets)
                    const documentsToRank = allDocuments.slice(0, Math.min(allDocuments.length, topK * 2));
                    
                    const rerankedResults = await this.rerankerService.rerank(
                        documentsToRank,
                        query
                    );

                    // Sort by final score (highest first)
                    const sortedResults = rerankedResults.sort((a, b) => b.finalScore - a.finalScore);

                    // Take top K
                    const topResults = sortedResults.slice(0, topK);

                    await this.runManager.log(
                        runId,
                        `Re-ranked ${topResults.length} documents`,
                        'info'
                    );

                    return {
                        ...context,
                        rankedResults: topResults.map((result, index) => ({
                            url: result.document.url,
                            score: result.finalScore,
                            rank: index + 1,
                            explanation: result.explanation
                        })),
                        rankingCount: topResults.length
                    };
                } catch (rerankerError) {
                    // If reranker fails (e.g., Ollama not available, connection refused), fall back to simple ranking
                    const errorMessage = rerankerError instanceof Error ? rerankerError.message : String(rerankerError);
                    await this.runManager.log(
                        runId,
                        `Re-ranker failed (${errorMessage}), falling back to simple ranking`,
                        'warn'
                    );
                    logger.warn({ error: rerankerError, runId }, 'Reranker failed, using fallback ranking');
                    // Continue to simple ranking fallback below
                }
            }
            
            // Simple ranking based on document order (fallback or when semantic search disabled)
            await this.runManager.log(
                runId,
                'Using simple ranking (re-ranker disabled or unavailable)',
                'info'
            );

            return {
                ...context,
                rankedResults: allDocuments.slice(0, topK).map((doc, index) => ({
                    url: doc.url,
                    score: 0.5,
                    rank: index + 1
                })),
                rankingCount: Math.min(allDocuments.length, topK)
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.runManager.log(
                runId,
                `Error during ranking: ${errorMessage}`,
                'error'
            );
            logger.error({ error, runId }, 'Error in RankResultsModule');
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
            tags: ['ranking', 'reranking', 'semantic-search'],
            published: true,
            dependencies: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    getDefaultParams(): Record<string, unknown> {
        return {
            useSemanticSearch: true,
            topK: 10
        };
    }

    getParameterSchema(): ModuleParameterSchema {
        return {
            query: {
                type: 'string',
                label: 'Query',
                description: 'Search query for ranking',
                required: false
            },
            onderwerp: {
                type: 'string',
                label: 'Onderwerp',
                description: 'Search topic (alternative to query)',
                required: false
            },
            useSemanticSearch: {
                type: 'boolean',
                label: 'Use Semantic Search',
                description: 'Enable semantic search and re-ranking',
                required: false,
                default: true
            },
            topK: {
                type: 'number',
                label: 'Top K',
                description: 'Number of top results to return',
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










