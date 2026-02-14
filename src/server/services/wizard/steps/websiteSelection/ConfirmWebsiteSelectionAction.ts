/**
 * ConfirmWebsiteSelectionAction - Wizard step action for confirming website selection
 * 
 * This action handles the `website-selection` wizard step by:
 * - Validating that at least one website is selected
 * - Validating that all selected IDs exist in the suggestions for the query
 * - Storing the selected website IDs in the wizard session context
 * - Returning the selected website IDs and count
 * 
 * The action is idempotent: same inputs will produce the same context updates
 * (last-write-wins with revision locking handled by the engine).
 */

import { z } from 'zod';
import type { WizardStepAction } from '../WizardStepAction.js';
import type { WizardSessionDocument } from '../../../../types/WizardSession.js';
import type { SuggestedWebsite } from './GenerateWebsiteSuggestionsAction.js';
import { BadRequestError } from '../../../../types/errors.js';

// Import schema from single source of truth
import { confirmWebsiteSelectionInputSchema as schemaFromDefinition } from '../../definitions/schemas.js';

/**
 * Input schema for ConfirmWebsiteSelectionAction (re-exported from single source of truth)
 * @deprecated Use confirmWebsiteSelectionInputSchema from definitions/schemas.ts instead
 */
export const confirmWebsiteSelectionInputSchema = schemaFromDefinition;

/**
 * Input type for ConfirmWebsiteSelectionAction
 */
export type ConfirmWebsiteSelectionInput = z.infer<typeof confirmWebsiteSelectionInputSchema>;

/**
 * Output type for ConfirmWebsiteSelectionAction
 */
export interface ConfirmWebsiteSelectionOutput {
  selectedWebsiteIds: string[];
  websiteCount: number;
  contextUpdates: {
    selectedWebsiteIds: string[];
  };
}

/**
 * ConfirmWebsiteSelectionAction - Confirms and stores user's website selections
 * 
 * This action implements the `confirmSelection` action for the `website-selection` step.
 * It validates that selections are valid and stores them in the session context.
 */
export class ConfirmWebsiteSelectionAction implements WizardStepAction<ConfirmWebsiteSelectionInput, ConfirmWebsiteSelectionOutput> {
  readonly stepId = 'website-selection';
  readonly actionId = 'confirmSelection';

  /**
   * Execute the confirmSelection action
   * 
   * This method:
   * 1. Validates input using the input schema
   * 2. Validates that at least one website is selected (enforced by schema)
   * 3. Validates that all selected IDs exist in suggestions from context
   * 4. Returns the selected website IDs and count with context updates
   * 
   * @param session - The current wizard session
   * @param input - The action input (queryId, selectedWebsiteIds)
   * @returns Promise resolving to the action output (selectedWebsiteIds, websiteCount, contextUpdates)
   * @throws Error if validation fails
   */
  async execute(
    session: WizardSessionDocument,
    input: ConfirmWebsiteSelectionInput
  ): Promise<ConfirmWebsiteSelectionOutput> {
    // Validate input using schema
    const validatedInput = confirmWebsiteSelectionInputSchema.parse(input);

    // Validate that queryId matches session context
    const sessionQueryId = session.context.queryId as string | undefined;
    if (!sessionQueryId) {
      throw new BadRequestError('Query ID not found in session context. Please complete query configuration step first.', {
        sessionId: session.sessionId,
        stepId: this.stepId,
        actionId: this.actionId
      });
    }
    if (sessionQueryId !== validatedInput.queryId) {
      throw new BadRequestError(`Query ID mismatch: session has ${sessionQueryId}, but input provided ${validatedInput.queryId}`, {
        sessionId: session.sessionId,
        stepId: this.stepId,
        actionId: this.actionId,
        sessionQueryId,
        inputQueryId: validatedInput.queryId
      });
    }

    // If no websites are selected, allow skipping website scraping
    if (validatedInput.selectedWebsiteIds.length === 0) {
      return {
        selectedWebsiteIds: [],
        websiteCount: 0,
        contextUpdates: {
          selectedWebsiteIds: [],
        },
      };
    }

    // Get suggested websites from session context
    const suggestedWebsites = session.context.suggestedWebsites as SuggestedWebsite[] | undefined;
    // Only require suggestions if websites are actually selected
    if (!suggestedWebsites || !Array.isArray(suggestedWebsites) || suggestedWebsites.length === 0) {
      // If no suggestions but websites are selected, that's an error
      // But if no websites are selected, we already returned above
      throw new BadRequestError('No website suggestions found in session context. Please generate suggestions first.', {
        sessionId: session.sessionId,
        stepId: this.stepId,
        actionId: this.actionId
      });
    }

    // Validate that all selected IDs exist in suggestions
    const suggestionIds = new Set(suggestedWebsites.map((website) => website.id));
    const invalidIds: string[] = [];
    for (const selectedId of validatedInput.selectedWebsiteIds) {
      if (!suggestionIds.has(selectedId)) {
        invalidIds.push(selectedId);
      }
    }

    if (invalidIds.length > 0) {
      throw new BadRequestError(
        `Invalid website IDs selected: ${invalidIds.join(', ')}. These IDs do not exist in the suggestions.`,
        {
          sessionId: session.sessionId,
          stepId: this.stepId,
          actionId: this.actionId,
          invalidIds,
          suggestionIds: Array.from(suggestionIds).slice(0, 10) // Include first 10 suggestion IDs for debugging
        }
      );
    }

    // Remove duplicates (idempotency: same input = same output)
    const uniqueSelectedIds = Array.from(new Set(validatedInput.selectedWebsiteIds));

    // Return output with context updates
    return {
      selectedWebsiteIds: uniqueSelectedIds,
      websiteCount: uniqueSelectedIds.length,
      contextUpdates: {
        selectedWebsiteIds: uniqueSelectedIds,
      },
    };
  }
}

