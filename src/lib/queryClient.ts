import { QueryClient } from "@tanstack/react-query";

/**
 * Ultra-fast React Query client optimized for instant UI responses.
 * - Aggressive caching: data stays fresh for 2 minutes
 * - Minimal retries to avoid blocking UI
 * - Optimistic updates enabled by default
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data considered fresh for 2 minutes - no refetch during this window
      staleTime: 2 * 60 * 1000,
      // Keep in cache for 10 minutes
      gcTime: 10 * 60 * 1000,
      // Only retry once to avoid blocking UI
      retry: 1,
      retryDelay: 500,
      // Don't refetch on window focus - avoids jarring UI updates
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Always show cached data immediately while fetching
      refetchOnMount: true,
      networkMode: "online",
      // Show stale data immediately while revalidating in background
      placeholderData: (previousData: unknown) => previousData,
    },
    mutations: {
      // No retry on mutations - fail fast for instant feedback
      retry: 0,
      networkMode: "online",
    },
  },
});

// Prefetch helper for instant navigation
export function prefetchQuery<T>(
  queryKey: unknown[],
  queryFn: () => Promise<T>,
  staleTime = 60_000
) {
  return queryClient.prefetchQuery({
    queryKey,
    queryFn,
    staleTime,
  });
}
