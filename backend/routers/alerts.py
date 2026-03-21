from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.supabase_client import supabase

router = APIRouter(tags=["alerts"])


@router.get("/alerts/{user_id}")
def list_alerts(user_id: str):
    res = (
        supabase.table("security_alerts")
        .select("*")
        .eq("user_id", user_id)
        .eq("resolved", False)
        .order("created_at", desc=True)
        .execute()
    )
    return {"alerts": res.data or []}


class ResolveAlertRequest(BaseModel):
    user_id: str = Field(..., min_length=1)


@router.patch("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: str, req: ResolveAlertRequest):
    existing = (
        supabase.table("security_alerts")
        .select("*")
        .eq("id", alert_id)
        .eq("user_id", req.user_id)
        .limit(1)
        .execute()
    )
    rows = existing.data or []
    if not rows:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: alert does not belong to this user",
        )
    res = (
        supabase.table("security_alerts")
        .update({"resolved": True})
        .eq("id", alert_id)
        .eq("user_id", req.user_id)
        .execute()
    )
    updated = (res.data or rows)[0]
    return updated
