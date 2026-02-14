/**
 * ApplyReviewDecisionsAction - Wizard step action for applying review decisions
 * 
 * This action handles the `document-review` wizard step by:
 * - Accepting user review decisions (documentId → decision mapping)
 * - Validating that decisions exist for all documents shown for review
 * - Validating that at least one document is approved
 * - Storing decisions in WizardSession.context.reviewDecisions
 * - Implementing idempotency for same decision set
 * 
 * The action is idempotent: same decisions will produce the same context updates
 * (last-write-wins with revision locking handled by the engine).
 */

import { z } from 'zod';
import type { WizardStepAction } from '../WizardStepAction.js';
import type { WizardSessionDocument } from '../../../../types/WizardSession.js';
import { BadRequestError } from '../../../../types/errors.js';

/**
 * Review decision type
 */
export type ReviewDecision = 'approved' | 'rejected';

// Import schema from single source of truth
import { applyReviewDecisionsInputSchema as schemaFromDefinition } from '../../definitions/schemas.js';

/**
 * Input schema for ApplyReviewDecisionsAction (re-exported from single source of truth)
 * @deprecated Use applyReviewDecisionsInputSchema from definitions/schemas.ts instead
 */
export const applyReviewDecisionsInputSchema = schemaFromDefinition;

/**
 * Input type for ApplyReviewDecisionsAction
 */
export type ApplyReviewDecisionsInput = z.infer<typeof applyReviewDecisionsInputSchema>;

/**
 * Output type for ApplyReviewDecisionsAction
 */
export interface ApplyReviewDecisionsOutput {
  appliedCount: number;
  approvedCount: number;
  rejectedCount: number;
  contextUpdates: {
    reviewDecisions: Record<string, ReviewDecision>;
  };
}

/**
 * Document structure expected in session context
 * This matches the structure returned by GetResultsAction
 */
interface ReviewDocument {
  url: string;
  title?: string;
  id?: string;
  [key: string]: unknown;
}

/**
 * ApplyReviewDecisionsAction - Applies user review decisions to discovered documents
 * 
 * This action implements the `applyReviewDecisions` action for the `document-review` step.
 * It validates decisions and stores them in the session context.
 */
export class ApplyReviewDecisionsAction implements WizardStepAction<ApplyReviewDecisionsInput, ApplyReviewDecisionsOutput> {
  readonly stepId = 'document-review';
  readonly actionId = 'applyReviewDecisions';

  /**
   * Execute the applyReviewDecisions action
   * 
   * This method:
   * 1. Validates input using the input schema
   * 2. Retrieves documents from session context (from GetResultsAction)
   * 3. Validates that decisions exist for all documents (or allows partial per policy)
   * 4. Validates that at least one document is approved
   * 5. Stores decisions in context.reviewDecisions
   * 6. Returns counts and context updates
   * 
   * @param session - The current wizard session
   * @param input - The action input (decisions: Record<string, 'approved' | 'rejected'>)
   * @returns Promise resolving to the action output (appliedCount, approvedCount, rejectedCount, contextUpdates)
   * @throws Error if validation fails
   */
  async execute(
    session: WizardSessionDocument,
    input: ApplyReviewDecisionsInput
  ): Promise<ApplyReviewDecisionsOutput> {
    // Validate input using schema
    const validatedInput = applyReviewDecisionsInputSchema.parse(input);

    // Get documents from session context (set by GetResultsAction)
    const documents = this.getDocumentsFromContext(session);

    // If no documents available, throw error
    if (!documents || documents.length === 0) {
      throw new BadRequestError(
        'No documents available for review. Please retrieve scan results first using getResults action.',
        {
          sessionId: session.sessionId,
          stepId: this.stepId,
          actionId: this.actionId
        }
      );
    }

    // Get document identifiers (prefer id, fallback to url)
    const documentIds = new Set(
      documents.map((doc) => doc.id || doc.url).filter((id): id is string => Boolean(id))
    );

    // Validate that all decisions reference valid document IDs
    const invalidIds: string[] = [];
    for (const documentId of Object.keys(validatedInput.decisions)) {
      if (!documentIds.has(documentId)) {
        invalidIds.push(documentId);
      }
    }

    if (invalidIds.length > 0) {
      throw new BadRequestError(
        `Invalid document IDs in decisions: ${invalidIds.join(', ')}. These IDs do not exist in the scan results.`,
        {
          sessionId: session.sessionId,
          stepId: this.stepId,
          actionId: this.actionId,
          invalidIds,
          totalDocuments: documents.length
        }
      );
    }

    // Validate completeness: decisions must exist for all documents
    // Note: Per policy, we could allow partial decisions, but for now we require all
    const decisionIds = new Set(Object.keys(validatedInput.decisions));
    const missingIds: string[] = [];
    for (const documentId of documentIds) {
      if (!decisionIds.has(documentId)) {
        missingIds.push(documentId);
      }
    }

    if (missingIds.length > 0) {
      throw new BadRequestError(
        `Missing decisions for ${missingIds.length} document(s). All documents must have a review decision. Missing IDs: ${missingIds.slice(0, 5).join(', ')}${missingIds.length > 5 ? '...' : ''}`,
        {
          sessionId: session.sessionId,
          stepId: this.stepId,
          actionId: this.actionId,
          missingIdsCount: missingIds.length,
          missingIds: missingIds.slice(0, 10), // Include first 10 for debugging
          totalDocuments: documents.length
        }
      );
    }

    // Validate that at least one document is approved
    const approvedCount = Object.values(validatedInput.decisions).filter(
      (decision) => decision === 'approved'
    ).length;

    if (approvedCount === 0) {
      throw new BadRequestError('At least one document must be approved. All documents cannot be rejected.', {
        sessionId: session.sessionId,
        stepId: this.stepId,
        actionId: this.actionId,
        totalDocuments: documents.length,
        rejectedCount: Object.values(validatedInput.decisions).filter((decision) => decision === 'rejected').length
      });
    }

    // Count decisions
    const rejectedCount = Object.values(validatedInput.decisions).filter(
      (decision) => decision === 'rejected'
    ).length;

    // Store decisions in context (idempotent: same input = same output)
    // Sort keys for deterministic output
    const sortedDecisions: Record<string, ReviewDecision> = {};
    const sortedKeys = Object.keys(validatedInput.decisions).sort();
    for (const key of sortedKeys) {
      sortedDecisions[key] = validatedInput.decisions[key];
    }

    return {
      appliedCount: Object.keys(validatedInput.decisions).length,
      approvedCount,
      rejectedCount,
      contextUpdates: {
        reviewDecisions: sortedDecisions,
      },
    };
  }

  /**
   * Get documents from session context
   * 
   * Documents are expected to be stored by GetResultsAction in:
   * - session.context.documents (array of documents)
   * - session.context.scanResults?.documents (alternative location)
   * 
   * @param session - The wizard session
   * @returns Array of documents or empty array
   */
  private getDocumentsFromContext(session: WizardSessionDocument): ReviewDocument[] {
    // Try primary location: context.documents
    if (session.context.documents && Array.isArray(session.context.documents)) {
      return session.context.documents as ReviewDocument[];
    }

    // Try alternative location: context.scanResults.documents
    if (
      session.context.scanResults &&
      typeof session.context.scanResults === 'object' &&
      'documents' in session.context.scanResults &&
      Array.isArray(session.context.scanResults.documents)
    ) {
      return session.context.scanResults.documents as ReviewDocument[];
    }

    // Try context.results?.documents
    if (
      session.context.results &&
      typeof session.context.results === 'object' &&
      'documents' in session.context.results &&
      Array.isArray(session.context.results.documents)
    ) {
      return session.context.results.documents as ReviewDocument[];
    }

    return [];
  }
}

