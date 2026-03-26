/**
 * LLM Proxy Middleware — DevPulse Thinking Token Intelligence
 *
 * Intercepts OpenAI and Anthropic API responses to:
 * 1. Extract prompt_tokens, completion_tokens, and hidden thinking tokens
 * 2. Estimate thinking tokens via latency analysis and token mismatch
 * 3. Attribute cost to endpoint and feature
 * 4. Store structured data in Supabase
 *
 * Usage: POST /functions/v1/llm-proxy
 * Body: { provider, endpoint, feature, api_key, request_body, ... }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

// ─── Provider configurations ───────────────────────────────────────────────

interface ProviderConfig {
  baseUrl: string;
  chatPath: string;
  headers: (apiKey: string) => Record<string, string>;
  transformRequest: (body: Record<string, unknown>) => Record<string, unknown>;
  parseResponse: (body: Record<string, unknown>, latencyMs: number) => ParsedTokens;
}

interface ParsedTokens {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  detectionMethod: string;
  model: string;
  finishReason: string;
  rawUsage: Record<string, unknown>;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  openai: {
    baseUrl: "https://api.openai.com",
    chatPath: "/v1/chat/completions",
    headers: (apiKey: string) => ({
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    }),
    transformRequest: (body) => body,
    parseResponse: (body, latencyMs) => {
      const usage = (body.usage as Record<string, unknown>) || {};
      const model = (body.model as string) || "unknown";
      const choice = (body.choices as Array<Record<string, unknown>>)?.[0] || {};
      const finishReason = (choice.finish_reason as string) || "unknown";

      const inputTokens = Number(usage.prompt_tokens) || 0;
      const outputTokens = Number(usage.completion_tokens) || 0;

      // OpenAI o-series: reasoning_tokens in completion_tokens_details
      let thinkingTokens = 0;
      let detectionMethod = "none";

      const completionDetails = usage.completion_tokens_details as Record<string, unknown> | undefined;
      if (completionDetails?.reasoning_tokens && Number(completionDetails.reasoning_tokens) > 0) {
        thinkingTokens = Number(completionDetails.reasoning_tokens);
        detectionMethod = "direct_field_openai";
      }

      // Method 2: Differential — total - prompt - completion
      if (thinkingTokens === 0) {
        const totalTokens = Number(usage.total_tokens) || 0;
        const differential = totalTokens - inputTokens - outputTokens;
        if (differential > 0) {
          thinkingTokens = differential;
          detectionMethod = "differential_computation";
        }
      }

      // Method 3: Latency heuristic
      if (thinkingTokens === 0 && outputTokens > 0 && latencyMs > 0) {
        const msPerToken = latencyMs / outputTokens;
        if (msPerToken > 40) {
          // Reasoning models are ~5-10x slower per output token
          const estimatedMultiplier = estimateThinkingMultiplier(model);
          thinkingTokens = Math.round(outputTokens * estimatedMultiplier);
          detectionMethod = "latency_heuristic";
        }
      }

      return { inputTokens, outputTokens, thinkingTokens, detectionMethod, model, finishReason, rawUsage: usage };
    },
  },

  anthropic: {
    baseUrl: "https://api.anthropic.com",
    chatPath: "/v1/messages",
    headers: (apiKey: string) => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    }),
    transformRequest: (body) => body,
    parseResponse: (body, latencyMs) => {
      const usage = (body.usage as Record<string, unknown>) || {};
      const model = (body.model as string) || "unknown";
      const stopReason = (body.stop_reason as string) || "unknown";

      const inputTokens = Number(usage.input_tokens) || 0;
      const outputTokens = Number(usage.output_tokens) || 0;

      let thinkingTokens = 0;
      let detectionMethod = "none";

      // Anthropic extended thinking: explicit thinking_tokens field
      if (usage.thinking_tokens && Number(usage.thinking_tokens) > 0) {
        thinkingTokens = Number(usage.thinking_tokens);
        detectionMethod = "direct_field_anthropic";
      }

      // Check for thinking blocks in content
      const content = (body.content as Array<Record<string, unknown>>) || [];
      const hasThinkingBlock = content.some((block) => block.type === "thinking");
      if (hasThinkingBlock && thinkingTokens === 0) {
        // Estimate from content length if not in usage
        const thinkingBlock = content.find((block) => block.type === "thinking");
        if (thinkingBlock?.thinking) {
          const estimatedTokens = Math.round(String(thinkingBlock.thinking).length / 4);
          thinkingTokens = estimatedTokens;
          detectionMethod = "content_block_estimate";
        }
      }

      // Method 3: Latency heuristic
      if (thinkingTokens === 0 && outputTokens > 0 && latencyMs > 0) {
        const msPerToken = latencyMs / outputTokens;
        if (msPerToken > 50) {
          const estimatedMultiplier = estimateThinkingMultiplier(model);
          thinkingTokens = Math.round(outputTokens * estimatedMultiplier);
          detectionMethod = "latency_heuristic";
        }
      }

      return { inputTokens, outputTokens, thinkingTokens, detectionMethod, model, finishReason: stopReason, rawUsage: usage };
    },
  },
};

// ─── Thinking token cost tables ────────────────────────────────────────────

const TOKEN_COSTS: Record<string, { input: number; output: number; thinking: number }> = {
  "o1": { input: 0.015, output: 0.060, thinking: 0.060 },
  "o1-mini": { input: 0.003, output: 0.012, thinking: 0.012 },
  "o1-preview": { input: 0.015, output: 0.060, thinking: 0.060 },
  "o3": { input: 0.010, output: 0.040, thinking: 0.040 },
  "o3-mini": { input: 0.0011, output: 0.0044, thinking: 0.0044 },
  "o4-mini": { input: 0.0011, output: 0.0044, thinking: 0.0044 },
  "gpt-4o": { input: 0.0025, output: 0.010, thinking: 0.0 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006, thinking: 0.0 },
  "claude-3-7-sonnet": { input: 0.003, output: 0.015, thinking: 0.015 },
  "claude-3-5-sonnet": { input: 0.003, output: 0.015, thinking: 0.015 },
  "claude-3-5-haiku": { input: 0.001, output: 0.005, thinking: 0.0 },
  "claude-opus-4": { input: 0.015, output: 0.075, thinking: 0.075 },
};

const THINKING_MULTIPLIERS: Record<string, number> = {
  "o1": 20, "o1-mini": 10, "o1-preview": 20,
  "o3": 27, "o3-mini": 14, "o4-mini": 14,
  "claude-3-7-sonnet": 12, "claude-3-5-sonnet": 6, "claude-opus-4": 20,
};

function estimateThinkingMultiplier(model: string): number {
  const lower = model.toLowerCase();
  for (const [key, mult] of Object.entries(THINKING_MULTIPLIERS)) {
    if (lower.includes(key)) return mult;
  }
  return 8; // conservative default
}

function getCostForModel(model: string): { input: number; output: number; thinking: number } {
  const lower = model.toLowerCase();
  for (const [key, cost] of Object.entries(TOKEN_COSTS)) {
    if (lower.includes(key)) return cost;
  }
  return { input: 0.002, output: 0.006, thinking: 0.0 };
}

// ─── Rate limiter ──────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW = 60;
const RATE_LIMIT_MAX = 60;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(key);
  if (!record || record.resetAt < now) {
    requestCounts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW * 1000 });
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX) return false;
  record.count++;
  return true;
}

// ─── Request types ─────────────────────────────────────────────────────────

interface LLMProxyRequest {
  provider: "openai" | "anthropic";
  endpoint: string;        // e.g., "/v1/chat/completions"
  feature: string;         // e.g., "code-review", "summarization"
  api_key: string;         // user's API key
  request_body: Record<string, unknown>;
  user_id: string;         // for attribution
}

// ─── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  if (!checkRateLimit(`llm-proxy:${clientIp}`)) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded" }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      }
    );
  }

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: LLMProxyRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { provider, feature, api_key, request_body, user_id } = body;
  const endpoint = body.endpoint || PROVIDERS[provider]?.chatPath || "/v1/chat/completions";

  if (!provider || !api_key || !request_body || !user_id) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: provider, api_key, request_body, user_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) {
    return new Response(
      JSON.stringify({ error: `Unsupported provider: ${provider}. Use 'openai' or 'anthropic'.` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validate user via Supabase auth
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user || user.id !== user_id) {
    return new Response(
      JSON.stringify({ error: "User ID mismatch or invalid token" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ─── Forward to provider and measure latency ─────────────────────────

  const targetUrl = `${providerConfig.baseUrl}${endpoint}`;
  const transformedBody = providerConfig.transformRequest(request_body);
  const providerHeaders = providerConfig.headers(api_key);

  const startMs = performance.now();

  let providerResponse: Response;
  let responseBody: Record<string, unknown>;

  try {
    providerResponse = await fetch(targetUrl, {
      method: "POST",
      headers: providerHeaders,
      body: JSON.stringify(transformedBody),
    });

    const responseText = await providerResponse.text();
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = { raw: responseText };
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Provider fetch failed: ${(err as Error).message}` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const latencyMs = performance.now() - startMs;

  // ─── Parse tokens ────────────────────────────────────────────────────

  const parsed = providerConfig.parseResponse(responseBody, latencyMs);
  const costs = getCostForModel(parsed.model);

  const inputCostUsd = (parsed.inputTokens / 1000) * costs.input;
  const outputCostUsd = (parsed.outputTokens / 1000) * costs.output;
  const thinkingCostUsd = (parsed.thinkingTokens / 1000) * costs.thinking;
  const totalCostUsd = inputCostUsd + outputCostUsd + thinkingCostUsd;
  const costWithoutThinkingUsd = inputCostUsd + outputCostUsd;

  const thinkingOverheadMultiplier =
    costWithoutThinkingUsd > 0 ? totalCostUsd / costWithoutThinkingUsd : 1.0;

  const isAnomaly = parsed.thinkingTokens > parsed.outputTokens * 3 && parsed.outputTokens > 0;

  // ─── Build structured record ─────────────────────────────────────────

  const record = {
    user_id,
    provider,
    model: parsed.model,
    endpoint,
    feature: feature || "default",
    input_tokens: parsed.inputTokens,
    output_tokens: parsed.outputTokens,
    thinking_tokens: parsed.thinkingTokens,
    total_tokens: parsed.inputTokens + parsed.outputTokens + parsed.thinkingTokens,
    detection_method: parsed.detectionMethod,
    finish_reason: parsed.finishReason,
    latency_ms: Math.round(latencyMs),
    ms_per_output_token: parsed.outputTokens > 0
      ? Math.round((latencyMs / parsed.outputTokens) * 10) / 10
      : 0,
    input_cost_usd: Math.round(inputCostUsd * 1e6) / 1e6,
    output_cost_usd: Math.round(outputCostUsd * 1e6) / 1e6,
    thinking_cost_usd: Math.round(thinkingCostUsd * 1e6) / 1e6,
    total_cost_usd: Math.round(totalCostUsd * 1e6) / 1e6,
    thinking_overhead_multiplier: Math.round(thinkingOverheadMultiplier * 100) / 100,
    is_thinking_anomaly: isAnomaly,
    raw_usage: parsed.rawUsage,
    recorded_at: new Date().toISOString(),
  };

  // ─── Persist to Supabase ─────────────────────────────────────────────

  try {
    await supabase.from("thinking_token_logs").insert({
      user_id: record.user_id,
      model: record.model,
      endpoint_name: record.endpoint,
      feature_name: record.feature,
      input_tokens: record.input_tokens,
      output_tokens: record.output_tokens,
      thinking_tokens: record.thinking_tokens,
      total_tokens: record.total_tokens,
      thinking_cost_inr: Math.round(thinkingCostUsd * 83.5 * 100) / 100,
      total_cost_inr: Math.round(totalCostUsd * 83.5 * 100) / 100,
      thinking_overhead_multiplier: record.thinking_overhead_multiplier,
      is_thinking_anomaly: record.is_thinking_anomaly,
      detection_method: record.detection_method,
      response_latency_ms: record.latency_ms,
      provider: record.provider,
      finish_reason: record.finish_reason,
      ms_per_output_token: record.ms_per_output_token,
      input_cost_usd: record.input_cost_usd,
      output_cost_usd: record.output_cost_usd,
      thinking_cost_usd: record.thinking_cost_usd,
      total_cost_usd: record.total_cost_usd,
    });
  } catch (dbErr) {
    console.error("Failed to persist thinking token log:", dbErr);
    // Non-blocking: still return the proxy response
  }

  // ─── Return provider response + attribution metadata ─────────────────

  return new Response(
    JSON.stringify({
      ...responseBody,
      _devpulse_attribution: {
        tokens: {
          input: parsed.inputTokens,
          output: parsed.outputTokens,
          thinking: parsed.thinkingTokens,
        },
        cost_usd: {
          input: record.input_cost_usd,
          output: record.output_cost_usd,
          thinking: record.thinking_cost_usd,
          total: record.total_cost_usd,
        },
        thinking_overhead_multiplier: record.thinking_overhead_multiplier,
        is_thinking_anomaly: record.is_thinking_anomaly,
        detection_method: record.detection_method,
        latency_ms: record.latency_ms,
        ms_per_output_token: record.ms_per_output_token,
      },
    }),
    {
      status: providerResponse.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-DevPulse-Thinking-Tokens": String(parsed.thinkingTokens),
        "X-DevPulse-Detection-Method": parsed.detectionMethod,
        "X-DevPulse-Latency-Ms": String(Math.round(latencyMs)),
      },
    }
  );
});
