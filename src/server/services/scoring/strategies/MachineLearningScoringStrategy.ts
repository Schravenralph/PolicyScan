import { getEnv } from '../../../config/env.js';
import { httpClient } from '../../../config/httpClient.js';
import { logger } from '../../../utils/logger.js';
import type { IScoringStrategy } from '../interfaces/IScoringStrategy.js';
import type { FactorResult } from '../types/FactorResult.js';

/**
 * Machine learning scoring strategy
 * 
 * Uses an external ML service to combine factors if configured,
 * otherwise falls back to a simple average.
 */
export class MachineLearningScoringStrategy implements IScoringStrategy {
  async combine(factors: FactorResult[]): Promise<number> {
    // Helper for fallback logic (simple average)
    const fallback = (): number => {
      if (factors.length === 0) {
        return 0;
      }
      const avgScore = factors.reduce((sum, f) => sum + f.score, 0) / factors.length;
      return Math.max(0, Math.min(1, avgScore));
    };

    const env = getEnv();

    if (!env.ML_SCORING_ENABLED) {
      return fallback();
    }

    if (!env.ML_SCORING_SERVICE_URL) {
      return fallback();
    }

    try {
      // Call external ML service
      // We send the array of factors
      const response = await httpClient.post<{ score: number }>(
        env.ML_SCORING_SERVICE_URL,
        { factors },
        { timeout: env.ML_SCORING_TIMEOUT_MS }
      );

      const score = response.data?.score;

      if (typeof score === 'number') {
        // Ensure score is within bounds [0, 1]
        return Math.max(0, Math.min(1, score));
      }

      logger.warn('ML scoring service returned invalid response format (missing score property), falling back to average');
      return fallback();

    } catch (error) {
      // Log error but don't crash, fallback to simple average
      logger.error({ error, url: env.ML_SCORING_SERVICE_URL }, 'ML scoring service failed, falling back to average');
      return fallback();
    }
  }

  getName(): string {
    return 'machine-learning';
  }
}
