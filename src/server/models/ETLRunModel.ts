/**
 * ETLRunModel - MongoDB persistence for ETL run state
 * 
 * Tracks ETL pipeline execution state (queued/running/succeeded/failed)
 * with retry policy and provenance tracking.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/12-etl-graphdb.md
 */

import { getDB } from '../config/database.js';
import { ObjectId, type Filter, type UpdateFilter } from 'mongodb';
import { logger } from '../utils/logger.js';

const COLLECTION_NAME = 'etl_runs';
let indexesEnsured = false;

/**
 * ETL run state
 */
export type ETLRunState = 'queued' | 'running' | 'succeeded' | 'failed';

/**
 * ETL run document schema
 */
export interface ETLRunDocument {
  _id?: ObjectId;
  runId: string; // Unique run identifier
  state: ETLRunState;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  
  // Input configuration
  input: {
    documentIds?: string[];
    query?: Record<string, unknown>; // MongoDB query filters
    includeChunks: boolean;
    includeExtensions: {
      geo: boolean;
      legal: boolean;
      web: boolean;
    };
    geoSource: 'mongo' | 'postgis' | 'both';
  };
  
  // Model versions for determinism
  models: {
    nlpModelId: string; // e.g. 'spacy-nl@v3'
    rdfMappingVersion: string;
  };
  
  // Artifact references for provenance
  artifactRefs?: Array<{
    type: string;
    identifier: string;
    version?: string;
  }>;
  
  // Output tracking
  output?: {
    turtleFiles: string[]; // Paths or artifact refs
    manifest?: string; // Path or artifact ref
    stats?: {
      documentsProcessed: number;
      triplesEmitted: number;
      filesWritten: number;
    };
  };
  
  // Error tracking
  errors?: Array<{
    documentId?: string;
    message: string;
    stack?: string;
    timestamp: Date;
  }>;
  
  // Retry tracking
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Date;
  lastError?: string;
  
  // Provenance
  provenance?: {
    activityId: string; // PROV-O activity identifier
    entityIds: string[]; // PROV-O entity identifiers (document contentFingerprints)
    used: Array<{
      type: 'artifact' | 'model';
      identifier: string;
      version?: string;
    }>;
  };
}

/**
 * ETL run create input
 */
export interface ETLRunCreateInput {
  runId: string;
  input: ETLRunDocument['input'];
  models: ETLRunDocument['models'];
  artifactRefs?: ETLRunDocument['artifactRefs'];
  maxRetries?: number;
}

/**
 * ETL run query filters
 */
export interface ETLRunQueryFilters {
  runId?: string;
  state?: ETLRunState;
  createdAt?: {
    $gte?: Date;
    $lte?: Date;
  };
  retryCount?: {
    $gte?: number;
    $lte?: number;
  };
}

/**
 * ETLRunModel - MongoDB model for ETL runs
 */
export class ETLRunModel {
  /**
   * Ensure database indexes exist
   */
  static async ensureIndexes(): Promise<void> {
    if (indexesEnsured) return;
    
    const db = getDB();
    const collection = db.collection<ETLRunDocument>(COLLECTION_NAME);
    
    try {
      // Unique index on runId
      await collection.createIndex(
        { runId: 1 },
        { unique: true, name: 'idx_runId' }
      );
      
      // Index on state for filtering
      await collection.createIndex(
        { state: 1 },
        { name: 'idx_state' }
      );
      
      // Index on createdAt for sorting
      await collection.createIndex(
        { createdAt: -1 },
        { name: 'idx_createdAt' }
      );
      
      // Index on nextRetryAt for retry scheduling
      await collection.createIndex(
        { nextRetryAt: 1 },
        { name: 'idx_nextRetryAt', sparse: true }
      );
      
      // Compound index for state + createdAt queries
      await collection.createIndex(
        { state: 1, createdAt: -1 },
        { name: 'idx_state_createdAt' }
      );
      
      indexesEnsured = true;
      logger.debug('ETLRunModel indexes created successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to create ETLRunModel indexes');
      throw error;
    }
  }

  /**
   * Create a new ETL run
   */
  static async create(input: ETLRunCreateInput): Promise<ETLRunDocument> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<ETLRunDocument>(COLLECTION_NAME);
    const now = new Date();
    
    const document: Omit<ETLRunDocument, '_id'> = {
      runId: input.runId,
      state: 'queued',
      createdAt: now,
      updatedAt: now,
      input: input.input,
      models: input.models,
      artifactRefs: input.artifactRefs || [],
      retryCount: 0,
      maxRetries: input.maxRetries ?? 3,
    };
    
    try {
      const result = await collection.insertOne(document as ETLRunDocument);
      logger.debug({ runId: input.runId }, 'ETL run created');
      return { ...document, _id: result.insertedId } as ETLRunDocument;
    } catch (error) {
      logger.error({ error, runId: input.runId }, 'Failed to create ETL run');
      throw error;
    }
  }

  /**
   * Find ETL run by runId
   */
  static async findByRunId(runId: string): Promise<ETLRunDocument | null> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<ETLRunDocument>(COLLECTION_NAME);
    
    return await collection.findOne({ runId });
  }

  /**
   * Update ETL run state
   */
  static async updateState(
    runId: string,
    state: ETLRunState,
    updates?: {
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
      output?: ETLRunDocument['output'];
      errors?: ETLRunDocument['errors'];
      provenance?: ETLRunDocument['provenance'];
    }
  ): Promise<ETLRunDocument | null> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<ETLRunDocument>(COLLECTION_NAME);
    
    const update: UpdateFilter<ETLRunDocument> = {
      $set: {
        state,
        updatedAt: new Date(),
        ...(updates?.startedAt && { startedAt: updates.startedAt }),
        ...(updates?.completedAt && { completedAt: updates.completedAt }),
        ...(updates?.error && { lastError: updates.error }),
        ...(updates?.output && { output: updates.output }),
        ...(updates?.errors && { errors: updates.errors }),
        ...(updates?.provenance && { provenance: updates.provenance }),
      },
    };
    
    const result = await collection.findOneAndUpdate(
      { runId },
      update,
      { returnDocument: 'after' }
    );
    
    if (result) {
      logger.debug({ runId, state }, 'ETL run state updated');
    }
    
    return result;
  }

  /**
   * Increment retry count and set next retry time
   */
  static async incrementRetry(
    runId: string,
    nextRetryAt: Date
  ): Promise<ETLRunDocument | null> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<ETLRunDocument>(COLLECTION_NAME);
    
    const result = await collection.findOneAndUpdate(
      { runId },
      {
        $inc: { retryCount: 1 },
        $set: {
          updatedAt: new Date(),
          nextRetryAt,
        },
      },
      { returnDocument: 'after' }
    );
    
    if (result) {
      logger.debug({ runId, retryCount: result.retryCount }, 'ETL run retry incremented');
    }
    
    return result;
  }

  /**
   * Find runs by filters
   */
  static async find(filters: ETLRunQueryFilters = {}): Promise<ETLRunDocument[]> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<ETLRunDocument>(COLLECTION_NAME);
    
    const query: Filter<ETLRunDocument> = {};
    
    if (filters.runId) {
      query.runId = filters.runId;
    }
    
    if (filters.state) {
      query.state = filters.state;
    }
    
    if (filters.createdAt) {
      query.createdAt = filters.createdAt;
    }
    
    if (filters.retryCount) {
      query.retryCount = filters.retryCount;
    }
    
    return await collection.find(query).sort({ createdAt: -1 }).toArray();
  }

  /**
   * Find runs ready for retry (failed with nextRetryAt <= now)
   * Note: maxRetries comparison must be done in application code
   */
  static async findRunsReadyForRetry(): Promise<ETLRunDocument[]> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<ETLRunDocument>(COLLECTION_NAME);
    const now = new Date();
    
    const runs = await collection
      .find({
        state: 'failed',
        nextRetryAt: { $lte: now },
      })
      .toArray();
    
    // Filter by retry count in application code
    return runs.filter(run => run.retryCount < run.maxRetries);
  }

  /**
   * Find queued runs
   */
  static async findQueuedRuns(): Promise<ETLRunDocument[]> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<ETLRunDocument>(COLLECTION_NAME);
    
    return await collection
      .find({ state: 'queued' })
      .sort({ createdAt: 1 })
      .toArray();
  }
}

