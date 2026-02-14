/**
 * Test Suite Service
 * 
 * Manages test suites, grouping tests, and suite-level analytics.
 */

import { ensureDBConnection, getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { ObjectId } from 'mongodb';

export interface TestSuite {
  _id?: ObjectId;
  name: string;
  description?: string;
  testIds: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface TestSuiteRun {
  _id?: ObjectId;
  suiteId: string;
  runId: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'partial';
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
}

class TestSuiteService {
  private collectionName = 'test_suites';
  private suiteRunsCollectionName = 'test_suite_runs';

  /**
   * Create a new test suite
   */
  async createSuite(suite: Omit<TestSuite, '_id' | 'createdAt' | 'updatedAt'>): Promise<TestSuite> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestSuite>(this.collectionName);

      const now = new Date();
      const newSuite: Omit<TestSuite, '_id'> = {
        ...suite,
        createdAt: now,
        updatedAt: now,
      };

      const result = await collection.insertOne(newSuite as TestSuite);
      const inserted = await collection.findOne({ _id: result.insertedId });

      if (!inserted) {
        throw new Error('Failed to retrieve inserted suite');
      }

      logger.info({ suiteId: result.insertedId, name: suite.name }, 'Created test suite');
      return inserted;
    } catch (error) {
      logger.error({ error, suite }, 'Failed to create test suite');
      throw error;
    }
  }

  /**
   * Get all test suites
   */
  async getAllSuites(): Promise<TestSuite[]> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestSuite>(this.collectionName);

      const suites = await collection.find({}).sort({ createdAt: -1 }).toArray();
      return suites;
    } catch (error) {
      logger.error({ error }, 'Failed to get all suites');
      throw error;
    }
  }

  /**
   * Get a test suite by ID
   */
  async getSuiteById(suiteId: string): Promise<TestSuite | null> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestSuite>(this.collectionName);

      const suite = await collection.findOne({ _id: new ObjectId(suiteId) });
      return suite;
    } catch (error) {
      logger.error({ error, suiteId }, 'Failed to get suite by ID');
      throw error;
    }
  }

  /**
   * Update a test suite
   */
  async updateSuite(suiteId: string, updates: Partial<Pick<TestSuite, 'name' | 'description' | 'testIds' | 'tags' | 'metadata'>>): Promise<TestSuite> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestSuite>(this.collectionName);

      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(suiteId) },
        {
          $set: {
            ...updates,
            updatedAt: new Date(),
          },
        },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new Error('Suite not found');
      }

      logger.info({ suiteId }, 'Updated test suite');
      return result;
    } catch (error) {
      logger.error({ error, suiteId }, 'Failed to update suite');
      throw error;
    }
  }

  /**
   * Delete a test suite
   */
  async deleteSuite(suiteId: string): Promise<void> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestSuite>(this.collectionName);

      const result = await collection.deleteOne({ _id: new ObjectId(suiteId) });

      if (result.deletedCount === 0) {
        throw new Error('Suite not found');
      }

      logger.info({ suiteId }, 'Deleted test suite');
    } catch (error) {
      logger.error({ error, suiteId }, 'Failed to delete suite');
      throw error;
    }
  }

  /**
   * Get suites containing a specific test
   */
  async getSuitesForTest(testId: string): Promise<TestSuite[]> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestSuite>(this.collectionName);

      const suites = await collection.find({ testIds: testId }).toArray();
      return suites;
    } catch (error) {
      logger.error({ error, testId }, 'Failed to get suites for test');
      throw error;
    }
  }

  /**
   * Record a suite run
   */
  async recordSuiteRun(run: Omit<TestSuiteRun, '_id'>): Promise<TestSuiteRun> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestSuiteRun>(this.suiteRunsCollectionName);

      const result = await collection.insertOne(run as TestSuiteRun);
      const inserted = await collection.findOne({ _id: result.insertedId });

      if (!inserted) {
        throw new Error('Failed to retrieve inserted suite run');
      }

      logger.info({ suiteRunId: result.insertedId, suiteId: run.suiteId }, 'Recorded suite run');
      return inserted;
    } catch (error) {
      logger.error({ error, run }, 'Failed to record suite run');
      throw error;
    }
  }

  /**
   * Get suite run history
   */
  async getSuiteRunHistory(suiteId: string, limit = 50): Promise<TestSuiteRun[]> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestSuiteRun>(this.suiteRunsCollectionName);

      const runs = await collection
        .find({ suiteId })
        .sort({ startedAt: -1 })
        .limit(limit)
        .toArray();

      return runs;
    } catch (error) {
      logger.error({ error, suiteId }, 'Failed to get suite run history');
      throw error;
    }
  }

  /**
   * Ensure indexes
   */
  async ensureIndexes(): Promise<void> {
    try {
      const db = await ensureDBConnection();

      const suitesCollection = db.collection<TestSuite>(this.collectionName);
      await suitesCollection.createIndex({ name: 1 });
      await suitesCollection.createIndex({ testIds: 1 });
      await suitesCollection.createIndex({ tags: 1 });
      await suitesCollection.createIndex({ createdAt: -1 });

      const runsCollection = db.collection<TestSuiteRun>(this.suiteRunsCollectionName);
      await runsCollection.createIndex({ suiteId: 1, startedAt: -1 });
      await runsCollection.createIndex({ runId: 1 });
      await runsCollection.createIndex({ status: 1 });

      logger.debug('Ensured indexes for test suites');
    } catch (error) {
      logger.error({ error }, 'Failed to ensure indexes for suites');
      throw error;
    }
  }
}

let suiteServiceInstance: TestSuiteService | null = null;

export function getTestSuiteService(): TestSuiteService {
  if (!suiteServiceInstance) {
    suiteServiceInstance = new TestSuiteService();
  }
  return suiteServiceInstance;
}


