from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from services.alert_config import get_user_config
from services.alert_dispatcher import ChannelConfig, dispatch_alert_background
from services.alert_rules import VulnerabilityRuleConfig, evaluate_vulnerability
from services.alerts_table import get_alerts_table
from services.auth_guard import assert_same_user, get_current_user_id
from services.owasp_engine import OwaspScanner
from services.scanner import run_security_probe
from services.supabase_client import supabase

router = APIRouter(tags=["scan"])


class ScanRequest(BaseModel):
    endpoint: str = Field(..., min_length=1)
    user_id: str = Field(..., min_length=1)


def _fire_vulnerability_alerts(user_id: str, endpoint: str, issues: list[dict]) -> None:
    """Evaluate findings against alert rules and dispatch notifications."""
    cfg = get_user_config(user_id)
    if not cfg.get("enabled"):
        return

    rule_cfg = VulnerabilityRuleConfig(
        min_severity=cfg.get("vulnerability_min_severity", "high"),
    )
    alert_events = evaluate_vulnerability(
        user_id=user_id,
        endpoint=endpoint,
        findings=issues,
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
        supabase.table(get_alerts_table()).insert(alert_rows).execute()

    # ── Real-time alert dispatch ─────────────────────────────────────────
    _fire_vulnerability_alerts(req.user_id, req.endpoint.strip(), issues)

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


# ---------------------------------------------------------------------------
# OWASP API Top 10 deep scan endpoint
# ---------------------------------------------------------------------------


class OwaspScanRequest(BaseModel):
    endpoint: str = Field(
        ..., min_length=1, description="Target API endpoint URL to scan"
    )
    user_id: str = Field(..., min_length=1)
    auth_token: Optional[str] = Field(
        default=None,
        description="Bearer token to include when probing the target (tests auth-protected paths)",
    )
    extra_headers: Optional[dict] = Field(
        default=None,
        description="Additional request headers to send to the target during scanning",
    )
    timeout: float = Field(
        default=30.0,
        ge=5.0,
        le=120.0,
        description="Per-request timeout in seconds (5–120)",
    )


@router.post("/scan/owasp")
async def owasp_scan(
    req: OwaspScanRequest,
    auth_user_id: str = Depends(get_current_user_id),
):
    """
    Run a full OWASP API Security Top 10 scan against the target endpoint.

    Tests for:
    - API1: Broken Object Level Authorization (BOLA/IDOR)
    - API2: Broken Authentication
    - API3: Excessive Data Exposure
    - API3/MA: Mass Assignment
    - API4: Injection (SQL, NoSQL, command)
    - API8: Security Misconfiguration

    Returns findings with severity (LOW / MEDIUM / HIGH / CRITICAL),
    CVSS scores, CWE references, evidence, and remediation guidance.
    """
    assert_same_user(auth_user_id, req.user_id)

    scanner = OwaspScanner(
        auth_token=req.auth_token or "",
        extra_headers=req.extra_headers or {},
        timeout=req.timeout,
    )

    try:
        result = await scanner.scan(req.endpoint)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Scan engine error: {exc}",
        ) from exc

    result_dict = result.to_dict()

    # Persist critical/high findings to api_scans table
    rows = []
    for f in result.findings:
        if f.severity in ("CRITICAL", "HIGH"):
            rows.append(
                {
                    "user_id": req.user_id,
                    "endpoint": req.endpoint.strip(),
                    "method": "OWASP",
                    "risk_level": f.severity.lower(),
                    "issue": f"[{f.owasp_id}] {f.title}",
                    "recommendation": f.recommendation,
                }
            )
    if rows:
        supabase.table("api_scans").insert(rows).execute()

    # Fire alert dispatch for critical/high findings
    legacy_issues = [
        {
            "issue": f"[{f.owasp_id}] {f.title}",
            "risk_level": f.severity.lower(),
            "recommendation": f.recommendation,
            "method": "OWASP",
        }
        for f in result.findings
    ]
    _fire_vulnerability_alerts(req.user_id, req.endpoint.strip(), legacy_issues)

    return result_dict
