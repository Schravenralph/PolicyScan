/**
 * EmailConfiguration Model - MongoDB persistence for email notification configurations
 * 
 * Stores user email notification preferences including:
 * - What events to email about
 * - When to send emails (immediate, scheduled digests)
 * - How to format emails
 */

import { getDB } from '../config/database.js';
import { ObjectId } from 'mongodb';
import {
  handleDatabaseOperation,
  DatabaseValidationError,
  DatabaseNotFoundError,
} from '../utils/databaseErrorHandler.js';
import { logger } from '../utils/logger.js';

const COLLECTION_NAME = 'email_configurations';
let indexesEnsured = false;

export interface EmailEventConfiguration {
  eventType: string;
  enabled: boolean;
  frequency: string;
  severity?: string;
  conditions?: Record<string, unknown>;
}

export interface EmailScheduleConfiguration {
  frequency: string;
  time?: string;
  dayOfWeek?: number;
  timezone?: string;
}

export interface EmailFormatConfiguration {
  format: string;
  template?: string;
  includeDetails?: boolean;
  includeStackTrace?: boolean;
  includeMetrics?: boolean;
  maxItems?: number;
}

export interface EmailConfigurationDocument {
  _id?: ObjectId;
  userId: string;
  recipients: string[];
  events: EmailEventConfiguration[];
  schedule: EmailScheduleConfiguration;
  format: EmailFormatConfiguration;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailConfigurationCreateInput {
  userId: string;
  recipients: string[];
  events: EmailEventConfiguration[];
  schedule: EmailScheduleConfiguration;
  format: EmailFormatConfiguration;
  enabled?: boolean;
}

export interface EmailConfigurationUpdateInput {
  recipients?: string[];
  events?: EmailEventConfiguration[];
  schedule?: EmailScheduleConfiguration;
  format?: EmailFormatConfiguration;
  enabled?: boolean;
}

/**
 * MongoDB model for email configurations
 */
export class EmailConfiguration {
  /**
   * Ensure database indexes exist
   */
  private static async ensureIndexes(): Promise<void> {
    if (indexesEnsured) return;

    const db = getDB();
    const collection = db.collection<EmailConfigurationDocument>(COLLECTION_NAME);

    try {
      // Index on userId for user-specific configurations
      await collection.createIndex({ userId: 1 }, { background: true });

      // Index on enabled for finding active configurations
      await collection.createIndex({ enabled: 1 }, { background: true });

      // Compound index for finding active configuration per user
      await collection.createIndex(
        { userId: 1, enabled: 1 },
        { background: true }
      );

      // Index on updatedAt for sorting
      await collection.createIndex({ updatedAt: -1 }, { background: true });

      indexesEnsured = true;
      logger.debug('[EmailConfiguration] Indexes ensured');
    } catch (error) {
      logger.warn(
        { error },
        'Warning: Could not create all email_configurations indexes'
      );
    }
  }

  /**
   * Create or update email configuration for a user
   */
  static async upsert(input: EmailConfigurationCreateInput): Promise<EmailConfigurationDocument> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const now = new Date();

      // Validate input
      if (!input.userId || input.userId.trim().length === 0) {
        throw new DatabaseValidationError('User ID is required');
      }

      if (!input.recipients || input.recipients.length === 0) {
        throw new DatabaseValidationError('At least one recipient is required');
      }

      // Validate email addresses
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const email of input.recipients) {
        if (!emailRegex.test(email)) {
          throw new DatabaseValidationError(`Invalid email address: ${email}`);
        }
      }

      const collection = db.collection<EmailConfigurationDocument>(COLLECTION_NAME);

      // Check if configuration exists
      const existing = await collection.findOne({ userId: input.userId });

      const configuration: EmailConfigurationDocument = {
        userId: input.userId,
        recipients: input.recipients,
        events: input.events || [],
        schedule: input.schedule || { frequency: 'daily_digest', time: '09:00' },
        format: input.format || { format: 'html', includeDetails: true, maxItems: 50 },
        enabled: input.enabled ?? true,
        updatedAt: now,
        createdAt: existing ? existing.createdAt : now,
      };

      if (existing) {
        // Update existing
        await collection.updateOne(
          { userId: input.userId },
          { $set: configuration }
        );
        logger.info(`[EmailConfiguration] Updated configuration for user ${input.userId}`);
        return { ...configuration, _id: existing._id };
      } else {
        // Create new
        const result = await collection.insertOne(configuration);
        logger.info(`[EmailConfiguration] Created configuration for user ${input.userId}`);
        return { ...configuration, _id: result.insertedId };
      }
    }, 'EmailConfiguration.upsert');
  }

  /**
   * Find configuration by user ID
   */
  static async findByUserId(userId: string): Promise<EmailConfigurationDocument | null> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<EmailConfigurationDocument>(COLLECTION_NAME);
      return await collection.findOne({ userId });
    }, 'EmailConfiguration.findByUserId');
  }

  /**
   * Update configuration for a user
   */
  static async update(
    userId: string,
    input: EmailConfigurationUpdateInput
  ): Promise<EmailConfigurationDocument> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<EmailConfigurationDocument>(COLLECTION_NAME);

      const existing = await collection.findOne({ userId });
      if (!existing) {
        throw new DatabaseNotFoundError('EmailConfiguration', userId);
      }

      // Validate email addresses if provided
      if (input.recipients) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        for (const email of input.recipients) {
          if (!emailRegex.test(email)) {
            throw new DatabaseValidationError(`Invalid email address: ${email}`);
          }
        }
      }

      const update: Partial<EmailConfigurationDocument> = {
        ...input,
        updatedAt: new Date(),
      };

      await collection.updateOne(
        { userId },
        { $set: update }
      );

      const updated = await collection.findOne({ userId });
      if (!updated) {
        throw new DatabaseNotFoundError('EmailConfiguration', userId);
      }

      logger.info(`[EmailConfiguration] Updated configuration for user ${userId}`);
      return updated;
    }, 'EmailConfiguration.update');
  }

  /**
   * Delete configuration for a user
   */
  static async delete(userId: string): Promise<void> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<EmailConfigurationDocument>(COLLECTION_NAME);

      const result = await collection.deleteOne({ userId });
      if (result.deletedCount === 0) {
        throw new DatabaseNotFoundError('EmailConfiguration', userId);
      }

      logger.info(`[EmailConfiguration] Deleted configuration for user ${userId}`);
    }, 'EmailConfiguration.delete');
  }

  /**
   * Find all enabled configurations (for scheduled digest processing)
   */
  static async findEnabled(): Promise<EmailConfigurationDocument[]> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<EmailConfigurationDocument>(COLLECTION_NAME);
      return await collection.find({ enabled: true }).toArray();
    }, 'EmailConfiguration.findEnabled');
  }
}

