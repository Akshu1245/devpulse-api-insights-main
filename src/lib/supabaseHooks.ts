import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * React Query hooks for Supabase queries
 * These hooks provide caching, background refetching, and request deduplication
 */

// Query keys factory for consistent key management
export const supabaseQueryKeys = {
  agents: {
    all: ["agents"] as const,
    lists: () => [...supabaseQueryKeys.agents.all, "list"] as const,
    list: (userId: string) => [...supabaseQueryKeys.agents.lists(), userId] as const,
    details: () => [...supabaseQueryKeys.agents.all, "detail"] as const,
    detail: (agentId: string) => [...supabaseQueryKeys.agents.details(), agentId] as const,
    logs: (agentId: string) => [...supabaseQueryKeys.agents.detail(agentId), "logs"] as const,
    costs: (agentId: string) => [...supabaseQueryKeys.agents.detail(agentId), "costs"] as const,
  },
  alerts: {
    all: ["alerts"] as const,
    lists: () => [...supabaseQueryKeys.alerts.all, "list"] as const,
    list: (userId: string, limit = 20) => [...supabaseQueryKeys.alerts.lists(), userId, limit] as const,
  },
  auditLog: {
    all: ["auditLog"] as const,
    list: (agentId?: string) => [...supabaseQueryKeys.auditLog.all, agentId ?? "all"] as const,
  },
  profiles: {
    all: ["profiles"] as const,
    detail: (userId: string) => [...supabaseQueryKeys.profiles.all, userId] as const,
  },
  webhooks: {
    all: ["webhooks"] as const,
    list: (agentId?: string) => [...supabaseQueryKeys.webhooks.all, agentId ?? "all"] as const,
  },
  teams: {
    all: ["teams"] as const,
    lists: () => [...supabaseQueryKeys.teams.all, "list"] as const,
  },
};

/**
 * Hook to fetch user's agents
 */
export function useAgents(userId?: string) {
  return useQuery({
    queryKey: supabaseQueryKeys.agents.list(userId || "anonymous"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch user's alerts
 */
export function useAlertsList(userId?: string, limit = 20) {
  return useQuery({
    queryKey: supabaseQueryKeys.alerts.list(userId || "anonymous", limit),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch agent details
 */
export function useAgent(agentId?: string) {
  return useQuery({
    queryKey: supabaseQueryKeys.agents.detail(agentId || ""),
    queryFn: async () => {
      if (!agentId) return null;
      
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .eq("id", agentId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!agentId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch agent logs
 */
export function useAgentLogs(agentId?: string) {
  return useQuery({
    queryKey: supabaseQueryKeys.agents.logs(agentId || ""),
    queryFn: async () => {
      if (!agentId) return [];
      
      const { data, error } = await supabase
        .from("agent_logs")
        .select("id, action_type, provider, model, cost, latency_ms, step_number, task_id, is_loop_detected, created_at")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!agentId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch agent cost entries
 */
export function useAgentCosts(agentId?: string, limit = 30) {
  return useQuery({
    queryKey: supabaseQueryKeys.agents.costs(agentId || ""),
    queryFn: async () => {
      if (!agentId) return [];
      
      const { data, error } = await supabase
        .from("cost_entries")
        .select("date, cost")
        .eq("agent_id", agentId)
        .order("date", { ascending: true })
        .limit(limit);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!agentId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch user profile
 */
export function useUserProfile(userId?: string) {
  return useQuery({
    queryKey: supabaseQueryKeys.profiles.detail(userId || ""),
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch audit logs
 */
export function useAuditLog(agentId?: string) {
  return useQuery({
    queryKey: supabaseQueryKeys.auditLog.list(agentId),
    queryFn: async () => {
      let query = supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (agentId) {
        query = query.eq("agent_id", agentId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch teams
 */
export function useTeams() {
  return useQuery({
    queryKey: supabaseQueryKeys.teams.lists(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to update agent status
 */
export function useUpdateAgentStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ agentId, status }: { agentId: string; status: string }) => {
      const { error } = await supabase
        .from("agents")
        .update({ status })
        .eq("id", agentId);
      
      if (error) throw error;
      return { agentId, status };
    },
    onSuccess: (_, { agentId }) => {
      // Invalidate agent queries
      queryClient.invalidateQueries({ queryKey: supabaseQueryKeys.agents.detail(agentId) });
      queryClient.invalidateQueries({ queryKey: supabaseQueryKeys.agents.lists() });
    },
  });
}

/**
 * Hook to pause all agents
 */
export function usePauseAllAgents() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("agents")
        .update({ status: "paused" });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supabaseQueryKeys.agents.lists() });
    },
  });
}

/**
 * Hook to create agent
 */
export function useCreateAgent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (agent: { name: string; provider: string; model: string; status?: string }) => {
      const { data, error } = await supabase
        .from("agents")
        .insert(agent)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supabaseQueryKeys.agents.lists() });
    },
  });
}

/**
 * Hook to create audit log entry
 */
export function useCreateAuditLog() {
  return useMutation({
    mutationFn: async (log: { agent_id: string; action_type: string; details?: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("audit_log")
        .insert(log);
      
      if (error) throw error;
    },
  });
}
