/**
 * Thinking Token Intelligence — Type Definitions
 *
 * Structured types for LLM cost attribution, thinking token detection,
 * and per-feature/per-endpoint cost breakdown.
 */

// ─── Detection methods ─────────────────────────────────────────────────

export type DetectionMethod =
  | "direct_field_openai"       // OpenAI reasoning_tokens in completion_tokens_details
  | "direct_field_anthropic"    // Anthropic thinking_tokens in usage
  | "differential_computation"  // total - input - output = thinking
  | "content_block_estimate"    // Anthropic thinking content block
  | "latency_heuristic"        // High ms/output-token indicates hidden thinking
  | "none";                    // No thinking tokens detected

export type Provider = "openai" | "anthropic";

// ─── Core token breakdown ──────────────────────────────────────────────

export interface TokenBreakdown {
  input: number;
  output: number;
  thinking: number;
  total: number;
}

export interface CostBreakdown {
  input: number;
  output: number;
  thinking: number;
  total: number;
  without_thinking: number;
}

export interface CostBreakdownINR {
  input: number;
  output: number;
  thinking: number;
  total: number;
}

// ─── Single call attribution record ────────────────────────────────────

export interface ThinkingTokenAttribution {
  model: string;
  normalized_model: string;
  detection_method: DetectionMethod;
  has_thinking_tokens: boolean;
  timing_indicates_thinking: boolean;
  tokens: TokenBreakdown;
  cost_usd: CostBreakdown;
  cost_inr: CostBreakdownINR;
  thinking_overhead_multiplier: number;
  is_thinking_anomaly: boolean;
  response_latency_ms: number;
  ms_per_output_token: number;
  optimization_recommendation: string;
  recorded_at: string;
}

// ─── Database row (matches thinking_token_logs table) ───────────────────

export interface ThinkingTokenLogRow {
  id: string;
  user_id: string;
  provider: Provider;
  model: string;
  endpoint_name: string;
  feature_name: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  total_tokens: number;
  detection_method: DetectionMethod;
  finish_reason: string;
  ms_per_output_token: number;
  input_cost_usd: number;
  output_cost_usd: number;
  thinking_cost_usd: number;
  total_cost_usd: number;
  thinking_cost_inr: number;
  total_cost_inr: number;
  thinking_overhead_multiplier: number;
  is_thinking_anomaly: boolean;
  response_latency_ms: number;
  created_at: string;
  recorded_at: string;
}

// ─── Aggregated stats ──────────────────────────────────────────────────

export interface ThinkingTokenStats {
  total_calls: number;
  calls_with_thinking: number;
  thinking_call_rate_pct: number;
  total_thinking_tokens: number;
  total_thinking_cost_inr: number;
  total_cost_inr: number;
  avg_thinking_overhead: number;
  anomaly_calls: number;
  potential_savings_inr: number;
}

// ─── Per-endpoint breakdown ────────────────────────────────────────────

export interface EndpointBreakdown {
  endpoint: string;
  calls: number;
  thinking_tokens: number;
  thinking_cost_inr: number;
  total_cost_inr: number;
  anomaly_calls: number;
}

// ─── Per-feature cost attribution ──────────────────────────────────────

export interface FeatureAttribution {
  feature_name: string;
  total_calls: number;
  total_thinking_tokens: number;
  total_cost_usd: number;
  total_thinking_cost_usd: number;
  thinking_cost_pct: number;
  avg_overhead: number;
  anomaly_calls: number;
  last_call_at: string;
}

// ─── Per-model breakdown ───────────────────────────────────────────────

export interface ModelBreakdown {
  model: string;
  calls: number;
  thinking_tokens: number;
  thinking_cost_inr: number;
  avg_overhead: number;
}

// ─── API response types ────────────────────────────────────────────────

export interface ThinkingTokenStatsResponse {
  stats: ThinkingTokenStats;
  endpoint_breakdown: EndpointBreakdown[];
  model_breakdown: ModelBreakdown[];
  recent_anomalies: ThinkingTokenLogRow[];
}

export interface ThinkingTokenAnalyzeResponse {
  total_cost_inr: number;
  thinking_cost_inr: number;
  thinking_cost_pct: number;
  top_cost_endpoint: string;
  top_cost_endpoint_pct: number;
  recommendations: OptimizationRecommendation[];
  potential_monthly_savings_inr: number;
}

export interface OptimizationRecommendation {
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  type: string;
  message: string;
  potential_savings_inr?: number;
  endpoint?: string;
  cost_inr?: number;
  anomaly_count?: number;
}

// ─── Proxy request/response ────────────────────────────────────────────

export interface LLMProxyRequest {
  provider: Provider;
  endpoint?: string;
  feature: string;
  api_key: string;
  request_body: Record<string, unknown>;
  user_id: string;
}

export interface LLMProxyResponse extends Record<string, unknown> {
  _devpulse_attribution?: {
    tokens: {
      input: number;
      output: number;
      thinking: number;
    };
    cost_usd: {
      input: number;
      output: number;
      thinking: number;
      total: number;
    };
    thinking_overhead_multiplier: number;
    is_thinking_anomaly: boolean;
    detection_method: DetectionMethod;
    latency_ms: number;
    ms_per_output_token: number;
  };
}

// ─── Daily summary (materialized view) ─────────────────────────────────

export interface DailySummary {
  user_id: string;
  day: string;
  provider: Provider;
  feature_name: string;
  endpoint_name: string;
  call_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_thinking_tokens: number;
  total_tokens: number;
  total_thinking_cost_usd: number;
  total_cost_usd: number;
  total_thinking_cost_inr: number;
  total_cost_inr: number;
  avg_overhead_multiplier: number;
  anomaly_count: number;
  avg_latency_ms: number;
}
