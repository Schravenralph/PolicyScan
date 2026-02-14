/**
 * Hook for managing context state synchronization
 *
 * Integrates context persistence, cross-tab synchronization, and server synchronization
 */
import type { BeleidsscanDraft } from './useDraftPersistence';
export interface UseContextSynchronizationOptions {
    draftState: BeleidsscanDraft;
    wizardSessionId?: string | null;
    onStateRestored?: (state: BeleidsscanDraft) => void;
    enableCrossTabSync?: boolean;
    enableServerSync?: boolean;
    syncInterval?: number;
}
export interface UseContextSynchronizationReturn {
    restoreContextState: () => BeleidsscanDraft | null;
    clearPersistedState: () => void;
}
/**
 * Hook for managing context state synchronization
 */
export declare function useContextSynchronization({ draftState, wizardSessionId, onStateRestored, enableCrossTabSync, enableServerSync, syncInterval, }: UseContextSynchronizationOptions): UseContextSynchronizationReturn;
