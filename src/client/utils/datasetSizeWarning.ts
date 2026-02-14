/**
 * Dataset Size Warning Utility
 * 
 * Provides utilities for warning users about large datasets and suggesting optimizations.
 */

export interface DatasetSizeInfo {
  totalItems: number;
  estimatedMemoryMB: number;
  isLarge: boolean;
  recommendations: string[];
}

/**
 * Estimated memory usage per document in MB (rough estimate)
 */
const ESTIMATED_MEMORY_PER_DOCUMENT_MB = 0.05; // ~50KB per document

/**
 * Threshold for considering a dataset "large"
 */
const LARGE_DATASET_THRESHOLD = 500;

/**
 * Threshold for considering a dataset "very large"
 */
const VERY_LARGE_DATASET_THRESHOLD = 2000;

/**
 * Analyze dataset size and provide recommendations
 */
export function analyzeDatasetSize(totalItems: number): DatasetSizeInfo {
  const estimatedMemoryMB = totalItems * ESTIMATED_MEMORY_PER_DOCUMENT_MB;
  const isLarge = totalItems >= LARGE_DATASET_THRESHOLD;

  const recommendations: string[] = [];

  if (totalItems >= VERY_LARGE_DATASET_THRESHOLD) {
    recommendations.push(
      'Gebruik paginering om de prestaties te verbeteren',
      'Overweeg filters te gebruiken om de dataset te verkleinen',
      'Voor exports met meer dan 2000 documenten, gebruik server-side export'
    );
  } else if (totalItems >= LARGE_DATASET_THRESHOLD) {
    recommendations.push(
      'Gebruik paginering voor betere prestaties',
      'Overweeg filters te gebruiken om de dataset te verkleinen'
    );
  }

  return {
    totalItems,
    estimatedMemoryMB,
    isLarge,
    recommendations,
  };
}

/**
 * Get a user-friendly warning message for large datasets
 */
export function getDatasetSizeWarning(totalItems: number): string | null {
  if (totalItems >= VERY_LARGE_DATASET_THRESHOLD) {
    return `Grote dataset (${totalItems} documenten). Dit kan de prestaties beïnvloeden. Overweeg paginering of filters te gebruiken.`;
  }
  if (totalItems >= LARGE_DATASET_THRESHOLD) {
    return `Middelgrote dataset (${totalItems} documenten). Paginering wordt aanbevolen voor betere prestaties.`;
  }
  return null;
}

/**
 * Format memory size in MB
 */
export function formatMemoryMB(mb: number): string {
  if (mb < 1) {
    return `${Math.round(mb * 100) / 100} MB`;
  }
  return `${Math.round(mb * 10) / 10} MB`;
}


