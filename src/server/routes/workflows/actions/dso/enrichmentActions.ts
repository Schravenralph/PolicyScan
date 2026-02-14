/**
 * DSO Enrichment Actions
 * 
 * Contains action for enriching DSO documents:
 * - enrich_dso_documents_optional - Enrich discovered DSO documents with additional metadata
 * 
 * Migrated to use canonical pipeline (DsoAdapter + AdapterOrchestrator).
 * Note: Enrichment is now part of the acquire → extract → map pipeline.
 * This action processes documents through the full canonical pipeline if they haven't been processed yet.
 */

import { WorkflowEngine } from '../../../../services/workflow/WorkflowEngine.js';
import { RunManager } from '../../../../services/workflow/RunManager.js';
import { InputValidationService } from '../../../../services/workflow/InputValidationService.js';
import { getQueryPersistenceService, type QueryPersistenceService } from '../../../../services/workflow/QueryPersistenceService.js';
import { asString } from '../../../workflowUtils.js';
import { logger } from '../../../../utils/logger.js';
import { BadRequestError, ServiceUnavailableError, ExternalServiceError, AppError } from '../../../../types/errors.js';
import { DsoAdapter } from '../../../../adapters/dso/DsoAdapter.js';
import type { OrchestrationResult } from '../../../../adapters/AdapterOrchestrator.js';
import type { ServiceContext, CanonicalDocument } from '../../../../contracts/types.js';
import type { DsoDiscoveryResult } from '../../../../adapters/dso/DsoLiveClient.js';
import { pLimit } from '../../../../utils/concurrency.js';

/**
 * Register DSO enrichment action
 * 
 * @param workflowEngine - Workflow engine instance
 * @param runManager - Run manager instance
 * @param options - Optional service dependencies for dependency injection (for testing)
 */
export function registerDSOEnrichmentAction(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    options?: {
        queryPersistenceService?: QueryPersistenceService;
        inputValidationService?: typeof InputValidationService | {
            validateWorkflowInput: typeof InputValidationService.validateWorkflowInput;
            formatErrorsForResponse: typeof InputValidationService.formatErrorsForResponse;
            formatErrorsForLogging: typeof InputValidationService.formatErrorsForLogging;
        };
    }
): void {
    // Use injected services or fall back to default implementations
    const queryPersistenceService = options?.queryPersistenceService || getQueryPersistenceService();
    const inputValidationService = options?.inputValidationService || InputValidationService;

    /**
     * Step 2: Enrich DSO Documents (Optional)
     * 
     * Enriches discovered DSO documents with additional metadata from the DSO Enrichment API.
     * This step is optional and can be skipped if no documents were discovered in Step 1.
     * 
     * @param params - Workflow parameters
     * @param params.dsoDiscoveryDocuments - Optional: Array of discovered documents from Step 1 (for standalone execution)
     * @param params.enableEnrichment - Optional: Whether to enable enrichment (default: true)
     * @param params.enrichmentTopK - Optional: Number of top documents to enrich (default: 10, max: 100)
     * @param params.includeGeographic - Optional: Include geographic metadata (default: false)
     * @param params.includeOWObjects - Optional: Include Omgevingswet objects (default: false)
     * @param params.queryId - Optional: Query ID for document persistence
     * @param runId - Workflow run ID for logging
     * @returns Object containing enriched documents
     * @returns {CanonicalDocument[]} enrichedDocuments - Array of enriched DSO documents (if enrichment was performed)
     * @returns {number} documentsEnriched - Number of documents successfully enriched
     * 
     * @example
     * ```typescript
     * const result = await workflowEngine.execute('enrich_dso_documents_optional', {
     *   dsoDiscoveryDocuments: [...],
     *   enableEnrichment: true,
     *   enrichmentTopK: 10
     * }, runId);
     * // Returns: { enrichedDocuments: [...], documentsEnriched: 10 }
     * ```
     * 
     * @see {@link DSOEnrichmentService} - Service handling DSO enrichment API interactions
     * @see {@link search_dso_ontsluiten_discovery} - Step 1 action that provides documents for enrichment
     */
    workflowEngine.registerAction('enrich_dso_documents_optional', async (params: Record<string, unknown>, runId: string) => {
        // Validate input parameters with comprehensive validation including security checks
        const validation = inputValidationService.validateWorkflowInput('enrich_dso_documents_optional', params);
        if (!validation.valid) {
            const errorDetails = inputValidationService.formatErrorsForResponse(validation.errors);
            const errorMsg = inputValidationService.formatErrorsForLogging(validation.errors);
            await runManager.log(runId, `Parameter validatie mislukt: ${errorMsg}`, 'error');
            logger.warn({ action: 'enrich_dso_documents_optional', errors: validation.errors }, 'Workflow action validation failed');
            // Use custom error class per Error Handling Standard
            throw new BadRequestError(`Parameter validation failed: ${errorDetails.message}`, {
                action: 'enrich_dso_documents_optional',
                validationErrors: validation.errors
            });
        }
        
        const validatedParams = validation.sanitizedParams || params;
        
        // Get discovered documents from Phase 1 (discovery action) or from provided parameter (for standalone execution)
        const context = validatedParams as Record<string, unknown>;
        const rawDocumentsBySource = context.rawDocumentsBySource as Record<string, unknown> | undefined;
        
        // Allow documents to be provided directly as parameter for standalone execution
        const providedDocs = params.dsoDiscoveryDocuments as CanonicalDocument[] | undefined;
        // Check both dsoGeometry (from geometry-based search) and dsoDiscovery (legacy/fallback)
        const contextDocs = (rawDocumentsBySource?.dsoGeometry as CanonicalDocument[])
            || (rawDocumentsBySource?.dsoDiscovery as CanonicalDocument[])
            || [];
        const discoveredDocs = providedDocs || contextDocs;
        
        // Determine if we're in standalone mode
        const isStandalone = !!providedDocs && providedDocs.length > 0;
        
        // Log source of documents for debugging
        const documentSource = providedDocs ? 'provided parameter (standalone mode)' : (contextDocs.length > 0 ? 'workflow context' : 'none');
        
        if (isStandalone) {
            await runManager.log(
                runId,
                `Stap 1B: Uitvoeren in standalone modus met ${providedDocs.length} opgegeven DSO discovery documenten`,
                'info'
            );
        } else {
            await runManager.log(
                runId,
                `Stap 1B: Controleren DSO verrijking geschiktheid - ontdekte documenten: ${discoveredDocs.length} (van ${documentSource}), enableEnrichment: ${params.enableEnrichment !== false}`,
                'debug'
            );
        }
        
        // If documents were provided via parameter but not in context, store them in context for consistency
        if (providedDocs && providedDocs.length > 0 && (!rawDocumentsBySource || !rawDocumentsBySource.dsoDiscovery)) {
            if (!rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            (context.rawDocumentsBySource as Record<string, unknown>).dsoDiscovery = providedDocs;
            if (!isStandalone) {
                // Only log if we haven't already logged standalone mode
                await runManager.log(
                    runId,
                    `Stap 1B: Gebruik opgegeven documenten voor standalone uitvoering (${providedDocs.length} documenten)`,
                    'info'
                );
            }
        }
        
        // Validate DSO API configuration for standalone execution
        // (In workflow context, Step 1 would have already validated this)
        if (isStandalone) {
            const { ServiceConfigurationValidator } = await import('../../../../services/workflow/ServiceConfigurationValidator.js');
            const serviceValidator = new ServiceConfigurationValidator();
            const dsoStatus = serviceValidator.isServiceConfigured('dso');
            
            if (!dsoStatus) {
                const validationResult = serviceValidator.validateWorkflowServices('beleidsscan-step-2-enrich-dso');
                const dsoServiceInfo = validationResult.missingServices.find(s => s.name === 'DSO API');
                const errorMessage = dsoServiceInfo?.error || 'DSO API is not configured';
                const guidance = dsoServiceInfo?.guidance || 'Please set DSO_API_KEY environment variable.';
                
                await runManager.log(
                    runId,
                    `Stap 2: FOUT in DSO DSO Enrichment: ${errorMessage}. ${guidance}`,
                    'error'
                );
                logger.error(
                    { service: 'DSO', error: errorMessage, guidance },
                    'DSO API not configured for enrichment (standalone mode)'
                );
                throw new ServiceUnavailableError(`${errorMessage}. ${guidance}`, {
                    action: 'enrich_dso_documents_optional',
                    runId,
                    mode: isStandalone ? 'standalone' : 'workflow',
                    reason: 'dso_api_not_configured'
                });
            }
            
            // Log service availability for workflow context
            await runManager.log(runId, 'Stap 2: DSO API is geconfigureerd en beschikbaar (standalone modus)', 'info');
        }
        
        // Check if enrichment should run
        const enableEnrichment = validatedParams.enableEnrichment !== false; // Default: enabled
        const shouldEnrich = enableEnrichment && discoveredDocs.length > 0;
        
        if (!shouldEnrich) {
            // Enhanced logging: provide diagnostic information when skipping
            const diagnosticInfo = {
                discoveredDocsCount: discoveredDocs.length,
                enableEnrichment,
                reason: !enableEnrichment ? 'enrichment disabled' : 'no documents discovered',
                hasRawDocumentsBySource: !!rawDocumentsBySource,
                dsoGeometryExists: !!rawDocumentsBySource?.dsoGeometry,
                dsoGeometryIsArray: Array.isArray(rawDocumentsBySource?.dsoGeometry),
                dsoDiscoveryExists: !!rawDocumentsBySource?.dsoDiscovery,
                dsoDiscoveryIsArray: Array.isArray(rawDocumentsBySource?.dsoDiscovery),
                documentsProvidedAsParameter: !!providedDocs,
                documentSource
            };
            
            const reason = !enableEnrichment ? 'uitgeschakeld' : 'geen documenten ontdekt';
            await runManager.log(
                runId,
                `DSO verrijking overslaan (${reason}). Diagnostische info: ${JSON.stringify(diagnosticInfo)}. Controleer Stap 1A logs voor discovery details.`,
                'info',
                diagnosticInfo
            );
            
            // Use discovery documents as-is
            // Store in context (only metadata to prevent 16MB BSON limit)
            const { storeDocumentsInContext } = await import('../documentContextHelpers.js');
            storeDocumentsInContext(context, 'dso', discoveredDocs);
            // Return enrichedDocuments array (even if empty) to comply with output schema
            return { 
                enrichedDocuments: discoveredDocs || [],
                documentsEnriched: 0 // No enrichment was performed
            };
        }
        
        await runManager.log(
            runId,
            `Stap 1B: Verrijken top-K DSO documenten (${discoveredDocs.length} ontdekt)`,
            'info'
        );
        
        try {
            // Validate discovery documents before enrichment
            // This prevents type errors and invalid enriched documents
            // Note: Now validating CanonicalDocument structure instead of DiscoveredDocument
            const validationErrors: Array<{ index: number; errors: string[] }> = [];
            const validDocuments: CanonicalDocument[] = [];
            
            for (let i = 0; i < discoveredDocs.length; i++) {
                const doc = discoveredDocs[i];
                // Validate CanonicalDocument structure (basic validation)
                if (doc && typeof doc === 'object' && '_id' in doc && 'source' in doc && 'sourceId' in doc && 'title' in doc) {
                    validDocuments.push(doc as CanonicalDocument);
                } else {
                    const errorMsg = 'Invalid CanonicalDocument structure';
                    validationErrors.push({ index: i, errors: [errorMsg] });
                    await runManager.log(
                        runId,
                        `Stap 1B: Ongeldig discovery document op index ${i}: ${errorMsg}`,
                        'warn'
                    );
                }
            }
            
            // If all documents are invalid, fail the workflow
            if (validDocuments.length === 0 && discoveredDocs.length > 0) {
                const errorDetails = validationErrors
                    .map(e => `Document ${e.index}: ${e.errors.join('; ')}`)
                    .join('\n');
                // const errorMsg = `All discovery documents are invalid. Validation errors:\n${errorDetails}`; // Unused
                await runManager.log(
                    runId,
                    `Stap 1B: FOUT - Alle discovery documenten zijn ongeldig. Validatiefouten: ${errorDetails}`,
                    'error'
                );
                throw new BadRequestError(`Invalid discovery documents: All ${discoveredDocs.length} documents failed validation. See logs for details.`, {
                    action: 'enrich_dso_documents_optional',
                    validationErrors: validationErrors.map(e => ({
                        index: e.index,
                        errors: e.errors
                    }))
                });
            }
            
            // If some documents are invalid, log warning but continue with valid documents
            if (validationErrors.length > 0 && validDocuments.length > 0) {
                await runManager.log(
                    runId,
                    `Stap 1B: WAARSCHUWING - ${validationErrors.length} van ${discoveredDocs.length} discovery documenten zijn ongeldig en worden overgeslagen. Doorgaan met ${validDocuments.length} geldige documenten.`,
                    'warn'
                );
            }
            
            const mode = asString(validatedParams.mode) || 'preprod';
            
            // Validate DSO API configuration before proceeding
            const { getDeploymentConfig } = await import('../../../../config/deployment.js');
            let dsoConfigured: boolean;
            let errorMessage: string;
            try {
                const config = getDeploymentConfig();
                dsoConfigured = !!config.dso.apiKey;
                errorMessage = `DSO API is not configured. Please set DSO_API_KEY (or legacy DSO_${mode === 'prod' ? 'PROD' : 'PREPROD'}_KEY) environment variable to use DSO document enrichment (mode: ${mode}).`;
            } catch {
                const envVarName = mode === 'prod' ? 'DSO_PROD_KEY' : 'DSO_PREPROD_KEY';
                dsoConfigured = !!process.env[envVarName] || !!process.env.DSO_API_KEY;
                errorMessage = `DSO API is not configured. Please set ${envVarName} environment variable to use DSO document enrichment (mode: ${mode}).`;
            }

            if (!dsoConfigured) {
                await runManager.log(runId, `Stap 2: FOUT in DSO DSO Enrichment: ${errorMessage}`, 'error');
                logger.error({ mode }, 'DSO API not configured for enrichment');
                throw new ServiceUnavailableError(errorMessage, {
                    action: 'enrich_dso_documents_optional',
                    runId,
                    mode,
                    reason: 'dso_api_not_configured'
                });
            }

            // Enrich top-K documents (default: top 10)
            const topK = typeof validatedParams.enrichmentTopK === 'number' ? validatedParams.enrichmentTopK : 10;
            const topKDocuments = validDocuments.slice(0, topK);

            await runManager.log(
                runId,
                `Stap 1B: Verwerken top-${topKDocuments.length} documenten via canonical pipeline (verrijking is nu onderdeel van acquire → extract → map pipeline)`,
                'info'
            );

            // Initialize DSO adapter for canonical pipeline
            const adapter = new DsoAdapter({
                useLiveApi: true,
                useProduction: mode === 'prod',
            });

            // Create service context for canonical pipeline
            // Get effective queryId from context if available
            const effectiveQueryId = (context.queryId as string | undefined);
            
            const serviceContext: ServiceContext = {
                session: undefined, // No transaction for now
                requestId: runId,
                userId: context.userId as string | undefined,
                ...(effectiveQueryId && { queryId: effectiveQueryId }),
                workflowRunId: runId,
                stepId: 'enrich-dso-optional', // Add stepId to context for adapter
            };

            // Convert CanonicalDocument[] to DsoDiscoveryResult[] format for processing
            const discoveryResults: DsoDiscoveryResult[] = topKDocuments.map(doc => ({
                identificatie: doc.sourceId || '',
                titel: doc.title,
                type: doc.documentType || 'STOP',
                opgesteldDoor: doc.publisherAuthority,
                publicatiedatum: doc.dates?.publishedAt?.toISOString(),
                publicatieLink: doc.canonicalUrl || doc.sourceId || '',
            }));

            // Process each document through the canonical pipeline
            // Since we already have the records, we'll process them directly using the adapter methods
            // Use concurrency limiter to prevent overwhelming external APIs
            const limit = pLimit(Number(process.env.DSO_ENRICHMENT_CONCURRENCY) || 5);

            const orchestrationResults = await Promise.allSettled(
                discoveryResults.map(async (record) => {
                    return limit(async () => {
                        try {
                            // Process record through pipeline: acquire → extract → map → extensions → validate → persist
                            const acquireStart = Date.now();
                            const artifactBundle = await adapter.acquire(record);
                            const acquireTime = Date.now() - acquireStart;

                            const ctxWithArtifact = {
                                ...serviceContext,
                                artifactBuffer: artifactBundle as Buffer,
                            };

                            const extractStart = Date.now();
                            const extracted = await adapter.extract(artifactBundle);
                            const extractTime = Date.now() - extractStart;

                            // Add discovery result to extracted data for mapping
                            const extractedWithDiscovery = {
                                ...extracted as object,
                                discoveryResult: record,
                            };

                            const ctxWithExtracted = {
                                ...ctxWithArtifact,
                                extractedData: extracted,
                            };

                            const mapStart = Date.now();
                            const draft = adapter.map(extractedWithDiscovery);
                            const mapTime = Date.now() - mapStart;

                            const extensionsStart = Date.now();
                            const extensions = adapter.extensions(extractedWithDiscovery);
                            const extensionsTime = Date.now() - extensionsStart;

                            const validateStart = Date.now();
                            adapter.validate(draft);
                            const validateTime = Date.now() - validateStart;

                            const persistStart = Date.now();
                            const persistResult = await adapter.persist(draft, extensions, ctxWithExtracted);
                            const persistTime = Date.now() - persistStart;

                            // Get the actual CanonicalDocument from the service using documentId
                            const { getCanonicalDocumentService } = await import('../../../../services/canonical/CanonicalDocumentService.js');
                            const documentService = getCanonicalDocumentService();
                            const document = await documentService.findById((persistResult as { documentId: string }).documentId) as CanonicalDocument | null;

                            if (!document) {
                                throw new ServiceUnavailableError(`Document not found after persist: ${(persistResult as { documentId: string }).documentId}`, {
                                    action: 'enrich_dso_documents_optional',
                                    runId,
                                    documentId: (persistResult as { documentId: string }).documentId
                                });
                            }

                            return {
                                document,
                                extensions,
                                executionTime: acquireTime + extractTime + mapTime + extensionsTime + validateTime + persistTime,
                                stages: {
                                    discover: 0,
                                    acquire: acquireTime,
                                    extract: extractTime,
                                    map: mapTime,
                                    extensions: extensionsTime,
                                    validate: validateTime,
                                    persist: persistTime,
                                },
                            } as OrchestrationResult;
                        } catch (error) {
                            logger.error({ error, record }, 'Failed to process document in enrichment');
                            throw error;
                        }
                    });
                })
            );

            const successfulResults: OrchestrationResult[] = [];
            for (const r of orchestrationResults) {
                if (r.status === 'fulfilled') {
                    successfulResults.push(r.value);
                }
            }

            const failedCount = orchestrationResults.length - successfulResults.length;

            if (failedCount > 0) {
                await runManager.log(
                    runId,
                    `Stap 1B: WAARSCHUWING - ${failedCount} van ${discoveryResults.length} documenten mislukt verwerking`,
                    'warn'
                );
            }

                await runManager.log(
                    runId,
                    `Stap 1B: Succesvol ${successfulResults.length} documenten verwerkt via canonical pipeline (opgeslagen in canonical_documents collectie)`,
                    'info'
                );

            // Use canonical documents directly (no conversion needed)
            // Extract linked XML data is already in enrichmentMetadata
            const enriched: CanonicalDocument[] = successfulResults.map(result => {
                const doc = result.document;
                
                // Extract linked XML data from enrichmentMetadata for logging
                const linkedXmlData = (doc.enrichmentMetadata as Record<string, unknown>)?.linkedXmlData as {
                  rules?: Array<{ identificatie: string; titel?: string; type?: string; areaIds?: string[]; textId?: string }>;
                  activities?: Array<{ identificatie: string; naam?: string }>;
                  regulationAreas?: Array<{ identificatie: string; naam?: string; ruleIds?: string[] }>;
                  statistics?: { totalRules: number; totalActivities: number; totalAreas: number; totalRuleTexts?: number };
                } | undefined;

                logger.debug(
                    {
                        sourceId: doc.sourceId,
                        hasLinkedXmlData: !!linkedXmlData,
                        ruleCount: linkedXmlData?.statistics?.totalRules || 0,
                        activityCount: linkedXmlData?.statistics?.totalActivities || 0,
                        areaCount: linkedXmlData?.statistics?.totalAreas || 0,
                    },
                    '[DSO Enrichment] Extracting linked XML data for CanonicalDocument'
                );
                
                // Return canonical document directly (linked XML data is already in enrichmentMetadata)
                return doc;
            });

            // Aggregate statistics across all enriched documents
            let totalRules = 0;
            let totalActivities = 0;
            let totalAreas = 0;
            let totalRuleTexts = 0;
            
            for (const doc of enriched) {
                const linkedXmlData = (doc.enrichmentMetadata as Record<string, unknown>)?.linkedXmlData as {
                    statistics?: { totalRules?: number; totalActivities?: number; totalAreas?: number; totalRuleTexts?: number };
                } | undefined;
                
                if (linkedXmlData?.statistics) {
                    totalRules += linkedXmlData.statistics.totalRules || 0;
                    totalActivities += linkedXmlData.statistics.totalActivities || 0;
                    totalAreas += linkedXmlData.statistics.totalAreas || 0;
                    totalRuleTexts += linkedXmlData.statistics.totalRuleTexts || 0;
                }
            }

            // Store enrichment statistics in context for use in completion message
            if (!context.enrichmentStatistics) {
                context.enrichmentStatistics = {};
            }
            (context.enrichmentStatistics as Record<string, unknown>).dsoEnrichment = {
                documentsEnriched: enriched.length,
                totalRules,
                totalActivities,
                totalAreas,
                totalRuleTexts,
            };

            // Log detailed completion message with statistics
            await runManager.log(
                runId,
                `Ik heb ${enriched.length} documenten verrijkt met volledige tekst, ${totalRules} regels, ${totalActivities} activiteiten en ${totalAreas} regelingsgebieden. Dit maakt gestructureerde zoekopdrachten en betere documentanalyse mogelijk.`,
                'info'
            );

            // Store final DSO documents in context (now using CanonicalDocument[])
            if (!rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            // Store in context (only metadata to prevent 16MB BSON limit)
            const { storeDocumentsInContext } = await import('../documentContextHelpers.js');
            storeDocumentsInContext(context, 'dso', enriched);
            
            // Documents are already persisted via canonical pipeline (DsoAdapter + AdapterOrchestrator)
            // Only create Query document if needed (for workflow tracking), but don't persist to brondocumenten
            // Get query parameters from context (set by Step 1) or use defaults
            const onderwerp = asString(context.onderwerp) || asString(validatedParams.onderwerp) || '';
            const thema = asString(context.thema) || asString(validatedParams.thema) || '';
            const overheidsinstantie = asString(context.overheidsinstantie) || asString(validatedParams.overheidsinstantie) || '';
            const overheidslaag = asString(context.overheidslaag) || asString(validatedParams.overheidslaag) || '';
            const queryId = context.queryId as string | undefined;
            
            if (successfulResults.length > 0) {
                if (queryId) {
                    // Query already exists, just set in context
                    context.queryId = queryId;
                    await runManager.log(
                        runId,
                        `Stap 2: ${successfulResults.length} documenten verwerkt via canonical pipeline (Query ID: ${queryId})`,
                        'info'
                    );
                } else if (onderwerp) {
                    // Create Query document for workflow tracking (documents already in canonical store)
                    // Use QueryPersistenceService directly (workflow-level utility)
                    const finalQueryId = await queryPersistenceService.createQuery(
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
                            `Stap 2: ${successfulResults.length} documenten verwerkt via canonical pipeline en Query document aangemaakt (Query ID: ${finalQueryId})`,
                            'info'
                        );
                    } else {
                        await runManager.log(
                            runId,
                            `Stap 2: ${successfulResults.length} documenten verwerkt via canonical pipeline (WAARSCHUWING: Kon Query document niet aanmaken)`,
                            'warn'
                        );
                    }
                } else {
                    await runManager.log(
                        runId,
                        `Stap 2: ${successfulResults.length} documenten verwerkt via canonical pipeline (geen Query document aangemaakt - geen queryId of onderwerp opgegeven)`,
                        'info'
                    );
                }
            }

            // Populate knowledge graph from enriched CanonicalDocument[] using WorkflowDocumentToKGService
            // WI-KG-GAP-001: Add KG population for enriched DSO documents
            if (enriched.length > 0) {
                try {
                    // Use helper function for standardized KG integration
                    const { populateKnowledgeGraphFromDocuments } = await import('../helpers/knowledgeGraphIntegration.js');
                    await populateKnowledgeGraphFromDocuments(enriched, runManager, {
                        workflowRunId: runId,
                        workflowId: context.workflowId as string | undefined,
                        source: 'dso-enriched',
                        validate: true,
                    });
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ error: errorMsg, runId }, 'Failed to populate knowledge graph from enriched DSO documents');
                    await runManager.log(runId, `Waarschuwing: Kennisgrafiek kon niet worden gevuld: ${errorMsg}`, 'warn');
                    // Don't fail the workflow if KG population fails
                }
            }
            
            // Return enrichedDocuments array to comply with output schema
            return { 
                enrichedDocuments: enriched || [],
                documentsEnriched: enriched ? enriched.length : 0
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
            const isValidationError = error instanceof BadRequestError ||
                                     errorMsg.includes('Invalid discovery documents') ||
                                     (errorMsg.includes('All') && errorMsg.includes('documents failed validation'));
            const isServiceError = error instanceof ServiceUnavailableError || 
                                  error instanceof ExternalServiceError;
            
            // Build comprehensive error diagnostic information
            const errorDiagnostic: Record<string, unknown> = {
                errorMessage: errorMsg,
                errorType: error instanceof Error ? error.constructor.name : typeof error,
                errorCode: error instanceof AppError ? error.code : 'UNKNOWN_ERROR',
                isNetworkError,
                isTimeoutError,
                isValidationError,
                isServiceError,
                documentsProcessed: discoveredDocs.length,
                documentsEnriched: 0,
                reason: isNetworkError ? 'network_connectivity_issue' :
                       isTimeoutError ? 'request_timeout' :
                       isValidationError ? 'document_validation_failed' :
                       isServiceError ? 'service_unavailable' :
                       'unknown_error'
            };

            // If error is about invalid documents, rethrow it (don't fall back to invalid documents)
            if (isValidationError) {
                await runManager.log(
                    runId,
                    `Fout in DSO verrijking: ${errorMsg}`,
                    'error'
                );

                await runManager.log(
                    runId,
                    `DSO Verrijking: Foutdiagnose informatie: ${JSON.stringify(errorDiagnostic, null, 2)}`,
                    'error',
                    errorDiagnostic
                );

                if (errorStack) {
                    await runManager.log(
                        runId,
                        `DSO Verrijking: Fout stack trace: ${errorStack.substring(0, 1000)}`,
                        'error'
                    );
                }

                logger.error({ 
                    error, 
                    runId, 
                    params,
                    errorDiagnostic
                }, 'Error in enrich_dso_documents_optional - validation error');
                throw error; // Re-throw validation errors
            }
            
            await runManager.log(
                runId,
                `Fout in DSO verrijking: ${errorMsg}`,
                'error'
            );

            await runManager.log(
                runId,
                `DSO Verrijking: Foutdiagnose informatie: ${JSON.stringify(errorDiagnostic, null, 2)}`,
                'error',
                errorDiagnostic
            );

            if (errorStack) {
                await runManager.log(
                    runId,
                    `DSO Verrijking: Fout stack trace: ${errorStack.substring(0, 1000)}`,
                    'error'
                );
            }

            logger.error({ 
                error, 
                runId, 
                params,
                errorDiagnostic
            }, 'Error in enrich_dso_documents_optional');

            // Store error information in context for debugging
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            (context.rawDocumentsBySource as Record<string, unknown>).dsoEnrichmentError = {
                error: errorMsg,
                diagnostic: errorDiagnostic,
                timestamp: new Date().toISOString(),
                guidance: isNetworkError 
                    ? 'Network connectivity issue detected. Check internet connection and DSO API status. Using discovery documents without enrichment.'
                    : isTimeoutError
                    ? 'Request timeout. DSO API may be slow or unavailable. Using discovery documents without enrichment.'
                    : isServiceError
                    ? 'DSO service unavailable. Check service configuration. Using discovery documents without enrichment.'
                    : 'DSO enrichment failed. Check logs for details. Using discovery documents without enrichment.'
            };
            
            // Fallback: use discovery documents without enrichment (only for non-validation errors)
            // Store in context (only metadata to prevent 16MB BSON limit)
            const { storeDocumentsInContext } = await import('../documentContextHelpers.js');
            storeDocumentsInContext(context, 'dso', discoveredDocs || []);
            // Return enrichedDocuments array (even if empty) to comply with output schema
            return { 
                enrichedDocuments: discoveredDocs || [],
                documentsEnriched: 0 // No enrichment was performed due to error
            };
        }
    });
}



