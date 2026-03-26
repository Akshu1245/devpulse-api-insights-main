import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

/**
 * React Query hooks for API endpoints
 * These hooks provide caching, background refetching, and request deduplication
 * Note: userId is no longer passed - auth is handled via JWT in Authorization header
 */

// Query keys factory for consistent key management
export const queryKeys = {
  scans: () => ["scans"] as const,
  alerts: () => ["alerts"] as const,
  compliance: () => ["compliance"] as const,
  llmSummary: () => ["llm", "summary"] as const,
  llmUsage: () => ["llm", "usage"] as const,
};

/**
 * Hook to fetch user's scans
 */
export function useUserScans() {
  return useQuery({
    queryKey: queryKeys.scans(),
    queryFn: () => api.getUserScans(),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch user's alerts
 */
export function useAlerts() {
  return useQuery({
    queryKey: queryKeys.alerts(),
    queryFn: () => api.getAlerts(),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch user's compliance data
 */
export function useCompliance() {
  return useQuery({
    queryKey: queryKeys.compliance(),
    queryFn: () => api.getCompliance(),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch LLM summary
 */
export function useLLMSummary() {
  return useQuery({
    queryKey: queryKeys.llmSummary(),
    queryFn: () => api.getLLMSummary(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch LLM usage
 */
export function useLLMUsage() {
  return useQuery({
    queryKey: queryKeys.llmUsage(),
    queryFn: () => api.getLLMUsage(),
    staleTime: 5 * 1000, // 5 seconds - frequently updated
  });
}

/**
 * Hook to resolve an alert
 */
export function useResolveAlert() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ alertId }: { alertId: string }) =>
      api.resolveAlert(alertId),
    onSuccess: () => {
      // Invalidate alerts query to refetch updated data
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts() });
    },
  });
}

/**
 * Hook to run compliance check
 */
export function useRunComplianceCheck() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { control_name: string; evidence: string }) =>
      api.runComplianceCheck(data),
    onSuccess: () => {
      // Invalidate compliance query
      queryClient.invalidateQueries({ queryKey: queryKeys.compliance() });
    },
  });
}

/**
 * Hook to log LLM usage
 */
export function useLogLLMUsage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { model: string; tokens_used: number; cost_inr: number }) =>
      api.logLLMUsage(data),
    onSuccess: () => {
      // Invalidate LLM queries
      queryClient.invalidateQueries({ queryKey: queryKeys.llmUsage() });
      queryClient.invalidateQueries({ queryKey: queryKeys.llmSummary() });
    },
  });
}

/**
 * Hook to scan an endpoint
 */
export function useScanEndpoint() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ endpoint, method }: { endpoint: string; method?: string }) =>
      api.scanEndpoint(endpoint, method),
    onSuccess: () => {
      // Invalidate scans query to refetch updated data
      queryClient.invalidateQueries({ queryKey: queryKeys.scans() });
    },
  });
}

