/**
 * IPLO workflow actions
 * 
 * Contains actions for:
 * - Step 3: search_iplo_documents - Search IPLO documents
 */

import { WorkflowEngine } from '../../../services/workflow/WorkflowEngine.js';
import { RunManager } from '../../../services/workflow/RunManager.js';
import { IPLOScraper } from '../../../services/scraping/iploScraper.js';
import { getQueryPersistenceService, type QueryPersistenceService } from '../../../services/workflow/QueryPersistenceService.js';
import { InputValidationService } from '../../../services/workflow/InputValidationService.js';
import { asString } from '../../workflowUtils.js';
import { logger } from '../../../utils/logger.js';
import { ServiceUnavailableError, BadRequestError, ExternalServiceError, AppError } from '../../../types/errors.js';
import type { NavigationGraph } from '../../../services/graphs/navigation/NavigationGraph.js';
import { ImborService } from '../../../services/external/imborService.js';
import { QueryExpansionService } from '../../../services/query/QueryExpansionService.js';
import { RelationshipBuilderService } from '../../../services/graphs/navigation/RelationshipBuilderService.js';
import { getNeo4jDriver } from '../../../config/neo4j.js';
import { LocalEmbeddingProvider } from '../../../services/query/VectorService.js';
import { mapLegacyParams } from '../../../utils/workflowParamMapping.js';
import { getCappedMaxResults, logPerformanceCap } from '../../../utils/performanceConfig.js';
import { GemeenteBeleidAdapter } from '../../../adapters/gemeente/GemeenteBeleidAdapter.js';
import type { ServiceContext, CanonicalDocument, CanonicalDocumentDraft } from '../../../contracts/types.js';
import { isE2EFixturesEnabled } from '../../../config/featureFlags.js';
import { extractNavigationNodeTitle } from '../../../utils/navigationGraphUtils.js';
import { computeContentHash } from '../../../utils/contentHash.js';
import type { ScrapedDocument } from '../../../services/infrastructure/types.js';

/**
 * Options for dependency injection in registerIPLOActions
 */
export interface IPLOActionsOptions {
    queryPersistenceService?: QueryPersistenceService;
    inputValidationService?: typeof InputValidationService;
    iploScraperClass?: typeof IPLOScraper;
    imborServiceClass?: typeof ImborService;
    queryExpansionServiceClass?: typeof QueryExpansionService;
}

/**
 * Register IPLO-related workflow actions
 * 
 * @param workflowEngine - Workflow engine instance
 * @param runManager - Run manager instance
 * @param navigationGraph - Optional navigation graph instance for saving discovered documents
 * @param options - Optional service dependencies for dependency injection (for testing)
 */
export function registerIPLOActions(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    navigationGraph?: NavigationGraph | null,
    options?: IPLOActionsOptions
): void {
    // Use injected services or fall back to default implementations
    const queryPersistenceService = options?.queryPersistenceService || getQueryPersistenceService();
    const inputValidationService = options?.inputValidationService || InputValidationService;
    const IPLOScraperClass = options?.iploScraperClass || IPLOScraper;
    const ImborServiceClass = options?.imborServiceClass || ImborService;
    const QueryExpansionServiceClass = options?.queryExpansionServiceClass || QueryExpansionService;
    /**
     * Step 3: Search IPLO Documents
     * 
     * Searches IPLO (Informatiepunt Leefomgeving) for policy documents by scraping the IPLO website.
     * This step discovers documents from IPLO's knowledge base.
     * 
     * **Navigation Graph**: If a navigation graph is provided, discovered documents are automatically
     * added to the graph as nodes. This allows the documents to be visualized and used in graph-based
     * workflows and exploration.
     * 
     * @param params - Workflow parameters
     * @param params.onderwerp - Required: Subject/topic for search (string, 1-500 chars)
     * @param params.thema - Optional: Theme/topic refinement (string, max 200 chars)
     * @param params.overheidsinstantie - Optional: Government institution filter (string, max 200 chars). Filters documents by checking if institution name appears in title or summary.
     * @param params.overheidslaag - Optional: Government level filter (string, max 100 chars)
     * @param params.maxResults - Optional: Maximum number of results (number, 1-1000, default: 100)
     * @param params.queryId - Optional: Existing query ID to link results (MongoDB ObjectId)
     * @param runId - Workflow run ID for logging
     * @returns Object containing discovered IPLO documents
     * @returns {CanonicalDocument[]} iploDocuments - Array of discovered IPLO documents in canonical format
     * 
     * @example
     * ```typescript
     * const result = await workflowEngine.execute('search_iplo_documents', {
     *   onderwerp: 'klimaatadaptatie',
     *   maxResults: 50
     * }, runId);
     * // Returns: { iploDocuments: [...] }
     * ```
     * 
     * @see {@link IPLOScraper} - Service handling IPLO website scraping
     * @see {@link QueryPersistenceService} - Service for persisting documents to database
     * @see {@link NavigationGraph} - Navigation graph for storing discovered documents
     */
    workflowEngine.registerAction('search_iplo_documents', async (params: Record<string, unknown>, runId: string) => {
        // Map legacy parameter names to standardized names
        const mappedParams = mapLegacyParams(params, logger);

        // Validate input parameters with comprehensive validation including security checks
        const validation = inputValidationService.validateWorkflowInput('search_iplo_documents', mappedParams);
        if (!validation.valid) {
            const errorDetails = inputValidationService.formatErrorsForResponse(validation.errors);
            const errorMsg = inputValidationService.formatErrorsForLogging(validation.errors);
            await runManager.log(runId, `Parameter validatie mislukt: ${errorMsg}`, 'error');
            logger.warn({ action: 'search_iplo_documents', errors: validation.errors }, 'Workflow action validation failed');
            // Use custom error class per Error Handling Standard
            throw new BadRequestError(`Parameter validation failed: ${errorDetails.message}`, {
                action: 'search_iplo_documents',
                validationErrors: validation.errors
            });
        }

        const validatedParams = validation.sanitizedParams || params;
        const onderwerp = asString(validatedParams.onderwerp) || '';
        const thema = asString(validatedParams.thema) || '';
        const overheidsinstantie = asString(validatedParams.overheidsinstantie) || '';
        const overheidslaag = asString(validatedParams.overheidslaag) || '';
        const query = onderwerp || 'algemeen';
        const queryId = asString(validatedParams.queryId);
        const context = params as Record<string, unknown>;

        // Get performance config and apply caps
        const requestedMaxResults = typeof validatedParams.maxResults === 'number' ? validatedParams.maxResults : undefined;
        const maxResults = getCappedMaxResults(requestedMaxResults, context, 'step2');
        logPerformanceCap('step2', requestedMaxResults, maxResults, runId);

        // Fixture mode for E2E tests
        if (isE2EFixturesEnabled()) {
            logger.info({ action: 'search_iplo_documents', runId }, 'FEATURE_E2E_FIXTURES=true: Returning fixture IPLO documents');
            await runManager.log(
                runId,
                'Stap 3: Fixture IPLO documenten gebruiken (FEATURE_E2E_FIXTURES=true)',
                'info'
            );

            // Dynamic import to avoid runtime errors when tests directory is not available
            let createIPLOFixtures: (count: number) => CanonicalDocument[];
            try {
                const fixturesModule = await import('../../../../../tests/fixtures/workflow/iploFixtures.js');
                createIPLOFixtures = fixturesModule.createIPLOFixtures as (count: number) => CanonicalDocument[];
            } catch (error) {
                logger.error({ error }, 'Failed to load IPLO fixtures, falling back to empty array');
                return { iploDocuments: [] };
            }

            const fixtureDocuments = createIPLOFixtures(Math.min(maxResults, 10));

            // Persist fixture documents to enable downstream processing
            const { getCanonicalDocumentService } = await import('../../../services/canonical/CanonicalDocumentService.js');
            const documentService = getCanonicalDocumentService();

            const persistedDocuments: CanonicalDocument[] = [];
            // Get effective queryId
            const effectiveQueryId = queryId || (context.queryId as string | undefined);

            for (const doc of fixtureDocuments) {
                try {
                    // Create draft from fixture (which is already CanonicalDocument-like)
                    // We need to ensure metadata is set correctly for this run
                    const draft: CanonicalDocumentDraft = {
                        ...doc,
                        enrichmentMetadata: {
                            ...(doc.enrichmentMetadata || {}),
                            queryId: effectiveQueryId,
                            workflowRunId: runId,
                            stepId: 'search-iplo',
                        }
                    };

                    const persisted = await documentService.upsertBySourceId(draft, { requestId: runId });
                    persistedDocuments.push(persisted);
                } catch (error) {
                    logger.warn({ error, sourceId: doc.sourceId }, 'Failed to persist fixture document');
                }
            }

            await runManager.log(
                runId,
                `Stap 3: ${persistedDocuments.length} fixture documenten opgeslagen`,
                'info'
            );

            // Store in context (metadata only)
            const { storeDocumentsInContext } = await import('./documentContextHelpers.js');
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            storeDocumentsInContext(context, 'iplo', persistedDocuments);

            // Also store in main canonicalDocuments context for consistency
            if (!context.canonicalDocuments) {
                context.canonicalDocuments = [];
            }
            const { appendCanonicalDocumentsToContext } = await import('./documentContextHelpers.js');
            appendCanonicalDocumentsToContext(context, persistedDocuments);

            return { iploDocuments: persistedDocuments };
        }

        await runManager.log(
            runId,
            `Stap 3: IPLO doorzoeken voor: ${query || 'algemeen'}`,
            'info'
        );

        try {
            const scraper = new IPLOScraperClass(2); // Default depth 2
            await runManager.log(runId, 'Stap 3: IPLO scraper starten...', 'info');
            const scrapedDocuments = await scraper.scrapeByQuery(
                query || 'algemeen',
                thema || 'algemeen',
                runManager,
                runId,
                overheidsinstantie || undefined // Pass geographic filter parameter
            );
            await runManager.log(runId, `Stap 3: Scraper retourneerde ${scrapedDocuments.length} documenten`, 'info');

            // Limit results to prevent memory issues
            const limit = typeof validatedParams.maxResults === 'number' ? Math.min(validatedParams.maxResults, 100) : 100;
            const limited = scrapedDocuments.slice(0, limit);

            await runManager.log(
                runId,
                `Stap 3: ${limited.length} IPLO documenten gevonden (beperkt van ${scrapedDocuments.length})`,
                'info'
            );

            // Navigation graph nodes will be created after canonical documents are processed
            // This allows us to use the full CanonicalDocument metadata (content, dates, etc.)
            // Initialize relationship builder for later use (after canonical processing)
            let relationshipBuilder: RelationshipBuilderService | null = null;
            const maxRelationships = parseInt(process.env.MAX_GRAPH_RELATIONSHIPS || '3', 10);
            const similarityThreshold = parseFloat(process.env.GRAPH_SIMILARITY_THRESHOLD || '0.6');
            if (navigationGraph) {
                try {
                    const enableRelationships = process.env.ENABLE_GRAPH_RELATIONSHIPS !== 'false';
                    if (enableRelationships) {
                        const driver = getNeo4jDriver();
                        const embeddingProvider = new LocalEmbeddingProvider();
                        relationshipBuilder = new RelationshipBuilderService(
                            driver,
                            navigationGraph,
                            embeddingProvider
                        );
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ error: errorMsg }, 'Failed to initialize RelationshipBuilderService, continuing without relationship creation');
                }
            }

            // Process discovered URLs through canonical pipeline using GemeenteBeleidAdapter
            await runManager.log(runId, 'Stap 3: Canonieke pipeline adapter initialiseren...', 'info');
            const adapter = new GemeenteBeleidAdapter();

            // Get effective queryId for enrichmentMetadata
            const effectiveQueryId = queryId || (context.queryId as string | undefined);

            const serviceContext: ServiceContext = {
                requestId: runId,
                ...(effectiveQueryId && { queryId: effectiveQueryId }),
                workflowRunId: runId,
                stepId: 'search-iplo',
            };

            const canonicalDocuments: CanonicalDocument[] = [];
            const processedDocuments: CanonicalDocument[] = [];

            await runManager.log(
                runId,
                `Verwerken van ${limited.length} ontdekte URLs via canonical pipeline`,
                'info'
            );

            // Get effective queryId and workflowRunId for enrichmentMetadata
            const workflowRunId = runId;

            // Process each scraped document URL through canonical pipeline
            // Use timeout protection to prevent hanging on individual documents
            const { withTimeout } = await import('../../../utils/withTimeout.js');
            const DOCUMENT_PROCESSING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per document

            let processedCount = 0;
            let successCount = 0;
            let failureCount = 0;

            for (const scrapedDoc of limited) {
                if (!scrapedDoc.url) {
                    logger.warn({ doc: scrapedDoc }, 'Document missing URL, skipping');
                    continue;
                }

                try {
                    processedCount++;
                    if (processedCount % 5 === 0 || processedCount === 1) {
                        await runManager.log(
                            runId,
                            `Verwerken document ${processedCount}/${limited.length}: ${scrapedDoc.url.substring(0, 80)}...`,
                            'info'
                        );
                    }

                    // Wrap document processing in timeout to prevent hanging
                    await withTimeout(
                        (async () => {
                            // Use adapter to discover (returns [url] for single URL)
                            const records = await adapter.discover(scrapedDoc.url);

                            if (records.length === 0) {
                                logger.warn({ url: scrapedDoc.url, runId }, 'No records discovered from URL');
                                return;
                            }

                            // Process first record through orchestrator
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

                            const persistResult = await adapter.persist(draft, extensions, ctxWithData) as CanonicalDocument;

                            // Get document from persist result
                            const { getCanonicalDocumentService } = await import('../../../services/canonical/CanonicalDocumentService.js');
                            const documentService = getCanonicalDocumentService();

                            // GemeenteBeleidAdapter returns CanonicalDocument directly, not { documentId: string }
                            const documentId = persistResult._id ? persistResult._id.toString() : '';

                            if (!documentId) {
                                throw new ServiceUnavailableError('Document ID not found in persist result', {
                                    action: 'search_iplo_documents',
                                    runId
                                });
                            }

                            const document = await documentService.findById(documentId) as CanonicalDocument | null;

                            if (!document) {
                                throw new ServiceUnavailableError(`Document not found after persist: ${documentId}`, {
                                    action: 'search_iplo_documents',
                                    runId,
                                    documentId
                                });
                            }

                            const result = {
                                document,
                                extensions,
                                executionTime: 0,
                                stages: {
                                    discover: 0,
                                    acquire: 0,
                                    extract: 0,
                                    map: 0,
                                    extensions: 0,
                                    validate: 0,
                                    persist: 0,
                                },
                            };

                            // Store canonical document directly (no conversion needed)
                            canonicalDocuments.push(result.document);
                            processedDocuments.push(result.document);

                            await runManager.log(
                                runId,
                                `Document verwerkt: ${result.document.title} (ID: ${result.document._id})`,
                                'info'
                            );
                        })(),
                        DOCUMENT_PROCESSING_TIMEOUT_MS,
                        `Verwerken document ${scrapedDoc.url}`
                    );
                    // If we get here without exception, the document was processed successfully
                    successCount++;
                } catch (error) {
                    failureCount++;
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    const isTimeout = errorMessage.includes('timed out');

                    logger.error({ error, url: scrapedDoc.url, runId, isTimeout }, 'Failed to process URL through canonical pipeline');
                    await runManager.log(
                        runId,
                        `Verwerken van ${scrapedDoc.url} mislukt: ${isTimeout ? `Timeout na ${DOCUMENT_PROCESSING_TIMEOUT_MS}ms` : errorMessage}`,
                        'error'
                    );
                    // Skip document if no records found (can't convert DiscoveredDocument to CanonicalDocument without processing)
                }
            }

            await runManager.log(
                runId,
                `Canonical pipeline verwerking voltooid: ${successCount} geslaagd, ${failureCount} mislukt van ${processedCount} totaal`,
                'info'
            );

            await runManager.log(
                runId,
                `Totaal documenten verwerkt via canonical pipeline: ${canonicalDocuments.length}/${limited.length}`,
                'info'
            );
            
            // Log queryId status
            if (effectiveQueryId) {
                await runManager.log(
                    runId,
                    `Step 3: QueryId "${effectiveQueryId}" was set for ${canonicalDocuments.length} successfully processed documents`,
                    'info'
                );
            } else {
                await runManager.log(
                    runId,
                    `Step 3: ⚠️  WARNING - No queryId available! ${canonicalDocuments.length} documents were processed but will not be linked to query.`,
                    'warn'
                );
            }

            // Store in context (for backward compatibility)
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            // Store in context (only metadata to prevent 16MB BSON limit)
            const { storeDocumentsInContext } = await import('./documentContextHelpers.js');
            storeDocumentsInContext(context, 'iplo', processedDocuments);

            // Documents are already persisted via canonical pipeline (GemeenteBeleidAdapter)
            // Only create Query document if needed (for workflow tracking), but don't persist to brondocumenten
            let finalQueryId: string | null = null;
            // effectiveQueryId already declared above at line 303, reuse it

            if (canonicalDocuments.length > 0) {
                if (effectiveQueryId) {
                    // Query already exists, just set in context
                    finalQueryId = effectiveQueryId;
                    context.queryId = finalQueryId;

                    await runManager.log(
                        runId,
                        `Stap 3: ${canonicalDocuments.length} IPLO documenten verwerkt via canonieke pipeline (Query ID: ${finalQueryId})`,
                        'info'
                    );
                } else if (onderwerp) {
                    // Create Query document for workflow tracking (documents already in canonical store)
                    // Use QueryPersistenceService directly (workflow-level utility)
                    finalQueryId = await queryPersistenceService.createQuery(
                        {
                            onderwerp,
                            thema,
                            overheidsinstantie,
                            overheidslaag,
                        },
                        runId
                    );

                    if (finalQueryId) {
                        context.queryId = finalQueryId;

                        // Update persisted documents with the new queryId to ensure linkage
                        try {
                            const { getCanonicalDocumentService } = await import('../../../services/canonical/CanonicalDocumentService.js');
                            const documentService = getCanonicalDocumentService();

                            const updates = canonicalDocuments.map(doc => ({
                                url: doc.canonicalUrl || doc.sourceId || '',
                                enrichmentMetadata: {
                                    queryId: finalQueryId,
                                    workflowRunId: runId,
                                    stepId: 'search-iplo',
                                }
                            })).filter(u => !!u.url);

                            if (updates.length > 0) {
                                await documentService.bulkUpdateEnrichmentMetadata(updates);
                                await runManager.log(
                                    runId,
                                    `Step 3: Updated ${updates.length} documents with new Query ID: ${finalQueryId}`,
                                    'info'
                                );
                            }
                        } catch (updateError) {
                            logger.error({ error: updateError, runId, queryId: finalQueryId }, 'Failed to backfill queryId for IPLO documents');
                            await runManager.log(
                                runId,
                                `Step 3: Warning - Failed to update documents with new Query ID: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
                                'warn'
                            );
                        }

                        await runManager.log(
                            runId,
                            `Stap 3: ${canonicalDocuments.length} IPLO documenten verwerkt via canonieke pipeline en Query document aangemaakt (Query ID: ${finalQueryId})`,
                            'info'
                        );
                    } else {
                        await runManager.log(
                            runId,
                            `Stap 3: ${canonicalDocuments.length} IPLO documenten verwerkt via canonieke pipeline (WAARSCHUWING: Kon Query document niet aanmaken)`,
                            'warn'
                        );
                    }
                } else {
                    await runManager.log(
                        runId,
                        `Stap 3: ${canonicalDocuments.length} IPLO documenten verwerkt via canonieke pipeline (geen Query document aangemaakt - geen queryId of onderwerp opgegeven)`,
                        'info'
                    );
                }
            }

            // Ensure we always have documents to return (even if canonical processing failed)
            // This prevents the workflow from hanging if all canonical processing fails
            // Note: If canonical processing fails, we can't fall back to DiscoveredDocument
            // because services now require CanonicalDocument. Log error and return empty array.
            if (processedDocuments.length === 0 && canonicalDocuments.length === 0) {
                await runManager.log(
                    runId,
                    'Waarschuwing: Alle documenten mislukt canonical verwerking. Geen documenten om terug te geven.',
                    'warn'
                );
                // Return empty array - workflow should handle this gracefully
            }

            // Add nodes to navigation graph from CanonicalDocuments (after processing, so we have full metadata)
            let nodesAdded = 0;
            let relationshipsCreated = 0;
            if (navigationGraph && canonicalDocuments.length > 0) {
                try {
                    const workflowId = context.workflowId as string | undefined;
                    
                    for (const canonicalDoc of canonicalDocuments) {
                        try {
                            const url = canonicalDoc.canonicalUrl || (canonicalDoc.sourceId ? `https://iplo.nl/document/${canonicalDoc.sourceId}` : '');
                            if (!url) continue;
                            
                            // Determine node type based on document type
                            const nodeType: 'page' | 'section' | 'document' =
                                canonicalDoc.documentType === 'PDF' || canonicalDoc.documentType === 'Rapport' || canonicalDoc.documentType === 'Beleidsdocument'
                                    ? 'document'
                                    : 'page';

                            // Extract content from fullText (first 2000 chars for semantic search)
                            const content = canonicalDoc.fullText 
                                ? canonicalDoc.fullText.substring(0, 2000).trim()
                                : undefined;
                            
                            // Extract summary (first 500 chars) for display
                            const summary = canonicalDoc.fullText
                                ? canonicalDoc.fullText.substring(0, 500).trim()
                                : undefined;

                            const newNode = {
                                url: url,
                                type: nodeType,
                                title: extractNavigationNodeTitle(canonicalDoc, url),
                                content: content, // Store content for semantic search
                                children: [],
                                lastVisited: new Date().toISOString(),
                                thema: thema || undefined,
                                onderwerp: onderwerp || undefined,
                                sourceUrl: url,
                                // Additional metadata from CanonicalDocument
                                documentType: canonicalDoc.documentType,
                                publishedAt: canonicalDoc.dates?.publishedAt?.toISOString(),
                                publisherAuthority: canonicalDoc.publisherAuthority,
                                summary: summary
                            };

                            // Always call addNode - it will handle existing nodes and return 'added', 'updated', or 'unchanged'
                            const addResult = await navigationGraph.addNode(newNode, { runId, workflowId });

                            // Count as added if it was actually added or updated (not just unchanged)
                            if (addResult === 'added' || addResult === 'updated') {
                                nodesAdded++;
                            }

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

                                    // Then try metadata-based linking
                                    const metadataResult = await relationshipBuilder.linkByMetadata(newNode, {
                                        thema: thema || undefined,
                                        onderwerp: onderwerp || undefined,
                                        sourceUrl: url || undefined,
                                    });

                                    const totalRelationships = semanticResult.relationshipsCreated + metadataResult.relationshipsCreated;
                                    relationshipsCreated += totalRelationships;

                                    if (totalRelationships > 0) {
                                        logger.debug(
                                            { url: url, relationships: totalRelationships },
                                            `Linked ${url} to ${totalRelationships} related nodes (${semanticResult.relationshipsCreated} semantic, ${metadataResult.relationshipsCreated} metadata)`,
                                        );
                                    }
                                } catch (error) {
                                    const errorMsg = error instanceof Error ? error.message : String(error);
                                    logger.warn({ url: url, error: errorMsg }, 'Failed to link IPLO document to related nodes');
                                }
                            }
                        } catch (error) {
                            const errorMsg = error instanceof Error ? error.message : String(error);
                            logger.warn({ documentId: canonicalDoc._id, error: errorMsg }, 'Failed to add IPLO document to navigation graph');
                            // Continue with other documents even if one fails
                        }
                    }

                    // Always save graph after node operations, even if nodesAdded is 0
                    // This ensures graph state is persisted and visible after workflow completion
                    if (canonicalDocuments.length > 0) {
                        try {
                            await navigationGraph.save();
                            const logMessage = relationshipsCreated > 0
                                ? `Stap 3: ${nodesAdded} IPLO documenten toegevoegd aan navigatiegrafiek, ${relationshipsCreated} relaties aangemaakt`
                                : `Stap 3: ${nodesAdded} IPLO documenten toegevoegd aan navigatiegrafiek`;
                            await runManager.log(runId, logMessage, 'info');
                        } catch (error) {
                            const errorMsg = error instanceof Error ? error.message : String(error);
                            logger.warn({ error: errorMsg }, 'Failed to save navigation graph after adding IPLO documents');
                            await runManager.log(
                                runId,
                                `Navigatiegrafiek opslaan mislukt: ${errorMsg}`,
                                'warn'
                            );
                            // Don't fail the workflow if graph save fails
                        }
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ error: errorMsg }, 'Failed to save IPLO documents to navigation graph');
                    await runManager.log(
                        runId,
                        `Kon niet toevoegen aan grafiek: ${errorMsg}`,
                        'warn'
                    );
                }
            }

            // Populate knowledge graph from CanonicalDocument[] using WorkflowDocumentToKGService
            // Phase 1: Enable SHACL validation for IPLO workflows (markdown knowledge base as source of truth)
            if (canonicalDocuments.length > 0) {
                try {
                    // Use helper function for standardized KG integration
                    const { populateKnowledgeGraphFromDocuments } = await import('./helpers/knowledgeGraphIntegration.js');
                    // Enable strictValidation (SHACL) for IPLO workflows - markdown knowledge base is source of truth
                    const { FeatureFlag } = await import('../../../models/FeatureFlag.js');
                    const enableStrictValidation = FeatureFlag.isValidationEnabled();
                    await populateKnowledgeGraphFromDocuments(canonicalDocuments, runManager, {
                        workflowRunId: runId,
                        workflowId: context.workflowId as string | undefined,
                        source: 'iplo',
                        validate: true,
                        strictValidation: enableStrictValidation, // Phase 1: SHACL validation enabled
                    });
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ error: errorMsg, runId }, 'Failed to populate knowledge graph from IPLO documents');
                    await runManager.log(runId, `Waarschuwing: Kennisgrafiek kon niet worden gevuld: ${errorMsg}`, 'warn');
                    // Don't fail the workflow if KG population fails
                }
            }

            await runManager.log(
                runId,
                `Stap 3: Actie voltooid, retourneert ${processedDocuments.length} verwerkte documenten (${canonicalDocuments.length} canoniek, ${processedDocuments.length - canonicalDocuments.length} origineel)`,
                'info'
            );

            return {
                iploDocuments: processedDocuments,
                queryId: finalQueryId || effectiveQueryId
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
            const isValidationError = error instanceof BadRequestError;
            const isServiceError = error instanceof ServiceUnavailableError || error instanceof ExternalServiceError;
            
            // Build comprehensive error diagnostic information
            const errorDiagnostic: Record<string, unknown> = {
                errorMessage,
                errorType: error instanceof Error ? error.constructor.name : typeof error,
                errorCode: error instanceof AppError ? error.code : 'UNKNOWN_ERROR',
                isNetworkError,
                isTimeoutError,
                isValidationError,
                isServiceError,
                searchQuery: {
                    onderwerp,
                    thema,
                    overheidsinstantie,
                    overheidslaag,
                    query
                },
                documentsFound: 0,
                reason: isNetworkError ? 'network_connectivity_issue' :
                       isTimeoutError ? 'request_timeout' :
                       isValidationError ? 'parameter_validation_failed' :
                       isServiceError ? 'service_unavailable' :
                       'unknown_error'
            };

            // Log comprehensive error information to workflow logs
            await runManager.log(
                runId,
                `Fout bij zoeken in IPLO: ${errorMessage}`,
                'error'
            );

            await runManager.log(
                runId,
                `Stap 3: Foutdiagnose informatie: ${JSON.stringify(errorDiagnostic, null, 2)}`,
                'error',
                errorDiagnostic
            );

            if (errorStack) {
                await runManager.log(
                    runId,
                    `Stap 3: Fout stack trace: ${errorStack.substring(0, 1000)}`,
                    'error'
                );
            }

            // Log to application logger with full context
            logger.error({
                error,
                runId,
                params: {
                    onderwerp,
                    thema,
                    overheidsinstantie,
                    overheidslaag,
                    query
                },
                errorDiagnostic
            }, 'Error in search_iplo_documents');

            // For validation errors, re-throw to fail the workflow step (per Error Handling Standard)
            if (isValidationError) {
                throw error;
            }

            // For critical service errors, log but allow workflow to continue (per Workflow Compensation Strategies)
            // Most workflow steps are read-only and don't require compensation
            // Store empty array in context to indicate no documents found due to error
            const context = params as Record<string, unknown>;
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            (context.rawDocumentsBySource as Record<string, unknown>).iplo = [];
            (context.rawDocumentsBySource as Record<string, unknown>).iploError = {
                error: errorMessage,
                diagnostic: errorDiagnostic,
                timestamp: new Date().toISOString(),
                guidance: isNetworkError 
                    ? 'Network connectivity issue detected. Check internet connection and IPLO service status.'
                    : isTimeoutError
                    ? 'Request timeout. IPLO service may be slow or unavailable. Workflow will continue with other sources.'
                    : 'IPLO search failed. Check logs for details. Workflow will continue with other sources.'
            };

            await runManager.log(
                runId,
                `Stap 3: Actie retourneert leeg resultaat vanwege fout (workflow zal doorgaan): ${errorDiagnostic.reason as string}`,
                'warn'
            );

            // Return empty array (don't break workflow) - per Workflow Compensation Strategies
            // This is a read-only operation, so no compensation needed
            return { iploDocuments: [] };
        }
    });

    /**
     * Scan IPLO with enhanced query support
     * 
     * Scans IPLO using either an enhanced query from a previous step or direct query parameters.
     * This is a simpler variant of the main search_iplo_documents action that doesn't include
     * validation or persistence.
     * 
     * @param params - Workflow parameters
     * @param params.enhancedQuery - Enhanced query from previous step (optional)
     * @param params.enhancedTerms - Enhanced terms array (optional)
     * @param params.query - Direct query parameter (optional)
     * @param params.onderwerp - Subject/topic (optional)
     * @param params.theme - Theme (optional, defaults to 'bodem')
     * @param params.thema - Alternative theme parameter (optional)
     * @param runId - Workflow run ID for logging
     * @returns Object containing discovered IPLO documents
     */
    workflowEngine.registerAction('scan_iplo', async (params: { query?: string; theme?: string; thema?: string; onderwerp?: string; enhancedQuery?: string; enhancedTerms?: string[] } & Record<string, unknown>, runId: string) => {
        // Use enhanced query from previous step if available, otherwise use direct query param
        const enhancedQuery = asString(params.enhancedQuery);
        const enhancedTerms = Array.isArray(params.enhancedTerms) ? params.enhancedTerms as string[] : [];
        const query = asString(params.query) || enhancedQuery || (enhancedTerms.length > 0 ? enhancedTerms.join(' ') : '');

        // Get theme from params or use default
        const theme = asString(params.theme) || asString(params.thema) || 'bodem';

        // Get onderwerp for IPLO scraper (it expects onderwerp and thema separately)
        const onderwerp = asString(params.onderwerp) || query || 'algemeen';
        const thema = theme;

        const context = params;
        const scraper = new IPLOScraperClass(2); // Default depth 2 for scans

        const searchQuery = query || onderwerp;
        await runManager.log(runId, `IPLO scannen: ${searchQuery}${thema ? ` (thema: ${thema})` : ''}`, 'info');

        if (enhancedQuery) {
            await runManager.log(runId, `Uitgebreide zoekopdracht van vorige stap gebruiken: "${enhancedQuery}"`, 'info');
        }

        const documents = await scraper.scrapeByQuery(onderwerp, thema, runManager, runId);

        await runManager.log(runId, `${documents.length} documenten gevonden voor "${searchQuery}"`, 'info');

        // Add nodes to navigation graph from discovered documents
        let nodesAdded = 0;
        if (navigationGraph && documents.length > 0) {
            try {
                const workflowId = context.workflowId as string | undefined;
                
                for (const doc of documents) {
                    try {
                        if (!doc.url) continue;
                        
                        // Canonically use doc.title if available, otherwise fall back to doc.titel
                        const docTitle = ('title' in doc && typeof (doc as any).title === 'string') 
                            ? (doc as any).title 
                            : doc.titel;
                        const newNode = {
                            url: doc.url,
                            type: 'page' as const,
                            title: extractNavigationNodeTitle({ title: docTitle, canonicalUrl: doc.url }, doc.url),
                            children: [],
                            lastVisited: new Date().toISOString(),
                            thema: thema || undefined,
                            onderwerp: onderwerp || undefined,
                            sourceUrl: doc.url,
                        };

                        // Always call addNode - it will handle existing nodes and return 'added', 'updated', or 'unchanged'
                        const addResult = await navigationGraph.addNode(newNode, { runId, workflowId });

                        // Count as added if it was actually added or updated (not just unchanged)
                        if (addResult === 'added' || addResult === 'updated') {
                            nodesAdded++;
                        }
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        logger.warn({ url: doc.url, error: errorMsg }, 'Failed to add IPLO document to navigation graph in scan_iplo');
                        // Continue with other documents even if one fails
                    }
                }

                // Always save graph after adding nodes, even if nodesAdded is 0
                if (documents.length > 0) {
                    try {
                        await navigationGraph.save();
                        await runManager.log(
                            runId,
                            `Stap 3: ${nodesAdded} IPLO documenten toegevoegd aan navigatiegrafiek`,
                            'info'
                        );
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        logger.warn({ error: errorMsg }, 'Failed to save navigation graph after scan_iplo');
                        await runManager.log(
                            runId,
                            `Navigatiegrafiek opslaan mislukt: ${errorMsg}`,
                            'warn'
                        );
                        // Don't fail the workflow if graph save fails
                    }
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.warn({ error: errorMsg }, 'Failed to add IPLO documents to navigation graph in scan_iplo');
                await runManager.log(
                    runId,
                    `Kon niet toevoegen aan grafiek: ${errorMsg}`,
                    'warn'
                );
            }
        }

        // Populate knowledge graph from discovered documents (if workflow integration is enabled)
        if (documents.length > 0 && navigationGraph) {
            try {
                const { FeatureFlag } = await import('../../../models/FeatureFlag.js');
                // Note: KG workflow integration is always enabled
                {
                    await runManager.log(runId, `Kennisgrafiek vullen vanuit ${documents.length} IPLO documenten...`, 'info');

                    // Documents are already ScrapedDocument[], so we can use them directly
                    // But we cast to ensure type compatibility
                    // Using dynamic import type for flexibility
                    // Fix import path to reference correct location relative to this file
                    // const scrapedDocuments = documents as unknown as import('../../../services/infrastructure/types.js').ScrapedDocument[]; // Unused

                    // Get GraphManager and populate KG
                    const { GraphManager } = await import('../../../services/scraping/GraphManager.js');
                    const { RelationshipExtractionService } = await import('../../../services/extraction/RelationshipExtractionService.js');

                    // Initialize relationship extraction service if enabled
                    // Note: EntityExtractionService is no longer needed - GraphManager uses PolicyParser internally
                    const relationshipExtractionService = FeatureFlag.isRelationshipExtractionEnabled()
                        ? new RelationshipExtractionService()
                        : undefined;

                    const graphManager = new GraphManager(
                        navigationGraph,
                        relationshipExtractionService
                    );

                    // Pass workflow context for provenance tracking
                    const context = params as Record<string, unknown>;
                    await graphManager.populateKnowledgeGraph(documents, {
                        workflowRunId: runId,
                        workflowId: context.workflowId as string | undefined,
                        source: 'iplo'
                    });
                    await runManager.log(runId, `Kennisgrafiek gevuld met entiteiten uit ${documents.length} documenten`, 'info');
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.warn({ error: errorMsg, runId }, 'Failed to populate knowledge graph from IPLO documents');
                await runManager.log(runId, `Waarschuwing: Kennisgrafiek kon niet worden gevuld: ${errorMsg}`, 'warn');
                // Don't fail the workflow if KG population fails
            }
        }

        return { iploDocuments: documents };
    });

    /**
     * Scan IPLO for known subjects
     * 
     * Scans IPLO for a predefined list of known subjects. For each subject:
     * 1. Enhances the query with IMBOR
     * 2. Scans IPLO using the enhanced query
     * 3. Collects all documents
     * 
     * Known IPLO subjects (hardcoded):
     * - bodem (soil)
     * - water
     * - ruimtelijke ordening (spatial planning)
     * - bouwen/wonen (building/housing)
     * - milieu (environment)
     * - geluid (noise)
     * - externe veiligheid (external safety)
     * - energie (energy)
     * - natuur (nature)
     * - klimaat (climate)
     * 
     * @param params - Workflow parameters
     * @param params.subjects - Optional array of subjects to scan (overrides default list)
     * @param runId - Workflow run ID for logging
     * @returns Object containing discovered IPLO documents
     * @returns {unknown[]} iploDocuments - Array of discovered documents
     * @returns {number} subjectsProcessed - Number of subjects processed
     * @returns {Array<{ subject: string; documents: unknown[] }>} documentsBySubject - Documents grouped by subject
     */
    workflowEngine.registerAction('scan_iplo_known_subjects', async (params: Record<string, unknown>, runId: string) => {
        try {
            await runManager.log(runId, 'scan_iplo_known_subjects actie starten', 'info');

            // Hardcoded list of known IPLO subjects
            const knownSubjects: string[] = [
                'bodem',
                'water',
                'ruimtelijke ordening',
                'bouwen',
                'wonen',
                'milieu',
                'geluid',
                'externe veiligheid',
                'energie',
                'natuur',
                'klimaat'
            ];

            // Allow override via params if needed
            const subjectsToScan = Array.isArray(params.subjects)
                ? params.subjects as string[]
                : knownSubjects;

            await runManager.log(runId, `IPLO scan starten: ${subjectsToScan.length} bekende onderwerpen: ${subjectsToScan.join(', ')}`, 'info');

            const allDocuments: Array<{ subject: string; documents: unknown[] }> = [];
            const scraper = new IPLOScraper(2);

            // Initialize services for query enhancement
            await runManager.log(runId, 'IMBOR service initialiseren...', 'info');
            let imborService: InstanceType<typeof ImborServiceClass>;
            let queryExpansion: InstanceType<typeof QueryExpansionServiceClass>;

            try {
                imborService = new ImborServiceClass();
                await runManager.log(runId, 'IMBOR service aangemaakt, wachten op vocabulaire laden...', 'info');

                // Wait for IMBOR to load (with timeout handling)
                await Promise.race([
                    imborService.waitForLoad(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('IMBOR service load timeout (15s)')), 15000)
                    )
                ]).catch(async (error) => {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    // Use translation key with error message parameter
                    await runManager.log(runId, `IMBOR laadwaarschuwing. Doorgaan in basis modus...: ${errorMsg}`, 'warn');
                });

                queryExpansion = new QueryExpansionServiceClass(imborService);
                await runManager.log(runId, 'Zoekopdracht uitbreidingsservice geïnitialiseerd', 'info');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                // Use translation key with error message parameter
                await runManager.log(runId, `Initialisatie services mislukt: ${errorMsg}`, 'error');
                throw new ServiceUnavailableError(`Service initialization failed: ${errorMsg}`, {
                    action: 'search_iplo_documents',
                    runId,
                    originalError: errorMsg,
                    reason: 'service_initialization_failed'
                });
            }

            // Process each subject
            for (const subject of subjectsToScan) {
                try {
                    await runManager.log(runId, `Onderwerp verwerken: "${subject}"`, 'info');

                    // Step 1: Enhance query with IMBOR
                    await runManager.log(runId, `Zoekopdracht uitbreiden: "${subject}"`, 'info');
                    const expanded = await queryExpansion.expandQuery({
                        onderwerp: subject,
                        thema: subject, // Use subject as both onderwerp and thema
                    });

                    await runManager.log(
                        runId,
                        `Zoekopdracht uitgebreid: "${subject}" uitgebreid → ${expanded.allTerms.length} termen (${expanded.expansionSources.join(', ')})`,
                        'info'
                    );

                    // Step 2: Scan IPLO with enhanced query
                    // Use the enhanced query (all terms joined) or fall back to original subject
                    // The IPLO scraper will use semantic matching, so we can use the enhanced terms
                    const enhancedOnderwerp = expanded.allTerms.length > 0
                        ? expanded.allTerms.join(' ')  // Use all enhanced terms for better coverage
                        : subject;
                    const thema = subject;

                    await runManager.log(runId, `IPLO scannen: "${enhancedOnderwerp}" (thema: "${thema}")`, 'info');
                    const documents = await scraper.scrapeByQuery(enhancedOnderwerp, thema, runManager, runId);

                    await runManager.log(
                        runId,
                        `${documents.length} documenten gevonden voor "${subject}"`,
                        'info'
                    );

                    allDocuments.push({
                        subject,
                        documents
                    });

                } catch (error) {
                    logger.error({ error, subject, runId }, `Error processing subject: ${subject}`);
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    await runManager.log(
                        runId,
                        `Fout bij verwerken "${subject}": ${errorMsg}. Doorgaan met volgend onderwerp.`,
                        'warn'
                    );
                    // Continue with next subject
                }
            }

            // Flatten all documents into a single array
            const flatDocuments = allDocuments.flatMap(item => item.documents);

            await runManager.log(
                runId,
                `IPLO scan voltooid: ${flatDocuments.length} documenten gevonden over ${subjectsToScan.length} onderwerpen`,
                'info'
            );

            // Add nodes to navigation graph from discovered documents
            let nodesAdded = 0;
            if (navigationGraph && flatDocuments.length > 0) {
                try {
                    const workflowId = params.workflowId as string | undefined;
                    
                    for (const doc of flatDocuments) {
                        try {
                            // Cast to ScrapedDocument to access fields
                            const scrapedDoc = doc as ScrapedDocument;
                            const docUrl = scrapedDoc.url;
                            // ScrapedDocument uses 'titel', but handle 'title' just in case
                            const docTitle = scrapedDoc.titel || (doc as any).title;
                            
                            if (!docUrl) continue;
                            
                            // Determine thema and onderwerp from the subject that found this document
                            const docSubject = allDocuments.find(item => item.documents.includes(doc))?.subject;
                            const docThema = docSubject || undefined;
                            const docOnderwerp = docSubject || undefined;
                            
                            const newNode = {
                                url: docUrl,
                                type: 'page' as const,
                                title: extractNavigationNodeTitle({ title: docTitle, canonicalUrl: docUrl }, docUrl),
                                children: [],
                                lastVisited: new Date().toISOString(),
                                lastFetched: new Date().toISOString(), // Enhanced: structure-first metadata
                                thema: docThema,
                                onderwerp: docOnderwerp,
                                sourceUrl: docUrl,
                                canonicalUrl: docUrl, // Enhanced: canonical URL
                                // Enhanced: structure-first fields
                                contentType: (scrapedDoc.type_document === 'PDF' ? 'pdf' : 'html') as 'html' | 'pdf' | 'xml' | 'json' | 'other' | undefined,
                                siteId: 'iplo',
                                domain: 'iplo.nl',
                                httpStatus: 200,
                                hash: computeContentHash(docTitle || '', scrapedDoc.samenvatting || '', docUrl || ''),
                            };

                            // Always call addNode - it will handle existing nodes and return 'added', 'updated', or 'unchanged'
                            const addResult = await navigationGraph.addNode(newNode, { runId, workflowId });

                            // Count as added if it was actually added or updated (not just unchanged)
                            if (addResult === 'added' || addResult === 'updated') {
                                nodesAdded++;
                            }
                        } catch (error) {
                            const errorMsg = error instanceof Error ? error.message : String(error);
                            const docUrl = (doc as { url?: string }).url || 'unknown';
                            logger.warn({ url: docUrl, error: errorMsg }, 'Failed to add IPLO document to navigation graph in scan_iplo_known_subjects');
                            // Continue with other documents even if one fails
                        }
                    }

                    // Always save graph after adding nodes, even if nodesAdded is 0
                    if (flatDocuments.length > 0) {
                        try {
                            await navigationGraph.save();
                            await runManager.log(
                                runId,
                                `Stap 3: ${nodesAdded} IPLO documenten toegevoegd aan navigatiegrafiek`,
                                'info'
                            );
                        } catch (error) {
                            const errorMsg = error instanceof Error ? error.message : String(error);
                            logger.warn({ error: errorMsg }, 'Failed to save navigation graph after scan_iplo_known_subjects');
                            await runManager.log(
                                runId,
                                `Navigatiegrafiek opslaan mislukt: ${errorMsg}`,
                                'warn'
                            );
                            // Don't fail the workflow if graph save fails
                        }
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ error: errorMsg }, 'Failed to add IPLO documents to navigation graph in scan_iplo_known_subjects');
                    await runManager.log(
                        runId,
                        `Kon niet toevoegen aan grafiek: ${errorMsg}`,
                        'warn'
                    );
                }
            }

            // Populate knowledge graph from discovered documents (if workflow integration is enabled)
            if (flatDocuments.length > 0 && navigationGraph) {
                try {
                    const { FeatureFlag } = await import('../../../models/FeatureFlag.js');
                    // Note: KG workflow integration is always enabled
                {
                        await runManager.log(runId, `Kennisgrafiek vullen vanuit ${flatDocuments.length} IPLO documenten...`, 'info');

                        // Documents are already ScrapedDocument[], so we can use them directly
                        // But we cast to ensure type compatibility
                        const scrapedDocuments = flatDocuments as unknown as import('../../../services/infrastructure/types.js').ScrapedDocument[];

                        // Get GraphManager and populate KG
                        const { GraphManager } = await import('../../../services/scraping/GraphManager.js');
                        const { RelationshipExtractionService } = await import('../../../services/extraction/RelationshipExtractionService.js');

                        // Initialize relationship extraction service if enabled
                        // Note: EntityExtractionService is no longer needed - GraphManager uses PolicyParser internally
                        const relationshipExtractionService = FeatureFlag.isRelationshipExtractionEnabled()
                            ? new RelationshipExtractionService()
                            : undefined;

                        const graphManager = new GraphManager(
                            navigationGraph,
                            relationshipExtractionService
                        );

                        // Pass workflow context for provenance tracking
                        const context = params;
                        await graphManager.populateKnowledgeGraph(scrapedDocuments, {
                            workflowRunId: runId,
                            workflowId: context.workflowId as string | undefined,
                            source: 'iplo'
                        });
                        await runManager.log(runId, `Kennisgrafiek gevuld met entiteiten uit ${flatDocuments.length} documenten`, 'info');
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ error: errorMsg, runId }, 'Failed to populate knowledge graph from IPLO documents');
                    await runManager.log(runId, `Waarschuwing: Kennisgrafiek kon niet worden gevuld: ${errorMsg}`, 'warn');
                    // Don't fail the workflow if KG population fails
                }
            }

            return {
                iploDocuments: flatDocuments,
                subjectsProcessed: subjectsToScan.length,
                documentsBySubject: allDocuments
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;

            await runManager.log(
                runId,
                `scan_iplo_known_subjects actie mislukt: ${errorMsg}`,
                'error'
            );

            if (errorStack) {
                await runManager.log(
                    runId,
                    `DSO Locatie Zoeken: Stack trace: ${errorStack.substring(0, 1000)}`,
                    'debug'
                );
            }

            // Re-throw to ensure workflow engine handles the error
            throw error;
        }
    });
}

