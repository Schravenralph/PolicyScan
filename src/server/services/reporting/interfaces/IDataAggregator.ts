/**
 * Data aggregator interface
 * 
 * Defines the contract for aggregating data for reporting.
 */

import type { DocumentSummary, ScoreSummary, CategorySummary } from '../types/AggregatedData.js';

/**
 * Union type for all possible aggregator return types
 */
export type AggregatorResult = DocumentSummary | ScoreSummary | CategorySummary;

/**
 * Interface for data aggregators
 */
export interface IDataAggregator<T> {
  /**
   * Aggregate items into summary data
   * 
   * @param items - Items to aggregate
   * @returns Aggregated data (DocumentSummary, ScoreSummary, or CategorySummary)
   */
  aggregate(items: T[]): Promise<AggregatorResult>;
}
