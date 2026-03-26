/**
 * Thinking Token Intelligence — Client Library
 *
 * Drop-in replacement for direct OpenAI/Anthropic fetch calls.
 * Routes through DevPulse LLM proxy to extract and attribute thinking tokens.
 *
 * Usage:
 *   import { createLLMClient } from "@/lib/thinking-tokens/client";
 *   const llm = createLLMClient({ userId, accessToken, supabaseUrl, supabaseAnonKey });
 *   const result = await llm.chat({ provider: "openai", model: "o3", messages, feature: "code-review" });
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  Provider,
  LLMProxyRequest,
  LLMProxyResponse,
  ThinkingTokenStatsResponse,
  ThinkingTokenAnalyzeResponse,
  ThinkingTokenLogRow,
} from "./types";

// ─── Config ─────────────────────────────────────────────────────────────

export interface LLMClientConfig {
  userId: string;
  accessToken: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface ChatOptions {
  provider: Provider;
  model: string;
  messages: Array<{ role: string; content: string }>;
  feature: string;
  endpoint?: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  extraBody?: Record<string, unknown>;
}

// ─── Client factory ─────────────────────────────────────────────────────

export function createLLMClient(config: LLMClientConfig) {
  const { userId, accessToken, supabaseUrl, supabaseAnonKey } = config;
  const proxyUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/llm-proxy`;

  /**
   * Send a chat completion through the DevPulse proxy.
   * The proxy forwards to the provider, extracts token data, and returns
   * the provider response augmented with `_devpulse_attribution`.
   */
  async function chat(options: ChatOptions): Promise<LLMProxyResponse> {
    const {
      provider,
      model,
      messages,
      feature,
      endpoint,
      apiKey,
      temperature,
      maxTokens,
      extraBody,
    } = options;

    const requestBody: Record<string, unknown> = {
      model,
      messages,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
      ...extraBody,
    };

    const proxyReq: LLMProxyRequest = {
      provider,
      endpoint: endpoint || (provider === "openai" ? "/v1/chat/completions" : "/v1/messages"),
      feature,
      api_key: apiKey,
      request_body: requestBody,
      user_id: userId,
    };

    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify(proxyReq),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(
        `LLM proxy error (${response.status}): ${(errBody as Record<string, unknown>).error || response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * Fetch thinking token stats for the current user.
   */
  async function getStats(): Promise<ThinkingTokenStatsResponse> {
    const { data, error } = await supabase.functions.invoke(`thinking-tokens/stats/${userId}`, {
      method: "GET",
    });
    if (error) throw error;
    return data as ThinkingTokenStatsResponse;
  }

  /**
   * Run the efficiency analysis (Cost Revelation Moment).
   */
  async function analyze(): Promise<ThinkingTokenAnalyzeResponse> {
    const { data, error } = await supabase.functions.invoke(`thinking-tokens/analyze/${userId}`, {
      method: "GET",
    });
    if (error) throw error;
    return data as ThinkingTokenAnalyzeResponse;
  }

  /**
   * Log a completed LLM call manually (for calls not routed through the proxy).
   */
  async function logCall(params: {
    model: string;
    endpointName?: string;
    featureName?: string;
    usageMetadata: Record<string, unknown>;
    responseLatencyMs: number;
    promptPreview?: string;
  }): Promise<{ logged: boolean; attribution: Record<string, unknown> }> {
    const { data, error } = await supabase.functions.invoke("thinking-tokens/log", {
      method: "POST",
      body: {
        user_id: userId,
        model: params.model,
        endpoint_name: params.endpointName || "",
        feature_name: params.featureName || "",
        usage_metadata: params.usageMetadata,
        response_latency_ms: params.responseLatencyMs,
        prompt_preview: params.promptPreview || "",
      },
    });
    if (error) throw error;
    return data as { logged: boolean; attribution: Record<string, unknown> };
  }

  /**
   * Fetch recent thinking token logs.
   */
  async function getRecentLogs(limit = 50): Promise<ThinkingTokenLogRow[]> {
    const { data, error } = await supabase
      .from("thinking_token_logs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as ThinkingTokenLogRow[];
  }

  return { chat, getStats, analyze, logCall, getRecentLogs };
}

// ─── Standalone helpers (no proxy needed) ────────────────────────────────

/**
 * Estimate thinking tokens from usage metadata and latency.
 * Use this when you call LLM APIs directly and want to classify tokens post-hoc.
 */
export function estimateThinkingTokens(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  reasoningTokens?: number;
  thinkingTokens?: number;
}): {
  thinkingTokens: number;
  detectionMethod: string;
  isAnomaly: boolean;
  msPerOutputToken: number;
} {
  const { model, inputTokens, outputTokens, totalTokens, latencyMs, reasoningTokens, thinkingTokens } = params;

  // Method 1: Direct field
  if (reasoningTokens && reasoningTokens > 0) {
    return {
      thinkingTokens: reasoningTokens,
      detectionMethod: "direct_field_openai",
      isAnomaly: reasoningTokens > outputTokens * 3,
      msPerOutputToken: outputTokens > 0 ? Math.round((latencyMs / outputTokens) * 10) / 10 : 0,
    };
  }
  if (thinkingTokens && thinkingTokens > 0) {
    return {
      thinkingTokens,
      detectionMethod: "direct_field_anthropic",
      isAnomaly: thinkingTokens > outputTokens * 3,
      msPerOutputToken: outputTokens > 0 ? Math.round((latencyMs / outputTokens) * 10) / 10 : 0,
    };
  }

  // Method 2: Differential
  const differential = totalTokens - inputTokens - outputTokens;
  if (differential > 0) {
    return {
      thinkingTokens: differential,
      detectionMethod: "differential_computation",
      isAnomaly: differential > outputTokens * 3,
      msPerOutputToken: outputTokens > 0 ? Math.round((latencyMs / outputTokens) * 10) / 10 : 0,
    };
  }

  // Method 3: Latency heuristic
  const msPerOutputToken = outputTokens > 0 ? latencyMs / outputTokens : 0;
  if (msPerOutputToken > 40 && outputTokens > 0) {
    const multipliers: Record<string, number> = {
      "o1": 20, "o1-mini": 10, "o3": 27, "o3-mini": 14, "o4-mini": 14,
      "claude-3-7-sonnet": 12, "claude-3-5-sonnet": 6, "claude-opus-4": 20,
    };
    const lower = model.toLowerCase();
    let multiplier = 8;
    for (const [key, mult] of Object.entries(multipliers)) {
      if (lower.includes(key)) { multiplier = mult; break; }
    }
    const estimated = Math.round(outputTokens * multiplier);
    return {
      thinkingTokens: estimated,
      detectionMethod: "latency_heuristic",
      isAnomaly: estimated > outputTokens * 3,
      msPerOutputToken: Math.round(msPerOutputToken * 10) / 10,
    };
  }

  return {
    thinkingTokens: 0,
    detectionMethod: "none",
    isAnomaly: false,
    msPerOutputToken: Math.round(msPerOutputToken * 10) / 10,
  };
}
