/**
 * Network Status - Monitors network connectivity and status
 *
 * Provides utilities for detecting online/offline status and network changes.
 */
export interface NetworkStatus {
    isOnline: boolean;
    isSlowConnection: boolean;
    connectionType?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    lastChanged: number;
}
type NetworkStatusListener = (status: NetworkStatus) => void;
/**
 * Network status monitor
 */
declare class NetworkStatusMonitor {
    private status;
    private listeners;
    private connection;
    constructor();
    /**
     * Get current network status
     */
    getStatus(): NetworkStatus;
    /**
     * Check if online
     */
    isOnline(): boolean;
    /**
     * Check if connection is slow
     */
    isSlowConnection(): boolean;
    /**
     * Add status change listener
     */
    addListener(listener: NetworkStatusListener): () => void;
    /**
     * Update connection information
     */
    private updateConnectionInfo;
    /**
     * Handle online event
     */
    private handleOnline;
    /**
     * Handle offline event
     */
    private handleOffline;
    /**
     * Handle connection change
     */
    private handleConnectionChange;
    /**
     * Notify all listeners
     */
    private notifyListeners;
    /**
     * Cleanup
     */
    destroy(): void;
}
/**
 * Get or create network status monitor instance
 */
export declare function getNetworkStatusMonitor(): NetworkStatusMonitor;
/**
 * Check if currently online
 */
export declare function isOnline(): boolean;
/**
 * Check if connection is slow
 */
export declare function isSlowConnection(): boolean;
/**
 * Get current network status
 */
export declare function getNetworkStatus(): NetworkStatus;
export {};
