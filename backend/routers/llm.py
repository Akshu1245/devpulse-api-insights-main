from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from services.alert_config import get_user_config
from services.alert_dispatcher import ChannelConfig, dispatch_alert_background
from services.alert_rules import CostSpikeRuleConfig, evaluate_cost_spike
from services.auth_guard import assert_same_user, get_current_user_id
from services.supabase_client import supabase

router = APIRouter(prefix="/llm", tags=["llm"])


class LogRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    model: str = Field(..., min_length=1)
    tokens_used: int = Field(0, ge=0)
    cost_inr: float = Field(0.0, ge=0)


def _parse_ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _fire_cost_spike_alerts(
    user_id: str, cost_inr: float, model: str, tokens_used: int
) -> None:
    """Evaluate cost against thresholds and dispatch notifications."""
    cfg = get_user_config(user_id)
    if not cfg.get("enabled"):
        return

    # Compute today's total from llm_usage
    today = date.today()
    res = (
        supabase.table("llm_usage")
        .select("cost_inr, recorded_at")
        .eq("user_id", user_id)
        .execute()
    )
    daily_total = 0.0
    for r in res.data or []:
        ts = r.get("recorded_at")
        if not ts:
            continue
        try:
            d = _parse_ts(ts).date()
            if d == today:
                daily_total += float(r.get("cost_inr") or 0)
        except Exception:
            continue

    rule_cfg = CostSpikeRuleConfig(
        daily_threshold_inr=cfg.get("cost_daily_threshold_inr", 500.0),
        single_entry_threshold_inr=cfg.get("cost_single_entry_threshold_inr", 100.0),
        hourly_rate_multiplier=cfg.get("cost_hourly_rate_multiplier", 3.0),
    )
    alert_events = evaluate_cost_spike(
        user_id=user_id,
        cost_inr=cost_inr,
        model=model,
        tokens_used=tokens_used,
        daily_total_inr=daily_total,
        config=rule_cfg,
    )
    if not alert_events:
        return

    channels = [
        ChannelConfig(
            channel=ch["channel"],
            enabled=ch.get("enabled", False),
            email_to=ch.get("email_to"),
            slack_webhook_url=ch.get("slack_webhook_url"),
        )
        for ch in cfg.get("channels", [])
        if ch.get("enabled")
    ]
    if not channels:
        return

    for evt in alert_events:
        dispatch_alert_background(evt, channels)


@router.post("/log")
def log_usage(req: LogRequest, auth_user_id: str = Depends(get_current_user_id)):
    assert_same_user(auth_user_id, req.user_id)
    row = {
        "user_id": req.user_id,
        "model": req.model,
        "tokens_used": req.tokens_used,
        "cost_inr": req.cost_inr,
    }
    res = supabase.table("llm_usage").insert(row).execute()
    data = res.data or []

    # ── Real-time cost spike alert dispatch ──────────────────────────────
    _fire_cost_spike_alerts(req.user_id, req.cost_inr, req.model, req.tokens_used)

    return data[0] if data else row


@router.get("/usage/{user_id}")
def usage(user_id: str, auth_user_id: str = Depends(get_current_user_id)):
    assert_same_user(auth_user_id, user_id)
    res = (
        supabase.table("llm_usage")
        .select("*")
        .eq("user_id", user_id)
        .order("recorded_at", desc=True)
        .execute()
    )
    rows = res.data or []
    total_cost = sum(float(r.get("cost_inr") or 0) for r in rows)
    by_model: dict[str, float] = defaultdict(float)
    tokens_by_model: dict[str, int] = defaultdict(int)
    for r in rows:
        m = r.get("model") or "unknown"
        by_model[m] += float(r.get("cost_inr") or 0)
        tokens_by_model[m] += int(r.get("tokens_used") or 0)

    today = date.today()
    start = today - timedelta(days=29)
    daily: dict[str, float] = defaultdict(float)
    for r in rows:
        ts = r.get("recorded_at")
        if not ts:
            continue
        d = _parse_ts(ts).date()
        if d < start or d > today:
            continue
        daily[d.isoformat()] += float(r.get("cost_inr") or 0)

    daily_list = [
        {
            "date": (start + timedelta(days=i)).isoformat(),
            "cost": round(daily[(start + timedelta(days=i)).isoformat()], 4),
        }
        for i in range(30)
    ]

    breakdown = [
        {"model": m, "total_cost_inr": round(v, 4), "total_tokens": tokens_by_model[m]}
        for m, v in sorted(by_model.items(), key=lambda x: -x[1])
    ]

    return {
        "records": rows,
        "total_cost_inr": round(total_cost, 4),
        "breakdown_by_model": breakdown,
        "daily_last_30_days": daily_list,
    }


@router.get("/summary/{user_id}")
def summary(user_id: str, auth_user_id: str = Depends(get_current_user_id)):
    assert_same_user(auth_user_id, user_id)
    res = supabase.table("llm_usage").select("*").eq("user_id", user_id).execute()
    rows = res.data or []

    total_tokens = sum(int(r.get("tokens_used") or 0) for r in rows)
    total_cost = sum(float(r.get("cost_inr") or 0) for r in rows)
    by_model_cost: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for r in rows:
        m = r.get("model") or "unknown"
        by_model_cost[m] += Decimal(str(r.get("cost_inr") or 0))

    most_expensive = None
    if by_model_cost:
        most_expensive = max(by_model_cost.items(), key=lambda x: x[1])[0]

    today = date.today()
    start = today - timedelta(days=29)
    daily: dict[str, float] = defaultdict(float)
    month_start = date(today.year, today.month, 1)
    cost_this_month = Decimal("0")

    for r in rows:
        ts = r.get("recorded_at")
        if not ts:
            continue
        dt = _parse_ts(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        d = dt.date()
        if d >= month_start and d <= today:
            cost_this_month += Decimal(str(r.get("cost_inr") or 0))
        if start <= d <= today:
            daily[d.isoformat()] += float(r.get("cost_inr") or 0)

    daily_list = [
        {
            "date": (start + timedelta(days=i)).isoformat(),
            "cost": round(daily[(start + timedelta(days=i)).isoformat()], 4),
        }
        for i in range(30)
    ]

    return {
        "total_tokens": total_tokens,
        "total_cost_inr": float(round(Decimal(str(total_cost)), 4)),
        "cost_this_month_inr": float(round(cost_this_month, 4)),
        "most_expensive_model": most_expensive,
        "daily_breakdown": daily_list,
        "model_totals": {k: float(v) for k, v in by_model_cost.items()},
    }
