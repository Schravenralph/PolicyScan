/**
 * GetResultsAction - Wizard step action for retrieving discovered documents
 * 
 * This action handles the `document-review` wizard step by:
 * - Retrieving documents from a completed workflow run
 * - Supporting fixture mode for deterministic E2E testing
 * - Extracting documents from various result structures
 * - Returning documents with metadata (title, url, source, score, category, etc.)
 * - Handling cases where run is not yet completed
 * 
 * The action is read-only and idempotent:
 * - Same input + same session state = same results
 * - Safe to call multiple times
 */

import { z } from 'zod';
import { getDB } from '../../../../config/database.js';
import { RunManager } from '../../../workflow/RunManager.js';
import type { Run } from '../../../infrastructure/types.js';
import type { WizardStepAction } from '../WizardStepAction.js';
import type { WizardSessionDocument } from '../../../../types/WizardSession.js';
import { logger } from '../../../../utils/logger.js';
import { isE2EFixturesEnabled } from '../../../../config/featureFlags.js';
import { BadRequestError, NotFoundError } from '../../../../types/errors.js';
import { buildDsoPublicUrl } from '../../../../utils/dsoUrlBuilder.js';

// Import schema from single source of truth
import { getResultsInputSchema as schemaFromDefinition } from '../../definitions/schemas.js';

/**
 * Input schema for GetResultsAction (re-exported from single source of truth)
 * @deprecated Use getResultsInputSchema from definitions/schemas.ts instead
 */
export const getResultsInputSchema = schemaFromDefinition;

/**
 * Input type for GetResultsAction
 */
export type GetResultsInput = z.infer<typeof getResultsInputSchema>;

/**
 * Rule structure for frontend display
 */
export interface GetResultsRule {
  identificatie: string;
  titel?: string;
  type?: string;
  areaIds?: string[];
  textId?: string;
}

/**
 * Activity structure for frontend display
 */
export interface GetResultsActivity {
  identificatie: string;
  naam?: string;
}

/**
 * Regulation area structure for frontend display
 */
export interface GetResultsRegulationArea {
  identificatie: string;
  naam?: string;
  ruleIds?: string[];
}

/**
 * Document structure returned by GetResultsAction
 */
export interface GetResultsDocument {
  url: string;
  title: string;
  titel?: string; // Alternative field name (Dutch)
  samenvatting?: string; // Summary (Dutch)
  source?: string; // Source website URL
  sourceUrl?: string; // Alternative field name
  website_url?: string; // Alternative field name
  website_titel?: string; // Source website title
  score?: number; // Relevance score
  relevanceScore?: number; // Alternative field name
  authorityScore?: number; // Alternative field name
  category?: string; // Document category
  type?: string; // Document type (PDF, HTML, etc.)
  type_document?: string; // Alternative field name
  publicatiedatum?: string | null; // Publication date
  discoveredAt?: string; // When document was discovered
  metadata?: Record<string, unknown>; // Additional metadata
  // NEW: Linked XML data (rules, activities, areas)
  rules?: GetResultsRule[]; // Rules extracted from DSO XML
  activities?: GetResultsActivity[]; // Activities extracted from DSO XML
  regulationAreas?: GetResultsRegulationArea[]; // Regulation areas extracted from DSO XML
  ruleCount?: number; // Total number of rules
  activityCount?: number; // Total number of activities
  areaCount?: number; // Total number of regulation areas
}

/**
 * Output type for GetResultsAction
 */
export interface GetResultsOutput {
  documents: GetResultsDocument[];
  totalCount: number;
  runId: string;
  runStatus: string;
  contextUpdates?: Record<string, unknown>; // Optional context updates
}

/**
 * GetResultsAction - Retrieves discovered documents from a workflow run
 * 
 * This action implements the `getResults` action for the `document-review` step.
 * It retrieves documents from the completed workflow run and supports fixture mode.
 */
export class GetResultsAction implements WizardStepAction<GetResultsInput, GetResultsOutput> {
  readonly stepId = 'document-review';
  readonly actionId = 'getResults';

  /**
   * Execute the getResults action
   * 
   * This method:
   * 1. Validates that runId exists in session context
   * 2. Gets the workflow run using RunManager
   * 3. Checks if run is completed (or handles non-completed runs)
   * 4. Extracts documents from various possible result structures
   * 5. Supports fixture mode for deterministic testing
   * 6. Returns documents with metadata
   * 
   * @param session - The current wizard session
   * @param input - The action input (empty object, runId from session context)
   * @returns Promise resolving to the action output (documents, totalCount, runId, runStatus)
   * @throws Error if runId not found or run retrieval fails
   */
  async execute(
    session: WizardSessionDocument,
    input: GetResultsInput
  ): Promise<GetResultsOutput> {
    // Validate input (empty object is valid)
    getResultsInputSchema.parse(input);

    // Get runId from session context
    const runId = session.context.runId as string | undefined;
    if (!runId) {
      throw new BadRequestError('Run ID not found in session context. Please start a scan first using startScan action.', {
        sessionId: session.sessionId,
        stepId: this.stepId,
        actionId: this.actionId
      });
    }

    // Support FEATURE_E2E_FIXTURES mode for deterministic testing
    const useFixtures = isE2EFixturesEnabled();
    if (useFixtures) {
      logger.info(
        { runId, action: 'getResults' },
        'FEATURE_E2E_FIXTURES=true: Using fixture-backed results'
      );
      return this.getFixtureResults(runId);
    }

    // Initialize services
    const db = getDB();
    const runManager = new RunManager(db);

    // Get the workflow run
    const run = await runManager.getRun(runId);
    if (!run) {
      throw new NotFoundError('Workflow run', runId, {
        sessionId: session.sessionId,
        stepId: this.stepId,
        actionId: this.actionId
      });
    }

    // Extract documents from run result
    const documents = this.extractDocumentsFromRun(run);

    logger.info(
      { runId, documentCount: documents.length, runStatus: run.status, action: 'getResults' },
      'Retrieved documents from workflow run'
    );

    // Documents are already persisted via canonical pipeline (from workflow actions)
    // Only create Query document if needed (for workflow tracking), but don't persist to brondocumenten
    // Note: This persistence was redundant since documents are already in canonical_documents collection
    const queryId = session.linkedQueryId?.toString();
    if (queryId && documents.length > 0 && !input.skipPersistence) {
      try {
        // Query document should already exist (created by workflow actions)
        // Just log that documents are available in canonical store
        logger.info(
          { queryId, count: documents.length, runId },
          'Documents already persisted via canonical pipeline (canonical_documents collection)'
        );
      } catch (error) {
        // Log error but don't fail the action - this is informational only
        logger.warn(
          { error, queryId, runId, documentCount: documents.length },
          'Note: Documents are already in canonical store via workflow actions'
        );
      }
    }

    return {
      documents,
      totalCount: documents.length,
      runId,
      runStatus: run.status,
      contextUpdates: {
        documents, // Store documents in session context for ApplyReviewDecisionsAction
      },
    };
  }

  /**
   * Extract documents from workflow run result
   * 
   * Handles various possible result structures:
   * - result.scoredDocuments
   * - result.documentsByCategory
   * - result.rawDocumentsBySource
   * - result.documents (from WorkflowOutput structure)
   * - result.endpoints (WorkflowResultEndpoint[])
   */
  private extractDocumentsFromRun(run: Run): GetResultsDocument[] {
    if (!run.result) {
      return [];
    }

    const result = run.result;
    const documents: GetResultsDocument[] = [];

    // Check for scoredDocuments (most common structure)
    if (result.scoredDocuments && Array.isArray(result.scoredDocuments)) {
      for (const doc of result.scoredDocuments) {
        documents.push(this.normalizeDocument(doc));
      }
    }

    // Check for documentsByCategory
    if (result.documentsByCategory && typeof result.documentsByCategory === 'object') {
      for (const [categoryName, categoryDocs] of Object.entries(result.documentsByCategory)) {
        if (Array.isArray(categoryDocs)) {
          for (const doc of categoryDocs) {
            documents.push(this.normalizeDocument(doc, { category: categoryName }));
          }
        }
      }
    }

    // Check for rawDocumentsBySource
    if (result.rawDocumentsBySource && typeof result.rawDocumentsBySource === 'object') {
      for (const [sourceName, sourceDocs] of Object.entries(result.rawDocumentsBySource)) {
        if (Array.isArray(sourceDocs)) {
          for (const doc of sourceDocs) {
            documents.push(this.normalizeDocument(doc, { source: sourceName }));
          }
        }
      }
    }

    // Check for documents array (from WorkflowOutput structure)
    if (result.documents && Array.isArray(result.documents)) {
      for (const doc of result.documents) {
        documents.push(this.normalizeDocument(doc));
      }
    }

    // Check for endpoints (WorkflowResultEndpoint[])
    if (result.endpoints && Array.isArray(result.endpoints)) {
      for (const endpoint of result.endpoints) {
        documents.push(this.normalizeDocument(endpoint));
      }
    }

    // Deduplicate by URL
    const uniqueDocuments = this.deduplicateByUrl(documents);

    return uniqueDocuments;
  }

  /**
   * Normalize document structure to GetResultsDocument format
   */
  private normalizeDocument(
    doc: unknown,
    additionalFields?: { category?: string; source?: string }
  ): GetResultsDocument {
    const docObj = doc as Record<string, unknown>;

    // Extract linked XML data from metadata
    const metadata = docObj.metadata && typeof docObj.metadata === 'object' 
      ? (docObj.metadata as Record<string, unknown>) 
      : undefined;
    
    const linkedXmlData = metadata?.linkedXmlData as {
      rules?: Array<{ identificatie: string; titel?: string; type?: string; areaIds?: string[]; textId?: string }>;
      activities?: Array<{ identificatie: string; naam?: string }>;
      regulationAreas?: Array<{ identificatie: string; naam?: string; ruleIds?: string[] }>;
      ruleCount?: number;
      activityCount?: number;
      areaCount?: number;
    } | undefined;

    logger.debug(
      {
        url: String(docObj.url || docObj.link || ''),
        hasLinkedXmlData: !!linkedXmlData,
        ruleCount: linkedXmlData?.ruleCount || 0,
      },
      '[GetResultsAction] Extracting linked XML data for frontend'
    );

    // Determine URL: check url/link first, then canonicalUrl (from CanonicalDocument)
    let url = String(docObj.url || docObj.link || docObj.canonicalUrl || '');

    // Fallback: Generate URL from sourceId if possible (for DSO and Rechtspraak)
    if (!url && docObj.sourceId && typeof docObj.sourceId === 'string') {
      const source = String(docObj.source || additionalFields?.source || '');
      const sourceId = docObj.sourceId;

      if (source.includes('DSO') || source === 'dsoDiscovery' || sourceId.startsWith('/akn/nl/act')) {
        // Build URL from sourceId using URL builder
        try {
          url = buildDsoPublicUrl(sourceId);
        } catch (error) {
          logger.warn(
            { error, sourceId },
            'Failed to build DSO public URL from sourceId in GetResultsAction, using fallback'
          );
          // Fallback: construct basic URL (should not happen in normal operation)
          url = `https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten/${encodeURIComponent(sourceId)}`;
        }
      } else if (source.includes('Rechtspraak') || source === 'rechtspraak' || sourceId.startsWith('ECLI:')) {
        url = `https://uitspraken.rechtspraak.nl/inziendocument?id=${sourceId}`;
      }
    }

    return {
      url,
      title: String(docObj.title || docObj.titel || docObj.name || ''),
      titel: docObj.titel ? String(docObj.titel) : undefined,
      samenvatting: docObj.samenvatting ? String(docObj.samenvatting) : undefined,
      source: additionalFields?.source || String(docObj.source || docObj.sourceUrl || docObj.website_url || ''),
      sourceUrl: docObj.sourceUrl ? String(docObj.sourceUrl) : undefined,
      website_url: docObj.website_url ? String(docObj.website_url) : undefined,
      website_titel: docObj.website_titel ? String(docObj.website_titel) : undefined,
      score: this.getScore(docObj),
      relevanceScore: docObj.relevanceScore ? Number(docObj.relevanceScore) : undefined,
      authorityScore: docObj.authorityScore ? Number(docObj.authorityScore) : undefined,
      category: additionalFields?.category || (docObj.category ? String(docObj.category) : undefined),
      type: docObj.type ? String(docObj.type) : undefined,
      type_document: docObj.type_document ? String(docObj.type_document) : undefined,
      publicatiedatum: docObj.publicatiedatum ? String(docObj.publicatiedatum) : null,
      discoveredAt: docObj.discoveredAt ? String(docObj.discoveredAt) : undefined,
      metadata,
      // Include linked XML data for frontend display
      rules: linkedXmlData?.rules,
      activities: linkedXmlData?.activities,
      regulationAreas: linkedXmlData?.regulationAreas,
      ruleCount: linkedXmlData?.ruleCount,
      activityCount: linkedXmlData?.activityCount,
      areaCount: linkedXmlData?.areaCount,
    };
  }

  /**
   * Get score from document (tries multiple field names)
   */
  private getScore(docObj: Record<string, unknown>): number | undefined {
    if (typeof docObj.score === 'number') {
      return docObj.score;
    }
    if (typeof docObj.relevanceScore === 'number') {
      return docObj.relevanceScore;
    }
    if (typeof docObj.authorityScore === 'number') {
      return docObj.authorityScore;
    }
    return undefined;
  }

  /**
   * Deduplicate documents by URL
   */
  private deduplicateByUrl(documents: GetResultsDocument[]): GetResultsDocument[] {
    const seen = new Set<string>();
    const unique: GetResultsDocument[] = [];

    for (const doc of documents) {
      if (doc.url && !seen.has(doc.url)) {
        seen.add(doc.url);
        unique.push(doc);
      }
    }

    return unique;
  }

  /**
   * Get fixture-backed results for deterministic E2E testing
   * 
   * When FEATURE_E2E_FIXTURES=true, returns predictable test data
   * instead of real scraped results.
   */
  private getFixtureResults(runId: string): GetResultsOutput {
    // Return fixture-backed results for deterministic testing
    const fixtureDocuments: GetResultsDocument[] = [
      {
        url: 'https://example.com/fixture-doc-1.pdf',
        title: 'Fixture Document 1',
        titel: 'Fixture Document 1',
        samenvatting: 'This is a fixture document for testing purposes',
        source: 'https://example.com',
        website_url: 'https://example.com',
        website_titel: 'Example Website',
        score: 0.95,
        relevanceScore: 0.95,
        type: 'PDF',
        type_document: 'PDF',
        discoveredAt: new Date().toISOString(),
      },
      {
        url: 'https://example.com/fixture-doc-2.html',
        title: 'Fixture Document 2',
        titel: 'Fixture Document 2',
        samenvatting: 'Another fixture document for testing',
        source: 'https://example.com',
        website_url: 'https://example.com',
        website_titel: 'Example Website',
        score: 0.85,
        relevanceScore: 0.85,
        type: 'HTML',
        type_document: 'HTML',
        discoveredAt: new Date().toISOString(),
      },
      {
        url: 'https://example.com/fixture-doc-3.pdf',
        title: 'Fixture Document 3',
        titel: 'Fixture Document 3',
        samenvatting: 'Third fixture document',
        source: 'https://example.com',
        website_url: 'https://example.com',
        website_titel: 'Example Website',
        score: 0.75,
        relevanceScore: 0.75,
        type: 'PDF',
        type_document: 'PDF',
        discoveredAt: new Date().toISOString(),
      },
    ];

    logger.info(
      { runId, documentCount: fixtureDocuments.length, action: 'getResults' },
      'Returning fixture-backed results for deterministic testing'
    );

    return {
      documents: fixtureDocuments,
      totalCount: fixtureDocuments.length,
      runId,
      runStatus: 'completed',
      contextUpdates: {
        documents: fixtureDocuments, // Store documents in session context for ApplyReviewDecisionsAction
      },
    };
  }
}

