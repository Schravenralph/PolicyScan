/**
 * localStorage JSON Utility
 * 
 * Provides type-safe, consistent localStorage operations with JSON serialization.
 * Always uses JSON.stringify/parse to prevent format inconsistencies.
 * 
 * @example
 * ```typescript
 * import { getItem, setItem, removeItem } from '@/utils/localStorageJSON';
 * 
 * // Get item with type inference
 * const presets = getItem('filterPresets', []);
 * 
 * // Set item
 * setItem('filterPresets', [{ id: '1', name: 'My Preset' }]);
 * 
 * // Remove item
 * removeItem('filterPresets');
 * ```
 */

/**
 * Get an item from localStorage and parse it as JSON.
 * Returns the default value if the item doesn't exist or parsing fails.
 * 
 * @param key - The localStorage key
 * @param defaultValue - Default value to return if item doesn't exist or parsing fails
 * @returns The parsed value or default value
 * 
 * @example
 * ```typescript
 * const presets = getItem<FilterPreset[]>('filterPresets', []);
 * const enabled = getItem<boolean>('notificationsEnabled', false);
 * ```
 */
export function getItem<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) {
      return defaultValue;
    }
    
    try {
      const parsed = JSON.parse(stored) as T;
      return parsed;
    } catch (parseError) {
      // Invalid JSON - remove corrupted value and return default
      console.warn(`Invalid JSON in localStorage key "${key}", removing corrupted value:`, parseError);
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore removal errors
      }
      return defaultValue;
    }
  } catch (error) {
    // localStorage access failed (e.g., quota exceeded, disabled)
    console.warn(`Failed to read from localStorage key "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Set an item in localStorage as JSON.
 * Always uses JSON.stringify to ensure consistent format.
 * 
 * @param key - The localStorage key
 * @param value - The value to store (will be serialized as JSON)
 * @returns true if successful, false otherwise
 * 
 * @example
 * ```typescript
 * setItem('filterPresets', [{ id: '1', name: 'My Preset' }]);
 * setItem('notificationsEnabled', true);
 * ```
 */
export function setItem<T>(key: string, value: T): boolean {
  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    // Handle quota exceeded or other storage errors
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn(`localStorage quota exceeded for key "${key}"`);
    } else {
      console.warn(`Failed to write to localStorage key "${key}":`, error);
    }
    return false;
  }
}

/**
 * Remove an item from localStorage.
 * 
 * @param key - The localStorage key to remove
 * 
 * @example
 * ```typescript
 * removeItem('filterPresets');
 * ```
 */
export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to remove localStorage key "${key}":`, error);
  }
}

/**
 * Check if a key exists in localStorage.
 * 
 * @param key - The localStorage key to check
 * @returns true if the key exists, false otherwise
 * 
 * @example
 * ```typescript
 * if (hasItem('filterPresets')) {
 *   const presets = getItem('filterPresets', []);
 * }
 * ```
 */
export function hasItem(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

