import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

/**
 * React Query hooks for API endpoints
 * These hooks provide caching, background refetching, and request deduplication
 */

// Query keys factory for consistent key management
export const queryKeys = {
  scans: (userId: string) => ["scans", userId] as const,
  alerts: (userId: string) => ["alerts", userId] as const,
  compliance: (userId: string) => ["compliance", userId] as const,
  llmSummary: (userId: string) => ["llm", "summary", userId] as const,
  llmUsage: (userId: string) => ["llm", "usage", userId] as const,
};

/**
 * Hook to fetch user's scans
 */
export function useUserScans(userId: string) {
  return useQuery({
    queryKey: queryKeys.scans(userId),
    queryFn: () => api.getUserScans(userId),
    enabled: !!userId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch user's alerts
 */
export function useAlerts(userId: string) {
  return useQuery({
    queryKey: queryKeys.alerts(userId),
    queryFn: () => api.getAlerts(userId),
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch user's compliance data
 */
export function useCompliance(userId: string) {
  return useQuery({
    queryKey: queryKeys.compliance(userId),
    queryFn: () => api.getCompliance(userId),
    enabled: !!userId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch LLM summary
 */
export function useLLMSummary(userId: string) {
  return useQuery({
    queryKey: queryKeys.llmSummary(userId),
    queryFn: () => api.getLLMSummary(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch LLM usage
 */
export function useLLMUsage(userId: string) {
  return useQuery({
    queryKey: queryKeys.llmUsage(userId),
    queryFn: () => api.getLLMUsage(userId),
    enabled: !!userId,
    staleTime: 5 * 1000, // 5 seconds - frequently updated
  });
}

/**
 * Hook to resolve an alert
 */
export function useResolveAlert() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ alertId, userId }: { alertId: string; userId: string }) =>
      api.resolveAlert(alertId, userId),
    onSuccess: (_, { userId }) => {
      // Invalidate alerts query to refetch updated data
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts(userId) });
    },
  });
}

/**
 * Hook to run compliance check
 */
export function useRunComplianceCheck() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { user_id: string; control_name: string; evidence: string }) =>
      api.runComplianceCheck(data),
    onSuccess: (_, variables) => {
      // Invalidate compliance query for this user
      queryClient.invalidateQueries({ queryKey: queryKeys.compliance(variables.user_id) });
    },
  });
}

/**
 * Hook to log LLM usage
 */
export function useLogLLMUsage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { user_id: string; model: string; tokens_used: number; cost_inr: number }) =>
      api.logLLMUsage(data),
    onSuccess: (_, variables) => {
      // Invalidate LLM queries for this user
      queryClient.invalidateQueries({ queryKey: queryKeys.llmUsage(variables.user_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.llmSummary(variables.user_id) });
    },
  });
}

/**
 * Hook to scan an endpoint
 */
export function useScanEndpoint() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ endpoint, userId }: { endpoint: string; userId: string }) =>
      api.scanEndpoint(endpoint, userId),
    onSuccess: (_, { userId }) => {
      // Invalidate scans query to refetch updated data
      queryClient.invalidateQueries({ queryKey: queryKeys.scans(userId) });
    },
  });
}
