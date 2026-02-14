/**
 * Context Persistence - Persists and restores context state to/from sessionStorage
 * 
 * Provides utilities for saving and loading context state to sessionStorage
 * with validation and error handling.
 */

import type { BeleidsscanDraft } from '../hooks/useDraftPersistence';

const CONTEXT_STORAGE_KEY = 'beleidsscan_context_state';
const CONTEXT_STORAGE_VERSION = 1;

export interface PersistedContextState {
  version: number;
  timestamp: string;
  state: BeleidsscanDraft;
}

/**
 * Save context state to sessionStorage
 */
export function saveContextState(state: BeleidsscanDraft): void {
  try {
    const persisted: PersistedContextState = {
      version: CONTEXT_STORAGE_VERSION,
      timestamp: new Date().toISOString(),
      state,
    };
    sessionStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(persisted));
  } catch (error) {
    // Silently fail - sessionStorage might be disabled or full
    console.warn('Failed to save context state to sessionStorage:', error);
  }
}

/**
 * Load context state from sessionStorage
 */
export function loadContextState(): BeleidsscanDraft | null {
  try {
    const saved = sessionStorage.getItem(CONTEXT_STORAGE_KEY);
    if (!saved) {
      return null;
    }

    const persisted = JSON.parse(saved) as PersistedContextState;
    
    // Validate version
    if (persisted.version !== CONTEXT_STORAGE_VERSION) {
      // Version mismatch - clear old state
      clearContextState();
      return null;
    }

    // Validate timestamp
    if (!persisted.timestamp || !persisted.state) {
      clearContextState();
      return null;
    }

    // Check if state is too old (more than 24 hours)
    const stateDate = new Date(persisted.timestamp);
    const hoursDiff = (Date.now() - stateDate.getTime()) / (1000 * 60 * 60);
    if (Number.isNaN(stateDate.getTime()) || hoursDiff > 24) {
      clearContextState();
      return null;
    }

    return persisted.state;
  } catch (error) {
    // Corrupted state - clear it
    console.warn('Failed to load context state from sessionStorage:', error);
    clearContextState();
    return null;
  }
}

/**
 * Clear context state from sessionStorage
 */
export function clearContextState(): void {
  try {
    sessionStorage.removeItem(CONTEXT_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear context state from sessionStorage:', error);
  }
}

/**
 * Check if context state exists in sessionStorage
 */
export function hasContextState(): boolean {
  try {
    return sessionStorage.getItem(CONTEXT_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}


