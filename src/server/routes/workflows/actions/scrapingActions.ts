/**
 * Scraping workflow actions
 * 
 * Contains actions for:
 * - Step 4: scan_known_sources - Scan selected websites
 * 
 * @deprecated Legacy scraping actions. Migrated to use canonical pipeline with GemeenteBeleidAdapter.
 */

import { WorkflowEngine } from '../../../services/workflow/WorkflowEngine.js';
import { RunManager } from '../../../services/workflow/RunManager.js';
import { BronWebsite } from '../../../models/BronWebsite.js';
import { InputValidationService } from '../../../services/workflow/InputValidationService.js';
import { asString } from '../../workflowUtils.js';
import { logger } from '../../../utils/logger.js';
import { BadRequestError, ServiceUnavailableError, ExternalServiceError, AppError } from '../../../types/errors.js';
import { GemeenteBeleidAdapter } from '../../../adapters/gemeente/GemeenteBeleidAdapter.js';
import { Query } from '../../../models/Query.js';
import type { ServiceContext, CanonicalDocument } from '../../../contracts/types.js';
import { mapLegacyParams } from '../../../utils/workflowParamMapping.js';
import { isE2EFixturesEnabled } from '../../../config/featureFlags.js';
import type { CanonicalDocumentDraft } from '../../../contracts/types.js';
import { extractNavigationNodeTitle } from '../../../utils/navigationGraphUtils.js';

/**
 * Options for dependency injection in registerScrapingActions
 */
export interface ScrapingActionsOptions {
    inputValidationService?: typeof InputValidationService;
}

/**
 * Register scraping-related workflow actions
 * 
 * @param workflowEngine - Workflow engine instance
 * @param runManager - Run manager instance
 * @param options - Optional service dependencies for dependency injection (for testing)
 */
export function registerScrapingActions(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    navigationGraph?: import('../../../services/graphs/navigation/NavigationGraph.js').NavigationGraph | null,
    options?: ScrapingActionsOptions
): void {
    // Use injected services or fall back to default implementations
    const inputValidationService = options?.inputValidationService || InputValidationService;

    /**
     * Step 4: Scan Known Sources
     * 
     * Scrapes selected websites from the known sources database to discover policy documents.
     * This step allows users to select specific websites to scan for relevant documents.
     * 
     * @param params - Workflow parameters
     * @param params.selectedWebsites - Optional: Array of website IDs to scan (string[]). Required if websiteData not provided.
     * @param params.websiteData - Optional: Array of website objects for standalone execution. Required if selectedWebsites not provided. Each object should have: url (string), titel (string), and optionally label, samenvatting, etc.
     * @param params.onderwerp - Required: Subject/topic for search (string, 1-500 chars)
     * @param params.thema - Optional: Theme/topic refinement (string, max 200 chars)
     * @param params.overheidsinstantie - Optional: Government institution filter (string, max 200 chars)
     * @param params.overheidslaag - Optional: Government level filter (string, max 100 chars)
     * @param params.queryId - Optional: Existing query ID to link results (MongoDB ObjectId)
     * @param params.mockData - Optional: Mock data for standalone execution (object)
     * @param runId - Workflow run ID for logging
     * @returns Object containing canonical documents
     * @returns {CanonicalDocument[]} canonicalDocuments - Array of canonical documents
     * @returns {string|null} queryId - Query document ID if created
     * 
     * @example
     * ```typescript
     * // Using database (selectedWebsites)
     * const result = await workflowEngine.execute('scan_known_sources', {
     *   selectedWebsites: ['website-id-1', 'website-id-2'],
     *   onderwerp: 'klimaatadaptatie'
     * }, runId);
     * 
     * // Standalone execution (websiteData)
     * const result = await workflowEngine.execute('scan_known_sources', {
     *   websiteData: [
     *     { url: 'https://example.com', titel: 'Example Website' }
     *   ],
     *   onderwerp: 'klimaatadaptatie'
     * }, runId);
     * // Returns: { canonicalDocuments: [...], queryId: '...' }
     * ```
     * 
     * @see {@link GemeenteBeleidAdapter} - Adapter for municipal policy documents
     * @see {@link AdapterOrchestrator} - Orchestrator for canonical pipeline
     */
    workflowEngine.registerAction('scan_known_sources', async (params: Record<string, unknown>, runId: string) => {
        // Map legacy parameter names to standardized names
        const mappedParams = mapLegacyParams(params, logger);
        
        // Validate input parameters with comprehensive validation including security checks
        const validation = inputValidationService.validateWorkflowInput('scan_known_sources', mappedParams);
        if (!validation.valid) {
            const errorDetails = inputValidationService.formatErrorsForResponse(validation.errors);
            const errorMsg = inputValidationService.formatErrorsForLogging(validation.errors);
            await runManager.log(runId, `Parameter validatie mislukt: ${errorMsg}`, 'error');
            logger.warn({ action: 'scan_known_sources', errors: validation.errors }, 'Workflow action validation failed');
            // Use custom error class per Error Handling Standard
            throw new BadRequestError(`Parameter validation failed: ${errorDetails.message}`, {
                action: 'scan_known_sources',
                validationErrors: validation.errors
            });
        }
        
        const validatedParams = validation.sanitizedParams || mappedParams;
        // Extract special parameter (not part of standard params)
        const selectedWebsites = Array.isArray(validatedParams.selectedWebsites) ? validatedParams.selectedWebsites as string[] : [];
        const websiteData = Array.isArray(validatedParams.websiteData) ? validatedParams.websiteData as Array<{
            url: string;
            titel: string;
            label?: string;
            samenvatting?: string;
            'relevantie voor zoekopdracht'?: string;
            accepted?: boolean | null;
            subjects?: string[];
            themes?: string[];
            website_types?: string[];
        }> : undefined;
        const onderwerp = asString(validatedParams.onderwerp) || '';
        const thema = asString(validatedParams.thema) || '';
        const overheidsinstantie = asString(validatedParams.overheidsinstantie) || '';
        const overheidslaag = asString(validatedParams.overheidslaag) || '';
        const queryId = asString(validatedParams.queryId);
        const context = params as Record<string, unknown>;
        
        // Fixture mode for E2E tests
        if (isE2EFixturesEnabled()) {
            logger.info({ action: 'scan_known_sources', runId }, 'FEATURE_E2E_FIXTURES=true: Returning fixture scraped documents');
            
            await runManager.log(
                runId,
                'Stap 4: Gebruik fixture geschraapte documenten (FEATURE_E2E_FIXTURES=true)',
                'info'
            );
            
            // Create mock documents
            const mockDoc: CanonicalDocumentDraft = {
                source: 'Web',
                sourceId: 'fixture-doc-1',
                canonicalUrl: 'https://example.com/fixture-doc-1',
                title: 'Fixture Policy Document',
                documentFamily: 'Beleid',
                documentType: 'Beleidsnota',
                dates: {
                    publishedAt: new Date(),
                },
                fullText: 'This is a fixture document for E2E testing.',
                contentFingerprint: 'fixture-fingerprint-1',
                language: 'nl',
                artifactRefs: [],
                sourceMetadata: {
                    url: 'https://example.com/fixture-doc-1',
                },
                enrichmentMetadata: {
                    queryId: queryId || (context.queryId as string),
                    workflowRunId: runId,
                    stepId: 'scan-known-sources',
                },
                reviewStatus: 'pending_review'
            };

            // Persist mock document
            const { getCanonicalDocumentService } = await import('../../../services/canonical/CanonicalDocumentService.js');
            const documentService = getCanonicalDocumentService();
            const persistedDoc = await documentService.upsertBySourceId(mockDoc, { requestId: runId });

            // Update context
            const { storeDocumentsInContext, appendCanonicalDocumentsToContext } = await import('./documentContextHelpers.js');
            const canonicalDocuments = [persistedDoc as CanonicalDocument];
            appendCanonicalDocumentsToContext(context, canonicalDocuments);
            storeDocumentsInContext(context, 'knownSources', canonicalDocuments);

            await runManager.log(
                runId,
                'Stap 4: Fixture modus ingeschakeld - lege resultaten teruggeven (gebruik canonical pipeline voor productie)',
                'info'
            );
            
            return {
                canonicalDocuments: canonicalDocuments,
                queryId: queryId || (context.queryId as string | undefined) || null
            };
        }
        
        logger.debug({ 
            selectedWebsites: selectedWebsites.length,
            onderwerp,
            runId
        }, 'scan_known_sources action called');
        
        await runManager.log(runId, 'Bekende bronnen scannen (geselecteerde websites)...', 'info');
        
        if ((!selectedWebsites || selectedWebsites.length === 0) && (!websiteData || websiteData.length === 0)) {
            logger.debug({ runId }, 'No websites selected for scan_known_sources');
            await runManager.log(runId, 'Geen websites geselecteerd voor scraping', 'info');
            // Store empty array in context for consistency
            const context = params as Record<string, unknown>;
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            (context.rawDocumentsBySource as Record<string, unknown>).knownSources = [];
            // Return canonical format (consistent with normal return)
            // But include legacy format for backward compatibility (test expectations)
            return { 
                canonicalDocuments: [],
                queryId: queryId || null,
                knownSourceDocuments: [],
                discoveredDocuments: []
            };
        }
        
        logger.debug({ 
            count: selectedWebsites.length, 
            hasWebsiteData: !!websiteData,
            websiteDataCount: websiteData?.length || 0,
            runId 
        }, 'Processing websites for scan_known_sources');
        
        try {
            // Use provided websiteData if available (standalone execution), otherwise query database
            let websites: Array<{
                url: string;
                titel: string;
                label?: string;
                samenvatting?: string;
                'relevantie voor zoekopdracht'?: string;
                accepted?: boolean | null;
                subjects?: string[];
                themes?: string[];
                website_types?: string[];
            }>;
            
            if (websiteData && websiteData.length > 0) {
                // Use provided website data (standalone execution)
                await runManager.log(
                    runId,
                    `Stap 4: Gebruik geleverde websiteData voor standalone uitvoering (${websiteData.length} websites)`,
                    'info'
                );
                websites = websiteData;
            } else if (selectedWebsites && selectedWebsites.length > 0) {
                // Get website details from database using model
                const dbWebsites = await BronWebsite.findByIds(selectedWebsites as string[]);
                if (!dbWebsites || !Array.isArray(dbWebsites)) {
                    await runManager.log(
                        runId,
                        'Stap 4: WAARSCHUWING - BronWebsite.findByIds gaf ongeldig resultaat terug, gebruik lege array',
                        'warn'
                    );
                    websites = [];
                } else {
                    websites = dbWebsites.map(w => ({
                        url: w.url,
                        titel: w.titel,
                        label: w.label,
                        samenvatting: w.samenvatting,
                        'relevantie voor zoekopdracht': w['relevantie voor zoekopdracht'],
                        accepted: w.accepted,
                        subjects: w.subjects,
                        themes: w.themes,
                        website_types: w.website_types,
                    }));
                    await runManager.log(runId, `${websites.length} websites gevonden om te scrapen vanuit database`, 'info');
                }
            } else {
                // No websites provided
                await runManager.log(runId, 'Geen websites opgegeven (geen websiteData noch selectedWebsites)', 'info');
                websites = [];
            }
            
            if (websites.length === 0) {
                logger.debug({ runId }, 'No websites to scrape in scan_known_sources');
                await runManager.log(runId, 'Geen websites om te scrapen', 'info');
                // Store empty array in context for consistency
                if (!context.rawDocumentsBySource) {
                    context.rawDocumentsBySource = {};
                }
                (context.rawDocumentsBySource as Record<string, unknown>).knownSources = [];
                // Return canonical format
                return { 
                    canonicalDocuments: [],
                    queryId: null
                };
            }
            
            await runManager.log(runId, `${websites.length} websites verwerken met canonieke pipeline`, 'info');
            
            // Initialize canonical pipeline components
            const adapter = new GemeenteBeleidAdapter({ useLiveApi: true });
            
            // Get effective queryId and workflowRunId early for enrichmentMetadata
            const effectiveQueryId = queryId || (context.queryId as string | undefined);
            const workflowRunId = runId;
            
            // Collect canonical documents
            const canonicalDocuments: CanonicalDocument[] = [];
            
            // Process each website through canonical pipeline
            for (const website of websites) {
                try {
                    await runManager.log(
                        runId,
                        `🔍 Discovering documents from ${website.url} using GemeenteBeleidAdapter`,
                        'info'
                    );
                    
                    // Step 1: Discover document URLs from website using adapter
                    const discoveryInput = {
                        url: website.url,
                        titel: website.titel,
                        onderwerp,
                        thema
                    };
                    
                    const discoveredUrls = await adapter.discover(discoveryInput) as string[];
                    
                    if (discoveredUrls.length === 0) {
                        await runManager.log(runId, `Geen document-URLs ontdekt van ${website.url}`, 'warn');
                        continue;
                    }

                    await runManager.log(runId, `${discoveredUrls.length} document-URLs ontdekt van ${website.url}`, 'info');
                    
                    // Log effective query context for diagnosis
                    await runManager.log(
                        runId,
                        `Processing documents with context: effectiveQueryId=${effectiveQueryId}, workflowRunId=${workflowRunId}`,
                        'info'
                    );

                    // Step 2: Process each discovered URL through canonical pipeline
                    await runManager.log(
                        runId,
                        `Verwerken van ${discoveredUrls.length} documenten via canonical pipeline`,
                        'info'
                    );
                    
                    for (const docUrl of discoveredUrls) {
                        try {
                            // Create service context
                            const ctx: ServiceContext = {
                                requestId: runId,
                                ...(effectiveQueryId && { queryId: effectiveQueryId }),
                                workflowRunId: runId,
                                stepId: 'scan-known-sources',
                            };
                            
                            // Use adapter to discover (returns [url] for single URL)
                            const records = await adapter.discover(docUrl);
                            
                            if (records.length === 0) {
                                logger.warn({ url: docUrl, runId }, 'No records discovered from URL');
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
                            draft.enrichmentMetadata.stepId = 'scan-known-sources';
                            
                            // Continue with extensions, validate, and persist
                            const extensions = adapter.extensions(extracted);
                            adapter.validate(draft);
                            
                            const ctxWithData = {
                                ...ctx,
                                artifactBuffer: artifactBundle,
                                extractedData: extracted,
                            };
                            
                            await runManager.log(
                                runId,
                                `Persisting document: ${draft.title} with enrichmentMetadata: ${JSON.stringify(draft.enrichmentMetadata)}`,
                                'debug'
                            );

                            const document = await adapter.persist(draft, extensions, ctxWithData) as CanonicalDocument;
                            
                            if (!document) {
                                throw new ServiceUnavailableError('Document not found after persist', {
                                    action: 'scan_known_sources',
                                    runId
                                });
                            }
                            
                            // Store canonical document
                            canonicalDocuments.push(document);
                            
                            await runManager.log(
                                runId,
                                `Document verwerkt: ${document.title} (ID: ${document._id})`,
                                'info'
                            );
                        } catch (error) {
                            logger.error({ error, url: docUrl, runId }, 'Failed to process document through canonical pipeline');
                            await runManager.log(
                                runId,
                                `Verwerken mislukt: ${docUrl} - ${error instanceof Error ? error.message : String(error)}`,
                                'error'
                            );
                            // Continue with next document
                        }
                    }
                } catch (error) {
                    logger.error({ error, url: website.url, runId }, 'Failed to process website');
                    await runManager.log(
                        runId,
                        `Verwerken website mislukt: ${website.url} - ${error instanceof Error ? error.message : String(error)}`,
                        'error'
                    );
                    // Continue with next website
                }
            }
            
            await runManager.log(
                runId,
                `Totaal documenten verwerkt via canonical pipeline: ${canonicalDocuments.length}/${canonicalDocuments.length}`,
                'info'
            );

            // Add nodes to navigation graph and populate knowledge graph if available
            let nodesAdded = 0;
            if (navigationGraph && canonicalDocuments.length > 0) {
                const workflowId = context.workflowId as string | undefined;
                
                // Add nodes to navigation graph with enhanced metadata from CanonicalDocument
                for (const doc of canonicalDocuments) {
                    if (!doc.canonicalUrl) continue;
                    
                    try {
                        // Extract content from fullText (first 2000 chars for semantic search)
                        const content = doc.fullText 
                            ? doc.fullText.substring(0, 2000).trim()
                            : undefined;
                        
                        // Extract summary (first 500 chars) for display
                        const summary = doc.fullText
                            ? doc.fullText.substring(0, 500).trim()
                            : undefined;

                        // Extract structure-first fields
                        let contentType: 'html' | 'pdf' | 'xml' | 'json' | 'other' = 'other';
                        if (doc.format) {
                            const f = doc.format.toLowerCase();
                            if (f === 'web' || f === 'html') contentType = 'html';
                            else if (f === 'pdf') contentType = 'pdf';
                            else if (f === 'xml') contentType = 'xml';
                            else if (f === 'json' || f === 'geojson') contentType = 'json';
                        }

                        let domain: string | undefined;
                        let siteId: string | undefined;
                        try {
                            domain = new URL(doc.canonicalUrl).hostname;
                            // Derive short site identifier: strip 'www.' prefix, subdomains, and TLD.
                            // Handles multi-level TLDs like .co.uk, .gov.uk, .com.au etc.
                            const stripped = domain.replace(/^www\./, '');
                            const parts = stripped.split('.');
                            // Known second-level TLD components (country-code SLDs)
                            const secondLevelTlds = new Set(['co', 'com', 'gov', 'org', 'net', 'ac', 'edu']);
                            if (parts.length >= 3 && secondLevelTlds.has(parts[parts.length - 2])) {
                                // e.g. example.co.uk -> take the part before the two-part TLD
                                siteId = parts[parts.length - 3];
                            } else if (parts.length >= 2) {
                                // e.g. example.nl or sub.example.nl -> take the part before the TLD
                                siteId = parts[parts.length - 2];
                            } else {
                                siteId = stripped;
                            }
                        } catch (e) {
                            // Invalid URL, ignore domain extraction
                        }

                        const newNode = {
                            url: doc.canonicalUrl,
                            type: 'document' as const,
                            title: extractNavigationNodeTitle(doc, doc.canonicalUrl),
                            content: content, // Store content for semantic search
                            children: [],
                            lastVisited: new Date().toISOString(),
                            lastFetched: new Date().toISOString(), // Enhanced: structure-first metadata
                            sourceUrl: doc.canonicalUrl,
                            canonicalUrl: doc.canonicalUrl, // Enhanced: canonical URL
                            // Additional metadata from CanonicalDocument
                            documentType: doc.documentType,
                            publishedAt: doc.dates?.publishedAt?.toISOString(),
                            publisherAuthority: doc.publisherAuthority,
                            summary: summary,
                            // Enhanced structure-first fields
                            contentType: contentType,
                            siteId: siteId, // Best effort site identification derived from domain
                            domain: domain,
                            httpStatus: doc.httpStatus,
                            hash: doc.contentFingerprint,
                        };

                        const addResult = await navigationGraph.addNode(newNode, { runId, workflowId });
                        if (addResult === 'added' || addResult === 'updated') {
                            nodesAdded++;
                        }
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        logger.warn({ url: doc.canonicalUrl, error: errorMsg }, 'Failed to add scanned document to navigation graph');
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
                            source: 'known-sources',
                            validate: true,
                        });
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        logger.warn({ error: errorMsg, runId }, 'Failed to populate knowledge graph from scanned documents');
                        await runManager.log(runId, `Waarschuwing: Kennisgrafiek kon niet worden gevuld: ${errorMsg}`, 'warn');
                        // Don't fail the workflow if KG population fails
                    }
                }

                // Save graph if nodes were added
                if (nodesAdded > 0) {
                    try {
                        await navigationGraph.save();
                        const nodeCounts = await navigationGraph.getNodeCount();
                        await runManager.log(
                            runId,
                            `💾 Navigation graph saved: ${nodeCounts.total} total nodes after adding ${nodesAdded} scanned documents`,
                            'info'
                        );
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        await runManager.log(runId, `Navigatiegrafiek opslaan mislukt: ${errorMsg}`, 'warn');
                        // Don't fail the workflow if graph save fails
                    }
                }
            }
            
            // Store canonical documents in workflow context (only metadata to prevent 16MB BSON limit)
            const { storeDocumentsInContext, appendCanonicalDocumentsToContext } = await import('./documentContextHelpers.js');
            appendCanonicalDocumentsToContext(context, canonicalDocuments);
            storeDocumentsInContext(context, 'knownSources', canonicalDocuments);
            
            // Create Query document for workflow tracking if needed
            let finalQueryId: string | null = null;
            
            if (effectiveQueryId) {
                // Query already exists
                finalQueryId = effectiveQueryId;
                context.queryId = finalQueryId;
                await runManager.log(
                    runId,
                    `Stap 4: ${canonicalDocuments.length} documenten verwerkt via canonical pipeline (Query ID: ${finalQueryId})`,
                    'info'
                );
            } else if (onderwerp && canonicalDocuments.length > 0) {
                // Create Query document for workflow tracking
                try {
                    const queryDoc = await Query.create({
                        onderwerp: onderwerp.trim(),
                        overheidstype: overheidslaag || undefined,
                        overheidsinstantie: overheidsinstantie || undefined,
                        websiteTypes: [],
                        websiteUrls: [],
                    });
                    finalQueryId = queryDoc._id?.toString() || null;
                    
                    if (finalQueryId) {
                        context.queryId = finalQueryId;
                        await runManager.log(
                            runId,
                            `Stap 4: ${canonicalDocuments.length} documenten verwerkt via canonical pipeline en Query document aangemaakt (Query ID: ${finalQueryId})`,
                            'info'
                        );
                    }
                } catch (error) {
                    logger.error({ error, runId }, 'Failed to create Query document');
                    await runManager.log(
                        runId,
                        `Stap 4: ${canonicalDocuments.length} documenten verwerkt via canonical pipeline (WAARSCHUWING: Kon Query document niet aanmaken)`,
                        'warn'
                    );
                }
            }
            
            // Return canonical documents only
            return { 
                canonicalDocuments: canonicalDocuments,
                queryId: finalQueryId
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
                    onderwerp: validatedParams.onderwerp as string | undefined,
                    overheidsinstantie: validatedParams.overheidsinstantie as string | undefined,
                    overheidslaag: validatedParams.overheidslaag as string | undefined,
                    selectedWebsitesCount: Array.isArray(validatedParams.selectedWebsites) ? validatedParams.selectedWebsites.length : 0
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
                `Fout bij scannen bekende bronnen: ${errorMessage}`,
                'error'
            );

            await runManager.log(
                runId,
                `Stap 4: Foutdiagnose informatie: ${JSON.stringify(errorDiagnostic, null, 2)}`,
                'error',
                errorDiagnostic
            );

            if (errorStack) {
                await runManager.log(
                    runId,
                    `Stap 4: Fout stack trace: ${errorStack.substring(0, 1000)}`,
                    'error'
                );
            }

            // Log to application logger with full context
            logger.error({
                error,
                runId,
                params: {
                    onderwerp: validatedParams.onderwerp as string | undefined,
                    overheidsinstantie: validatedParams.overheidsinstantie as string | undefined,
                    overheidslaag: validatedParams.overheidslaag as string | undefined,
                    selectedWebsitesCount: Array.isArray(validatedParams.selectedWebsites) ? validatedParams.selectedWebsites.length : 0
                },
                errorDiagnostic
            }, 'Error in scan_known_sources');

            // For validation errors, re-throw to fail the workflow step (per Error Handling Standard)
            if (isValidationError) {
                throw error;
            }

            // Store error information in context for debugging
            const context = params as Record<string, unknown>;
            if (!context.canonicalDocuments) {
                context.canonicalDocuments = [];
            }
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            (context.rawDocumentsBySource as Record<string, unknown>).knownSources = [];
            (context.rawDocumentsBySource as Record<string, unknown>).knownSourcesError = {
                error: errorMessage,
                diagnostic: errorDiagnostic,
                timestamp: new Date().toISOString(),
                guidance: isNetworkError 
                    ? 'Network connectivity issue detected. Check internet connection and website availability.'
                    : isTimeoutError
                    ? 'Request timeout. Websites may be slow or unavailable. Workflow will continue with other sources.'
                    : isServiceError
                    ? 'Service unavailable. Check service configuration. Workflow will continue with other sources.'
                    : 'Website scraping failed. Check logs for details. Workflow will continue with other sources.'
            };
            
            // Return empty array (don't break workflow) - per Workflow Compensation Strategies
            // This is a read-only operation, so no compensation needed
            return { 
                canonicalDocuments: [],
                queryId: null
            };
        }
    });
}

