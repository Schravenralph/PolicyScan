import { QueryClient, QueryClientProvider as TanStackQueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

/**
 * Default query client configuration
 * Provides sensible defaults for caching, retries, and error handling
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 5 minutes by default
      staleTime: 5 * 60 * 1000,
      // Keep unused data in cache for 10 minutes
      gcTime: 10 * 60 * 1000,
      // Retry failed requests 3 times
      retry: 3,
      // Retry delay increases exponentially
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Refetch on window focus (useful for keeping data fresh)
      refetchOnWindowFocus: false,
      // Refetch on reconnect
      refetchOnReconnect: true,
    },
    mutations: {
      // Retry mutations once
      retry: 1,
      // Retry delay for mutations
      retryDelay: 1000,
    },
  },
});

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
export function QueryClientProvider({ children }: QueryClientProviderProps) {
  return (
    <TanStackQueryClientProvider client={queryClient}>
      {children}
    </TanStackQueryClientProvider>
  );
}

/**
 * Export queryClient instance for direct access if needed
 * (e.g., for programmatic cache invalidation)
 */
export { queryClient };




