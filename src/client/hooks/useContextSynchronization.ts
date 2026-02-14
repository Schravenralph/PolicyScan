/**
 * Hook for managing context state synchronization
 * 
 * Integrates context persistence, cross-tab synchronization, and server synchronization
 */

import { useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { reconcileDraftState, mergeDraftStates, type ServerSessionState } from '../services/draftReconciliation';
import { saveContextState, loadContextState, clearContextState } from '../utils/contextPersistence';
import { getContextSynchronizer, type ContextSyncEvent } from '../utils/contextSynchronization';
import { validateContextState, sanitizeContextState } from '../utils/contextValidation';
import type { BeleidsscanDraft } from './useDraftPersistence';

export interface UseContextSynchronizationOptions {
  draftState: BeleidsscanDraft;
  wizardSessionId?: string | null;
  onStateRestored?: (state: BeleidsscanDraft) => void;
  enableCrossTabSync?: boolean;
  enableServerSync?: boolean;
  syncInterval?: number; // Interval for server sync in ms
}

export interface UseContextSynchronizationReturn {
  restoreContextState: () => BeleidsscanDraft | null;
  clearPersistedState: () => void;
}

/**
 * Hook for managing context state synchronization
 */
export function useContextSynchronization({
  draftState,
  wizardSessionId,
  onStateRestored,
  enableCrossTabSync = true,
  enableServerSync = false,
  syncInterval = 30000, // 30 seconds
}: UseContextSynchronizationOptions): UseContextSynchronizationReturn {
  const synchronizerRef = useRef(getContextSynchronizer());
  const serverSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(0);

  // Restore context state from sessionStorage on mount
  const restoreContextState = useCallback((): BeleidsscanDraft | null => {
    const persisted = loadContextState();
    if (!persisted) {
      return null;
    }

    // Validate persisted state
    const validation = validateContextState(persisted);
    if (!validation.valid) {
      console.warn('Invalid persisted context state:', validation.errors);
      clearContextState();
      return null;
    }

    // Sanitize state
    const sanitized = sanitizeContextState(persisted);
    if (!sanitized) {
      clearContextState();
      return null;
    }

    // Notify callback
    if (onStateRestored) {
      onStateRestored(sanitized);
    }

    return sanitized;
  }, [onStateRestored]);

  // Clear persisted state
  const clearPersistedState = useCallback(() => {
    clearContextState();
  }, []);

  // Save context state to sessionStorage when it changes
  useEffect(() => {
    // Debounce saves to avoid excessive writes
    const timeoutId = setTimeout(() => {
      saveContextState(draftState);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [draftState]);

  // Setup cross-tab synchronization
  useEffect(() => {
    if (!enableCrossTabSync) {
      return;
    }

    const synchronizer = synchronizerRef.current;
    synchronizer.start();

    // Broadcast state updates
    const broadcastUpdate = () => {
      synchronizer.broadcastStateUpdate(draftState, wizardSessionId || undefined);
    };

    // Broadcast on state changes (debounced)
    const timeoutId = setTimeout(broadcastUpdate, 1000);

    // Listen for state updates from other tabs
    const unsubscribe = synchronizer.addListener((event: ContextSyncEvent) => {
      if (event.type === 'state_update' && event.state) {
        // Validate received state
        const validation = validateContextState(event.state);
        if (validation.valid) {
          const sanitized = sanitizeContextState(event.state);
          if (sanitized && onStateRestored) {
            // Only restore if state is newer
            const currentTimestamp = draftState.timestamp ? new Date(draftState.timestamp).getTime() : 0;
            const receivedTimestamp = event.timestamp;
            
            if (receivedTimestamp > currentTimestamp) {
              onStateRestored(sanitized);
            }
          }
        }
      } else if (event.type === 'state_request') {
        // Respond to state request
        synchronizer.respondToStateRequest(draftState, wizardSessionId || undefined);
      } else if (event.type === 'state_response' && event.state) {
        // Handle state response
        const validation = validateContextState(event.state);
        if (validation.valid) {
          const sanitized = sanitizeContextState(event.state);
          if (sanitized && onStateRestored) {
            // Only restore if state is newer
            const currentTimestamp = draftState.timestamp ? new Date(draftState.timestamp).getTime() : 0;
            const receivedTimestamp = event.timestamp;
            
            if (receivedTimestamp > currentTimestamp) {
              onStateRestored(sanitized);
            }
          }
        }
      }
    });

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
      synchronizer.stop();
    };
  }, [draftState, wizardSessionId, enableCrossTabSync, onStateRestored]);

  // Setup server synchronization (if enabled)
  useEffect(() => {
    if (!enableServerSync || !wizardSessionId) {
      return;
    }

    // Clear existing interval
    if (serverSyncIntervalRef.current) {
      clearInterval(serverSyncIntervalRef.current);
    }

    let isEffectActive = true;

    // Setup periodic server sync
    serverSyncIntervalRef.current = setInterval(async () => {
      const now = Date.now();
      // Only sync if enough time has passed
      if (now - lastSyncRef.current < syncInterval) {
        return;
      }

      lastSyncRef.current = now;

      try {
        // Fetch server state via API
        const state = await api.wizard.getSessionState(wizardSessionId);

        // Prevent state update if effect was cleaned up (e.g. user typed and draftState changed)
        if (!isEffectActive) {
          return;
        }

        const serverState: ServerSessionState = {
          sessionId: state.sessionId,
          currentStepId: state.currentStepId,
          context: state.context,
          updatedAt: state.updatedAt,
          queryId: state.linkedQueryId || null,
        };

        // Compare with local state
        const result = reconcileDraftState(draftState, serverState);

        // Resolve conflicts if server is newer and there are divergences
        if (result.serverNewer && result.hasDivergence) {
          // Merge states, preferring server values for conflicts
          const merged = mergeDraftStates(draftState, serverState, true);

          if (merged && onStateRestored) {
            onStateRestored(merged);
          }
        }
      } catch (error) {
        // Log error but don't disrupt user experience
        console.warn('Failed to sync context with server:', error);
      }
    }, syncInterval);

    return () => {
      isEffectActive = false;
      if (serverSyncIntervalRef.current) {
        clearInterval(serverSyncIntervalRef.current);
        serverSyncIntervalRef.current = null;
      }
    };
  }, [enableServerSync, wizardSessionId, syncInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (serverSyncIntervalRef.current) {
        clearInterval(serverSyncIntervalRef.current);
      }
    };
  }, []);

  return {
    restoreContextState,
    clearPersistedState,
  };
}


