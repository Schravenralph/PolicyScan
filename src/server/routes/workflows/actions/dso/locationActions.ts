/**
 * DSO Location Search Actions
 * 
 * Contains action for location-based DSO document search:
 * - search_dso_location - Search for omgevingsdocumenten at a specific geographic location
 * 
 * Migrated to use canonical pipeline (DsoAdapter + AdapterOrchestrator).
 */

import { WorkflowEngine } from '../../../../services/workflow/WorkflowEngine.js';
import { RunManager } from '../../../../services/workflow/RunManager.js';
import { InputValidationService } from '../../../../services/workflow/InputValidationService.js';
import { asString } from '../../../workflowUtils.js';
import { logger } from '../../../../utils/logger.js';
import { BadRequestError, ServiceUnavailableError, ExternalServiceError, AppError } from '../../../../types/errors.js';
import type { RDCoordinates } from '../../../../services/external/PDOKGeocodingService.js';
import { PDOKGeocodingService } from '../../../../services/external/PDOKGeocodingService.js';
import { DsoAdapter } from '../../../../adapters/dso/DsoAdapter.js';
import type { ServiceContext } from '../../../../contracts/types.js';
import type { CanonicalDocument } from '../../../../contracts/types.js';
import type { Geometry } from 'geojson';
import type { DsoDiscoveryResult } from '../../../../adapters/dso/DsoLiveClient.js';
import { buildDsoPublicUrlFromDocument } from '../../../../utils/dsoUrlBuilder.js';

/**
 * Register DSO location search action
 * 
 * @param workflowEngine - Workflow engine instance
 * @param runManager - Run manager instance
 * @param navigationGraph - Optional navigation graph instance for graph persistence
 * @param options - Optional service dependencies for dependency injection (for testing)
 */
export function registerDSOLocationAction(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    navigationGraph?: import('../../../../services/graphs/navigation/NavigationGraph.js').NavigationGraph | null,
    options?: {
        inputValidationService?: typeof InputValidationService | {
            validateWorkflowInput: typeof InputValidationService.validateWorkflowInput;
            formatErrorsForResponse: typeof InputValidationService.formatErrorsForResponse;
            formatErrorsForLogging: typeof InputValidationService.formatErrorsForLogging;
        };
    }
): void {
    // Use injected services or fall back to default implementations
    const inputValidationService = options?.inputValidationService || InputValidationService;

    /**
     * Location-Based DSO Document Search
     * 
     * Searches for omgevingsdocumenten at a specific geographic location using
     * the DSO /documenten/_zoek endpoint. This is the workflow used by "Regels Op de Kaart".
     * 
     * @param params - Workflow parameters
     * @param params.address - Optional: Address to search (will be geocoded). Default: "Europalaan 6D, 's-Hertogenbosch"
     * @param params.coordinates - Optional: Pre-computed RD coordinates { x, y }
     * @param params.bestuurslaag - Optional: Government level filter ('GEMEENTE', 'PROVINCIE', 'WATERSCHAP', 'RIJK')
     * @param params.geldigOp - Optional: Validity date filter (YYYY-MM-DD format)
     * @param params.inclusiefToekomstigGeldig - Optional: Include future valid documents (default: false)
     * @param params.maxResults - Optional: Maximum results (default: 100, max: 200)
     * @param params.mode - Optional: API mode ('preprod' | 'prod'), defaults to 'preprod'
     * @param runId - Workflow run ID for logging
     * @returns Object containing discovered documents
     * @returns {CanonicalDocument[]} dsoLocationDocuments - Array of discovered DSO documents
     * @returns {number} totalFound - Total number of documents found
     * @returns {object} searchLocation - Location used for search
     * 
     * @example
     * ```typescript
     * const result = await workflowEngine.execute('search_dso_location', {
     *   // Uses default location (Europalaan 6D, 's-Hertogenbosch)
     * }, runId);
     * // Returns: { dsoLocationDocuments: [...], totalFound: 10, searchLocation: {...} }
     * ```
     * 
     * @see {@link DSOLocationSearchService} - Service handling location-based DSO API interactions
     * @see {@link docs/11-workflows/dso-location-workflow.md} - Workflow documentation
     */
    workflowEngine.registerAction('search_dso_location', async (params: Record<string, unknown>, runId: string) => {
        // Apply defaults BEFORE validation to ensure validation passes
        const paramsWithDefaults = {
            ...params,
            // Apply default address if neither address nor coordinates are provided
            address: asString(params.address) || (!params.coordinates ? "Europalaan 6D, 's-Hertogenbosch" : undefined),
        };

        // Validate input parameters
        const validation = inputValidationService.validateWorkflowInput('search_dso_location', paramsWithDefaults);
        if (!validation.valid) {
            const errorDetails = inputValidationService.formatErrorsForResponse(validation.errors);
            const errorMsg = inputValidationService.formatErrorsForLogging(validation.errors);
            await runManager.log(runId, `Parameter validatie mislukt: ${errorMsg}`, 'error');
            logger.warn({ action: 'search_dso_location', errors: validation.errors }, 'Workflow action validation failed');
            // Use custom error class per Error Handling Standard
            throw new BadRequestError(`Parameter validation failed: ${errorDetails.message}`, {
                action: 'search_dso_location',
                validationErrors: validation.errors
            });
        }

        const validatedParams = (validation.sanitizedParams || paramsWithDefaults) as Record<string, unknown>;

        // Extract parameters with defaults
        const address = asString(validatedParams.address) || "Europalaan 6D, 's-Hertogenbosch";
        const coordinates = validatedParams.coordinates as RDCoordinates | undefined;
        const bestuurslaag = asString(validatedParams.bestuurslaag) as 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK' | undefined;
        const geldigOp = asString(validatedParams.geldigOp);
        const inclusiefToekomstigGeldig = validatedParams.inclusiefToekomstigGeldig === true;
        const maxResults = typeof validatedParams.maxResults === 'number' ? validatedParams.maxResults : 100;
        const mode = asString(validatedParams.mode) || 'preprod';

        await runManager.log(
            runId,
            `DSO Locatie Zoeken: Zoeken naar omgevingsdocumenten op ${coordinates ? `coördinaten (${coordinates.x}, ${coordinates.y})` : address} (gebruik canonical pipeline)`,
            'info'
        );

        // Validate DSO API configuration
        const { getDeploymentConfig } = await import('../../../../config/deployment.js');
        let dsoConfigured: boolean;
        let errorMessage: string;
        try {
            const config = getDeploymentConfig();
            dsoConfigured = !!config.dso.apiKey;
            errorMessage = `DSO API is not configured. Please set DSO_API_KEY (or legacy DSO_${mode === 'prod' ? 'PROD' : 'PREPROD'}_KEY) environment variable to use DSO location search (mode: ${mode}).`;
        } catch {
            const envVarName = mode === 'prod' ? 'DSO_PROD_KEY' : 'DSO_PREPROD_KEY';
            dsoConfigured = !!process.env[envVarName] || !!process.env.DSO_API_KEY;
            errorMessage = `DSO API is not configured. Please set ${envVarName} environment variable to use DSO location search (mode: ${mode}).`;
        }

        if (!dsoConfigured) {
            await runManager.log(runId, `DSO Locatie Zoeken: FOUT - ${errorMessage}`, 'error');
            logger.error({ mode }, 'DSO API not configured for location search');
            throw new ServiceUnavailableError(errorMessage, {
                action: 'search_dso_location',
                runId,
                mode,
                reason: 'dso_api_not_configured'
            });
        }

        try {
            // Geocode address to coordinates if needed
            let finalCoordinates: RDCoordinates;
            let finalAddress: string = address;
            const geocodingService = new PDOKGeocodingService();

            if (coordinates) {
                finalCoordinates = coordinates;
            } else {
                try {
                    const geocodeResult = await geocodingService.geocode(address);
                    finalCoordinates = geocodeResult.coordinates;
                    finalAddress = geocodeResult.displayName;
                } catch (geocodeError) {
                    // If geocoding fails, fall back to municipality geometry for 's-Hertogenbosch
                    const errorMsg = geocodeError instanceof Error ? geocodeError.message : String(geocodeError);
                    logger.warn({ 
                        address, 
                        error: errorMsg 
                    }, 'Geocoding failed, falling back to municipality geometry for \'s-Hertogenbosch');
                    
                    await runManager.log(
                        runId,
                        `DSO Location Search: Geocoding failed for "${address}", falling back to municipality geometry for 's-Hertogenbosch`,
                        'warn'
                    );

                    // Try to get municipality geometry for 's-Hertogenbosch (gm796)
                    const { BevoegdGezagGeometryService } = await import('../../../../services/external/BevoegdGezagGeometryService.js');
                    const { getGeometryCentroid } = await import('../../../../utils/geometryArea.js');
                    
                    try {
                        const geometryService = new BevoegdGezagGeometryService();
                        const geometryResult = await geometryService.getBevoegdGezagGeometry('gm796', {
                            bestuurslaag: 'GEMEENTE',
                            naam: "'s-Hertogenbosch",
                        });

                        const centroid = getGeometryCentroid(geometryResult.geometry);
                        if (centroid && centroid.coordinates.length >= 2) {
                            finalCoordinates = {
                                x: centroid.coordinates[0],
                                y: centroid.coordinates[1],
                            };
                            finalAddress = "'s-Hertogenbosch (municipality centroid)";
                            
                            await runManager.log(
                                runId,
                                `DSO Location Search: Using municipality centroid for 's-Hertogenbosch: (${finalCoordinates.x}, ${finalCoordinates.y})`,
                                'info'
                            );
                        } else {
                            throw new Error('Could not extract centroid from municipality geometry');
                        }
                    } catch (municipalityError) {
                        const municipalityErrorMsg = municipalityError instanceof Error ? municipalityError.message : String(municipalityError);
                        logger.error({ 
                            address, 
                            geocodeError: errorMsg,
                            municipalityError: municipalityErrorMsg 
                        }, 'Both geocoding and municipality geometry fallback failed');
                        
                        await runManager.log(
                            runId,
                            `DSO Location Search: Municipality geometry fallback also failed: ${municipalityErrorMsg}`,
                            'error'
                        );
                        
                        throw new BadRequestError(
                            `Failed to geocode address "${address}" and municipality geometry fallback also failed: ${municipalityErrorMsg}`,
                            {
                                action: 'search_dso_location',
                                address,
                                geocodeError: errorMsg,
                                municipalityError: municipalityErrorMsg,
                                reason: 'geocoding_and_fallback_failed'
                            }
                        );
                    }
                }
            }

            // Use RD coordinates directly (DSO API expects RD for geometry)
            // Note: DsoAdapter -> DsoLiveClient passes these coordinates directly to the API
            const pointGeometry: Geometry = {
                type: 'Point',
                coordinates: [finalCoordinates.x, finalCoordinates.y],
            };

            await runManager.log(
                runId,
                `DSO Location Search: Geocoded to coordinates (${finalCoordinates.x}, ${finalCoordinates.y}) (RD)`,
                'debug'
            );

            // Find municipality from database using coordinates or address
            const { GemeenteModel } = await import('../../../../models/Gemeente.js');
            let municipalityCode: string | undefined;
            
            try {
                // Try to find municipality by coordinates first (more accurate)
                let gemeente = await GemeenteModel.findByCoordinates(finalCoordinates);
                
                // If not found by coordinates, try by address
                if (!gemeente && finalAddress) {
                    gemeente = await GemeenteModel.findByAddress(finalAddress);
                }
                
                if (gemeente && gemeente.municipalityCode) {
                    municipalityCode = gemeente.municipalityCode;
                    await runManager.log(
                        runId,
                        `DSO Location Search: Found municipality ${gemeente.naam} with code ${municipalityCode}`,
                        'info'
                    );
                } else {
                    await runManager.log(
                        runId,
                        `DSO Location Search: Municipality not found in database for location, will return all documents`,
                        'warn'
                    );
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.warn({ error: errorMsg, coordinates: finalCoordinates, address: finalAddress }, 'Failed to lookup municipality from database');
                await runManager.log(
                    runId,
                    `DSO Location Search: Failed to lookup municipality: ${errorMsg}`,
                    'warn'
                );
            }

            // Initialize DSO adapter for canonical pipeline
            const adapter = new DsoAdapter({
                useLiveApi: true,
                useProduction: mode === 'prod',
            });

            // Get effective queryId from context if available
            const context = params as Record<string, unknown>;
            const effectiveQueryId = (context.queryId as string | undefined);
            
            // Create service context for canonical pipeline
            const serviceContext: ServiceContext = {
                session: undefined, // No transaction for now
                requestId: runId,
                userId: (params as Record<string, unknown>).userId as string | undefined,
                ...(effectiveQueryId && { queryId: effectiveQueryId }),
                workflowRunId: runId,
            };

            // Discover documents by geometry using canonical pipeline
            // Note: DsoAdapter.discoverByGeometry only takes geometry and bufferRadiusMeters
            // Municipality filtering would need to be done client-side after discovery
            const discoveredRecords = await adapter.discoverByGeometry(pointGeometry) as DsoDiscoveryResult[];
            
            await runManager.log(
                runId,
                `DSO Locatie Zoeken: ${discoveredRecords.length} records ontdekt via canonical pipeline`,
                discoveredRecords.length === 0 ? 'warn' : 'info'
            );

            if (discoveredRecords.length === 0) {
                const context = params as Record<string, unknown>;
                if (!context.rawDocumentsBySource) {
                    context.rawDocumentsBySource = {};
                }
                (context.rawDocumentsBySource as Record<string, unknown>).dsoLocation = [];
                
                return {
                    dsoLocationDocuments: [],
                    totalFound: 0,
                    searchLocation: {
                        address: finalAddress,
                        coordinates: finalCoordinates,
                    },
                };
            }

            // Limit results
            const recordsToProcess = discoveredRecords.slice(0, maxResults);
            
            if (discoveredRecords.length > maxResults) {
                await runManager.log(
                    runId,
                    `DSO Locatie Zoeken: Resultaten beperkt van ${discoveredRecords.length} naar ${maxResults} documenten`,
                    'info'
                );
            }

            // Process documents through full canonical pipeline (acquire → extract → map → extensions → validate → persist)
            await runManager.log(
                runId,
                `DSO Locatie Zoeken: Verwerken van ${recordsToProcess.length} documenten via canonical pipeline`,
                'info'
            );

            // Use effective queryId and workflowRunId for enrichmentMetadata (already declared above)
            const workflowRunId = runId;

            const successfulResults: Array<{ document: any }> = [];
            let failedCount = 0;
            let totalChunksCreated = 0;
            let totalGeometriesIndexed = 0;
            const errors: Array<{ documentId: string; error: string }> = [];

            // Process each discovered record through the canonical pipeline
            for (const discoveryRecord of recordsToProcess) {
                try {
                    // Execute canonical pipeline: acquire → extract → map → extensions → validate → persist
                    const artifactBundle = await adapter.acquire(discoveryRecord) as Buffer;
                    const extracted = await adapter.extract(artifactBundle);

                    // Add discovery result to extracted data for mapping
                    const extractedWithDiscovery = {
                        ...extracted as object,
                        discoveryResult: discoveryRecord,
                    };

                    const draft = adapter.map(extractedWithDiscovery);
                    
                    // Set enrichmentMetadata.queryId and workflowRunId before persist
                    if (!draft.enrichmentMetadata) {
                        draft.enrichmentMetadata = {};
                    }
                    if (effectiveQueryId) {
                        draft.enrichmentMetadata.queryId = effectiveQueryId;
                    }
                    draft.enrichmentMetadata.workflowRunId = workflowRunId;
                    
                    const extensions = adapter.extensions(extractedWithDiscovery);
                    adapter.validate(draft);

                    // Create context with artifact buffer and extracted data for persist
                    const ctxWithData = {
                        ...serviceContext,
                        artifactBuffer: artifactBundle,
                        extractedData: extracted,
                    };

                    // Persist returns DsoAdapterResult with documentId
                    const persistResult = await adapter.persist(draft, extensions, ctxWithData) as { documentId: string; chunkCount: number; hasGeometry: boolean };
                    
                    totalChunksCreated += persistResult.chunkCount || 0;
                    if (persistResult.hasGeometry) {
                        totalGeometriesIndexed++;
                    }

                    // Get the document from the service using the documentId from persist result
                    const { getCanonicalDocumentService } = await import('../../../../services/canonical/CanonicalDocumentService.js');
                    const documentService = getCanonicalDocumentService();
                    const document = await documentService.findById(persistResult.documentId);
                    
                    if (document) {
                        successfulResults.push({ document });
                    } else {
                        // Log warning if document not found after persist
                        logger.warn(
                            { documentId: persistResult.documentId, identificatie: (discoveryRecord as { identificatie: string }).identificatie },
                            'Document not found after persist'
                        );
                    }
                } catch (error) {
                    failedCount++;
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    const documentId = (discoveryRecord as { identificatie?: string }).identificatie || 'unknown';

                    errors.push({
                        documentId,
                        error: errorMsg
                    });

                    logger.error(
                        { error, identificatie: documentId, runId },
                        'Failed to process DSO document through canonical pipeline'
                    );
                    await runManager.log(
                        runId,
                        `DSO Locatie Zoeken: Verwerken van document ${documentId} mislukt: ${errorMsg}`,
                        'warn'
                    );
                }
            }

            if (failedCount > 0) {
                await runManager.log(
                    runId,
                    `DSO Locatie Zoeken: WAARSCHUWING - ${failedCount} van ${recordsToProcess.length} documenten mislukt verwerking`,
                    'warn'
                );
            }

            await runManager.log(
                runId,
                `DSO Locatie Zoeken: Succesvol ${successfulResults.length} documenten verwerkt via canonical pipeline (opgeslagen in canonical_documents collectie)`,
                'info'
            );

            // Note: DSO location documents are NOT added to Navigation Graph (API-discovered, not web-scraped)
            // They are only added to Knowledge Graph as lexical/legal entities with provenance

            // Populate knowledge graph
            if (successfulResults.length > 0 && navigationGraph) {
                try {
                    const { FeatureFlag } = await import('../../../../models/FeatureFlag.js');
                    // Note: KG workflow integration is always enabled
                    await runManager.log(runId, `Kennisgrafiek vullen vanuit ${successfulResults.length} DSO locatie documenten...`, 'info');

                    // Convert canonical documents to ScrapedDocument format for KG population
                    const scrapedDocuments = successfulResults.map(result => {
                        const doc = result.document;
                        // Build URL from document using URL builder (falls back to canonicalUrl if already correct)
                        const url = buildDsoPublicUrlFromDocument(doc) || doc.canonicalUrl || '';
                        return {
                            url,
                            titel: doc.title,
                            markdown: doc.fullText || '',
                            samenvatting: doc.fullText?.substring(0, 500) || doc.title,
                            website_url: url,
                            website_titel: doc.publisherAuthority || 'DSO',
                            type_document: doc.documentType || 'omgevingsdocument',
                            publicatiedatum: doc.dates?.publishedAt?.toISOString(),
                            metadata: doc.sourceMetadata || {},
                        } as import('../../../../services/infrastructure/types.js').ScrapedDocument;
                    });

                    // Get GraphManager and populate KG
                    const { GraphManager } = await import('../../../../services/scraping/GraphManager.js');
                    const { RelationshipExtractionService } = await import('../../../../services/extraction/RelationshipExtractionService.js');

                    // Initialize relationship extraction service if enabled
                    // Note: EntityExtractionService is no longer needed - GraphManager uses PolicyParser internally
                    const relationshipExtractionService = FeatureFlag.isRelationshipExtractionEnabled()
                        ? new RelationshipExtractionService()
                        : undefined;

                    const graphManager = new GraphManager(
                        navigationGraph,
                        relationshipExtractionService
                    );

                    const context = params as Record<string, unknown>;
                    await graphManager.populateKnowledgeGraph(scrapedDocuments, {
                        workflowRunId: runId,
                        workflowId: context.workflowId as string | undefined,
                        source: 'dso-location'
                    });
                    await runManager.log(runId, `Kennisgrafiek gevuld met entiteiten uit ${successfulResults.length} DSO locatie documenten`, 'info');
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ error: errorMsg, runId }, 'Failed to populate knowledge graph from DSO location documents');
                    await runManager.log(runId, `Waarschuwing: Kennisgrafiek kon niet worden gevuld: ${errorMsg}`, 'warn');
                    // Don't fail the workflow if KG population fails
                }
            }

            // Use canonical documents directly (no conversion needed)
            // Get canonical documents from successful results
            const documents: CanonicalDocument[] = successfulResults
                .map(result => result.document)
                .filter((doc): doc is CanonicalDocument => doc !== null && doc !== undefined);

            // Log document types found
            const documentTypes = documents.reduce((acc, doc) => {
                const type = doc.documentType || 'unknown';
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            await runManager.log(
                runId,
                `DSO Location Search: Document types found: ${JSON.stringify(documentTypes)}`,
                'debug'
            );

            // Check for expected documents (omgevingsvisie, omgevingsplan)
            const hasOmgevingsvisie = documents.some(doc => 
                doc.documentType?.toLowerCase().includes('omgevingsvisie')
            );
            const hasOmgevingsplan = documents.some(doc => 
                doc.documentType?.toLowerCase().includes('omgevingsplan')
            );

            if (hasOmgevingsvisie && hasOmgevingsplan) {
                await runManager.log(
                    runId,
                    'DSO Locatie Zoeken: SUCCES - Beide Omgevingsvisie en Omgevingsplan gevonden',
                    'info'
                );
            } else {
                const missing = [];
                if (!hasOmgevingsvisie) missing.push('Omgevingsvisie');
                if (!hasOmgevingsplan) missing.push('Omgevingsplan');
                await runManager.log(
                    runId,
                    `DSO Locatie Zoeken: WAARSCHUWING - Ontbrekende verwachte documenten: ${missing.join(', ')}`,
                    'warn'
                );
            }

            // Store in context for potential downstream actions (context already declared above)
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            // Populate knowledge graph from CanonicalDocument[] using WorkflowDocumentToKGService
            if (documents.length > 0) {
                try {
                    // Use helper function for standardized KG integration
                    const { populateKnowledgeGraphFromDocuments } = await import('../helpers/knowledgeGraphIntegration.js');
                    await populateKnowledgeGraphFromDocuments(documents, runManager, {
                        workflowRunId: runId,
                        workflowId: context.workflowId as string | undefined,
                        source: 'dso-location',
                        validate: true,
                    });
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ error: errorMsg, runId }, 'Failed to populate knowledge graph from DSO location documents');
                    await runManager.log(runId, `Waarschuwing: Kennisgrafiek kon niet worden gevuld: ${errorMsg}`, 'warn');
                    // Don't fail the workflow if KG population fails
                }
            }

            // Store in context (only metadata to prevent 16MB BSON limit)
            const { storeDocumentsInContext } = await import('../documentContextHelpers.js');
            storeDocumentsInContext(context, 'dsoLocation', documents);

            return {
                dsoLocationDocuments: documents,
                totalFound: discoveredRecords.length, // Total discovered (before limiting)
                searchLocation: {
                    address: finalAddress,
                    coordinates: finalCoordinates,
                },
                stats: {
                    documentsIngested: successfulResults.length,
                    chunksCreated: totalChunksCreated,
                    geometriesIndexed: totalGeometriesIndexed,
                    errors: errors
                }
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            
            // Categorize error type for better diagnostics
            const isNetworkError = errorMsg.includes('network') || 
                                  errorMsg.includes('ECONNREFUSED') || 
                                  errorMsg.includes('ETIMEDOUT') ||
                                  errorMsg.includes('ENOTFOUND');
            const isTimeoutError = errorMsg.includes('timeout') || errorMsg.includes('TIMEOUT');
            const isValidationError = error instanceof BadRequestError;
            const isServiceError = error instanceof ServiceUnavailableError || 
                                  error instanceof ExternalServiceError;

            // Build comprehensive error diagnostic
            const errorDiagnostic: Record<string, unknown> = {
                errorMessage: errorMsg,
                errorType: error instanceof Error ? error.constructor.name : typeof error,
                errorCode: error instanceof AppError ? error.code : 'UNKNOWN_ERROR',
                isNetworkError,
                isTimeoutError,
                isValidationError,
                isServiceError,
                mode,
                dsoConfigured,
                searchParams: {
                    address,
                    coordinates,
                    bestuurslaag,
                    geldigOp,
                    inclusiefToekomstigGeldig,
                    maxResults,
                },
                documentsFound: 0,
                reason: isNetworkError ? 'network_connectivity_issue' :
                       isTimeoutError ? 'request_timeout' :
                       isValidationError ? 'parameter_validation_failed' :
                       isServiceError ? 'service_unavailable_or_not_configured' :
                       'unknown_error'
            };

            await runManager.log(
                runId,
                `DSO Locatie Zoeken: FOUT - ${errorMsg}`,
                'error'
            );

            await runManager.log(
                runId,
                `DSO Locatie Zoeken: Fout diagnostiek: ${JSON.stringify(errorDiagnostic, null, 2)}`,
                'error',
                errorDiagnostic
            );

            if (errorStack) {
                await runManager.log(
                    runId,
                    `DSO Locatie Zoeken: Stack trace: ${errorStack.substring(0, 1000)}`,
                    'error'
                );
            }

            logger.error({
                error,
                runId,
                params,
                mode,
                dsoConfigured,
                errorDiagnostic,
            }, 'Error in search_dso_location');

            // For validation errors, re-throw to fail the workflow step (per Error Handling Standard)
            if (isValidationError) {
                throw error;
            }

            // Store error information in context for debugging
            const context = params as Record<string, unknown>;
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            (context.rawDocumentsBySource as Record<string, unknown>).dsoLocation = [];
            (context.rawDocumentsBySource as Record<string, unknown>).dsoLocationError = {
                error: errorMsg,
                diagnostic: errorDiagnostic,
                timestamp: new Date().toISOString(),
                guidance: isNetworkError 
                    ? 'Network connectivity issue detected. Check internet connection and DSO API status.'
                    : isTimeoutError
                    ? 'Request timeout. DSO API may be slow or unavailable. Workflow will continue with other sources.'
                    : isServiceError
                    ? 'DSO service unavailable or not configured. Check API key and service configuration. Workflow will continue with other sources.'
                    : 'DSO location search failed. Check logs for details. Workflow will continue with other sources.'
            };

            // Return empty results (don't break workflow) - per Workflow Compensation Strategies
            // This is a read-only operation, so no compensation needed
            return {
                dsoLocationDocuments: [],
                totalFound: 0,
                searchLocation: {
                    address,
                    coordinates: coordinates || { x: 0, y: 0 },
                },
            };
        }
    });

    /**
     * Fetch All DSO Documents for Bevoegd Gezag
     * 
     * Fetches all DSO documents for any bevoegd gezag (municipality, province, water authority, or national government)
     * using geometry-based search with exhaustive pagination.
     * 
     * This action:
     * 1. Retrieves or fetches geometry from DSO Geometrie Opvragen API
     * 2. Uses geometry to query all documents via /documenten/_zoek with exhaustive pagination (iterates until no more pages)
     * 3. Filters documents by bevoegd gezag code client-side
     * 4. Stores documents in canonical_documents collection
     * 5. Updates gemeenten collection with bevoegd gezag code (if municipality)
     * 
     * @param params - Workflow parameters
     * @param params.bevoegdgezagCode - Bevoegd gezag code (e.g., "gm0301", "pv26", "ws15", "rk001")
     * @param params.geldigOp - Optional: Validity date filter (YYYY-MM-DD format)
     * @param params.inclusiefToekomstigGeldig - Optional: Include future valid documents (default: false)
     * @param params.forceRefreshGeometry - Optional: Force refresh geometry from API (default: false)
     * @param params.maxPages - Optional: Maximum pages to fetch (default: 100 pages = 20,000 documents)
     * @param params.bestuurslaag - Optional: Bestuurslaag filter (default: inferred from code)
     * @param params.mode - Optional: API mode ('preprod' | 'prod'), defaults to 'preprod'
     * @param runId - Workflow run ID for logging
     * @returns Object containing discovered documents
     * @returns {CanonicalDocument[]} bevoegdgezagDocuments - Array of discovered DSO documents
     * @returns {number} totalFound - Total number of documents found before filtering
     * @returns {number} totalFiltered - Total number of documents after bevoegd gezag code filtering
     * @returns {string} bevoegdgezagCode - Bevoegd gezag code used
     * 
     * @example
     * ```typescript
     * const result = await workflowEngine.execute('fetch_dso_bevoegdgezag_documents', {
     *   bevoegdgezagCode: 'gm0301',
     * }, runId);
     * // Returns: { bevoegdgezagDocuments: [...], totalFound: 150, totalFiltered: 120, bevoegdgezagCode: 'gm0301' }
     * ```
     * 
     * @see {@link DSOBevoegdgezagDocumentService} - Service handling bevoegd gezag document fetching
     * @see {@link DSOGeometryService} - Service handling geometry retrieval
     */
    workflowEngine.registerAction('fetch_dso_bevoegdgezag_documents', async (params: Record<string, unknown>, runId: string) => {
        // Validate input parameters
        const validation = inputValidationService.validateWorkflowInput('fetch_dso_bevoegdgezag_documents', params);
        if (!validation.valid) {
            const errorDetails = inputValidationService.formatErrorsForResponse(validation.errors);
            const errorMsg = inputValidationService.formatErrorsForLogging(validation.errors);
            await runManager.log(runId, `Parameter validatie mislukt: ${errorMsg}`, 'error');
            logger.warn({ action: 'fetch_dso_bevoegdgezag_documents', errors: validation.errors }, 'Workflow action validation failed');
            throw new BadRequestError(`Parameter validation failed: ${errorDetails.message}`, {
                action: 'fetch_dso_bevoegdgezag_documents',
                validationErrors: validation.errors
            });
        }

        const validatedParams = validation.sanitizedParams || params;

        // Extract parameters
        const bevoegdgezagCode = asString(validatedParams.bevoegdgezagCode);
        if (!bevoegdgezagCode) {
            throw new BadRequestError('bevoegdgezagCode is required', {
                action: 'fetch_dso_bevoegdgezag_documents',
                reason: 'missing_bevoegdgezag_code'
            });
        }

        const geldigOp = asString(validatedParams.geldigOp);
        const inclusiefToekomstigGeldig = validatedParams.inclusiefToekomstigGeldig === true;
        const forceRefreshGeometry = validatedParams.forceRefreshGeometry === true;
        const maxPages = typeof validatedParams.maxPages === 'number' ? validatedParams.maxPages : 100;
        const bestuurslaag = asString(validatedParams.bestuurslaag) as 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK' | undefined;
        const mode = asString(validatedParams.mode) || 'preprod';

        await runManager.log(
            runId,
            `Fetching DSO documents for bevoegd gezag: ${bevoegdgezagCode} (exhaustive pagination)`,
            'info'
        );

        // Validate DSO API configuration
        const { getDeploymentConfig } = await import('../../../../config/deployment.js');
        let dsoConfigured: boolean;
        let errorMessage: string;
        try {
            const config = getDeploymentConfig();
            dsoConfigured = !!config.dso.apiKey;
            errorMessage = `DSO API is not configured. Please set DSO_API_KEY (or legacy DSO_${mode === 'prod' ? 'PROD' : 'PREPROD'}_KEY) environment variable to use DSO bevoegd gezag document fetching (mode: ${mode}).`;
        } catch {
            const envVarName = mode === 'prod' ? 'DSO_PROD_KEY' : 'DSO_PREPROD_KEY';
            dsoConfigured = !!process.env[envVarName] || !!process.env.DSO_API_KEY;
            errorMessage = `DSO API is not configured. Please set ${envVarName} environment variable to use DSO bevoegd gezag document fetching (mode: ${mode}).`;
        }

        if (!dsoConfigured) {
            await runManager.log(runId, `DSO Locatie Zoeken: FOUT - ${errorMessage}`, 'error');
            logger.error({ mode }, 'DSO API not configured for bevoegd gezag document fetching');
            throw new ServiceUnavailableError(errorMessage, {
                action: 'fetch_dso_bevoegdgezag_documents',
                runId,
                mode,
                reason: 'dso_api_not_configured'
            });
        }

        try {
            // Initialize bevoegd gezag document service
            const { DSOBevoegdgezagDocumentService } = await import('../../../../services/external/DSOBevoegdgezagDocumentService.js');
            const bevoegdgezagService = new DSOBevoegdgezagDocumentService(mode === 'prod');

            // Fetch all documents for bevoegd gezag with exhaustive pagination
            const fetchResult = await bevoegdgezagService.fetchAllDocumentsForBevoegdgezag(bevoegdgezagCode, {
                geldigOp,
                inclusiefToekomstigGeldig,
                forceRefreshGeometry,
                maxPages,
                bestuurslaag,
                useProduction: mode === 'prod',
            });

            await runManager.log(
                runId,
                `Fetched ${fetchResult.totalFiltered} documents for bevoegd gezag ${bevoegdgezagCode} (${fetchResult.totalFound} total found, geometry source: ${fetchResult.geometrySource}, exhaustive pagination: ${fetchResult.totalFound === fetchResult.totalFiltered ? 'complete' : 'partial'})`,
                'info'
            );

            // Update gemeenten collection with bevoegd gezag code (if municipality)
            if (fetchResult.documents.length > 0 && bevoegdgezagCode.toLowerCase().startsWith('gm')) {
                try {
                    const { GemeenteModel } = await import('../../../../models/Gemeente.js');
                    // Extract municipality name from first document's issuingAuthority
                    const municipalityName = fetchResult.documents[0].issuingAuthority;
                    if (municipalityName) {
                        // Try to find by name and update code
                        const gemeente = await GemeenteModel.findByName(municipalityName);
                        if (gemeente) {
                            await GemeenteModel.updateMunicipalityCode(municipalityName, bevoegdgezagCode);
                            await runManager.log(
                                runId,
                                `Updated municipality code for ${municipalityName}: ${bevoegdgezagCode}`,
                                'info'
                            );
                        } else {
                            logger.debug({ municipalityName, bevoegdgezagCode }, 'Municipality not found in gemeenten collection');
                        }
                    }
                } catch (error) {
                    logger.warn({ error, bevoegdgezagCode }, 'Failed to update gemeenten collection with bevoegd gezag code');
                    // Don't fail the workflow if this fails
                }
            }

            // Convert DiscoveredDocuments to CanonicalDocuments and store them
            const { discoveredDocumentToCanonicalDraft } = await import('../../../../services/workflow/legacyToCanonicalConverter.js');
            const { getCanonicalDocumentService } = await import('../../../../services/canonical/CanonicalDocumentService.js');
            const documentService = getCanonicalDocumentService();

            const canonicalDocuments: CanonicalDocument[] = [];
            const context = params as Record<string, unknown>;
            const effectiveQueryId = (context.queryId as string | undefined);

            for (const discoveredDoc of fetchResult.documents) {
                try {
                    // For DSO documents, we need to acquire the full text
                    // For now, we'll use the title as fullText placeholder
                    // In a real implementation, you'd want to fetch the full document
                    const fullText = discoveredDoc.title || '';

                    const draft = discoveredDocumentToCanonicalDraft(discoveredDoc, fullText, runId);

                    // Set enrichmentMetadata
                    if (!draft.enrichmentMetadata) {
                        draft.enrichmentMetadata = {};
                    }
                    if (effectiveQueryId) {
                        draft.enrichmentMetadata.queryId = effectiveQueryId;
                    }
                    draft.enrichmentMetadata.workflowRunId = runId;

                    // Persist document
                    const serviceContext: ServiceContext = {
                        session: undefined,
                        requestId: runId,
                        workflowRunId: runId,
                    };
                    const savedDocument = await documentService.upsertBySourceId(draft, serviceContext);
                    const document = await documentService.findById(savedDocument._id);
                    if (document) {
                        canonicalDocuments.push(document);
                    }
                } catch (error) {
                    logger.warn({ error, sourceId: discoveredDoc.sourceId }, 'Failed to convert and store discovered document');
                    // Continue with other documents
                }
            }

            await runManager.log(
                runId,
                `Stored ${canonicalDocuments.length} documents in canonical_documents collection`,
                'info'
            );

            // Store in context
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            const { storeDocumentsInContext } = await import('../documentContextHelpers.js');
            storeDocumentsInContext(context, 'dsoBevoegdgezag', canonicalDocuments);

            return {
                bevoegdgezagDocuments: canonicalDocuments,
                totalFound: fetchResult.totalFound,
                totalFiltered: fetchResult.totalFiltered,
                bevoegdgezagCode: fetchResult.bevoegdgezagCode,
                geometryIdentificatie: fetchResult.geometryIdentificatie,
                geometrySource: fetchResult.geometrySource,
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await runManager.log(
                runId,
                `Error fetching bevoegd gezag documents: ${errorMsg}`,
                'error'
            );
            logger.error({
                error,
                runId,
                bevoegdgezagCode,
                mode,
            }, 'Error in fetch_dso_bevoegdgezag_documents');

            // Re-throw validation and service errors
            if (error instanceof BadRequestError || error instanceof ServiceUnavailableError) {
                throw error;
            }

            // For other errors, return empty results
            return {
                bevoegdgezagDocuments: [],
                totalFound: 0,
                totalFiltered: 0,
                bevoegdgezagCode,
            };
        }
    });
}



