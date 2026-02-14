/**
 * Hook for monitoring network status
 * 
 * Provides reactive network status updates for React components.
 */

import { useState, useEffect } from 'react';
import { getNetworkStatusMonitor, type NetworkStatus } from '../utils/networkStatus';

export interface UseNetworkStatusReturn {
  status: NetworkStatus;
  isOnline: boolean;
  isSlowConnection: boolean;
}

/**
 * Hook for monitoring network status
 */
export function useNetworkStatus(): UseNetworkStatusReturn {
  const [status, setStatus] = useState<NetworkStatus>(() => 
    getNetworkStatusMonitor().getStatus()
  );

  useEffect(() => {
    const monitor = getNetworkStatusMonitor();
    const unsubscribe = monitor.addListener((newStatus) => {
      setStatus(newStatus);
    });

    return unsubscribe;
  }, []);

  return {
    status,
    isOnline: status.isOnline,
    isSlowConnection: status.isSlowConnection,
  };
}


