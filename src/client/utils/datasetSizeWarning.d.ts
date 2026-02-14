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
 * Analyze dataset size and provide recommendations
 */
export declare function analyzeDatasetSize(totalItems: number): DatasetSizeInfo;
/**
 * Get a user-friendly warning message for large datasets
 */
export declare function getDatasetSizeWarning(totalItems: number): string | null;
/**
 * Format memory size in MB
 */
export declare function formatMemoryMB(mb: number): string;
