/**
 * Context Synchronization - Cross-tab and server state synchronization
 *
 * Provides utilities for synchronizing context state across browser tabs
 * and with server state using BroadcastChannel API.
 */
import type { BeleidsscanDraft } from '../hooks/useDraftPersistence';
export type ContextSyncEventType = 'state_update' | 'state_request' | 'state_response' | 'tab_close';
export interface ContextSyncEvent {
    type: ContextSyncEventType;
    tabId: string;
    timestamp: number;
    state?: BeleidsscanDraft;
    sessionId?: string;
}
/**
 * Context synchronization manager using BroadcastChannel
 */
export declare class ContextSynchronizer {
    private channel;
    private tabId;
    private listeners;
    private isActive;
    constructor();
    /**
     * Setup BroadcastChannel listeners
     */
    private setupChannelListeners;
    /**
     * Start synchronization
     */
    start(): void;
    /**
     * Stop synchronization
     */
    stop(): void;
    /**
     * Broadcast state update to other tabs
     */
    broadcastStateUpdate(state: BeleidsscanDraft, sessionId?: string): void;
    /**
     * Request state from other tabs
     */
    requestState(): void;
    /**
     * Respond to state request
     */
    respondToStateRequest(state: BeleidsscanDraft, sessionId?: string): void;
    /**
     * Add event listener
     */
    addListener(listener: (event: ContextSyncEvent) => void): () => void;
    /**
     * Handle visibility change
     */
    private handleVisibilityChange;
    /**
     * Handle beforeunload
     */
    private handleBeforeUnload;
    /**
     * Get tab ID
     */
    getTabId(): string;
    /**
     * Check if synchronization is active
     */
    isSynchronizationActive(): boolean;
    /**
     * Cleanup
     */
    destroy(): void;
}
/**
 * Get or create context synchronizer instance
 */
export declare function getContextSynchronizer(): ContextSynchronizer;
