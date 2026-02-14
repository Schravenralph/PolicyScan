export interface UseRealTimeUpdatesResult {
    enabled: boolean;
    toggle: () => void;
}
/**
 * Hook to manage real-time updates preference
 *
 * Stores preference in localStorage and provides toggle functionality.
 * Default: enabled (true)
 *
 * @returns Real-time updates state and toggle function
 */
export declare function useRealTimeUpdates(): UseRealTimeUpdatesResult;
