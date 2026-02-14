import type { WorkflowResultEndpoint } from '../../infrastructure/types.js';
import type { WorkflowOutput } from '../WorkflowOutputService.js';

/**
 * Builds workflow results from context data
 */
export class WorkflowResultsBuilder {
  /**
   * Normalize a document from various formats to WorkflowOutput document format
   */
  normalizeDocument(doc: unknown): WorkflowOutput['results']['documents'][0] | null {
    if (!doc || typeof doc !== 'object') {
      return null;
    }

    const docObj = doc as Record<string, unknown>;
    
    // Extract URL (try multiple possible fields)
    const url = String(
      docObj.url || 
      docObj.link || 
      docObj.documentUrl || 
      ''
    );
    
    if (!url) {
      return null; // Skip documents without URL
    }

    // Extract title (try multiple possible fields)
    const title = String(
      docObj.titel || 
      docObj.title || 
      docObj.name || 
      'Untitled'
    );

    // Extract type
    const type = String(
      docObj.type_document || 
      docObj.type || 
      docObj.documentType || 
      'unknown'
    );

    // Extract source URL
    const sourceUrl = String(
      docObj.website_url || 
      docObj.sourceUrl || 
      docObj.source || 
      ''
    );

    // Extract relevance score (try multiple possible fields)
    const relevanceScore = typeof docObj.relevanceScore === 'number' ? docObj.relevanceScore :
      typeof docObj.score === 'number' ? docObj.score :
      typeof docObj.authorityScore === 'number' ? docObj.authorityScore :
      undefined;

    // Extract discovered date
    const discoveredAt = docObj.discoveredAt ? 
      (typeof docObj.discoveredAt === 'string' ? docObj.discoveredAt : new Date(docObj.discoveredAt as Date).toISOString()) :
      new Date().toISOString();

    // Build metadata
    const metadata: Record<string, unknown> = {};
    if (docObj.samenvatting) metadata.samenvatting = String(docObj.samenvatting);
    if (docObj.publicatiedatum) metadata.publicatiedatum = String(docObj.publicatiedatum);
    if (docObj.summary) metadata.summary = String(docObj.summary);
    if (docObj.description) metadata.description = String(docObj.description);
    if (docObj.snippet) metadata.snippet = String(docObj.snippet);
    if (typeof docObj.existing === 'boolean') metadata.existing = docObj.existing;

    return {
      url,
      title,
      type,
      sourceUrl,
      relevanceScore,
      discoveredAt,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined
    };
  }

  /**
   * Build results from workflow context
   * Extracts documents from all possible sources in the workflow context
   */
  buildResults(context: Record<string, unknown>): WorkflowOutput['results'] {
    const webPages: WorkflowOutput['results']['webPages'] = [];
    const documents: WorkflowOutput['results']['documents'] = [];
    const endpoints: WorkflowResultEndpoint[] = [];
    const seenUrls = new Set<string>(); // For deduplication

    // Helper to add document if not already seen
    const addDocument = (doc: WorkflowOutput['results']['documents'][0] | null, addToEndpoints = true) => {
      if (!doc || seenUrls.has(doc.url)) {
        return;
      }
      seenUrls.add(doc.url);
      documents.push(doc);
      
      // Also add to endpoints (endpoints represent final relevant documents/links)
      if (addToEndpoints) {
        endpoints.push({
          url: doc.url,
          title: doc.title,
          type: doc.type,
          sourceUrl: doc.sourceUrl,
          relevanceScore: doc.relevanceScore
        });
      }
    };

    // 1. Extract from scoredDocuments (highest priority - these are the final ranked results)
    // These should definitely be in endpoints
    if (context.scoredDocuments && Array.isArray(context.scoredDocuments)) {
      for (const doc of context.scoredDocuments) {
        const normalized = this.normalizeDocument(doc);
        if (normalized) {
          addDocument(normalized, true);
        }
      }
    }

    // 2. Extract from documentsMerged (merged and scored documents)
    // These should also be in endpoints
    if (context.documentsMerged && Array.isArray(context.documentsMerged)) {
      for (const doc of context.documentsMerged) {
        const normalized = this.normalizeDocument(doc);
        if (normalized) {
          addDocument(normalized, true);
        }
      }
    }

    // 3. Extract from documentsCoreMerged (core merged documents)
    if (context.documentsCoreMerged && Array.isArray(context.documentsCoreMerged)) {
      for (const doc of context.documentsCoreMerged) {
        const normalized = this.normalizeDocument(doc);
        if (normalized) {
          addDocument(normalized, true);
        }
      }
    }

    // 4. Extract from documentsByCategory (categorized documents)
    // These are final categorized results, should be in endpoints
    if (context.documentsByCategory && typeof context.documentsByCategory === 'object') {
      const categories = context.documentsByCategory as Record<string, unknown>;
      for (const categoryDocs of Object.values(categories)) {
        if (Array.isArray(categoryDocs)) {
          for (const doc of categoryDocs) {
            const normalized = this.normalizeDocument(doc);
            if (normalized) {
              addDocument(normalized, true);
            }
          }
        }
      }
    }

    // 5. Extract from rawDocumentsBySource (all source-specific documents)
    // These are raw documents from various sources - include in documents but only add to endpoints if they have scores
    if (context.rawDocumentsBySource && typeof context.rawDocumentsBySource === 'object') {
      const rawDocs = context.rawDocumentsBySource as Record<string, unknown>;
      for (const sourceDocs of Object.values(rawDocs)) {
        if (Array.isArray(sourceDocs)) {
          for (const doc of sourceDocs) {
            const normalized = this.normalizeDocument(doc);
            if (normalized) {
              // Only add to endpoints if it has a relevance score (indicating it's a final result)
              addDocument(normalized, normalized.relevanceScore !== undefined);
            }
          }
        }
      }
    }

    // 6. Extract from IPLO documents (legacy support)
    if (context.iploDocuments && Array.isArray(context.iploDocuments)) {
      for (const doc of context.iploDocuments) {
        const normalized = this.normalizeDocument(doc);
        if (normalized) {
          addDocument(normalized, normalized.relevanceScore !== undefined);
        }
      }
    }

    // 7. Extract from Google documents
    if (context.googleDocuments && Array.isArray(context.googleDocuments)) {
      for (const doc of context.googleDocuments) {
        const normalized = this.normalizeDocument(doc);
        if (normalized) {
          // Override sourceUrl for Google documents
          normalized.sourceUrl = 'Google Search';
          addDocument(normalized, normalized.relevanceScore !== undefined);
        }
      }
    }

    // 8. Extract from known source documents
    if (context.knownSourceDocuments && Array.isArray(context.knownSourceDocuments)) {
      for (const doc of context.knownSourceDocuments) {
        const normalized = this.normalizeDocument(doc);
        if (normalized) {
          addDocument(normalized, normalized.relevanceScore !== undefined);
        }
      }
    }

    // 9. Extract from generic documents array
    if (context.documents && Array.isArray(context.documents)) {
      for (const doc of context.documents) {
        const normalized = this.normalizeDocument(doc);
        if (normalized) {
          addDocument(normalized, normalized.relevanceScore !== undefined);
        }
      }
    }

    // Extract from external links exploration results if available
    if (context['explore-external-links'] || context.explore_external_links) {
      const explorationResult = (context['explore-external-links'] || context.explore_external_links) as Record<string, unknown>;
      // Add exploration metrics to summary
      if (explorationResult && typeof explorationResult === 'object' && typeof explorationResult.addedCount === 'number' && explorationResult.addedCount > 0) {
        webPages.push({
          url: 'external-links-exploration',
          title: 'External Links Exploration',
          type: 'page',
          status: 'new',
          visitedAt: new Date().toISOString(),
          depth: 0
        });
      }
    }

    // Calculate summary
    const newCount = documents.filter(d => !d.metadata?.existing).length;
    const existingCount = documents.filter(d => d.metadata?.existing).length;

    // Extract exploration stats if available
    const exploreExternalLinks = context['explore-external-links'] || context.explore_external_links;
    const explorationStats = (exploreExternalLinks && typeof exploreExternalLinks === 'object' && 'explorationStats' in exploreExternalLinks) 
      ? (exploreExternalLinks as Record<string, unknown>).explorationStats 
      : undefined;

    // Type guard for exploration stats
    const hasExplorationStats = explorationStats && typeof explorationStats === 'object' && 
      'processedCount' in explorationStats;

    const baseSummary = {
      totalPages: webPages.length,
      totalDocuments: documents.length,
      newlyDiscovered: newCount,
      existing: existingCount,
      errors: 0
    };

    // Add exploration metrics if available
    if (hasExplorationStats) {
      const stats = explorationStats as Record<string, unknown>;
      return {
        summary: {
          ...baseSummary,
          externalLinksProcessed: typeof stats.processedCount === 'number' ? stats.processedCount : undefined,
          externalLinksCollected: typeof stats.totalCollected === 'number' ? stats.totalCollected : undefined,
          iploPagesScanned: typeof stats.iploPagesScanned === 'number' ? stats.iploPagesScanned : undefined,
          failedPages: typeof stats.failedPages === 'number' ? stats.failedPages : undefined,
          filteredLinks: typeof stats.filteredLinksCount === 'number' ? stats.filteredLinksCount : undefined
        },
        webPages,
        documents,
        endpoints
      };
    }

    return {
      summary: baseSummary,
      webPages,
      documents,
      endpoints
    };
  }
}



