/**
 * Exploration-related workflow actions
 * 
 * Contains actions for:
 * - explore_discovered_websites - Explore discovered websites and add to graph
 * - scrape_horst_municipality - Scrape Horst aan de Maas municipality website
 */

import { WorkflowEngine } from '../../../services/workflow/WorkflowEngine.js';
import { RunManager } from '../../../services/workflow/RunManager.js';
import { NavigationGraph, type NavigationNode } from '../../../services/graphs/navigation/NavigationGraph.js';
import { GraphClusteringService } from '../../../services/graphs/navigation/GraphClusteringService.js';
import { ScrapedDocument } from '../../../services/infrastructure/types.js';
import { asString, asStringArray } from '../../workflowUtils.js';
import { logger } from '../../../utils/logger.js';
import { GemeenteBeleidAdapter } from '../../../adapters/gemeente/GemeenteBeleidAdapter.js';
import { SemanticSimilarityService } from '../../../services/semantic/SemanticSimilarityService.js';
import { withTimeout } from '../../../utils/withTimeout.js';
import { pLimit } from '../../../utils/concurrency.js';
import type { ServiceContext, CanonicalDocument } from '../../../contracts/types.js';
import { ServiceUnavailableError } from '../../../types/errors.js';
import { extractNavigationNodeTitle } from '../../../utils/navigationGraphUtils.js';

/**
 * Create a function to get graph and clustering service
 * This is a factory function that creates a closure over the navigation graph instance
 */
function createGetGraphFunction(
    navigationGraph: NavigationGraph | null
): () => Promise<{ graph: NavigationGraph; clusteringService: GraphClusteringService }> {
    let clusteringService: GraphClusteringService | null = navigationGraph 
        ? new GraphClusteringService(navigationGraph)
        : null;

    // Register clustering service cache invalidator with the graph
    if (navigationGraph && clusteringService) {
        navigationGraph.registerClusteringServiceInvalidator(() => {
            clusteringService?.invalidateCache();
        });
    }

    return async () => {
        // Graph MUST be provided via dependency injection (already initialized with Neo4j)
        if (!navigationGraph) {
            throw new ServiceUnavailableError('NavigationGraph must be initialized with Neo4j driver. Neo4j connection is required.', {
                service: 'Neo4j',
                reason: 'neo4j_not_available'
            });
        }
        // Initialize clustering service if not already done
        if (!clusteringService) {
            clusteringService = new GraphClusteringService(navigationGraph);
            // Register invalidator when service is created
            navigationGraph.registerClusteringServiceInvalidator(() => {
                clusteringService?.invalidateCache();
            });
        }
        return { graph: navigationGraph, clusteringService };
    };
}

/**
 * Register exploration-related workflow actions
 * 
 * @param workflowEngine - Workflow engine instance
 * @param runManager - Run manager instance
 * @param navigationGraph - Optional NavigationGraph instance
 */
export function registerExplorationActions(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    navigationGraph?: NavigationGraph | null
): void {
    const getGraph = createGetGraphFunction(navigationGraph || null);

    // explore_discovered_websites - Explore discovered websites and add to graph
    workflowEngine.registerAction('explore_discovered_websites', async (params, runId) => {
        const websiteUrls = asStringArray(params.websiteUrls) ?? [];
        const { graph } = await getGraph();
        const context = params as Record<string, unknown>;
        const workflowId = context.workflowId as string | undefined;
        
        await runManager.log(runId, `${websiteUrls.length} ontdekte websites verkennen`, 'info');
        
        // Stream node updates
        const streamNodeUpdate = async (node: NavigationNode) => {
            try {
                const updateUrl = `http://localhost:${process.env.PORT || 4000}/api/graph/stream/${runId}/update`;
                try {
                    await fetch(updateUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ node })
                    });
                } catch (fetchError) {
                    logger.warn({ error: fetchError instanceof Error ? fetchError.message : String(fetchError), runId }, 'Could not stream graph update');
                }
            } catch (error) {
                logger.warn({ error, runId }, 'Error streaming graph update');
            }
        };
        
        // For now, add websites to graph as nodes
        // In a real implementation, we'd scrape these websites
        for (const url of websiteUrls) {
            try {
                const node: NavigationNode = {
                    url,
                    type: 'page',
                    title: extractNavigationNodeTitle({ canonicalUrl: url }, url),
                    children: [],
                    lastVisited: new Date().toISOString()
                };
                
                await graph.addNode(node, { runId, workflowId });
                
                // Stream update
                await streamNodeUpdate({
                    url: node.url,
                    type: node.type,
                    title: node.title,
                    children: node.children
                });
                
                // Small delay to show real-time effect
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.warn({ url, error: errorMsg }, 'Failed to add website to navigation graph (missing title)');
                // Continue with other URLs
            }
        }
        
        await runManager.log(runId, `${websiteUrls.length} websites toegevoegd aan grafiek`, 'info');
        
        // Ensure graph is saved after adding nodes
        if (websiteUrls.length > 0) {
            try {
                await graph.save();
                const nodeCounts = await graph.getNodeCount();
                await runManager.log(runId, `Navigatiegrafiek opgeslagen: ${nodeCounts.total} totaal nodes na verkennen websites`, 'info');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                await runManager.log(runId, `Navigatiegrafiek opslaan mislukt: ${errorMsg}`, 'warn');
                // Don't fail the workflow if graph save fails
            }
        }
        
        return { websitesExplored: websiteUrls.length };
    });

    // scrape_horst_municipality - Scrape Horst aan de Maas municipality website
    workflowEngine.registerAction('scrape_horst_municipality', async (params, runId) => {
        const onderwerp = asString(params.onderwerp) ?? 'arbeidsmigranten';
        const thema = asString(params.thema) ?? onderwerp;
        const queryId = asString(params.queryId);
        const { graph } = await getGraph();
        const context = params as Record<string, unknown>;
        const workflowId = context.workflowId as string | undefined;
        
        await runManager.log(runId, `Horst aan de Maas gemeente scrape starten voor onderwerp: ${onderwerp}`, 'info');
        
        // Import scrapers and select appropriate one based on topic
        const { 
            HorstAanDeMaasScraper,
            HorstAanDeMaasArbeidsmigrantenScraper,
            HorstAanDeMaasEnergietransitieScraper
        } = await import('../../../services/scrapers/index.js');
        
        // Select specialized scraper based on topic
        const onderwerpLower = onderwerp.toLowerCase();
        let scraper: {
            scrape: (onderwerp: string, query: string, thema: string) => Promise<ScrapedDocument[]>;
        };
        
        if (onderwerpLower.includes('arbeid')) {
            scraper = new HorstAanDeMaasArbeidsmigrantenScraper();
            await runManager.log(runId, 'Gespecialiseerde Arbeidsmigranten scraper gebruiken', 'info');
        } else if (onderwerpLower.includes('energie')) {
            scraper = new HorstAanDeMaasEnergietransitieScraper();
            await runManager.log(runId, 'Gespecialiseerde Energietransitie scraper gebruiken', 'info');
        } else {
            scraper = new HorstAanDeMaasScraper();
            await runManager.log(runId, 'Basis Horst aan de Maas scraper gebruiken', 'info');
        }
        
        // Scrape municipality website
        const documents = await scraper.scrape(onderwerp, onderwerp, thema);
        
        await runManager.log(runId, `${documents.length} documenten gevonden van Horst aan de Maas gemeente`, 'info');
        
        // Add semantic similarity scores (embeddings) to capture synonyms/semantic overlap
        if (documents.length > 0) {
            const semanticService = new SemanticSimilarityService();
            const SEMANTIC_SIMILARITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes for all documents

            await runManager.log(runId, `Zoeken naar vergelijkbare documenten voor ${documents.length} documenten...`, 'info');

            try {
                await withTimeout(
                    semanticService.addSemanticSimilarity(documents, onderwerp),
                    SEMANTIC_SIMILARITY_TIMEOUT_MS,
                    `Adding semantic similarity to ${documents.length} documents`
                );
                await runManager.log(runId, 'Vergelijkbare documenten gevonden', 'info');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                await runManager.log(runId, `Zoeken naar vergelijkbare documenten mislukt: ${errorMsg}. Doorgaan zonder vergelijking.`, 'warn');
            }
        }

        // Process documents through adapter pipeline for persistence and enrichment
        const adapter = new GemeenteBeleidAdapter();
        const canonicalDocuments: CanonicalDocument[] = [];
        let processedCount = 0;
        let failedCount = 0;
        
        if (documents.length > 0) {
            await runManager.log(
                runId,
                `Verwerken van ${documents.length} documenten via canonical pipeline`,
                'info'
            );
            
            const limit = pLimit(5); // Limit concurrency to avoid overloading the adapter/database
            const results = await Promise.allSettled(documents.map((doc: ScrapedDocument) => limit(async () => {
                try {
                    // Create service context
                    const ctx: ServiceContext = {
                        requestId: runId,
                        queryId: queryId,
                        workflowRunId: runId,
                    };
                    
                    // Use adapter to discover (returns [url] for single URL)
                    const records = await adapter.discover(doc.url);
                    
                    if (records.length === 0) {
                        logger.warn({ url: doc.url, runId }, 'No records discovered from URL');
                        failedCount++;
                        return;
                    }
                    
                    // Process first record through pipeline
                    const record = records[0];
                    
                    // Execute pipeline: acquire, extract, map, validate, persist
                    const artifactBundle = await adapter.acquire(record) as Buffer;
                    const extracted = await adapter.extract(artifactBundle);
                    const draft = adapter.map(extracted);
                    
                    // Set enrichmentMetadata.queryId and workflowRunId before persist
                    if (!draft.enrichmentMetadata) {
                        draft.enrichmentMetadata = {};
                    }
                    if (queryId) {
                        draft.enrichmentMetadata.queryId = queryId;
                    }
                    draft.enrichmentMetadata.workflowRunId = runId;
                    
                    // Continue with extensions, validate, and persist
                    const extensions = adapter.extensions(extracted);
                    adapter.validate(draft);
                    
                    const ctxWithData = {
                        ...ctx,
                        artifactBuffer: artifactBundle,
                        extractedData: extracted,
                    };
                    
                    const document = await adapter.persist(draft, extensions, ctxWithData) as CanonicalDocument;
                    
                    if (!document) {
                        throw new ServiceUnavailableError('Document not found after persist', {
                            action: 'scrape_horst_municipality',
                            runId
                        });
                    }
                    
                    // Store canonical document
                    canonicalDocuments.push(document);
                    processedCount++;
                    
                    try {
                        await runManager.log(
                            runId,
                            `Document verwerkt: ${document.title} (ID: ${document._id})`,
                            'info'
                        );
                    } catch (logError) {
                        // Log locally if runManager fails — do not rethrow to avoid double-counting
                        logger.error({ logError, runId }, 'Failed to log success to runManager');
                    }
                } catch (error) {
                    logger.error({ error, url: doc.url, runId }, 'Failed to process document through canonical pipeline');
                    try {
                        await runManager.log(
                            runId,
                            `Verwerken mislukt: ${doc.url} - ${error instanceof Error ? error.message : String(error)}`,
                            'error'
                        );
                    } catch (logError) {
                        // Log locally if runManager fails
                        logger.error({ logError, runId }, 'Failed to log error to runManager');
                    }
                    failedCount++;
                    // Continue with next document
                }
            })));

            // Check for unhandled rejections from Promise.allSettled
            for (const result of results) {
                if (result.status === 'rejected') {
                    logger.error({ error: result.reason, runId }, 'Unhandled promise rejection during concurrent document processing');
                    failedCount++;
                }
            }
            
            await runManager.log(
                runId,
                `Documentverwerking voltooid: ${processedCount} opgeslagen, ${failedCount} mislukt`,
                'info'
            );
        }
        
        // Add documents to navigation graph from CanonicalDocuments (after processing, so we have full metadata)
        if (canonicalDocuments.length > 0) {
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

                    await graph.addNode({
                        url: url,
                        type: canonicalDoc.documentType === 'Webpagina' ? 'page' : 'document',
                        title: extractNavigationNodeTitle(canonicalDoc, url),
                        content: content, // Store content for semantic search
                        children: [],
                        lastVisited: new Date().toISOString(),
                        sourceUrl: 'https://www.horstaandemaas.nl',
                        // Additional metadata from CanonicalDocument
                        documentType: canonicalDoc.documentType,
                        publishedAt: canonicalDoc.dates?.publishedAt?.toISOString(),
                        publisherAuthority: canonicalDoc.publisherAuthority,
                        summary: summary
                    }, { runId, workflowId });
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.warn({ documentId: canonicalDoc._id, error: errorMsg }, 'Failed to add Horst document to navigation graph');
                }
            }
        }
        
        // Populate knowledge graph from CanonicalDocument[] using WorkflowDocumentToKGService
        if (canonicalDocuments.length > 0) {
            try {
                // Use helper function for standardized KG integration
                const { populateKnowledgeGraphFromDocuments } = await import('./helpers/knowledgeGraphIntegration.js');
                await populateKnowledgeGraphFromDocuments(canonicalDocuments, runManager, {
                    workflowRunId: runId,
                    workflowId: workflowId,
                    source: 'explore-discovered-websites',
                    validate: true,
                });
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.warn({ error: errorMsg, runId }, 'Failed to populate knowledge graph from explored websites');
                await runManager.log(runId, `Waarschuwing: Kennisgrafiek kon niet worden gevuld: ${errorMsg}`, 'warn');
                // Don't fail the workflow if KG population fails
            }
        }
        
        // Populate knowledge graph with scraped documents
        if (documents.length > 0) {
            try {
                const { GraphManager } = await import('../../../services/scraping/GraphManager.js');
                const { RelationshipExtractionService } = await import('../../../services/extraction/RelationshipExtractionService.js');
                const { FeatureFlag } = await import('../../../models/FeatureFlag.js');
                
                // Initialize relationship extraction service if enabled
                // Note: EntityExtractionService is no longer needed - GraphManager uses PolicyParser internally
                const relationshipExtractionService = FeatureFlag.isRelationshipExtractionEnabled()
                    ? new RelationshipExtractionService()
                    : undefined;
                
                const graphManager = new GraphManager(
                    graph,
                    relationshipExtractionService
                );
                
                // Populate knowledge graph with workflow context for provenance
                await graphManager.populateKnowledgeGraph(documents, {
                    workflowRunId: runId,
                    workflowId: workflowId,
                    source: 'horst-municipality'
                });
                
                await runManager.log(runId, `Kennisgrafiek gevuld met entiteiten uit ${documents.length} documenten`, 'info');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.warn({ error, runId }, 'Failed to populate knowledge graph');
                await runManager.log(runId, `Waarschuwing: Kennisgrafiek kon niet worden gevuld: ${errorMsg}`, 'warn');
                // Don't fail the workflow if KG population fails
            }
        }
        
        // Ensure graph is saved after adding nodes
        if (documents.length > 0) {
            try {
                await graph.save();
                const nodeCounts = await graph.getNodeCount();
                await runManager.log(runId, `Navigatiegrafiek opgeslagen: ${nodeCounts.total} totaal nodes na toevoegen Horst documenten`, 'info');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                await runManager.log(runId, `Navigatiegrafiek opslaan mislukt: ${errorMsg}`, 'warn');
                // Don't fail the workflow if graph save fails
            }
        }
        
        return { 
            horstDocuments: documents,
            horstUrls: documents.map((d: ScrapedDocument) => d.url),
            canonicalDocuments: canonicalDocuments,
            processedCount,
            failedCount
        };
    });
}

