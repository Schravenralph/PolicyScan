/**
 * DSO Geometry-Based Document Search Actions
 * 
 * Contains action for fetching documents using bevoegd gezag geometry:
 * - fetch_dso_documents_by_geometry - Fetch all documents for any bevoegd gezag using geometry
 * 
 * This action:
 * 1. Retrieves geometry from database or fetches from PDOK/DSO
 * 2. Uses geometry to query DSO Ontsluiten v2 API
 * 3. Returns all relevant documents for that geometry
 */

import { WorkflowEngine } from '../../../../services/workflow/WorkflowEngine.js';
import { RunManager } from '../../../../services/workflow/RunManager.js';
import { InputValidationService } from '../../../../services/workflow/InputValidationService.js';
import { asString } from '../../../workflowUtils.js';
import { logger } from '../../../../utils/logger.js';
import { BadRequestError, ServiceUnavailableError, NotFoundError } from '../../../../types/errors.js';
import axios from 'axios';
import { BevoegdGezagGeometryService } from '../../../../services/external/BevoegdGezagGeometryService.js';
import { DSOLocationSearchService } from '../../../../services/external/DSOLocationSearchService.js';
import type { CanonicalDocument } from '../../../../contracts/types.js';
import type { ServiceContext } from '../../../../contracts/types.js';
import { discoveredDocumentToCanonicalDraft } from '../../../../services/workflow/legacyToCanonicalConverter.js';
import { getCanonicalDocumentService } from '../../../../services/canonical/CanonicalDocumentService.js';

/**
 * Validate bevoegd gezag code format
 * 
 * Validates that the code matches expected patterns before attempting to fetch geometry.
 * This prevents unnecessary API calls and provides better error messages.
 * 
 * @param code - Bevoegd gezag code to validate
 * @param bestuurslaag - Optional bestuurslaag to validate against
 * @returns Validation result with error message and expected format if invalid
 */
export function validateBevoegdGezagCodeFormat(
    code: string,
    bestuurslaag?: 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK'
): { valid: boolean; error?: string; expectedFormat?: string } {
    const normalized = code.toLowerCase().trim();
    
    // Check if it's empty or just whitespace
    if (!normalized || normalized.length === 0) {
        return {
            valid: false,
            error: 'Code is empty',
            expectedFormat: 'gm####, pv##, ws###, or rk### (e.g., gm0106, pv30)'
        };
    }
    
    // Infer bestuurslaag from code if not provided
    let inferredBestuurslaag: 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK';
    if (normalized.startsWith('gm')) {
        inferredBestuurslaag = 'GEMEENTE';
    } else if (normalized.startsWith('pv')) {
        inferredBestuurslaag = 'PROVINCIE';
    } else if (normalized.startsWith('ws')) {
        inferredBestuurslaag = 'WATERSCHAP';
    } else if (normalized.startsWith('rk')) {
        inferredBestuurslaag = 'RIJK';
    } else if (/^\d{4}$/.test(normalized)) {
        inferredBestuurslaag = 'GEMEENTE';
    } else if (/^\d{2}$/.test(normalized)) {
        inferredBestuurslaag = 'PROVINCIE';
    } else {
        inferredBestuurslaag = 'GEMEENTE'; // Default
    }
    
    const effectiveBestuurslaag = bestuurslaag || inferredBestuurslaag;
    
    // Validate format based on bestuurslaag
    if (effectiveBestuurslaag === 'GEMEENTE') {
        // Municipality: gm#### or #### (2-4 digits, will be padded to 4)
        // Accept gm##, gm###, gm####, or ##, ###, ####
        if (!/^(gm\d{2,4}|\d{2,4})$/.test(normalized)) {
            return {
                valid: false,
                error: 'Invalid municipality code format',
                expectedFormat: 'gm#### or #### (e.g., gm0106 or 0106). Codes 10-99 should be padded to 4 digits (e.g., gm59 -> gm0059)'
            };
        }
    } else if (effectiveBestuurslaag === 'PROVINCIE') {
        // Province: pv## or ## (2 digits)
        if (!/^(pv\d{2}|\d{2})$/.test(normalized)) {
            return {
                valid: false,
                error: 'Invalid province code format',
                expectedFormat: 'pv## or ## (e.g., pv30 or 30)'
            };
        }
    } else if (effectiveBestuurslaag === 'WATERSCHAP') {
        // Waterschap: ws### or ### (3 digits)
        if (!/^(ws\d{3}|\d{3})$/.test(normalized)) {
            return {
                valid: false,
                error: 'Invalid waterschap code format',
                expectedFormat: 'ws### or ### (e.g., ws015 or 015)'
            };
        }
    } else if (effectiveBestuurslaag === 'RIJK') {
        // Rijk: rk### or ### (3 digits)
        if (!/^(rk\d{3}|\d{3})$/.test(normalized)) {
            return {
                valid: false,
                error: 'Invalid rijk code format',
                expectedFormat: 'rk### or ### (e.g., rk001 or 001)'
            };
        }
    }
    
    // Additional validation: ensure code contains only valid characters
    if (!/^[a-z]{0,2}\d{2,4}$/.test(normalized)) {
        return {
            valid: false,
            error: 'Code contains invalid characters',
            expectedFormat: 'Format: [prefix][digits] where prefix is gm, pv, ws, or rk'
        };
    }
    
    return { valid: true };
}

/**
 * Register DSO geometry-based document search action
 * 
 * @param workflowEngine - Workflow engine instance
 * @param runManager - Run manager instance
 * @param options - Optional service dependencies for dependency injection (for testing)
 */
export function registerGeometryDocumentAction(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
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
     * Fetch DSO Documents by Geometry
     * 
     * Fetches all DSO documents for any bevoegd gezag (municipality, province, waterschap, rijk)
     * using geometry-based search with exhaustive pagination.
     * 
     * This action:
     * 1. Attempts to retrieve geometry from database
     * 2. If not present, fetches from PDOK (for GEMEENTE, PROVINCIE) or DSO (for WATERSCHAP, RIJK)
     * 3. Persists the retrieved geometry for future use
     * 4. Uses geometry to query DSO Ontsluiten v2 API with exhaustive pagination
     * 5. Returns all relevant documents
     * 
     * @param params - Workflow parameters
     * @param params.bevoegdgezagCode - Required: Bevoegd gezag code (e.g., "gm0106", "pv30", "ws15", "rk001")
     * @param params.geldigOp - Optional: Validity date filter (YYYY-MM-DD format, defaults to today)
     * @param params.bestuurslaag - Optional: Bestuurslaag filter (auto-inferred from code if not provided)
     * @param params.maxPages - Optional: Maximum pages to fetch (default: 100 pages = 20,000 documents)
     * @param params.forceRefreshGeometry - Optional: Force refresh geometry from external source (default: false)
     * @param params.naam - Optional: Bevoegd gezag name for database storage
     * @param params.mode - Optional: API mode ('preprod' | 'prod'), defaults to 'prod'
     * @param runId - Workflow run ID for logging
     * @returns Object containing discovered documents
     * @returns {CanonicalDocument[]} bevoegdgezagDocuments - Array of discovered DSO documents
     * @returns {number} totalFound - Total number of documents found
     * @returns {string} bevoegdgezagCode - Bevoegd gezag code used
     * @returns {string} geometrySource - Source of geometry ('database' | 'PDOK' | 'DSO')
     * 
     * @example
     * ```typescript
     * const result = await workflowEngine.execute('fetch_dso_documents_by_geometry', {
     *   bevoegdgezagCode: 'gm0106',
     *   geldigOp: '2026-02-06',
     * }, runId);
     * // Returns: { bevoegdgezagDocuments: [...], totalFound: 286, bevoegdgezagCode: 'gm0106', geometrySource: 'database' }
     * ```
     */
    workflowEngine.registerAction('fetch_dso_documents_by_geometry', async (params: Record<string, unknown>, runId: string) => {
        // Validate input parameters
        const validation = inputValidationService.validateWorkflowInput('fetch_dso_documents_by_geometry', params);
        if (!validation.valid) {
            const errorDetails = inputValidationService.formatErrorsForResponse(validation.errors);
            const errorMsg = inputValidationService.formatErrorsForLogging(validation.errors);
            await runManager.log(runId, `Parameter validatie mislukt: ${errorMsg}`, 'error');
            logger.warn({ action: 'fetch_dso_documents_by_geometry', errors: validation.errors }, 'Workflow action validation failed');
            throw new BadRequestError(`Parameter validation failed: ${errorDetails.message}`, {
                action: 'fetch_dso_documents_by_geometry',
                validationErrors: validation.errors
            });
        }

        const validatedParams = validation.sanitizedParams || params;

        // Extract parameters
        let bevoegdgezagCode = asString(validatedParams.bevoegdgezagCode);
        const overheidsinstantie = asString(validatedParams.overheidsinstantie);
        const geldigOp = asString(validatedParams.geldigOp) || new Date().toISOString().split('T')[0]; // Default to today
        const bestuurslaag = asString(validatedParams.bestuurslaag) as 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK' | undefined;
        const maxPages = typeof validatedParams.maxPages === 'number' ? validatedParams.maxPages : 100;
        const forceRefreshGeometry = validatedParams.forceRefreshGeometry === true;
        const naam = asString(validatedParams.naam) || overheidsinstantie;
        const mode = asString(validatedParams.mode) || 'prod';

        // If bevoegdgezagCode is not provided, try to determine it from overheidsinstantie
        if (!bevoegdgezagCode && overheidsinstantie) {
            await runManager.log(
                runId,
                `Attempting to determine bevoegdgezagCode from overheidsinstantie: "${overheidsinstantie}"`,
                'info'
            );

            try {
                // For municipalities, use GemeenteModel.findByName()
                if (!bestuurslaag || bestuurslaag === 'GEMEENTE') {
                    const { GemeenteModel } = await import('../../../../models/Gemeente.js');
                    
                    // Normalize municipality name: remove "Gemeente " prefix and trim
                    const normalizedName = overheidsinstantie
                        .replace(/^gemeente\s+/i, '')
                        .trim();
                    
                    // Try to find municipality by name
                    const gemeente = await GemeenteModel.findByName(normalizedName);
                    
                    if (gemeente && gemeente.municipalityCode) {
                        bevoegdgezagCode = gemeente.municipalityCode;
                        await runManager.log(
                            runId,
                            `Successfully determined bevoegdgezagCode "${bevoegdgezagCode}" from overheidsinstantie "${overheidsinstantie}" (normalized: "${normalizedName}")`,
                            'info'
                        );
                        logger.info(
                            {
                                runId,
                                overheidsinstantie,
                                normalizedName,
                                bevoegdgezagCode,
                                gemeenteNaam: gemeente.naam,
                            },
                            'Converted municipality name to bevoegdgezagCode for geometry-based DSO search'
                        );
                    } else {
                        await runManager.log(
                            runId,
                            `Could not find municipality for overheidsinstantie "${overheidsinstantie}" (normalized: "${normalizedName}") - geometry-based search will be skipped`,
                            'warn'
                        );
                        logger.warn(
                            {
                                runId,
                                overheidsinstantie,
                                normalizedName,
                                found: !!gemeente,
                                hasMunicipalityCode: gemeente ? !!gemeente.municipalityCode : false,
                            },
                            'Municipality not found or missing municipalityCode'
                        );
                    }
                } else {
                    // For other bestuurslagen (provincie, waterschap, rijk), we would need additional lookup logic
                    // For now, log that we cannot determine bevoegdgezagCode
                    await runManager.log(
                        runId,
                        `Cannot determine bevoegdgezagCode for bestuurslaag "${bestuurslaag}" from overheidsinstantie "${overheidsinstantie}" - geometry-based search will be skipped`,
                        'warn'
                    );
                    logger.warn(
                        {
                            runId,
                            overheidsinstantie,
                            bestuurslaag,
                        },
                        'Cannot determine bevoegdgezagCode for non-municipality bestuurslaag'
                    );
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                await runManager.log(
                    runId,
                    `Failed to lookup bevoegdgezagCode from overheidsinstantie "${overheidsinstantie}": ${errorMsg} - geometry-based search will be skipped`,
                    'warn'
                );
                logger.warn(
                    {
                        error,
                        runId,
                        overheidsinstantie,
                    },
                    'Failed to lookup bevoegdgezagCode from overheidsinstantie'
                );
            }
        }

        // If bevoegdgezagCode is still not available, return empty results instead of throwing
        if (!bevoegdgezagCode) {
            await runManager.log(
                runId,
                'bevoegdgezagCode is required for geometry-based DSO search. Neither bevoegdgezagCode nor overheidsinstantie (with valid lookup) was provided. Returning empty results.',
                'warn'
            );
            return {
                bevoegdgezagDocuments: [],
                totalFound: 0,
                bevoegdgezagCode: '',
                geometrySource: 'unknown' as const,
                error: 'bevoegdgezagCode is required. Provide either bevoegdgezagCode directly or overheidsinstantie (for municipalities) to enable geometry-based search.',
            };
        }

        // Normalize bevoegd gezag code before validation
        // This ensures codes like "gm363" are normalized to "gm0363" before validation
        // The normalization logic matches BevoegdGezagGeometryService.normalizeBevoegdGezagCode
        const effectiveBestuurslaag = bestuurslaag || (bevoegdgezagCode.toLowerCase().startsWith('gm') ? 'GEMEENTE' : 
                                                       bevoegdgezagCode.toLowerCase().startsWith('pv') ? 'PROVINCIE' :
                                                       bevoegdgezagCode.toLowerCase().startsWith('ws') ? 'WATERSCHAP' :
                                                       bevoegdgezagCode.toLowerCase().startsWith('rk') ? 'RIJK' : 'GEMEENTE');
        
        const cleaned = bevoegdgezagCode.toLowerCase().trim();
        let normalizedCode = bevoegdgezagCode;
        
        // If it starts with a prefix, pad the number part
        const prefixMatch = cleaned.match(/^(gm|pv|ws|rk)(\d+)$/);
        if (prefixMatch) {
            const prefix = prefixMatch[1]; // First capture group is the prefix
            const number = prefixMatch[2]; // Second capture group is the number
            
            // Pad based on prefix
            if (prefix === 'gm') {
                normalizedCode = `${prefix}${number.padStart(4, '0')}`;
            } else if (prefix === 'pv') {
                normalizedCode = `${prefix}${number.padStart(2, '0')}`;
            } else {
                normalizedCode = `${prefix}${number.padStart(3, '0')}`;
            }
        } else if (/^\d+$/.test(cleaned)) {
            // If it's just a number, pad based on bestuurslaag
            if (effectiveBestuurslaag === 'GEMEENTE') {
                normalizedCode = `gm${cleaned.padStart(4, '0')}`;
            } else if (effectiveBestuurslaag === 'PROVINCIE') {
                normalizedCode = `pv${cleaned.padStart(2, '0')}`;
            } else if (effectiveBestuurslaag === 'WATERSCHAP') {
                normalizedCode = `ws${cleaned.padStart(3, '0')}`;
            } else if (effectiveBestuurslaag === 'RIJK') {
                normalizedCode = `rk${cleaned.padStart(3, '0')}`;
            }
        }
        
        if (normalizedCode !== bevoegdgezagCode) {
            await runManager.log(
                runId,
                `Normalized bevoegdgezagCode from "${bevoegdgezagCode}" to "${normalizedCode}"`,
                'info'
            );
            bevoegdgezagCode = normalizedCode;
        }

        // Validate bevoegd gezag code format before attempting to fetch geometry
        // This prevents unnecessary API calls and provides better error messages
        const codeValidation = validateBevoegdGezagCodeFormat(bevoegdgezagCode, bestuurslaag);
        if (!codeValidation.valid) {
            const errorMessage = `Invalid bevoegd gezag code format: ${codeValidation.error}. Expected format: ${codeValidation.expectedFormat}`;
            await runManager.log(
                runId,
                `Invalid bevoegd gezag code format for ${bevoegdgezagCode}: ${codeValidation.error}. Expected: ${codeValidation.expectedFormat}`,
                'error'
            );
            logger.warn({ bevoegdgezagCode, error: codeValidation.error, expectedFormat: codeValidation.expectedFormat }, 'Invalid bevoegd gezag code format');
            
            // Return empty results instead of throwing - workflow can continue without geometry
            return {
                bevoegdgezagDocuments: [],
                totalFound: 0,
                bevoegdgezagCode,
                geometrySource: 'unknown' as const,
                error: errorMessage,
            };
        }

        await runManager.log(
            runId,
            `DSO documenten ophalen op basis van geometrie voor bevoegd gezag: ${bevoegdgezagCode} (exhaustive pagination)`,
            'info'
        );

        // Validate DSO API configuration
        const { getDeploymentConfig } = await import('../../../../config/deployment.js');
        let dsoConfigured: boolean;
        let errorMessage: string;
        try {
            const config = getDeploymentConfig();
            dsoConfigured = !!config.dso.apiKey;
            errorMessage = `DSO API is not configured. Please set DSO_API_KEY (or legacy DSO_${mode === 'prod' ? 'PROD' : 'PREPROD'}_KEY) environment variable to use DSO geometry-based document fetching (mode: ${mode}).`;
        } catch {
            const envVarName = mode === 'prod' ? 'DSO_PROD_KEY' : 'DSO_PREPROD_KEY';
            dsoConfigured = !!process.env[envVarName] || !!process.env.DSO_API_KEY;
            errorMessage = `DSO API is not configured. Please set ${envVarName} environment variable to use DSO geometry-based document fetching (mode: ${mode}).`;
        }

        if (!dsoConfigured) {
            await runManager.log(runId, `DSO Locatie Zoeken: FOUT - ${errorMessage}`, 'error');
            logger.error({ mode }, 'DSO API not configured for geometry-based document fetching');
            throw new ServiceUnavailableError(errorMessage, {
                action: 'fetch_dso_documents_by_geometry',
                runId,
                mode,
                reason: 'dso_api_not_configured'
            });
        }

        try {
            // Step 1: Get geometry (from DB or fetch from PDOK/DSO)
            const geometryService = new BevoegdGezagGeometryService(mode === 'prod');
            
            await runManager.log(
                runId,
                `Geometrie ophalen voor bevoegd gezag: ${bevoegdgezagCode}${forceRefreshGeometry ? ' (force refresh)' : ''}`,
                'info'
            );

            const geometryResult = await geometryService.getBevoegdGezagGeometry(bevoegdgezagCode, {
                forceRefresh: forceRefreshGeometry,
                bestuurslaag,
                naam,
            });

            await runManager.log(
                runId,
                `Geometrie opgehaald van ${geometryResult.geometrySource} voor ${bevoegdgezagCode} (${geometryResult.bestuurslaag})`,
                'info'
            );

            // Step 2: Use geometry to search documents via DSO Ontsluiten v2 API
            const locationSearchService = new DSOLocationSearchService(mode === 'prod');
            
            await runManager.log(
                runId,
                `Zoeken naar documenten met geometrie (${geometryResult.geometry.type}) voor ${bevoegdgezagCode}`,
                'info'
            );

            const searchResult = await locationSearchService.searchAllByGeometry(
                geometryResult.geometry,
                bevoegdgezagCode,
                {
                    bestuurslaag: geometryResult.bestuurslaag,
                    geldigOp,
                    maxPages,
                }
            );

            await runManager.log(
                runId,
                `${searchResult.documents.length} documenten gevonden voor ${bevoegdgezagCode} (${searchResult.totalFound} totaal voor filtering)`,
                searchResult.documents.length === 0 ? 'warn' : 'info'
            );

            // Step 3: Convert DiscoveredDocuments to CanonicalDocuments and store them
            const documentService = getCanonicalDocumentService();
            const canonicalDocuments: CanonicalDocument[] = [];
            const context = params as Record<string, unknown>;
            const effectiveQueryId = (context.queryId as string | undefined);

            for (const discoveredDoc of searchResult.documents) {
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

            // Store in context (metadata only to prevent 16MB BSON limit)
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            const { storeDocumentsInContext } = await import('../documentContextHelpers.js');
            storeDocumentsInContext(context, 'dsoGeometry', canonicalDocuments);

            // Return rawDocumentsBySource in result so updateContext merges it into
            // the real workflow context. Direct mutations on `context` (which is a
            // shallow copy of the workflow context) are lost after the step finishes.
            return {
                bevoegdgezagDocuments: canonicalDocuments,
                totalFound: searchResult.totalFound,
                bevoegdgezagCode,
                geometrySource: geometryResult.geometrySource,
                bestuurslaag: geometryResult.bestuurslaag,
                geometryIdentificatie: geometryResult.geometryIdentificatie,
                rawDocumentsBySource: context.rawDocumentsBySource,
            };
        } catch (error) {
            // Enhanced error logging with full context
            const errorContext = {
                error,
                runId,
                bevoegdgezagCode,
                bestuurslaag,
                errorType: error instanceof Error ? error.constructor.name : typeof error,
                errorMessage: error instanceof Error ? error.message : String(error),
                errorDetails: error instanceof BadRequestError ? (error as any).details : undefined,
                stack: error instanceof Error ? error.stack : undefined,
            };

            logger.error(errorContext, 'Error in fetch_dso_documents_by_geometry');

            // Provide user-friendly error messages
            let userMessage = `Mislukt documenten op te halen voor ${bevoegdgezagCode}`;
            
            if (error instanceof BadRequestError) {
                const details = (error as any).details;
                if (details?.reason === 'unsupported_bestuurslaag_mvp' || details?.reason === 'pdok_not_supported') {
                    userMessage = error.message; // Use the clear error message from service
                    await runManager.log(
                        runId,
                        `Geometry fetch failed: ${userMessage}`,
                        'error'
                    );
                    // Re-throw with clear message for unsupported types
                    throw new BadRequestError(userMessage, {
                        ...details,
                        bevoegdgezagCode,
                        action: 'fetch_dso_documents_by_geometry',
                    });
                } else {
                    userMessage = `Invalid request for ${bevoegdgezagCode}: ${error.message}`;
                    await runManager.log(
                        runId,
                        `Invalid request: ${userMessage}`,
                        'error'
                    );
                    throw error;
                }
            } else if (error instanceof NotFoundError) {
                userMessage = `Geometry not found for ${bevoegdgezagCode}. Please verify the bevoegd gezag code is correct.`;
                await runManager.log(
                    runId,
                    `Geometry not found: ${userMessage}`,
                    'error'
                );
                // Return empty results instead of breaking workflow
                return {
                    bevoegdgezagDocuments: [],
                    totalFound: 0,
                    bevoegdgezagCode,
                    geometrySource: 'unknown' as const,
                    error: userMessage,
                };
            } else if (error instanceof ServiceUnavailableError) {
                userMessage = `Service unavailable while fetching geometry for ${bevoegdgezagCode}: ${error.message}`;
                await runManager.log(
                    runId,
                    `Service unavailable: ${userMessage}`,
                    'error'
                );
                throw error;
            } else if (axios.isAxiosError(error) && error.response?.status === 422) {
                // 422 Unprocessable Entity - DSO API rejected the geometry
                const responseData = error.response.data;
                const responseMessage = typeof responseData === 'object' && responseData !== null
                    ? JSON.stringify(responseData, null, 2)
                    : String(responseData);
                
                // Extract error message from response if available
                let apiErrorMessage = 'DSO API rejected the geometry (422 Unprocessable Entity)';
                if (typeof responseData === 'object' && responseData !== null) {
                    const data = responseData as Record<string, unknown>;
                    if (data.message) {
                        apiErrorMessage = String(data.message);
                    } else if (data.error) {
                        apiErrorMessage = String(data.error);
                    } else if (data.detail) {
                        apiErrorMessage = String(data.detail);
                    }
                }
                
                userMessage = `DSO API rejected geometry for ${bevoegdgezagCode}: ${apiErrorMessage}. This may indicate invalid coordinates, unclosed polygon, or geometry format issue.`;
                
                await runManager.log(
                    runId,
                    `DSO API 422 error: ${userMessage}. Response: ${responseMessage}`,
                    'error'
                );
                
                logger.error({
                    bevoegdgezagCode,
                    geometrySource: 'unknown',
                    responseStatus: 422,
                    responseData,
                    responseMessage,
                }, 'DSO API returned 422 - geometry validation failed');
                
                // Return empty results instead of breaking workflow
                return {
                    bevoegdgezagDocuments: [],
                    totalFound: 0,
                    bevoegdgezagCode,
                    geometrySource: 'unknown' as const,
                    error: userMessage,
                    apiResponse: responseData,
                };
            } else {
                // Generic error - log and return empty results
                const errorMsg = error instanceof Error ? error.message : String(error);
                
                // Check if it's an Axios error for better logging
                if (axios.isAxiosError(error)) {
                    const status = error.response?.status;
                    const responseData = error.response?.data;
                    await runManager.log(
                        runId,
                        `Unexpected error fetching documents by geometry (HTTP ${status}): ${errorMsg}. Response: ${JSON.stringify(responseData)}`,
                        'error'
                    );
                    logger.error({
                        bevoegdgezagCode,
                        status,
                        responseData,
                        error: errorMsg,
                    }, 'DSO API request failed with unexpected error');
                } else {
                    await runManager.log(
                        runId,
                        `Unexpected error fetching documents by geometry: ${errorMsg}`,
                        'error'
                    );
                }
                
                // Return empty results instead of breaking workflow
                return {
                    bevoegdgezagDocuments: [],
                    totalFound: 0,
                    bevoegdgezagCode,
                    geometrySource: 'unknown' as const,
                    error: `Unexpected error: ${errorMsg}`,
                };
            }
        }
    });
}
