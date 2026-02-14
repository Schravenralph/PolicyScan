/**
 * DSO Discovery Actions
 * 
 * Contains action for discovering DSO documents:
 * - search_dso_ontsluiten_discovery - Discover DSO documents via Ontsluiten v2 API
 * 
 * Uses DsoLiveClient for discovery (separation of concerns) and DsoAdapter for processing.
 */

import { WorkflowEngine } from '../../../../services/workflow/WorkflowEngine.js';
import { RunManager } from '../../../../services/workflow/RunManager.js';
import { InputValidationService } from '../../../../services/workflow/InputValidationService.js';
import { getQueryPersistenceService, type QueryPersistenceService } from '../../../../services/workflow/QueryPersistenceService.js';
import { asString } from '../../../workflowUtils.js';
import { logger } from '../../../../utils/logger.js';
import { ServiceConfigurationError } from '../../../../utils/serviceErrors.js';
import { ServiceUnavailableError, BadRequestError, ExternalServiceError, AppError } from '../../../../types/errors.js';
import { getCappedMaxResults, logPerformanceCap } from '../../../../utils/performanceConfig.js';
import { DsoAdapter } from '../../../../adapters/dso/DsoAdapter.js';
import type { OrchestrationResult } from '../../../../adapters/AdapterOrchestrator.js';
import type { ServiceContext, CanonicalDocument, CanonicalDocumentDraft } from '../../../../contracts/types.js';
import { DsoLiveClient, type DsoDiscoveryResult } from '../../../../adapters/dso/DsoLiveClient.js';
import { detectFormatFromIdentifier } from '../../../../adapters/dso/dsoFormatDetection.js';
import { normalizeDiscoveryToPlan } from '../../../../adapters/dso/services/DsoIdentifierNormalizer.js';
import { isE2EFixturesEnabled } from '../../../../config/featureFlags.js';
import { buildDsoPublicUrlFromDocument } from '../../../../utils/dsoUrlBuilder.js';
import { extractNavigationNodeTitle } from '../../../../utils/navigationGraphUtils.js';

/**
 * Register DSO discovery action
 * 
 * @param workflowEngine - Workflow engine instance
 * @param runManager - Run manager instance
 * @param navigationGraph - Optional navigation graph instance (for KG population)
 * @param options - Optional service dependencies for dependency injection (for testing)
 */
export function registerDSODiscoveryAction(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    navigationGraph?: import('../../../../services/graphs/navigation/NavigationGraph.js').NavigationGraph | null,
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
     * Step 1: Search DSO Omgevingsdocumenten (Discovery)
     * 
     * Discovers DSO (Omgevingswet) policy documents using the Omgevingsinformatie Ontsluiten v2 API.
     * This is the first step in the Beleidsscan workflow and performs metadata-only discovery.
     * 
     * @param params - Workflow parameters
     * @param params.onderwerp - Required: Subject/topic for search (string, 1-500 chars)
     * @param params.thema - Optional: Theme/topic refinement (string, max 200 chars)
     * @param params.overheidsinstantie - Optional: Government institution filter (string, max 200 chars)
     * @param params.overheidslaag - Optional: Government level filter (string, max 100 chars)
     * @param params.mode - Optional: API mode ('preprod' | 'prod'), defaults to 'preprod'
     * @param params.maxResults - Optional: Maximum number of results (number, 1-1000, default: 50)
     * @param params.queryId - Optional: Existing query ID to link results (MongoDB ObjectId)
     * @param runId - Workflow run ID for logging
     * @returns Object containing discovered documents
     * @returns {CanonicalDocument[]} dsoDiscoveryDocuments - Array of discovered DSO documents in canonical format
     * @throws {Error} If parameter validation fails
     * @throws {Error} If DSO API is not configured
     * @throws {Error} If DSO API request fails
     * 
     * @example
     * ```typescript
     * const result = await workflowEngine.execute('search_dso_ontsluiten_discovery', {
     *   onderwerp: 'klimaatadaptatie',
     *   thema: 'wateroverlast',
     *   overheidsinstantie: 'Gemeente Amsterdam'
     * }, runId);
     * // Returns: { dsoDiscoveryDocuments: [...] }
     * ```
     * 
     * @see {@link DSOOntsluitenService} - Service handling DSO API interactions
     * @see {@link QueryPersistenceService} - Service for persisting documents to database
     * @see {@link docs/30-dso-ontsluiten-v2/API-RESPONSE-FORMAT.md} - DSO API response format documentation
     */
    workflowEngine.registerAction('search_dso_ontsluiten_discovery', async (params: Record<string, unknown>, runId: string) => {
        // Validate input parameters with comprehensive validation including security checks
        const validation = inputValidationService.validateWorkflowInput('search_dso_ontsluiten_discovery', params);
        if (!validation.valid) {
            const errorDetails = inputValidationService.formatErrorsForResponse(validation.errors);
            const errorMsg = inputValidationService.formatErrorsForLogging(validation.errors);
            await runManager.log(runId, `Parameter validatie mislukt: ${errorMsg}`, 'error');
            logger.warn({ action: 'search_dso_ontsluiten_discovery', errors: validation.errors }, 'Workflow action validation failed');
            // Use custom error class per Error Handling Standard
            throw new BadRequestError(`Parameter validation failed: ${errorDetails.message}`, {
                action: 'search_dso_ontsluiten_discovery',
                validationErrors: validation.errors
            });
        }
        
        const validatedParams = validation.sanitizedParams || params;
        const onderwerp = asString(validatedParams.onderwerp) || '';
        const thema = asString(validatedParams.thema) || '';
        const overheidsinstantie = asString(validatedParams.overheidsinstantie) || '';
        const overheidslaag = asString(validatedParams.overheidslaag) || '';
        const mode = asString(validatedParams.mode) || 'preprod';
        const queryId = asString(validatedParams.queryId);
        
        const context = params as Record<string, unknown>;
        
        // Get performance config and apply caps
        const requestedMaxResults = typeof validatedParams.maxResults === 'number' ? validatedParams.maxResults : undefined;
        const maxResults = getCappedMaxResults(requestedMaxResults, context, 'step1');
        logPerformanceCap('step1', requestedMaxResults, maxResults, runId);
        
        // Fixture mode for E2E tests
        if (isE2EFixturesEnabled()) {
            logger.info({ action: 'search_dso_ontsluiten_discovery', runId }, 'FEATURE_E2E_FIXTURES=true: Returning fixture DSO discovery documents');
            await runManager.log(
                runId,
                'Step 1A: Using fixture DSO discovery documents (FEATURE_E2E_FIXTURES=true)',
                'info'
            );
            
            // Dynamic import to avoid runtime errors when tests directory is not available
            let createDSODiscoveryFixtures: (count: number) => CanonicalDocument[];
            try {
                const fixturesModule = await import('../../../../../../tests/fixtures/workflow/dsoDiscoveryFixtures.js');
                createDSODiscoveryFixtures = fixturesModule.createDSODiscoveryFixtures;
            } catch (error) {
                logger.error({ error }, 'Failed to load DSO discovery fixtures, falling back to empty array');
                return { dsoDiscoveryDocuments: [] };
            }
            
            const fixtureDocuments = createDSODiscoveryFixtures(maxResults || 3);
            
            // Store in context
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            (context.rawDocumentsBySource as Record<string, unknown>).dsoDiscovery = fixtureDocuments;
            
            return { dsoDiscoveryDocuments: fixtureDocuments };
        }
        
        await runManager.log(
            runId,
            `Step 1A: Discovering DSO documents via Ontsluiten v2: ${onderwerp}${thema ? ` (${thema})` : ''}${overheidsinstantie ? ` for ${overheidsinstantie}` : ''}`,
            'info'
        );
        
        // Validate DSO API configuration before proceeding using ServiceConfigurationValidator
        const { ServiceConfigurationValidator } = await import('../../../../services/workflow/ServiceConfigurationValidator.js');
        const serviceValidator = new ServiceConfigurationValidator();
        const dsoStatus = serviceValidator.isServiceConfigured('dso');
        const dsoConfigured = dsoStatus;
        
        if (!dsoStatus) {
            const validationResult = serviceValidator.validateWorkflowServices('beleidsscan-step-1-search-dso');
            const dsoServiceInfo = validationResult.missingServices.find(s => s.name === 'DSO API');
            const errorMessage = dsoServiceInfo?.error || 'DSO API is not configured';
            const guidance = dsoServiceInfo?.guidance || 'Please set DSO_API_KEY environment variable.';
            
            await runManager.log(
                runId,
                `Stap 1: FOUT in DSO DSO Ontsluiten discovery: ${errorMessage}. ${guidance}`,
                'error'
            );
            logger.error(
                { mode, service: 'DSO', error: errorMessage, guidance },
                'DSO API not configured, skipping discovery'
            );
            // Return empty results instead of throwing - allows workflow to continue with other sources
            return {
                dsoDiscoveryDocuments: [],
                skipped: true,
                reason: errorMessage,
                guidance,
            };
        }
        
        // Log service availability for workflow context
        await runManager.log(runId, 'Stap 1: DSO API is geconfigureerd en beschikbaar', 'info');
        
        try {
            // Initialize DSO adapter for canonical pipeline
            const adapter = new DsoAdapter({
                useLiveApi: true,
                useProduction: mode === 'prod',
            });

            // Build search query for discovery
            const searchQuery = {
                query: `${onderwerp} ${thema}`.trim() || undefined,
                opgesteldDoor: overheidsinstantie || undefined,
            };
            
            // Validate query parameters
            if (!searchQuery.query && !searchQuery.opgesteldDoor) {
                await runManager.log(
                    runId,
                    'Stap 1A: WAARSCHUWING - Lege zoekopdracht (geen onderwerp/thema en geen overheidsinstantie). Dit kan resulteren in geen documenten.',
                    'warn'
                );
            }
            
            await runManager.log(
                runId,
                `Step 1A: DSO API search query: ${JSON.stringify(searchQuery)} (mode: ${mode}, using canonical pipeline)`,
                'debug'
            );

            // Get effective queryId for enrichmentMetadata
            const effectiveQueryId = queryId || (context.queryId as string | undefined);
            
            // Create service context for canonical pipeline
            const serviceContext: ServiceContext = {
                session: undefined, // No transaction for now
                requestId: runId,
                userId: context.userId as string | undefined,
                ...(effectiveQueryId && { queryId: effectiveQueryId }),
                workflowRunId: runId,
                stepId: 'search-dso-discovery',
            };

            // Discovery phase: Use DsoLiveClient directly for separation of concerns
            const dsoLiveClient = new DsoLiveClient({
                useProduction: mode === 'prod',
            });

            await runManager.log(
                runId,
                `Step 1A: Discovery phase - querying DSO Ontsluiten API with: ${JSON.stringify({ query: searchQuery.query, opgesteldDoor: searchQuery.opgesteldDoor })}`,
                'debug'
            );

            let discoveredRecords: DsoDiscoveryResult[];
            try {
                // Pass maxResults to discoverByQuery to get more results (default is only 20)
                // Use a higher limit to ensure we get enough documents for processing
                const discoveryLimit = maxResults ? Math.min(maxResults * 2, 200) : 200; // Get 2x maxResults or up to 200
                discoveredRecords = await dsoLiveClient.discoverByQuery(
                    searchQuery.query,
                    searchQuery.opgesteldDoor,
                    discoveryLimit
                );
            } catch (discoveryError) {
                const errorMsg = discoveryError instanceof Error ? discoveryError.message : String(discoveryError);
                await runManager.log(
                    runId,
                    `Stap 1A: FOUT in DSO discovery: ${errorMsg}`,
                    'error'
                );
                logger.error(
                    { error: discoveryError, searchQuery, runId },
                    'DSO discovery failed'
                );
                throw discoveryError;
            }
            
            await runManager.log(
                runId,
                `Step 1A: Discovery phase - found ${discoveredRecords.length} DSO documents (query: "${searchQuery.query || 'none'}", opgesteldDoor: "${searchQuery.opgesteldDoor || 'none'}")`,
                discoveredRecords.length === 0 ? 'warn' : 'info'
            );
            
            // Log if queryId is available
            if (effectiveQueryId) {
                await runManager.log(
                    runId,
                    `Step 1A: QueryId available for document persistence: ${effectiveQueryId}`,
                    'debug'
                );
            } else {
                await runManager.log(
                    runId,
                    'Step 1A: ⚠️  WARNING - No queryId available! Documents will not be linked to query.',
                    'warn'
                );
            }

            // Log sample documents (up to 10) with details for verification
            if (discoveredRecords.length > 0) {
                const sampleSize = Math.min(10, discoveredRecords.length);
                const sampleRecords = discoveredRecords.slice(0, sampleSize);

                // Analyze each sample document
                const sampleDetails = sampleRecords.map((record, idx) => {
                    const plan = normalizeDiscoveryToPlan(record);
                    const hasAkn = plan.kind === 'STOPTPOD' && 'regelingIdAkn' in plan;
                    const aknId = hasAkn ? (plan as { regelingIdAkn: string }).regelingIdAkn : null;
                    const isImro = plan.kind === 'TAMIMRO';
                    const isMetadataOnly = plan.kind === 'METADATA_ONLY';

                    return {
                        index: idx + 1,
                        identificatie: record.identificatie || 'N/A',
                        uriIdentificatie: record.uriIdentificatie || 'N/A',
                        titel: (record.titel || 'Untitled').substring(0, 60) + (record.titel && record.titel.length > 60 ? '...' : ''),
                        type: record.type || 'N/A',
                        opgesteldDoor: record.opgesteldDoor || 'N/A',
                        hasAkn: hasAkn,
                        aknId: aknId,
                        isImro: isImro,
                        isMetadataOnly: isMetadataOnly,
                        format: plan.kind,
                    };
                });

                // Log summary of sample documents
                const aknCount = sampleDetails.filter(d => d.hasAkn).length;
                const imroCount = sampleDetails.filter(d => d.isImro).length;
                const metadataOnlyCount = sampleDetails.filter(d => d.isMetadataOnly).length;

                await runManager.log(
                    runId,
                    `Step 1A: Sample documents (${sampleSize} of ${discoveredRecords.length}): ${aknCount} with AKN, ${imroCount} IMRO, ${metadataOnlyCount} metadata-only`,
                    'info'
                );

                // Log each sample document on separate lines for readability
                for (const detail of sampleDetails) {
                    const aknStatus = detail.hasAkn ? `AKN: ${detail.aknId}` :
                                     detail.isImro ? 'IMRO format' :
                                     detail.isMetadataOnly ? 'Metadata-only (no download)' : 'Unknown format';

                    await runManager.log(
                        runId,
                        `  ${detail.index}. "${detail.titel}" | ID: ${detail.identificatie.substring(0, 50)}${detail.identificatie.length > 50 ? '...' : ''} | ${aknStatus}`,
                        'info'
                    );
                }

                // Log full details to structured logger for debugging
                logger.info({
                    function: 'search_dso_ontsluiten_discovery',
                    action: 'discovery_sample_analysis',
                    totalFound: discoveredRecords.length,
                    sampleSize,
                    sampleDetails,
                    summary: {
                        withAkn: aknCount,
                        imro: imroCount,
                        metadataOnly: metadataOnlyCount,
                    },
                }, '[DSO Discovery] Sample documents analysis');
            }

            // Analyze Z-prefixed documents to understand their metadata structure
            const zPattern = /\/Z\d{8,}/i; // Matches /Z followed by 8+ digits
            const zPrefixedRecords = discoveredRecords.filter((record) => {
                const identificatie = record.identificatie || '';
                return zPattern.test(identificatie);
            });

            if (zPrefixedRecords.length > 0) {
                // Analyze metadata fields in Z-prefixed documents
                const zMetadataAnalysis = zPrefixedRecords.map((record) => {
                    const hasUriIdentificatie = !!record.uriIdentificatie;
                    const uriIdentificatieFormat = record.uriIdentificatie
                        ? (record.uriIdentificatie.startsWith('/akn/') ? 'AKN' :
                           record.uriIdentificatie.startsWith('_akn_') ? 'URI-encoded' :
                           'OTHER')
                        : 'NONE';

                    return {
                        identificatie: record.identificatie,
                        hasUriIdentificatie,
                        uriIdentificatieFormat,
                        uriIdentificatie: record.uriIdentificatie || null,
                        hasTitel: !!record.titel,
                        hasType: !!record.type,
                        hasOpgesteldDoor: !!record.opgesteldDoor,
                        hasBestuursorgaan: !!record.bestuursorgaan,
                        hasPublicatiedatum: !!record.publicatiedatum,
                        hasPublicatieLink: !!record.publicatieLink,
                        allFields: Object.keys(record),
                    };
                });

                logger.info({
                    function: 'search_dso_ontsluiten_discovery',
                    action: 'z_prefixed_metadata_analysis',
                    zPrefixedCount: zPrefixedRecords.length,
                    analysis: zMetadataAnalysis,
                    summary: {
                        withUriIdentificatie: zMetadataAnalysis.filter(a => a.hasUriIdentificatie).length,
                        withUriIdentificatieAkn: zMetadataAnalysis.filter(a => a.uriIdentificatieFormat === 'AKN').length,
                        withUriIdentificatieUriEncoded: zMetadataAnalysis.filter(a => a.uriIdentificatieFormat === 'URI-encoded').length,
                        withoutUriIdentificatie: zMetadataAnalysis.filter(a => !a.hasUriIdentificatie).length,
                    },
                }, '[DSO Discovery] Z-prefixed documents metadata analysis');

                await runManager.log(
                    runId,
                    `Step 1A: Found ${zPrefixedRecords.length} Z-prefixed documents. Analysis: ${zMetadataAnalysis.filter(a => a.hasUriIdentificatie).length} have uriIdentificatie (${zMetadataAnalysis.filter(a => a.uriIdentificatieFormat === 'AKN').length} AKN format, ${zMetadataAnalysis.filter(a => a.uriIdentificatieFormat === 'URI-encoded').length} URI-encoded), ${zMetadataAnalysis.filter(a => !a.hasUriIdentificatie).length} without uriIdentificatie`,
                    'info'
                );
            }

            // Log format breakdown (DEBUG level)
            if (discoveredRecords.length > 0) {
                const formatBreakdown = discoveredRecords.reduce((acc, record) => {
                    const formatInfo = detectFormatFromIdentifier(record.identificatie);
                    acc[formatInfo.format] = (acc[formatInfo.format] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);
                
                logger.debug({
                    function: 'search_dso_ontsluiten_discovery',
                    action: 'format_breakdown',
                    formatBreakdown,
                    totalRecords: discoveredRecords.length,
                }, '[DSO Discovery] Format breakdown');
            }

            if (discoveredRecords.length === 0) {
                const diagnosticInfo = {
                    searchQuery,
                    mode,
                    dsoConfigured,
                    queryEmpty: !searchQuery.query && !searchQuery.opgesteldDoor,
                };
                
                await runManager.log(
                    runId,
                    `Stap 1A: WAARSCHUWING - Geen DSO documenten ontdekt. Diagnostische informatie: ${JSON.stringify(diagnosticInfo)}`,
                    'warn',
                    diagnosticInfo
                );
                
                // Store empty result in context
                if (!context.rawDocumentsBySource) {
                    context.rawDocumentsBySource = {};
                }
                (context.rawDocumentsBySource as Record<string, unknown>).dsoDiscovery = [];
                return { dsoDiscoveryDocuments: [] };
            }

            // Filter out documents that don't match expected formats (IMRO, STOP/TPOD, or Z-prefixed)
            // Only process documents with:
            // - NL.IMRO.* (IMRO format)
            // - /akn/... or _akn_... (STOP/TPOD format)
            // - /Z\d{8,}/ (Z-prefixed format)
            const filteredRecords = discoveredRecords.filter((record: any) => {
                const identificatie = record.identificatie || '';
                const uriIdentificatie = record.uriIdentificatie || '';

                // Check if it's IMRO format
                if (identificatie.startsWith('NL.IMRO.')) {
                    return true;
                }

                // Check if it's AKN format (STOP/TPOD)
                if (identificatie.startsWith('/akn/') || identificatie.startsWith('_akn_')) {
                    return true;
                }

                // Check if uriIdentificatie is AKN format
                if (uriIdentificatie.startsWith('/akn/') || uriIdentificatie.startsWith('_akn_')) {
                    return true;
                }

                // Check if it's Z-prefixed format
                if (/\/Z\d{8,}/i.test(identificatie)) {
                    return true;
                }

                // Skip all other formats
                return false;
            });

            const skippedCount = discoveredRecords.length - filteredRecords.length;
            if (skippedCount > 0) {
                await runManager.log(
                    runId,
                    `Step 1A: Filtered out ${skippedCount} document(s) with unrecognized formats (only processing IMRO, STOP/TPOD, and Z-prefixed documents). Remaining: ${filteredRecords.length} documents`,
                    'info'
                );
            }
            
            // Log format breakdown for debugging
            if (discoveredRecords.length > 0 && filteredRecords.length === 0) {
                await runManager.log(
                    runId,
                    `Step 1A: ⚠️  WARNING - All ${discoveredRecords.length} discovered documents were filtered out! This may indicate a format detection issue.`,
                    'warn'
                );
            }

            // Limit results to prevent large result sets
            const recordsToProcess = filteredRecords.slice(0, maxResults);
            
            if (filteredRecords.length > maxResults) {
                await runManager.log(
                    runId,
                    `Step 1A: Limited DSO results from ${filteredRecords.length} to ${maxResults} documents`,
                    'info'
                );
            }

            // Processing phase: Use AdapterOrchestrator for canonical pipeline
            await runManager.log(
                runId,
                `Step 1A: Processing phase - processing ${recordsToProcess.length} documents through canonical pipeline (acquire → extract → map → persist)`,
                'info'
            );

            // Get effective queryId and workflowRunId early for enrichmentMetadata
            const workflowRunId = runId;

            // Process records through canonical pipeline with custom enrichmentMetadata handling
            // Note: We use manual loop instead of AdapterOrchestrator because we need to:
            // 1. Set enrichmentMetadata (queryId, workflowRunId, stepId) before persist
            // 2. Handle fallback persistence for documents that fail to acquire
            // 3. Verify queryId after persistence
            // Note: DsoAdapter.acquire() will use uriIdentificatie if available (via DsoIdentifierNormalizer)
            // This means Z-prefixed documents with uriIdentificatie will attempt download using the AKN identifier
            const orchestrationResults: OrchestrationResult[] = [];
            let successfulCount = 0;
            let failedCount = 0;

            // Process each discovered record through the canonical pipeline
            // The DsoAdapter will use uriIdentificatie (if available) to attempt download
            // If download fails, fallback persistence will handle metadata-only storage
            for (const discoveryRecord of recordsToProcess) {
                const identificatie = (discoveryRecord as DsoDiscoveryResult).identificatie || 'unknown';
                try {
                    await runManager.log(
                        runId,
                        `Step 1A: Processing document ${identificatie}...`,
                        'debug'
                    );

                    // Execute canonical pipeline: acquire → extract → map → extensions → validate → persist
                    let artifactBundle: Buffer;
                    try {
                        artifactBundle = await adapter.acquire(discoveryRecord) as Buffer;
                        await runManager.log(
                            runId,
                            `Step 1A: Document ${identificatie} - ZIP acquired (${artifactBundle.length} bytes)`,
                            'debug'
                        );
                    } catch (acquireError) {
                        const errorMsg = acquireError instanceof Error ? acquireError.message : String(acquireError);
                        // 404 errors are expected for some documents - they're discovered but not available for download
                        // The fallback mechanism will persist metadata-only documents
                        // Check for explicit 404 flag or error message
                        // Check if this is an expected non-downloadable document (404, metadata-only, missionzaak, Z-prefixed, etc.)
                        const isExpectedNonDownloadable =
                            (acquireError instanceof Error && 
                             ((acquireError as Error & { is404Error?: boolean }).is404Error === true ||
                              (acquireError as Error & { isNotDownloadable?: boolean }).isNotDownloadable === true ||
                              (acquireError as Error & { isMetadataOnly?: boolean }).isMetadataOnly === true ||
                              (acquireError as Error & { isExpected?: boolean }).isExpected === true)) ||
                            errorMsg.includes('404') || 
                            errorMsg.includes('not available for download') ||
                            errorMsg.includes('cannot be downloaded') ||
                            errorMsg.includes('Missionzaak document') ||
                            errorMsg.includes('metadata-only') ||
                            errorMsg.includes('Z-prefixed');

                        // Check if this is a Z-prefixed document (Z128321838 type)
                        const isZPrefixed = identificatie && /\/Z\d{8,}/i.test(identificatie);

                        // For expected non-downloadable documents (especially Z-prefixed), use debug level instead of warn/error
                        // This is expected behavior - we save metadata only, no need to log as error
                        const logLevel = isExpectedNonDownloadable || isZPrefixed ? 'debug' : 'error';

                        // For expected non-downloadable documents, use a clearer message
                        const logMessage = isExpectedNonDownloadable || isZPrefixed
                            ? `Stap 1A: Document ${identificatie} niet beschikbaar voor download (alleen metadata opgeslagen): ${errorMsg}`
                            : `Stap 1A: FOUT bij ophalen ZIP voor ${identificatie}: ${errorMsg}`;
                        
                        // Only log if it's not a Z-prefixed document (those are completely expected and should be silent)
                        if (!isZPrefixed) {
                            await runManager.log(
                                runId,
                                logMessage,
                                logLevel
                            );
                        }
                        throw acquireError;
                    }

                    let extracted: unknown;
                    try {
                        await runManager.log(
                            runId,
                            `Step 1A: Document ${identificatie} - extracting ZIP contents...`,
                            'debug'
                        );
                        extracted = await adapter.extract(artifactBundle);
                        await runManager.log(
                            runId,
                            `Step 1A: Document ${identificatie} - ZIP extracted successfully`,
                            'debug'
                        );
                    } catch (extractError) {
                        const errorMsg = extractError instanceof Error ? extractError.message : String(extractError);
                        await runManager.log(
                            runId,
                            `Stap 1A: FOUT bij extraheren ZIP voor ${identificatie}: ${errorMsg}`,
                            'error'
                        );
                        throw extractError;
                    }

                    // Add discovery result to extracted data for mapping (DsoAdapter.map() may need it)
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
                    draft.enrichmentMetadata.stepId = 'search-dso-discovery';
                    
                    const extensions = adapter.extensions(extractedWithDiscovery);
                    adapter.validate(draft);

                    // Create context with artifact buffer and extracted data for persist
                    const ctxWithData = {
                        ...serviceContext,
                        artifactBuffer: artifactBundle,
                        extractedData: extracted,
                    };

                    let persistResult: { documentId: string };
                    try {
                        await runManager.log(
                            runId,
                            `Step 1A: Document ${identificatie} - persisting to database...`,
                            'debug'
                        );
                        persistResult = await adapter.persist(draft, extensions, ctxWithData);
                        await runManager.log(
                            runId,
                            `Step 1A: Document ${identificatie} - persisted with documentId: ${persistResult.documentId}`,
                            'debug'
                        );
                    } catch (persistError) {
                        const errorMsg = persistError instanceof Error ? persistError.message : String(persistError);
                        await runManager.log(
                            runId,
                            `Stap 1A: FOUT bij opslaan document ${identificatie}: ${errorMsg}`,
                            'error'
                        );
                        throw persistError;
                    }
                    
                    // Fetch the persisted document using documentId
                    // Note: DsoAdapter.persist() returns DsoAdapterResult with documentId, not the full document
                    const { CanonicalDocumentService } = await import('../../../../services/canonical/CanonicalDocumentService.js');
                    const documentService = new CanonicalDocumentService();
                    const persistedDocument = await documentService.findById(persistResult.documentId);
                    
                    if (!persistedDocument) {
                        throw new ServiceUnavailableError(`Failed to retrieve persisted document with ID: ${persistResult.documentId}`, {
                            action: 'search_dso_ontsluiten_discovery',
                            runId,
                            documentId: persistResult.documentId,
                            reason: 'document_persistence_verification_failed'
                        });
                    }

                    // Verify queryId is set correctly
                    const persistedQueryId = persistedDocument.enrichmentMetadata?.queryId;
                    if (!effectiveQueryId) {
                        await runManager.log(
                            runId,
                            `Stap 1A: WAARSCHUWING - Document ${identificatie} heeft geen queryId in workflow context (opgeslagen: "${persistedQueryId || 'none'}")`,
                            'warn'
                        );
                    } else if (persistedQueryId !== effectiveQueryId) {
                        await runManager.log(
                            runId,
                            `Stap 1A: WAARSCHUWING - Document ${identificatie} queryId komt niet overeen: verwacht "${effectiveQueryId}", kreeg "${persistedQueryId || 'none'}"`,
                            'warn'
                        );
                    } else {
                        await runManager.log(
                            runId,
                            `Step 1A: Document ${identificatie} - queryId verified: "${persistedQueryId}"`,
                            'debug'
                        );
                    }
                    
                    // Create orchestration result for consistency
                    orchestrationResults.push({
                        document: persistedDocument,
                        extensions,
                        executionTime: 0, // Timing not critical here
                        stages: {
                            discover: 0,
                            acquire: 0,
                            extract: 0,
                            map: 0,
                            extensions: 0,
                            validate: 0,
                            persist: 0,
                        },
                    });
                    successfulCount++;
                } catch (error) {
                    failedCount++;
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.error(
                        { error, identificatie: (discoveryRecord as { identificatie?: string }).identificatie, runId },
                        'Failed to process DSO document through canonical pipeline'
                    );
                    await runManager.log(
                        runId,
                        `Stap 1A: Verwerken van document ${(discoveryRecord as { identificatie?: string }).identificatie} mislukt: ${errorMsg}`,
                        'warn'
                    );
                    
                    // Fallback: Persist discovery record as metadata-only document
                    // This allows the document to be enriched later (e.g., in Step 2)
                    try {
                        await runManager.log(
                            runId,
                            `Step 1A: Attempting fallback persistence for ${(discoveryRecord as { identificatie?: string }).identificatie} (metadata-only)...`,
                            'info'
                        );
                        
                        const { getCanonicalDocumentService } = await import('../../../../services/canonical/CanonicalDocumentService.js');
                        const { computeContentFingerprint } = await import('../../../../utils/fingerprints.js');
                        const documentService = getCanonicalDocumentService();
                        
                        // Create minimal draft from discovery record
                        const discovery = discoveryRecord as DsoDiscoveryResult;
                        const minimalFullText = discovery.titel || `DSO document: ${discovery.identificatie || 'unknown'}`;
                        const contentFingerprint = computeContentFingerprint(minimalFullText);
                        
                        // Use identificatie as sourceId, or uriIdentificatie if available
                        const sourceId = discovery.identificatie || discovery.uriIdentificatie || `dso-discovery-${Date.now()}`;
                        
                        // Only set canonicalUrl if publicatieLink is a valid URL
                        // identificatie is an AKN path (e.g., "/akn/nl/act/..."), not a URL
                        let canonicalUrl: string | undefined;
                        if (discovery.publicatieLink) {
                            try {
                                // Validate it's a proper URL
                                new URL(discovery.publicatieLink);
                                canonicalUrl = discovery.publicatieLink;
                            } catch {
                                // Not a valid URL, leave undefined
                                canonicalUrl = undefined;
                            }
                        }
                        
                        // Check if this is a Z-prefixed document
                        const isZPrefixed = discovery.identificatie && /\/Z\d{8,}/i.test(discovery.identificatie);

                        // For Z-prefixed documents, include additional metadata fields
                        const zPrefixedMetadata: Record<string, unknown> = {};
                        if (isZPrefixed) {
                            // Z-prefixed documents may have additional fields
                            if ('statusdatum' in discovery) zPrefixedMetadata.statusdatum = discovery.statusdatum;
                            if ('isBesluit' in discovery) zPrefixedMetadata.isBesluit = discovery.isBesluit;
                            if ('isOntwerp' in discovery) zPrefixedMetadata.isOntwerp = discovery.isOntwerp;
                            zPrefixedMetadata.isZPrefixed = true;
                            zPrefixedMetadata.dsoFormat = 'Z_PREFIXED';
                            zPrefixedMetadata.skipReason = 'Z-prefixed identifier (not downloadable via Download API)';
                        }

                        const fallbackDraft: CanonicalDocumentDraft = {
                            source: 'DSO',
                            sourceId,
                            canonicalUrl, // May be undefined if publicatieLink is invalid or missing
                            title: discovery.titel || 'Untitled DSO Document',
                            publisherAuthority: discovery.opgesteldDoor || discovery.bestuursorgaan,
                            documentFamily: 'Omgevingsinstrument',
                            documentType: discovery.type || 'Unknown',
                            dates: {
                                publishedAt: discovery.publicatiedatum ? new Date(discovery.publicatiedatum) : undefined,
                                validFrom: discovery.geldigheidsdatum ? new Date(discovery.geldigheidsdatum) : undefined,
                                validTo: discovery.vervaldatum ? new Date(discovery.vervaldatum) : undefined,
                            },
                            fullText: minimalFullText,
                            contentFingerprint,
                            language: 'nl',
                            artifactRefs: [],
                            sourceMetadata: {
                                discovery: {
                                    identificatie: discovery.identificatie,
                                    uriIdentificatie: discovery.uriIdentificatie,
                                    type: discovery.type,
                                    opgesteldDoor: discovery.opgesteldDoor,
                                    bestuursorgaan: discovery.bestuursorgaan,
                                    publicatiedatum: discovery.publicatiedatum,
                                    geldigheidsdatum: discovery.geldigheidsdatum,
                                    vervaldatum: discovery.vervaldatum,
                                    publicatieLink: discovery.publicatieLink,
                                    ...zPrefixedMetadata,
                                },
                                discoveryResult: discovery, // Keep full discovery result for reference
                                acquisitionFailed: true,
                                acquisitionError: errorMsg,
                            },
                            enrichmentMetadata: {
                                queryId: effectiveQueryId,
                                workflowRunId,
                                stepId: 'search-dso-discovery',
                                isMetadataOnly: true,
                                needsEnrichment: !isZPrefixed, // Z-prefixed documents won't become downloadable
                                acquisitionFailedAt: new Date().toISOString(),
                                ...(isZPrefixed && {
                                    acquisitionSkippedReason: 'Z-prefixed identifier (not downloadable via Download API)',
                                }),
                            },
                        };
                        
                        // Persist the fallback document
                        const fallbackResult = await documentService.upsertBySourceId(fallbackDraft, serviceContext);
                        
                        await runManager.log(
                            runId,
                            `Step 1A: Fallback persistence successful for ${discovery.identificatie} (documentId: ${fallbackResult._id})`,
                            'info'
                        );
                        
                        // Add to successful results (as metadata-only document)
                        orchestrationResults.push({
                            document: fallbackResult as CanonicalDocument,
                            extensions: [],
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
                        });
                        
                        // Don't increment failedCount since we successfully persisted metadata
                        failedCount--;
                        successfulCount++;
                    } catch (fallbackError) {
                        const fallbackErrorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                        logger.error(
                            { error: fallbackError, identificatie: (discoveryRecord as { identificatie?: string }).identificatie, runId },
                            'Failed to persist discovery record as fallback metadata-only document'
                        );
                        await runManager.log(
                            runId,
                            `Step 1A: Fallback persistence also failed for ${(discoveryRecord as { identificatie?: string }).identificatie}: ${fallbackErrorMsg}`,
                            'error'
                        );
                    }
                }
            }

            if (failedCount > 0) {
                await runManager.log(
                    runId,
                    `Stap 1A: WAARSCHUWING - ${failedCount} van ${recordsToProcess.length} documenten mislukt verwerking`,
                    'warn'
                );
            }

            await runManager.log(
                runId,
                `Step 1A: Successfully processed ${successfulCount} DSO documents through canonical pipeline (stored in canonical_documents collection)`,
                'info'
            );

            // Verify documents were actually persisted to database
            try {
                const { getDB } = await import('../../../../config/database.js');
                const db = getDB();
                const persistedDocs = await db.collection('canonical_documents')
                    .find({
                        'enrichmentMetadata.workflowRunId': runId,
                        'enrichmentMetadata.stepId': 'search-dso-discovery',
                        source: 'DSO'
                    })
                    .limit(20)
                    .toArray();

                const persistedCount = persistedDocs.length;
                const aknCount = persistedDocs.filter(doc => {
                    const sourceMetadata = doc.sourceMetadata as Record<string, unknown> | undefined;
                    const discovery = sourceMetadata?.discovery as Record<string, unknown> | undefined;
                    const identificatie = discovery?.identificatie as string | undefined;
                    const uriIdentificatie = discovery?.uriIdentificatie as string | undefined;
                    return (identificatie && (identificatie.startsWith('/akn/') || identificatie.startsWith('_akn_'))) ||
                           (uriIdentificatie && (uriIdentificatie.startsWith('/akn/') || uriIdentificatie.startsWith('_akn_')));
                }).length;

                await runManager.log(
                    runId,
                    `Step 1A: Verification - Found ${persistedCount} persisted documents in database (${aknCount} with AKN identifiers)`,
                    persistedCount === successfulCount ? 'info' : 'warn'
                );

                // Check if persistedCount is less than or equal to 20 AND successfulCount > 20
                // If so, this is likely due to the limit(20) in the query, not an actual mismatch
                if (persistedCount !== successfulCount && !(persistedCount === 20 && successfulCount > 20)) {
                    await runManager.log(
                        runId,
                        `Stap 1A: WAARSCHUWING - Persistentie komt niet overeen: ${successfulCount} gerapporteerd succesvol, maar ${persistedCount} gevonden in database`,
                        'warn'
                    );
                }

                // Log sample of persisted documents for verification
                if (persistedDocs.length > 0) {
                    const samplePersisted = persistedDocs.slice(0, 5).map((doc, idx) => {
                        const sourceMetadata = doc.sourceMetadata as Record<string, unknown> | undefined;
                        const discovery = sourceMetadata?.discovery as Record<string, unknown> | undefined;
                        const identificatie = discovery?.identificatie as string | undefined;
                        const uriIdentificatie = discovery?.uriIdentificatie as string | undefined;
                        const hasAkn = (identificatie && (identificatie.startsWith('/akn/') || identificatie.startsWith('_akn_'))) ||
                                      (uriIdentificatie && (uriIdentificatie.startsWith('/akn/') || uriIdentificatie.startsWith('_akn_')));

                        return {
                            index: idx + 1,
                            documentId: (doc._id?.toString() || 'N/A').substring(0, 8) + (doc._id ? '...' : ''),
                            sourceId: (doc.sourceId || 'N/A').substring(0, 50) + (doc.sourceId && doc.sourceId.length > 50 ? '...' : ''),
                            title: (doc.title || 'Untitled').substring(0, 40) + (doc.title && doc.title.length > 40 ? '...' : ''),
                            hasAkn: hasAkn,
                            identificatie: (identificatie || 'N/A').substring(0, 50) + (identificatie && identificatie.length > 50 ? '...' : ''),
                            uriIdentificatie: (uriIdentificatie || 'N/A').substring(0, 50) + (uriIdentificatie && uriIdentificatie.length > 50 ? '...' : ''),
                        };
                    });

                    await runManager.log(
                        runId,
                        `Step 1A: Sample persisted documents (${samplePersisted.length} of ${persistedCount}):`,
                        'info'
                    );

                    for (const doc of samplePersisted) {
                        const aknStatus = doc.hasAkn ? 'HAS AKN' : 'NO AKN';
                        await runManager.log(
                            runId,
                            `  ${doc.index}. "${doc.title}" | ID: ${doc.sourceId} | ${aknStatus} | identificatie: ${doc.identificatie}`,
                            'info'
                        );
                    }
                }
            } catch (verifyError) {
                logger.error(
                    { error: verifyError, runId },
                    'Failed to verify document persistence'
                );
                await runManager.log(
                    runId,
                    `Stap 1A: WAARSCHUWING - Kon document persistentie niet verifiëren: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`,
                    'warn'
                );
            }

            // Extract canonical documents directly (no conversion needed)
            const documents: CanonicalDocument[] = orchestrationResults.map(result => result.document);
            
            // Log linked XML data statistics for debugging
            const documentsWithLinkedXmlData = documents.filter(doc => {
                const linkedXmlData = (doc.enrichmentMetadata as Record<string, unknown>)?.linkedXmlData;
                return !!linkedXmlData;
            });
            
            if (documentsWithLinkedXmlData.length > 0) {
                logger.debug(
                    {
                        totalDocuments: documents.length,
                        documentsWithLinkedXmlData: documentsWithLinkedXmlData.length,
                    },
                    '[DSO Discovery] Documents with linked XML data'
                );
            }
            
            // Store in context (only metadata to prevent 16MB BSON limit)
            const { storeDocumentsInContext } = await import('../documentContextHelpers.js');
            storeDocumentsInContext(context, 'dsoDiscovery', documents);
            
            // Documents are stored in canonical_documents collection via the canonical pipeline
            // Create Query document for workflow tracking (if needed)
            let finalQueryId: string | null = null;
            // effectiveQueryId already declared above at line 207, reuse it
            
            if (documents.length > 0) {
                if (effectiveQueryId) {
                    // Query already exists, just set in context
                    finalQueryId = effectiveQueryId;
                    context.queryId = finalQueryId;
                    
                    await runManager.log(
                        runId,
                        `Step 1A: Processed ${documents.length} DSO documents via canonical pipeline (Query ID: ${finalQueryId}, stored in canonical_documents collection)`,
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
                            const { getCanonicalDocumentService } = await import('../../../../services/canonical/CanonicalDocumentService.js');
                            const documentService = getCanonicalDocumentService();

                            const updates = documents.map(doc => ({
                                url: doc.canonicalUrl || doc.sourceId || '',
                                enrichmentMetadata: {
                                    queryId: finalQueryId,
                                    workflowRunId: runId,
                                    stepId: 'search-dso-discovery',
                                }
                            })).filter(u => !!u.url);

                            if (updates.length > 0) {
                                await documentService.bulkUpdateEnrichmentMetadata(updates);
                                await runManager.log(
                                    runId,
                                    `Step 1A: Updated ${updates.length} documents with new Query ID: ${finalQueryId}`,
                                    'info'
                                );
                            }
                        } catch (updateError) {
                            logger.error({ error: updateError, runId, queryId: finalQueryId }, 'Failed to backfill queryId for DSO documents');
                            await runManager.log(
                                runId,
                                `Step 1A: Warning - Failed to update documents with new Query ID: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
                                'warn'
                            );
                        }

                        await runManager.log(
                            runId,
                            `Step 1A: Processed ${documents.length} DSO documents via canonical pipeline and created Query document (Query ID: ${finalQueryId}, stored in canonical_documents collection)`,
                            'info'
                        );
                    } else {
                        await runManager.log(
                            runId,
                            `Step 1A: Processed ${documents.length} DSO documents via canonical pipeline (WARNING: Could not create Query document)`,
                            'warn'
                        );
                    }
                } else {
                    await runManager.log(
                        runId,
                        `Step 1A: Processed ${documents.length} DSO documents via canonical pipeline (no Query document created - no queryId or onderwerp provided, stored in canonical_documents collection)`,
                        'info'
                    );
                }
            }

            // Note: DSO documents are NOT added to Navigation Graph (API-discovered, not web-scraped)
            // They are only added to Knowledge Graph as lexical/legal entities with provenance

            // Populate knowledge graph from CanonicalDocument[] using WorkflowDocumentToKGService
            if (documents.length > 0) {
                try {
                    // Use helper function for standardized KG integration
                    const { populateKnowledgeGraphFromDocuments } = await import('../helpers/knowledgeGraphIntegration.js');
                    await populateKnowledgeGraphFromDocuments(documents, runManager, {
                        workflowRunId: runId,
                        workflowId: context.workflowId as string | undefined,
                        source: 'dso-discovery',
                        validate: true,
                    });
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ error: errorMsg, runId }, 'Failed to populate knowledge graph from DSO documents');
                    await runManager.log(runId, `Waarschuwing: Kennisgrafiek kon niet worden gevuld: ${errorMsg}`, 'warn');
                    // Don't fail the workflow if KG population fails
                }
            }
            
            // Return CanonicalDocument[] directly (architecture compliance)
            return {
                dsoDiscoveryDocuments: documents,
                queryId: finalQueryId || effectiveQueryId
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
                                  error instanceof ExternalServiceError ||
                                  error instanceof ServiceConfigurationError;
            
            // Build comprehensive error diagnostic information
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
                       isServiceError ? 'service_unavailable_or_not_configured' :
                       'unknown_error'
            };

            // Extract diagnostic info from enhanced error (if available)
            if (error instanceof Error && 'diagnosticInfo' in error) {
                errorDiagnostic.serviceDiagnosticInfo = (error as Error & { diagnosticInfo: unknown }).diagnosticInfo;
            }

            // Log comprehensive error information to workflow logs
            await runManager.log(
                runId,
                `Stap 1A: FOUT in DSO Ontsluiten discovery: ${errorMsg}`,
                'error'
            );

            await runManager.log(
                runId,
                `Stap 1A: Foutdiagnose informatie: ${JSON.stringify(errorDiagnostic, null, 2)}`,
                'error',
                errorDiagnostic
            );

            if (errorStack) {
                await runManager.log(
                    runId,
                    `Stap 1A: Fout stack trace: ${errorStack.substring(0, 1000)}`,
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
                    mode,
                    maxResults
                }, 
                mode, 
                dsoConfigured,
                errorDiagnostic
            }, 'Error in search_dso_ontsluiten_discovery');
            
            // For validation errors, re-throw to fail the workflow step (per Error Handling Standard)
            if (isValidationError) {
                throw error;
            }

            // Store error information in context for debugging
            const context = params as Record<string, unknown>;
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            (context.rawDocumentsBySource as Record<string, unknown>).dsoDiscovery = [];
            (context.rawDocumentsBySource as Record<string, unknown>).dsoDiscoveryError = {
                error: errorMsg,
                diagnostic: errorDiagnostic,
                timestamp: new Date().toISOString(),
                guidance: isNetworkError 
                    ? 'Network connectivity issue detected. Check internet connection and DSO API status.'
                    : isTimeoutError
                    ? 'Request timeout. DSO API may be slow or unavailable. Workflow will continue with other sources.'
                    : isServiceError
                    ? 'DSO service unavailable or not configured. Check API key and service configuration. Workflow will continue with other sources.'
                    : 'DSO discovery failed. Check logs for details. Workflow will continue with other sources.'
            };
            
            // Fallback: return empty array (don't break workflow) - per Workflow Compensation Strategies
            // This is a read-only operation, so no compensation needed
            return { dsoDiscoveryDocuments: [] };
        }
    });
}



