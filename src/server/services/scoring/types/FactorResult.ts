/**
 * Factor Result Type
 * 
 * Represents the result of a scoring factor calculation.
 */

/**
 * Result of a scoring factor calculation
 */
export interface FactorResult {
  /** Factor name (e.g., 'authority', 'semantic', 'keyword') */
  factor: string;
  /** Calculated score (0-1) */
  score: number;
  /** Weight for this factor (0-1) */
  weight: number;
  /** Optional metadata about the calculation */
  metadata?: Record<string, unknown>;
}
