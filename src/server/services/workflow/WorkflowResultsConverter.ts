// ObjectId not used in this file
import { WorkflowOutput } from './WorkflowOutputService.js';
import { BronDocumentCreateInput, BronWebsiteCreateInput, BronDocumentDocument, BronWebsiteDocument } from '../../types/index.js';
import { BronWebsite } from '../../models/BronWebsite.js';
import { DocumentEmbeddingService } from '../ingestion/embeddings/DocumentEmbeddingService.js';
import { ScrapedDocument, DocumentType } from '../infrastructure/types.js';
import { logger } from '../../utils/logger.js';
import { getCanonicalDocumentService } from '../canonical/CanonicalDocumentService.js';
import { computeContentFingerprint } from '../../utils/fingerprints.js';
import type { CanonicalDocumentDraft, DocumentSource, DocumentFamily, ServiceContext } from '../../contracts/types.js';

/**
 * Normalization utilities for workflow results
 */
class ResultNormalizer {
    /**
     * Normalize title: trim, remove extra whitespace, handle special characters
     */
    static normalizeTitle(title: string | null | undefined): string {
        if (!title || typeof title !== 'string') {
            return 'Onbekend document';
        }
        
        return title
            .trim()
            .replace(/\s+/g, ' ') // Multiple spaces to single space
            .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
            .substring(0, 500); // Limit length
    }

    /**
     * Normalize URL: validate format, add protocol if missing
     */
    static normalizeUrl(url: string | null | undefined): string {
        if (!url || typeof url !== 'string') {
            return '';
        }

        const trimmed = url.trim();
        if (!trimmed) {
            return '';
        }

        // Add protocol if missing
        if (!trimmed.match(/^https?:\/\//)) {
            return `https://${trimmed}`;
        }

        return trimmed;
    }

    /**
     * Normalize date: parse and format consistently
     */
    static normalizeDate(date: string | Date | null | undefined): string | null {
        if (!date) {
            return null;
        }

        try {
            const dateObj = date instanceof Date ? date : new Date(date);
            if (isNaN(dateObj.getTime())) {
                return null;
            }
            return dateObj.toISOString().split('T')[0]; // YYYY-MM-DD format
        } catch {
            return null;
        }
    }

    /**
     * Normalize text field: trim, remove extra whitespace, limit length
     */
    static normalizeText(text: string | null | undefined, maxLength: number = 1000): string {
        if (!text || typeof text !== 'string') {
            return '';
        }

        return text
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .substring(0, maxLength);
    }

    /**
     * Normalize array: filter out empty/null values, remove duplicates
     */
    static normalizeArray<T>(arr: T[] | null | undefined): T[] {
        if (!Array.isArray(arr)) {
            return [];
        }

        return [...new Set(arr.filter(item => item != null && item !== ''))];
    }

    /**
     * Validate document schema
     */
    static validateDocument(doc: BronDocumentCreateInput): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!doc.titel || doc.titel.trim().length === 0) {
            errors.push('Title is required');
        }

        if (!doc.url || doc.url.trim().length === 0) {
            errors.push('URL is required');
        } else {
            try {
                new URL(doc.url);
            } catch {
                errors.push('URL format is invalid');
            }
        }

        if (doc.publicatiedatum && !this.normalizeDate(doc.publicatiedatum)) {
            errors.push('Publication date format is invalid');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

/**
 * Service to convert workflow outputs to canonical documents for display in Beleidsscan
 * 
 * ✅ **MIGRATED** - This service now uses CanonicalDocumentService internally.
 * 
 * **Migration Status:**
 * - ✅ `saveToDatabase()` now uses `CanonicalDocumentService.upsertBySourceId()`
 * - ✅ Documents are persisted to `canonical_documents` collection
 * - ✅ Maintains backward compatibility (same API, different implementation)
 * 
 * **Implementation Details:**
 * - WorkflowOutput documents (metadata-only) are converted to CanonicalDocumentDraft
 * - Uses summary/metadata as fallback fullText for discovered documents
 * - Documents are flagged with `isMetadataOnly: true` in enrichmentMetadata
 * - Documents should be enriched later to acquire full content
 * 
 * **Note on fullText:**
 * WorkflowOutput documents typically don't have fullText (metadata-only).
 * This service uses summary/metadata as fallback fullText. Documents should be enriched
 * later using adapters to acquire full content.
 * 
 * **Migration Reference:**
 * - WI-414: Backend Write Operations Migration
 * - See `docs/70-sprint-backlog/WI-414-backend-write-operations-migration.md`
 * 
 * @see WI-414: Backend Write Operations Migration
 */
export class WorkflowResultsConverter {
    
    /**
     * Convert workflow output documents to BronDocumentCreateInput format
     */
    convertToBronDocuments(
        output: WorkflowOutput,
        queryId: string
    ): BronDocumentCreateInput[] {
        const documents: BronDocumentCreateInput[] = [];

        // Convert documents from workflow results with normalization
        for (const doc of output.results.documents) {
            const normalizedDoc: BronDocumentCreateInput = {
                titel: ResultNormalizer.normalizeTitle(doc.title),
                url: ResultNormalizer.normalizeUrl(doc.url),
                website_url: ResultNormalizer.normalizeUrl(doc.sourceUrl),
                website_titel: this.extractWebsiteName(doc.sourceUrl),
                label: this.inferLabel(doc),
                samenvatting: ResultNormalizer.normalizeText(
                    (typeof doc.metadata?.samenvatting === 'string' ? doc.metadata.samenvatting : null) ||
                    `Document gevonden tijdens workflow: ${output.metadata.workflowName}`
                ),
                'relevantie voor zoekopdracht': ResultNormalizer.normalizeText(
                    this.generateRelevanceDescription(doc, output),
                    500
                ),
                type_document: ResultNormalizer.normalizeText(typeof doc.type === 'string' ? doc.type : 'onbekend', 50) || 'onbekend',
                publicatiedatum: ResultNormalizer.normalizeDate(
                    doc.metadata?.publicatiedatum as string | Date | null | undefined
                ),
                subjects: ResultNormalizer.normalizeArray(this.extractSubjects(doc)),
                themes: ResultNormalizer.normalizeArray(this.extractThemes(doc, output)),
                accepted: null, // Pending approval
                queryId
            };

            // Validate document schema
            const validation = ResultNormalizer.validateDocument(normalizedDoc);
            if (!validation.valid) {
                logger.warn({
                    url: normalizedDoc.url,
                    errors: validation.errors
                }, 'WorkflowResultsConverter: Document validation failed, skipping');
                continue;
            }

            documents.push(normalizedDoc);
        }

        // Also convert endpoints (final results) if they differ
        for (const endpoint of output.results.endpoints) {
            // Check if already added from documents
            if (documents.some(d => d.url === endpoint.url)) {
                continue;
            }

            const normalizedEndpoint: BronDocumentCreateInput = {
                titel: ResultNormalizer.normalizeTitle(endpoint.title),
                url: ResultNormalizer.normalizeUrl(endpoint.url),
                website_url: ResultNormalizer.normalizeUrl(endpoint.sourceUrl),
                website_titel: this.extractWebsiteName(endpoint.sourceUrl),
                label: 'endpoint',
                samenvatting: ResultNormalizer.normalizeText(
                    `Relevant eindpunt gevonden tijdens ${output.metadata.workflowName}`
                ),
                'relevantie voor zoekopdracht': ResultNormalizer.normalizeText(
                    `Geïdentificeerd als relevant eindpunt met ${endpoint.relevanceScore ? `score: ${endpoint.relevanceScore.toFixed(2)}` : 'hoge relevantie'}`,
                    500
                ),
                type_document: ResultNormalizer.normalizeText(endpoint.type, 50) || 'onbekend',
                publicatiedatum: null,
                subjects: [],
                themes: [],
                accepted: null,
                queryId
            };

            // Validate endpoint document
            const validation = ResultNormalizer.validateDocument(normalizedEndpoint);
            if (!validation.valid) {
                logger.warn({
                    url: normalizedEndpoint.url,
                    errors: validation.errors
                }, 'WorkflowResultsConverter: Endpoint validation failed, skipping');
                continue;
            }

            documents.push(normalizedEndpoint);
        }

        return documents;
    }

    /**
     * Convert workflow output web pages to potential BronWebsite suggestions
     */
    convertToBronWebsites(
        output: WorkflowOutput,
        queryId: string
    ): BronWebsiteCreateInput[] {
        const websites: BronWebsiteCreateInput[] = [];
        const seenDomains = new Set<string>();

        // Extract unique websites from pages visited
        for (const page of output.results.webPages) {
            const domain = this.extractDomain(page.url);
            if (seenDomains.has(domain)) continue;
            seenDomains.add(domain);

            websites.push({
                titel: this.extractWebsiteName(page.url),
                url: domain.startsWith('http') ? domain : `https://${domain}`,
                label: 'ontdekt',
                samenvatting: `Website ontdekt tijdens ${output.metadata.workflowName}`,
                'relevantie voor zoekopdracht': `Bevat relevante inhoud voor de workflow-zoekopdracht`,
                accepted: null,
                subjects: [],
                themes: [],
                website_types: [this.inferWebsiteType(domain)],
                queryId
            });
        }

        return websites;
    }

    /**
     * Convert WorkflowOutput document to CanonicalDocumentDraft
     * 
     * Handles the case where WorkflowOutput documents don't have fullText (metadata-only).
     * Uses summary/metadata as fallback fullText.
     */
    private convertWorkflowOutputToCanonicalDraft(
        doc: WorkflowOutput['results']['documents'][0],
        output: WorkflowOutput,
        queryId: string
    ): CanonicalDocumentDraft {
        // WorkflowOutput documents typically don't have fullText - use summary/metadata as fallback
        const fullText = 
            (typeof doc.metadata?.samenvatting === 'string' ? doc.metadata.samenvatting : null) ||
            `Document gevonden tijdens workflow: ${output.metadata.workflowName}` ||
            doc.title ||
            'No content available';

        // Compute content fingerprint
        const contentFingerprint = computeContentFingerprint(fullText);

        // Determine source (default to Web for workflow-discovered documents)
        const source: DocumentSource = 'Web';

        // Use URL as sourceId (stable identifier)
        const sourceId = doc.url;

        // Determine document family (default to Web)
        const documentFamily: DocumentFamily = 'Web';

        // Parse publication date if available
        let publishedAt: Date | undefined;
        if (doc.metadata?.publicatiedatum) {
            try {
                publishedAt = new Date(doc.metadata.publicatiedatum as string | Date);
                if (isNaN(publishedAt.getTime())) {
                    publishedAt = undefined;
                }
            } catch {
                // Invalid date, ignore
            }
        }

        // Build enrichment metadata
        const enrichmentMetadata: Record<string, unknown> = {
            queryId,
            workflowRunId: output.metadata.runId,
            workflowId: output.metadata.workflowId,
            workflowName: output.metadata.workflowName,
            relevanceScore: doc.relevanceScore,
            discoveredAt: doc.discoveredAt,
            sourceUrl: doc.sourceUrl,
            // Flag to indicate this is a metadata-only document (needs enrichment)
            isMetadataOnly: true,
        };

        // Add subjects and themes if available
        const subjects = this.extractSubjects(doc);
        const themes = this.extractThemes(doc, output);
        if (subjects.length > 0) enrichmentMetadata.subjects = subjects;
        if (themes.length > 0) enrichmentMetadata.themes = themes;

        return {
            source,
            sourceId,
            canonicalUrl: doc.url,
            title: ResultNormalizer.normalizeTitle(doc.title),
            publisherAuthority: this.extractWebsiteName(doc.sourceUrl),
            documentFamily,
            documentType: ResultNormalizer.normalizeText(typeof doc.type === 'string' ? doc.type : 'onbekend', 50) || 'onbekend',
            dates: {
                publishedAt,
            },
            fullText,
            contentFingerprint,
            language: 'nl', // Default to Dutch
            artifactRefs: [], // Empty for workflow-discovered documents
            sourceMetadata: {
                workflowRunId: output.metadata.runId,
                workflowId: output.metadata.workflowId,
                workflowName: output.metadata.workflowName,
                url: doc.url,
                sourceUrl: doc.sourceUrl,
                type: doc.type,
                discoveredAt: doc.discoveredAt,
                metadata: doc.metadata || {},
            },
            enrichmentMetadata: Object.keys(enrichmentMetadata).length > 0 ? enrichmentMetadata : undefined,
            // All workflow documents start with 'pending_review' status
            reviewStatus: 'pending_review',
        };
    }

    /**
     * Save workflow results to database as canonical documents
     * 
     * **Migration:** This method now uses CanonicalDocumentService instead of BronDocument.
     * Documents are persisted as canonical documents with proper structure.
     * 
     * **Note:** WorkflowOutput documents typically don't have fullText (metadata-only).
     * This method uses summary/metadata as fallback fullText. Documents should be enriched
     * later to acquire full content.
     * 
     * Documents are saved immediately, and embeddings are generated asynchronously in the background
     */
    async saveToDatabase(
        output: WorkflowOutput,
        queryId: string
    ): Promise<{
        documents: BronDocumentDocument[];
        websites: BronWebsiteDocument[];
    }> {
        // Convert workflow output documents to canonical drafts
        const canonicalDrafts: CanonicalDocumentDraft[] = [];
        for (const doc of output.results.documents) {
            try {
                const draft = this.convertWorkflowOutputToCanonicalDraft(doc, output, queryId);
                canonicalDrafts.push(draft);
            } catch (error) {
                logger.warn({ error, url: doc.url, queryId }, 'Failed to convert workflow document to canonical draft');
            }
        }

        // Also convert endpoints (final results) if they differ
        for (const endpoint of output.results.endpoints) {
            // Check if already added from documents
            if (canonicalDrafts.some(d => d.canonicalUrl === endpoint.url)) {
                continue;
            }

            try {
                // Convert endpoint to document format for canonical draft
                const endpointDoc: WorkflowOutput['results']['documents'][0] = {
                    url: endpoint.url,
                    title: endpoint.title,
                    type: endpoint.type || 'endpoint',
                    sourceUrl: endpoint.sourceUrl || endpoint.url,
                    relevanceScore: endpoint.relevanceScore,
                    discoveredAt: new Date().toISOString(),
                    metadata: {},
                };
                const draft = this.convertWorkflowOutputToCanonicalDraft(endpointDoc, output, queryId);
                canonicalDrafts.push(draft);
            } catch (error) {
                logger.warn({ error, url: endpoint.url, queryId }, 'Failed to convert workflow endpoint to canonical draft');
            }
        }

        // Persist documents using CanonicalDocumentService
        const canonicalService = getCanonicalDocumentService();
        const serviceContext: ServiceContext = {};
        
        const savedCanonicalDocuments: Array<{ _id: string; url: string; titel: string }> = [];
        const errors: Array<{ url: string; error: unknown }> = [];

        for (const draft of canonicalDrafts) {
            try {
                const saved = await canonicalService.upsertBySourceId(draft, serviceContext);
                savedCanonicalDocuments.push({
                    _id: saved._id,
                    url: saved.canonicalUrl || saved.sourceId,
                    titel: saved.title,
                });
            } catch (error) {
                const url = draft.canonicalUrl || draft.sourceId;
                logger.warn(
                    { error, url, source: draft.source, sourceId: draft.sourceId, queryId },
                    'Failed to persist workflow document to canonical_documents collection'
                );
                errors.push({ url: url || 'unknown', error });
            }
        }

        // Convert saved canonical documents to BronDocumentDocument format for backward compatibility
        // This maintains the return type while using canonical storage
        const savedDocuments: BronDocumentDocument[] = savedCanonicalDocuments.map(canonical => ({
            _id: canonical._id as any, // Type compatibility
            titel: canonical.titel,
            url: canonical.url,
            website_url: canonical.url,
            website_titel: '',
            label: 'workflow-result',
            samenvatting: '',
            'relevantie voor zoekopdracht': '',
            type_document: 'onbekend',
            publicatiedatum: null,
            subjects: [],
            themes: [],
            accepted: null,
            queryId: queryId as any,
            createdAt: new Date(),
            updatedAt: new Date(),
        }));

        // Save websites (still using BronWebsite for now - separate migration)
        const bronWebsites = this.convertToBronWebsites(output, queryId);
        const savedWebsites = bronWebsites.length > 0
            ? await BronWebsite.createMany(bronWebsites)
            : [];

        if (errors.length > 0) {
            logger.warn(
                {
                    queryId,
                    errorCount: errors.length,
                    successCount: savedCanonicalDocuments.length,
                    totalCount: canonicalDrafts.length,
                },
                'Some workflow documents failed to persist to canonical_documents collection'
            );
        }

        logger.info({ 
          queryId, 
          documentCount: savedCanonicalDocuments.length, 
          websiteCount: savedWebsites.length 
        }, 'WorkflowResultsConverter: Saved documents and websites to canonical_documents collection');

        // Generate embeddings asynchronously in background (don't await)
        // Note: This will need to be updated to work with canonical documents
        if (process.env.EMBEDDING_ENABLED === 'true' && savedDocuments.length > 0) {
            this.generateEmbeddingsAsync(savedDocuments, output);
        }

        return {
            documents: savedDocuments,
            websites: savedWebsites
        };
    }

    /**
     * Generate embeddings for saved documents asynchronously (fire and forget)
     * This method:
     * - Generates embedding for each document
     * - Updates MongoDB document with embedding
     * - Adds to VectorService for fast search
     * - Handles errors gracefully (log but don't fail)
     */
    private generateEmbeddingsAsync(
        savedDocuments: BronDocumentDocument[],
        output: WorkflowOutput
    ): void {
        // Only proceed if embedding is enabled
        if (process.env.EMBEDDING_ENABLED !== 'true') {
            return;
        }

        const embeddingService = new DocumentEmbeddingService();

        // Process each document in background
        for (const savedDoc of savedDocuments) {
            // Reconstruct ScrapedDocument from saved document and workflow output
            const scrapedDoc = this.reconstructScrapedDocument(savedDoc, output);

            // Generate embedding asynchronously (don't await)
            (async () => {
                try {
                    const docId = savedDoc._id?.toString();
                    if (!docId) {
                        logger.warn({ url: savedDoc.url }, 'Cannot generate embedding: document has no ID');
                        return;
                    }

                    // Generate embedding and store in VectorService
                    // Note: storeDocumentEmbedding now handles canonical document updates internally
                    await embeddingService.storeDocumentEmbedding(docId, scrapedDoc);

                    logger.debug({ docId, url: savedDoc.url }, 'Generated embedding for document');
                } catch (error) {
                    // Log error but don't fail the workflow
                    logger.error({ error, docId: savedDoc._id, url: savedDoc.url }, 'Failed to generate embedding for document');
                }
            })().catch(error => {
                // Catch any unhandled errors in the async function
                logger.error({ error, docId: savedDoc._id }, 'Unhandled error in embedding generation for document');
            });
        }
    }

    /**
     * Reconstruct ScrapedDocument from saved BronDocument and workflow output
     * This is needed because we need the original ScrapedDocument structure for embedding generation
     */
    private reconstructScrapedDocument(
        savedDoc: BronDocumentDocument,
        output: WorkflowOutput
    ): ScrapedDocument {
        // Try to find the original document in workflow output
        const originalDoc = output.results.documents.find(d => d.url === savedDoc.url);
        
        if (originalDoc) {
            // Use original document if available
            return {
                titel: originalDoc.title || savedDoc.titel,
                url: originalDoc.url,
                website_url: originalDoc.sourceUrl || savedDoc.website_url,
                website_titel: savedDoc.website_titel,
                samenvatting: (typeof originalDoc.metadata?.samenvatting === 'string' ? originalDoc.metadata.samenvatting : null) || savedDoc.samenvatting,
                type_document: (typeof originalDoc.type === 'string' ? originalDoc.type : savedDoc.type_document) as DocumentType,
                publicatiedatum: ResultNormalizer.normalizeDate(
                    (originalDoc.metadata?.publicatiedatum as string | Date | null | undefined) || savedDoc.publicatiedatum
                )
            };
        }

        // Fallback: reconstruct from saved document
        return {
            titel: savedDoc.titel,
            url: savedDoc.url,
            website_url: savedDoc.website_url,
            website_titel: savedDoc.website_titel,
            samenvatting: savedDoc.samenvatting,
            type_document: savedDoc.type_document as DocumentType,
            publicatiedatum: savedDoc.publicatiedatum || null
        };
    }

    /**
     * Extract website name from URL
     */
    private extractWebsiteName(url: string): string {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            
            // Common mappings
            if (hostname.includes('iplo.nl')) return 'IPLO - Informatiepunt Leefomgeving';
            if (hostname.includes('overheid.nl')) return 'Overheid.nl';
            if (hostname.includes('rijksoverheid.nl')) return 'Rijksoverheid';
            if (hostname.includes('wetten.overheid.nl')) return 'Wetten.overheid.nl';
            
            // Extract domain name without TLD
            const parts = hostname.replace('www.', '').split('.');
            return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        } catch {
            return 'Onbekende bron';
        }
    }

    /**
     * Extract domain from URL
     */
    private extractDomain(url: string): string {
        try {
            const urlObj = new URL(url);
            return `${urlObj.protocol}//${urlObj.hostname}`;
        } catch {
            return url;
        }
    }

    /**
     * Infer document label from document data
     */
    private inferLabel(doc: WorkflowOutput['results']['documents'][0]): string {
        const url = doc.url.toLowerCase();
        const title = doc.title.toLowerCase();

        if (url.includes('.pdf')) return 'pdf-document';
        if (url.includes('/regelgeving/') || title.includes('regeling')) return 'regelgeving';
        if (url.includes('/thema/')) return 'thema-informatie';
        if (url.includes('/nieuws/') || title.includes('nieuws')) return 'nieuwsbericht';
        if (url.includes('/handleiding/') || title.includes('handleiding')) return 'handleiding';
        if (url.includes('/informatie/') || title.includes('informatie')) return 'informatiedocument';
        if (doc.type === 'PDF') return 'pdf-document';
        
        return 'webpagina';
    }

    /**
     * Generate relevance description
     */
    private generateRelevanceDescription(
        doc: WorkflowOutput['results']['documents'][0],
        output: WorkflowOutput
    ): string {
        const parts: string[] = [];

        if (doc.relevanceScore !== undefined) {
            parts.push(`Relevantiescore: ${doc.relevanceScore.toFixed(2)}`);
        }

        parts.push(`Gevonden tijdens ${output.metadata.workflowName}`);

        if (output.parameters?.query) {
            parts.push(`Zoekopdracht: "${output.parameters.query}"`);
        }

        return parts.join('. ');
    }

    /**
     * Extract subjects from document
     */
    private extractSubjects(doc: WorkflowOutput['results']['documents'][0]): string[] {
        const subjects: string[] = [];
        const title = doc.title.toLowerCase();
        const url = doc.url.toLowerCase();

        // Common subjects based on URL/title
        if (title.includes('bodem') || url.includes('bodem')) subjects.push('bodem');
        if (title.includes('water') || url.includes('water')) subjects.push('water');
        if (title.includes('geluid') || url.includes('geluid')) subjects.push('geluid');
        if (title.includes('natuur') || url.includes('natuur')) subjects.push('natuur');
        if (title.includes('milieu') || url.includes('milieu')) subjects.push('milieu');
        if (title.includes('bouw') || url.includes('bouw')) subjects.push('bouwen');
        if (title.includes('klimaat') || url.includes('klimaat')) subjects.push('klimaat');

        return subjects;
    }

    /**
     * Extract themes from document and workflow
     */
    private extractThemes(
        doc: WorkflowOutput['results']['documents'][0],
        output: WorkflowOutput
    ): string[] {
        const themes: string[] = [];

        // Add workflow theme if available
        if (output.parameters?.theme && typeof output.parameters.theme === 'string') {
            themes.push(output.parameters.theme);
        }
        if (output.parameters?.thema && typeof output.parameters.thema === 'string') {
            themes.push(output.parameters.thema);
        }

        // Extract from URL path
        const urlMatch = doc.url.match(/\/thema\/([^/]+)/);
        if (urlMatch && urlMatch[1]) {
            themes.push(urlMatch[1]);
        }

        return [...new Set(themes)];
    }

    /**
     * Infer website type from domain
     */
    private inferWebsiteType(domain: string): string {
        const d = domain.toLowerCase();

        if (d.includes('gemeente')) return 'gemeente';
        if (d.includes('provincie')) return 'provincie';
        if (d.includes('waterschap')) return 'waterschap';
        if (d.includes('rijks') || d.includes('overheid.nl')) return 'rijk';
        if (d.includes('iplo') || d.includes('kenniscentrum') || d.includes('instituut')) return 'kennisinstituut';

        return 'overig';
    }
}

// Singleton instance
let converterInstance: WorkflowResultsConverter | null = null;

export function getWorkflowResultsConverter(): WorkflowResultsConverter {
    if (!converterInstance) {
        converterInstance = new WorkflowResultsConverter();
    }
    return converterInstance;
}


