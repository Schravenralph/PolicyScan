/**
 * WizardSessionService - Service layer for wizard session operations
 * 
 * Provides a clean interface for wizard session CRUD operations with
 * optimistic locking support and conflict handling.
 */

import { WizardSession, RevisionConflictError } from '../../models/WizardSession.js';
import { NotFoundError } from '../../types/errors.js';
import type {
  WizardSessionDocument,
  WizardSessionCreateInput,
  WizardSessionUpdateInput,
} from '../../types/WizardSession.js';

/**
 * Service for managing wizard sessions
 */
export class WizardSessionService {
  /**
   * Create a new wizard session
   */
  static async createSession(
    input: WizardSessionCreateInput
  ): Promise<WizardSessionDocument> {
    return await WizardSession.create(input);
  }

  /**
   * Get a wizard session by sessionId
   */
  static async getSession(sessionId: string): Promise<WizardSessionDocument | null> {
    return await WizardSession.findBySessionId(sessionId);
  }

  /**
   * Get a wizard session by sessionId (throws if not found)
   */
  static async getSessionOrThrow(sessionId: string): Promise<WizardSessionDocument> {
    const session = await WizardSession.findBySessionId(sessionId);
    if (!session) {
      throw new NotFoundError('Wizard session', sessionId);
    }
    return session;
  }

  /**
   * Update a wizard session with optimistic locking
   * 
   * @param sessionId - The session ID to update
   * @param input - The update data (must include revision for optimistic locking)
   * @returns The updated session document
   * @throws RevisionConflictError if revision mismatch (409 conflict)
   */
  static async updateSession(
    sessionId: string,
    input: WizardSessionUpdateInput
  ): Promise<WizardSessionDocument> {
    try {
      return await WizardSession.update(sessionId, input);
    } catch (error) {
      if (error instanceof RevisionConflictError) {
        // Re-throw revision conflicts as-is (caller should handle 409)
        throw error;
      }
      throw error;
    }
  }

  /**
   * Delete a wizard session
   */
  static async deleteSession(sessionId: string): Promise<boolean> {
    return await WizardSession.delete(sessionId);
  }

  /**
   * Find wizard sessions by wizard definition
   */
  static async findByWizardDefinition(
    wizardDefinitionId: string,
    wizardDefinitionVersion?: number
  ): Promise<WizardSessionDocument[]> {
    return await WizardSession.findByWizardDefinition(
      wizardDefinitionId,
      wizardDefinitionVersion
    );
  }

  /**
   * Find wizard sessions by status
   */
  static async findByStatus(
    status: WizardSessionDocument['status']
  ): Promise<WizardSessionDocument[]> {
    return await WizardSession.findByStatus(status);
  }

  /**
   * Count wizard sessions
   */
  static async count(filter?: Parameters<typeof WizardSession.count>[0]): Promise<number> {
    return await WizardSession.count(filter);
  }
}
