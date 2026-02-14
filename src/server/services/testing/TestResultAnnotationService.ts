/**
 * Test Result Annotation Service
 * 
 * Manages annotations, comments, and tags for test results.
 */

import { ensureDBConnection, getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { ObjectId } from 'mongodb';

export interface TestResultAnnotation {
  _id?: ObjectId;
  runId: string;
  testId?: string;
  annotationType: 'comment' | 'tag' | 'label' | 'note';
  content: string;
  author?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface TestResultTag {
  name: string;
  color?: string;
  description?: string;
}

export interface TestResultComment {
  content: string;
  author?: string;
  createdAt: Date;
  updatedAt?: Date;
  replies?: TestResultComment[];
}

class TestResultAnnotationService {
  private collectionName = 'test_result_annotations';
  private tagsCollectionName = 'test_result_tags';

  /**
   * Get annotations for a test run
   */
  async getAnnotationsForRun(runId: string): Promise<TestResultAnnotation[]> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestResultAnnotation>(this.collectionName);

      const annotations = await collection
        .find({ runId })
        .sort({ createdAt: -1 })
        .toArray();

      return annotations;
    } catch (error) {
      logger.error({ error, runId }, 'Failed to get annotations for run');
      throw error;
    }
  }

  /**
   * Get annotations for a specific test
   */
  async getAnnotationsForTest(testId: string): Promise<TestResultAnnotation[]> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestResultAnnotation>(this.collectionName);

      const annotations = await collection
        .find({ testId })
        .sort({ createdAt: -1 })
        .toArray();

      return annotations;
    } catch (error) {
      logger.error({ error, testId }, 'Failed to get annotations for test');
      throw error;
    }
  }

  /**
   * Add an annotation to a test result
   */
  async addAnnotation(annotation: Omit<TestResultAnnotation, '_id' | 'createdAt' | 'updatedAt'>): Promise<TestResultAnnotation> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestResultAnnotation>(this.collectionName);

      const now = new Date();
      const newAnnotation: Omit<TestResultAnnotation, '_id'> = {
        ...annotation,
        createdAt: now,
        updatedAt: now,
      };

      const result = await collection.insertOne(newAnnotation as TestResultAnnotation);

      const inserted = await collection.findOne({ _id: result.insertedId });
      if (!inserted) {
        throw new Error('Failed to retrieve inserted annotation');
      }

      logger.info({ annotationId: result.insertedId, runId: annotation.runId }, 'Added test result annotation');
      return inserted;
    } catch (error) {
      logger.error({ error, annotation }, 'Failed to add annotation');
      throw error;
    }
  }

  /**
   * Update an annotation
   */
  async updateAnnotation(
    annotationId: string,
    updates: Partial<Pick<TestResultAnnotation, 'content' | 'metadata'>>
  ): Promise<TestResultAnnotation> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestResultAnnotation>(this.collectionName);

      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(annotationId) },
        {
          $set: {
            ...updates,
            updatedAt: new Date(),
          },
        },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new Error('Annotation not found');
      }

      logger.info({ annotationId }, 'Updated test result annotation');
      return result;
    } catch (error) {
      logger.error({ error, annotationId }, 'Failed to update annotation');
      throw error;
    }
  }

  /**
   * Delete an annotation
   */
  async deleteAnnotation(annotationId: string): Promise<void> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestResultAnnotation>(this.collectionName);

      const result = await collection.deleteOne({ _id: new ObjectId(annotationId) });

      if (result.deletedCount === 0) {
        throw new Error('Annotation not found');
      }

      logger.info({ annotationId }, 'Deleted test result annotation');
    } catch (error) {
      logger.error({ error, annotationId }, 'Failed to delete annotation');
      throw error;
    }
  }

  /**
   * Add tags to a test result
   */
  async addTags(runId: string, tags: string[]): Promise<void> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestResultAnnotation>(this.collectionName);

      const now = new Date();
      const tagAnnotations: Omit<TestResultAnnotation, '_id'>[] = tags.map(tag => ({
        runId,
        annotationType: 'tag',
        content: tag,
        createdAt: now,
        updatedAt: now,
      }));

      await collection.insertMany(tagAnnotations as TestResultAnnotation[]);
      logger.info({ runId, tags }, 'Added tags to test result');
    } catch (error) {
      logger.error({ error, runId, tags }, 'Failed to add tags');
      throw error;
    }
  }

  /**
   * Get all tags for a test run
   */
  async getTagsForRun(runId: string): Promise<string[]> {
    try {
      const annotations = await this.getAnnotationsForRun(runId);
      return annotations
        .filter(a => a.annotationType === 'tag')
        .map(a => a.content);
    } catch (error) {
      logger.error({ error, runId }, 'Failed to get tags for run');
      throw error;
    }
  }

  /**
   * Get all unique tags across all test runs
   */
  async getAllTags(): Promise<TestResultTag[]> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestResultAnnotation>(this.collectionName);

      const tags = await collection
        .aggregate<{ _id: string; count: number }>([
          { $match: { annotationType: 'tag' } },
          { $group: { _id: '$content', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray();

      return tags.map(tag => ({
        name: tag._id,
        description: `Used ${tag.count} times`,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get all tags');
      throw error;
    }
  }

  /**
   * Ensure indexes for efficient querying
   */
  async ensureIndexes(): Promise<void> {
    try {
      const db = await ensureDBConnection();
      const collection = db.collection<TestResultAnnotation>(this.collectionName);

      await collection.createIndex({ runId: 1, createdAt: -1 });
      await collection.createIndex({ testId: 1, createdAt: -1 });
      await collection.createIndex({ annotationType: 1 });
      await collection.createIndex({ 'content': 'text' });

      logger.debug('Ensured indexes for test result annotations');
    } catch (error) {
      logger.error({ error }, 'Failed to ensure indexes for annotations');
      throw error;
    }
  }
}

let annotationServiceInstance: TestResultAnnotationService | null = null;

export function getTestResultAnnotationService(): TestResultAnnotationService {
  if (!annotationServiceInstance) {
    annotationServiceInstance = new TestResultAnnotationService();
  }
  return annotationServiceInstance;
}


