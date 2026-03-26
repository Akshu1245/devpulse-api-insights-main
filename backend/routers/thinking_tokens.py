"""
Thinking Token Attribution Router — DevPulse Patent 2
Exposes thinking token analysis endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import Any

from services.auth_guard import assert_same_user, get_current_user_id
from services.thinking_tokens import (
    extract_thinking_tokens_from_usage,
    aggregate_thinking_token_stats,
)
from services.supabase_client import supabase

router = APIRouter(prefix="/thinking-tokens", tags=["thinking-tokens"])


class ThinkingTokenLogRequest(BaseModel):
    user_id: str
    model: str
    endpoint_name: str = ""
    feature_name: str = ""
    usage_metadata: dict = Field(default_factory=dict)
    response_latency_ms: float = 0.0
    prompt_preview: str = ""  # First 100 chars of prompt for context


@router.post("/log")
def log_thinking_tokens(
    req: ThinkingTokenLogRequest,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Log an LLM API call with thinking token attribution.
    Extracts thinking tokens using differential computation and timing signals.
    """
    assert_same_user(auth_user_id, req.user_id)

    # Extract thinking token data
    attribution = extract_thinking_tokens_from_usage(
        model=req.model,
        usage_metadata=req.usage_metadata,
        response_latency_ms=req.response_latency_ms,
    )

    # Store in Supabase
    row = {
        "user_id": req.user_id,
        "model": req.model,
        "endpoint_name": req.endpoint_name,
        "feature_name": req.feature_name,
        "input_tokens": attribution["tokens"]["input"],
        "output_tokens": attribution["tokens"]["output"],
        "thinking_tokens": attribution["tokens"]["thinking"],
        "total_tokens": attribution["tokens"]["total"],
        "thinking_cost_inr": attribution["cost_inr"]["thinking"],
        "total_cost_inr": attribution["cost_inr"]["total"],
        "thinking_overhead_multiplier": attribution["thinking_overhead_multiplier"],
        "is_thinking_anomaly": attribution["is_thinking_anomaly"],
        "detection_method": attribution["detection_method"],
        "response_latency_ms": req.response_latency_ms,
    }

    try:
        res = supabase.table("thinking_token_logs").insert(row).execute()
        saved = (res.data or [{}])[0]
    except Exception:
        saved = row

    return {
        "logged": True,
        "attribution": attribution,
        "record": saved,
    }


@router.get("/stats/{user_id}")
def get_thinking_token_stats(
    user_id: str,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Get aggregated thinking token statistics for a user."""
    assert_same_user(auth_user_id, user_id)

    try:
        res = (
            supabase.table("thinking_token_logs")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(500)
            .execute()
        )
        records = res.data or []
    except Exception as e:
        return {"error": str(e), "records": [], "stats": {}}

    stats = aggregate_thinking_token_stats(records)

    # Per-endpoint breakdown
    by_endpoint: dict[str, dict] = {}
    for r in records:
        ep = r.get("endpoint_name") or r.get("feature_name") or "unknown"
        if ep not in by_endpoint:
            by_endpoint[ep] = {
                "endpoint": ep,
                "calls": 0,
                "thinking_tokens": 0,
                "thinking_cost_inr": 0.0,
                "total_cost_inr": 0.0,
                "anomaly_calls": 0,
            }
        by_endpoint[ep]["calls"] += 1
        by_endpoint[ep]["thinking_tokens"] += int(r.get("thinking_tokens", 0))
        by_endpoint[ep]["thinking_cost_inr"] += float(r.get("thinking_cost_inr", 0))
        by_endpoint[ep]["total_cost_inr"] += float(r.get("total_cost_inr", 0))
        if r.get("is_thinking_anomaly"):
            by_endpoint[ep]["anomaly_calls"] += 1

    endpoint_breakdown = sorted(
        by_endpoint.values(),
        key=lambda x: x["thinking_cost_inr"],
        reverse=True,
    )

    # Per-model breakdown
    by_model: dict[str, dict] = {}
    for r in records:
        model = r.get("model", "unknown")
        if model not in by_model:
            by_model[model] = {
                "model": model,
                "calls": 0,
                "thinking_tokens": 0,
                "thinking_cost_inr": 0.0,
                "avg_overhead": 0.0,
            }
        by_model[model]["calls"] += 1
        by_model[model]["thinking_tokens"] += int(r.get("thinking_tokens", 0))
        by_model[model]["thinking_cost_inr"] += float(r.get("thinking_cost_inr", 0))

    return {
        "stats": stats,
        "endpoint_breakdown": endpoint_breakdown[:20],
        "model_breakdown": list(by_model.values()),
        "recent_anomalies": [r for r in records[:50] if r.get("is_thinking_anomaly")][
            :10
        ],
    }


@router.get("/analyze/{user_id}")
def analyze_thinking_efficiency(
    user_id: str,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Analyze thinking token efficiency and provide optimization recommendations.
    This is the 'Cost Revelation Moment' — shows which endpoint is burning budget.
    """
    assert_same_user(auth_user_id, user_id)

    try:
        res = (
            supabase.table("thinking_token_logs")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1000)
            .execute()
        )
        records = res.data or []
    except Exception as e:
        return {"error": str(e)}

    if not records:
        return {
            "message": "No thinking token data yet. Start logging LLM calls to see cost attribution.",
            "recommendations": [],
        }

    total_cost = sum(float(r.get("total_cost_inr", 0)) for r in records)
    total_thinking_cost = sum(float(r.get("thinking_cost_inr", 0)) for r in records)

    # Find the most expensive endpoint
    by_endpoint: dict[str, float] = {}
    for r in records:
        ep = r.get("endpoint_name") or r.get("feature_name") or "unknown"
        by_endpoint[ep] = by_endpoint.get(ep, 0) + float(r.get("total_cost_inr", 0))

    top_endpoint = (
        max(by_endpoint.items(), key=lambda x: x[1]) if by_endpoint else ("unknown", 0)
    )
    top_pct = round(top_endpoint[1] / total_cost * 100, 1) if total_cost > 0 else 0

    recommendations = []

    if total_thinking_cost > total_cost * 0.3:
        recommendations.append(
            {
                "priority": "HIGH",
                "type": "thinking_cost_reduction",
                "message": (
                    f"Thinking tokens account for {round(total_thinking_cost / total_cost * 100, 1)}% "
                    f"of your LLM costs. Add max_reasoning_tokens limits to your API calls."
                ),
                "potential_savings_inr": round(total_thinking_cost * 0.5, 2),
            }
        )

    if top_pct > 50:
        recommendations.append(
            {
                "priority": "HIGH",
                "type": "endpoint_cost_concentration",
                "message": (
                    f"Your '{top_endpoint[0]}' endpoint accounts for {top_pct}% of total LLM costs. "
                    f"Optimize this endpoint first."
                ),
                "endpoint": top_endpoint[0],
                "cost_inr": round(top_endpoint[1], 2),
            }
        )

    anomaly_count = sum(1 for r in records if r.get("is_thinking_anomaly"))
    if anomaly_count > 0:
        recommendations.append(
            {
                "priority": "CRITICAL",
                "type": "thinking_anomaly",
                "message": (
                    f"{anomaly_count} LLM calls detected with abnormal thinking token usage. "
                    f"These may indicate runaway reasoning loops."
                ),
                "anomaly_count": anomaly_count,
            }
        )

    return {
        "total_cost_inr": round(total_cost, 2),
        "thinking_cost_inr": round(total_thinking_cost, 2),
        "thinking_cost_pct": round(total_thinking_cost / total_cost * 100, 1)
        if total_cost > 0
        else 0,
        "top_cost_endpoint": top_endpoint[0],
        "top_cost_endpoint_pct": top_pct,
        "recommendations": recommendations,
        "potential_monthly_savings_inr": round(total_thinking_cost * 0.5, 2),
    }
