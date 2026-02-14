/**
 * Common Crawl workflow actions
 * 
 * Contains actions for:
 * - Step 8: search_common_crawl_optional - Optional Common Crawl deep discovery
 */

import { WorkflowEngine } from '../../../services/workflow/WorkflowEngine.js';
import { RunManager } from '../../../services/workflow/RunManager.js';
import { WebsiteScraper } from '../../../services/scraping/websiteScraper.js';
import { shouldRunCommonCrawlDiscoveryFromContext, discoverDomainsFromCommonCrawl } from '../../../services/workflow/CommonCrawlDiscoveryService.js';
import { getQueryPersistenceService, type QueryPersistenceService } from '../../../services/workflow/QueryPersistenceService.js';
import { InputValidationService } from '../../../services/workflow/InputValidationService.js';
import { asString } from '../../workflowUtils.js';
import { logger } from '../../../utils/logger.js';
import { BadRequestError, ServiceUnavailableError } from '../../../types/errors.js';
import type { ScrapedDocument } from '../../../services/infrastructure/types.js';
import { mapLegacyParams } from '../../../utils/workflowParamMapping.js';
import { getCappedMaxResults, logPerformanceCap } from '../../../utils/performanceConfig.js';
import { GemeenteBeleidAdapter } from '../../../adapters/gemeente/GemeenteBeleidAdapter.js';
import type { ServiceContext, CanonicalDocument } from '../../../contracts/types.js';
import { isE2EFixturesEnabled } from '../../../config/featureFlags.js';
import { extractNavigationNodeTitle } from '../../../utils/navigationGraphUtils.js';

/**
 * Options for dependency injection in registerCommonCrawlActions
 */
export interface CommonCrawlActionsOptions {
    queryPersistenceService?: QueryPersistenceService;
    inputValidationService?: typeof InputValidationService;
    websiteScraperClass?: typeof WebsiteScraper;
}

/**
 * Register Common Crawl-related workflow actions
 * 
 * @param workflowEngine - Workflow engine instance
 * @param runManager - Run manager instance
 * @param navigationGraph - Optional navigation graph instance for graph persistence
 * @param options - Optional service dependencies for dependency injection (for testing)
 */
export function registerCommonCrawlActions(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    navigationGraph?: import('../../../services/graphs/navigation/NavigationGraph.js').NavigationGraph | null,
    options?: CommonCrawlActionsOptions
): void {
    // Use injected services or fall back to default implementations
    const queryPersistenceService = options?.queryPersistenceService || getQueryPersistenceService();
    const inputValidationService = options?.inputValidationService || InputValidationService;
    const WebsiteScraperClass = options?.websiteScraperClass || WebsiteScraper;
    /**
     * Step 8: Search Common Crawl (Optional)
     * 
     * Performs optional deep discovery using Common Crawl dataset to find additional policy documents.
     * This step only runs if previous steps didn't find sufficient results or if explicitly enabled.
     * 
     * @param params - Workflow parameters
     * @param params.onderwerp - Required: Subject/topic for search (string, 1-500 chars)
     * @param params.thema - Optional: Theme/topic refinement (string, max 200 chars)
     * @param params.queryId - Optional: Existing query ID to link results (MongoDB ObjectId)
     * @param params.enableDeepScan - Optional: Whether to enable deep scan (boolean, default: false)
     * @param params.minResultsThreshold - Optional: Minimum results threshold to trigger scan (number, default: 10)
     * @param runId - Workflow run ID for logging
     * @returns Object containing discovered Common Crawl documents (if scan was performed)
     * @returns {CanonicalDocument[]} commonCrawlDocuments - Array of discovered documents from Common Crawl
     * 
     * @example
     * ```typescript
     * const result = await workflowEngine.execute('search_common_crawl_optional', {
     *   onderwerp: 'klimaatadaptatie',
     *   enableDeepScan: true
     * }, runId);
     * // Returns: { commonCrawlDocuments: [...] } or empty if scan was skipped
     * ```
     * 
     * @see {@link CommonCrawlDiscoveryService} - Service handling Common Crawl discovery
     * @see {@link QueryPersistenceService} - Service for persisting documents to database
     */
    workflowEngine.registerAction('search_common_crawl_optional', async (params: Record<string, unknown>, runId: string) => {
        // Map legacy parameter names to standardized names
        const mappedParams = mapLegacyParams(params, logger);
        
        // Validate input parameters with comprehensive validation including security checks
        const validation = inputValidationService.validateWorkflowInput('search_common_crawl_optional', mappedParams);
        if (!validation.valid) {
            const errorDetails = inputValidationService.formatErrorsForResponse(validation.errors);
            const errorMsg = inputValidationService.formatErrorsForLogging(validation.errors);
            await runManager.log(runId, `Parameter validatie mislukt: ${errorMsg}`, 'error');
            logger.warn({ action: 'search_common_crawl_optional', errors: validation.errors }, 'Workflow action validation failed');
            // Use custom error class per Error Handling Standard
            throw new BadRequestError(`Parameter validation failed: ${errorDetails.message}`, {
                action: 'search_common_crawl_optional',
                validationErrors: validation.errors
            });
        }
        
        const validatedParams = validation.sanitizedParams || params;
        const onderwerp = asString(validatedParams.onderwerp) || '';
        const thema = asString(validatedParams.thema) || '';
        const queryId = asString(validatedParams.queryId);
        const enableDeepScan = Boolean(validatedParams.enableDeepScan);
        const context = validatedParams as Record<string, unknown>;

        await runManager.log(
            runId,
            'Stap 8: Controleren of Common Crawl ontdekking moet draaien',
            'info'
        );

        try {
            // Check if should run using conditional execution logic
            const shouldRun = shouldRunCommonCrawlDiscoveryFromContext(
                context,
                enableDeepScan,
                {
                    minResultsThreshold: typeof validatedParams.minResultsThreshold === 'number' 
                        ? validatedParams.minResultsThreshold 
                        : 10
                }
            );

            if (!shouldRun) {
                await runManager.log(
                    runId,
                    'Common Crawl ontdekking overslaan (voldoende resultaten of niet ingeschakeld)',
                    'info'
                );
                // Store empty arrays in context
                if (!context.rawDocumentsBySource) {
                    context.rawDocumentsBySource = {};
                }
                (context.rawDocumentsBySource as Record<string, unknown>).commonCrawl = [];
                context.discoveredDomains = [];
                return { 
                    commonCrawlDocuments: [], 
                    discoveredDomains: [] 
                };
            }

            // Validate Common Crawl service availability
            const { ServiceConfigurationValidator } = await import('../../../services/workflow/ServiceConfigurationValidator.js');
            const serviceValidator = new ServiceConfigurationValidator();
            const commonCrawlStatus = serviceValidator.isServiceConfigured('commonCrawl');
            
            // Log service availability (Common Crawl is public, so it's typically always available)
            if (commonCrawlStatus) {
                await runManager.log(
                    runId,
                    'Stap 8: Common Crawl service is beschikbaar (publieke service)',
                    'info'
                );
            } else {
                await runManager.log(
                    runId,
                    'Stap 8: WAARSCHUWING - Common Crawl service validatie mislukt. Dit kan wijzen op netwerkconnectiviteitsproblemen.',
                    'warn'
                );
            }
            
            await runManager.log(
                runId,
                'Stap 8: Starten met optionele Common Crawl diepe ontdekking',
                'info'
            );

            // Fixture mode for E2E tests
            if (isE2EFixturesEnabled()) {
                logger.info({ action: 'search_common_crawl_optional', runId }, 'FEATURE_E2E_FIXTURES=true: Returning fixture Common Crawl documents');
                
                await runManager.log(
                    runId,
                    'Stap 8: Gebruik fixture Common Crawl documenten (FEATURE_E2E_FIXTURES=true)',
                    'info'
                );
                
                // Dynamic import to avoid runtime errors when tests directory is not available
                let createDocumentFixtures: () => { commonCrawl: ScrapedDocument[] };
                try {
                    // @ts-expect-error - tests directory is excluded from tsconfig.server.json, but fixtures are available at runtime
                    const fixturesModule = await import('../../../../tests/fixtures/workflow/documentFixtures.js');
                    createDocumentFixtures = fixturesModule.createDocumentFixtures;
                } catch (error) {
                    logger.error({ error }, 'Failed to load document fixtures, falling back to empty array');
                    return { commonCrawlDocuments: [] };
                }
                
                // Get fixture documents
                const fixtureData = createDocumentFixtures();
                const fixtureDocuments = fixtureData.commonCrawl;
                
                // Store in context
                if (!context.rawDocumentsBySource) {
                    context.rawDocumentsBySource = {};
                }
                (context.rawDocumentsBySource as Record<string, unknown>).commonCrawl = fixtureDocuments;
                context.discoveredDomains = [
                    { domain: 'fixture.example.com', urlCount: fixtureDocuments.length, relevanceScore: 0.8 }
                ];
                
            // For fixture mode, we don't process through canonical pipeline (fixtures are metadata-only)
            // Just create Query document if needed for workflow tracking
            const fixtureEffectiveQueryId = queryId || (context.queryId as string | undefined);
            if (fixtureDocuments.length > 0) {
                if (fixtureEffectiveQueryId) {
                    context.queryId = fixtureEffectiveQueryId;
                    await runManager.log(
                        runId,
                        `Stap 8: Gebruik fixture Common Crawl documenten (Query ID: ${fixtureEffectiveQueryId})`,
                        'info'
                    );
                } else if (onderwerp) {
                    // Create Query document for workflow tracking
                    const finalQueryId = await queryPersistenceService.createQuery(
                        {
                            onderwerp,
                            thema,
                        },
                        runId
                    );
                    
                    if (finalQueryId) {
                        context.queryId = finalQueryId;
                        await runManager.log(
                            runId,
                            `Stap 8: Gebruik fixture Common Crawl documenten en aangemaakt Query document (Query ID: ${finalQueryId})`,
                            'info'
                        );
                    }
                }
            }
            
            return {
                commonCrawlDocuments: fixtureDocuments,
                discoveredDomains: context.discoveredDomains as Array<{ domain: string; urlCount: number; relevanceScore: number }>
            };
        }

        // Get effective queryId once at the top of the function (reused throughout)
        const effectiveQueryId = queryId || (context.queryId as string | undefined);
        
        // Ensure queryId exists - create Query document if needed (Gap 2 fix)
        let finalEffectiveQueryId = effectiveQueryId;
        if (!finalEffectiveQueryId && onderwerp) {
            const createdQueryId = await queryPersistenceService.createQuery(
                {
                    onderwerp,
                    thema,
                },
                runId
            );
            if (createdQueryId) {
                finalEffectiveQueryId = createdQueryId;
                context.queryId = createdQueryId;
            }
        }

        // Discover domains from Common Crawl
        // Apply performance cap to queryLimit (step8: Common Crawl)
        const requestedQueryLimit = typeof validatedParams.queryLimit === 'number' ? validatedParams.queryLimit : undefined;
        const cappedQueryLimit = getCappedMaxResults(requestedQueryLimit, context, 'step8');
        logPerformanceCap('step8', requestedQueryLimit, cappedQueryLimit, runId);
        
        const domains = await discoverDomainsFromCommonCrawl(
            onderwerp,
            thema,
            undefined, // Use default service instance
            {
                maxDomains: typeof validatedParams.maxDomains === 'number' ? validatedParams.maxDomains : 5,
                filterAuthorityPatterns: typeof validatedParams.filterAuthorityPatterns === 'boolean' 
                    ? validatedParams.filterAuthorityPatterns 
                    : true,
                queryLimit: cappedQueryLimit,
                crawlId: asString(validatedParams.crawlId) || undefined
            }
        );

        await runManager.log(
            runId,
            `Stap 8: ${domains.length} domeinen ontdekt van Common Crawl`,
            'info'
        );

        // Scrape discovered domains (with guardrails)
        const documents: ScrapedDocument[] = [];
        const websiteScraper = new WebsiteScraperClass();
        const maxPagesPerDomain = typeof validatedParams.maxPagesPerDomain === 'number' ? validatedParams.maxPagesPerDomain : 2;
        const timeoutPerDomain = typeof validatedParams.timeoutPerDomain === 'number' ? validatedParams.timeoutPerDomain : 30000;

        for (const domainInfo of domains) {
            try {
                const domainUrl = domainInfo.domain.startsWith('http') 
                    ? domainInfo.domain 
                    : `https://${domainInfo.domain}`;

                await runManager.log(
                    runId,
                    `Domein scrapen: ${domainInfo.domain} (max ${maxPagesPerDomain} pagina's)`,
                    'info'
                );

                // Scrape with timeout and page limit
                const domainDocs = await Promise.race([
                    websiteScraper.scrapeWebsite(domainUrl, onderwerp, thema, maxPagesPerDomain),
                    new Promise<ScrapedDocument[]>((_, reject) => 
                        setTimeout(() => reject(new Error('Timeout')), timeoutPerDomain)
                    )
                ]);

                documents.push(...domainDocs);

                await runManager.log(
                    runId,
                    `${domainDocs.length} documenten geschraapt van ${domainInfo.domain}`,
                    'info'
                );
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                const isTimeout = errorMsg === 'Timeout' || errorMsg.includes('timeout');
                const errorLevel = isTimeout ? 'warn' : 'error';
                const guidance = isTimeout 
                    ? 'Domain scraping timed out. Consider increasing timeoutPerDomain or reducing maxPagesPerDomain.'
                    : 'Domain scraping failed. Check network connectivity and domain accessibility.';
                
                await runManager.log(
                    runId,
                    `Fout bij scrapen domein ${domainInfo.domain}: ${errorMsg}. ${guidance}`,
                    errorLevel
                );
                logger[errorLevel](
                    { domain: domainInfo.domain, error: errorMsg, runId },
                    `Common Crawl: Error scraping domain - ${guidance}`
                );
                // Continue with other domains
            }
        }

        await runManager.log(
            runId,
            `Step 8: Common Crawl discovery complete: found ${documents.length} documents from ${domains.length} domains`,
            'info'
        );

        // Process discovered URLs through canonical pipeline using GemeenteBeleidAdapter
        const adapter = new GemeenteBeleidAdapter();
        
        // Use finalEffectiveQueryId (may have been created above)
            const workflowRunId = runId;
            
            const serviceContext: ServiceContext = {
                requestId: runId,
                ...(finalEffectiveQueryId && { queryId: finalEffectiveQueryId }),
                workflowRunId: runId,
                stepId: 'search-common-crawl-optional',
            };

            const canonicalDocuments: CanonicalDocument[] = [];
            const processedDocuments: CanonicalDocument[] = [];
            const documentMetadataMap = new Map<string, { statusCode?: number; contentType?: string }>();

            await runManager.log(
                runId,
                `🔄 Processing ${documents.length} discovered URLs through canonical pipeline`,
                'info'
            );

            // Process documents directly through canonical pipeline (no DiscoveredDocument conversion needed)
            for (const doc of documents) {
                if (!doc.url) {
                    logger.warn({ doc }, 'Document missing URL, skipping');
                    // Skip document if no URL (services now require CanonicalDocument)
                    continue;
                }

                try {
                    // Use adapter to discover (returns [url] for single URL)
                    const records = await adapter.discover(doc.url);
                    
                    if (records.length === 0) {
                        logger.warn({ url: doc.url, runId }, 'No records discovered from URL');
                        // Skip document if no records (services now require CanonicalDocument)
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
                    // Ensure queryId is set - create Query document if needed (Gap 2 fix)
                    if (effectiveQueryId) {
                        draft.enrichmentMetadata.queryId = effectiveQueryId;
                    } else if (onderwerp && !effectiveQueryId) {
                        // Create Query document if missing to ensure documents are linkable
                        const { getQueryPersistenceService } = await import('../../../services/workflow/QueryPersistenceService.js');
                        const queryPersistenceService = getQueryPersistenceService();
                        const createdQueryId = await queryPersistenceService.createQuery(
                            {
                                onderwerp,
                                thema,
                            },
                            runId
                        );
                        if (createdQueryId) {
                            draft.enrichmentMetadata.queryId = createdQueryId;
                            context.queryId = createdQueryId;
                        }
                    }
                    draft.enrichmentMetadata.workflowRunId = workflowRunId;
                    draft.enrichmentMetadata.stepId = 'search-common-crawl-optional';
                    
                    // Continue with extensions, validate, and persist
                    const extensions = adapter.extensions(extracted);

                    // Extract metadata from WebExtension if available
                    let extensionMetadata: { statusCode?: number; contentType?: string } = {};
                    const webExtension = extensions.find(e => e.type === 'web');
                    if (webExtension && webExtension.payload) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const payload = webExtension.payload as any;
                        if (payload.crawl) {
                            extensionMetadata = {
                                statusCode: payload.crawl.statusCode,
                                contentType: payload.crawl.contentType
                            };
                        }
                    }

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

                    // GemeenteBeleidAdapter returns CanonicalDocument directly
                    const documentId = persistResult._id ? persistResult._id.toString() : '';
                    if (!documentId) {
                        throw new ServiceUnavailableError('Document ID not found in persist result', {
                            action: 'search_common_crawl_optional',
                            runId
                        });
                    }

                    const document = await documentService.findById(documentId) as CanonicalDocument | null;
                    
                    if (!document) {
                        throw new ServiceUnavailableError(`Document not found after persist: ${documentId}`, {
                            action: 'search_common_crawl_optional',
                            runId,
                            documentId
                        });
                    }
                    
                    // Store metadata for navigation graph
                    documentMetadataMap.set(document._id.toString(), extensionMetadata);

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
                    // Skip failed documents (they can't be processed through canonical pipeline)
                    // Logged error above, continue with next document
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

                        const metadata = documentMetadataMap.get(doc._id.toString()) || {};
                        let domain = '';
                        try {
                            domain = new URL(doc.canonicalUrl).hostname;
                        } catch {
                            // Ignore invalid URL
                        }

                        // Determine content type
                        let contentType: 'html' | 'pdf' | 'xml' | 'json' | 'other' = 'other';
                        if (metadata.contentType) {
                            const ct = metadata.contentType.toLowerCase();
                            if (ct.includes('html')) contentType = 'html';
                            else if (ct.includes('pdf')) contentType = 'pdf';
                            else if (ct.includes('xml')) contentType = 'xml';
                            else if (ct.includes('json')) contentType = 'json';
                        } else if (doc.format) {
                            if (doc.format === 'Web') contentType = 'html';
                            else if (doc.format === 'PDF') contentType = 'pdf';
                            else if (doc.format === 'XML') contentType = 'xml';
                            else if (doc.format === 'JSON') contentType = 'json';
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
                            siteId: domain || undefined, // Use domain as siteId
                            domain: domain || undefined,
                            httpStatus: metadata.statusCode || 200, // Default to 200 if not found (successful processing implies accessibility)
                            hash: doc.contentFingerprint,
                        };

                        const addResult = await navigationGraph.addNode(newNode, { runId, workflowId });
                        if (addResult === 'added' || addResult === 'updated') {
                            nodesAdded++;
                        }
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        logger.warn({ url: doc.canonicalUrl, error: errorMsg }, 'Failed to add Common Crawl document to navigation graph');
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
                            source: 'common-crawl',
                            validate: true,
                        });
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        logger.warn({ error: errorMsg, runId }, 'Failed to populate knowledge graph from Common Crawl documents');
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
                            `💾 Navigation graph saved: ${nodeCounts.total} total nodes after adding ${nodesAdded} Common Crawl documents`,
                            'info'
                        );
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        await runManager.log(runId, `Navigatiegrafiek opslaan mislukt: ${errorMsg}`, 'warn');
                        // Don't fail the workflow if graph save fails
                    }
                }
            }

            // Store in workflow context (only metadata to prevent 16MB BSON limit)
            const { storeDocumentsInContext } = await import('./documentContextHelpers.js');
            storeDocumentsInContext(context, 'commonCrawl', processedDocuments);
            context.discoveredDomains = domains.map(d => ({
                domain: d.domain,
                urlCount: d.urlCount,
                relevanceScore: d.relevanceScore
            }));

            // Documents are already persisted via canonical pipeline (GemeenteBeleidAdapter + AdapterOrchestrator)
            // Only create Query document if needed (for workflow tracking), but don't persist to brondocumenten
            let finalQueryId: string | null = null;
            // Use finalEffectiveQueryId (may have been created above)
            
            if (canonicalDocuments.length > 0) {
                if (finalEffectiveQueryId) {
                    // Query already exists, just set in context
                    finalQueryId = finalEffectiveQueryId;
                    context.queryId = finalQueryId;
                    
                    await runManager.log(
                        runId,
                        `Stap 8: ${canonicalDocuments.length} documenten verwerkt via canonical pipeline (Query ID: ${finalQueryId})`,
                        'info'
                    );
                } else if (onderwerp) {
                    // Create Query document for workflow tracking (documents already in canonical store)
                    finalQueryId = await queryPersistenceService.createQuery(
                        {
                            onderwerp,
                            thema,
                        },
                        runId
                    );
                    
                    if (finalQueryId) {
                        context.queryId = finalQueryId;
                        await runManager.log(
                            runId,
                            `Stap 8: ${canonicalDocuments.length} documenten verwerkt via canonical pipeline en Query document aangemaakt (Query ID: ${finalQueryId})`,
                            'info'
                        );
                    } else {
                        await runManager.log(
                            runId,
                            `Stap 8: ${canonicalDocuments.length} documenten verwerkt via canonical pipeline (WAARSCHUWING: Kon Query document niet aanmaken)`,
                            'warn'
                        );
                    }
                } else {
                    await runManager.log(
                        runId,
                        `Stap 8: ${canonicalDocuments.length} documenten verwerkt via canonical pipeline (geen Query document aangemaakt - geen queryId of onderwerp opgegeven)`,
                        'info'
                    );
                }
            }

            return {
                commonCrawlDocuments: processedDocuments,
                discoveredDomains: domains
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            const isNetworkError = errorMsg.includes('network') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ETIMEDOUT');
            const guidance = isNetworkError
                ? 'Network connectivity issue detected. Check internet connection and Common Crawl service status. Common Crawl is a public service and should be accessible.'
                : 'Common Crawl discovery failed. Check logs for details. This is an optional step, so workflow can continue.';
            
            await runManager.log(
                runId,
                `ERROR in Common Crawl discovery: ${errorMsg}. ${guidance}`,
                'error'
            );
            logger.error(
                { error: errorStack || errorMsg, runId, params, isNetworkError },
                `Common Crawl discovery error - ${guidance}`
            );

            // Store empty arrays in context on error
            const context = validatedParams as Record<string, unknown>;
            if (!context.rawDocumentsBySource) {
                context.rawDocumentsBySource = {};
            }
            (context.rawDocumentsBySource as Record<string, unknown>).commonCrawl = [];
            (context.rawDocumentsBySource as Record<string, unknown>).commonCrawlError = {
                error: errorMsg,
                guidance,
                timestamp: new Date().toISOString(),
            };
            context.discoveredDomains = [];

            return { 
                commonCrawlDocuments: [], 
                discoveredDomains: [] 
            };
        }
    });
}

