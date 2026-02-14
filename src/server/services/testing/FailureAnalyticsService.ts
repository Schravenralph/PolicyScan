import { FailureEvent, type FailureEventDocument } from '../../models/FailureEvent.js';
import { ActiveFailure, type ActiveFailureDocument } from '../../models/ActiveFailure.js';
import { logger } from '../../utils/logger.js';
import { type Filter } from 'mongodb';

/**
 * Failure Analytics Service
 * 
 * Provides analytics functions for failure events:
 * - MTTR (Mean Time To Resolution)
 * - Recurrence Rate
 * - Chronic Offender Identification
 */
export class FailureAnalyticsService {
  private static instance: FailureAnalyticsService;

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  public static getInstance(): FailureAnalyticsService {
    if (!FailureAnalyticsService.instance) {
      FailureAnalyticsService.instance = new FailureAnalyticsService();
    }
    return FailureAnalyticsService.instance;
  }

  /**
   * Calculate Mean Time To Resolution (MTTR) with optional filters
   * 
   * @param filters Optional filters for suite, severity, time range
   * @returns MTTR in hours, or 0 if no resolved failures found
   */
  async calculateMTTR(filters?: {
    suite?: string;
    severity?: 'critical' | 'high' | 'medium' | 'low';
    startDate?: Date;
    endDate?: Date;
  }): Promise<number> {
    try {
      const query: Filter<ActiveFailureDocument> = {
        resolvedAt: { $exists: true, $ne: null },
      };

      if (filters?.suite) {
        query.suite = filters.suite;
      }
      if (filters?.severity) {
        query.severity = filters.severity;
      }
      if (filters?.startDate || filters?.endDate) {
        query.resolvedAt = {};
        if (filters.startDate) {
          query.resolvedAt.$gte = filters.startDate;
        }
        if (filters.endDate) {
          query.resolvedAt.$lte = filters.endDate;
        }
      }

      const { entries: resolvedFailures } = await ActiveFailure.find({
        ...query,
        resolvedOnly: true,
        unresolvedOnly: false,
        limit: 10000, // Higher limit for analytics
      } as Parameters<typeof ActiveFailure.find>[0]);

      if (resolvedFailures.length === 0) {
        return 0; // No resolved failures
      }

      // Calculate average time from firstSeenAt to resolvedAt
      const totalDuration = resolvedFailures.reduce((sum, failure) => {
        if (failure.firstSeenAt && failure.resolvedAt) {
          return sum + (failure.resolvedAt.getTime() - failure.firstSeenAt.getTime());
        }
        return sum;
      }, 0);

      const averageDurationMs = totalDuration / resolvedFailures.length;
      const averageDurationHours = averageDurationMs / (1000 * 60 * 60);

      return averageDurationHours;
    } catch (error) {
      logger.error({ error, filters }, 'Error calculating MTTR');
      throw error;
    }
  }

  /**
   * Calculate recurrence rate for a failure fingerprint
   * Returns the ratio of resolutions to total occurrences
   * 
   * @param fingerprint Failure fingerprint
   * @returns Recurrence rate statistics
   */
  async calculateRecurrenceRate(fingerprint: string): Promise<{
    fingerprint: string;
    totalOccurrences: number;
    totalResolutions: number;
    recurrenceRate: number; // resolutions / occurrences
  }> {
    try {
      // Get all active failures with this fingerprint
      const { entries: activeFailures } = await ActiveFailure.find({
        failureFingerprint: fingerprint,
        resolvedOnly: false,
        unresolvedOnly: false,
        limit: 10000,
      });

      if (activeFailures.length === 0) {
        return {
          fingerprint,
          totalOccurrences: 0,
          totalResolutions: 0,
          recurrenceRate: 0,
        };
      }

      // Get all events for these active failures
      const activeFailureIds = activeFailures
        .filter(af => af._id)
        .map(af => af._id!);

      // Count created events (occurrences) - one per active failure
      // Each active failure represents one occurrence
      const totalOccurrences = activeFailures.length;

      // Count resolved events (resolutions) - active failures that have been resolved
      const totalResolutions = activeFailures.filter(af => af.resolvedAt !== null).length;

      // Also count resolved events from the events collection for accuracy
      let resolvedEventCount = 0;
      if (activeFailureIds.length > 0) {
        const resolvedEvents = await FailureEvent.find({
          activeFailureId: activeFailureIds,
          eventType: 'resolved',
        });

        const resolvedIds = new Set(
          resolvedEvents.map((e) => e.activeFailureId.toString())
        );
        resolvedEventCount = resolvedIds.size;
      }

      // Use the higher of the two counts (active failures or events)
      const finalResolvedCount = Math.max(totalResolutions, resolvedEventCount);

      return {
        fingerprint,
        totalOccurrences,
        totalResolutions: finalResolvedCount,
        recurrenceRate: totalOccurrences > 0 ? finalResolvedCount / totalOccurrences : 0,
      };
    } catch (error) {
      logger.error({ error, fingerprint }, 'Error calculating recurrence rate');
      throw error;
    }
  }

  /**
   * Identify chronic offenders (tests that fail frequently)
   * 
   * @param threshold Minimum number of failures to be considered chronic (default: 5)
   * @returns Array of chronic offenders with statistics
   */
  async getChronicOffenders(threshold: number = 5): Promise<Array<{
    testId: string;
    testName: string;
    totalFailures: number;
    recurrenceRate: number;
    averageMTTR: number;
    lastFailure: Date;
  }>> {
    try {
      // Get all active failures (both resolved and unresolved)
      const { entries: allFailures } = await ActiveFailure.find({
        resolvedOnly: false,
        unresolvedOnly: false,
        limit: 10000,
      });

      // Group by testId
      const byTestId = new Map<string, ActiveFailureDocument[]>();
      for (const failure of allFailures) {
        if (!byTestId.has(failure.testId)) {
          byTestId.set(failure.testId, []);
        }
        byTestId.get(failure.testId)!.push(failure);
      }

      const chronicOffenders: Array<{
        testId: string;
        testName: string;
        totalFailures: number;
        recurrenceRate: number;
        averageMTTR: number;
        lastFailure: Date;
      }> = [];

      for (const [testId, failures] of byTestId.entries()) {
        if (failures.length >= threshold) {
          // Calculate total failures
          const totalFailures = failures.length;

          // Calculate recurrence rate (resolved / total)
          const resolvedCount = failures.filter(f => f.resolvedAt !== null).length;
          const recurrenceRate = totalFailures > 0 ? resolvedCount / totalFailures : 0;

          // Calculate average MTTR for resolved failures
          const resolvedFailures = failures.filter(f => f.resolvedAt !== null && f.firstSeenAt);
          let averageMTTR = 0;
          if (resolvedFailures.length > 0) {
            const totalDuration = resolvedFailures.reduce((sum, f) => {
              if (f.firstSeenAt && f.resolvedAt) {
                return sum + (f.resolvedAt.getTime() - f.firstSeenAt.getTime());
              }
              return sum;
            }, 0);
            const avgMs = totalDuration / resolvedFailures.length;
            averageMTTR = avgMs / (1000 * 60 * 60); // Convert to hours
          }

          // Get last failure date
          const lastFailure = failures.reduce((latest, f) => {
            return f.lastSeenAt > latest ? f.lastSeenAt : latest;
          }, failures[0].lastSeenAt);

          chronicOffenders.push({
            testId,
            testName: failures[0].testName,
            totalFailures,
            recurrenceRate,
            averageMTTR,
            lastFailure,
          });
        }
      }

      // Sort by total failures (highest first)
      chronicOffenders.sort((a, b) => b.totalFailures - a.totalFailures);

      return chronicOffenders;
    } catch (error) {
      logger.error({ error, threshold }, 'Error identifying chronic offenders');
      throw error;
    }
  }

  /**
   * Get failure events for an active failure
   * 
   * @param activeFailureId Active failure ID
   * @returns Array of failure events in chronological order
   */
  async getFailureEvents(activeFailureId: string): Promise<FailureEventDocument[]> {
    try {
      return await FailureEvent.findByActiveFailureId(activeFailureId);
    } catch (error) {
      logger.error({ error, activeFailureId }, 'Error getting failure events');
      throw error;
    }
  }

  /**
   * Get failure events for a test
   * 
   * @param testId Test identifier
   * @param options Query options
   * @returns Array of failure events
   */
  async getTestFailureEvents(
    testId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      eventType?: 'created' | 'updated' | 'resolved' | 'state_changed';
      limit?: number;
    } = {}
  ): Promise<FailureEventDocument[]> {
    try {
      return await FailureEvent.findByTestId(testId, options);
    } catch (error) {
      logger.error({ error, testId, options }, 'Error getting test failure events');
      throw error;
    }
  }
}

// Export singleton instance getter
export const getFailureAnalyticsService = (): FailureAnalyticsService => {
  return FailureAnalyticsService.getInstance();
};

