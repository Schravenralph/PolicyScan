import { useState, useCallback } from 'react';

export interface UseRealTimeUpdatesResult {
  enabled: boolean;
  toggle: () => void;
}

const STORAGE_KEY = 'testDashboardRealTimeUpdates';

/**
 * Hook to manage real-time updates preference
 * 
 * Stores preference in localStorage and provides toggle functionality.
 * Default: enabled (true)
 * 
 * @returns Real-time updates state and toggle function
 */
export function useRealTimeUpdates(): UseRealTimeUpdatesResult {
  const [enabled, setEnabled] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored === 'true' : true; // Default: enabled
  });
  
  const toggle = useCallback(() => {
    const newValue = !enabled;
    setEnabled(newValue);
    localStorage.setItem(STORAGE_KEY, String(newValue));
  }, [enabled]);
  
  return {
    enabled,
    toggle,
  };
}

