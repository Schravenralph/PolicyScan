/**
 * StoreDocumentsModule
 * 
 * Saves documents to the knowledge base.
 * Wraps KnowledgeBaseManager for document storage.
 */

import { BaseWorkflowModule, WorkflowContext, ModuleParameterSchema } from '../workflow/WorkflowModule.js';
import type { ModuleMetadata } from '../../types/module-metadata.js';
import { KnowledgeBaseManager } from '../knowledgeBase/KnowledgeBaseManager.js';
import { RunManager } from '../workflow/RunManager.js';
import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import type { PageMetadata } from '../ingestion/processing/MarkdownConverter.js';
import * as path from 'path';

export class StoreDocumentsModule extends BaseWorkflowModule {
    id = 'StoreDocuments';
    name = 'Store Documents';
    description = 'Save documents to the knowledge base';
    category = 'storage';

    private knowledgeBaseManager: KnowledgeBaseManager;
    private runManager: RunManager;

    constructor() {
        super();
        // Use default knowledge base directory
        const baseDir = process.env.KNOWLEDGE_BASE_DIR || path.join(process.cwd(), 'data', 'knowledge_base');
        this.knowledgeBaseManager = new KnowledgeBaseManager(baseDir);
        this.runManager = new RunManager(getDB());
    }

    async execute(
        context: WorkflowContext,
        params: Record<string, unknown>,
        runId: string
    ): Promise<WorkflowContext> {
        const markdownContent = (context.markdownContent as Array<{ url: string; markdown: string }>) || [];
        const rankedResults = (context.rankedResults as Array<{ url: string; score: number; rank: number }>) || [];
        
        // Determine which documents to store
        let documentsToStore = markdownContent;
        
        // If we have ranked results, prioritize those
        if (rankedResults.length > 0) {
            const rankedUrls = new Set(rankedResults.map(r => r.url));
            documentsToStore = markdownContent.filter(doc => rankedUrls.has(doc.url));
            
            // Sort by rank
            documentsToStore.sort((a, b) => {
                const rankA = rankedResults.find(r => r.url === a.url)?.rank || 999;
                const rankB = rankedResults.find(r => r.url === b.url)?.rank || 999;
                return rankA - rankB;
            });
        }
        
        if (documentsToStore.length === 0) {
            await this.runManager.log(
                runId,
                'No documents to store. Skipping storage step.',
                'warn'
            );
            return context;
        }

        await this.runManager.log(
            runId,
            `Starting to store ${documentsToStore.length} documents...`,
            'info'
        );

        const createDirectories = params.createDirectories !== false;
        const storedDocuments: Array<{ url: string; path: string; stored: boolean }> = [];
        const errors: Array<{ url: string; error: string }> = [];

        try {
            for (const doc of documentsToStore) {
                try {
                    await this.runManager.log(
                        runId,
                        `Storing document: ${doc.url}`,
                        'info'
                    );

                    // Extract metadata from context if available
                    const extractedMetadata = (context.extractedMetadata as Array<{
                        url: string;
                        title: string;
                        date?: string;
                        imborKeywords?: string[];
                        documentType?: string;
                        themes?: string[];
                    }>) || [];
                    
                    const metadataForDoc = extractedMetadata.find(m => m.url === doc.url);
                    
                    // Build PageMetadata
                    const metadata: PageMetadata = {
                        url: doc.url,
                        title: metadataForDoc?.title || 'Untitled',
                        last_scraped: new Date().toISOString().split('T')[0],
                        imbor_keywords: metadataForDoc?.imborKeywords,
                        keywords: metadataForDoc?.themes
                    };

                    // Store the document using KnowledgeBaseManager
                    const result = await this.knowledgeBaseManager.savePage(
                        metadata,
                        doc.markdown
                    );
                    
                    const filePath = result.filePath;

                    storedDocuments.push({
                        url: doc.url,
                        path: filePath,
                        stored: true
                    });

                    await this.runManager.log(
                        runId,
                        `Successfully stored document: ${doc.url} -> ${filePath}`,
                        'info'
                    );
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    errors.push({ url: doc.url, error: errorMessage });
                    await this.runManager.log(
                        runId,
                        `Error storing ${doc.url}: ${errorMessage}`,
                        'error'
                    );
                }
            }

            await this.runManager.log(
                runId,
                `Stored ${storedDocuments.length} documents, ${errors.length} errors`,
                'info'
            );

            return {
                ...context,
                storedDocuments,
                storageErrors: errors,
                storedCount: storedDocuments.length
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.runManager.log(
                runId,
                `Error during document storage: ${errorMessage}`,
                'error'
            );
            logger.error({ error, runId }, 'Error in StoreDocumentsModule');
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
            tags: ['storage', 'knowledge-base', 'persistence'],
            published: true,
            dependencies: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    getDefaultParams(): Record<string, unknown> {
        return {
            createDirectories: true
        };
    }

    getParameterSchema(): ModuleParameterSchema {
        return {
            createDirectories: {
                type: 'boolean',
                label: 'Create Directories',
                description: 'Create directory structure if it does not exist',
                required: false,
                default: true
            }
        };
    }
}

