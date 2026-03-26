"""
Thinking Token Cost Attribution — DevPulse Patent 2
Detects, attributes, and classifies thinking token expenditure in LLM API calls
using differential token analysis and response timing signatures.

Patent: NHCE/DEV/2026/002
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

# Models known to use thinking/reasoning tokens
THINKING_TOKEN_MODELS = {
    # OpenAI reasoning models
    "o1": {
        "provider": "openai",
        "thinking_field": "reasoning_tokens",
        "multiplier_range": (10, 30),
    },
    "o1-mini": {
        "provider": "openai",
        "thinking_field": "reasoning_tokens",
        "multiplier_range": (5, 15),
    },
    "o1-preview": {
        "provider": "openai",
        "thinking_field": "reasoning_tokens",
        "multiplier_range": (10, 30),
    },
    "o3": {
        "provider": "openai",
        "thinking_field": "reasoning_tokens",
        "multiplier_range": (15, 40),
    },
    "o3-mini": {
        "provider": "openai",
        "thinking_field": "reasoning_tokens",
        "multiplier_range": (8, 20),
    },
    "o4-mini": {
        "provider": "openai",
        "thinking_field": "reasoning_tokens",
        "multiplier_range": (8, 20),
    },
    # Anthropic extended thinking models
    "claude-3-7-sonnet": {
        "provider": "anthropic",
        "thinking_field": "thinking_tokens",
        "multiplier_range": (5, 20),
    },
    "claude-3-5-sonnet": {
        "provider": "anthropic",
        "thinking_field": "thinking_tokens",
        "multiplier_range": (3, 10),
    },
    "claude-opus-4": {
        "provider": "anthropic",
        "thinking_field": "thinking_tokens",
        "multiplier_range": (10, 30),
    },
    # Google Gemini thinking
    "gemini-2.0-flash-thinking": {
        "provider": "google",
        "thinking_field": "thinking_tokens",
        "multiplier_range": (5, 15),
    },
}

# Cost per 1K tokens in USD (approximate 2026 rates)
TOKEN_COSTS_USD = {
    "o1": {"input": 0.015, "output": 0.060, "thinking": 0.060},
    "o1-mini": {"input": 0.003, "output": 0.012, "thinking": 0.012},
    "o3": {"input": 0.010, "output": 0.040, "thinking": 0.040},
    "o3-mini": {"input": 0.0011, "output": 0.0044, "thinking": 0.0044},
    "o4-mini": {"input": 0.0011, "output": 0.0044, "thinking": 0.0044},
    "claude-3-7-sonnet": {"input": 0.003, "output": 0.015, "thinking": 0.015},
    "claude-3-5-sonnet": {"input": 0.003, "output": 0.015, "thinking": 0.015},
    "claude-opus-4": {"input": 0.015, "output": 0.075, "thinking": 0.075},
    "gpt-4o": {"input": 0.0025, "output": 0.010, "thinking": 0.0},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006, "thinking": 0.0},
    "gemini-2.0-flash": {"input": 0.0001, "output": 0.0004, "thinking": 0.0},
    "gemini-2.0-flash-thinking": {
        "input": 0.0001,
        "output": 0.0004,
        "thinking": 0.0035,
    },
    "mistral-large": {"input": 0.002, "output": 0.006, "thinking": 0.0},
    "cohere-command-r-plus": {"input": 0.0025, "output": 0.010, "thinking": 0.0},
}

# INR conversion rate (approximate)
USD_TO_INR = 83.5


def _normalize_model_name(model: str) -> str:
    """Normalize model name for lookup."""
    model_lower = model.lower()
    for known_model in TOKEN_COSTS_USD:
        if known_model in model_lower:
            return known_model
    return model_lower


def extract_thinking_tokens_from_usage(
    model: str,
    usage_metadata: dict[str, Any],
    response_latency_ms: float = 0.0,
) -> dict[str, Any]:
    """
    PATENT 2 CORE ALGORITHM: Thinking Token Extraction

    Extracts thinking/reasoning token counts from LLM API response metadata.
    Uses differential token analysis: total_tokens - (input_tokens + output_tokens) = thinking_tokens
    Falls back to response timing signature as secondary detection signal.

    Args:
        model: LLM model name
        usage_metadata: The usage/metadata dict from LLM API response
        response_latency_ms: Wall-clock latency from request to first response byte

    Returns:
        Detailed thinking token attribution with cost breakdown
    """
    normalized_model = _normalize_model_name(model)
    model_info = THINKING_TOKEN_MODELS.get(normalized_model, {})
    costs = TOKEN_COSTS_USD.get(
        normalized_model, {"input": 0.001, "output": 0.002, "thinking": 0.0}
    )

    # Method 1: Direct field extraction (OpenAI o-series, Anthropic extended thinking)
    thinking_tokens = 0
    detection_method = "none"

    # OpenAI format: usage.completion_tokens_details.reasoning_tokens
    completion_details = usage_metadata.get("completion_tokens_details", {})
    if isinstance(completion_details, dict):
        reasoning = completion_details.get("reasoning_tokens", 0)
        if reasoning and reasoning > 0:
            thinking_tokens = int(reasoning)
            detection_method = "direct_field_openai"

    # Anthropic format: usage.thinking_tokens
    if thinking_tokens == 0:
        anthropic_thinking = usage_metadata.get("thinking_tokens", 0)
        if anthropic_thinking and anthropic_thinking > 0:
            thinking_tokens = int(anthropic_thinking)
            detection_method = "direct_field_anthropic"

    # Method 2: Differential computation
    # total_tokens - input_tokens - output_tokens = thinking_tokens
    if thinking_tokens == 0:
        total = int(usage_metadata.get("total_tokens", 0))
        prompt = int(
            usage_metadata.get("prompt_tokens", 0)
            or usage_metadata.get("input_tokens", 0)
        )
        completion = int(
            usage_metadata.get("completion_tokens", 0)
            or usage_metadata.get("output_tokens", 0)
        )
        if total > 0 and prompt > 0 and completion > 0:
            differential = total - prompt - completion
            if differential > 0:
                thinking_tokens = differential
                detection_method = "differential_computation"

    # Method 3: Timing signature (secondary signal)
    # Reasoning models have significantly higher latency per output token
    timing_indicates_thinking = False
    output_tokens = int(
        usage_metadata.get("completion_tokens", 0)
        or usage_metadata.get("output_tokens", 0)
    )
    if response_latency_ms > 0 and output_tokens > 0:
        ms_per_output_token = response_latency_ms / max(output_tokens, 1)
        # Standard models: ~5-15ms per output token
        # Reasoning models: ~50-200ms per output token (due to hidden thinking)
        if ms_per_output_token > 30:
            timing_indicates_thinking = True
            if thinking_tokens == 0 and model_info:
                # Estimate thinking tokens from timing
                multiplier_min, multiplier_max = model_info.get(
                    "multiplier_range", (5, 15)
                )
                estimated_multiplier = (multiplier_min + multiplier_max) / 2
                thinking_tokens = int(output_tokens * estimated_multiplier)
                detection_method = "timing_signature_estimate"

    # Calculate costs
    input_tokens = int(
        usage_metadata.get("prompt_tokens", 0) or usage_metadata.get("input_tokens", 0)
    )

    input_cost_usd = (input_tokens / 1000) * costs["input"]
    output_cost_usd = (output_tokens / 1000) * costs["output"]
    thinking_cost_usd = (thinking_tokens / 1000) * costs["thinking"]
    total_cost_usd = input_cost_usd + output_cost_usd + thinking_cost_usd

    # Cost without thinking tokens (for comparison)
    cost_without_thinking_usd = input_cost_usd + output_cost_usd

    # Thinking token overhead multiplier
    thinking_overhead_multiplier = (
        total_cost_usd / cost_without_thinking_usd
        if cost_without_thinking_usd > 0
        else 1.0
    )

    # Anomaly detection: thinking tokens > 3x output tokens is anomalous
    is_thinking_anomaly = (
        thinking_tokens > (output_tokens * 3) if output_tokens > 0 else False
    )

    return {
        "model": model,
        "normalized_model": normalized_model,
        "detection_method": detection_method,
        "has_thinking_tokens": thinking_tokens > 0,
        "timing_indicates_thinking": timing_indicates_thinking,
        "tokens": {
            "input": input_tokens,
            "output": output_tokens,
            "thinking": thinking_tokens,
            "total": input_tokens + output_tokens + thinking_tokens,
        },
        "cost_usd": {
            "input": round(input_cost_usd, 6),
            "output": round(output_cost_usd, 6),
            "thinking": round(thinking_cost_usd, 6),
            "total": round(total_cost_usd, 6),
            "without_thinking": round(cost_without_thinking_usd, 6),
        },
        "cost_inr": {
            "input": round(input_cost_usd * USD_TO_INR, 4),
            "output": round(output_cost_usd * USD_TO_INR, 4),
            "thinking": round(thinking_cost_usd * USD_TO_INR, 4),
            "total": round(total_cost_usd * USD_TO_INR, 4),
        },
        "thinking_overhead_multiplier": round(thinking_overhead_multiplier, 2),
        "is_thinking_anomaly": is_thinking_anomaly,
        "response_latency_ms": response_latency_ms,
        "ms_per_output_token": round(response_latency_ms / max(output_tokens, 1), 1)
        if output_tokens > 0
        else 0,
        "optimization_recommendation": _get_optimization_recommendation(
            model, thinking_tokens, output_tokens, thinking_overhead_multiplier
        ),
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }


def _get_optimization_recommendation(
    model: str,
    thinking_tokens: int,
    output_tokens: int,
    overhead_multiplier: float,
) -> str:
    """Generate actionable optimization recommendation based on thinking token analysis."""
    if thinking_tokens == 0:
        return "No thinking tokens detected. Model is operating efficiently."

    if overhead_multiplier >= 10:
        return (
            f"CRITICAL: Thinking tokens are {overhead_multiplier:.1f}x your output cost. "
            f"Consider: (1) Use a non-reasoning model for this task type, "
            f"(2) Add 'max_reasoning_tokens' limit to your API call, "
            f"(3) Simplify your prompt to reduce reasoning complexity."
        )
    elif overhead_multiplier >= 5:
        return (
            f"HIGH: Thinking overhead is {overhead_multiplier:.1f}x. "
            f"Set max_reasoning_tokens={min(thinking_tokens // 2, 5000)} to cap costs. "
            f"Evaluate if task complexity justifies reasoning model."
        )
    elif overhead_multiplier >= 2:
        return (
            f"MEDIUM: {thinking_tokens} thinking tokens ({overhead_multiplier:.1f}x overhead). "
            f"Monitor this endpoint. Consider caching responses for repeated queries."
        )
    else:
        return f"LOW: Thinking token usage is within normal range ({overhead_multiplier:.1f}x overhead)."


def aggregate_thinking_token_stats(records: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Aggregate thinking token statistics across multiple LLM calls.
    Used for per-endpoint and per-feature cost attribution.
    """
    if not records:
        return {
            "total_calls": 0,
            "calls_with_thinking": 0,
            "total_thinking_tokens": 0,
            "total_thinking_cost_inr": 0.0,
            "avg_thinking_overhead": 1.0,
            "anomaly_calls": 0,
        }

    total_calls = len(records)
    calls_with_thinking = sum(1 for r in records if r.get("thinking_tokens", 0) > 0)
    total_thinking_tokens = sum(int(r.get("thinking_tokens", 0)) for r in records)
    total_thinking_cost_inr = sum(float(r.get("thinking_cost_inr", 0)) for r in records)
    total_cost_inr = sum(float(r.get("total_cost_inr", 0)) for r in records)
    cost_without_thinking = total_cost_inr - total_thinking_cost_inr

    avg_overhead = (
        total_cost_inr / cost_without_thinking if cost_without_thinking > 0 else 1.0
    )

    anomaly_calls = sum(
        1
        for r in records
        if int(r.get("thinking_tokens", 0)) > int(r.get("output_tokens", 1) or 1) * 3
    )

    return {
        "total_calls": total_calls,
        "calls_with_thinking": calls_with_thinking,
        "thinking_call_rate_pct": round(calls_with_thinking / total_calls * 100, 1),
        "total_thinking_tokens": total_thinking_tokens,
        "total_thinking_cost_inr": round(total_thinking_cost_inr, 4),
        "total_cost_inr": round(total_cost_inr, 4),
        "avg_thinking_overhead": round(avg_overhead, 2),
        "anomaly_calls": anomaly_calls,
        "potential_savings_inr": round(
            total_thinking_cost_inr * 0.5, 4
        ),  # 50% savings with optimization
    }
