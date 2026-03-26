from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from services.alerts_table import get_alerts_table
from services.auth_guard import assert_same_user, get_current_user_id
from services.error_handler import log_route_error, safe_db_call
from services.supabase_client import supabase

_log = logging.getLogger("devpulse")

router = APIRouter(tags=["alerts"])


@router.get("/alerts/{user_id}")
def list_alerts(user_id: str, auth_user_id: str = Depends(get_current_user_id)):
    assert_same_user(auth_user_id, user_id)
    table_name = get_alerts_table()
    try:
        with safe_db_call("list alerts"):
            res = (
                supabase.table(table_name)
                .select("*")
                .eq("user_id", user_id)
                .eq("resolved", False)
                .order("created_at", desc=True)
                .execute()
            )
        return {"success": True, "data": {"alerts": res.data or []}}
    except HTTPException:
        raise
    except Exception as exc:
        log_route_error(f"/alerts/{user_id}", exc, {"user_id": user_id})
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Failed to retrieve alerts. Please try again.",
                "code": "DB_ERROR",
                "details": {},
            },
        ) from exc


class ResolveAlertRequest(BaseModel):
    user_id: str = Field(..., min_length=1)


@router.patch("/alerts/{alert_id}/resolve")
def resolve_alert(
    alert_id: str,
    req: ResolveAlertRequest,
    auth_user_id: str = Depends(get_current_user_id),
):
    assert_same_user(auth_user_id, req.user_id)
    table_name = get_alerts_table()

    try:
        with safe_db_call("fetch alert for resolve"):
            existing = (
                supabase.table(table_name)
                .select("*")
                .eq("id", alert_id)
                .eq("user_id", req.user_id)
                .limit(1)
                .execute()
            )
    except HTTPException:
        raise
    except Exception as exc:
        log_route_error(f"/alerts/{alert_id}/resolve", exc, {"alert_id": alert_id})
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Failed to fetch alert. Please try again.",
                "code": "DB_ERROR",
                "details": {},
            },
        ) from exc

    rows = existing.data or []
    if not rows:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: alert does not belong to this user",
        )

    try:
        with safe_db_call("resolve alert"):
            res = (
                supabase.table(table_name)
                .update({"resolved": True})
                .eq("id", alert_id)
                .eq("user_id", req.user_id)
                .execute()
            )
    except HTTPException:
        raise
    except Exception as exc:
        log_route_error(f"/alerts/{alert_id}/resolve", exc, {"alert_id": alert_id})
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Failed to resolve alert. Please try again.",
                "code": "DB_ERROR",
                "details": {},
            },
        ) from exc

    updated = (res.data or rows)[0]
    return {"success": True, "data": updated}
