/**
 * External workflow actions
 * 
 * Contains actions for:
 * - Step 6: search_officielebekendmakingen - Search official publications
 * - Step 7: search_rechtspraak - Search jurisprudence
 */

import { WorkflowEngine } from '../../../services/workflow/WorkflowEngine.js';
import { RunManager } from '../../../services/workflow/RunManager.js';
import { OfficieleBekendmakingenService } from '../../../services/external/OfficieleBekendmakingenService.js';
import { InputValidationService } from '../../../services/workflow/InputValidationService.js';
import { getQueryPersistenceService, type QueryPersistenceService } from '../../../services/workflow/QueryPersistenceService.js';
import { asString } from '../../workflowUtils.js';
import { logger } from '../../../utils/logger.js';
import { BadRequestError, ServiceUnavailableError, ExternalServiceError, AppError } from '../../../types/errors.js';
import type { NavigationGraph } from '../../../services/graphs/navigation/NavigationGraph.js';
import { RelationshipBuilderService } from '../../../services/graphs/navigation/RelationshipBuilderService.js';
import { getNeo4jDriver } from '../../../config/neo4j.js';
import { LocalEmbeddingProvider } from '../../../services/query/VectorService.js';
import { mapLegacyParams } from '../../../utils/workflowParamMapping.js';
import { getCappedMaxResults, logPerformanceCap } from '../../../utils/performanceConfig.js';
import { limitConcurrency } from '../../../utils/concurrency.js';
import { RechtspraakAdapter } from '../../../adapters/rechtspraak/RechtspraakAdapter.js';
import { LegalExtensionService } from '../../../services/extensions/LegalExtensionService.js';
import { GemeenteBeleidAdapter } from '../../../adapters/gemeente/GemeenteBeleidAdapter.js';
import type { ServiceContext, CanonicalDocument, ArtifactProvenance, ArtifactRef } from '../../../contracts/types.js';
import { isE2EFixturesEnabled } from '../../../config/featureFlags.js';
import { RechtspraakQueryExpansionService } from '../../../services/query/RechtspraakQueryExpansionService.js';
import { extractNavigationNodeTitle } from '../../../utils/navigationGraphUtils.js';

/**
 * Helper: coerce null/empty to undefined and convert strings to Date
 */
function coerceDate(value: unknown): Date | undefined {
    if (value === null || value === undefined) return undefined;
    // if already Date, keep it
    if (value instanceof Date) return value;
    // if ISO string, convert to Date
    if (typeof value === 'string' && value.trim() !== '') {
        const date = new Date(value);
        // Return undefined if invalid date
        return isNaN(date.getTime()) ? undefined : date;
    }
    return undefined;
}

/**
 * Helper: ensure provenance.headers is not null (make it undefined)
 */
function sanitizeProvenance(prov: ArtifactProvenance | null | undefined): ArtifactProvenance | undefined {
    if (!prov || typeof prov !== 'object') return undefined;
    // If headers is null -> remove it (undefined). If it's an object, keep it.
    const headers = prov.headers == null ? undefined : prov.headers;
    return {
        ...prov,
        headers,
    };
}


/**
 * Format CanonicalDocument for output validation
 * 
 * Ensures all required fields are present and properly formatted according to canonicalDocumentSchema.
 * This helper function ensures documents returned from the action match the expected output schema.
 * 
 * Sanitizes null values to undefined for optional fields, as Zod schemas accept undefined but not null.
 * 
 * @param doc - CanonicalDocument from database
 * @returns Formatted CanonicalDocument with all required fields, null values converted to undefined
 */
function formatCanonicalDocumentForOutput(doc: CanonicalDocument): CanonicalDocument {
    const artifactRefs: ArtifactRef[] = (doc.artifactRefs || []).map((ref) => {
        // sanitize provenance (in particular headers)
        const provenance = sanitizeProvenance(ref.provenance);
        if (!provenance) {
            throw new Error('ArtifactRef must have provenance');
        }
        return {
            ...ref,
            provenance,
            // createdAt is required, use ref value or current date as fallback
            createdAt: ref.createdAt instanceof Date ? ref.createdAt : new Date(ref.createdAt || Date.now()),
        };
    });

    // createdAt and updatedAt are required Date fields
    const createdAt = doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt || Date.now());
    const updatedAt = doc.updatedAt instanceof Date ? doc.updatedAt : new Date(doc.updatedAt || Date.now());

    return {
        _id: doc._id,
        source: doc.source,
        sourceId: doc.sourceId,
        canonicalUrl: doc.canonicalUrl,
        title: doc.title,
        publisherAuthority: doc.publisherAuthority,
        documentFamily: doc.documentFamily,
        documentType: doc.documentType,
        dates: {
            publishedAt: coerceDate(doc.dates?.publishedAt),
            validFrom: coerceDate(doc.dates?.validFrom),
            validTo: coerceDate(doc.dates?.validTo),
        },
        fullText: doc.fullText,
        contentFingerprint: doc.contentFingerprint,
        language: doc.language || 'nl',
        artifactRefs,
        sourceMetadata: doc.sourceMetadata || {},
        enrichmentMetadata: doc.enrichmentMetadata,
        // versionOf: ensure null -> undefined (zod expects string|undefined)
        versionOf: doc.versionOf == null ? undefined : doc.versionOf,
        reviewStatus: doc.reviewStatus || 'pending_review',
        reviewMetadata: doc.reviewMetadata,
        createdAt,
        updatedAt,
        schemaVersion: doc.schemaVersion,
    };
}

/**
 * Options for dependency injection in registerExternalActions
 */
export interface ExternalActionsOptions {
    queryPersistenceService?: QueryPersistenceService;
    inputValidationService?: typeof InputValidationService;
    officieleBekendmakingenServiceClass?: typeof OfficieleBekendmakingenService;
}

/**
 * Register external-related workflow actions
 * 
 * @param workflowEngine - Workflow engine instance
 * @param runManager - Run manager instance
 * @param navigationGraph - Optional navigation graph instance for storing discovered URLs
 * @param options - Optional service dependencies for dependency injection (for testing)
 */
export function registerExternalActions(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    navigationGraph?: NavigationGraph | null,
    options?: ExternalActionsOptions
): void {
    // Use injected services or fall back to default implementations
    const queryPersistenceService = options?.queryPersistenceService || getQueryPersistenceService();
    const inputValidationService = options?.inputValidationService || InputValidationService;
    const OfficieleBekendmakingenServiceClass = options?.officieleBekendmakingenServiceClass || OfficieleBekendmakingenService;

    /**
     * Step 6: Search Officiele Bekendmakingen
     * 
     * Searches the Officiele Bekendmakingen (Official Publications) database for policy documents
     * using SRU (Search and Retrieval via URL) protocol via the KOOP repository.
     * This step discovers official government publications related to the search topic.
     * 
     * **API**: Uses SRU protocol at https://repository.overheid.nl/sru
     * **Service**: OfficieleBekendmakingenService (wraps SruService)
     * **Documentation**: docs/30-officielebekendmakingen/API-RESEARCH.md
     * 
     * @param params - Workflow parameters
     * @param params.onderwerp - Required: Subject/topic for search (string, 1-500 chars)
     * @param params.thema - Optional: Theme/topic refinement (string, max 200 chars)
     * @param params.overheidsinstantie - Optional: Government institution filter (string, max 200 chars)
     * @param params.overheidslaag - Optional: Government level filter (string, max 100 chars)
     * @param params.maxResults - Optional: Maximum number of results (number, 1-1000, default: 20)
     * @param params.queryId - Optional: Existing query ID to link results (MongoDB ObjectId)
     * @param runId - Workflow run ID for logging
     * @returns Object containing discovered official publications
     * @returns {CanonicalDocument[]} officieleBekendmakingenDocuments - Array of discovered official publications
     * 
     * @example
     * ```typescript
     * const result = await workflowEngine.execute('search_officielebekendmakingen', {
     *   onderwerp: 'klimaatadaptatie',
     *   overheidsinstantie: 'Gemeente Amsterdam',
     *   maxResults: 50
     * }, runId);
     * // Returns: { officieleBekendmakingenDocuments: [...] }
     * ```
     * 
     * **Navigation Graph**: If a navigation graph is provided, discovered documents are automatically
     * added to the graph as nodes. This allows the documents to be visualized and used in graph-based
     * workflows and exploration.
     * 
     * @see {@link OfficieleBekendmakingenService} - Service handling SRU protocol interactions
     * @see {@link SruService} - Core SRU protocol implementation
     * @see {@link QueryPersistenceService} - Service for persisting documents to database
     * @see {@link NavigationGraph} - Navigation graph for storing discovered documents
     */
    workflowEngine.registerAction('search_officielebekendmakingen', async (params: Record<string, unknown>, runId: string) => {
        // Map legacy parameter names to standardized names
        const mappedParams = mapLegacyParams(params, logger);
        
        // Validate input parameters with comprehensive validation including security checks
        const validation = inputValidationService.validateWorkflowInput('search_officielebekendmakingen', mappedParams);
        if (!validation.valid) {
            const errorDetails = inputValidationService.formatErrorsForResponse(validation.errors);
            const errorMsg = inputValidationService.formatErrorsForLogging(validation.errors);
            await runManager.log(runId, `Parameter validatie mislukt: ${errorMsg}`, 'error');
            logger.warn({ action: 'search_officielebekendmakingen', errors: validation.errors }, 'Workflow action validation failed');
            // Use custom error class per Error Handling Standard
            throw new BadRequestError(`Parameter validation failed: ${errorDetails.message}`, {
                action: 'search_officielebekendmakingen',
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
        
        // Get performance config and apply caps (step6: Official Publications)
        const requestedMaxResults = typeof validatedParams.maxResults === 'number' ? validatedParams.maxResults : undefined;
        const maxResults = getCappedMaxResults(requestedMaxResults, context, 'step6');
        logPerformanceCap('step6', requestedMaxResults, maxResults, runId);

        // Fixture mode for E2E tests
        if (isE2EFixturesEnabled()) {
            logger.info({ action: 'search_officielebekendmakingen', runId }, 'FEATURE_E2E_FIXTURES=true: Returning fixture officielebekendmakingen documents');
            await runManager.log(
                runId,
                'Stap 6: Fixture officiële bekendmakingen documenten gebruiken (FEATURE_E2E_FIXTURES=true)',
                'info'
            );
            
            // Dynamic import to avoid runtime errors when tests directory is not available
            let createDocumentFixtures: () => { officieleBekendmakingen: CanonicalDocument[] };
            try {
                const fixturesModule = await import('../../../../../tests/fixtures/workflow/documentFixtures.js');
                createDocumentFixtures = fixturesModule.createDocumentFixtures;
            } catch (error) {
                logger.error({ error }, 'Failed to load document fixtures, falling back to empty array');
                return { officieleBekendmakingenDocuments: [] };
            }
            
            const fixtures = createDocumentFixtures();
            const fixtureDocuments = fixtures.officieleBekendmakingen.slice(0, maxResults);
            
            // Store in context
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            (context.rawDocumentsBySource as Record<string, unknown>).officielebekendmakingen = fixtureDocuments;
            
            // Return canonical documents directly (output schema expects CanonicalDocument[])
            // Sanitize documents to convert null to undefined for optional fields
            return { officieleBekendmakingenDocuments: fixtureDocuments.map(formatCanonicalDocumentForOutput) };
        }

        // SRU service is a public API, no configuration needed
        // Service is always available (no API keys required)
        const service = new OfficieleBekendmakingenServiceClass();

        await runManager.log(
            runId,
            `Stap 6: Zoeken in officiële bekendmakingen: "${query || 'algemeen'}"${overheidsinstantie ? ` (instantie: ${overheidsinstantie})` : ''}`,
            'info'
        );

        try {
            // Map overheidslaag string to Overheidslaag type if valid
            const overheidslaagValue = overheidslaag && ['Rijk', 'Provincie', 'Gemeente', 'Waterschap'].includes(overheidslaag)
                ? (overheidslaag as 'Rijk' | 'Provincie' | 'Gemeente' | 'Waterschap')
                : undefined;

            const documents = await service.searchPublications({
                query: query || 'algemeen',
                authority: overheidsinstantie || undefined, // Pass overheidsinstantie as authority parameter
                overheidslaag: overheidslaagValue,
                maxResults: typeof validatedParams.maxResults === 'number' ? validatedParams.maxResults : 20
            });

            await runManager.log(
                runId,
                `Stap 6: ${documents.length} documenten gevonden in officiële bekendmakingen`,
                'info'
            );

            // Process discovered URLs through canonical pipeline using GemeenteBeleidAdapter
            const adapter = new GemeenteBeleidAdapter();
            // Get effective queryId and workflowRunId early for enrichmentMetadata
            const effectiveQueryId = queryId || (context.queryId as string | undefined);
            
            const serviceContext: ServiceContext = {
                requestId: runId,
                ...(effectiveQueryId && { queryId: effectiveQueryId }),
                workflowRunId: runId,
            };
            const workflowRunId = runId;

            const canonicalDocuments: CanonicalDocument[] = [];
            const processedDocuments: CanonicalDocument[] = [];

            await runManager.log(
                runId,
                `🔄 Processing ${documents.length} discovered URLs through canonical pipeline`,
                'info'
            );

            // Process each discovered URL through canonical pipeline
            for (const doc of documents) {
                if (!doc.url) {
                    logger.warn({ doc }, 'Document missing URL, skipping');
                    continue;
                }

                try {
                    // Extract issuingAuthority from DiscoveredDocument if available
                    const issuingAuthority = doc.issuingAuthority;
                    
                    // Use adapter to discover (returns [url] for single URL)
                    const records = await adapter.discover(doc.url);
                    
                    if (records.length === 0) {
                        logger.warn({ url: doc.url, runId }, 'No records discovered from URL');
                        // Skip document if no records found (can't convert DiscoveredDocument to CanonicalDocument without processing)
                        continue;
                    }
                    
                    // Process first record through pipeline manually to set enrichmentMetadata
                    const record = records[0];
                    
                    // Execute pipeline up to map() to get draft
                    const artifactBundle = await adapter.acquire(record) as Buffer;
                    const extracted = await adapter.extract(artifactBundle);
                    
                    // Add issuingAuthority and enhanced title to extracted data
                    const extractedWithMetadata = extracted as {
                        metadata?: Record<string, unknown>;
                        issuingAuthority?: string;
                        title?: string;
                        [key: string]: unknown;
                    };
                    if (!extractedWithMetadata.metadata) {
                        extractedWithMetadata.metadata = {};
                    }
                    if (issuingAuthority) {
                        extractedWithMetadata.metadata.issuingAuthority = issuingAuthority;
                        extractedWithMetadata.issuingAuthority = issuingAuthority;
                    }
                    
                    // Override title with enhanced title from DiscoveredDocument if available
                    // This ensures the enhanced title (e.g., "Gemeenteblad van Arnhem 2024, 52490: Subsidieregeling...")
                    // is used instead of the title extracted from HTML
                    if (doc.title && doc.title.includes(':')) {
                        // Only override if the enhanced title format is detected (contains colon separator)
                        const originalExtractedTitle = extractedWithMetadata.title;
                        extractedWithMetadata.title = doc.title;
                        extractedWithMetadata.metadata.title = doc.title;
                        logger.debug(
                            { url: doc.url, enhancedTitle: doc.title, originalExtractedTitle },
                            '[Workflow] Using enhanced title from DiscoveredDocument'
                        );
                    }
                    
                    const draft = adapter.map(extractedWithMetadata);
                    
                    // Set enrichmentMetadata.queryId and workflowRunId before persist
                    if (!draft.enrichmentMetadata) {
                        draft.enrichmentMetadata = {};
                    }
                    if (effectiveQueryId) {
                        draft.enrichmentMetadata.queryId = effectiveQueryId;
                    }
                    draft.enrichmentMetadata.workflowRunId = workflowRunId;
                    draft.enrichmentMetadata.stepId = 'search-officielebekendmakingen';
                    
                    // Continue with extensions, validate, and persist
                    const extensions = adapter.extensions(extracted);
                    adapter.validate(draft);
                    
                    const ctxWithData = {
                        ...serviceContext,
                        artifactBuffer: artifactBundle,
                        extractedData: extracted,
                        // Pass issuingAuthority through context for use in persist()
                        ...(issuingAuthority && { issuingAuthority }),
                    };
                    
                    const persistResult = await adapter.persist(draft, extensions, ctxWithData) as CanonicalDocument;
                    
                    // Get document from persist result
                    const { getCanonicalDocumentService } = await import('../../../services/canonical/CanonicalDocumentService.js');
                    const documentService = getCanonicalDocumentService();

                    // GemeenteBeleidAdapter returns CanonicalDocument directly
                    const documentId = persistResult._id ? persistResult._id.toString() : '';
                    if (!documentId) {
                        throw new ServiceUnavailableError('Document ID not found in persist result', {
                            action: 'search_officielebekendmakingen',
                            runId
                        });
                    }

                    const document = await documentService.findById(documentId) as CanonicalDocument | null;
                    
                    if (!document) {
                        throw new ServiceUnavailableError(`Document not found after persist: ${documentId}`, {
                            action: 'search_officielebekendmakingen',
                            runId,
                            documentId
                        });
                    }
                    
                    // Store canonical document directly (no conversion needed)
                    canonicalDocuments.push(document);
                    processedDocuments.push(document);
                    
                    await runManager.log(
                        runId,
                        `Document verwerkt: ${document.title} (ID: ${document._id})`,
                        'info'
                    );
                } catch (error) {
                    logger.error({ error, url: doc.url, runId }, 'Failed to process URL through canonical pipeline');
                    await runManager.log(
                        runId,
                        `Verwerken van ${doc.url} mislukt: ${error instanceof Error ? error.message : String(error)}`,
                        'error'
                    );
                    // Skip document on error (can't convert DiscoveredDocument to CanonicalDocument without processing)
                }
            }

            await runManager.log(
                runId,
                `Totaal documenten verwerkt via canonical pipeline: ${canonicalDocuments.length}/${canonicalDocuments.length}`,
                'info'
            );

            // Store in workflow context (only metadata to prevent 16MB BSON limit)
            const { storeDocumentsInContext } = await import('./documentContextHelpers.js');
            storeDocumentsInContext(context, 'officieleBekendmakingen', processedDocuments);

            // Documents are already persisted via canonical pipeline (GemeenteBeleidAdapter)
            // Only create Query document if needed (for workflow tracking), but don't persist to brondocumenten
            let finalQueryId: string | null = null;
            
            if (canonicalDocuments.length > 0) {
                if (effectiveQueryId) {
                    // Query already exists, just set in context
                    finalQueryId = effectiveQueryId;
                    context.queryId = finalQueryId;
                    
                    await runManager.log(
                        runId,
                        `Stap 6: ${canonicalDocuments.length} documenten verwerkt via canonical pipeline (Query ID: ${finalQueryId})`,
                        'info'
                    );
                } else if (onderwerp) {
                    // Create Query document for workflow tracking (documents already in canonical store)
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
                        await runManager.log(
                            runId,
                            `Stap 6: ${canonicalDocuments.length} documenten verwerkt via canonical pipeline en Query document aangemaakt (Query ID: ${finalQueryId})`,
                            'info'
                        );
                    } else {
                        await runManager.log(
                            runId,
                            `Stap 6: ${canonicalDocuments.length} documenten verwerkt via canonical pipeline (WAARSCHUWING: Kon Query document niet aanmaken)`,
                            'warn'
                        );
                    }
                } else {
                    await runManager.log(
                        runId,
                        `Stap 6: ${canonicalDocuments.length} documenten verwerkt via canonical pipeline (geen Query document aangemaakt - geen queryId of onderwerp opgegeven)`,
                        'info'
                    );
                }
            }

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

            // Add nodes to navigation graph from CanonicalDocuments (after processing, so we have full metadata)
            let nodesAdded = 0;
            let relationshipsCreated = 0;
            if (navigationGraph && canonicalDocuments.length > 0) {
                try {
                    const workflowId = context.workflowId as string | undefined;
                    
                    for (const canonicalDoc of canonicalDocuments) {
                        try {
                            const url = canonicalDoc.canonicalUrl || canonicalDoc.sourceId || '';
                            if (!url) continue;
                            
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
                                type: 'document' as const,
                                title: extractNavigationNodeTitle(canonicalDoc, url),
                                content: content, // Store content for semantic search
                                children: [],
                                lastVisited: new Date().toISOString(),
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
                                    const result = await relationshipBuilder.linkToRelatedNodes(newNode, {
                                        maxLinks: maxRelationships,
                                        similarityThreshold,
                                        enableSemanticLinking: true,
                                        enableMetadataLinking: true,
                                    });
                                    if (result.relationshipsCreated > 0) {
                                        relationshipsCreated += result.relationshipsCreated;
                                        logger.debug(
                                            { url: url, relationships: result.relationshipsCreated },
                                            `Linked ${url} to ${result.relationshipsCreated} related nodes`
                                        );
                                    }
                                } catch (error) {
                                    const errorMsg = error instanceof Error ? error.message : String(error);
                                    logger.warn({ url: url, error: errorMsg }, 'Failed to link document to related nodes');
                                }
                            }
                        } catch (error) {
                            const errorMsg = error instanceof Error ? error.message : String(error);
                            logger.warn({ documentId: canonicalDoc._id, error: errorMsg }, 'Failed to add document to navigation graph');
                        }
                    }

                    if (nodesAdded > 0) {
                        await navigationGraph.save();
                        const nodeCounts = await navigationGraph.getNodeCount();
                        const logMessage = relationshipsCreated > 0
                            ? `💾 Navigation graph saved: ${nodeCounts.total} total nodes after adding ${nodesAdded} officielebekendmakingen documents, created ${relationshipsCreated} relationships`
                            : `💾 Navigation graph saved: ${nodeCounts.total} total nodes after adding ${nodesAdded} officielebekendmakingen documents`;
                        await runManager.log(runId, logMessage, 'info');
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ error: errorMsg }, 'Failed to save Officielebekendmakingen documents to navigation graph');
                    await runManager.log(runId, `[i18n:workflowLogs.failedToSaveNavigationGraph]|${errorMsg}`, 'warn');
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
                        source: 'officielebekendmakingen',
                        validate: true,
                    });
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ error: errorMsg, runId }, 'Failed to populate knowledge graph from Officielebekendmakingen documents');
                    await runManager.log(runId, `Waarschuwing: Kennisgrafiek kon niet worden gevuld: ${errorMsg}`, 'warn');
                    // Don't fail the workflow if KG population fails
                }
            }

            // Return canonical documents directly (output schema expects CanonicalDocument[])
            // Sanitize documents to convert null to undefined for optional fields
            return { officieleBekendmakingenDocuments: processedDocuments.map(formatCanonicalDocumentForOutput) };
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
                    overheidslaag
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
                `[i18n:workflowLogs.errorSearchingOfficieleBekendmakingen]|${errorMessage}`,
                'error'
            );

            await runManager.log(
                runId,
                `Step 6: Error diagnostic information: ${JSON.stringify(errorDiagnostic, null, 2)}`,
                'error',
                errorDiagnostic
            );

            if (errorStack) {
                await runManager.log(
                    runId,
                    `Step 6: Error stack trace: ${errorStack.substring(0, 1000)}`,
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
                    overheidslaag
                },
                errorDiagnostic
            }, 'Error in search_officielebekendmakingen');

            // For validation errors, re-throw to fail the workflow step (per Error Handling Standard)
            if (isValidationError) {
                throw error;
            }

            // Store error information in context for debugging
            const context = params as Record<string, unknown>;
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            (context.rawDocumentsBySource as Record<string, unknown>).officieleBekendmakingen = [];
            (context.rawDocumentsBySource as Record<string, unknown>).officieleBekendmakingenError = {
                error: errorMessage,
                diagnostic: errorDiagnostic,
                timestamp: new Date().toISOString(),
                guidance: isNetworkError 
                    ? 'Network connectivity issue detected. Check internet connection and Officiele Bekendmakingen service status.'
                    : isTimeoutError
                    ? 'Request timeout. Service may be slow or unavailable. Workflow will continue with other sources.'
                    : isServiceError
                    ? 'Service unavailable. Check service configuration. Workflow will continue with other sources.'
                    : 'Officiele Bekendmakingen search failed. Check logs for details. Workflow will continue with other sources.'
            };

            // Return empty array (don't break workflow) - per Workflow Compensation Strategies
            // This is a read-only operation, so no compensation needed
            return { officieleBekendmakingenDocuments: [] };
        }
    });

    /**
     * Step 7: Search Rechtspraak
     * 
     * Searches the Rechtspraak (Judiciary) database for court decisions and legal precedents.
     * This step discovers jurisprudence related to the search topic using the canonical pipeline.
     * 
     * **API**: Uses Rechtspraak Open Data API via RechtspraakAdapter
     * **Pipeline**: RechtspraakAdapter + AdapterOrchestrator (canonical document parsing)
     * **Storage**: Documents stored in canonical_documents with LegalExtension (ECLI, citations)
     * **Documentation**: docs/40-implementation-plans/final-plan-canonical-document-parsing/08-rechtspraak-adapter.md
     * 
     * @param params - Workflow parameters
     * @param params.onderwerp - Required: Subject/topic for search (string, 1-500 chars)
     * @param params.thema - Optional: Theme/topic refinement (string, max 200 chars)
     * @param params.overheidsinstantie - Optional: Government institution filter (string, max 200 chars)
     *   - Maps to court identifier for filtering (e.g., "Amsterdam" -> "RBAMS")
     * @param params.overheidslaag - Optional: Government level filter (string, max 100 chars)
     * @param params.maxResults - Optional: Maximum number of results (number, 1-1000, default: 20)
     * @param params.dateFrom - Optional: Start date for date range filter (string, YYYY-MM-DD format)
     * @param params.dateTo - Optional: End date for date range filter (string, YYYY-MM-DD format)
     * @param params.queryId - Optional: Existing query ID to link results (MongoDB ObjectId)
     * @param runId - Workflow run ID for logging
     * @returns Object containing discovered Rechtspraak documents
     * @returns {CanonicalDocument[]} rechtspraakDocuments - Array of discovered court decisions (CanonicalDocument format)
     * 
     * @example
     * ```typescript
     * const result = await workflowEngine.execute('search_rechtspraak', {
     *   onderwerp: 'klimaatadaptatie',
     *   overheidsinstantie: 'Amsterdam',
     *   dateFrom: '2024-01-01',
     *   dateTo: '2024-12-31',
     *   maxResults: 50
     * }, runId);
     * // Returns: { rechtspraakDocuments: [...] }
     * ```
     * 
     * @see {@link RechtspraakAdapter} - Canonical adapter for Rechtspraak documents
     * @see {@link AdapterOrchestrator} - Orchestrator for canonical document pipeline
     * @see {@link LegalExtensionService} - Service for legal metadata (ECLI, citations)
     */
    workflowEngine.registerAction('search_rechtspraak', async (params: Record<string, unknown>, runId: string) => {
        // Map legacy parameter names to standardized names
        const mappedParams = mapLegacyParams(params, logger);
        
        // Validate input parameters with comprehensive validation including security checks
        const validation = inputValidationService.validateWorkflowInput('search_rechtspraak', mappedParams);
        if (!validation.valid) {
            const errorDetails = inputValidationService.formatErrorsForResponse(validation.errors);
            const errorMsg = inputValidationService.formatErrorsForLogging(validation.errors);
            await runManager.log(runId, `Parameter validatie mislukt: ${errorMsg}`, 'error');
            logger.warn({ action: 'search_rechtspraak', errors: validation.errors }, 'Workflow action validation failed');
            // Use custom error class per Error Handling Standard
            throw new BadRequestError(`Parameter validation failed: ${errorDetails.message}`, {
                action: 'search_rechtspraak',
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
        const dateFrom = asString(validatedParams.dateFrom);
        const dateTo = asString(validatedParams.dateTo);

        // Fixture mode for E2E tests
        if (isE2EFixturesEnabled()) {
            logger.info({ action: 'search_rechtspraak', runId }, 'FEATURE_E2E_FIXTURES=true: Returning fixture Rechtspraak documents');
            await runManager.log(
                runId,
                '[i18n:workflowLogs.step7UsingFixture]',
                'info'
            );
            
            // Use performance cap for fixtures too (step7: Jurisprudence)
            const fixtureRequestedMaxResults = typeof validatedParams.maxResults === 'number' ? validatedParams.maxResults : undefined;
            const fixtureMaxResults = getCappedMaxResults(fixtureRequestedMaxResults, context, 'step7');
            const { createDocumentFixtures } = await import('../../../../../tests/fixtures/workflow/documentFixtures.js');
            const fixtures = createDocumentFixtures();
            const fixtureDocuments = fixtures.rechtspraak.slice(0, fixtureMaxResults);
            
            // Store in context
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            (context.rawDocumentsBySource as Record<string, unknown>).rechtspraak = fixtureDocuments;
            
            // Sanitize documents to convert null to undefined for optional fields
            return { rechtspraakDocuments: fixtureDocuments.map(formatCanonicalDocumentForOutput) };
        }
        
        // Get performance config and apply caps (step7: Jurisprudence)
        const requestedMaxResults = typeof validatedParams.maxResults === 'number' ? validatedParams.maxResults : undefined;
        // Use higher default for Rechtspraak (100 instead of 20) to get more relevant documents
        const defaultMaxResults = 100;
        const maxResults = getCappedMaxResults(requestedMaxResults || defaultMaxResults, context, 'step7');
        logPerformanceCap('step7', requestedMaxResults || defaultMaxResults, maxResults, runId);
        
        await runManager.log(
            runId,
            `Step 7: Using maxResults=${maxResults} (requested: ${requestedMaxResults || 'default'}, capped: ${maxResults})`,
            'info'
        );

        // Map municipality name to court identifier for geographic filtering
        const { mapMunicipalityToCourt } = await import('../../../utils/municipalityToCourt.js');
        const courtIdentifier = mapMunicipalityToCourt(overheidsinstantie);

        // Build date range if provided
        const dateRange = (dateFrom || dateTo) ? {
            from: dateFrom,
            to: dateTo,
        } : undefined;

        await runManager.log(
            runId,
            `[i18n:workflowLogs.step7Searching]|${query || 'algemeen'}${courtIdentifier ? ` (rechtbank: ${courtIdentifier})` : ''}${dateRange ? ` (datum bereik: ${dateFrom || 'elke'} tot ${dateTo || 'elke'})` : ''}`,
            'info'
        );

        try {
            // Expand query using RechtspraakQueryExpansionService
            const rechtspraakExpansion = new RechtspraakQueryExpansionService();
            let expandedQuery: Awaited<ReturnType<typeof rechtspraakExpansion.expandForRechtspraak>>;
            
            try {
                expandedQuery = await rechtspraakExpansion.expandForRechtspraak({
                    onderwerp,
                    thema,
                    overheidsinstantie,
                    overheidslaag,
                    dateFrom,
                    dateTo,
                }, {
                    strategy: 'auto',
                    enableGeneralExpansion: true,
                });

                if (expandedQuery.expansionSources.length > 0 && expandedQuery.expansionSources[0] !== 'fallback') {
                    await runManager.log(
                        runId,
                        `[i18n:workflowLogs.step7ExpandedQuery]|${onderwerp}|${expandedQuery.queries.length}|${expandedQuery.expandedTerms.length}|${expandedQuery.expansionSources.join(', ')}`,
                        'info'
                    );
                }
            } catch (expansionError) {
                logger.warn({ error: expansionError, onderwerp }, 'Rechtspraak query expansion failed, using original query');
                // Fallback to original query
                expandedQuery = {
                    originalQuery: onderwerp,
                    expandedTerms: [onderwerp],
                    queries: [query || 'algemeen'],
                    strategy: 'single',
                    expansionSources: ['fallback'],
                    metadata: {
                        expansionTime: 0,
                        termCount: 1,
                        queryCount: 1,
                    },
                };
            }

            // Use canonical pipeline: RechtspraakAdapter
            // Get default model ID from registry (e.g., "Xenova/all-MiniLM-L6-v2@v1")
            const { getModelRegistry } = await import('../../../embeddings/modelRegistry.js');
            const modelRegistry = getModelRegistry();
            const defaultModel = modelRegistry.getAll().find(m => m.provider === 'local');
            const defaultModelId = defaultModel?.modelId || 'Xenova/all-MiniLM-L6-v2@v1';
            
            const adapter = new RechtspraakAdapter({ 
                useLiveApi: true,
                defaultModelId, // Use registered local embedding model
            });

            // Execute queries and aggregate ECLI identifiers
            const allEcliRecords: string[] = [];
            const queriesToExecute = expandedQuery.queries;

            await runManager.log(
                runId,
                `[i18n:workflowLogs.step7DiscoveringEcli]|${queriesToExecute.length}`,
                'info'
            );

            // Execute queries in parallel for better performance
            const queryMaxResults = Math.ceil(maxResults / queriesToExecute.length); // Distribute maxResults across queries
            const enableParallelExecution = queriesToExecute.length > 1 && process.env.RECHTSPRAAK_PARALLEL_QUERIES !== 'false';
            const earlyExitThreshold = maxResults * 1.2; // Stop if we have 20% more than needed

            if (enableParallelExecution) {
                // Parallel execution for multiple queries
                const queryPromises = queriesToExecute.map(async (queryToExecute, i) => {
                    try {
                        const discoveryQuery = {
                            query: queryToExecute,
                            court: courtIdentifier,
                            dateRange: dateRange,
                            maxResults: queryMaxResults,
                        };

                        const ecliRecords = await adapter.discover(discoveryQuery);
                        
                        await runManager.log(
                            runId,
                            `[i18n:workflowLogs.step7QueryFound]|${i + 1}|${queriesToExecute.length}|${queryToExecute}|${ecliRecords.length}`,
                            'info'
                        );

                        return { query: queryToExecute, index: i, ecliRecords, success: true };
                    } catch (queryError) {
                        const errorMsg = queryError instanceof Error ? queryError.message : String(queryError);
                        logger.warn({ error: queryError, query: queryToExecute }, 'Failed to execute expanded query, continuing with other queries');
                        await runManager.log(
                            runId,
                            `[i18n:workflowLogs.step7QueryFailed]|${i + 1}|${queriesToExecute.length}|${queryToExecute}|${errorMsg}`,
                            'warn'
                        );
                        return { query: queryToExecute, index: i, ecliRecords: [], success: false };
                    }
                });

                // Wait for all queries to complete
                const queryResults = await Promise.all(queryPromises);
                
                // Aggregate results
                for (const result of queryResults) {
                    if (result.success) {
                        const ecliRecords = Array.isArray(result.ecliRecords) ? result.ecliRecords as string[] : [];
                        allEcliRecords.push(...ecliRecords);
                        
                        // Early exit optimization: if we have enough results, stop processing remaining queries
                        if (allEcliRecords.length >= earlyExitThreshold && process.env.RECHTSPRAAK_EARLY_EXIT !== 'false') {
                            await runManager.log(
                                runId,
                                `[i18n:workflowLogs.step7EarlyExit]|${allEcliRecords.length}|${earlyExitThreshold}`,
                                'info'
                            );
                            // Note: We still wait for all promises, but we could cancel remaining ones in the future
                            break;
                        }
                    }
                }
            } else {
                // Sequential execution (original behavior)
                for (let i = 0; i < queriesToExecute.length; i++) {
                    const queryToExecute = queriesToExecute[i];

                    try {
                        const discoveryQuery = {
                            query: queryToExecute,
                            court: courtIdentifier,
                            dateRange: dateRange,
                            maxResults: queryMaxResults,
                        };

                        const ecliRecords = await adapter.discover(discoveryQuery);
                        const ecliRecordsTyped = Array.isArray(ecliRecords) ? ecliRecords as string[] : [];
                        allEcliRecords.push(...ecliRecordsTyped);

                        if (queriesToExecute.length > 1) {
                            await runManager.log(
                                runId,
                                `[i18n:workflowLogs.step7QueryFound]|${i + 1}|${queriesToExecute.length}|${queryToExecute}|${ecliRecords.length}`,
                                'info'
                            );
                        }

                        // Early exit optimization
                        if (allEcliRecords.length >= earlyExitThreshold && process.env.RECHTSPRAAK_EARLY_EXIT !== 'false') {
                            await runManager.log(
                                runId,
                                `[i18n:workflowLogs.step7EarlyExit]|${allEcliRecords.length}|${earlyExitThreshold}`,
                                'info'
                            );
                            break;
                        }
                    } catch (queryError) {
                        const errorMsg = queryError instanceof Error ? queryError.message : String(queryError);
                        logger.warn({ error: queryError, query: queryToExecute }, 'Failed to execute expanded query, continuing with other queries');
                        await runManager.log(
                            runId,
                            `[i18n:workflowLogs.step7QueryFailed]|${i + 1}|${queriesToExecute.length}|${queryToExecute}|${errorMsg}`,
                            'warn'
                        );
                        // Continue with next query
                    }
                }
            }

            // Deduplicate ECLI identifiers
            const uniqueEcliRecords = Array.from(new Set(allEcliRecords));

            if (uniqueEcliRecords.length === 0) {
                await runManager.log(
                    runId,
                    '[i18n:workflowLogs.step7NoEcliFound]',
                    'info'
                );
                return { rechtspraakDocuments: [] };
            }

            await runManager.log(
                runId,
                `[i18n:workflowLogs.step7FoundUniqueEcli]|${uniqueEcliRecords.length}|${allEcliRecords.length}`,
                'info'
            );

            // Use deduplicated ECLI identifiers for processing
            const ecliRecords = uniqueEcliRecords;

            if (ecliRecords.length === 0) {
                await runManager.log(
                    runId,
                    '[i18n:workflowLogs.step7NoEcliFound]',
                    'info'
                );
                return { rechtspraakDocuments: [] };
            }

            await runManager.log(
                runId,
                `[i18n:workflowLogs.step7FoundEcliProcessing]|${ecliRecords.length}`,
                'info'
            );

            // Get effective queryId from context if available
            const effectiveQueryId = queryId || (context.queryId as string | undefined);
            
            // Process each ECLI through canonical pipeline (acquire → extract → map → extensions → validate → persist)
            const serviceContext: ServiceContext = {
                session: undefined, // No transaction for now
                requestId: runId,
                ...(effectiveQueryId && { queryId: effectiveQueryId }),
                workflowRunId: runId,
                stepId: 'search-rechtspraak',
            };

            const canonicalDocuments: Array<{ document: unknown; legalExtension?: { legalIds?: string[]; citations?: string[] } }> = [];
            const legalExtensionService = new LegalExtensionService();

            const recordsToProcess = ecliRecords.slice(0, maxResults);
            await runManager.log(
                runId,
                `Step 7: Processing ${recordsToProcess.length} of ${ecliRecords.length} ECLI records (maxResults: ${maxResults})`,
                'info'
            );
            
            let processedCount = 0;
            let successCount = 0;
            let failureCount = 0;
            
            const rawLimit = parseInt(process.env.RECHTSPRAAK_CONCURRENCY || '', 10);
            const concurrencyLimit = (isNaN(rawLimit) || rawLimit <= 0) ? 5 : rawLimit;

            await limitConcurrency(recordsToProcess, concurrencyLimit, async (ecliRecord) => {
                let success = false;
                try {
                    // Execute canonical pipeline: acquire → extract → map → extensions → validate → persist
                    const artifactBundle = await adapter.acquire(ecliRecord) as Buffer;
                    const extracted = await adapter.extract(artifactBundle);

                    // Ensure the original ECLI record is available in extracted data as fallback
                    // This ensures sourceId is always set correctly even if ECLI extraction fails
                    if (extracted && typeof extracted === 'object') {
                        (extracted as { sourceId?: string; ecli?: string }).sourceId = ecliRecord;
                        // Also ensure ECLI is set if not already present
                        if (!(extracted as { ecli?: string }).ecli && ecliRecord.startsWith('ECLI:')) {
                            (extracted as { ecli?: string }).ecli = ecliRecord;
                        }
                    }

                    // For Rechtspraak, the ECLI is already in the extracted data, so we can map directly
                    const draft = adapter.map(extracted);

                    // Set enrichmentMetadata properties before persist
                    if (!draft.enrichmentMetadata) {
                        draft.enrichmentMetadata = {};
                    }
                    if (effectiveQueryId) {
                        draft.enrichmentMetadata.queryId = effectiveQueryId;
                    } else {
                        await runManager.log(
                            runId,
                            `Step 7: ⚠️  WARNING - No queryId available for ECLI ${ecliRecord}! Document will not be linked to query.`,
                            'warn'
                        );
                    }
                    draft.enrichmentMetadata.workflowRunId = runId;
                    draft.enrichmentMetadata.stepId = 'search-rechtspraak';

                    const extensions = adapter.extensions(extracted);
                    adapter.validate(draft);

                    // Create context with artifact buffer and extracted data for persist
                    const ctxWithData = {
                        ...serviceContext,
                        artifactBuffer: artifactBundle,
                        extractedData: extracted,
                    };

                    const persistResult = await adapter.persist(draft, extensions, ctxWithData) as CanonicalDocument;
                    
                    // Get the document from the service
                    const { getCanonicalDocumentService } = await import('../../../services/canonical/CanonicalDocumentService.js');
                    const documentService = getCanonicalDocumentService();

                    // RechtspraakAdapter returns CanonicalDocument directly
                    const documentId = persistResult._id ? persistResult._id.toString() : '';
                    if (!documentId) {
                        throw new ServiceUnavailableError('Document ID not found in persist result', {
                            action: 'search_rechtspraak',
                            runId
                        });
                    }

                    const document = await documentService.findById(documentId) as CanonicalDocument | null;

                    if (!document) {
                        throw new ServiceUnavailableError(`Document not found after persist: ${documentId}`, {
                            action: 'search_rechtspraak',
                            runId,
                            documentId
                        });
                    }

                    // Diagnostic logging: verify queryId is set correctly
                    const hasQueryId = !!document.enrichmentMetadata?.queryId;
                    const docSourceId = document.sourceId;
                    const docSource = document.source;
                    const docPublisherAuthority = document.publisherAuthority;
                    
                    if (!hasQueryId) {
                        await runManager.log(
                            runId,
                            `Step 7: ⚠️  WARNING - Document ${documentId} (sourceId: ${docSourceId}) has no queryId in enrichmentMetadata!`,
                            'warn'
                        );
                        logger.warn(
                            {
                                documentId,
                                sourceId: docSourceId,
                                source: docSource,
                                workflowRunId: runId,
                                ecliRecord,
                            },
                            'Document persisted without queryId - will not appear in query results'
                        );
                    } else {
                        logger.debug(
                            {
                                documentId,
                                sourceId: docSourceId,
                                source: docSource,
                                queryId: document.enrichmentMetadata?.queryId,
                                publisherAuthority: docPublisherAuthority,
                            },
                            'Successfully persisted Rechtspraak document with queryId'
                        );
                    }

                    // Fetch legal extension if available
                    let legalExtension: { legalIds?: string[]; citations?: string[] } | undefined;
                    try {
                        const ext = await legalExtensionService.get(document._id);
                        if (ext) {
                            legalExtension = {
                                legalIds: ext.legalIds,
                                citations: ext.citations,
                            };
                        }
                    } catch (error) {
                        // Legal extension may not exist yet, continue
                        logger.debug({ documentId: document._id }, 'No legal extension found for document');
                    }

                    canonicalDocuments.push({
                        document,
                        legalExtension,
                    });
                    success = true;
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ ecli: ecliRecord, error: errorMsg }, 'Failed to process ECLI through canonical pipeline, skipping');
                    try {
                        await runManager.log(
                            runId,
                            `[i18n:workflowLogs.step7FailedToProcessEcli]|${ecliRecord}|${errorMsg}`,
                            'warn'
                        );
                    } catch (logError) {
                        // Ignore logging errors to prevent workflow failure
                        logger.warn({ error: logError, runId }, 'Failed to log error in search_rechtspraak');
                    }
                    // Continue with next ECLI
                } finally {
                    if (success) {
                        successCount++;
                    } else {
                        failureCount++;
                    }
                    processedCount++;
                    // Log progress every 10 documents
                    if (processedCount % 10 === 0 || processedCount === recordsToProcess.length) {
                        try {
                            await runManager.log(
                                runId,
                                `Step 7: Processed ${processedCount}/${recordsToProcess.length} ECLI records (${successCount} successful, ${failureCount} failed)`,
                                'info'
                            );
                        } catch (logError) {
                            // Ignore logging errors to prevent workflow failure
                            logger.warn({ error: logError, runId }, 'Failed to log progress in search_rechtspraak');
                        }
                    }
                }
            });
            
            await runManager.log(
                runId,
                `Step 7: Processing complete - ${successCount} successful, ${failureCount} failed out of ${processedCount} processed`,
                'info'
            );

            // Use canonical documents directly - output schema expects CanonicalDocument[]
            // Legal extension data is already in enrichmentMetadata if adapter populated it
            const documents: CanonicalDocument[] = canonicalDocuments.map(({ document }) => document as CanonicalDocument);

            await runManager.log(
                runId,
                `[i18n:workflowLogs.step7ProcessedJurisprudence]|${documents.length}|${courtIdentifier ? ` (gefilterd op rechtbank: ${courtIdentifier})` : ''}|${dateRange ? ' (gefilterd op datum bereik)' : ''}`,
                'info'
            );

            // Store in workflow context (only metadata to prevent 16MB BSON limit)
            const { storeDocumentsInContext } = await import('./documentContextHelpers.js');
            storeDocumentsInContext(context, 'rechtspraak', documents);

            // Documents are already persisted via canonical pipeline (RechtspraakAdapter + AdapterOrchestrator)
            // Only create Query document if needed (for workflow tracking), but don't persist to brondocumenten
            let finalQueryId: string | null = null;
            // effectiveQueryId already declared above at line 196 or 627, reuse it
            
            if (canonicalDocuments.length > 0) {
                if (effectiveQueryId) {
                    // Query already exists, just set in context
                    finalQueryId = effectiveQueryId;
                    context.queryId = finalQueryId;
                    
                    await runManager.log(
                        runId,
                        `[i18n:workflowLogs.stepProcessedDocuments]|7|${canonicalDocuments.length}|${finalQueryId}`,
                        'info'
                    );
                } else if (onderwerp) {
                    // Create Query document for workflow tracking (documents already in canonical store)
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
                        await runManager.log(
                            runId,
                            `[i18n:workflowLogs.stepProcessedDocumentsWithQuery]|7|${canonicalDocuments.length}|${finalQueryId}`,
                            'info'
                        );
                    } else {
                        await runManager.log(
                            runId,
                            `[i18n:workflowLogs.stepProcessedDocumentsWarning]|7|${canonicalDocuments.length}`,
                            'warn'
                        );
                    }
                } else {
                    await runManager.log(
                        runId,
                        `[i18n:workflowLogs.stepProcessedDocumentsNoQuery]|7|${canonicalDocuments.length}`,
                        'info'
                    );
                }
            }

            // Note: Rechtspraak documents are NOT added to Navigation Graph (API-discovered, not web-scraped)
            // They are only added to Knowledge Graph as lexical/legal entities with provenance

            // Populate knowledge graph from CanonicalDocument[] using WorkflowDocumentToKGService
            if (canonicalDocuments.length > 0) {
                try {
                    // Extract CanonicalDocument[] from the documents array
                    const documents: CanonicalDocument[] = canonicalDocuments.map(({ document }) => document as CanonicalDocument);

                    // Use helper function for standardized KG integration
                    const { populateKnowledgeGraphFromDocuments } = await import('./helpers/knowledgeGraphIntegration.js');
                    await populateKnowledgeGraphFromDocuments(documents, runManager, {
                        workflowRunId: runId,
                        workflowId: context.workflowId as string | undefined,
                        source: 'rechtspraak',
                        validate: true,
                    });
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ error: errorMsg, runId }, 'Failed to populate knowledge graph from Rechtspraak documents');
                    await runManager.log(runId, `Waarschuwing: Kennisgrafiek kon niet worden gevuld: ${errorMsg}`, 'warn');
                    // Don't fail the workflow if KG population fails
                }
            }

            // Return documents
            // Sanitize documents to convert null to undefined for optional fields
            return { 
                rechtspraakDocuments: documents.map(formatCanonicalDocumentForOutput)
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
                    overheidslaag
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
                `[i18n:workflowLogs.errorSearchingRechtspraak]|${errorMessage}`,
                'error'
            );

            await runManager.log(
                runId,
                `[i18n:workflowLogs.step7ErrorDiagnostic]|${JSON.stringify(errorDiagnostic, null, 2)}`,
                'error',
                errorDiagnostic
            );

            if (errorStack) {
                await runManager.log(
                    runId,
                    `[i18n:workflowLogs.step7ErrorStackTrace]|${errorStack.substring(0, 1000)}`,
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
                    overheidslaag
                },
                errorDiagnostic
            }, 'Error in search_rechtspraak');

            // For validation errors, re-throw to fail the workflow step (per Error Handling Standard)
            if (isValidationError) {
                throw error;
            }

            // Store error information in context for debugging
            const context = params as Record<string, unknown>;
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            (context.rawDocumentsBySource as Record<string, unknown>).rechtspraak = [];
            (context.rawDocumentsBySource as Record<string, unknown>).rechtspraakError = {
                error: errorMessage,
                diagnostic: errorDiagnostic,
                timestamp: new Date().toISOString(),
                guidance: isNetworkError 
                    ? 'Network connectivity issue detected. Check internet connection and Rechtspraak service status.'
                    : isTimeoutError
                    ? 'Request timeout. Service may be slow or unavailable. Workflow will continue with other sources.'
                    : isServiceError
                    ? 'Service unavailable. Check service configuration. Workflow will continue with other sources.'
                    : 'Rechtspraak search failed. Check logs for details. Workflow will continue with other sources.'
            };

            // Return empty array (don't break workflow) - per Workflow Compensation Strategies
            // This is a read-only operation, so no compensation needed
            return { rechtspraakDocuments: [] };
        }
    });
}

