"""
OWASP API3:2023 — Excessive Data Exposure Detection
=====================================================
Detects APIs that return more data than necessary by:
  1. Scanning response bodies for PII patterns
  2. Detecting sensitive field names in JSON responses
  3. Checking for verbose error messages / stack traces
  4. Identifying internal system information leakage
  5. Testing for debug/admin endpoints exposed publicly
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse, urlunparse

from services.owasp_engine import (
    Finding,
    ScanContext,
    safe_request,
    register_rule,
    detect_pii,
    detect_internal_errors,
)


def url_replace_path_bad(url: str) -> str:
    """Append path traversal suffix to test error handling."""
    p = urlparse(url)
    return urlunparse(p._replace(path=p.path + "/../../etc/passwd"))


# ── Sensitive field detection ───────────────────────────────────────────────

SENSITIVE_FIELDS = {
    "password",
    "passwd",
    "pwd",
    "secret",
    "token",
    "api_key",
    "apikey",
    "access_token",
    "refresh_token",
    "private_key",
    "credit_card",
    "ssn",
    "social_security",
    "card_number",
    "cvv",
    "bank_account",
    "routing_number",
    "internal_id",
    "admin_notes",
    "is_admin",
    "role",
    "permissions",
    "hash",
    "salt",
    "mfa_secret",
    "recovery_code",
    "backup_code",
    "session_id",
}

SENSITIVE_NESTED_KEYS = {
    "_internal",
    "_meta",
    "_debug",
    "_trace",
    "__debug__",
    "system_info",
    "stack_trace",
    "environment",
}


def _scan_json_depth(
    data: Any, path: str = "", depth: int = 0
) -> list[tuple[str, Any, int]]:
    """
    Recursively scan JSON structure.
    Returns list of (dotted_path, value, depth) for sensitive fields.
    """
    findings: list[tuple[str, Any, int]] = []
    if depth > 10:
        return findings

    if isinstance(data, dict):
        for key, val in data.items():
            full_path = f"{path}.{key}" if path else key
            key_lower = key.lower()

            # Check sensitive field names
            if key_lower in SENSITIVE_FIELDS:
                findings.append((full_path, val, depth))

            # Check for nested internal structures
            if key_lower in SENSITIVE_NESTED_KEYS:
                findings.append((full_path, val, depth))

            # Recurse
            findings.extend(_scan_json_depth(val, full_path, depth + 1))

    elif isinstance(data, list):
        for i, item in enumerate(data):
            findings.extend(_scan_json_depth(item, f"{path}[{i}]", depth + 1))

    return findings


# ── Main rule ───────────────────────────────────────────────────────────────


@register_rule
async def check_data_exposure(ctx: ScanContext) -> None:
    """Detect Excessive Data Exposure vulnerabilities."""

    baseline_status = ctx.metadata.get("baseline_status", 0)
    if baseline_status == 0:
        return

    baseline_body = ctx.metadata.get("baseline_body", "")
    baseline_json = ctx.metadata.get("baseline_json")
    baseline_headers = ctx.metadata.get("baseline_headers", {})

    # ── Test 1: Sensitive fields in JSON response ───────────────────────
    if baseline_json is not None:
        sensitive = _scan_json_depth(baseline_json)
        if sensitive:
            field_list = [
                f"{path} ({type(val).__name__})" for path, val, _ in sensitive[:15]
            ]
            severity = "HIGH" if len(sensitive) > 3 else "MEDIUM"
            ctx.add(
                Finding(
                    owasp_category="Excessive Data Exposure",
                    owasp_id="API3:2023",
                    title="Sensitive Fields Exposed in API Response",
                    severity=severity,
                    description=(
                        f"The API response contains {len(sensitive)} sensitive field(s) that "
                        f"should not be exposed to clients. Fields include: "
                        f"{', '.join(field_list[:10])}."
                    ),
                    evidence=f"Sensitive fields found: {field_list[:10]}",
                    recommendation=(
                        "Implement response filtering to remove internal/sensitive fields. "
                        "Use DTOs (Data Transfer Objects) or serializer classes to explicitly "
                        "define which fields are exposed. Never return password hashes, internal "
                        "IDs, or system metadata to clients."
                    ),
                    cwe="CWE-200",
                    cvss=6.5,
                )
            )

    # ── Test 2: PII detection in response body ──────────────────────────
    if baseline_body:
        pii_found = detect_pii(baseline_body)
        if pii_found:
            ctx.add(
                Finding(
                    owasp_category="Excessive Data Exposure",
                    owasp_id="API3:2023",
                    title="PII Patterns Detected in Response Body",
                    severity="HIGH",
                    description=(
                        f"The API response body contains patterns matching personally "
                        f"identifiable information: {', '.join(pii_found)}. This may indicate "
                        f"excessive data exposure."
                    ),
                    evidence=f"PII types detected: {pii_found}",
                    recommendation=(
                        "Audit the API response to ensure only necessary data is returned. "
                        "Mask or remove PII that is not required by the client. Implement "
                        "field-level access controls."
                    ),
                    cwe="CWE-359",
                    cvss=7.5,
                )
            )

    # ── Test 3: Verbose error / stack trace leakage ─────────────────────
    # Test with malformed path
    bad_url = ctx.target_url.rstrip("/") + "/../../../etc/passwd"
    resp = await safe_request(ctx.client, "GET", bad_url)
    if resp is not None:
        error_body = ""
        try:
            error_body = resp.text[:10_000]
        except Exception:
            pass
        if error_body:
            leaks = detect_internal_errors(error_body)
            if leaks:
                ctx.add(
                    Finding(
                        owasp_category="Excessive Data Exposure",
                        owasp_id="API3:2023",
                        title="Internal Error Details Leaked in Response",
                        severity="HIGH",
                        description=(
                            "The API response to a malformed request contains internal error "
                            "details, stack traces, or system information. This aids attackers "
                            "in understanding the system internals."
                        ),
                        evidence=f"Leaked patterns: {leaks[:5]}",
                        recommendation=(
                            "Return generic error messages in production. Log detailed errors "
                            "server-side only. Never expose stack traces, framework names, or "
                            "file paths to clients."
                        ),
                        cwe="CWE-209",
                        cvss=5.3,
                    )
                )

    # Test with bad POST body
    resp2 = await safe_request(
        ctx.client,
        "POST",
        ctx.target_url,
        content=b"INVALID{{{JSON",
        headers={"Content-Type": "application/json"},
    )
    if resp2 is not None:
        try:
            error_text = resp2.text[:10_000]
            leaks2 = detect_internal_errors(error_text)
            if leaks2:
                ctx.add(
                    Finding(
                        owasp_category="Excessive Data Exposure",
                        owasp_id="API3:2023",
                        title="Stack Trace Exposed on Malformed Request",
                        severity="HIGH",
                        description=(
                            "Sending an invalid JSON body causes the API to return a stack trace "
                            "or internal error details. This reveals framework and library versions."
                        ),
                        evidence=f"Leaked patterns: {leaks2[:5]}",
                        recommendation=(
                            "Validate request bodies early and return standardized error responses. "
                            "Never propagate raw exceptions to the client."
                        ),
                        cwe="CWE-209",
                        cvss=5.3,
                    )
                )
        except Exception:
            pass

    # ── Test 4: Debug / admin endpoints exposed ─────────────────────────
    debug_paths = [
        "/debug",
        "/admin",
        "/api/debug",
        "/api/admin",
        "/.env",
        "/config",
        "/api/config",
        "/health",
        "/status",
        "/metrics",
        "/swagger.json",
        "/openapi.json",
        "/graphql",
        "/graphiql",
        "/debug/vars",
        "/pprof",
        "/wp-admin",
        "/phpinfo.php",
        "/server-status",
    ]

    for path in debug_paths:
        test_url = ctx.base_url + path
        resp = await safe_request(ctx.client, "GET", test_url)
        if resp is not None and resp.status_code == 200:
            content_type = resp.headers.get("content-type", "")
            body_snippet = resp.text[:500] if resp.text else ""

            # Determine severity based on sensitivity
            if any(k in path for k in (".env", "config", "debug", "admin", "phpinfo")):
                sev = "CRITICAL"
            elif any(k in path for k in ("swagger", "openapi", "graphiql")):
                sev = "MEDIUM"
            else:
                sev = "LOW"

            ctx.add(
                Finding(
                    owasp_category="Excessive Data Exposure",
                    owasp_id="API3:2023",
                    title=f"Debug/Admin Endpoint Publicly Accessible: {path}",
                    severity=sev,
                    description=(
                        f"The endpoint {path} is publicly accessible and returns HTTP 200. "
                        f"This may expose sensitive configuration or administrative functions."
                    ),
                    evidence=f"GET {test_url} → HTTP {resp.status_code} (Content-Type: {content_type})",
                    recommendation=(
                        "Restrict debug and admin endpoints to internal networks or authenticated "
                        "administrators. Remove unnecessary endpoints from production deployments."
                    ),
                    cwe="CWE-489",
                    cvss=8.6 if sev == "CRITICAL" else 5.3,
                )
            )

    # ── Test 5: Response size analysis ──────────────────────────────────
    if baseline_body and len(baseline_body) > 100_000:
        ctx.add(
            Finding(
                owasp_category="Excessive Data Exposure",
                owasp_id="API3:2023",
                title="Extremely Large Response Body",
                severity="MEDIUM",
                description=(
                    f"The API response body is {len(baseline_body):,} bytes. Very large "
                    f"responses often indicate the API is returning more data than necessary, "
                    f"which increases bandwidth cost and data exposure risk."
                ),
                evidence=f"Response size: {len(baseline_body):,} bytes",
                recommendation=(
                    "Implement pagination, field selection (sparse fieldsets), and response "
                    "compression. Return only the data the client needs."
                ),
                cwe="CWE-400",
                cvss=4.3,
            )
        )

    # ── Test 6: Sensitive HTTP headers ──────────────────────────────────
    expose_headers = baseline_headers.get("access-control-expose-headers", "")
    if expose_headers:
        exposed = [h.strip().lower() for h in expose_headers.split(",")]
        risky = [
            h
            for h in exposed
            if h
            in (
                "x-powered-by",
                "server",
                "x-aspnet-version",
                "x-aspnetmvc-version",
                "x-runtime",
                "x-request-id",
                "x-frame-options",
            )
        ]
        if risky:
            ctx.add(
                Finding(
                    owasp_category="Excessive Data Exposure",
                    owasp_id="API3:2023",
                    title="Sensitive Headers Exposed via CORS",
                    severity="LOW",
                    description=(
                        f"The Access-Control-Expose-Headers includes sensitive headers: "
                        f"{risky}. These expose server technology information."
                    ),
                    evidence=f"Exposed headers: {risky}",
                    recommendation=(
                        "Only expose headers that the client absolutely needs. Remove "
                        "technology-identifying headers from production responses."
                    ),
                    cwe="CWE-200",
                    cvss=3.1,
                )
            )
