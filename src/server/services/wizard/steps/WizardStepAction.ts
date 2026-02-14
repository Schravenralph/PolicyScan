/**
 * WizardStepAction - Interface for wizard step actions
 * 
 * This interface defines the contract that all wizard step actions must implement.
 * Actions are modular, testable units that execute specific operations within a wizard step.
 * 
 * Key Requirements:
 * - Actions must validate input using the step definition's inputSchema
 * - Actions must be idempotent where appropriate (safe to retry)
 * - Actions must update WizardSession.context deterministically
 * - Actions should not modify the session directly; return context updates instead
 * 
 * All wizard step actions (CreateQueryAction, GenerateWebsiteSuggestionsAction, etc.)
 * will implement this interface to ensure consistency and testability.
 */

import type { WizardSessionDocument } from '../../../types/WizardSession.js';

/**
 * WizardStepAction interface
 * 
 * Defines the contract for wizard step actions. Actions are responsible for:
 * - Validating input using the step definition's schema
 * - Executing the action logic
 * - Returning output that matches the step definition's output schema
 * - Updating the wizard session context deterministically
 * 
 * @template I - Input type for the action
 * @template O - Output type for the action
 */
export interface WizardStepAction<I, O> {
  /**
   * The step ID this action belongs to
   * 
   * Example: 'query-configuration', 'website-selection', 'document-review'
   */
  stepId: string;

  /**
   * Unique identifier for this specific action
   * 
   * Example: 'createQuery', 'generateWebsiteSuggestions', 'startScan'
   */
  actionId: string;

  /**
   * Execute the action
   * 
   * **Input Validation:**
   * Actions MUST validate input using the step definition's `inputSchema` before processing.
   * Use `stepDefinition.inputSchema.parse(input)` or similar validation.
   * 
   * **Idempotency:**
   * Actions SHOULD be idempotent where appropriate. For example:
   * - Creating a query should check if a query already exists before creating
   * - Starting a scan should reuse an existing run if one exists
   * - Actions that read data (e.g., GetScanStatusAction) are naturally idempotent
   * 
   * **Context Updates:**
   * Actions MUST update `WizardSession.context` deterministically. This means:
   * - Same input + same session state = same context updates
   * - Context updates should be predictable and testable
   * - Do not modify the session directly; return context updates in the output
   * - The WizardSessionEngine will apply context updates to the session
   * 
   * **Error Handling:**
   * Actions should throw descriptive errors that can be handled by the engine.
   * Validation errors should be thrown before any side effects occur.
   * 
   * @param session - The current wizard session document
   * @param input - The action input (must match step definition's inputSchema)
   * @returns Promise resolving to the action output (must match step definition's outputSchema)
   * @throws Error if validation fails or action execution fails
   */
  execute(session: WizardSessionDocument, input: I): Promise<O>;
}


