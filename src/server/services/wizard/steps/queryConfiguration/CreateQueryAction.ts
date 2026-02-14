/**
 * CreateQueryAction - Wizard step action for creating a query
 * 
 * This action handles the `query-configuration` wizard step by:
 * - Validating user input (overheidslaag, entity, onderwerp)
 * - Creating a Query record in the database
 * - Returning the queryId and query object
 * - Updating the wizard session context with the queryId
 * 
 * The action is idempotent: if a query already exists in the session context,
 * it will return the existing query instead of creating a new one.
 */

import { z } from 'zod';
import { queryConfigurationInputSchema } from '../../definitions/schemas.js';
import { Query } from '../../../../models/Query.js';
import type { WizardStepAction } from '../WizardStepAction.js';
import type { WizardSessionDocument } from '../../../../types/WizardSession.js';
import type { QueryDocument, QueryCreateInput } from '../../../../types/index.js';
import { BadRequestError } from '../../../../types/errors.js';

/**
 * Input schema for CreateQueryAction (re-exported from single source of truth)
 * @deprecated Use queryConfigurationInputSchema from definitions/schemas.ts instead
 */
export const createQueryInputSchema = queryConfigurationInputSchema;

/**
 * Input type for CreateQueryAction
 */
export type CreateQueryInput = z.infer<typeof queryConfigurationInputSchema>;

/**
 * Output type for CreateQueryAction
 */
export interface CreateQueryOutput {
  queryId: string;
  query: QueryDocument;
  contextUpdates: {
    queryId: string;
    onderwerp?: string;
  };
}

/**
 * CreateQueryAction - Creates a query record for the wizard session
 * 
 * This action implements the `createQuery` action for the `query-configuration` step.
 * It validates input, creates a Query record, and returns the queryId and query object.
 */
export class CreateQueryAction implements WizardStepAction<CreateQueryInput, CreateQueryOutput> {
  readonly stepId = 'query-configuration';
  readonly actionId = 'createQuery';

  /**
   * Execute the createQuery action
   * 
   * This method:
   * 1. Validates input using the input schema
   * 2. Checks if a query already exists in the session context (idempotency)
   * 3. Creates a new Query record if needed
   * 4. Returns the queryId and query object with context updates
   * 
   * @param session - The current wizard session
   * @param input - The action input (overheidslaag, entity, onderwerp)
   * @returns Promise resolving to the action output (queryId, query, contextUpdates)
   * @throws Error if validation fails or query creation fails
   */
  async execute(
    session: WizardSessionDocument,
    input: CreateQueryInput
  ): Promise<CreateQueryOutput> {
    // Validate input using schema
    const validatedInput = createQueryInputSchema.parse(input);

    // Check if query already exists in session context (idempotency)
    const existingQueryId = session.context.queryId as string | undefined;
    if (existingQueryId) {
      // Try to fetch the existing query
      const existingQuery = await Query.findById(existingQueryId);
      if (existingQuery) {
        // Verify the existing query matches the input (idempotency check)
        const matches = this.queryMatchesInput(existingQuery, validatedInput);
        if (matches) {
          // Return existing query
          return {
            queryId: existingQueryId,
            query: existingQuery,
            contextUpdates: {
              queryId: existingQueryId,
              onderwerp: existingQuery.onderwerp,
            },
          };
        }
        // If query exists but doesn't match, we'll check the database for a matching query
        // (this could happen if user changes input)
      }
    }

    // Check database for existing query with same parameters (idempotency across sessions)
    const existingQuery = await Query.findByParameters({
      overheidstype: validatedInput.overheidslaag,
      overheidsinstantie: validatedInput.entity,
      onderwerp: validatedInput.onderwerp,
    });

    if (existingQuery) {
      const queryId = existingQuery._id?.toString();
      if (!queryId) {
        throw new BadRequestError('Existing query found but missing _id', {
          sessionId: session.sessionId,
          stepId: this.stepId,
          actionId: this.actionId
        });
      }
      // Return existing query
      return {
        queryId,
        query: existingQuery,
        contextUpdates: {
          queryId,
          onderwerp: existingQuery.onderwerp,
        },
      };
    }

    // Map wizard input to QueryCreateInput format
    // Set websiteTypes based on overheidslaag to ensure mock API can generate suggestions
    const websiteTypes = validatedInput.overheidslaag ? [validatedInput.overheidslaag] : [];
    const queryInput: QueryCreateInput = {
      overheidstype: validatedInput.overheidslaag,
      overheidsinstantie: validatedInput.entity,
      onderwerp: validatedInput.onderwerp,
      websiteTypes, // Set based on overheidslaag for mock API compatibility
      websiteUrls: [],
      documentUrls: [],
    };

    // Create the query
    const query = await Query.create(queryInput);

    // Return output with context updates
    const queryId = query._id?.toString();
    if (!queryId) {
      throw new BadRequestError('Failed to create query: missing _id', {
        sessionId: session.sessionId,
        stepId: this.stepId,
        actionId: this.actionId
      });
    }

    return {
      queryId,
      query,
      contextUpdates: {
        queryId,
        onderwerp: query.onderwerp,
      },
    };
  }

  /**
   * Check if an existing query matches the input
   * 
   * Used for idempotency: if the same input is provided, return the existing query.
   * 
   * @param query - The existing query document
   * @param input - The action input
   * @returns true if the query matches the input, false otherwise
   */
  private queryMatchesInput(
    query: QueryDocument,
    input: CreateQueryInput
  ): boolean {
    return (
      query.overheidstype === input.overheidslaag &&
      query.overheidsinstantie === input.entity &&
      query.onderwerp === input.onderwerp
    );
  }
}

