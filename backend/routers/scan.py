from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from services.auth_guard import assert_same_user, get_current_user_id
from services.scanner import run_security_probe
from services.supabase_client import supabase

router = APIRouter(tags=["scan"])


class ScanRequest(BaseModel):
    endpoint: str = Field(..., min_length=1)
    user_id: str = Field(..., min_length=1)


@router.post("/scan")
async def scan(req: ScanRequest, auth_user_id: str = Depends(get_current_user_id)):
    assert_same_user(auth_user_id, req.user_id)
    try:
        issues = await run_security_probe(req.endpoint)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    rows = []
    alert_rows = []
    for item in issues:
        row = {
            "user_id": req.user_id,
            "endpoint": req.endpoint.strip(),
            "method": item["method"],
            "risk_level": item["risk_level"],
            "issue": item["issue"],
            "recommendation": item["recommendation"],
        }
        rows.append(row)
        if item["risk_level"] in ("critical", "high"):
            alert_rows.append(
                {
                    "user_id": req.user_id,
                    "severity": item["risk_level"],
                    "description": item["issue"],
                    "endpoint": req.endpoint.strip(),
                    "resolved": False,
                }
            )

    if rows:
        supabase.table("api_scans").insert(rows).execute()
    if alert_rows:
        supabase.table("security_alerts").insert(alert_rows).execute()

    return {"issues": issues, "endpoint": req.endpoint.strip()}


@router.get("/scans/{user_id}")
def list_scans(user_id: str, auth_user_id: str = Depends(get_current_user_id)):
    assert_same_user(auth_user_id, user_id)
    res = (
        supabase.table("api_scans")
        .select("*")
        .eq("user_id", user_id)
        .order("scanned_at", desc=True)
        .execute()
    )
    return {"scans": res.data or []}
