/**
 * Aggregated Data Type
 * 
 * Represents aggregated data ready for report formatting.
 */

/**
 * Report summary
 */
export interface ReportSummary {
  /** Total number of documents */
  totalDocuments: number;
  /** Average score */
  averageScore: number;
  /** Top categories */
  topCategories: string[];
  /** Date range (optional) */
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Document summary
 */
export interface DocumentSummary {
  /** Total count */
  total: number;
  /** Grouped by type */
  byType: Record<string, number>;
  /** Grouped by source */
  bySource: Record<string, number>;
  /** Top documents */
  topDocuments: Array<{
    id: string;
    title: string;
    score: number;
  }>;
}

/**
 * Score summary
 */
export interface ScoreSummary {
  /** Average score */
  average: number;
  /** Minimum score */
  min: number;
  /** Maximum score */
  max: number;
  /** Score distribution */
  distribution: Array<{
    range: string; // e.g., "0.0-0.2"
    count: number;
  }>;
}

/**
 * Category summary
 */
export interface CategorySummary {
  /** Total categories */
  totalCategories: number;
  /** Top categories */
  topCategories: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
  /** Category distribution */
  distribution: Record<string, number>;
}

/**
 * Aggregated data ready for formatting
 */
export interface AggregatedData {
  /** Report summary */
  summary: ReportSummary;
  /** Document summary */
  documents: DocumentSummary;
  /** Score summary */
  scores: ScoreSummary;
  /** Category summary */
  categories: CategorySummary;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}
