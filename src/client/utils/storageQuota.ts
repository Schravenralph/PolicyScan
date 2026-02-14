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
export async function getStorageQuota(): Promise<StorageQuotaInfo> {
  if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
    return {
      quota: null,
      usage: null,
      available: null,
      percentageUsed: null,
    };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const quota = estimate.quota ?? null;
    const usage = estimate.usage ?? null;
    const available = quota && usage ? quota - usage : null;
    const percentageUsed = quota && usage ? (usage / quota) * 100 : null;

    return {
      quota,
      usage,
      available,
      percentageUsed,
    };
  } catch (error) {
    console.warn('Failed to get storage quota:', error);
    return {
      quota: null,
      usage: null,
      available: null,
      percentageUsed: null,
    };
  }
}

/**
 * Estimate size of data in bytes
 */
export function estimateDataSize(data: unknown): number {
  try {
    const jsonString = JSON.stringify(data);
    // Each character in UTF-16 is 2 bytes, but JSON.stringify uses UTF-8
    // Approximate: UTF-8 uses 1-4 bytes per character, average ~2 bytes
    return new Blob([jsonString]).size;
  } catch (error) {
    console.warn('Failed to estimate data size:', error);
    // Fallback: rough estimate based on string length
    return JSON.stringify(data).length * 2;
  }
}

/**
 * Check if data will fit in available storage
 */
export async function checkStorageAvailability(
  data: unknown,
  options?: {
    threshold?: number; // Percentage threshold to warn (default: 80%)
    minAvailableBytes?: number; // Minimum available bytes required
  }
): Promise<StorageEstimate> {
  const threshold = options?.threshold ?? 80;
  const minAvailableBytes = options?.minAvailableBytes ?? 1024 * 1024; // 1MB default

  const estimatedSize = estimateDataSize(data);
  const quotaInfo = await getStorageQuota();

  if (quotaInfo.available === null) {
    // Can't determine availability - assume it will fit
    return {
      estimatedSize,
      willFit: true,
      availableSpace: null,
    };
  }

  const willFit = quotaInfo.available >= estimatedSize && quotaInfo.available >= minAvailableBytes;

  // Check if we're approaching quota limit
  if (quotaInfo.percentageUsed !== null && quotaInfo.percentageUsed > threshold) {
    console.warn(`Storage quota usage is at ${quotaInfo.percentageUsed.toFixed(1)}%`);
  }

  return {
    estimatedSize,
    willFit,
    availableSpace: quotaInfo.available,
  };
}

/**
 * Check if localStorage is available
 */
export function isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get localStorage usage estimate
 */
export function getLocalStorageUsage(): number {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) {
          // Estimate: key + value length, plus overhead
          total += key.length + value.length + 2; // +2 for separator
        }
      }
    }
  } catch (error) {
    console.warn('Failed to calculate localStorage usage:', error);
  }
  return total;
}

/**
 * Clear old localStorage items to free space
 */
export function clearOldLocalStorageItems(
  prefix: string,
  maxAge: number // Age in milliseconds
): number {
  let cleared = 0;
  const now = Date.now();

  try {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            const parsed = JSON.parse(value);
            if (parsed.timestamp) {
              const age = now - new Date(parsed.timestamp).getTime();
              if (age > maxAge) {
                keysToRemove.push(key);
              }
            }
          }
        } catch {
          // Invalid JSON or missing timestamp - remove it
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
      cleared++;
    });
  } catch (error) {
    console.warn('Failed to clear old localStorage items:', error);
  }

  return cleared;
}


