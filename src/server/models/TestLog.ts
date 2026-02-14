import { getDB } from '../config/database.js';
import { ObjectId, type Filter } from 'mongodb';
import { handleDatabaseOperation, DatabaseValidationError } from '../utils/databaseErrorHandler.js';
import { logger } from '../utils/logger.js';
import type { TestLogEntry, TestLogCollection, VerbosityLevel } from '../services/testing/TestLoggingService.js';

const COLLECTION_NAME = 'test_logs';

/**
 * Test Log MongoDB Document
 * 
 * Stores test log collections in MongoDB for persistence across server restarts.
 * Collection: test_logs
 */
export interface TestLogDocument {
  _id?: ObjectId;
  testId: string; // Unique test run ID
  testFile?: string; // Test file path
  logs: TestLogEntry[]; // Array of log entries
  verbosity: VerbosityLevel; // Verbosity level for the collection
  createdAt: Date; // When the log collection was created
  updatedAt: Date; // When the log collection was last updated
  expiresAt: Date; // TTL expiration date (60 days from creation for error retention)
}

/**
 * Input for creating a test log collection
 */
export interface TestLogCreateInput {
  testId: string;
  testFile?: string;
  logs?: TestLogEntry[];
  verbosity?: VerbosityLevel;
  createdAt?: Date;
  updatedAt?: Date;
  expiresAt?: Date; // Optional - will be auto-calculated if not provided
}

/**
 * Input for updating a test log collection
 */
export interface TestLogUpdateInput {
  testFile?: string;
  logs?: TestLogEntry[];
  verbosity?: VerbosityLevel;
  updatedAt?: Date;
}

/**
 * TestLog Model
 * 
 * Provides MongoDB persistence for test logs, enabling logs to survive server restarts.
 * Uses in-memory cache for active tests, MongoDB for historical logs.
 */
export class TestLog {
  /**
   * Convert MongoDB document to TestLogCollection interface
   */
  private static documentToCollection(doc: TestLogDocument): TestLogCollection {
    return {
      testId: doc.testId,
      testFile: doc.testFile,
      logs: doc.logs,
      verbosity: doc.verbosity,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }


  /**
   * Ensure database indexes exist for optimal query performance
   */
  static async ensureIndexes(): Promise<void> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<TestLogDocument>(COLLECTION_NAME);

      // Index on testId for fast lookups
      await collection.createIndex({ testId: 1 }, { background: true });
      
      // Index on testFile for querying by file
      await collection.createIndex({ testFile: 1 }, { background: true });
      
      // Index on createdAt for time-based queries
      await collection.createIndex({ createdAt: -1 }, { background: true });
      
      // Compound index for testId + updatedAt for efficient queries
      await collection.createIndex({ testId: 1, updatedAt: -1 }, { background: true });

      // TTL index - MongoDB will automatically delete documents when expiresAt is reached
      // expireAfterSeconds: 0 means use the expiresAt field value directly
      try {
        await collection.createIndex(
          { expiresAt: 1 },
          {
            expireAfterSeconds: 0, // 0 means use expiresAt field value
            name: 'ttl_expiresAt',
            background: true,
          }
        );
        logger.info('Test log TTL index created/verified');
      } catch (error) {
        // Ignore error if index already exists
        if (error instanceof Error && !error.message.includes('already exists')) {
          logger.warn({ error }, 'Failed to create TTL index for test logs');
          throw error;
        }
        // Index already exists - this is fine
        logger.debug('Test log TTL index already exists');
      }
    }, 'TestLog.ensureIndexes');
  }

  /**
   * Create or update a test log collection
   * If a collection with the same testId exists, it will be updated
   */
  static async upsert(input: TestLogCreateInput): Promise<TestLogCollection> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<TestLogDocument>(COLLECTION_NAME);

      const now = new Date();
      const createdAt = input.createdAt || now;
      
      // Calculate expiresAt: 60 days from creation (or from now if creating new)
      // Only set expiresAt on insert, not on update (preserve original expiration)
      // Increased from 30 days to 60 days for better error retention
      const expiresAt = input.expiresAt || new Date(createdAt.getTime() + 60 * 24 * 60 * 60 * 1000);
      
      // Validate expiresAt is a valid date
      if (isNaN(expiresAt.getTime())) {
        throw new DatabaseValidationError('expiresAt must be a valid date');
      }

      const document: Omit<TestLogDocument, '_id'> = {
        testId: input.testId,
        testFile: input.testFile,
        logs: input.logs || [],
        verbosity: input.verbosity || 'normal',
        createdAt,
        updatedAt: input.updatedAt || now,
        expiresAt,
      };

      const result = await collection.findOneAndUpdate(
        { testId: input.testId },
        {
          $set: {
            ...document,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: document.createdAt,
            expiresAt: document.expiresAt, // Only set on insert
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
        }
      );

      if (!result) {
        throw new DatabaseValidationError('Failed to upsert test log collection');
      }

      return this.documentToCollection(result);
    }, 'TestLog.upsert');
  }

  /**
   * Add a log entry to an existing collection, or create a new one
   */
  static async addLogEntry(
    testId: string,
    entry: TestLogEntry,
    testFile?: string
  ): Promise<TestLogCollection> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<TestLogDocument>(COLLECTION_NAME);

      const now = new Date();

      // Try to find existing collection
      const existing = await collection.findOne({ testId });

      if (existing) {
        // Update existing collection
        const updatedLogs = [...existing.logs, entry];
        const updateDoc: Partial<TestLogDocument> = {
          logs: updatedLogs,
          updatedAt: now,
        };

        if (testFile && !existing.testFile) {
          updateDoc.testFile = testFile;
        }

        const result = await collection.findOneAndUpdate(
          { testId },
          { $set: updateDoc },
          { returnDocument: 'after' }
        );

        if (!result) {
          throw new DatabaseValidationError('Failed to update test log collection');
        }

        return this.documentToCollection(result);
      } else {
        // Create new collection
        // Calculate expiresAt: 60 days from now (increased from 30 days for error retention)
        const expiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
        
        // Validate expiresAt is a valid date
        if (isNaN(expiresAt.getTime())) {
          throw new DatabaseValidationError('expiresAt must be a valid date');
        }

        const newDoc: Omit<TestLogDocument, '_id'> = {
          testId,
          testFile,
          logs: [entry],
          verbosity: 'normal',
          createdAt: now,
          updatedAt: now,
          expiresAt,
        };

        const result = await collection.insertOne(newDoc);
        const inserted = await collection.findOne({ _id: result.insertedId });

        if (!inserted) {
          throw new DatabaseValidationError('Failed to create test log collection');
        }

        return this.documentToCollection(inserted);
      }
    }, 'TestLog.addLogEntry');
  }

  /**
   * Get a test log collection by testId
   * Returns TestLogCollection with ISO string dates (matching service interface)
   */
  static async findByTestId(testId: string): Promise<TestLogCollection | null> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<TestLogDocument>(COLLECTION_NAME);

      const doc = await collection.findOne({ testId });

      if (!doc) {
        return null;
      }

      return this.documentToCollection(doc);
    }, 'TestLog.findByTestId');
  }

  /**
   * Update an existing test log collection
   */
  static async update(
    testId: string,
    input: TestLogUpdateInput
  ): Promise<TestLogCollection> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<TestLogDocument>(COLLECTION_NAME);

      const updateDoc: Partial<TestLogDocument> = {
        updatedAt: input.updatedAt || new Date(),
      };

      if (input.testFile !== undefined) {
        updateDoc.testFile = input.testFile;
      }
      if (input.logs !== undefined) {
        updateDoc.logs = input.logs;
      }
      if (input.verbosity !== undefined) {
        updateDoc.verbosity = input.verbosity;
      }

      const result = await collection.findOneAndUpdate(
        { testId },
        { $set: updateDoc },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new DatabaseValidationError(`Test log collection not found: ${testId}`);
      }

      return this.documentToCollection(result);
    }, 'TestLog.update');
  }

  /**
   * Delete a test log collection
   */
  static async delete(testId: string): Promise<boolean> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<TestLogDocument>(COLLECTION_NAME);

      const result = await collection.deleteOne({ testId });
      return result.deletedCount > 0;
    }, 'TestLog.delete');
  }

  /**
   * Find test logs by test file
   */
  static async findByTestFile(testFile: string): Promise<TestLogCollection[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<TestLogDocument>(COLLECTION_NAME);

      const docs = await collection.find({ testFile }).sort({ createdAt: -1 }).toArray();

      return docs.map(doc => this.documentToCollection(doc));
    }, 'TestLog.findByTestFile');
  }

  /**
   * Find test logs by date range
   */
  static async findByDateRange(
    from: Date,
    to: Date
  ): Promise<TestLogCollection[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<TestLogDocument>(COLLECTION_NAME);

      const filter: Filter<TestLogDocument> = {
        createdAt: {
          $gte: from,
          $lte: to,
        },
      };

      const docs = await collection.find(filter).sort({ createdAt: -1 }).toArray();

      return docs.map(doc => this.documentToCollection(doc));
    }, 'TestLog.findByDateRange');
  }

  /**
   * Get all test log collections (with pagination)
   */
  static async findAll(
    limit: number = 100,
    skip: number = 0
  ): Promise<TestLogCollection[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<TestLogDocument>(COLLECTION_NAME);

      const docs = await collection
        .find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .toArray();

      return docs.map(doc => this.documentToCollection(doc));
    }, 'TestLog.findAll');
  }
}
