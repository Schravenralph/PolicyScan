import { getDB } from '../config/database.js';
import { ObjectId, type Filter, type AnyBulkWriteOperation, type BulkWriteResult } from 'mongodb';

/**
 * Active Failure Database Schema
 * 
 * Stores currently failing tests as a derived view from test_history.
 * This collection automatically syncs after each test run to maintain
 * an up-to-date list of active failures.
 * 
 * Collection: active_failures
 */

export type ActiveFailureState = 'new' | 'acknowledged' | 'investigating' | 'suppressed' | 'fixed_pending_verification' | 'resolved';
export type ActiveFailureSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Valid state transitions
 * Maps each state to the states it can transition to
 */
export const VALID_STATE_TRANSITIONS: Record<ActiveFailureState, ActiveFailureState[]> = {
  new: ['acknowledged', 'investigating', 'suppressed'],
  acknowledged: ['investigating', 'suppressed'],
  investigating: ['fixed_pending_verification', 'suppressed'],
  suppressed: ['investigating'], // Can re-investigate suppressed failures
  fixed_pending_verification: ['resolved', 'investigating'], // If fix didn't work, goes back to investigating
  resolved: [], // Terminal state - no transitions allowed
};

export interface FailureSignature {
  exceptionType: string; // Error class name (e.g., "AssertionError", "TimeoutError")
  topStackFrames: string[]; // Top N stack frames (normalized - file paths removed)
  assertionMessage?: string; // Assertion message template (dynamic values removed)
}

export interface ActiveFailureDocument {
  _id?: ObjectId;
  testId: string; // Unique test identifier (testFilePath::testName)
  testFilePath: string; // Full path to test file
  testName: string; // Test name
  suite: string; // Test suite type (unit, integration, e2e, visual, performance, other)
  failureFingerprint?: string; // Hash for deduplication (SHA-256)
  failureSignature?: FailureSignature; // Normalized failure signature (for grouping)
  firstSeenAt: Date; // When failure first appeared
  lastSeenAt: Date; // Most recent failure
  seenCount: number; // Total times seen
  consecutiveFailures: number; // Consecutive failure count
  lastRunId?: string; // Most recent test run ID
  lastError?: string; // Most recent error message
  lastStackTrace?: string; // Stack trace
  failurePattern?: string; // Pattern ID from analysis
  gitSha: string; // Commit where it started failing
  branch: string; // Branch where failure occurs
  environment: string; // CI, local, staging
  environmentKey: string; // Composite key: branch + environment
  state?: ActiveFailureState; // Lifecycle state
  stateChangedAt?: Date; // When state was last changed
  stateChangedBy?: string; // User ID who changed the state
  assignedTo?: string; // User ID assigned to investigate
  severity?: ActiveFailureSeverity; // critical, high, medium, low
  isFlaky?: boolean; // Detected as flaky
  isBlocking?: boolean; // Blocks deployment?
  resolvedAt?: Date | null; // When test started passing (null = active)
  tags?: string[]; // Custom tags
  relatedIssues?: string[]; // GitHub issues, JIRA tickets
  notes?: string; // Investigation notes
  lastAlertedAt?: Date; // When last alerted (optional, for tracking)
  alertCount?: number; // Number of times alerted (optional, for tracking)
  createdAt: Date;
  updatedAt: Date;
}

export interface ActiveFailureCreateInput {
  testId: string;
  testFilePath: string;
  testName: string;
  suite: string;
  failureFingerprint?: string;
  failureSignature?: FailureSignature;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
  seenCount?: number;
  consecutiveFailures?: number;
  lastRunId?: string;
  lastError?: string;
  lastStackTrace?: string;
  failurePattern?: string;
  gitSha: string;
  branch: string;
  environment: string;
  environmentKey?: string;
  state?: ActiveFailureState;
  stateChangedAt?: Date;
  stateChangedBy?: string;
  assignedTo?: string;
  severity?: ActiveFailureSeverity;
  isFlaky?: boolean;
  isBlocking?: boolean;
  resolvedAt?: Date | null;
  tags?: string[];
  relatedIssues?: string[];
  notes?: string;
  lastAlertedAt?: Date;
  alertCount?: number;
}

const COLLECTION_NAME = 'active_failures';

/**
 * ActiveFailure model for MongoDB operations
 */
export class ActiveFailure {
  /**
   * Generate test ID from test file path and test name
   * Format: "testFilePath::testName"
   */
  static generateTestId(testFilePath: string, testName: string): string {
    return `${testFilePath}::${testName}`;
  }

  /**
   * Generate environment key from branch and environment
   * Format: "branch-environment"
   */
  static generateEnvironmentKey(branch: string, environment: string): string {
    return `${branch}-${environment}`;
  }

  /**
   * Create or update an active failure
   * Uses upsert based on testId + environmentKey
   */
  static async upsert(input: ActiveFailureCreateInput): Promise<ActiveFailureDocument> {
    const db = getDB();
    const now = new Date();
    const environmentKey = input.environmentKey || this.generateEnvironmentKey(input.branch, input.environment);

    const activeFailureDoc: ActiveFailureDocument = {
      testId: input.testId,
      testFilePath: input.testFilePath,
      testName: input.testName,
      suite: input.suite,
      failureFingerprint: input.failureFingerprint,
      failureSignature: input.failureSignature,
      firstSeenAt: input.firstSeenAt || now,
      lastSeenAt: input.lastSeenAt || now,
      seenCount: input.seenCount || 1,
      consecutiveFailures: input.consecutiveFailures || 1,
      lastRunId: input.lastRunId,
      lastError: input.lastError,
      lastStackTrace: input.lastStackTrace,
      failurePattern: input.failurePattern,
      gitSha: input.gitSha,
      branch: input.branch,
      environment: input.environment,
      environmentKey,
      state: input.state || 'new',
      stateChangedAt: input.stateChangedAt || (input.state ? now : undefined),
      stateChangedBy: input.stateChangedBy,
      assignedTo: input.assignedTo,
      severity: input.severity || 'medium',
      isFlaky: input.isFlaky || false,
      isBlocking: input.isBlocking || false,
      resolvedAt: input.resolvedAt ?? null,
      tags: input.tags,
      relatedIssues: input.relatedIssues,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };

    // Destructure seenCount out of activeFailureDoc to avoid conflict with $inc
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { seenCount, ...docToSet } = activeFailureDoc;

    const result = await db
      .collection<ActiveFailureDocument>(COLLECTION_NAME)
      .findOneAndUpdate(
        {
          testId: input.testId,
          environmentKey,
        },
        {
          $set: {
            ...docToSet,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
            firstSeenAt: input.firstSeenAt || now,
          },
          $inc: {
            seenCount: 1,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
        }
      );

    if (!result) {
      throw new Error('Failed to upsert active failure');
    }

    return result;
  }

  /**
   * Bulk upsert active failures
   */
  static async bulkUpsert(inputs: ActiveFailureCreateInput[]): Promise<BulkWriteResult> {
    if (inputs.length === 0) {
      return {
        insertedCount: 0,
        matchedCount: 0,
        modifiedCount: 0,
        deletedCount: 0,
        upsertedCount: 0,
        upsertedIds: {},
        ok: 1,
      } as BulkWriteResult;
    }

    const db = getDB();
    const now = new Date();
    const operations: AnyBulkWriteOperation<ActiveFailureDocument>[] = inputs.map(input => {
      const environmentKey = input.environmentKey || this.generateEnvironmentKey(input.branch, input.environment);

      const activeFailureDoc: ActiveFailureDocument = {
        testId: input.testId,
        testFilePath: input.testFilePath,
        testName: input.testName,
        suite: input.suite,
        failureFingerprint: input.failureFingerprint,
        failureSignature: input.failureSignature,
        firstSeenAt: input.firstSeenAt || now,
        lastSeenAt: input.lastSeenAt || now,
        seenCount: input.seenCount || 1,
        consecutiveFailures: input.consecutiveFailures || 1,
        lastRunId: input.lastRunId,
        lastError: input.lastError,
        lastStackTrace: input.lastStackTrace,
        failurePattern: input.failurePattern,
        gitSha: input.gitSha,
        branch: input.branch,
        environment: input.environment,
        environmentKey,
        state: input.state || 'new',
        stateChangedAt: input.stateChangedAt || (input.state ? now : undefined),
        stateChangedBy: input.stateChangedBy,
        assignedTo: input.assignedTo,
        severity: input.severity || 'medium',
        isFlaky: input.isFlaky || false,
        isBlocking: input.isBlocking || false,
        resolvedAt: input.resolvedAt ?? null,
        tags: input.tags,
        relatedIssues: input.relatedIssues,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };

      // Destructure seenCount out of activeFailureDoc to avoid conflict with $inc
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { seenCount, ...docToSet } = activeFailureDoc;

      return {
        updateOne: {
          filter: {
            testId: input.testId,
            environmentKey,
          },
          update: {
            $set: {
              ...docToSet,
              updatedAt: now,
            },
            $setOnInsert: {
              createdAt: now,
              firstSeenAt: input.firstSeenAt || now,
            },
            $inc: {
              seenCount: 1,
            },
          },
          upsert: true,
        },
      };
    });

    return await db
      .collection<ActiveFailureDocument>(COLLECTION_NAME)
      .bulkWrite(operations);
  }

  /**
   * Mark an active failure as resolved
   * Sets state to 'resolved', resolvedAt, and stateChangedAt
   */
  static async markAsResolved(
    testId: string,
    environmentKey: string,
    resolvedAt?: Date
  ): Promise<ActiveFailureDocument | null> {
    const db = getDB();
    const now = resolvedAt || new Date();

    const result = await db
      .collection<ActiveFailureDocument>(COLLECTION_NAME)
      .findOneAndUpdate(
        {
          testId,
          environmentKey,
          resolvedAt: null, // Only update if not already resolved
        },
        {
          $set: {
            state: 'resolved' as ActiveFailureState,
            resolvedAt: now,
            stateChangedAt: now,
            updatedAt: now,
          },
        },
        {
          returnDocument: 'after',
        }
      );

    return result || null;
  }

  /**
   * Find active failures by criteria
   */
  static async find(filters: {
    testId?: string;
    testFilePath?: string;
    suite?: string;
    branch?: string;
    environment?: string;
    environmentKey?: string;
    state?: ActiveFailureState;
    severity?: ActiveFailureSeverity;
    isFlaky?: boolean;
    isBlocking?: boolean;
    failureFingerprint?: string;
    resolvedOnly?: boolean; // If true, only return resolved failures
    unresolvedOnly?: boolean; // If true, only return unresolved failures (default)
    minAge?: Date; // Failures first seen before this date
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
  }): Promise<{ entries: ActiveFailureDocument[]; total: number }> {
    const db = getDB();
    const {
      testId,
      testFilePath,
      suite,
      branch,
      environment,
      environmentKey,
      state,
      severity,
      isFlaky,
      isBlocking,
      failureFingerprint,
      resolvedOnly,
      unresolvedOnly = true, // Default to unresolved only
      minAge,
      limit = 100,
      skip = 0,
      sort = { firstSeenAt: -1 },
    } = filters;

    const query: Filter<ActiveFailureDocument> = {};

    if (testId) query.testId = testId;
    if (testFilePath) query.testFilePath = testFilePath;
    if (suite) query.suite = suite;
    if (branch) query.branch = branch;
    if (environment) query.environment = environment;
    if (environmentKey) query.environmentKey = environmentKey;
    if (state) query.state = state;
    if (severity) query.severity = severity;
    if (isFlaky !== undefined) query.isFlaky = isFlaky;
    if (isBlocking !== undefined) query.isBlocking = isBlocking;
    if (failureFingerprint) query.failureFingerprint = failureFingerprint;

    // Handle resolved/unresolved filtering
    if (resolvedOnly) {
      query.resolvedAt = { $ne: null };
    } else if (unresolvedOnly) {
      query.resolvedAt = null;
    }

    // Filter by minimum age
    if (minAge) {
      query.firstSeenAt = { $lte: minAge };
    }

    const [entries, total] = await Promise.all([
      db
        .collection<ActiveFailureDocument>(COLLECTION_NAME)
        .find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection<ActiveFailureDocument>(COLLECTION_NAME).countDocuments(query),
    ]);

    return { entries, total };
  }

  /**
   * Find active failure by ID
   */
  static async findById(id: string): Promise<ActiveFailureDocument | null> {
    const db = getDB();
    return await db
      .collection<ActiveFailureDocument>(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) });
  }

  /**
   * Find active failure by testId and environmentKey
   */
  static async findByTestIdAndEnvironment(
    testId: string,
    environmentKey: string
  ): Promise<ActiveFailureDocument | null> {
    const db = getDB();
    return await db
      .collection<ActiveFailureDocument>(COLLECTION_NAME)
      .findOne({
        testId,
        environmentKey,
        resolvedAt: null, // Only return if still active
      });
  }

  /**
   * Find active failure by fingerprint and environmentKey
   * Used for grouping similar failures together
   */
  static async findByFingerprint(
    fingerprint: string,
    environmentKey: string
  ): Promise<ActiveFailureDocument | null> {
    const db = getDB();
    return await db
      .collection<ActiveFailureDocument>(COLLECTION_NAME)
      .findOne({
        failureFingerprint: fingerprint,
        environmentKey,
        resolvedAt: null, // Only return if still active
      });
  }

  /**
   * Add or update notes for an active failure
   * 
   * @param id Active failure ID
   * @param notes Notes to add/update
   * @returns Updated active failure document or null if not found
   */
  static async addNote(id: string, notes: string): Promise<ActiveFailureDocument | null> {
    const db = getDB();
    const now = new Date();

    const result = await db
      .collection<ActiveFailureDocument>(COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: {
            notes: notes,
            updatedAt: now,
          },
        },
        {
          returnDocument: 'after',
        }
      );

    return result || null;
  }

  /**
   * Validate if a state transition is allowed
   */
  static isValidTransition(from: ActiveFailureState | undefined, to: ActiveFailureState): boolean {
    if (!from) {
      // New failures can start in any state except 'resolved'
      return to !== 'resolved';
    }
    
    const allowedTransitions = VALID_STATE_TRANSITIONS[from];
    return allowedTransitions.includes(to);
  }

  /**
   * Update the state of an active failure
   * Validates state transitions and tracks state change history
   */
  static async updateState(
    id: string,
    newState: ActiveFailureState,
    userId: string,
    assignedTo?: string
  ): Promise<ActiveFailureDocument | null> {
    const db = getDB();
    const now = new Date();

    // Get current failure to validate transition
    const current = await this.findById(id);
    if (!current) {
      throw new Error(`Active failure with id ${id} not found`);
    }

    // Validate state transition
    if (!this.isValidTransition(current.state, newState)) {
      throw new Error(
        `Invalid state transition from '${current.state || 'undefined'}' to '${newState}'. ` +
        `Allowed transitions: ${VALID_STATE_TRANSITIONS[current.state || 'new']?.join(', ') || 'none'}`
      );
    }

    // Build update object
    const updateFields: Partial<ActiveFailureDocument> = {
      state: newState,
      stateChangedAt: now,
      stateChangedBy: userId,
      updatedAt: now,
    };

    // Update assignedTo if provided
    if (assignedTo !== undefined) {
      updateFields.assignedTo = assignedTo || undefined;
    }

    // Update state and track change
    const result = await db
      .collection<ActiveFailureDocument>(COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: updateFields,
        },
        {
          returnDocument: 'after',
        }
      );

    // Append state change event (async, non-blocking)
    if (result) {
      const { FailureEvent } = await import('./FailureEvent.js');
      FailureEvent.create({
        activeFailureId: result._id!,
        testId: result.testId,
        testFilePath: result.testFilePath,
        eventType: 'state_changed',
        metadata: {
          previousState: current.state,
          newState,
          state: newState,
          seenCount: result.seenCount,
          consecutiveFailures: result.consecutiveFailures,
          severity: result.severity,
          isFlaky: result.isFlaky,
          environmentKey: result.environmentKey,
        },
      }).catch((error) => {
        console.warn('[ActiveFailure] Failed to append state change event:', error);
      });
    }

    return result || null;
  }

  /**
   * Delete an active failure (when test passes)
   */
  static async delete(testId: string, environmentKey: string): Promise<boolean> {
    const db = getDB();
    const result = await db
      .collection<ActiveFailureDocument>(COLLECTION_NAME)
      .deleteOne({
        testId,
        environmentKey,
      });

    return result.deletedCount > 0;
  }

  /**
   * Get active failure statistics
   */
  static async getStatistics(options: {
    branch?: string;
    environment?: string;
    suite?: string;
  }): Promise<{
    total: number;
    bySeverity: Record<ActiveFailureSeverity, number>;
    byState: Record<ActiveFailureState, number>;
    bySuite: Record<string, number>;
    flakyCount: number;
    blockingCount: number;
  }> {
    const db = getDB();
    const { branch, environment, suite } = options;

    const query: Filter<ActiveFailureDocument> = {
      resolvedAt: null, // Only active failures
    };

    if (branch) query.branch = branch;
    if (environment) query.environment = environment;
    if (suite) query.suite = suite;

    const failures = await db
      .collection<ActiveFailureDocument>(COLLECTION_NAME)
      .find(query)
      .toArray();

    const stats = {
      total: failures.length,
      bySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      } as Record<ActiveFailureSeverity, number>,
      byState: {
        new: 0,
        acknowledged: 0,
        investigating: 0,
        suppressed: 0,
        fixed_pending_verification: 0,
        resolved: 0,
      } as Record<ActiveFailureState, number>,
      bySuite: {} as Record<string, number>,
      flakyCount: 0,
      blockingCount: 0,
    };

    failures.forEach((failure) => {
      // Count by severity
      if (failure.severity) {
        stats.bySeverity[failure.severity] = (stats.bySeverity[failure.severity] || 0) + 1;
      }

      // Count by state
      if (failure.state) {
        stats.byState[failure.state] = (stats.byState[failure.state] || 0) + 1;
      }

      // Count by suite
      stats.bySuite[failure.suite] = (stats.bySuite[failure.suite] || 0) + 1;

      // Count flaky and blocking
      if (failure.isFlaky) {
        stats.flakyCount++;
      }
      if (failure.isBlocking) {
        stats.blockingCount++;
      }
    });

    return stats;
  }

  /**
   * Ensure indexes exist for efficient querying
   * 
   * Creates indexes for:
   * - testId + environmentKey (compound, unique) - Primary lookup
   * - failureFingerprint (for grouping similar failures)
   * - state (for filtering by lifecycle state)
   * - firstSeenAt (for sorting by failure age)
   * - branch (for filtering by branch)
   * - suite (for filtering by test suite)
   * - resolvedAt (for filtering active vs resolved)
   */
  static async ensureIndexes(): Promise<void> {
    const db = getDB();
    const collection = db.collection<ActiveFailureDocument>(COLLECTION_NAME);

    try {
      // Compound unique index for testId + environmentKey (primary lookup)
      await collection.createIndex(
        { testId: 1, environmentKey: 1 },
        { unique: true, background: true, name: 'idx_testId_environmentKey' }
      );

      // Index on failureFingerprint for grouping similar failures
      await collection.createIndex(
        { failureFingerprint: 1 },
        { background: true, sparse: true, name: 'idx_failureFingerprint' }
      );

      // Index on state for filtering by lifecycle state
      await collection.createIndex(
        { state: 1 },
        { background: true, sparse: true, name: 'idx_state' }
      );

      // Index on firstSeenAt for sorting by failure age
      await collection.createIndex(
        { firstSeenAt: -1 },
        { background: true, name: 'idx_firstSeenAt' }
      );

      // Index on branch for filtering by branch
      await collection.createIndex(
        { branch: 1 },
        { background: true, name: 'idx_branch' }
      );

      // Index on suite for filtering by test suite
      await collection.createIndex(
        { suite: 1 },
        { background: true, name: 'idx_suite' }
      );

      // Index on resolvedAt for filtering active vs resolved
      await collection.createIndex(
        { resolvedAt: 1 },
        { background: true, sparse: true, name: 'idx_resolvedAt' }
      );

      // Compound index for common query: branch + suite + unresolved
      await collection.createIndex(
        { branch: 1, suite: 1, resolvedAt: 1 },
        { background: true, name: 'idx_branch_suite_resolved' }
      );

      // Compound index for common query: environment + state
      await collection.createIndex(
        { environment: 1, state: 1 },
        { background: true, name: 'idx_environment_state' }
      );

      // Index on stateChangedAt for sorting by state change time
      await collection.createIndex(
        { stateChangedAt: -1 },
        { background: true, sparse: true, name: 'idx_stateChangedAt' }
      );

      // Index on stateChangedBy for filtering by user
      await collection.createIndex(
        { stateChangedBy: 1 },
        { background: true, sparse: true, name: 'idx_stateChangedBy' }
      );
    } catch (error) {
      // Index creation might fail if indexes already exist, which is fine
      // Log but don't throw to allow application to continue
      if (error instanceof Error && !error.message.includes('already exists')) {
        console.warn('[ActiveFailure] Warning: Could not create all indexes:', error);
      }
    }
  }
}

