/**
 * Context Synchronization - Cross-tab and server state synchronization
 * 
 * Provides utilities for synchronizing context state across browser tabs
 * and with server state using BroadcastChannel API.
 */

import type { BeleidsscanDraft } from '../hooks/useDraftPersistence';

const BROADCAST_CHANNEL_NAME = 'beleidsscan_context_sync';

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
export class ContextSynchronizer {
  private channel: BroadcastChannel | null = null;
  private tabId: string;
  private listeners: Set<(event: ContextSyncEvent) => void> = new Set();
  private isActive = false;

  constructor() {
    // Generate unique tab ID
    this.tabId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Initialize BroadcastChannel if available
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.setupChannelListeners();
      } catch (error) {
        console.warn('BroadcastChannel not available:', error);
      }
    }
  }

  /**
   * Setup BroadcastChannel listeners
   */
  private setupChannelListeners(): void {
    if (!this.channel) return;

    this.channel.addEventListener('message', (event: MessageEvent<ContextSyncEvent>) => {
      // Ignore messages from this tab
      if (event.data.tabId === this.tabId) {
        return;
      }

      // Defer listener execution to avoid blocking the message handler
      // Use requestIdleCallback if available, otherwise fall back to setTimeout
      const scheduleWork = (callback: () => void) => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(callback, { timeout: 100 });
        } else {
          setTimeout(callback, 0);
        }
      };

      // Notify all listeners asynchronously to prevent blocking
      scheduleWork(() => {
        this.listeners.forEach((listener) => {
          try {
            listener(event.data);
          } catch (error) {
            console.error('Error in context sync listener:', error);
          }
        });
      });
    });
  }

  /**
   * Start synchronization
   */
  start(): void {
    if (this.isActive) return;
    this.isActive = true;

    // Listen for page visibility changes
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    
    // Listen for beforeunload
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  /**
   * Stop synchronization
   */
  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  }

  /**
   * Broadcast state update to other tabs
   */
  broadcastStateUpdate(state: BeleidsscanDraft, sessionId?: string): void {
    if (!this.channel || !this.isActive) return;

    const event: ContextSyncEvent = {
      type: 'state_update',
      tabId: this.tabId,
      timestamp: Date.now(),
      state,
      sessionId,
    };

    try {
      this.channel.postMessage(event);
    } catch (error) {
      console.warn('Failed to broadcast state update:', error);
    }
  }

  /**
   * Request state from other tabs
   */
  requestState(): void {
    if (!this.channel || !this.isActive) return;

    const event: ContextSyncEvent = {
      type: 'state_request',
      tabId: this.tabId,
      timestamp: Date.now(),
    };

    try {
      this.channel.postMessage(event);
    } catch (error) {
      console.warn('Failed to request state:', error);
    }
  }

  /**
   * Respond to state request
   */
  respondToStateRequest(state: BeleidsscanDraft, sessionId?: string): void {
    if (!this.channel || !this.isActive) return;

    const event: ContextSyncEvent = {
      type: 'state_response',
      tabId: this.tabId,
      timestamp: Date.now(),
      state,
      sessionId,
    };

    try {
      this.channel.postMessage(event);
    } catch (error) {
      console.warn('Failed to respond to state request:', error);
    }
  }

  /**
   * Add event listener
   */
  addListener(listener: (event: ContextSyncEvent) => void): () => void {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Handle visibility change
   */
  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      // Tab became visible - request state from other tabs
      this.requestState();
    }
  };

  /**
   * Handle beforeunload
   */
  private handleBeforeUnload = (): void => {
    // Notify other tabs that this tab is closing
    if (this.channel) {
      const event: ContextSyncEvent = {
        type: 'tab_close',
        tabId: this.tabId,
        timestamp: Date.now(),
      };
      
      try {
        this.channel.postMessage(event);
      } catch (error) {
        // Ignore errors during unload
      }
    }
  };

  /**
   * Get tab ID
   */
  getTabId(): string {
    return this.tabId;
  }

  /**
   * Check if synchronization is active
   */
  isSynchronizationActive(): boolean {
    return this.isActive && this.channel !== null;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stop();
    this.listeners.clear();
    
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}

// Singleton instance
let synchronizerInstance: ContextSynchronizer | null = null;

/**
 * Get or create context synchronizer instance
 */
export function getContextSynchronizer(): ContextSynchronizer {
  if (!synchronizerInstance) {
    synchronizerInstance = new ContextSynchronizer();
  }
  return synchronizerInstance;
}


