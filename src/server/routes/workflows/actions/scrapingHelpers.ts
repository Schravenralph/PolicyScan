/**
 * Helper functions for scraping actions
 * 
 * @deprecated This file contains legacy helpers for ScrapedDocument format.
 * New code should use canonical pipeline and UnifiedSearchService instead.
 */

import { QueryEmbeddingService } from '../../../services/ingestion/embeddings/QueryEmbeddingService.js';
import { toDocumentType } from '../../workflowUtils.js';
import { RunManager } from '../../../services/workflow/RunManager.js';
import { logger } from '../../../utils/logger.js';
import type { ScrapedDocument } from '../../../services/infrastructure/types.js';
import { getPerformanceConfigFromContext } from '../../../utils/performanceConfig.js';
import type { StepIdentifier } from '../../../types/performanceConfig.js';

/**
 * Enhance scraped documents with hybrid retrieval if enabled
 * 
 * @deprecated This function works with legacy ScrapedDocument format.
 * Use UnifiedSearchService or SearchService for canonical document search instead.
 * This function is kept temporarily for backward compatibility with legacy actions.
 * 
 * @param documents - Existing scraped documents
 * @param onderwerp - Search subject
 * @param thema - Search theme
 * @param runId - Workflow run ID
 * @param runManager - Run manager for logging
 * @param QueryEmbeddingServiceClass - Query embedding service class (for dependency injection)
 * @param context - Workflow run context (for performance config)
 * @param stepIdentifier - Step identifier (default: 'step4' for scan_known_sources)
 * @returns Enhanced documents array
 */
export async function enhanceWithHybridRetrieval(
    documents: ScrapedDocument[],
    onderwerp: string,
    thema: string,
    runId: string,
    runManager: RunManager,
    QueryEmbeddingServiceClass: typeof QueryEmbeddingService,
    context?: Record<string, unknown>,
    stepIdentifier: StepIdentifier = 'step4'
): Promise<ScrapedDocument[]> {
    // HYBRID RETRIEVAL ENHANCEMENT
    // Check if hybrid retrieval is enabled via performance config or env var (fallback)
    let hybridRetrievalEnabled = false;
    let _hybridRetrievalWeight = 0.5; // Default weight (not currently used in implementation)
    
    if (context) {
        const stepConfig = getPerformanceConfigFromContext(context, stepIdentifier);
        hybridRetrievalEnabled = stepConfig.enableHybridRetrieval ?? false;
        _hybridRetrievalWeight = stepConfig.hybridRetrievalWeight ?? 0.5;
    } else {
        // Fallback to env var if no context provided (backward compatibility)
        hybridRetrievalEnabled = process.env.HYBRID_RETRIEVAL_ENABLED === 'true';
    }
    
    if (!hybridRetrievalEnabled || !onderwerp) {
        return documents;
    }
    
    try {
        await runManager.log(runId, 'Hybrid retrieval ingeschakeld - resultaten verrijken met semantisch zoeken...', 'info');
        
        // Generate query embedding using QueryEmbeddingService
        const queryEmbeddingService = new QueryEmbeddingServiceClass();
        let enhancedQuery = onderwerp;
        
        try {
            const embeddingResult = await queryEmbeddingService.embedQuery(onderwerp, {
                onderwerp,
                thema,
                expand: true // Use query expansion for better results
            });
            
            // Use the enhanced/expanded query text for hybrid retrieval
            enhancedQuery = embeddingResult.queryText;
            
            await runManager.log(
                runId,
                `Query embedding gegenereerd: ${embeddingResult.embedding.length} dimensies${embeddingResult.cached ? ' [gecachet]' : ''}`,
                'info'
            );
            
            if (embeddingResult.expandedQuery) {
                await runManager.log(
                    runId,
                    `Query uitgebreid: "${onderwerp}" → "${embeddingResult.expandedQuery}"`,
                    'info'
                );
            }
        } catch (embeddingError) {
            // If embedding generation fails, continue with original query
            logger.warn({ error: embeddingError, runId }, 'Query embedding generation failed in scan_known_sources');
            await runManager.log(
                runId,
                `Query embedding generatie mislukt: ${embeddingError instanceof Error ? embeddingError.message : String(embeddingError)}`,
                'warn'
            );
            // Continue with original query
        }
        
        // Perform hybrid retrieval using HybridRetrievalService (canonical method)
        const { HybridRetrievalService } = await import('../../../services/query/HybridRetrievalService.js');
        const hybridRetrieval = new HybridRetrievalService();
        await hybridRetrieval.init();
        
        // Use canonical retrieval method (returns canonical documents directly)
        const hybridResults = await hybridRetrieval.retrieveCanonical(enhancedQuery, {});
        
        await runManager.log(
            runId,
            `Hybrid retrieval vond ${hybridResults.length} extra documenten`,
            'info'
        );
        
        // Convert canonical results to scraper document format (legacy compatibility)
        const hybridDocuments = hybridResults.map((result) => {
            const doc = result.document;
            const sourceMetadata = doc.sourceMetadata || {};
            // const enrichmentMetadata = doc.enrichmentMetadata || {}; // Unused
            
            // Extract legacy fields from canonical document
            const legacyUrl = sourceMetadata.legacyUrl as string | undefined;
            const legacyWebsiteUrl = sourceMetadata.legacyWebsiteUrl as string | undefined;
            const legacyLabel = sourceMetadata.legacyLabel as string | undefined;
            const legacySubjects = sourceMetadata.legacySubjects as string[] | undefined;
            const legacyThemes = sourceMetadata.legacyThemes as string[] | undefined;
            const legacyType = sourceMetadata.legacyType as string | undefined;
            const legacyPublicatiedatum = sourceMetadata.legacyPublicatiedatum as string | null | undefined;
            
            return {
                titel: doc.title,
                url: doc.canonicalUrl || legacyUrl || '',
                website_url: legacyWebsiteUrl || doc.canonicalUrl || '',
                website_titel: sourceMetadata.legacyWebsiteTitel as string | undefined || '',
                label: legacyLabel || 'scraped',
                samenvatting: doc.fullText?.substring(0, 500) || '', // Truncate for summary
                'relevantie voor zoekopdracht': `Hybrid retrieval score: ${result.finalScore.toFixed(3)} (keyword: ${result.keywordScore.toFixed(3)}, semantic: ${result.semanticScore.toFixed(3)})`,
                type_document: toDocumentType(legacyType || doc.documentType),
                publicatiedatum: typeof legacyPublicatiedatum === 'string' || legacyPublicatiedatum === null ? legacyPublicatiedatum : (doc.dates?.publishedAt?.toISOString() || null),
                subjects: legacySubjects || [],
                themes: legacyThemes || [],
                accepted: sourceMetadata.legacyAccepted as boolean | null | undefined || null,
                score: result.finalScore,
                keywordScore: result.keywordScore,
                semanticScore: result.semanticScore,
            };
        });
        
        // Merge scraper results with hybrid results
        // Deduplicate by URL (keep highest scored version)
        const urlMap = new Map<string, ScrapedDocument & { score?: number }>();
        
        // Add scraper documents first
        for (const doc of documents) {
            urlMap.set(doc.url, doc);
        }
        
        // Add/update with hybrid documents (keep highest score)
        for (const doc of hybridDocuments) {
            const existing = urlMap.get(doc.url);
            if (!existing || (doc.score && (!existing.score || doc.score > existing.score))) {
                urlMap.set(doc.url, doc);
            }
        }
        
        const mergedDocuments = Array.from(urlMap.values());
        const additionalCount = mergedDocuments.length - documents.length;
        
        await runManager.log(
            runId,
            `Hybrid retrieval voltooid: ${documents.length} scraper documenten + ${hybridResults.length} hybrid resultaten = ${mergedDocuments.length} totaal (${additionalCount} nieuwe documenten)`,
            'info'
        );
        
        return mergedDocuments;
    } catch (error) {
        // Graceful degradation: log warning but continue with scraper results only
        const errorMsg = error instanceof Error ? error.message : String(error);
        await runManager.log(
            runId,
            `Hybrid retrieval mislukt: ${errorMsg}. Gebruik alleen scraper resultaten.`,
            'warn'
        );
        logger.error({ error, runId }, 'Hybrid retrieval failed in scan_known_sources');
        return documents;
    }
}



