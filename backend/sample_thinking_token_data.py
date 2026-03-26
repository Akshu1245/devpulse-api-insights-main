"""
Sample Thinking Token Dataset — DevPulse Patent 2
Demonstrates the full thinking token attribution pipeline across
providers, endpoints, and detection methods.

Run directly to see the attribution output:
    python sample_thinking_token_data.py
"""

from __future__ import annotations

from services.thinking_tokens import (
    extract_thinking_tokens_from_usage,
    aggregate_thinking_token_stats,
)

# ---------------------------------------------------------------------------
# Example dataset: 8 representative LLM calls across providers and endpoints
# ---------------------------------------------------------------------------

EXAMPLE_CALLS = [
    # ── 1. OpenAI o3-mini: direct reasoning_tokens field ──────────────────
    {
        "id": "call_001",
        "model": "o3-mini",
        "endpoint_name": "/api/scan",
        "feature_name": "owasp_analysis",
        "response_latency_ms": 4200.0,
        "usage_metadata": {
            "prompt_tokens": 512,
            "completion_tokens": 148,
            "total_tokens": 2660,
            "completion_tokens_details": {
                "reasoning_tokens": 2000,
                "audio_tokens": 0,
            },
        },
        "expected_detection": "direct_field_openai",
    },
    # ── 2. Anthropic claude-3-7-sonnet: direct thinking_tokens field ───────
    {
        "id": "call_002",
        "model": "claude-3-7-sonnet-20250219",
        "endpoint_name": "/api/compliance",
        "feature_name": "pci_dss_report",
        "response_latency_ms": 7800.0,
        "usage_metadata": {
            "input_tokens": 1024,
            "output_tokens": 256,
            "thinking_tokens": 3200,
        },
        "expected_detection": "direct_field_anthropic",
    },
    # ── 3. OpenAI o1: differential computation (total > prompt + completion)
    {
        "id": "call_003",
        "model": "o1",
        "endpoint_name": "/api/scan",
        "feature_name": "shadow_api_detection",
        "response_latency_ms": 9500.0,
        "usage_metadata": {
            "prompt_tokens": 768,
            "completion_tokens": 320,
            "total_tokens": 5088,  # 5088 - 768 - 320 = 4000 thinking
        },
        "expected_detection": "differential_computation",
    },
    # ── 4. OpenAI o4-mini: timing signature (no usage detail, high latency)
    {
        "id": "call_004",
        "model": "o4-mini",
        "endpoint_name": "/api/llm/log",
        "feature_name": "cost_forecast",
        "response_latency_ms": 6000.0,
        "usage_metadata": {
            "prompt_tokens": 256,
            "completion_tokens": 80,
            # No total_tokens, no completion_tokens_details => falls to timing
        },
        "expected_detection": "timing_signature_estimate",
    },
    # ── 5. GPT-4o: standard model, no thinking tokens ─────────────────────
    {
        "id": "call_005",
        "model": "gpt-4o",
        "endpoint_name": "/api/postman",
        "feature_name": "postman_import",
        "response_latency_ms": 820.0,
        "usage_metadata": {
            "prompt_tokens": 1200,
            "completion_tokens": 450,
            "total_tokens": 1650,
        },
        "expected_detection": "none",
    },
    # ── 6. claude-opus-4: ANOMALY — thinking > 3x output ─────────────────
    {
        "id": "call_006",
        "model": "claude-opus-4",
        "endpoint_name": "/api/scan",
        "feature_name": "deep_security_audit",
        "response_latency_ms": 22000.0,
        "usage_metadata": {
            "input_tokens": 2048,
            "output_tokens": 180,
            "thinking_tokens": 12000,  # 12000 >> 180*3 => anomaly
        },
        "expected_detection": "direct_field_anthropic",
        "expected_anomaly": True,
    },
    # ── 7. gemini-2.0-flash-thinking: direct field ────────────────────────
    {
        "id": "call_007",
        "model": "gemini-2.0-flash-thinking",
        "endpoint_name": "/api/compliance",
        "feature_name": "gdpr_mapping",
        "response_latency_ms": 3100.0,
        "usage_metadata": {
            "input_tokens": 640,
            "output_tokens": 200,
            "thinking_tokens": 800,
        },
        "expected_detection": "direct_field_anthropic",
    },
    # ── 8. gpt-4o-mini: fast call, no thinking ────────────────────────────
    {
        "id": "call_008",
        "model": "gpt-4o-mini",
        "endpoint_name": "/api/alerts",
        "feature_name": "alert_triage",
        "response_latency_ms": 310.0,
        "usage_metadata": {
            "prompt_tokens": 320,
            "completion_tokens": 90,
            "total_tokens": 410,
        },
        "expected_detection": "none",
    },
]


def run_example_dataset() -> None:
    """Process all example calls and print structured attribution output."""
    print("=" * 72)
    print("DevPulse Thinking Token Attribution — Example Dataset")
    print("=" * 72)

    db_rows: list[dict] = []  # Simulates thinking_token_logs table rows

    for call in EXAMPLE_CALLS:
        result = extract_thinking_tokens_from_usage(
            model=call["model"],
            usage_metadata=call["usage_metadata"],
            response_latency_ms=call["response_latency_ms"],
        )

        tokens = result["tokens"]
        costs = result["cost_inr"]
        print(
            f"\n[{call['id']}] {call['model']}  =>  {call['endpoint_name']}  /  {call['feature_name']}"
        )
        print(f"  Detection  : {result['detection_method']}")
        print(
            f"  Tokens     : prompt={tokens['input']}  completion={tokens['output']}  thinking={tokens['thinking']}  total={tokens['total']}"
        )
        print(
            f"  Cost (INR) : input=INR{costs['input']}  output=INR{costs['output']}  thinking=INR{costs['thinking']}  total=INR{costs['total']}"
        )
        print(
            f"  Overhead   : {result['thinking_overhead_multiplier']}x  |  anomaly={result['is_thinking_anomaly']}  |  {result['ms_per_output_token']} ms/token"
        )
        print(f"  Advice     : {result['optimization_recommendation']}")

        # Build DB row (mirrors thinking_token_logs schema)
        db_rows.append(
            {
                "id": call["id"],
                "model": call["model"],
                "endpoint_name": call["endpoint_name"],
                "feature_name": call["feature_name"],
                "input_tokens": tokens["input"],
                "output_tokens": tokens["output"],
                "thinking_tokens": tokens["thinking"],
                "total_tokens": tokens["total"],
                "thinking_cost_inr": costs["thinking"],
                "total_cost_inr": costs["total"],
                "thinking_overhead_multiplier": result["thinking_overhead_multiplier"],
                "is_thinking_anomaly": result["is_thinking_anomaly"],
                "detection_method": result["detection_method"],
                "response_latency_ms": call["response_latency_ms"],
            }
        )

    # ── Aggregate stats across all calls ──────────────────────────────────
    stats = aggregate_thinking_token_stats(db_rows)

    print("\n" + "=" * 72)
    print("Aggregated Statistics")
    print("=" * 72)
    print(f"  Total calls            : {stats['total_calls']}")
    print(
        f"  Calls with thinking    : {stats['calls_with_thinking']}  ({stats['thinking_call_rate_pct']}%)"
    )
    print(f"  Total thinking tokens  : {stats['total_thinking_tokens']:,}")
    print(f"  Thinking cost          : INR{stats['total_thinking_cost_inr']}")
    print(f"  Total LLM cost         : INR{stats['total_cost_inr']}")
    print(f"  Avg overhead           : {stats['avg_thinking_overhead']}x")
    print(f"  Anomaly calls          : {stats['anomaly_calls']}")
    print(f"  Potential savings      : INR{stats['potential_savings_inr']}")

    # ── Per-endpoint attribution ───────────────────────────────────────────
    print("\n" + "=" * 72)
    print("Per-Endpoint Cost Attribution")
    print("=" * 72)
    by_endpoint: dict[str, dict] = {}
    for row in db_rows:
        ep = row["endpoint_name"]
        if ep not in by_endpoint:
            by_endpoint[ep] = {
                "calls": 0,
                "thinking_tokens": 0,
                "thinking_cost_inr": 0.0,
                "total_cost_inr": 0.0,
            }
        by_endpoint[ep]["calls"] += 1
        by_endpoint[ep]["thinking_tokens"] += row["thinking_tokens"]
        by_endpoint[ep]["thinking_cost_inr"] += row["thinking_cost_inr"]
        by_endpoint[ep]["total_cost_inr"] += row["total_cost_inr"]

    for ep, data in sorted(by_endpoint.items(), key=lambda x: -x[1]["total_cost_inr"]):
        thinking_pct = (
            round(data["thinking_cost_inr"] / data["total_cost_inr"] * 100, 1)
            if data["total_cost_inr"] > 0
            else 0.0
        )
        print(
            f"  {ep:<30}  calls={data['calls']}  "
            f"thinking=INR{data['thinking_cost_inr']:.4f}  "
            f"total=INR{data['total_cost_inr']:.4f}  "
            f"thinking%={thinking_pct}%"
        )

    # ── Per-feature attribution ────────────────────────────────────────────
    print("\n" + "=" * 72)
    print("Per-Feature Cost Attribution")
    print("=" * 72)
    by_feature: dict[str, dict] = {}
    for row in db_rows:
        feat = row["feature_name"]
        if feat not in by_feature:
            by_feature[feat] = {
                "calls": 0,
                "thinking_tokens": 0,
                "thinking_cost_inr": 0.0,
                "total_cost_inr": 0.0,
            }
        by_feature[feat]["calls"] += 1
        by_feature[feat]["thinking_tokens"] += row["thinking_tokens"]
        by_feature[feat]["thinking_cost_inr"] += row["thinking_cost_inr"]
        by_feature[feat]["total_cost_inr"] += row["total_cost_inr"]

    for feat, data in sorted(by_feature.items(), key=lambda x: -x[1]["total_cost_inr"]):
        thinking_pct = (
            round(data["thinking_cost_inr"] / data["total_cost_inr"] * 100, 1)
            if data["total_cost_inr"] > 0
            else 0.0
        )
        print(
            f"  {feat:<30}  calls={data['calls']}  "
            f"thinking=INR{data['thinking_cost_inr']:.4f}  "
            f"total=INR{data['total_cost_inr']:.4f}  "
            f"thinking%={thinking_pct}%"
        )


if __name__ == "__main__":
    run_example_dataset()
