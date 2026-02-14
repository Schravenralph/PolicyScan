/**
 * Query enhancement workflow actions
 * 
 * Contains actions for:
 * - enhance_with_imbor - Enhance query using IMBOR ontology
 */

import { WorkflowEngine } from '../../../services/workflow/WorkflowEngine.js';
import { RunManager } from '../../../services/workflow/RunManager.js';
import { ImborService } from '../../../services/external/imborService.js';
import { QueryExpansionService } from '../../../services/query/QueryExpansionService.js';
import { QueryEmbeddingService } from '../../../services/ingestion/embeddings/QueryEmbeddingService.js';
import { asString } from '../../workflowUtils.js';
import { logger } from '../../../utils/logger.js';
import { mapLegacyParams } from '../../../utils/workflowParamMapping.js';
import { ServiceUnavailableError, ExternalServiceError, AppError } from '../../../types/errors.js';

/**
 * Options for dependency injection in registerQueryActions
 */
export interface QueryActionsOptions {
    imborServiceClass?: typeof ImborService;
    queryExpansionServiceClass?: typeof QueryExpansionService;
    queryEmbeddingServiceClass?: typeof QueryEmbeddingService;
}

/**
 * Register query enhancement workflow actions
 * 
 * @param workflowEngine - Workflow engine instance
 * @param runManager - Run manager instance
 * @param options - Optional service dependencies for dependency injection (for testing)
 */
export function registerQueryActions(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    options?: QueryActionsOptions
): void {
    // Use injected services or fall back to default implementations
    const ImborServiceClass = options?.imborServiceClass || ImborService;
    const QueryExpansionServiceClass = options?.queryExpansionServiceClass || QueryExpansionService;
    const QueryEmbeddingServiceClass = options?.queryEmbeddingServiceClass || QueryEmbeddingService;
    /**
     * Enhance query with IMBOR ontology
     * 
     * Expands a query using IMBOR (Informatie Model Bouw en Ruimte) ontology to include
     * related terms and concepts. Also generates query embeddings for semantic search.
     * 
     * @param params - Workflow parameters
     * @param params.onderwerp - Subject/topic for search (string)
     * @param params.thema - Theme/topic refinement (string)
     * @param params.overheidslaag - Government level filter (string)
     * @param params.query - Alternative query parameter (fallback for onderwerp)
     * @param runId - Workflow run ID for logging
     * @returns Object containing enhanced query data
     * @returns {string} enhancedQuery - Expanded query string
     * @returns {string[]} enhancedTerms - All terms (original + expanded)
     * @returns {string[]} originalTerms - Original query terms
     * @returns {string[]} expandedTerms - Newly added terms
     * @returns {string[]} queryVariations - Alternative query formulations
     * @returns {Record<string, unknown>} expansionContext - Context information
     * @returns {string[]} expansionSources - Sources used for expansion
     * @returns {string} domain - Detected domain
     * @returns {number[]} queryEmbedding - Query embedding vector (optional)
     * @returns {string} queryEmbeddingText - Text used for embedding (optional)
     * 
     * @see {@link QueryExpansionService} - Service handling query expansion
     * @see {@link ImborService} - Service providing IMBOR ontology data
     * @see {@link QueryEmbeddingService} - Service generating query embeddings
     */
    workflowEngine.registerAction('enhance_with_imbor', async (params, runId) => {
        // Map legacy parameter names to standardized names
        const mappedParams = mapLegacyParams(params as Record<string, unknown>, logger);
        
        const onderwerp = asString(mappedParams.onderwerp) || '';
        const thema = asString(mappedParams.thema) || '';
        const overheidslaag = asString(mappedParams.overheidslaag);

        // Use thema as fallback if onderwerp is empty, or default to 'algemeen'
        const effectiveOnderwerp = onderwerp || thema || 'algemeen';

        if (!onderwerp) {
            await runManager.log(
                runId,
                `⚠️  No onderwerp provided for query expansion${thema ? `, using thema: "${thema}"` : ', using default: "algemeen"'}`,
                'warn'
            );
        }

        try {
            // Initialize query expansion service with IMBOR integration
            const imborService = new ImborServiceClass();
            const queryExpansion = new QueryExpansionServiceClass(imborService);

            // Wait for IMBOR to load if needed
            await imborService.waitForLoad();

            // Expand the query (domain will be auto-detected if not provided)
            // Use effectiveOnderwerp to handle fallback cases
            const expanded = await queryExpansion.expandQuery({
                onderwerp: effectiveOnderwerp,
                thema,
                overheidslaag
            });

            // Log expansion details
            await runManager.log(
                runId,
                `🔍 Query expansion: "${effectiveOnderwerp}" → ${expanded.allTerms.length} terms (${expanded.expansionSources.join(', ')})`,
                'info'
            );

            if (expanded.expandedTerms.length > 0) {
                await runManager.log(
                    runId,
                    `   Added terms: ${expanded.expandedTerms.slice(0, 5).join(', ')}${expanded.expandedTerms.length > 5 ? '...' : ''}`,
                    'info'
                );
            }

            if (expanded.queryVariations.length > 0) {
                await runManager.log(
                    runId,
                    `   Generated ${expanded.queryVariations.length} query variations for multi-angle search`,
                    'info'
                );
            }

            // Generate query embedding using QueryEmbeddingService
            // Store in workflow context for reuse in subsequent steps
            const workflowContext: Record<string, unknown> = {};
            const queryEmbeddingService = new QueryEmbeddingServiceClass(queryExpansion);
            
            let queryEmbedding: number[] | undefined;
            let embeddingResult: { embedding: number[]; queryText: string; cached: boolean; expandedQuery?: string } | null = null;
            
            try {
                // Use expanded query for embedding if available, otherwise use effective query
                const queryForEmbedding = expanded.allTerms.join(' ') || effectiveOnderwerp;
                embeddingResult = await queryEmbeddingService.embedQuery(queryForEmbedding, {
                    onderwerp: effectiveOnderwerp,
                    thema,
                    expand: true, // Use expanded query
                    workflowContext
                });

                queryEmbedding = embeddingResult.embedding;
                
                await runManager.log(
                    runId,
                    `📊 Query embedding generated (${queryEmbedding.length} dimensions)${embeddingResult.cached ? ' [cached]' : ''}`,
                    'info'
                );
            } catch (embeddingError) {
                logger.warn({ error: embeddingError, runId }, 'Query embedding generation failed in enhance_with_imbor');
                await runManager.log(
                    runId,
                    `⚠️  Query embedding generation failed: ${embeddingError instanceof Error ? embeddingError.message : String(embeddingError)}. Continuing without embedding.`,
                    'warn'
                );
                // Continue without embedding - workflow can still proceed
            }

            // Detect domain for return value
            const domain = queryExpansion.detectDomain({
                onderwerp: effectiveOnderwerp,
                thema,
                overheidslaag
            });

            // Return expanded query data for use in subsequent workflow steps
            return {
                enhancedQuery: expanded.allTerms.join(' '),
                enhancedTerms: expanded.allTerms,
                originalTerms: expanded.originalTerms,
                expandedTerms: expanded.expandedTerms,
                queryVariations: expanded.queryVariations,
                expansionContext: expanded.context,
                expansionSources: expanded.expansionSources,
                domain: domain,
                queryEmbedding: queryEmbedding, // Store embedding for reuse
                queryEmbeddingText: embeddingResult?.queryText
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            
            // Categorize error type for better diagnostics
            const isNetworkError = errorMessage.includes('network') || 
                                  errorMessage.includes('ECONNREFUSED') || 
                                  errorMessage.includes('ETIMEDOUT') ||
                                  errorMessage.includes('ENOTFOUND');
            const isTimeoutError = errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT');
            const isServiceError = error instanceof ServiceUnavailableError || error instanceof ExternalServiceError;
            
            // Build comprehensive error diagnostic information
            const errorDiagnostic: Record<string, unknown> = {
                errorMessage,
                errorType: error instanceof Error ? error.constructor.name : typeof error,
                errorCode: error instanceof AppError ? error.code : 'UNKNOWN_ERROR',
                isNetworkError,
                isTimeoutError,
                isServiceError,
                searchQuery: {
                    onderwerp: effectiveOnderwerp,
                    thema,
                    overheidslaag
                },
                reason: isNetworkError ? 'network_connectivity_issue' :
                       isTimeoutError ? 'request_timeout' :
                       isServiceError ? 'service_unavailable' :
                       'unknown_error'
            };

            logger.error({ 
                error, 
                runId,
                errorDiagnostic
            }, 'Error in query expansion');

            await runManager.log(
                runId,
                `⚠️  Query expansion failed: ${errorMessage}. Using original query.`,
                'warn'
            );

            await runManager.log(
                runId,
                `Query Expansion: Error diagnostic information: ${JSON.stringify(errorDiagnostic, null, 2)}`,
                'warn',
                errorDiagnostic
            );

            if (errorStack) {
                await runManager.log(
                    runId,
                    `Query Expansion: Error stack trace: ${errorStack.substring(0, 1000)}`,
                    'warn'
                );
            }
            
            // Fallback to effective query (don't break workflow)
            // This is a non-critical enhancement step
            return {
                enhancedQuery: `${effectiveOnderwerp} ${thema}`.trim(),
                enhancedTerms: [effectiveOnderwerp, thema].filter(Boolean),
                expandedTerms: [],
                queryVariations: [],
                expansionContext: {},
                expansionSources: [],
                domain: 'unknown'
            };
        }
    });
}

