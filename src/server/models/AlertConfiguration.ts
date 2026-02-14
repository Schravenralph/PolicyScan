/**
 * AlertConfiguration Model
 *
 * MongoDB persistence for alert configurations.
 */

import { getDB } from '../config/database.js';
import { ObjectId, type Filter } from 'mongodb';
import {
  handleDatabaseOperation,
  DatabaseValidationError,
  DatabaseNotFoundError,
} from '../utils/databaseErrorHandler.js';
import { logger } from '../utils/logger.js';
import type { AlertConfig } from '../types/AlertTypes.js';

const COLLECTION_NAME = 'alert_configurations';
let indexesEnsured = false;

export interface AlertConfigurationDocument extends Omit<AlertConfig, 'workflowId' | 'stepId'> {
  _id?: ObjectId;
  workflowId?: string | null;
  stepId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AlertConfigurationCreateInput = AlertConfig;

export type AlertConfigurationUpdateInput = Partial<AlertConfig>;

export class AlertConfiguration {
  /**
   * Ensure database indexes exist
   */
  private static async ensureIndexes(): Promise<void> {
    if (indexesEnsured) return;

    const db = getDB();
    const collection = db.collection<AlertConfigurationDocument>(COLLECTION_NAME);

    try {
      // Index for finding specific config (compound)
      await collection.createIndex(
        { workflowId: 1, stepId: 1 },
        { background: true }
      );

      // Index for finding workflow-level config
      await collection.createIndex(
        { workflowId: 1 },
        { background: true }
      );

      indexesEnsured = true;
      logger.debug('[AlertConfiguration] Indexes ensured');
    } catch (error) {
      logger.warn(
        { error },
        'Warning: Could not create all alert_configurations indexes'
      );
    }
  }

  /**
   * Create a new alert configuration
   */
  static async create(input: AlertConfigurationCreateInput): Promise<AlertConfigurationDocument> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const now = new Date();
      const collection = db.collection<AlertConfigurationDocument>(COLLECTION_NAME);

      // Check if duplicate configuration exists
      const query: Filter<AlertConfigurationDocument> = {
        workflowId: input.workflowId || null,
        stepId: input.stepId || null,
      };

      const existing = await collection.findOne(query);
      if (existing) {
        throw new DatabaseValidationError(
          `Alert configuration already exists for this context (workflow: ${input.workflowId || 'global'}, step: ${input.stepId || 'all'})`
        );
      }

      const doc: AlertConfigurationDocument = {
        timeoutThreshold: input.timeoutThreshold,
        timeoutRateThreshold: input.timeoutRateThreshold,
        slowExecutionThreshold: input.slowExecutionThreshold,
        channels: input.channels,
        recipients: input.recipients,
        severity: input.severity,
        enabled: input.enabled,
        workflowId: input.workflowId || null,
        stepId: input.stepId || null,
        createdAt: now,
        updatedAt: now,
      };

      const result = await collection.insertOne(doc);
      logger.info(`[AlertConfiguration] Created configuration for workflow: ${input.workflowId || 'global'}, step: ${input.stepId || 'all'}`);
      return { ...doc, _id: result.insertedId };
    }, 'AlertConfiguration.create');
  }

  /**
   * Find a configuration by exact context (workflowId, stepId)
   */
  static async findByContext(workflowId?: string, stepId?: string): Promise<AlertConfigurationDocument | null> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<AlertConfigurationDocument>(COLLECTION_NAME);

      const query: Filter<AlertConfigurationDocument> = {
        workflowId: workflowId || null,
        stepId: stepId || null
      };

      return await collection.findOne(query);
    }, 'AlertConfiguration.findByContext');
  }

  /**
   * Update a configuration by ID
   */
  static async update(
    id: string,
    input: AlertConfigurationUpdateInput
  ): Promise<AlertConfigurationDocument> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<AlertConfigurationDocument>(COLLECTION_NAME);
      const now = new Date();

      const update: Partial<AlertConfigurationDocument> = {
        updatedAt: now,
      };

      if (input.timeoutThreshold !== undefined) update.timeoutThreshold = input.timeoutThreshold;
      if (input.timeoutRateThreshold !== undefined) update.timeoutRateThreshold = input.timeoutRateThreshold;
      if (input.slowExecutionThreshold !== undefined) update.slowExecutionThreshold = input.slowExecutionThreshold;
      if (input.channels !== undefined) update.channels = input.channels;
      if (input.recipients !== undefined) update.recipients = input.recipients;
      if (input.severity !== undefined) update.severity = input.severity;
      if (input.enabled !== undefined) update.enabled = input.enabled;
      // We don't typically allow moving config to another workflow/step via update, but could be added if needed.

      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: update },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new DatabaseNotFoundError(`Alert configuration not found: ${id}`);
      }

      logger.info(`[AlertConfiguration] Updated configuration ${id}`);
      return result;
    }, 'AlertConfiguration.update');
  }

  /**
   * Delete a configuration
   */
  static async delete(id: string): Promise<boolean> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<AlertConfigurationDocument>(COLLECTION_NAME);

      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount > 0) {
        logger.info(`[AlertConfiguration] Deleted configuration ${id}`);
      }
      return result.deletedCount > 0;
    }, 'AlertConfiguration.delete');
  }
}
