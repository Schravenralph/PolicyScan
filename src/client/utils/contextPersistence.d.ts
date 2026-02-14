/**
 * Context Persistence - Persists and restores context state to/from sessionStorage
 *
 * Provides utilities for saving and loading context state to sessionStorage
 * with validation and error handling.
 */
import type { BeleidsscanDraft } from '../hooks/useDraftPersistence';
export interface PersistedContextState {
    version: number;
    timestamp: string;
    state: BeleidsscanDraft;
}
/**
 * Save context state to sessionStorage
 */
export declare function saveContextState(state: BeleidsscanDraft): void;
/**
 * Load context state from sessionStorage
 */
export declare function loadContextState(): BeleidsscanDraft | null;
/**
 * Clear context state from sessionStorage
 */
export declare function clearContextState(): void;
/**
 * Check if context state exists in sessionStorage
 */
export declare function hasContextState(): boolean;
