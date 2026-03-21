import { QueryClient } from "@tanstack/react-query";

/**
 * Production-ready React Query client with retries, caching, and resilience
 * for high-traffic and unstable networks.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30s - data considered fresh
      gcTime: 5 * 60 * 1000, // 5min - cache retention (formerly cacheTime)
      retry: 3,
      retryDelay: (attemptIndex) =>
        Math.min(1000 * 2 ** attemptIndex, 30_000), // exponential backoff: 1s, 2s, 4s (capped at 30s)
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: true,
      networkMode: "online", // pause when offline, resume when back online
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});
