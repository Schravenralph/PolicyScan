/**
 * Google search workflow actions
 * 
 * Contains actions for:
 * - scan_google - Stub Google search action
 * - google_search_topic - Targeted Google search across specific sites
 */

import { WorkflowEngine } from '../../../services/workflow/WorkflowEngine.js';
import { RunManager } from '../../../services/workflow/RunManager.js';
import { GoogleSearchService } from '../../../services/external/googleSearch.js';
import { NavigationGraph, type NavigationNode } from '../../../services/graphs/navigation/NavigationGraph.js';
import { RelationshipBuilderService } from '../../../services/graphs/navigation/RelationshipBuilderService.js';
import { getNeo4jDriver } from '../../../config/neo4j.js';
import { LocalEmbeddingProvider } from '../../../services/query/VectorService.js';
import { logger } from '../../../utils/logger.js';
import { getQueryPersistenceService } from '../../../services/workflow/QueryPersistenceService.js';
import { mapLegacyParams } from '../../../utils/workflowParamMapping.js';
import { InputValidationService } from '../../../services/workflow/InputValidationService.js';
import { getCappedMaxResults, logPerformanceCap } from '../../../utils/performanceConfig.js';
import { BadRequestError, ServiceUnavailableError } from '../../../types/errors.js';
import { GemeenteBeleidAdapter } from '../../../adapters/gemeente/GemeenteBeleidAdapter.js';
import type { ServiceContext, CanonicalDocument } from '../../../contracts/types.js';
import type { DiscoveredDocument } from '../../../services/external/DSOOntsluitenService.js';
import { isE2EFixturesEnabled } from '../../../config/featureFlags.js';
import { extractNavigationNodeTitle } from '../../../utils/navigationGraphUtils.js';

/**
 * Type for google_search_topic action parameters
 * Standardized to use onderwerp as primary parameter (query is legacy fallback)
 * Standardized to use maxResults for result limits (numResults is legacy fallback)
 */
interface GoogleSearchTopicParams {
    onderwerp?: string;  // Primary parameter (standardized)
    thema?: string;
    query?: string;  // Legacy fallback (deprecated, use onderwerp instead)
    siteRestrict?: string[];
    maxResults?: number;  // Standardized parameter (replaces numResults)
    numResults?: number;  // Legacy fallback (deprecated, use maxResults instead)
    queryId?: string;
}

/**
 * Register Google search workflow actions
 * 
 * @param workflowEngine - Workflow engine instance
 * @param runManager - Run manager instance
 * @param navigationGraph - Optional navigation graph instance for storing discovered URLs
 */
export function registerGoogleActions(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    navigationGraph?: NavigationGraph | null
): void {
    
    /**
     * Stub Google search action
     * 
     * Returns empty results. This is a placeholder action that may be implemented in the future.
     * 
     * @param _params - Workflow parameters (unused)
     * @param _runId - Workflow run ID (unused)
     * @returns Object with empty Google documents array
     */
    workflowEngine.registerAction('scan_google', async (_params, _runId) => {
        return { googleDocuments: [] };
    });

    /**
     * Targeted Google search across specific sites
     * 
     * Performs a Google Custom Search across a list of specified sites (or default sites).
     * Discovered URLs are added to the navigation graph for follow-up crawling.
     * 
     * @param params - Workflow parameters
     * @param params.onderwerp - Subject/topic (required, standardized parameter)
     * @param params.thema - Theme/topic refinement (optional)
     * @param params.query - Search query (optional, legacy fallback - deprecated, use onderwerp instead)
     * @param params.siteRestrict - Array of site domains to restrict search to (optional)
     * @param params.maxResults - Maximum number of results to return (optional, default: 10, standardized parameter)
     * @param params.numResults - Number of results (optional, legacy fallback - deprecated, use maxResults instead)
     * @param runId - Workflow run ID for logging
     * @returns Object containing Google search results
     * @returns {unknown[]} googleDocuments - Array of Google search results
     * @returns {string[]} googleUrls - Array of discovered URLs (added to navigation graph)
     * 
     * @see {@link GoogleSearchService} - Service handling Google Custom Search API
     * @see {@link NavigationGraph} - Navigation graph for storing discovered URLs
     */
    workflowEngine.registerAction('google_search_topic', async (params: GoogleSearchTopicParams, runId: string) => {
        // Map legacy parameter names to standardized names
        const mappedParams = mapLegacyParams(params as Record<string, unknown>, logger);
        
        // Validate input parameters with comprehensive validation including security checks
        const validation = InputValidationService.validateWorkflowInput('google_search_topic', mappedParams);
        if (!validation.valid) {
            const errorDetails = InputValidationService.formatErrorsForResponse(validation.errors);
            const errorMsg = InputValidationService.formatErrorsForLogging(validation.errors);
            await runManager.log(runId, `Parameter validatie mislukt: ${errorMsg}`, 'error');
            logger.warn({ action: 'google_search_topic', errors: validation.errors }, 'Workflow action validation failed');
            // Use custom error class per Error Handling Standard
            throw new BadRequestError(`Parameter validation failed: ${errorDetails.message}`, {
                action: 'google_search_topic',
                validationErrors: validation.errors
            });
        }
        
        const validatedParams = validation.sanitizedParams || mappedParams;
        const queryPersistenceService = getQueryPersistenceService();
        const {
            query,  // Legacy fallback
            siteRestrict = [],
            maxResults: requestedMaxResults = 10,  // Standardized parameter (mapped from numResults if needed)
            onderwerp = '',
            thema = '',
            queryId
        } = validatedParams as Record<string, unknown>;
        const context = params as Record<string, unknown>;
        
        // Get performance config and apply caps (step5: Google Search)
        const requestedMaxResultsNum = typeof requestedMaxResults === 'number' ? requestedMaxResults : undefined;
        const maxResults = getCappedMaxResults(requestedMaxResultsNum, context, 'step5');
        logPerformanceCap('step5', requestedMaxResultsNum, maxResults, runId);

        // Fixture mode for E2E tests
        if (isE2EFixturesEnabled()) {
            logger.info({ action: 'google_search_topic', runId }, 'FEATURE_E2E_FIXTURES=true: Returning fixture Google search documents');
            
            await runManager.log(
                runId,
                'Stap 5: Fixture Google-zoekdocumenten gebruiken (FEATURE_E2E_FIXTURES=true)',
                'info'
            );
            
            // Dynamic import to avoid runtime errors when tests directory is not available
            let createDocumentFixtures: () => { dsoDiscovery: DiscoveredDocument[] };
            try {
                // @ts-expect-error - tests directory is excluded from tsconfig.server.json, but fixtures are available at runtime
                const fixturesModule = await import('../../../../tests/fixtures/workflow/documentFixtures.js');
                createDocumentFixtures = fixturesModule.createDocumentFixtures;
            } catch (error) {
                logger.error({ error }, 'Failed to load document fixtures, falling back to empty array');
                return { googleDocuments: [] };
            }
            
            // Get fixture documents from documentFixtures
            const fixtureData = createDocumentFixtures();
            // Google search typically returns documents similar to other sources
            // Use a subset of the fixture documents as Google search results
            // Apply performance cap to fixture results too
            const fixtureMaxResults = getCappedMaxResults(requestedMaxResultsNum, context, 'step5');
            const fixtureDocuments: DiscoveredDocument[] = fixtureData.dsoDiscovery.slice(0, Math.min(fixtureMaxResults, 5)).map((doc: DiscoveredDocument) => ({
                ...doc,
                sourceType: 'GOOGLE_SEARCH',
                matchExplanation: `Fixture Google search result for "${onderwerp || query || 'test'}"`,
            }));
            
            // Store in context
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            (context.rawDocumentsBySource as Record<string, unknown>).google = fixtureDocuments;
            
            // Extract URLs for navigation graph
            const googleUrls = fixtureDocuments.map(doc => doc.url);
            
            // Create Query document for workflow tracking (fixture documents are test data, not persisted to canonical store)
            const fixtureEffectiveQueryId = (typeof queryId === 'string' ? queryId : undefined) || (context.queryId as string | undefined);
            if (fixtureDocuments.length > 0) {
                if (fixtureEffectiveQueryId) {
                    // Query already exists, just set in context
                    context.queryId = fixtureEffectiveQueryId;
                    await runManager.log(
                        runId,
                        `Stap 5: Fixture Google-zoekdocumenten gebruiken (Query ID: ${fixtureEffectiveQueryId}) - fixture documenten zijn alleen testdata`,
                        'info'
                    );
                } else {
                    await runManager.log(
                        runId,
                        'Stap 5: Fixture Google-zoekdocumenten gebruiken (geen queryId opgegeven) - fixture documenten zijn alleen testdata',
                        'info'
                    );
                }
            }
            
            return { googleDocuments: fixtureDocuments, googleUrls };
        }

        // Get effective queryId once at the top of the function (reused throughout)
        const effectiveQueryId = (typeof queryId === 'string' ? queryId : undefined) || (context.queryId as string | undefined);

        // Get graph instance - must be provided via dependency injection
        if (!navigationGraph) {
            throw new ServiceUnavailableError('NavigationGraph must be provided for google_search_topic action', {
                action: 'google_search_topic',
                runId,
                reason: 'navigation_graph_not_available'
            });
        }
        const graph = navigationGraph;

        const googleSearch = new GoogleSearchService();

        if (!googleSearch.isConfigured()) {
            await runManager.log(
                runId,
                '⚠️ Google Custom Search not configured; skipping targeted Google step',
                'warn'
            );
            return { googleDocuments: [], googleUrls: [] };
        }

        const defaultSites = [
            'horstaandemaas.nl',
            'horstaandemaas2040.nl',
            'iplo.nl',
            'officielebekendmakingen.nl',
            'rijksoverheid.nl'
        ];

        const siteRestrictArray = Array.isArray(siteRestrict) ? siteRestrict : (typeof siteRestrict === 'string' ? [siteRestrict] : []);
        const siteList = Array.from(new Set([...defaultSites, ...siteRestrictArray].filter(Boolean)));
        const queryStr = typeof query === 'string' ? query : '';
        const onderwerpStr = typeof onderwerp === 'string' ? onderwerp : '';
        const themaStr = typeof thema === 'string' ? thema : '';
        const searchQuery = (queryStr || [onderwerpStr, themaStr].filter(Boolean).join(' ')).trim() || 'arbeidsmigratie';

        await runManager.log(
            runId,
            `🔎 Running targeted Google search for "${searchQuery}" across ${siteList.length} sites`,
            'info'
        );

        const documents = await googleSearch.search(searchQuery, {
            siteRestrict: siteList,
            numResults: maxResults  // Map maxResults to numResults for GoogleSearchService interface
        });

        await runManager.log(
            runId,
            `✅ Google search returned ${documents.length} items for "${searchQuery}"`,
            'info'
        );

        // Check if relationship creation is enabled
        const enableRelationships = process.env.ENABLE_GRAPH_RELATIONSHIPS !== 'false';
        const maxRelationships = parseInt(process.env.MAX_GRAPH_RELATIONSHIPS || '3', 10);
        const similarityThreshold = parseFloat(process.env.GRAPH_SIMILARITY_THRESHOLD || '0.6');

        // Initialize relationship builder if enabled
        let relationshipBuilder: RelationshipBuilderService | null = null;
        if (enableRelationships) {
            try {
                const driver = getNeo4jDriver();
                const embeddingProvider = new LocalEmbeddingProvider();
                relationshipBuilder = new RelationshipBuilderService(
                    driver,
                    graph,
                    embeddingProvider
                );
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.warn({ error: errorMsg }, 'Failed to initialize RelationshipBuilderService, continuing without relationship creation');
            }
        }

        // Add discovered URLs to navigation graph for follow-up crawling
        const googleUrls: string[] = [];
        let relationshipsCreated = 0;
        for (const doc of documents) {
            if (!doc.url) continue;
            googleUrls.push(doc.url);
            
            try {
                const newNode: NavigationNode = {
                    url: doc.url,
                    type: (doc.type_document === 'PDF' ? 'document' : 'page') as 'page' | 'document' | 'section',
                    title: extractNavigationNodeTitle({ title: doc.titel, canonicalUrl: doc.url }, doc.url),
                    children: [],
                    sourceUrl: doc.website_url
                };

                await graph.addNode(newNode, { runId, workflowId: context.workflowId as string | undefined });

                // Link to related nodes if relationship builder is available
                if (relationshipBuilder) {
                    try {
                        // First try semantic similarity
                        const semanticResult = await relationshipBuilder.linkToRelatedNodes(newNode, {
                            maxLinks: maxRelationships,
                            similarityThreshold,
                            enableSemanticLinking: true,
                            enableMetadataLinking: false, // We'll do metadata separately
                        });
                        
                        // Then try metadata-based linking (sourceUrl matching)
                        const metadataResult = await relationshipBuilder.linkByMetadata(newNode, {
                            sourceUrl: doc.website_url
                        });

                        const totalRelationships = semanticResult.relationshipsCreated + metadataResult.relationshipsCreated;
                        if (totalRelationships > 0) {
                            relationshipsCreated += totalRelationships;
                            await runManager.log(
                                runId,
                                `Gekoppeld aan ${totalRelationships} gerelateerde documenten (${semanticResult.relationshipsCreated} op basis van inhoud, ${metadataResult.relationshipsCreated} op basis van metadata)`,
                                'info'
                            );
                        }
                    } catch (error) {
                        // Log but don't fail workflow
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        logger.warn({ url: doc.url, error: errorMsg }, 'Failed to link Google search result to related nodes');
                    }
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.warn({ url: doc.url, error: errorMsg }, 'Failed to add Google search result to navigation graph (missing title)');
                // Continue with other documents
            }
        }

        // Populate knowledge graph from Google search results
        if (documents.length > 0 && graph) {
            try {
                const { FeatureFlag } = await import('../../../models/FeatureFlag.js');
                // Note: KG workflow integration is always enabled
                {
                    await runManager.log(runId, `Kennisgrafiek vullen vanuit ${documents.length} Google zoekresultaten...`, 'info');

                    // Convert ScrapedDocument[] to format for KG population
                    const scrapedDocuments = documents.map(doc => ({
                        url: doc.url,
                        titel: doc.titel,
                        markdown: (doc as { markdown?: string }).markdown || '',
                        samenvatting: doc.samenvatting || doc.titel,
                        website_url: doc.website_url || doc.url,
                        website_titel: doc.website_titel || 'Google Search',
                        type_document: doc.type_document || 'web_document',
                        publicatiedatum: doc.publicatiedatum,
                        metadata: (doc as { metadata?: Record<string, unknown> }).metadata || {},
                    } as import('../../../services/infrastructure/types.js').ScrapedDocument));

                    // Get GraphManager and populate KG
                    const { GraphManager } = await import('../../../services/scraping/GraphManager.js');
                    const { RelationshipExtractionService } = await import('../../../services/extraction/RelationshipExtractionService.js');

                    // Initialize relationship extraction service if enabled
                    // Note: EntityExtractionService is no longer needed - GraphManager uses PolicyParser internally
                    const relationshipExtractionService = FeatureFlag.isRelationshipExtractionEnabled()
                        ? new RelationshipExtractionService()
                        : undefined;

                    const graphManager = new GraphManager(
                        graph,
                        relationshipExtractionService
                    );

                    // Pass workflow context for provenance tracking
                    await graphManager.populateKnowledgeGraph(scrapedDocuments, {
                        workflowRunId: runId,
                        workflowId: context.workflowId as string | undefined,
                        source: 'google-search'
                    });
                    await runManager.log(runId, `Kennisgrafiek gevuld met entiteiten uit ${documents.length} Google zoekresultaten`, 'info');
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.warn({ error: errorMsg, runId }, 'Failed to populate knowledge graph from Google search results');
                await runManager.log(runId, `Waarschuwing: Kennisgrafiek kon niet worden gevuld: ${errorMsg}`, 'warn');
                // Don't fail the workflow if KG population fails
            }
        }

        // Ensure graph is saved after adding nodes
        if (googleUrls.length > 0) {
            try {
                await graph.save();
                const nodeCounts = await graph.getNodeCount();
                const logMessage = relationshipsCreated > 0
                    ? `💾 Navigation graph saved: ${nodeCounts.total} total nodes after adding Google search results, created ${relationshipsCreated} relationships`
                    : `💾 Navigation graph saved: ${nodeCounts.total} total nodes after adding Google search results`;
                await runManager.log(runId, logMessage, 'info');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                await runManager.log(runId, `Navigatiegrafiek opslaan mislukt: ${errorMsg}`, 'warn');
                // Don't fail the workflow if graph save fails
            }
        }

        // Process discovered URLs through canonical pipeline using GemeenteBeleidAdapter
        const adapter = new GemeenteBeleidAdapter();
        
        // effectiveQueryId already declared above, reuse it
        const workflowRunId = runId;
        
        const serviceContext: ServiceContext = {
            requestId: runId,
        };

        const canonicalDocuments: CanonicalDocument[] = [];

        await runManager.log(
            runId,
            `Verwerken van ${googleUrls.length} documenten via canonical pipeline`,
            'info'
        );

        // Process each discovered URL through canonical pipeline
        for (const url of googleUrls) {
            try {
                // Use adapter to discover (returns [url] for single URL)
                const records = await adapter.discover(url);
                
                if (records.length === 0) {
                    logger.warn({ url, runId }, 'No records discovered from URL');
                    continue;
                }
                
                // Process first record through pipeline manually to set enrichmentMetadata
                const record = records[0];
                
                // Execute pipeline up to map() to get draft
                const artifactBundle = await adapter.acquire(record) as Buffer;
                const extracted = await adapter.extract(artifactBundle);
                const draft = adapter.map(extracted);
                
                // Set enrichmentMetadata.queryId and workflowRunId before persist
                if (!draft.enrichmentMetadata) {
                    draft.enrichmentMetadata = {};
                }
                if (effectiveQueryId) {
                    draft.enrichmentMetadata.queryId = effectiveQueryId;
                }
                draft.enrichmentMetadata.workflowRunId = workflowRunId;
                
                // Continue with extensions, validate, and persist
                const extensions = adapter.extensions(extracted);
                adapter.validate(draft);
                
                const ctxWithData = {
                    ...serviceContext,
                    artifactBuffer: artifactBundle,
                    extractedData: extracted,
                };
                
                const persistResult = await adapter.persist(draft, extensions, ctxWithData);
                
                // Get document from persist result
                const { getCanonicalDocumentService } = await import('../../../services/canonical/CanonicalDocumentService.js');
                const documentService = getCanonicalDocumentService();
                const document = await documentService.findById((persistResult as { documentId: string }).documentId) as CanonicalDocument | null;
                
                if (!document) {
                    throw new ServiceUnavailableError(`Document not found after persist: ${(persistResult as { documentId: string }).documentId}`, {
                        action: 'google_search_topic',
                        runId,
                        documentId: (persistResult as { documentId: string }).documentId
                    });
                }
                
                // Store canonical document directly (no conversion needed)
                canonicalDocuments.push(document);
                
                await runManager.log(
                    runId,
                    `Document verwerkt: ${document.title} (ID: ${document._id})`,
                    'info'
                );
            } catch (error) {
                logger.error({ error, url, runId }, 'Failed to process URL through canonical pipeline');
                await runManager.log(
                    runId,
                    `Verwerken mislukt: ${url} - ${error instanceof Error ? error.message : String(error)}`,
                    'error'
                );
                // Continue with next URL
            }
        }

        await runManager.log(
            runId,
            `Totaal documenten verwerkt via canonical pipeline: ${canonicalDocuments.length}/${canonicalDocuments.length}`,
            'info'
        );

        // Documents are already persisted via canonical pipeline (GemeenteBeleidAdapter + AdapterOrchestrator)
        // Only create Query document if needed (for workflow tracking), but don't persist to brondocumenten
        let finalQueryId: string | null = null;
        // effectiveQueryId already declared above at line 162 or 325, reuse it
        
        if (canonicalDocuments.length > 0) {
            if (effectiveQueryId) {
                // Query already exists, just set in context
                finalQueryId = effectiveQueryId;
                context.queryId = finalQueryId;
                
                await runManager.log(
                    runId,
                    `Stap 5: ${canonicalDocuments.length} documenten verwerkt via canonical pipeline (Query ID: ${finalQueryId})`,
                    'info'
                );
            } else if (onderwerpStr) {
                // Create Query document for workflow tracking (documents already in canonical store)
                finalQueryId = await queryPersistenceService.createQuery(
                    {
                        onderwerp: onderwerpStr,
                        thema: themaStr,
                    },
                    runId
                );
                
                if (finalQueryId) {
                    context.queryId = finalQueryId;
                    await runManager.log(
                        runId,
                        `Stap 5: ${canonicalDocuments.length} documenten verwerkt via canonical pipeline en Query document aangemaakt (Query ID: ${finalQueryId})`,
                        'info'
                    );
                } else {
                    await runManager.log(
                        runId,
                        `Stap 5: ${canonicalDocuments.length} documenten verwerkt via canonical pipeline (WAARSCHUWING: Kon Query document niet aanmaken)`,
                        'warn'
                    );
                }
            } else {
                await runManager.log(
                    runId,
                    `Stap 5: ${canonicalDocuments.length} documenten verwerkt via canonical pipeline (geen Query document aangemaakt - geen queryId of onderwerp opgegeven)`,
                    'info'
                );
            }
        }

        // Populate knowledge graph from CanonicalDocument[] using WorkflowDocumentToKGService
        if (canonicalDocuments.length > 0) {
            try {
                // Use helper function for standardized KG integration
                const { populateKnowledgeGraphFromDocuments } = await import('./helpers/knowledgeGraphIntegration.js');
                await populateKnowledgeGraphFromDocuments(canonicalDocuments, runManager, {
                    workflowRunId: runId,
                    workflowId: context.workflowId as string | undefined,
                    source: 'google-search',
                    validate: true,
                });
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.warn({ error: errorMsg, runId }, 'Failed to populate knowledge graph from Google search documents');
                await runManager.log(runId, `Waarschuwing: Kennisgrafiek kon niet worden gevuld: ${errorMsg}`, 'warn');
                // Don't fail the workflow if KG population fails
            }
        }

        // Store canonical documents in context (only metadata to prevent 16MB BSON limit)
        const { storeDocumentsInContext } = await import('./documentContextHelpers.js');
        storeDocumentsInContext(context, 'googleSearch', canonicalDocuments);

        return {
            googleDocuments: canonicalDocuments, // Now CanonicalDocument[]
            googleUrls
        };
    });
}


