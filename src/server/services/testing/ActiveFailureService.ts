import { ActiveFailure, type ActiveFailureDocument, type ActiveFailureCreateInput, type FailureSignature } from '../../models/ActiveFailure.js';
import { FailureEvent, type FailureEventDocument, type FailureEventType } from '../../models/FailureEvent.js';
import { logger } from '../../utils/logger.js';
import { createHash } from 'crypto';
import { getDB } from '../../config/database.js';
import { ObjectId } from 'mongodb';
import type { TestFailure } from '../../models/TestHistory.js'; // Imported only for type usage in generateFailureFingerprint
import { TestHistoryDocument } from '../../models/TestHistory.js'; // Needed for syncActiveFailures signature

/**
 * Active Failure Service
 * 
 * Service for syncing active failures from test_history.
 * Implements the derived view pattern - active_failures is built from test_history
 * to prevent state drift.
 */
/**
 * Alert configuration for active failure notifications
 */
export interface AlertConfig {
  /** Critical severity timeout in milliseconds (default: 24 hours) */
  criticalSeverityTimeout: number;
  /** Alert suppression window in milliseconds (default: 24 hours) */
  alertSuppressionWindow: number;
  /** Escalation threshold: number of runs (default: 5) */
  escalationRunThreshold: number;
  /** Escalation threshold: time in milliseconds (default: 24 hours) */
  escalationTimeThreshold: number;
  /** Critical suites that should always alert when new (default: ['e2e']) */
  criticalSuites: string[];
  /** Investigating state timeout in milliseconds (default: 48 hours) */
  investigatingTimeout: number;
  /** Long-standing failure timeout in milliseconds (default: 7 days) */
  longStandingTimeout: number;
  /** Per-suite alert rules: suites that always alert (default: ['e2e']) */
  alwaysAlertSuites?: string[];
  /** Per-suite alert rules: suites that only alert on new (default: ['unit']) */
  onlyNewAlertSuites?: string[];
  /** Per-severity alert rules: severities that always alert (default: ['critical']) */
  alwaysAlertSeverities?: string[];
  /** Per-severity alert rules: severities that never alert (default: ['low']) */
  neverAlertSeverities?: string[];
}

const DEFAULT_ALERT_CONFIG: AlertConfig = {
  criticalSeverityTimeout: parseInt(process.env.ALERT_CRITICAL_SLA_HOURS || '24') * 60 * 60 * 1000, // 24 hours (configurable)
  alertSuppressionWindow: parseInt(process.env.ALERT_NEW_FAILURE_WINDOW_HOURS || '24') * 60 * 60 * 1000, // 24 hours (configurable)
  escalationRunThreshold: parseInt(process.env.ALERT_ESCALATION_RUN_THRESHOLD || '5'), // 5 runs (configurable)
  escalationTimeThreshold: parseInt(process.env.ALERT_ESCALATION_TIME_THRESHOLD_HOURS || '24') * 60 * 60 * 1000, // 24 hours (configurable)
  criticalSuites: process.env.ALERT_CRITICAL_SUITES ? process.env.ALERT_CRITICAL_SUITES.split(',') : ['e2e'],
  investigatingTimeout: parseInt(process.env.ALERT_INVESTIGATING_SLA_HOURS || '48') * 60 * 60 * 1000, // 48 hours (configurable)
  longStandingTimeout: parseInt(process.env.ALERT_LONG_STANDING_DAYS || '7') * 24 * 60 * 60 * 1000, // 7 days (configurable)
  alwaysAlertSuites: process.env.ALERT_ALWAYS_ALERT_SUITES
    ? process.env.ALERT_ALWAYS_ALERT_SUITES.split(',').map(s => s.trim())
    : ['e2e'], // Default: ['e2e'] - always alert for e2e
  onlyNewAlertSuites: process.env.ALERT_ONLY_NEW_ALERT_SUITES
    ? process.env.ALERT_ONLY_NEW_ALERT_SUITES.split(',').map(s => s.trim())
    : ['unit'], // Default: ['unit'] - only alert on new for unit tests
  alwaysAlertSeverities: process.env.ALERT_ALWAYS_ALERT_SEVERITIES
    ? process.env.ALERT_ALWAYS_ALERT_SEVERITIES.split(',').map(s => s.trim())
    : ['critical'], // Default: ['critical'] - always alert for critical
  neverAlertSeverities: process.env.ALERT_NEVER_ALERT_SEVERITIES
    ? process.env.ALERT_NEVER_ALERT_SEVERITIES.split(',').map(s => s.trim())
    : ['low'], // Default: ['low'] - never alert for low severity
};

const ALERT_SUPPRESSION_COLLECTION = 'active_failure_alert_suppression';

interface AlertSuppressionDocument {
  fingerprint: string;
  environmentKey: string;
  lastAlertedAt: Date;
  alertCount: number;
}

export class ActiveFailureService {
  private static instance: ActiveFailureService;
  private alertConfig: AlertConfig = DEFAULT_ALERT_CONFIG;

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  public static getInstance(): ActiveFailureService {
    if (!ActiveFailureService.instance) {
      ActiveFailureService.instance = new ActiveFailureService();
    }
    return ActiveFailureService.instance;
  }

  /**
   * Generate test ID from test file path and test name
   * Format: "testFilePath::testName"
   */
  private generateTestId(testFilePath: string, testName: string): string {
    return ActiveFailure.generateTestId(testFilePath, testName);
  }

  /**
   * Generate environment key from branch and environment
   * Format: "branch-environment"
   */
  private generateEnvironmentKey(branch: string, environment: string): string {
    return ActiveFailure.generateEnvironmentKey(branch, environment);
  }

  /**
   * Generate failure fingerprint for deduplication and grouping
   * 
   * Normalizes the failure signature by:
   * - Extracting exception type
   * - Normalizing stack frames (removing file paths, line numbers)
   * - Normalizing assertion messages (removing dynamic values)
   * 
   * @param failure Test failure to fingerprint
   * @returns SHA-256 hash of normalized failure signature
   */
  private generateFailureFingerprint(failure: TestFailure): string {
    const normalized = {
      exceptionType: this.extractExceptionType(failure.errorMessage || ''),
      topFrames: this.extractTopStackFrames(failure.stackTrace || '', 3),
      assertionTemplate: this.normalizeAssertionMessage(failure.errorMessage || ''),
    };

    const hashInput = JSON.stringify(normalized);
    return createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Extract exception type from error message
   * Examples: "TypeError: ..." -> "TypeError", "AssertionError: ..." -> "AssertionError"
   */
  private extractExceptionType(errorMessage: string): string {
    if (!errorMessage) return 'UnknownError';
    
    // Match common patterns: "ErrorType: message" or "ErrorType(message)"
    const match = errorMessage.match(/^([A-Z][a-zA-Z]*Error|Error|Exception)/);
    return match ? match[1] : 'UnknownError';
  }

  /**
   * Extract and normalize top N stack frames
   * Removes file paths and line numbers to create a stable signature
   */
  private extractTopStackFrames(stackTrace: string, topN: number): string[] {
    if (!stackTrace) return [];

    const lines = stackTrace.split('\n');
    const frames: string[] = [];

    for (const line of lines) {
      if (frames.length >= topN) break;

      // Match stack frame patterns:
      // - "    at FunctionName (file:line:column)" -> "FunctionName"
      // - "    at file:line:column" -> "anonymous"
      // - "Error: message" -> skip (not a frame)
      const frameMatch = line.match(/at\s+(?:([^\s(]+)\s*\(|)([^:]+):(\d+):(\d+)/);
      if (frameMatch) {
        const functionName = frameMatch[1] || 'anonymous';
        // Normalize: remove file path, keep only function name
        frames.push(functionName);
      }
    }

    return frames;
  }

  /**
   * Normalize assertion message by removing dynamic values
   * - Numbers -> "N"
   * - UUIDs -> "UUID"
   * - Timestamps -> "TIMESTAMP"
   * - URLs -> "URL"
   */
  private normalizeAssertionMessage(errorMessage: string): string {
    if (!errorMessage) return '';

    let normalized = errorMessage;

    // Replace UUIDs (8-4-4-4-12 format)
    normalized = normalized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID');

    // Replace timestamps (ISO format or Unix timestamps)
    normalized = normalized.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?/g, 'TIMESTAMP');
    normalized = normalized.replace(/\d{10,13}/g, (match) => {
      // Check if it's a timestamp (reasonable range)
      const num = parseInt(match, 10);
      if (num > 1000000000 && num < 9999999999999) {
        return 'TIMESTAMP';
      }
      return 'N';
    });

    // Replace URLs
    normalized = normalized.replace(/https?:\/\/[^\s]+/g, 'URL');

    // Replace numbers (but keep small numbers that might be part of the message)
    normalized = normalized.replace(/\b\d{4,}\b/g, 'N');

    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
  }

  /**
   * Sync active failures from a test history document
   * 
   * This method:
   * 1. Processes failures from the test run and upserts them into active_failures
   * 2. Marks passing tests as resolved (if they were previously failing)
   * 
   * @param testHistory Test history document to sync from
   */
  async syncActiveFailures(testHistory: TestHistoryDocument): Promise<void> {
    try {
      const testFilePath = testHistory.testFilePath;
      const branch = testHistory.git.branch;
      const environment = testHistory.cicd?.environment || testHistory.environment.os || 'local';
      const environmentKey = this.generateEnvironmentKey(branch, environment);
      const gitSha = testHistory.git.commitHash;
      const suite = testHistory.testType;
      const runId = testHistory._id?.toString() || '';
      const executionTimestamp = testHistory.executionTimestamp;

      // Step 1: Process failures from this run
      if (testHistory.result.failures && testHistory.result.failures.length > 0) {
        // Get flake detection service for checking flaky tests
        const { FlakeDetectionService } = await import('./FlakeDetectionService.js');
        const flakeDetectionService = FlakeDetectionService.getInstance();
        const db = getDB();

        // 1. Gather all unique test IDs and fingerprints
        const testIds = new Set<string>();
        const fingerprints = new Set<string>();
        const processedFailures = [];

        for (const failure of testHistory.result.failures) {
          const testId = this.generateTestId(testFilePath, failure.testName);
          const fingerprint = this.generateFailureFingerprint(failure) || failure.errorFingerprint;

          testIds.add(testId);
          if (fingerprint) fingerprints.add(fingerprint);

          processedFailures.push({
            failure,
            testId,
            fingerprint,
          });
        }

        // 2. Bulk fetch existing active failures (including resolved ones to handle regressions)
        // Use direct DB query for efficient filtering
        const relevantActiveFailures = await db.collection<ActiveFailureDocument>('active_failures').find({
          environmentKey,
          // We include resolved failures so we can resurrect them (regression handling)
          $or: [
            { testId: { $in: Array.from(testIds) } },
            { failureFingerprint: { $in: Array.from(fingerprints) } }
          ]
        }).toArray();

        // Map for quick lookup
        const activeFailuresByTestId = new Map<string, ActiveFailureDocument>();
        const activeFailuresByFingerprint = new Map<string, ActiveFailureDocument>();

        for (const af of relevantActiveFailures) {
          // For testId: always use the latest one (though unique index should prevent duplicates for same env)
          // But since we fetch resolved ones too, there could be multiple for same testId if index is sparse or logic changed.
          // The schema has unique index on { testId: 1, environmentKey: 1 }, but that might be partial or only for active?
          // Actually schema says unique index on testId+environmentKey.
          // If so, there can be only ONE document per testId per env.
          // Wait, if we mark as resolved, do we delete? No, we update resolvedAt.
          // So there is only one document per testId.
          // However, for fingerprint, multiple tests can share it.
          // We want to prioritize an ACTIVE failure for the fingerprint if one exists.

          activeFailuresByTestId.set(af.testId, af);

          if (af.failureFingerprint) {
            const existing = activeFailuresByFingerprint.get(af.failureFingerprint);

            // If no existing entry, set it
            if (!existing) {
              activeFailuresByFingerprint.set(af.failureFingerprint, af);
            }
            // If existing is resolved and current is active, overwrite with active
            else if (existing.resolvedAt !== null && af.resolvedAt === null) {
              activeFailuresByFingerprint.set(af.failureFingerprint, af);
            }
            // If both are active or both are resolved, keep the most recent one (by lastSeenAt)
            else if ((existing.resolvedAt === null) === (af.resolvedAt === null)) {
              if (af.lastSeenAt > existing.lastSeenAt) {
                activeFailuresByFingerprint.set(af.failureFingerprint, af);
              }
            }
          }
        }

        // 3. Bulk fetch alert suppressions
        const alertSuppressions = await db.collection<AlertSuppressionDocument>(ALERT_SUPPRESSION_COLLECTION).find({
          environmentKey,
          fingerprint: { $in: Array.from(fingerprints) }
        }).toArray();

        const suppressionByFingerprint = new Map<string, AlertSuppressionDocument>();
        for (const s of alertSuppressions) {
          suppressionByFingerprint.set(s.fingerprint, s);
        }

        // 4. Parallel Flake Detection
        // Execute flake detection checks in parallel
        const flakeReports = new Map<string, any>();
        const flakeCheckPromises = processedFailures.map(async ({ testId }) => {
          try {
            const report = await flakeDetectionService.getTestFlakeReport(testId, {
              suite: suite as any,
              env: environment,
              branch,
              minRuns: 10,
              timeWindowDays: 30,
            });
            if (report) {
              flakeReports.set(testId, report);
            }
          } catch (error) {
            logger.debug({ error, testId }, 'Error checking flake status, continuing');
          }
        });

        await Promise.all(flakeCheckPromises);

        // 5. Process failures in memory
        const upsertInputs: ActiveFailureCreateInput[] = [];
        const failureEventsInput: any[] = [];
        const alertsToSend: any[] = [];
        const suppressionUpdates = new Set<string>();

        for (const { failure, testId, fingerprint } of processedFailures) {
          const failureSignature = {
            exceptionType: this.extractExceptionType(failure.errorMessage || ''),
            topStackFrames: this.extractTopStackFrames(failure.stackTrace || '', 3),
            assertionMessage: this.normalizeAssertionMessage(failure.errorMessage || ''),
          };

          const existingByTestId = activeFailuresByTestId.get(testId);
          const existingByFingerprint = fingerprint ? activeFailuresByFingerprint.get(fingerprint) : undefined;
          const existingFailure = existingByTestId || existingByFingerprint;

          // Determine consecutive failures count and state
          let consecutiveFailures = 1;
          let state: 'new' | 'acknowledged' | 'investigating' | 'suppressed' | 'fixed_pending_verification' | 'resolved' = 'new';
          let stateChangedAt: Date | undefined = executionTimestamp;

          if (existingFailure) {
            if (existingFailure.resolvedAt === null) {
              // Active failure continues
              consecutiveFailures = (existingFailure.consecutiveFailures || 0) + 1;
              state = existingFailure.state || 'new';
              stateChangedAt = existingFailure.stateChangedAt;
            } else {
              // Resolved failure recurring (regression) - reset to new
              consecutiveFailures = 1;
              state = 'new';
              stateChangedAt = executionTimestamp;
            }
          }

          // Determine first seen date
          const firstSeenAt = existingByFingerprint?.firstSeenAt ||
                              existingByTestId?.firstSeenAt ||
                              executionTimestamp;

          // Check if test is flaky
          let isFlaky = false;
          let severity = this.determineSeverity(failure);
          
          const flakeReport = flakeReports.get(testId);
          if (flakeReport && flakeReport.status === 'flaky') {
            isFlaky = true;
            if (severity === 'critical') severity = 'high';
            else if (severity === 'high') severity = 'medium';
          }

          // Prepare upsert input
          // Use seenCount based on existingByTestId to match DB $inc behavior (starts at 1 for new testId)
          const seenCount = existingByTestId ? (existingByTestId.seenCount || 0) + 1 : 1;

          const upsertInput: ActiveFailureCreateInput = {
            testId,
            testFilePath,
            testName: failure.testName,
            suite,
            failureFingerprint: fingerprint,
            failureSignature,
            firstSeenAt,
            lastSeenAt: executionTimestamp,
            seenCount,
            consecutiveFailures,
            lastRunId: runId,
            lastError: failure.errorMessage,
            lastStackTrace: failure.stackTrace,
            gitSha,
            branch,
            environment,
            environmentKey,
            state,
            stateChangedAt,
            severity,
            isFlaky,
            isBlocking: false,
            resolvedAt: null,
          };

          upsertInputs.push(upsertInput);

          // Prepare simulated updated document for logic checks
          const simulatedDoc: ActiveFailureDocument = {
            ...upsertInput,
            // We don't have _id for new ones yet, but logic requiring _id (events) is handled later
            // logic requiring properties uses simulatedDoc
            _id: existingByTestId?._id || new ObjectId(), // Temporary ID for logic if needed
            createdAt: existingByTestId?.createdAt || new Date(),
            updatedAt: new Date(),
            seenCount, // Explicitly set to match DB logic
          } as ActiveFailureDocument;

          // Check alert status
          try {
            // Check suppression in memory
            let wasRecentlyAlerted = false;
            if (fingerprint) {
              const suppression = suppressionByFingerprint.get(fingerprint);
              if (suppression) {
                const timeSinceLastAlert = Date.now() - suppression.lastAlertedAt.getTime();
                wasRecentlyAlerted = timeSinceLastAlert < this.alertConfig.alertSuppressionWindow;
              }
            }

            const shouldAlertResult = await this.shouldAlert(simulatedDoc, wasRecentlyAlerted);

            if (shouldAlertResult) {
              if (fingerprint) suppressionUpdates.add(fingerprint);
              
              const escalationContext = this.getEscalationContext(simulatedDoc);
              // Store index to resolve ID later
              alertsToSend.push({
                doc: simulatedDoc,
                context: escalationContext,
                inputIndex: upsertInputs.length - 1
              });
            }
          } catch (error) {
            logger.warn({ error, testId }, 'Error checking alert status, continuing');
          }

          // Track event data to be created after bulk upsert
          failureEventsInput.push({
            eventType: existingFailure ? 'updated' : 'created',
            previousState: existingFailure?.state,
            simulatedDoc
          });
        }

        // 5. Execute Bulk Upsert
        const bulkResult = await ActiveFailure.bulkUpsert(upsertInputs);

        // 6. Execute Bulk Failure Events
        const eventsToCreate = [];

        // Map upserted IDs for new documents
        // bulkResult.upsertedIds is { index: _id }
        const upsertedIds = bulkResult.upsertedIds || {};

        for (let i = 0; i < failureEventsInput.length; i++) {
          const { eventType, previousState, simulatedDoc } = failureEventsInput[i];
          const testId = upsertInputs[i].testId;

          let activeFailureId: ObjectId;

          // Try to find _id from existing docs
          const existingDoc = activeFailuresByTestId.get(testId);
          if (existingDoc) {
            activeFailureId = existingDoc._id!;
          } else {
            // Must be a new document, get from upsert result
            // upsertedIds keys are strings of indices
            activeFailureId = upsertedIds[i] as ObjectId;
          }

          if (activeFailureId) {
            eventsToCreate.push({
              activeFailureId,
              testId: simulatedDoc.testId,
              testFilePath: simulatedDoc.testFilePath,
              eventType,
              metadata: {
                state: simulatedDoc.state,
                seenCount: simulatedDoc.seenCount,
                consecutiveFailures: simulatedDoc.consecutiveFailures,
                severity: simulatedDoc.severity,
                isFlaky: simulatedDoc.isFlaky,
                environmentKey: simulatedDoc.environmentKey,
                previousState,
              }
            });
          }
        }

        if (eventsToCreate.length > 0) {
          try {
            await FailureEvent.bulkCreate(eventsToCreate);
          } catch (error) {
            logger.warn({ error }, 'Error bulk creating failure events');
          }
        }

        // 7. Send Alerts and Update Suppression
        // Update suppression first
        for (const fingerprint of suppressionUpdates) {
          await this.recordAlertSent(fingerprint, environmentKey);
        }

        // Send notifications with resolved IDs
        for (const { doc, context, inputIndex } of alertsToSend) {
          try {
            // Resolve real _id before sending
            const testId = doc.testId;
            const existingDoc = activeFailuresByTestId.get(testId);
            if (existingDoc) {
              doc._id = existingDoc._id!;
            } else if (inputIndex !== undefined) {
              doc._id = upsertedIds[inputIndex] as ObjectId;
            }

            await this.sendAlert(doc, context);
          } catch (error) {
            logger.error({ error, testId: doc.testId }, 'Error sending alert notification');
          }
        }

        logger.info(
          { count: processedFailures.length },
          'Bulk synced active failures from test history'
        );
      }

      // Step 2: Mark passing tests as resolved
      // Get all active failures for this test file and environment
      const { entries: activeFailures } = await ActiveFailure.find({
        testFilePath,
        environmentKey,
        unresolvedOnly: true,
      });

      // Extract test IDs from current failures
      const currentFailureTestIds = new Set(
        (testHistory.result.failures || []).map(failure =>
          this.generateTestId(testFilePath, failure.testName)
        )
      );

      // For each active failure, check if the test passed in this run
      // If a test was previously failing but is not in the current failures list, it must have passed
      let resolvedCount = 0;
      for (const activeFailure of activeFailures) {
        // If the test ID is not in the current failures list, it passed
        if (!currentFailureTestIds.has(activeFailure.testId)) {
          // Mark as resolved
          const resolvedFailure = await ActiveFailure.markAsResolved(activeFailure.testId, environmentKey, executionTimestamp);
          
          // Append resolved event
          if (resolvedFailure) {
            try {
              const duration = executionTimestamp.getTime() - activeFailure.firstSeenAt.getTime();
              await this.appendFailureEvent(resolvedFailure, 'resolved', {
                duration,
              });
            } catch (error) {
              logger.warn({ error, testId: activeFailure.testId }, 'Error appending resolved event, continuing');
              // Don't throw - event tracking failure shouldn't break sync
            }
          }
          
          resolvedCount++;
          logger.debug(
            { testId: activeFailure.testId, environmentKey },
            'Marked test as resolved (passed in latest run)'
          );
        }
      }

      logger.info(
        {
          testFilePath,
          environmentKey,
          failureCount: testHistory.result.failures?.length || 0,
          resolvedCount,
        },
        'Completed syncing active failures from test history'
      );
    } catch (error) {
      logger.error({ error, testHistory: testHistory._id }, 'Error syncing active failures');
      // Don't throw - we don't want to break test history ingestion if sync fails
      // The sync can be retried later or rebuilt from test_history
    }
  }

  /**
   * Determine severity from test failure
   */
  private determineSeverity(failure: TestFailure): 'critical' | 'high' | 'medium' | 'low' {
    // Use error severity if available (from error categorization)
    if (failure.errorSeverity) {
      return failure.errorSeverity;
    }

    // Default severity based on error category
    if (failure.errorCategory === 'timeout' || failure.errorCategory === 'database') {
      return 'high';
    }
    if (failure.errorCategory === 'network' || failure.errorCategory === 'assertion') {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Get active failures with optional filters
   */
  async getActiveFailures(filters: {
    branch?: string;
    suite?: string;
    state?: 'new' | 'investigating' | 'acknowledged' | 'resolved';
    isFlaky?: boolean;
    minAge?: Date; // Failures first seen before this date
    failureFingerprint?: string; // Filter by fingerprint
    unresolvedOnly?: boolean; // Filter unresolved only (default: true)
    limit?: number;
    skip?: number;
    groupBy?: 'fingerprint'; // Group results by fingerprint
  }): Promise<{ 
    entries: ActiveFailureDocument[]; 
    total: number; 
    grouped?: Array<{
      fingerprint: string;
      signature: FailureSignature;
      count: number;
      failures: ActiveFailureDocument[];
      firstSeenAt: Date;
      lastSeenAt: Date;
      isNew: boolean; // First seen in last 24 hours
    }> 
  }> {
    try {
      const { groupBy, unresolvedOnly = true, ...restFilters } = filters;
      
      const result = await ActiveFailure.find({
        ...restFilters,
        unresolvedOnly,
        sort: { firstSeenAt: -1 }, // Sort by first seen (newest first)
      });
      
      // Group by fingerprint if requested
      if (groupBy === 'fingerprint') {
        const grouped = this.groupFailuresByFingerprint(result.entries);
        return { ...result, grouped };
      }
      
      return result;
    } catch (error) {
      logger.error({ error, filters }, 'Error getting active failures');
      throw error;
    }
  }

  /**
   * Group failures by fingerprint with metadata
   */
  private groupFailuresByFingerprint(failures: ActiveFailureDocument[]): Array<{
    fingerprint: string;
    signature: FailureSignature;
    count: number;
    failures: ActiveFailureDocument[];
    firstSeenAt: Date;
    lastSeenAt: Date;
    isNew: boolean; // First seen in last 24 hours
  }> {
    const groups = new Map<string, ActiveFailureDocument[]>();
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);

    // Group failures by fingerprint
    for (const failure of failures) {
      const fingerprint = failure.failureFingerprint || 'unknown';
      if (!groups.has(fingerprint)) {
        groups.set(fingerprint, []);
      }
      groups.get(fingerprint)!.push(failure);
    }

    // Convert to array format with metadata
    return Array.from(groups.entries()).map(([fingerprint, failureList]) => {
      const firstFailure = failureList[0];
      const firstSeenAt = failureList.reduce((earliest, f) => 
        f.firstSeenAt < earliest ? f.firstSeenAt : earliest, 
        firstFailure.firstSeenAt
      );
      const lastSeenAt = failureList.reduce((latest, f) => 
        f.lastSeenAt > latest ? f.lastSeenAt : latest, 
        firstFailure.lastSeenAt
      );
      const isNew = firstSeenAt.getTime() > twentyFourHoursAgo;

      return {
        fingerprint,
        signature: firstFailure.failureSignature || {
          exceptionType: 'UnknownError',
          topStackFrames: [],
          assertionMessage: firstFailure.lastError || '',
        },
        count: failureList.length,
        failures: failureList,
        firstSeenAt,
        lastSeenAt,
        isNew,
      };
    }).sort((a, b) => b.count - a.count); // Sort by count (most failures first)
  }

  /**
   * Get active failure statistics
   */
  async getStatistics(options: {
    branch?: string;
    environment?: string;
    suite?: string;
  }): Promise<{
    total: number;
    bySeverity: Record<string, number>;
    byState: Record<string, number>;
    bySuite: Record<string, number>;
    flakyCount: number;
    blockingCount: number;
  }> {
    try {
      return await ActiveFailure.getStatistics(options);
    } catch (error) {
      logger.error({ error, options }, 'Error getting active failure statistics');
      throw error;
    }
  }

  /**
   * Update the state of an active failure
   * Validates state transitions and updates assignedTo if provided
   */
  async updateState(
    failureId: string,
    newState: 'new' | 'acknowledged' | 'investigating' | 'suppressed' | 'fixed_pending_verification' | 'resolved',
    userId: string,
    assignedTo?: string
  ): Promise<ActiveFailureDocument> {
    try {
      const updated = await ActiveFailure.updateState(failureId, newState, userId, assignedTo);
      if (!updated) {
        throw new Error(`Active failure with id ${failureId} not found`);
      }
      return updated;
    } catch (error) {
      logger.error({ error, failureId, newState, userId }, 'Error updating active failure state');
      throw error;
    }
  }

  /**
   * Get active failures by state
   */
  async getFailuresByState(
    state: 'new' | 'acknowledged' | 'investigating' | 'suppressed' | 'fixed_pending_verification' | 'resolved',
    filters?: {
      branch?: string;
      suite?: string;
      environment?: string;
      limit?: number;
      skip?: number;
    }
  ): Promise<{ entries: ActiveFailureDocument[]; total: number }> {
    try {
      return await ActiveFailure.find({
        state,
        ...filters,
        unresolvedOnly: state !== 'resolved', // Only filter by resolvedAt if not querying resolved failures
        sort: { firstSeenAt: -1 },
      });
    } catch (error) {
      logger.error({ error, state, filters }, 'Error getting failures by state');
      throw error;
    }
  }

  /**
   * Get state change history for an active failure
   * Returns events from FailureEvent collection filtered by state_changed event type
   */
  async getStateHistory(failureId: string): Promise<Array<{
    timestamp: Date;
    previousState?: string;
    newState: string;
    changedBy?: string;
    metadata?: Record<string, unknown>;
  }>> {
    try {
      const { FailureEvent } = await import('../../models/FailureEvent.js');
      
      // Get the active failure to get its _id
      const failure = await ActiveFailure.findById(failureId);
      if (!failure || !failure._id) {
        throw new Error(`Active failure with id ${failureId} not found`);
      }

      // Query FailureEvent collection for state_changed events
      const events = await FailureEvent.find({
        activeFailureId: failure._id,
        eventType: 'state_changed',
        sort: { timestamp: -1 }, // Most recent first
      });

      // Transform events to state history format
      return events.map(event => ({
        timestamp: event.timestamp,
        previousState: event.metadata?.previousState as string | undefined,
        newState: event.metadata?.newState as string || event.metadata?.state as string || 'unknown',
        changedBy: event.metadata?.changedBy as string | undefined,
        metadata: event.metadata,
      }));
    } catch (error) {
      logger.error({ error, failureId }, 'Error getting state history');
      throw error;
    }
  }

  /**
   * Add or update notes for an active failure
   * 
   * @param failureId Active failure ID
   * @param notes Notes to add/update
   * @returns Updated active failure document
   */
  async addNote(failureId: string, notes: string): Promise<ActiveFailureDocument> {
    try {
      const updated = await ActiveFailure.addNote(failureId, notes);
      if (!updated) {
        throw new Error(`Active failure with id ${failureId} not found`);
      }
      return updated;
    } catch (error) {
      logger.error({ error, failureId }, 'Error adding note to active failure');
      throw error;
    }
  }

  /**
   * Configure alert thresholds
   */
  setAlertConfig(config: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...config };
  }

  /**
   * Get current alert configuration
   */
  getAlertConfig(): AlertConfig {
    return { ...this.alertConfig };
  }

  /**
   * Determine if an active failure should trigger an alert
   * 
   * Alert rules:
   * - Alert if state is 'new' (unless already alerted recently)
   * - Alert if severity is 'critical' and unresolved for > threshold (SLA breach)
   * - Alert if affecting critical suite (e2e) and state is 'new'
   * - Alert if isBlocking === true and state is 'new'
   * - Alert if investigating state for > 48 hours (escalation)
   * - Alert if new state for > 7 days (long-standing failure)
   * - Don't alert if already acknowledged, investigating, or suppressed (unless SLA breach)
   * - Don't alert if same fingerprint already alerted recently
   * 
   * @param activeFailure Active failure to check
   * @returns true if should alert, false otherwise
   */
  async shouldAlert(activeFailure: ActiveFailureDocument, precalculatedWasRecentlyAlerted?: boolean): Promise<boolean> {
    // Don't alert on resolved failures
    if (activeFailure.resolvedAt !== null) {
      return false;
    }

    // Per-severity rule: Never alert for low severity (unless overridden by other rules)
    if (this.alertConfig.neverAlertSeverities?.includes(activeFailure.severity || 'medium')) {
      // Still allow alerts for long-standing failures or SLA breaches
      const now = Date.now();
      const hoursSinceFirstSeen = (now - activeFailure.firstSeenAt.getTime()) / (1000 * 60 * 60);
      const daysSinceFirstSeen = hoursSinceFirstSeen / 24;
      
      // Only allow if it's a long-standing failure (> 7 days)
      if (daysSinceFirstSeen <= this.alertConfig.longStandingTimeout / (24 * 60 * 60 * 1000)) {
        return false; // Low severity, don't alert unless long-standing
      }
    }

    const now = Date.now();
    const hoursSinceFirstSeen = (now - activeFailure.firstSeenAt.getTime()) / (1000 * 60 * 60);
    const daysSinceFirstSeen = hoursSinceFirstSeen / 24;
    const stateChangedAt = activeFailure.stateChangedAt || activeFailure.firstSeenAt;
    const hoursSinceStateChange = (now - stateChangedAt.getTime()) / (1000 * 60 * 60);

    // Check if we've already alerted for this fingerprint recently
    // Use precalculated value if provided, otherwise query
    let wasRecentlyAlerted = precalculatedWasRecentlyAlerted;
    if (wasRecentlyAlerted === undefined) {
      wasRecentlyAlerted = activeFailure.failureFingerprint
        ? await this.wasRecentlyAlerted(activeFailure.failureFingerprint, activeFailure.environmentKey)
        : false;
    }

    // Per-severity rule: Always alert for critical severity (unless recently alerted)
    if (this.alertConfig.alwaysAlertSeverities?.includes(activeFailure.severity || 'medium')) {
      if (!wasRecentlyAlerted) {
        return true; // Critical severity, always alert
      }
    }

    // Per-suite rule: Always alert for certain suites (e.g., e2e)
    if (this.alertConfig.alwaysAlertSuites?.includes(activeFailure.suite)) {
      if (!wasRecentlyAlerted) {
        return true; // Always alert suite
      }
    }

    // Per-suite rule: Only alert on new for certain suites (e.g., unit)
    if (this.alertConfig.onlyNewAlertSuites?.includes(activeFailure.suite)) {
      if (activeFailure.state !== 'new') {
        return false; // Only alert on new for this suite
      }
    }

    // Alert if state is 'new'
    if (activeFailure.state === 'new') {
      if (wasRecentlyAlerted) {
        // Check if it's a long-standing failure (> 7 days) - alert anyway
        if (daysSinceFirstSeen > this.alertConfig.longStandingTimeout / (24 * 60 * 60 * 1000)) {
          return true; // Long-standing failure, alert even if recently alerted
        }
        return false; // Already alerted recently
      }
      return true; // New failure, alert
    }

    // Don't alert if already acknowledged, investigating, or suppressed (unless SLA breach)
    if (activeFailure.state === 'acknowledged' || activeFailure.state === 'suppressed') {
      // Only alert if it's a critical severity SLA breach
      if (activeFailure.severity === 'critical' && 
          hoursSinceFirstSeen > this.alertConfig.criticalSeverityTimeout / (1000 * 60 * 60)) {
        if (!wasRecentlyAlerted) {
          return true; // SLA breach, alert
        }
      }
      return false; // Don't alert on acknowledged/suppressed unless SLA breach
    }

    // Alert if investigating for > 48 hours (escalation)
    if (activeFailure.state === 'investigating') {
      if (hoursSinceStateChange > this.alertConfig.investigatingTimeout / (1000 * 60 * 60)) {
        if (!wasRecentlyAlerted) {
          return true; // Escalation: investigating too long
        }
      }
      return false; // Don't alert on investigating unless escalation
    }

    // Alert if severity is 'critical' and unresolved for > threshold (SLA breach)
    if (activeFailure.severity === 'critical' && activeFailure.state !== 'resolved') {
      if (hoursSinceFirstSeen > this.alertConfig.criticalSeverityTimeout / (1000 * 60 * 60)) {
        if (!wasRecentlyAlerted) {
          return true; // SLA breach
        }
      }
    }

    return false; // Don't alert
  }

  /**
   * Check if a fingerprint was recently alerted
   */
  private async wasRecentlyAlerted(
    fingerprint: string,
    environmentKey: string
  ): Promise<boolean> {
    try {
      const db = getDB();
      const collection = db.collection<AlertSuppressionDocument>(ALERT_SUPPRESSION_COLLECTION);
      
      const suppression = await collection.findOne({
        fingerprint,
        environmentKey,
      });

      if (!suppression) {
        return false;
      }

      const timeSinceLastAlert = Date.now() - suppression.lastAlertedAt.getTime();
      return timeSinceLastAlert < this.alertConfig.alertSuppressionWindow;
    } catch (error) {
      logger.error({ error, fingerprint, environmentKey }, 'Error checking alert suppression');
      // On error, allow alert (fail open)
      return false;
    }
  }

  /**
   * Record that an alert was sent for a fingerprint
   */
  async recordAlertSent(
    fingerprint: string,
    environmentKey: string
  ): Promise<void> {
    try {
      const db = getDB();
      const collection = db.collection<AlertSuppressionDocument>(ALERT_SUPPRESSION_COLLECTION);
      
      await collection.updateOne(
        { fingerprint, environmentKey },
        {
          $set: {
            lastAlertedAt: new Date(),
          },
          $inc: {
            alertCount: 1,
          },
        },
        { upsert: true }
      );
    } catch (error) {
      logger.error({ error, fingerprint, environmentKey }, 'Error recording alert sent');
      // Don't throw - alert suppression failure shouldn't block alerts
    }
  }

  /**
   * Determine if an active failure should be escalated
   * 
   * Escalation rules:
   * - Escalate if failure survives N runs (default: 5)
   * - Escalate if failure survives M hours (default: 24 hours)
   * 
   * @param activeFailure Active failure to check
   * @returns true if should escalate, false otherwise
   */
  shouldEscalate(activeFailure: ActiveFailureDocument): boolean {
    // Don't escalate resolved failures
    if (activeFailure.resolvedAt !== null) {
      return false;
    }

    // Escalate if survived N+ runs
    if (activeFailure.seenCount >= this.alertConfig.escalationRunThreshold) {
      return true;
    }

    // Escalate if active for M+ hours
    const hoursSinceFirstSeen = Date.now() - activeFailure.firstSeenAt.getTime();
    if (hoursSinceFirstSeen >= this.alertConfig.escalationTimeThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Send alert notification for an active failure
   * 
   * @param activeFailure Active failure to alert about
   * @param escalationContext Escalation context (if applicable)
   */
  private async sendAlert(
    activeFailure: ActiveFailureDocument,
    escalationContext: { escalated: boolean; reason?: string; runsSurvived: number; hoursActive: number }
  ): Promise<void> {
    try {
      const { TestFailureNotificationService } = await import('./TestFailureNotificationService.js');
      const notificationService = TestFailureNotificationService.getInstance();

      // Use the existing notifyTestFailures method with adapted data
      // Note: TestFailureNotificationService expects TestFailureNotificationData format
      // We'll create a minimal notification data structure
      const baseUrl = process.env.FRONTEND_BASE_URL || process.env.PUBLIC_URL || 'http://localhost:5173';
      const dashboardUrl = `${baseUrl}/tests/failures?fingerprint=${encodeURIComponent(activeFailure.failureFingerprint || '')}&testId=${encodeURIComponent(activeFailure.testId)}`;
      
      const notificationData = {
        testRunId: activeFailure.lastRunId || 'active-failure',
        testFile: activeFailure.testFilePath,
        failureCount: 1,
        totalTests: 1,
        failures: [{
          test: activeFailure.testName,
          file: activeFailure.testFilePath,
          error: activeFailure.lastError || 'Unknown error',
        }],
        timestamp: activeFailure.lastSeenAt,
        branch: activeFailure.branch,
        environment: activeFailure.environment,
        gitSha: activeFailure.gitSha,
        testResultUrl: dashboardUrl, // Link to failure details in dashboard
      };

      // Send notification
      await notificationService.notifyTestFailures(notificationData);

      // Update lastAlertedAt in active failure (if schema supports it)
      // Note: This is tracked in alert suppression collection, not in active failure itself
      // to avoid schema changes. The alert suppression collection tracks by fingerprint.

      logger.info(
        {
          testId: activeFailure.testId,
          fingerprint: activeFailure.failureFingerprint,
          severity: activeFailure.severity,
          state: activeFailure.state,
          escalated: escalationContext.escalated,
        },
        'Alert notification sent for active failure'
      );
    } catch (error) {
      logger.error(
        { error, testId: activeFailure.testId },
        'Error sending alert notification'
      );
      // Don't throw - alert sending failure shouldn't break sync
    }
  }

  /**
   * Get escalation context for a failure
   */
  getEscalationContext(activeFailure: ActiveFailureDocument): {
    escalated: boolean;
    reason?: string;
    runsSurvived: number;
    hoursActive: number;
  } {
    const escalated = this.shouldEscalate(activeFailure);
    const hoursActive = Math.floor(
      (Date.now() - activeFailure.firstSeenAt.getTime()) / (60 * 60 * 1000)
    );
    const runsSurvived = activeFailure.seenCount;

    let reason: string | undefined;
    if (escalated) {
      if (runsSurvived >= this.alertConfig.escalationRunThreshold) {
        reason = `Survived ${runsSurvived} runs (threshold: ${this.alertConfig.escalationRunThreshold})`;
      } else if (hoursActive >= this.alertConfig.escalationTimeThreshold / (60 * 60 * 1000)) {
        reason = `Active for ${hoursActive} hours (threshold: ${this.alertConfig.escalationTimeThreshold / (60 * 60 * 1000)} hours)`;
      }
    }

    return {
      escalated,
      reason,
      runsSurvived,
      hoursActive,
    };
  }

  /**
   * Append a failure event to the audit trail
   */
  private async appendFailureEvent(
    activeFailure: ActiveFailureDocument,
    eventType: FailureEventType,
    additionalMetadata: Record<string, unknown> = {}
  ): Promise<FailureEventDocument> {
    if (!activeFailure._id) {
      throw new Error('Active failure must have an _id to create event');
    }

    const metadata: FailureEventDocument['metadata'] = {
      state: activeFailure.state,
      seenCount: activeFailure.seenCount,
      consecutiveFailures: activeFailure.consecutiveFailures,
      severity: activeFailure.severity,
      isFlaky: activeFailure.isFlaky,
      environmentKey: activeFailure.environmentKey,
      ...additionalMetadata,
    };

    // Calculate duration for resolved events
    if (eventType === 'resolved' && activeFailure.resolvedAt) {
      metadata.duration = activeFailure.resolvedAt.getTime() - activeFailure.firstSeenAt.getTime();
    }

    return await FailureEvent.create({
      activeFailureId: activeFailure._id,
      testId: activeFailure.testId,
      testFilePath: activeFailure.testFilePath,
      eventType,
      metadata,
    });
  }

  /**
   * Append a state change event
   */
  async appendStateChangeEvent(
    activeFailure: ActiveFailureDocument,
    previousState: string | undefined,
    newState: string
  ): Promise<FailureEventDocument> {
    return await this.appendFailureEvent(activeFailure, 'state_changed', {
      previousState,
      newState,
    });
  }

  /**
   * Ensure database indexes exist for alert suppression collection
   */
  static async ensureAlertSuppressionIndexes(): Promise<void> {
    try {
      const db = getDB();
      const collection = db.collection<AlertSuppressionDocument>(ALERT_SUPPRESSION_COLLECTION);

      // Compound index for lookups by fingerprint + environmentKey
      await collection.createIndex(
        { fingerprint: 1, environmentKey: 1 },
        { unique: true, background: true, name: 'idx_fingerprint_environment' }
      );

      // Index on lastAlertedAt for cleanup queries
      await collection.createIndex(
        { lastAlertedAt: 1 },
        { background: true, name: 'idx_last_alerted_at' }
      );

      logger.debug('ActiveFailureService alert suppression indexes created successfully');
    } catch (error) {
      logger.warn({ error }, 'Some alert suppression indexes may already exist');
      // Don't throw - indexes may already exist, which is fine
    }
  }
}

// Export singleton instance getter
export const getActiveFailureService = (): ActiveFailureService => {
  return ActiveFailureService.getInstance();
};
