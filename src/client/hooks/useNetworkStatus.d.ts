/**
 * Hook for monitoring network status
 *
 * Provides reactive network status updates for React components.
 */
import { type NetworkStatus } from '../utils/networkStatus';
export interface UseNetworkStatusReturn {
    status: NetworkStatus;
    isOnline: boolean;
    isSlowConnection: boolean;
}
/**
 * Hook for monitoring network status
 */
export declare function useNetworkStatus(): UseNetworkStatusReturn;
