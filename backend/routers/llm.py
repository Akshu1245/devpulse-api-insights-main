from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

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

    daily_list = [{"date": (start + timedelta(days=i)).isoformat(), "cost": round(daily[(start + timedelta(days=i)).isoformat()], 4)} for i in range(30)]

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

    daily_list = [{"date": (start + timedelta(days=i)).isoformat(), "cost": round(daily[(start + timedelta(days=i)).isoformat()], 4)} for i in range(30)]

    return {
        "total_tokens": total_tokens,
        "total_cost_inr": float(round(Decimal(str(total_cost)), 4)),
        "cost_this_month_inr": float(round(cost_this_month, 4)),
        "most_expensive_model": most_expensive,
        "daily_breakdown": daily_list,
        "model_totals": {k: float(v) for k, v in by_model_cost.items()},
    }
