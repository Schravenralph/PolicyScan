import { QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
/**
 * Default query client configuration
 * Provides sensible defaults for caching, retries, and error handling
 */
declare const queryClient: QueryClient;
interface QueryClientProviderProps {
    children: ReactNode;
}
/**
 * QueryClientProvider wrapper component
 * Provides React Query context to the application
 *
 * @example
 * ```tsx
 * <QueryClientProvider>
 *   <App />
 * </QueryClientProvider>
 * ```
 */
export declare function QueryClientProvider({ children }: QueryClientProviderProps): import("react/jsx-runtime").JSX.Element;
/**
 * Export queryClient instance for direct access if needed
 * (e.g., for programmatic cache invalidation)
 */
export { queryClient };
