/**
 * Session Recovery Service
 * 
 * Provides session backup and recovery functionality.
 */

import { getDB } from '../../config/database.js';
import { WizardSession } from '../../models/WizardSession.js';
import type { WizardSessionDocument } from '../../types/WizardSession.js';
import { logger } from '../../utils/logger.js';
import { SessionValidationService } from './SessionValidationService.js';

const BACKUP_COLLECTION_NAME = 'wizard_session_backups';

export interface SessionBackup {
  sessionId: string;
  session: WizardSessionDocument;
  backupVersion: number;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface SessionRecoveryResult {
  success: boolean;
  session?: WizardSessionDocument;
  fromBackup?: boolean;
  error?: string;
}

/**
 * Service for session backup and recovery
 */
export class SessionRecoveryService {
  private validationService: SessionValidationService;

  constructor() {
    this.validationService = new SessionValidationService();
  }

  /**
   * Create a backup of a session
   */
  async createBackup(session: WizardSessionDocument): Promise<void> {
    try {
      const db = getDB();
      const collection = db.collection<SessionBackup>(BACKUP_COLLECTION_NAME);

      // Get current backup version
      const latestBackup = await collection
        .findOne(
          { sessionId: session.sessionId },
          { sort: { backupVersion: -1 } }
        );

      const backupVersion = latestBackup ? latestBackup.backupVersion + 1 : 1;

      // Create backup
      const backup: SessionBackup = {
        sessionId: session.sessionId,
        session: { ...session }, // Deep copy
        backupVersion,
        createdAt: new Date(),
        metadata: {
          revision: session.revision,
          status: session.status,
        },
      };

      // Insert backup
      await collection.insertOne(backup);

      // Keep only last 5 backups per session
      await this.cleanupOldBackups(session.sessionId, 5);

      logger.debug(
        { sessionId: session.sessionId, backupVersion },
        'Session backup created'
      );
    } catch (error) {
      logger.error(
        { sessionId: session.sessionId, error },
        'Failed to create session backup'
      );
      throw error;
    }
  }

  /**
   * Recover session from backup
   */
  async recoverSession(sessionId: string): Promise<SessionRecoveryResult> {
    try {
      const db = getDB();
      const collection = db.collection<SessionBackup>(BACKUP_COLLECTION_NAME);

      // Get latest backup
      const backup = await collection.findOne(
        { sessionId },
        { sort: { backupVersion: -1 } }
      );

      if (!backup || !backup.session) {
        return {
          success: false,
          error: 'No backup found for session',
        };
      }

      // Validate recovered session
      const validation = this.validationService.validateSession(backup.session);
      if (!validation.valid) {
        logger.warn(
          { sessionId, errors: validation.errors },
          'Recovered session failed validation'
        );
        // Try to find an older backup
        const olderBackup = await collection.findOne(
          { sessionId, backupVersion: { $lt: backup.backupVersion } },
          { sort: { backupVersion: -1 } }
        );
        if (olderBackup && olderBackup.session) {
          const olderValidation = this.validationService.validateSession(olderBackup.session);
          if (olderValidation.valid) {
            logger.info({ sessionId }, 'Using older backup that passed validation');
            return {
              success: true,
              session: olderBackup.session,
              fromBackup: true,
            };
          }
        }
        return {
          success: false,
          error: 'Recovered session failed validation',
        };
      }

      // Restore session
      await WizardSession.update(sessionId, {
        currentStepId: backup.session.currentStepId,
        completedSteps: backup.session.completedSteps,
        context: backup.session.context,
        linkedQueryId: backup.session.linkedQueryId?.toString(),
        linkedRunId: backup.session.linkedRunId,
        status: backup.session.status,
        revision: backup.session.revision,
      });

      logger.info(
        { sessionId, backupVersion: backup.backupVersion },
        'Session recovered from backup'
      );

      return {
        success: true,
        session: backup.session,
        fromBackup: true,
      };
    } catch (error) {
      logger.error(
        { sessionId, error },
        'Failed to recover session from backup'
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Cleanup old backups for a session
   */
  private async cleanupOldBackups(sessionId: string, keepCount: number): Promise<void> {
    try {
      const db = getDB();
      const collection = db.collection<SessionBackup>(BACKUP_COLLECTION_NAME);

      // Get backups sorted by version (newest first)
      const backups = await collection
        .find({ sessionId })
        .sort({ backupVersion: -1 })
        .toArray();

      if (backups.length <= keepCount) {
        return;
      }

      // Delete old backups
      const backupsToDelete = backups.slice(keepCount);
      const backupVersionsToDelete = backupsToDelete.map(b => b.backupVersion);

      await collection.deleteMany({
        sessionId,
        backupVersion: { $in: backupVersionsToDelete },
      });

      logger.debug(
        { sessionId, deletedCount: backupsToDelete.length },
        'Cleaned up old session backups'
      );
    } catch (error) {
      logger.warn(
        { sessionId, error },
        'Failed to cleanup old backups (non-critical)'
      );
    }
  }

  /**
   * Get backup history for a session
   */
  async getBackupHistory(sessionId: string): Promise<SessionBackup[]> {
    const db = getDB();
    const collection = db.collection<SessionBackup>(BACKUP_COLLECTION_NAME);

    return await collection
      .find({ sessionId })
      .sort({ backupVersion: -1 })
      .toArray();
  }
}


