/**
 * ExportResultsAction - Wizard step action for exporting approved documents
 * 
 * This action handles the `document-review` wizard step by:
 * - Validating that review decisions are applied
 * - Retrieving approved documents from review decisions
 * - Generating export in the requested format (JSON, CSV, XLSX, etc.)
 * - Returning export data with metadata (MIME type, filename)
 * 
 * The action is idempotent:
 * - Same input + same session state = same export output
 * - Safe to call multiple times
 */

import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { Readable } from 'stream';
import { getDB } from '../../../../config/database.js';
import { RunManager } from '../../../workflow/RunManager.js';
import { ExportService, type ExportDocument, type ExportFormat } from '../../../export/ExportService.js';
import { GetResultsAction } from './GetResultsAction.js';
import type { WizardStepAction } from '../WizardStepAction.js';
import type { WizardSessionDocument } from '../../../../types/WizardSession.js';
import { logger } from '../../../../utils/logger.js';
import { BadRequestError } from '../../../../types/errors.js';

/**
 * Input schema for ExportResultsAction
 */
export const exportResultsInputSchema = z.object({
  format: z.enum(['json', 'csv', 'xlsx', 'pdf', 'markdown', 'tsv', 'html', 'xml']),
});

/**
 * Input type for ExportResultsAction
 */
export type ExportResultsInput = z.infer<typeof exportResultsInputSchema>;

/**
 * Output type for ExportResultsAction
 */
export interface ExportResultsOutput {
  exportData: string | Buffer;
  mimeType: string;
  filename: string;
  documentCount: number;
  format: ExportFormat;
}

/**
 * ExportResultsAction - Exports approved documents in the requested format
 * 
 * This action implements the `exportResults` action for the `document-review` step.
 * It validates that decisions are applied, retrieves approved documents, and exports them.
 */
export class ExportResultsAction implements WizardStepAction<ExportResultsInput, ExportResultsOutput> {
  readonly stepId = 'document-review';
  readonly actionId = 'exportResults';

  /**
   * Execute the exportResults action
   * 
   * This method:
   * 1. Validates input using the input schema
   * 2. Validates that review decisions are applied
   * 3. Retrieves documents from workflow run
   * 4. Filters to only approved documents
   * 5. Generates export using ExportService
   * 6. Returns export data with metadata
   * 
   * @param session - The current wizard session
   * @param input - The action input (format)
   * @returns Promise resolving to the action output (exportData, mimeType, filename, documentCount, format)
   * @throws Error if validation fails, decisions not applied, or export generation fails
   */
  async execute(
    session: WizardSessionDocument,
    input: ExportResultsInput
  ): Promise<ExportResultsOutput> {
    // Validate input using schema
    const validatedInput = exportResultsInputSchema.parse(input);

    // Validate that review decisions are applied
    const reviewDecisions = session.context.reviewDecisions as Record<string, 'approved' | 'rejected'> | undefined;
    if (!reviewDecisions || Object.keys(reviewDecisions).length === 0) {
      throw new BadRequestError(
        'Review decisions not found in session context. Please apply review decisions first using applyReviewDecisions action.',
        {
          sessionId: session.sessionId,
          stepId: this.stepId,
          actionId: this.actionId
        }
      );
    }

    // Check that at least one document is approved
    const approvedDocumentIds = Object.entries(reviewDecisions)
      .filter(([_, decision]) => decision === 'approved')
      .map(([documentId]) => documentId);

    if (approvedDocumentIds.length === 0) {
      throw new BadRequestError('No approved documents found. At least one document must be approved before exporting.', {
        sessionId: session.sessionId,
        stepId: this.stepId,
        actionId: this.actionId
      });
    }

    // Get runId from session context
    const runId = session.context.runId as string | undefined;
    if (!runId) {
      throw new BadRequestError('Run ID not found in session context. Please start a scan first using startScan action.', {
        sessionId: session.sessionId,
        stepId: this.stepId,
        actionId: this.actionId
      });
    }

    // Get queryId from session context for export metadata
    const queryId = session.context.queryId as string | undefined;

    // Initialize services
    const db = getDB();
    const runManager = new RunManager(db);
    const getResultsAction = new GetResultsAction();

    // Get all documents from workflow run
    const resultsOutput = await getResultsAction.execute(session, { skipPersistence: false });

    // Filter to only approved documents
    // Review decisions use document identifiers (typically URL or document ID)
    // We match documents by URL (most reliable identifier in GetResultsDocument)
    const approvedDocumentUrls = new Set(approvedDocumentIds);
    const approvedDocuments = resultsOutput.documents.filter((doc) => {
      // Match by URL (primary identifier)
      if (approvedDocumentUrls.has(doc.url)) {
        return true;
      }
      // Also check if any approved ID is contained in the URL or vice versa
      // This handles cases where the ID might be a partial match
      return approvedDocumentIds.some((approvedId) => {
        return doc.url.includes(approvedId) || approvedId.includes(doc.url);
      });
    });

    if (approvedDocuments.length === 0) {
      throw new BadRequestError(
        'No approved documents found in workflow results. The approved document IDs may not match the documents from the workflow run.',
        {
          sessionId: session.sessionId,
          stepId: this.stepId,
          actionId: this.actionId,
          approvedDocumentIds: approvedDocumentIds.slice(0, 10) // Include first 10 IDs for debugging
        }
      );
    }

    logger.info(
      {
        runId,
        format: validatedInput.format,
        approvedCount: approvedDocuments.length,
        totalDocuments: resultsOutput.documents.length,
        action: 'exportResults',
      },
      'Exporting approved documents'
    );

    // Convert GetResultsDocument to ExportDocument format
    const exportDocuments: ExportDocument[] = approvedDocuments.map((doc) => ({
      id: doc.url, // Use URL as ID
      title: doc.title || doc.titel || 'Untitled',
      url: doc.url,
      source: doc.source || doc.sourceUrl || doc.website_url || '',
      publicationDate: doc.publicatiedatum || undefined,
      jurisdiction: undefined, // Can be extracted from query if needed
      summary: doc.samenvatting || '',
      content: undefined, // Content not available in GetResultsDocument
    }));

    // Get query details for export metadata if available
    let searchParams: { topic?: string; location?: string; jurisdiction?: string } | undefined;
    if (queryId) {
      try {
        const query = await db.collection('queries').findOne({ _id: new ObjectId(queryId) });
        if (query) {
          searchParams = {
            topic: query.onderwerp || query.thema,
            location: query.location,
            jurisdiction: query.overheidstype || query.overheidslaag,
          };
        }
      } catch (error) {
        logger.warn({ error, queryId }, 'Failed to load query for export metadata');
      }
    }

    // Generate export using ExportService
    const exportService = new ExportService();
    const exportOptions = {
      format: validatedInput.format as ExportFormat,
      includeCitations: false, // Can be made configurable if needed
      citationFormat: 'apa' as const,
      searchParams,
    };

    const exportContent = await exportService.generate(exportDocuments, exportOptions);

    // Convert Readable stream to Buffer if needed
    let exportData: string | Buffer;
    if (exportContent instanceof Readable) {
      // For binary formats (XLSX, PDF), convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of exportContent) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      exportData = Buffer.concat(chunks);
    } else {
      // For text formats, use string directly
      exportData = exportContent;
    }

    // Generate filename
    const extension = exportService.getExtension(validatedInput.format as ExportFormat);
    const topic = searchParams?.topic || 'export';
    const sanitizedTopic = topic.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filename = `${sanitizedTopic}_${new Date().toISOString().split('T')[0]}.${extension}`;

    // Get MIME type
    const mimeType = exportService.getMimeType(validatedInput.format as ExportFormat);

    logger.info(
      {
        runId,
        format: validatedInput.format,
        filename,
        documentCount: approvedDocuments.length,
        action: 'exportResults',
      },
      'Export generated successfully'
    );

    return {
      exportData,
      mimeType,
      filename,
      documentCount: approvedDocuments.length,
      format: validatedInput.format as ExportFormat,
    };
  }
}

