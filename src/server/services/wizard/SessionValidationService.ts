/**
 * Session Validation Service
 * 
 * Validates wizard session structure and data integrity.
 */

import type { WizardSessionDocument } from '../../types/WizardSession.js';
import { logger } from '../../utils/logger.js';

export interface SessionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Service for validating wizard sessions
 */
export class SessionValidationService {
  /**
   * Validate a wizard session
   */
  validateSession(session: WizardSessionDocument): SessionValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic structure validation
    if (!session || typeof session !== 'object') {
      errors.push('Session must be an object');
      return { valid: false, errors, warnings };
    }

    // Required fields
    if (!session.sessionId || typeof session.sessionId !== 'string') {
      errors.push('Session must have a valid sessionId');
    }

    if (!session.wizardDefinitionId || typeof session.wizardDefinitionId !== 'string') {
      errors.push('Session must have a valid wizardDefinitionId');
    }

    if (session.revision === undefined || typeof session.revision !== 'number') {
      errors.push('Session must have a valid revision number');
    }

    if (!session.status || typeof session.status !== 'string') {
      errors.push('Session must have a valid status');
    }

    // Validate status enum
    const validStatuses = ['active', 'completed', 'failed', 'abandoned'];
    if (session.status && !validStatuses.includes(session.status)) {
      errors.push(`Invalid session status: ${session.status}`);
    }

    // Validate context
    if (session.context !== undefined) {
      if (typeof session.context !== 'object' || Array.isArray(session.context)) {
        errors.push('Session context must be an object');
      } else {
        // Check for circular references
        try {
          JSON.stringify(session.context);
        } catch (e) {
          if (e instanceof Error && e.message.includes('circular')) {
            errors.push('Session context contains circular reference');
          }
        }
      }
    }

    // Validate completedSteps
    if (session.completedSteps !== undefined) {
      if (!Array.isArray(session.completedSteps)) {
        errors.push('Session completedSteps must be an array');
      } else {
        // Check for duplicate step IDs
        const stepIds = new Set(session.completedSteps);
        if (stepIds.size !== session.completedSteps.length) {
          warnings.push('Session completedSteps contains duplicate step IDs');
        }
      }
    }

    // Validate currentStepId
    if (session.currentStepId !== undefined && session.currentStepId !== null) {
      if (typeof session.currentStepId !== 'string') {
        errors.push('Session currentStepId must be a string or null');
      }
    }

    // Validate dates
    if (session.createdAt && !(session.createdAt instanceof Date)) {
      warnings.push('Session createdAt is not a Date object');
    }

    if (session.updatedAt && !(session.updatedAt instanceof Date)) {
      warnings.push('Session updatedAt is not a Date object');
    }

    // Validate revision is non-negative
    if (session.revision !== undefined && session.revision < 0) {
      errors.push('Session revision must be non-negative');
    }

    // Check for corruption indicators
    if (session.context && typeof session.context === 'object') {
      // Check for null/undefined in critical context fields
      const criticalFields = ['queryId', 'workflowRunId'];
      for (const field of criticalFields) {
        if (field in session.context && (session.context[field] === null || session.context[field] === undefined)) {
          warnings.push(`Critical context field '${field}' is null or undefined`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate session structure matches expected schema
   */
  validateSessionStructure(
    session: unknown
  ): SessionValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!session || typeof session !== 'object') {
      errors.push('Session must be an object');
      return { valid: false, errors, warnings };
    }

    // Type check
    if (!('sessionId' in session) || typeof (session as any).sessionId !== 'string') {
      errors.push('Session must have a sessionId string field');
    }

    if (!('wizardDefinitionId' in session) || typeof (session as any).wizardDefinitionId !== 'string') {
      errors.push('Session must have a wizardDefinitionId string field');
    }

    if (!('revision' in session) || typeof (session as any).revision !== 'number') {
      errors.push('Session must have a revision number field');
    }

    if (!('status' in session) || typeof (session as any).status !== 'string') {
      errors.push('Session must have a status string field');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}


