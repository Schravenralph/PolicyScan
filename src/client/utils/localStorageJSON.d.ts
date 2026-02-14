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
export declare function getItem<T>(key: string, defaultValue: T): T;
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
export declare function setItem<T>(key: string, value: T): boolean;
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
export declare function removeItem(key: string): void;
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
export declare function hasItem(key: string): boolean;
