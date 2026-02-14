/**
 * Processing workflow actions
 * 
 * Contains actions for:
 * - Step 4: normalize_deduplicate_core - Normalize and deduplicate core documents
 * - Step 5: merge_score_categorize - Merge, score, and categorize documents
 */

import { WorkflowEngine } from '../../../services/workflow/WorkflowEngine.js';
import { RunManager } from '../../../services/workflow/RunManager.js';
import type { WorkflowMockData } from '../../../services/workflow/DocumentMergingService.js';
import { getQueryPersistenceService, type QueryPersistenceService } from '../../../services/workflow/QueryPersistenceService.js';
import { InputValidationService } from '../../../services/workflow/InputValidationService.js';
import { ReportGenerator } from '../../../services/reporting/ReportGenerator.js';
import type { WorkflowOrchestrator } from '../../../services/orchestration/WorkflowOrchestrator.js';
import { DocumentNormalizationService } from '../../../services/workflow/DocumentNormalizationService.js';
import { DocumentDeduplicationService } from '../../../services/workflow/DocumentDeduplicationService.js';
import { DocumentMergingService } from '../../../services/workflow/DocumentMergingService.js';
import { DocumentCategorizationService } from '../../../services/workflow/DocumentCategorizationService.js';
import { AnalysisPersistenceService } from '../../../services/orchestration/persistence/AnalysisPersistenceService.js';
import { DocumentCollectionService, type DocumentCollectionConfig } from '../../../services/workflow/DocumentCollectionService.js';
import { asString } from '../../workflowUtils.js';
import { logger } from '../../../utils/logger.js';
import { BadRequestError, ServiceUnavailableError, ExternalServiceError, AppError } from '../../../types/errors.js';
import type { CanonicalDocument } from '../../../contracts/types.js';

/**
 * Options for dependency injection in registerProcessingActions
 */
export interface ProcessingActionsOptions {
    queryPersistenceService?: QueryPersistenceService;
    inputValidationService?: typeof InputValidationService;
    reportGenerator?: ReportGenerator;
    workflowOrchestrator?: WorkflowOrchestrator;
    normalizationService?: DocumentNormalizationService;
    deduplicationService?: DocumentDeduplicationService;
    mergingService?: DocumentMergingService;
    categorizationService?: DocumentCategorizationService;
    analysisPersistenceService?: AnalysisPersistenceService;
    documentCollectionService?: DocumentCollectionService;
}

/**
 * Register processing-related workflow actions
 * 
 * @param workflowEngine - Workflow engine instance
 * @param runManager - Run manager instance
 * @param options - Optional service dependencies for dependency injection (for testing)
 */
export function registerProcessingActions(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    options?: ProcessingActionsOptions
): void {
    // Use injected services or fall back to default implementations
    const queryPersistenceService = options?.queryPersistenceService || getQueryPersistenceService();
    const inputValidationService = options?.inputValidationService || InputValidationService;
    const reportGenerator = options?.reportGenerator || new ReportGenerator();
    // WorkflowOrchestrator is only used for layer orchestration (analyzeDocuments)
    // Workflow-level utilities (normalization, deduplication, merging, categorization) use services directly
    const workflowOrchestrator = options?.workflowOrchestrator;
    // Workflow-level utility services
    const normalizationService = options?.normalizationService || new DocumentNormalizationService();
    const deduplicationService = options?.deduplicationService || new DocumentDeduplicationService(normalizationService);
    const mergingService = options?.mergingService || new DocumentMergingService(deduplicationService);
    const categorizationService = options?.categorizationService || new DocumentCategorizationService();
    // Persistence service (separated concern)
    const analysisPersistenceService = options?.analysisPersistenceService || new AnalysisPersistenceService();
    // Document collection service
    const documentCollectionService = options?.documentCollectionService || new DocumentCollectionService();

    /**
     * Step 4: Normalize + Deduplicate Core Results
     * 
     * Normalizes and deduplicates documents from Steps 1-4 (DSO Discovery, IPLO, Known Sources).
     * This prepares documents for merging with documents from Steps 6-7 (Official Publications, Jurisprudence).
     * 
     * @param params - Workflow parameters
     * @param params.rawDocumentsBySource - Optional: Raw documents by source (for standalone execution)
     * @param runId - Workflow run ID for logging
     * @returns Object containing normalized and deduplicated documents
     * @returns {CanonicalDocument[]} documentsCoreMerged - Array of normalized, deduplicated documents
     * 
     * @example
     * ```typescript
     * const result = await workflowEngine.execute('normalize_deduplicate_core', {}, runId);
     * // Returns: { documentsCoreMerged: [...] }
     * ```
     * 
     * @see {@link DocumentNormalizationService} - Service handling document normalization
     * @see {@link DocumentDeduplicationService} - Service handling document deduplication
     */
    workflowEngine.registerAction('normalize_deduplicate_core', async (params: Record<string, unknown>, runId: string) => {
        try {
            await runManager.log(runId, 'Normaliseren + dedupliceren kern documenten starten...', 'info');

            // Get context from params (workflow context is passed via params)
            const context = params as Record<string, unknown>;
            const rawDocumentsBySource = context.rawDocumentsBySource as Record<string, unknown> | undefined;

            // Collect documents from core sources (Steps 1-4)
            let coreDocuments: CanonicalDocument[] = [];

            // Check for direct documents input (Action Contract)
            // Support 'documents' or 'coreDocuments'
            if (params.documents && Array.isArray(params.documents) && params.documents.length > 0) {
                coreDocuments = params.documents as CanonicalDocument[];
                await runManager.log(runId, `${coreDocuments.length} documenten ontvangen via directe invoer`, 'info');
            } else if (params.coreDocuments && Array.isArray(params.coreDocuments) && params.coreDocuments.length > 0) {
                coreDocuments = params.coreDocuments as CanonicalDocument[];
                await runManager.log(runId, `${coreDocuments.length} kern documenten ontvangen via directe invoer`, 'info');
            } else {
                // Use DocumentCollectionService to collect documents from context
                const config: DocumentCollectionConfig = {
                    sourceKeys: Array.isArray(params.sourceKeys) ? params.sourceKeys as string[] : [],
                    priorityGroups: Array.isArray(params.priorityGroups) ? params.priorityGroups as string[][] : []
                };

                // Fallback to legacy configuration if no config provided (Backward Compatibility)
                // If config is empty, we add the legacy defaults
                // Note: This logic was previously hardcoded in the action logic itself
                if ((!config.sourceKeys || config.sourceKeys.length === 0) && (!config.priorityGroups || config.priorityGroups.length === 0)) {
                    // Legacy default logic: priority group for dso, then individual sources
                    config.priorityGroups = [['dso', 'dsoGeometry', 'dsoDiscovery']];
                    config.sourceKeys = ['iplo', 'knownSources'];

                    await runManager.log(
                        runId,
                        'Using legacy default configuration for document collection (no sourceKeys/priorityGroups provided)',
                        'debug'
                    );
                }

                coreDocuments = await documentCollectionService.collectDocuments(
                    rawDocumentsBySource,
                    config,
                    runId,
                    runManager
                );
            }

            await runManager.log(runId, `Totaal ${coreDocuments.length} kern documenten verzameld`, 'info');

            if (coreDocuments.length === 0) {
                await runManager.log(runId, 'Geen kern documenten gevonden', 'warn');
                // Store empty array in context
                if (!context.documentsCoreMerged) {
                    context.documentsCoreMerged = [];
                }
                return {
                    documentsCoreMerged: [],
                };
            }

            // Get orchestrator (required for normalization and deduplication)
            // Normalize documents using DocumentNormalizationService (workflow-level utility)
            await runManager.log(runId, 'Documenten normaliseren...', 'info');
            const normalized = normalizationService.normalizeDocuments(coreDocuments);
            await runManager.log(runId, `${normalized.length} documenten genormaliseerd`, 'info');

            // Deduplicate documents using DocumentDeduplicationService (workflow-level utility)
            await runManager.log(runId, 'Documenten dedupliceren...', 'info');
            const deduplicationResult = deduplicationService.deduplicate(coreDocuments, {
                byUrl: true, // Uses normalized canonicalUrl
                byStableId: true, // Uses contentFingerprint (primary) or normalized URL
                duplicateStrategy: 'merge', // Merge duplicates to preserve all metadata
            });

            await runManager.log(
                runId,
                `${deduplicationResult.documents.length} unieke documenten overgebleven na deduplicatie (${deduplicationResult.duplicatesRemoved} duplicaten verwijderd)`,
                'info'
            );

            if (deduplicationResult.duplicatesRemoved > 0) {
                await runManager.log(
                    runId,
                    `${deduplicationResult.duplicateGroups?.size || 0} groepen met duplicaten gevonden`,
                    'info'
                );
            }

            // Store normalized, deduplicated documents in context (only metadata to prevent 16MB BSON limit)
            const { extractDocumentsMetadata } = await import('./documentContextHelpers.js');
            context.documentsCoreMerged = extractDocumentsMetadata(deduplicationResult.documents);

            await runManager.log(
                runId,
                `Normaliseren + dedupliceren voltooid: ${deduplicationResult.documents.length} documenten`,
                'info'
            );

            return {
                documentsCoreMerged: extractDocumentsMetadata(deduplicationResult.documents),
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
                reason: isNetworkError ? 'network_connectivity_issue' :
                       isTimeoutError ? 'request_timeout' :
                       isValidationError ? 'parameter_validation_failed' :
                       isServiceError ? 'service_unavailable' :
                       'unknown_error'
            };

            await runManager.log(runId, `Fout in normaliseren/dedupliceren: ${errorMessage}`, 'error');
            await runManager.log(
                runId,
                `Normalize/Deduplicate: Error diagnostic information: ${JSON.stringify(errorDiagnostic, null, 2)}`,
                'error',
                errorDiagnostic
            );

            if (errorStack) {
                await runManager.log(
                    runId,
                    `Normalize/Deduplicate: Error stack trace: ${errorStack.substring(0, 1000)}`,
                    'error'
                );
            }

            logger.error({ 
                runId, 
                error,
                errorDiagnostic
            }, 'Error in normalize_deduplicate_core action');

            // For validation errors, re-throw to fail the workflow step (per Error Handling Standard)
            if (isValidationError) {
                throw error;
            }

            // For other errors, re-throw as well (this is a critical processing step)
            throw error;
        }
    });

    /**
     * Step 5: Merge, Score, and Categorize Documents
     * 
     * Merges documents from all previous steps, scores them for relevance, and categorizes them.
     * This is a processing step that consolidates all discovered documents.
     * 
     * @param params - Workflow parameters
     * @param params.onderwerp - Required: Subject/topic for scoring (string, 1-500 chars)
     * @param params.thema - Optional: Theme/topic refinement (string, max 200 chars)
     * @param params.queryId - Optional: Query ID for document persistence
     * @param params.mockData - Optional: Mock data for standalone execution (object)
     * @param params.documents - Optional: Simple array of documents for standalone execution (convenience alias for documentsCoreMerged)
     * @param params.documentsCoreMerged - Optional: Pre-merged documents for standalone execution
     * @param params.rawDocumentsBySource - Optional: Raw documents by source for standalone execution
     * @param runId - Workflow run ID for logging
     * @returns Object containing merged, scored, and categorized documents
     * @returns {CanonicalDocument[]} documentsMerged - Array of merged documents
     * @returns {CanonicalDocument[]} scoredDocuments - Array of scored documents (for backward compatibility)
     * @returns {Record<string, CanonicalDocument[]>} documentsByCategory - Documents grouped by category
     * @returns {Record<string, number>} categoryCounts - Count of documents per category
     * 
     * @example
     * ```typescript
     * const result = await workflowEngine.execute('merge_score_categorize', {
     *   onderwerp: 'klimaatadaptatie'
     * }, runId);
     * // Returns: { documentsMerged: [...], documentsByCategory: {...}, categoryCounts: {...} }
     * ```
     * 
     * @see {@link DocumentMergingService} - Service handling document merging
     * @see {@link DocumentScorer} - Service handling document scoring
     * @see {@link DocumentCategorizationService} - Service handling document categorization
     */
    workflowEngine.registerAction('merge_score_categorize', async (params: Record<string, unknown>, runId: string) => {
        // Validate input parameters with comprehensive validation including security checks
        const validation = inputValidationService.validateWorkflowInput('merge_score_categorize', params);
        if (!validation.valid) {
            const errorDetails = inputValidationService.formatErrorsForResponse(validation.errors);
            const errorMsg = inputValidationService.formatErrorsForLogging(validation.errors);
            await runManager.log(runId, `Parameter validatie mislukt: ${errorMsg}`, 'error');
            logger.warn({ action: 'merge_score_categorize', errors: validation.errors }, 'Workflow action validation failed');
            // Use custom error class per Error Handling Standard
            throw new BadRequestError(`Parameter validation failed: ${errorDetails.message}`, {
                action: 'merge_score_categorize',
                validationErrors: validation.errors
            });
        }
        
        const validatedParams = validation.sanitizedParams || params;
        const onderwerp = asString(validatedParams.onderwerp) || '';
        const thema = asString(validatedParams.thema) || '';
        // Standardize: use onderwerp consistently (like other actions)
        // Create local query variable from onderwerp for scoring
        const query = onderwerp || 'algemeen';
        const queryId = asString(validatedParams.queryId);
        
        // Get Query ID from context if available
        const context = validatedParams as Record<string, unknown>;

        // Check for mock data for standalone execution
        // Support both explicit mockData parameter and direct document parameters
        // Also support simple 'documents' parameter as convenience alias
        const mockData = validatedParams.mockData as WorkflowMockData | undefined;
        const documentsParam = validatedParams.documents as CanonicalDocument[] | undefined;
        const documentsCoreMerged = validatedParams.documentsCoreMerged as CanonicalDocument[] | undefined;
        const rawDocumentsBySource = validatedParams.rawDocumentsBySource as Record<string, unknown> | undefined;
        
        // Use 'documents' parameter if provided (convenience alias for documentsCoreMerged)
        const effectiveDocumentsCoreMerged = documentsParam || documentsCoreMerged;
        
        // Determine if we're in standalone mode
        const isStandalone = !!(mockData || effectiveDocumentsCoreMerged || rawDocumentsBySource);
        
        if (isStandalone) {
            await runManager.log(
                runId,
                'Stap 5: Uitvoeren in standalone modus met mock/geleverde data',
                'info'
            );
            
            // Build mock data structure if documents provided directly
            if (!mockData && (effectiveDocumentsCoreMerged || rawDocumentsBySource)) {
                const builtMockData: WorkflowMockData = {};
                if (effectiveDocumentsCoreMerged) {
                    builtMockData.documentsCoreMerged = effectiveDocumentsCoreMerged;
                }
                if (rawDocumentsBySource) {
                    if (rawDocumentsBySource.officieleBekendmakingen) {
                        builtMockData.officieleBekendmakingen = rawDocumentsBySource.officieleBekendmakingen as CanonicalDocument[];
                    }
                    if (rawDocumentsBySource.rechtspraak) {
                        builtMockData.rechtspraak = rawDocumentsBySource.rechtspraak as CanonicalDocument[];
                    }
                    if (rawDocumentsBySource.commonCrawl) {
                        builtMockData.commonCrawl = rawDocumentsBySource.commonCrawl as CanonicalDocument[];
                    }
                }
                context.mockData = builtMockData;
                await runManager.log(
                    runId,
                    `Step 5: Built mock data structure from provided parameters (${Object.keys(builtMockData).length} sources)`,
                    'debug'
                );
            } else if (mockData) {
                // Use provided mockData directly
                context.mockData = mockData;
                await runManager.log(
                    runId,
                    `Step 5: Using provided mockData (${Object.keys(mockData).length} sources)`,
                    'debug'
                );
            }
        } else {
            await runManager.log(
                runId,
                'Stap 5: Samenvoegen, scoren en categoriseren van documenten vanuit workflow context',
                'info'
            );
        }

        try {
            // Get orchestrator (required for all processing operations)
            const effectiveOrchestrator = workflowOrchestrator || await workflowEngine.getOrchestrator();
            if (!effectiveOrchestrator) {
                throw new Error('WorkflowOrchestrator is required for document processing');
            }

            // 1. Merge all document sources using DocumentMergingService (workflow-level utility)
            const merged = await mergingService.mergeAllSources(context);

            await runManager.log(
                runId,
                `Stap 5: ${merged.length} documenten samengevoegd van alle bronnen`,
                'info'
            );

            // 2. Score documents using WorkflowOrchestrator.analyzeDocuments (✅ Single orchestration path)
            // Convert CanonicalDocument[] to NormalizedDocument[] for analyzeDocuments
            const { DocumentMapper } = await import('../../../services/orchestration/mappers/DocumentMapper.js');
            const normalizedDocs = merged.map((doc) => DocumentMapper.canonicalToNormalized(doc));

            // Use WorkflowOrchestrator for scoring (replaces direct DocumentScorer calls)
            const analysisResult = await effectiveOrchestrator.analyzeDocuments(normalizedDocs, query);

            // Extract scored documents from analysis result
            const scored = analysisResult.documents; // Already ScoredDocument[] with rankings
            const ranked = scored; // AnalysisPipeline already ranks documents

            await runManager.log(
                runId,
                `Stap 5: ${ranked.length} documenten gescoord en gerangschikt`,
                'info'
            );

            // 4. Categorize documents using DocumentCategorizationService (workflow-level utility)
            const categorized = categorizationService.categorizeDocuments(ranked);

            // Use ReportGenerator to aggregate documents for reporting
            const aggregated = await reportGenerator.aggregateDocuments(ranked);
            
            // Extract category counts from aggregated data (using reporting layer)
            const categoryCounts: Record<string, number> = aggregated.categories.distribution;
            const nonEmptyCategories = aggregated.categories.topCategories.map(cat => cat.category);

            await runManager.log(
                runId,
                `Stap 5: Documenten gecategoriseerd in ${nonEmptyCategories.length} categorieën: ${nonEmptyCategories.join(', ')}`,
                'info'
            );
            
            // Log aggregated summary from reporting layer
            await runManager.log(
                runId,
                `Report summary: ${aggregated.summary.totalDocuments} documents, avg score: ${aggregated.summary.averageScore.toFixed(3)}`,
                'info'
            );

            // 5. Store results in context (only metadata to prevent 16MB BSON limit)
            const { extractDocumentsMetadata } = await import('./documentContextHelpers.js');
            context.documentsMerged = extractDocumentsMetadata(ranked);
            context.scoredDocuments = extractDocumentsMetadata(ranked); // For backward compatibility
            // Store categorized documents as metadata too
            const categorizedMetadata: Record<string, unknown[]> = {};
            for (const [category, docs] of Object.entries(categorized)) {
                categorizedMetadata[category] = extractDocumentsMetadata(docs);
            }
            context.documentsByCategory = categorizedMetadata;

            await runManager.log(
                runId,
                `Final results: ${ranked.length} documents across ${nonEmptyCategories.length} categories`,
                'info'
            );

            // Documents are already persisted via canonical pipeline (from previous workflow steps)
            // Only create Query document if needed (for workflow tracking), but don't persist to brondocumenten
            // Note: This persistence was redundant since documents are already in canonical_documents collection
            let effectiveQueryId = queryId || (context.queryId as string | undefined);
            
            if (ranked.length > 0) {
                if (effectiveQueryId) {
                    // Query document already exists, just log that documents are available in canonical store
                    context.queryId = effectiveQueryId;
                    
                    await runManager.log(
                        runId,
                        `Stap 5: Documenten al opgeslagen via canonical pipeline (canonical_documents collectie). Query ID: ${effectiveQueryId}`,
                        'info'
                    );
                } else if (onderwerp) {
                    // If no queryId but onderwerp provided, create Query document for workflow tracking
                    // Use QueryPersistenceService directly (workflow-level utility)
                    const createdQueryId = await queryPersistenceService.createQuery(
                        {
                            onderwerp,
                            thema,
                        },
                        runId
                    );
                    
                    if (createdQueryId) {
                        context.queryId = createdQueryId;
                        effectiveQueryId = createdQueryId;
                        await runManager.log(
                            runId,
                            `Stap 5: Query document aangemaakt voor workflow tracking (Query ID: ${createdQueryId}). Documenten al in canonical_documents collectie.`,
                            'info'
                        );
                    } else {
                        await runManager.log(
                            runId,
                            'Stap 5: WAARSCHUWING - Kon Query document niet aanmaken voor workflow tracking',
                            'warn'
                        );
                    }
                } else {
                    await runManager.log(
                        runId,
                        'Stap 5: Geen queryId of onderwerp opgegeven. Documenten zijn in canonical_documents collectie.',
                        'info'
                    );
                }
            }

            // ✅ Persist scores and categories to library using AnalysisPersistenceService (separated concern)
            if (ranked.length > 0 && effectiveQueryId) {
                try {
                    await runManager.log(runId, `${ranked.length} documenten bijwerken met scores en categorieën in bibliotheek...`, 'info');
                    
                    // Convert DocumentsByCategory to Record<string, CanonicalDocument[]>
                    const categorizedRecord: Record<string, CanonicalDocument[]> = {
                        policy: categorized.policy,
                        official_publication: categorized.official_publication,
                        jurisprudence: categorized.jurisprudence,
                        guidance: categorized.guidance,
                        unverified_external: categorized.unverified_external,
                    };
                    
                    const updatedCount = await analysisPersistenceService.persistAnalysisResults(
                        ranked,
                        categorizedRecord,
                        {
                            queryId: effectiveQueryId,
                            workflowRunId: runId,
                            stepId: 'merge-score-categorize',
                        }
                    );
                    
                    await runManager.log(
                        runId,
                        `${updatedCount} documenten bijgewerkt in bibliotheek met scores en categorieën`,
                        'info'
                    );
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ error: errorMsg, runId }, 'Failed to persist scores and categories to library');
                    await runManager.log(
                        runId,
                        `Waarschuwing: Kon scores en categorieën niet opslaan: ${errorMsg}`,
                        'warn'
                    );
                    // Don't fail the workflow if persistence fails
                }
            }

            // WI-KG-GAP-003: Populate knowledge graph from merged/scored CanonicalDocument[]
            // The merged documents represent the final curated set with scores and categories
            // This complements individual step KG population by providing the authoritative merged view
            if (ranked.length > 0) {
                try {
                    const { populateKnowledgeGraphFromDocuments } = await import('./helpers/knowledgeGraphIntegration.js');
                    await populateKnowledgeGraphFromDocuments(ranked, runManager, {
                        workflowRunId: runId,
                        workflowId: context.workflowId as string | undefined,
                        source: 'merged-scored',
                        validate: true,
                    });
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ error: errorMsg, runId }, 'Failed to populate knowledge graph from merged documents');
                    await runManager.log(
                        runId,
                        `Waarschuwing: Kennisgrafiek kon niet worden gevuld: ${errorMsg}`,
                        'warn'
                    );
                    // Don't fail the workflow if KG population fails
                }
            }

            // Return metadata instead of full documents to prevent 16MB BSON limit
            // Reuse extractDocumentsMetadata and categorizedMetadata already declared above
            return {
                documentsMerged: extractDocumentsMetadata(ranked),
                scoredDocuments: extractDocumentsMetadata(ranked),
                documentsByCategory: categorizedMetadata,
                categoryCounts
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await runManager.log(
                runId,
                `Fout in merge_score_categorize: ${errorMsg}`,
                'error'
            );
            logger.error({ error, runId, params }, 'Error in merge_score_categorize');

            // Store empty arrays in context on error
            const context = params as Record<string, unknown>;
            context.documentsMerged = [];
            context.scoredDocuments = [];
            context.documentsByCategory = {
                policy: [],
                official_publication: [],
                jurisprudence: [],
                guidance: [],
                unverified_external: []
            };

            // Return empty results (don't break workflow)
            return {
                documentsMerged: [],
                scoredDocuments: [],
                documentsByCategory: context.documentsByCategory,
                categoryCounts: {}
            };
        }
    });

    /**
     * Final Step: Save All Workflow Documents
     * 
     * Ensures all documents from all workflow steps are properly saved to the document library
     * with correct metadata (queryId, workflowRunId, stepId). This action collects documents
     * from all sources in the workflow context and verifies they are saved.
     * 
     * @param params - Workflow parameters (contains workflow context)
     * @param params.queryId - Optional: Query ID for document linking
     * @param runId - Workflow run ID for logging
     * @returns Object containing summary of saved documents
     * @returns {number} totalDocumentsVerified - Total number of documents verified/saved
     * @returns {Record<string, number>} documentsBySource - Count of documents by source
     * 
     * @example
     * ```typescript
     * const result = await workflowEngine.execute('save_all_workflow_documents', {
     *   queryId: 'query-123'
     * }, runId);
     * // Returns: { totalDocumentsVerified: 150, documentsBySource: { dso: 50, iplo: 30, ... } }
     * ```
     */
    workflowEngine.registerAction('save_all_workflow_documents', async (params: Record<string, unknown>, runId: string) => {
        try {
            await runManager.log(runId, 'Starten met laatste document opslag verificatie...', 'info');

            const context = params as Record<string, unknown>;
            const rawDocumentsBySource = (context.rawDocumentsBySource as Record<string, unknown>) || {};
            const effectiveQueryId = asString(params.queryId) || (context.queryId as string | undefined);

            if (!effectiveQueryId) {
                await runManager.log(
                    runId,
                    'Geen queryId opgegeven. Documenten mogelijk niet correct gekoppeld aan query.',
                    'warn'
                );
            }

            const { getCanonicalDocumentService } = await import('../../../services/canonical/CanonicalDocumentService.js');
            const documentService = getCanonicalDocumentService();
            
            const documentsBySource: Record<string, number> = {};
            let totalDocumentsVerified = 0;

            // Collect all document URLs from all sources
            const allDocumentUrls = new Set<string>();

            // Helper to add URL from document reference
            // Handles doc.url, doc.canonicalUrl, and doc.sourceId (if it looks like a URL)
            const addDocumentUrl = (doc: { url?: string; canonicalUrl?: string; sourceId?: string }) => {
                const url = doc.canonicalUrl || doc.url;
                if (url) {
                    allDocumentUrls.add(url);
                } else if (doc.sourceId && typeof doc.sourceId === 'string' && (doc.sourceId.startsWith('http') || doc.sourceId.startsWith('https'))) {
                    allDocumentUrls.add(doc.sourceId);
                }
            };

            // Step 1: DSO Discovery
            if (rawDocumentsBySource.dsoDiscovery && Array.isArray(rawDocumentsBySource.dsoDiscovery)) {
                const docs = rawDocumentsBySource.dsoDiscovery as Array<{ url?: string; canonicalUrl?: string; sourceId?: string }>;
                docs.forEach(addDocumentUrl);
                documentsBySource.dsoDiscovery = docs.length;
            }

            // Step 2: DSO (enriched)
            if (rawDocumentsBySource.dso && Array.isArray(rawDocumentsBySource.dso)) {
                const docs = rawDocumentsBySource.dso as Array<{ url?: string; canonicalUrl?: string; sourceId?: string }>;
                docs.forEach(addDocumentUrl);
                documentsBySource.dso = docs.length;
            }

            // Step 3: IPLO
            if (rawDocumentsBySource.iplo && Array.isArray(rawDocumentsBySource.iplo)) {
                const docs = rawDocumentsBySource.iplo as Array<{ url?: string; canonicalUrl?: string; sourceId?: string }>;
                docs.forEach(addDocumentUrl);
                documentsBySource.iplo = docs.length;
            }

            // Step 4: Known Sources
            if (rawDocumentsBySource.knownSources && Array.isArray(rawDocumentsBySource.knownSources)) {
                const docs = rawDocumentsBySource.knownSources as Array<{ url?: string; canonicalUrl?: string; sourceId?: string }>;
                docs.forEach(addDocumentUrl);
                documentsBySource.knownSources = docs.length;
            }

            // Step 6: Official Publications
            if (rawDocumentsBySource.officieleBekendmakingen && Array.isArray(rawDocumentsBySource.officieleBekendmakingen)) {
                const docs = rawDocumentsBySource.officieleBekendmakingen as Array<{ url?: string; canonicalUrl?: string; sourceId?: string }>;
                docs.forEach(addDocumentUrl);
                documentsBySource.officieleBekendmakingen = docs.length;
            }

            // Step 7: Rechtspraak
            if (rawDocumentsBySource.rechtspraak && Array.isArray(rawDocumentsBySource.rechtspraak)) {
                const docs = rawDocumentsBySource.rechtspraak as Array<{ url?: string; canonicalUrl?: string; sourceId?: string }>;
                docs.forEach(addDocumentUrl);
                documentsBySource.rechtspraak = docs.length;
            }

            // Step 8: Common Crawl
            if (rawDocumentsBySource.commonCrawl && Array.isArray(rawDocumentsBySource.commonCrawl)) {
                const docs = rawDocumentsBySource.commonCrawl as Array<{ url?: string; canonicalUrl?: string; sourceId?: string }>;
                docs.forEach(addDocumentUrl);
                documentsBySource.commonCrawl = docs.length;
            }

            // Also check context.canonicalDocuments as a fallback (some actions store directly there)
            if (context.canonicalDocuments && Array.isArray(context.canonicalDocuments)) {
                const canonicalDocs = context.canonicalDocuments as Array<{ canonicalUrl?: string; sourceId?: string; url?: string }>;
                canonicalDocs.forEach(addDocumentUrl);
                documentsBySource.canonicalDocuments = canonicalDocs.length;
            }

            // Also check documentsMerged from merge_score_categorize step (Step 5)
            if (context.documentsMerged && Array.isArray(context.documentsMerged)) {
                const mergedDocs = context.documentsMerged as Array<{ url?: string; canonicalUrl?: string }>;
                mergedDocs.forEach(addDocumentUrl);
                documentsBySource.documentsMerged = mergedDocs.length;
            }

            // Also check scoredDocuments (backward compatibility alias for documentsMerged)
            if (context.scoredDocuments && Array.isArray(context.scoredDocuments)) {
                const scoredDocs = context.scoredDocuments as Array<{ url?: string; canonicalUrl?: string }>;
                scoredDocs.forEach(addDocumentUrl);
                if (!documentsBySource.documentsMerged) {
                    documentsBySource.scoredDocuments = scoredDocs.length;
                }
            }

            await runManager.log(
                runId,
                `${allDocumentUrls.size} unieke document-URLs gevonden in alle bronnen`,
                'info'
            );

            // Log breakdown by source for debugging
            await runManager.log(
                runId,
                `Document breakdown by source: ${JSON.stringify(documentsBySource)}`,
                'info'
            );

            // Verify documents are saved and update metadata if needed
            if (allDocumentUrls.size > 0 && effectiveQueryId) {
                await runManager.log(
                    runId,
                    `Verifiëren van ${allDocumentUrls.size} documenten zijn opgeslagen met juiste metadata...`,
                    'info'
                );

                let verifiedCount = 0;
                let updatedCount = 0;
                let notFoundCount = 0;

                // Process in batches to avoid overwhelming the database
                const batchSize = 50;
                const urlArray = Array.from(allDocumentUrls);
                
                for (let i = 0; i < urlArray.length; i += batchSize) {
                    const batch = urlArray.slice(i, i + batchSize);
                    
                    for (const url of batch) {
                        try {
                            // Try to find document by URL
                            const document = await documentService.findByUrl(url);
                            
                            if (document) {
                                verifiedCount++;
                                
                                // Ensure enrichmentMetadata has correct queryId and workflowRunId
                                const needsUpdate = document.enrichmentMetadata?.queryId !== effectiveQueryId ||
                                                   document.enrichmentMetadata?.workflowRunId !== runId;
                                
                                if (needsUpdate) {
                                    // Use the original URL we searched with, as that's what findByUrl matched
                                    // This ensures bulkUpdateEnrichmentMetadata can find the document
                                    await documentService.bulkUpdateEnrichmentMetadata([{
                                        url: url,
                                        enrichmentMetadata: {
                                            // Preserve existing metadata (must be spread BEFORE new values to allow overwrite)
                                            ...document.enrichmentMetadata,
                                            queryId: effectiveQueryId,
                                            workflowRunId: runId,
                                        },
                                    }]);
                                    updatedCount++;
                                }
                            } else {
                                notFoundCount++;
                                // Document not found - this is expected if it wasn't persisted yet
                                // Individual actions handle persistence, so this is just verification
                            }
                        } catch (error) {
                            logger.warn({ error, url, runId }, 'Error verifying document');
                        }
                    }
                }

                await runManager.log(
                    runId,
                    `Document verificatie voltooid: ${verifiedCount} geverifieerd, ${updatedCount} metadata bijgewerkt, ${notFoundCount} niet gevonden (mogelijk in uitvoering)`,
                    'info'
                );

                totalDocumentsVerified = verifiedCount;
            } else {
                await runManager.log(
                    runId,
                    'Document verificatie overslaan (geen queryId of geen documenten gevonden)',
                    'warn'
                );
            }

            return {
                totalDocumentsVerified,
                documentsBySource,
                queryId: effectiveQueryId,
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await runManager.log(
                runId,
                `Fout in save_all_workflow_documents: ${errorMsg}`,
                'error'
            );
            logger.error({ error, runId, params }, 'Error in save_all_workflow_documents');
            
            // Don't fail the workflow - documents are already saved by individual actions
            return {
                totalDocumentsVerified: 0,
                documentsBySource: {},
                error: errorMsg,
            };
        }
    });
}
