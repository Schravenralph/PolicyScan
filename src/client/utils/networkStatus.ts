/**
 * Network Status - Monitors network connectivity and status
 * 
 * Provides utilities for detecting online/offline status and network changes.
 */

// NetworkInformation type definition for browsers that support it
interface NetworkInformation {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

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
class NetworkStatusMonitor {
  private status: NetworkStatus;
  private listeners: Set<NetworkStatusListener> = new Set();
  private connection: (NetworkInformation & { effectiveType?: string }) | null = null;

  constructor() {
    // Get initial status
    this.status = {
      isOnline: navigator.onLine,
      isSlowConnection: false,
      lastChanged: Date.now(),
    };

    // Try to get network information (if available)
    if ('connection' in navigator) {
      this.connection = (navigator as Navigator & { connection?: NetworkInformation }).connection || null;
      if (this.connection) {
        this.updateConnectionInfo();
      }
    }

    // Listen for online/offline events
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Listen for connection changes (if available)
    if (this.connection && this.connection.addEventListener) {
      this.connection.addEventListener('change', this.handleConnectionChange);
    }
  }

  /**
   * Get current network status
   */
  getStatus(): NetworkStatus {
    return { ...this.status };
  }

  /**
   * Check if online
   */
  isOnline(): boolean {
    return this.status.isOnline;
  }

  /**
   * Check if connection is slow
   */
  isSlowConnection(): boolean {
    return this.status.isSlowConnection;
  }

  /**
   * Add status change listener
   */
  addListener(listener: NetworkStatusListener): () => void {
    this.listeners.add(listener);
    
    // Immediately call with current status
    listener(this.getStatus());
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Update connection information
   */
  private updateConnectionInfo(): void {
    if (!this.connection) return;

    this.status.connectionType = this.connection.type || undefined;
    this.status.effectiveType = this.connection.effectiveType || undefined;
    this.status.downlink = this.connection.downlink || undefined;
    this.status.rtt = this.connection.rtt || undefined;

    // Determine if connection is slow
    // Consider slow if: 2G, slow-2g, or downlink < 1 Mbps, or rtt > 1000ms
    const isSlow =
      this.status.effectiveType === '2g' ||
      this.status.effectiveType === 'slow-2g' ||
      (this.status.downlink !== undefined && this.status.downlink < 1) ||
      (this.status.rtt !== undefined && this.status.rtt > 1000);

    this.status.isSlowConnection = isSlow;
  }

  /**
   * Handle online event
   */
  private handleOnline = (): void => {
    this.status.isOnline = true;
    this.status.lastChanged = Date.now();
    this.updateConnectionInfo();
    this.notifyListeners();
  };

  /**
   * Handle offline event
   */
  private handleOffline = (): void => {
    this.status.isOnline = false;
    this.status.lastChanged = Date.now();
    this.status.isSlowConnection = false; // Not applicable when offline
    this.notifyListeners();
  };

  /**
   * Handle connection change
   */
  private handleConnectionChange = (): void => {
    this.updateConnectionInfo();
    this.status.lastChanged = Date.now();
    this.notifyListeners();
  };

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    const status = this.getStatus();
    this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch (error) {
        console.error('Error in network status listener:', error);
      }
    });
  }

  /**
   * Cleanup
   */
  destroy(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    
    if (this.connection && this.connection.removeEventListener) {
      this.connection.removeEventListener('change', this.handleConnectionChange);
    }
    
    this.listeners.clear();
  }
}

// Singleton instance
let monitorInstance: NetworkStatusMonitor | null = null;

/**
 * Get or create network status monitor instance
 */
export function getNetworkStatusMonitor(): NetworkStatusMonitor {
  if (!monitorInstance) {
    monitorInstance = new NetworkStatusMonitor();
  }
  return monitorInstance;
}

/**
 * Check if currently online
 */
export function isOnline(): boolean {
  return getNetworkStatusMonitor().isOnline();
}

/**
 * Check if connection is slow
 */
export function isSlowConnection(): boolean {
  return getNetworkStatusMonitor().isSlowConnection();
}

/**
 * Get current network status
 */
export function getNetworkStatus(): NetworkStatus {
  return getNetworkStatusMonitor().getStatus();
}


