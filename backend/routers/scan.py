from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional

from services.alert_config import get_user_config
from services.alert_dispatcher import ChannelConfig, dispatch_alert_background
from services.alert_rules import VulnerabilityRuleConfig, evaluate_vulnerability
from services.alerts_table import get_alerts_table
from services.auth_guard import assert_same_user, get_current_user_id
from services.cache import cache_key, scan_cache
from services.error_handler import log_route_error, safe_db_call, validate_url
from services.owasp_engine import OwaspScanner
from services.rate_limiter import (
    check_concurrent_scans,
    check_scan_cooldown,
    check_scan_rate_limit,
    concurrent_scan_tracker,
    scan_cooldown,
)
from services.scanner import run_security_probe
from services.supabase_client import supabase

_log = logging.getLogger("devpulse")

router = APIRouter(tags=["scan"])

# Maximum number of endpoints allowed in a single batch scan request
MAX_ENDPOINTS_PER_REQUEST = 50

# Scan result cache TTL in seconds (2 minutes)
SCAN_CACHE_TTL = 120


class ScanRequest(BaseModel):
    endpoint: str = Field(..., min_length=1)
    user_id: str = Field(..., min_length=1)


def _fire_vulnerability_alerts(user_id: str, endpoint: str, issues: list[dict]) -> None:
    """Evaluate findings against alert rules and dispatch notifications."""
    try:
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
    except Exception as exc:
        # Alert dispatch failures must never crash the scan response
        _log.warning("Alert dispatch failed for user=%s endpoint=%s: %s", user_id, endpoint, exc)


@router.post("/scan")
async def scan(req: ScanRequest, request: Request, auth_user_id: str = Depends(get_current_user_id)):
    assert_same_user(auth_user_id, req.user_id)

    # Validate and normalize the endpoint URL
    endpoint = validate_url(req.endpoint, field_name="endpoint")

    # Extract client IP for rate limiting
    ip = request.client.host if request.client else "unknown"

    # --- Rate limit check (per-IP and per-user) ---
    rl_error = check_scan_rate_limit(ip=ip, user_id=req.user_id, endpoint=endpoint)
    if rl_error:
        return JSONResponse(status_code=429, content=rl_error)

    # --- Endpoint cooldown check ---
    cooldown_error = check_scan_cooldown(user_id=req.user_id, endpoint=endpoint, ip=ip)
    if cooldown_error:
        return JSONResponse(status_code=429, content=cooldown_error)

    # --- Concurrent scan guard ---
    concurrent_error = check_concurrent_scans(user_id=req.user_id, ip=ip, endpoint=endpoint)
    if concurrent_error:
        return JSONResponse(status_code=429, content=concurrent_error)

    # --- Cache check: return cached result if available ---
    cache_k = cache_key("scan", req.user_id, endpoint)
    cached = scan_cache.get(cache_k)
    if cached is not None:
        _log.info("Cache HIT for scan user=%s endpoint=%s", req.user_id, endpoint)
        return cached

    # --- Record scan start ---
    concurrent_scan_tracker.start(req.user_id)
    scan_cooldown.record_scan(req.user_id, endpoint)

    try:
        issues = await asyncio.wait_for(
            run_security_probe(endpoint),
            timeout=60.0,
        )
    except asyncio.TimeoutError:
        concurrent_scan_tracker.finish(req.user_id)
        raise HTTPException(
            status_code=504,
            detail={
                "message": "Scan timed out. The target endpoint did not respond in time.",
                "code": "SCAN_TIMEOUT",
                "details": {},
            },
        )
    except ValueError as e:
        concurrent_scan_tracker.finish(req.user_id)
        raise HTTPException(
            status_code=400,
            detail={"message": str(e), "code": "INVALID_URL", "details": {}},
        ) from e
    except Exception as exc:
        concurrent_scan_tracker.finish(req.user_id)
        log_route_error("/scan", exc, {"endpoint": endpoint, "user_id": req.user_id})
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Scan failed due to an internal error. Please try again.",
                "code": "SCAN_ERROR",
                "details": {},
            },
        ) from exc
    finally:
        concurrent_scan_tracker.finish(req.user_id)

    rows = []
    alert_rows = []
    for item in issues:
        row = {
            "user_id": req.user_id,
            "endpoint": endpoint,
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
                    "endpoint": endpoint,
                    "resolved": False,
                }
            )

    # DB writes â€” failures are logged but do not crash the response
    if rows:
        try:
            with safe_db_call("insert api_scans"):
                supabase.table("api_scans").insert(rows).execute()
        except HTTPException:
            pass  # DB error logged inside safe_db_call; scan result still returned

    if alert_rows:
        try:
            with safe_db_call("insert alerts"):
                supabase.table(get_alerts_table()).insert(alert_rows).execute()
        except HTTPException:
            pass

    # Real-time alert dispatch (non-blocking)
    _fire_vulnerability_alerts(req.user_id, endpoint, issues)

    result = {"success": True, "data": {"issues": issues, "endpoint": endpoint}}

    # Cache the result for SCAN_CACHE_TTL seconds
    scan_cache.set(cache_k, result, ttl=SCAN_CACHE_TTL)

    return result


@router.get("/scans/{user_id}")
def list_scans(user_id: str, auth_user_id: str = Depends(get_current_user_id)):
    assert_same_user(auth_user_id, user_id)
    try:
        with safe_db_call("list scans"):
            res = (
                supabase.table("api_scans")
                .select("*")
                .eq("user_id", user_id)
                .order("scanned_at", desc=True)
                .execute()
            )
        return {"success": True, "data": {"scans": res.data or []}}
    except HTTPException:
        raise
    except Exception as exc:
        log_route_error(f"/scans/{user_id}", exc, {"user_id": user_id})
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Failed to retrieve scans. Please try again.",
                "code": "DB_ERROR",
                "details": {},
            },
        ) from exc


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
        description="Per-request timeout in seconds (5â€“120)",
    )


@router.post("/scan/owasp")
async def owasp_scan(
    req: OwaspScanRequest,
    request: Request,
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

    # Validate and normalize the endpoint URL
    endpoint = validate_url(req.endpoint, field_name="endpoint")

    # Extract client IP for rate limiting
    ip = request.client.host if request.client else "unknown"

    # --- Rate limit check ---
    rl_error = check_scan_rate_limit(ip=ip, user_id=req.user_id, endpoint=endpoint)
    if rl_error:
        return JSONResponse(status_code=429, content=rl_error)

    # --- Endpoint cooldown check ---
    cooldown_error = check_scan_cooldown(user_id=req.user_id, endpoint=endpoint, ip=ip)
    if cooldown_error:
        return JSONResponse(status_code=429, content=cooldown_error)

    # --- Concurrent scan guard ---
    concurrent_error = check_concurrent_scans(user_id=req.user_id, ip=ip, endpoint=endpoint)
    if concurrent_error:
        return JSONResponse(status_code=429, content=concurrent_error)

    # --- Cache check ---
    cache_k = cache_key("owasp_scan", req.user_id, endpoint)
    cached = scan_cache.get(cache_k)
    if cached is not None:
        _log.info("Cache HIT for owasp_scan user=%s endpoint=%s", req.user_id, endpoint)
        return cached

    # --- Record scan start ---
    concurrent_scan_tracker.start(req.user_id)
    scan_cooldown.record_scan(req.user_id, endpoint)

    scanner = OwaspScanner(
        auth_token=req.auth_token or "",
        extra_headers=req.extra_headers or {},
        timeout=req.timeout,
    )

    try:
        result = await asyncio.wait_for(
            scanner.scan(endpoint),
            timeout=req.timeout + 10.0,
        )
    except asyncio.TimeoutError:
        concurrent_scan_tracker.finish(req.user_id)
        raise HTTPException(
            status_code=504,
            detail={
                "message": "OWASP scan timed out. The target endpoint did not respond in time.",
                "code": "SCAN_TIMEOUT",
                "details": {},
            },
        )
    except ValueError as exc:
        concurrent_scan_tracker.finish(req.user_id)
        raise HTTPException(
            status_code=400,
            detail={"message": str(exc), "code": "INVALID_URL", "details": {}},
        ) from exc
    except Exception as exc:
        concurrent_scan_tracker.finish(req.user_id)
        log_route_error("/scan/owasp", exc, {"endpoint": endpoint, "user_id": req.user_id})
        raise HTTPException(
            status_code=500,
            detail={
                "message": "OWASP scan failed due to an internal error. Please try again.",
                "code": "SCAN_ERROR",
                "details": {},
            },
        ) from exc
    finally:
        concurrent_scan_tracker.finish(req.user_id)

    result_dict = result.to_dict()

    # Persist critical/high findings to api_scans table
    rows = []
    for f in result.findings:
        if f.severity in ("CRITICAL", "HIGH"):
            rows.append(
                {
                    "user_id": req.user_id,
                    "endpoint": endpoint,
                    "method": "OWASP",
                    "risk_level": f.severity.lower(),
                    "issue": f"[{f.owasp_id}] {f.title}",
                    "recommendation": f.recommendation,
                }
            )
    if rows:
        try:
            with safe_db_call("insert owasp scan results"):
                supabase.table("api_scans").insert(rows).execute()
        except HTTPException:
            pass  # DB error logged; scan result still returned

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
    _fire_vulnerability_alerts(req.user_id, endpoint, legacy_issues)

    response = {"success": True, "data": result_dict}

    # Cache the result
    scan_cache.set(cache_k, response, ttl=SCAN_CACHE_TTL)

    return response
