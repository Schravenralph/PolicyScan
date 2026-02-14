/**
 * Session Persistence Service
 * 
 * Provides robust session persistence with retry logic, backup, and validation.
 */

import { WizardSession, RevisionConflictError } from '../../models/WizardSession.js';
import type {
  WizardSessionDocument,
  WizardSessionUpdateInput,
} from '../../types/WizardSession.js';
import { retryWithBackoff, isRetryableError } from '../../utils/retry.js';
import { logger } from '../../utils/logger.js';
import { SessionRecoveryService } from './SessionRecoveryService.js';
import { SessionValidationService } from './SessionValidationService.js';

export interface SessionSaveOptions {
  maxRetries?: number;
  retryOnConflict?: boolean;
  createBackup?: boolean;
  validateBeforeSave?: boolean;
  validateAfterSave?: boolean;
}

/**
 * Service for robust session persistence
 */
export class SessionPersistenceService {
  private recoveryService: SessionRecoveryService;
  private validationService: SessionValidationService;

  constructor() {
    this.recoveryService = new SessionRecoveryService();
    this.validationService = new SessionValidationService();
  }

  /**
   * Save session with retry, backup, and validation
   */
  async saveSession(
    sessionId: string,
    input: WizardSessionUpdateInput,
    options: SessionSaveOptions = {}
  ): Promise<WizardSessionDocument> {
    const {
      maxRetries = 3,
      retryOnConflict = true,
      createBackup = true,
      validateBeforeSave = true,
      validateAfterSave = true,
    } = options;

    // Get current session for backup and validation
    let currentSession: WizardSessionDocument | null = null;
    try {
      currentSession = await WizardSession.findBySessionId(sessionId);
    } catch (error) {
      logger.warn({ sessionId, error }, 'Failed to load current session for backup');
    }

    // Validate before save
    if (validateBeforeSave && currentSession) {
      const validation = this.validationService.validateSession(currentSession);
      if (!validation.valid) {
        logger.warn(
          { sessionId, errors: validation.errors },
          'Session validation failed before save'
        );
        // Try to recover from backup
        const recoveryResult = await this.recoveryService.recoverSession(sessionId);
        if (recoveryResult.success && recoveryResult.session) {
          logger.info({ sessionId }, 'Session recovered from backup before save');
          currentSession = recoveryResult.session;
        }
      }
    }

    // Create backup before save
    if (createBackup && currentSession) {
      try {
        await this.recoveryService.createBackup(currentSession);
      } catch (backupError) {
        logger.warn(
          { sessionId, error: backupError },
          'Failed to create session backup (continuing with save)'
        );
      }
    }

    // Save with retry
    const saveResult = await retryWithBackoff(
      async () => {
        try {
          return await WizardSession.update(sessionId, input);
        } catch (error) {
          // Handle revision conflicts
          if (error instanceof RevisionConflictError && retryOnConflict) {
            // Reload session to get latest revision
            const latestSession = await WizardSession.findBySessionId(sessionId);
            if (latestSession) {
              // Retry with latest revision
              return await WizardSession.update(sessionId, {
                ...input,
                revision: latestSession.revision,
              });
            }
            throw error;
          }
          throw error;
        }
      },
      {
        maxAttempts: maxRetries,
        initialDelay: 1000,
        maxDelay: 5000,
        multiplier: 2,
        isRetryable: (error) => {
          // Retry on transient errors
          if (isRetryableError(error)) {
            return true;
          }
          // Retry on revision conflicts if enabled
          if (error instanceof RevisionConflictError && retryOnConflict) {
            return true;
          }
          return false;
        },
      }
    );

    // Validate after save
    if (validateAfterSave) {
      const validation = this.validationService.validateSession(saveResult);
      if (!validation.valid) {
        logger.error(
          { sessionId, errors: validation.errors },
          'Session validation failed after save'
        );
        // Try to recover from backup
        const recoveryResult = await this.recoveryService.recoverSession(sessionId);
        if (recoveryResult.success && recoveryResult.session) {
          logger.info({ sessionId }, 'Session recovered from backup after save');
          return recoveryResult.session;
        }
      }
    }

    return saveResult;
  }

  /**
   * Load session with validation and recovery
   */
  async loadSession(
    sessionId: string,
    options: { validate?: boolean; recoverOnError?: boolean } = {}
  ): Promise<WizardSessionDocument | null> {
    const { validate = true, recoverOnError = true } = options;

    try {
      const session = await WizardSession.findBySessionId(sessionId);
      
      if (!session) {
        return null;
      }

      // Validate session
      if (validate) {
        const validation = this.validationService.validateSession(session);
        if (!validation.valid) {
          logger.warn(
            { sessionId, errors: validation.errors },
            'Session validation failed on load'
          );

          // Try to recover from backup
          if (recoverOnError) {
            const recoveryResult = await this.recoveryService.recoverSession(sessionId);
            if (recoveryResult.success && recoveryResult.session) {
              logger.info({ sessionId }, 'Session recovered from backup on load');
              return recoveryResult.session;
            }
          }

          // If recovery fails, return session anyway (caller can decide)
          logger.warn({ sessionId }, 'Returning session despite validation errors');
        }
      }

      return session;
    } catch (error) {
      logger.error({ sessionId, error }, 'Failed to load session');

      // Try to recover from backup
      if (recoverOnError) {
        const recoveryResult = await this.recoveryService.recoverSession(sessionId);
        if (recoveryResult.success && recoveryResult.session) {
          logger.info({ sessionId }, 'Session recovered from backup after load error');
          return recoveryResult.session;
        }
      }

      throw error;
    }
  }
}


