/**
 * Storage Quota Utilities - Check and manage browser storage quota
 *
 * Provides utilities for checking available storage space and managing
 * storage quota to prevent quota exceeded errors.
 */
export interface StorageQuotaInfo {
    quota: number | null;
    usage: number | null;
    available: number | null;
    percentageUsed: number | null;
}
export interface StorageEstimate {
    estimatedSize: number;
    willFit: boolean;
    availableSpace: number | null;
}
/**
 * Check storage quota information
 */
export declare function getStorageQuota(): Promise<StorageQuotaInfo>;
/**
 * Estimate size of data in bytes
 */
export declare function estimateDataSize(data: unknown): number;
/**
 * Check if data will fit in available storage
 */
export declare function checkStorageAvailability(data: unknown, options?: {
    threshold?: number;
    minAvailableBytes?: number;
}): Promise<StorageEstimate>;
/**
 * Check if localStorage is available
 */
export declare function isLocalStorageAvailable(): boolean;
/**
 * Get localStorage usage estimate
 */
export declare function getLocalStorageUsage(): number;
/**
 * Clear old localStorage items to free space
 */
export declare function clearOldLocalStorageItems(prefix: string, maxAge: number): number;
