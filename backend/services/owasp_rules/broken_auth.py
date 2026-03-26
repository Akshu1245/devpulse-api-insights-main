"""
OWASP API2:2023 — Broken Authentication Detection
===================================================
Tests for authentication weaknesses by:
  1. Probing for missing authentication on endpoints
  2. Testing credential stuffing / brute-force protections
  3. Checking for weak token handling (JWT, session)
  4. Detecting password/token in URL or logs
  5. Testing authentication bypass via HTTP method switching
"""

from __future__ import annotations

import base64
import json
import re
from typing import Any

import httpx

from services.owasp_engine import (
    Finding,
    ScanContext,
    Severity,
    safe_request,
    register_rule,
)


# ── JWT helpers ─────────────────────────────────────────────────────────────


def _decode_jwt_payload(token: str) -> dict[str, Any] | None:
    """Decode JWT payload without verification (for analysis only)."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload_b64 = parts[1]
        # Add padding
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding
        decoded = base64.urlsafe_b64decode(payload_b64)
        return json.loads(decoded)
    except Exception:
        return None


def _analyze_jwt_weaknesses(token: str) -> list[Finding]:
    """Analyze JWT for common weaknesses."""
    findings: list[Finding] = []
    payload = _decode_jwt_payload(token)
    if payload is None:
        return findings

    # Check for 'none' algorithm
    try:
        header_b64 = token.split(".")[0]
        padding = 4 - len(header_b64) % 4
        if padding != 4:
            header_b64 += "=" * padding
        header = json.loads(base64.urlsafe_b64decode(header_b64))
        if header.get("alg", "").lower() == "none":
            findings.append(
                Finding(
                    owasp_category="Broken Authentication",
                    owasp_id="API2:2023",
                    title="JWT Uses 'none' Algorithm",
                    severity="CRITICAL",
                    description="The JWT header specifies 'none' as the signing algorithm, allowing anyone to forge tokens.",
                    evidence=f"JWT header: alg=none",
                    recommendation="Enforce strong signing algorithms (RS256, ES256). Reject tokens with alg=none.",
                    cwe="CWE-345",
                    cvss=9.8,
                )
            )
    except Exception:
        pass

    # Check for missing expiry
    if "exp" not in payload:
        findings.append(
            Finding(
                owasp_category="Broken Authentication",
                owasp_id="API2:2023",
                title="JWT Missing Expiration Claim",
                severity="HIGH",
                description="The JWT token does not contain an 'exp' claim, meaning it never expires.",
                evidence=f"JWT payload keys: {list(payload.keys())}",
                recommendation="Always include 'exp' claim in JWTs with a reasonable TTL (e.g., 15-60 minutes).",
                cwe="CWE-613",
                cvss=7.5,
            )
        )

    # Check for overly long expiry
    exp = payload.get("exp")
    if exp and isinstance(exp, (int, float)):
        from datetime import datetime, timezone

        try:
            exp_dt = datetime.fromtimestamp(exp, tz=timezone.utc)
            now = datetime.now(timezone.utc)
            days = (exp_dt - now).days
            if days > 30:
                findings.append(
                    Finding(
                        owasp_category="Broken Authentication",
                        owasp_id="API2:2023",
                        title="JWT Excessively Long Expiration",
                        severity="MEDIUM",
                        description=f"JWT expires in {days} days, which is excessively long.",
                        evidence=f"exp={exp} ({days} days from now)",
                        recommendation="Reduce token lifetime to 15-60 minutes. Use refresh tokens for longer sessions.",
                        cwe="CWE-613",
                        cvss=5.3,
                    )
                )
        except Exception:
            pass

    # Check for sensitive data in payload
    sensitive_keys = {"password", "secret", "ssn", "credit_card", "private"}
    found_sensitive = [k for k in payload.keys() if k.lower() in sensitive_keys]
    if found_sensitive:
        findings.append(
            Finding(
                owasp_category="Broken Authentication",
                owasp_id="API2:2023",
                title="Sensitive Data in JWT Payload",
                severity="HIGH",
                description="JWT payload contains sensitive fields that could be decoded by anyone.",
                evidence=f"Sensitive fields: {found_sensitive}",
                recommendation="Never store sensitive data in JWTs. Use opaque session tokens for sensitive state.",
                cwe="CWE-922",
                cvss=7.0,
            )
        )

    return findings


# ── Main rule ───────────────────────────────────────────────────────────────


@register_rule
async def check_broken_auth(ctx: ScanContext) -> None:
    """Detect Broken Authentication vulnerabilities."""

    baseline_status = ctx.metadata.get("baseline_status", 0)
    if baseline_status == 0:
        return

    # ── Test 1: Methods bypass authentication ───────────────────────────
    if ctx.auth_token:
        for method in ("PUT", "DELETE", "PATCH", "OPTIONS"):
            resp = await safe_request(ctx.client, method, ctx.target_url)
            if resp is not None and resp.status_code in (200, 201, 204):
                ctx.add(
                    Finding(
                        owasp_category="Broken Authentication",
                        owasp_id="API2:2023",
                        title=f"HTTP {method} Accepted Without Verification",
                        severity="HIGH",
                        description=(
                            f"The endpoint accepts HTTP {method} and returns a success response "
                            f"without properly verifying the authentication context."
                        ),
                        evidence=f"{method} {ctx.target_url} → HTTP {resp.status_code}",
                        recommendation=(
                            "Enforce authentication checks for all HTTP methods, not just GET/POST. "
                            "Use a centralized auth middleware."
                        ),
                        cwe="CWE-306",
                        cvss=7.5,
                    )
                )

    # ── Test 2: Brute-force protection check ────────────────────────────
    rapid_failures = 0
    for _ in range(10):
        resp = await safe_request(
            ctx.client,
            "POST",
            ctx.base_url + "/auth/login",
            json={
                "username": "test_nonexistent_user",
                "password": "wrong_password_123",
            },
        )
        if resp is not None and resp.status_code == 401:
            rapid_failures += 1
        elif resp is not None and resp.status_code == 429:
            # Rate limited — good
            break
    else:
        if rapid_failures >= 8:
            ctx.add(
                Finding(
                    owasp_category="Broken Authentication",
                    owasp_id="API2:2023",
                    title="No Brute-Force Protection Detected",
                    severity="HIGH",
                    description=(
                        f"Sent {rapid_failures} rapid failed login attempts without rate limiting. "
                        "The API does not appear to implement brute-force protection."
                    ),
                    evidence=f"POST {ctx.base_url}/auth/login → {rapid_failures}/10 requests returned 401 (no 429 received)",
                    recommendation=(
                        "Implement account lockout or progressive delays after failed login attempts. "
                        "Use rate limiting (e.g., 5 failed attempts per 15 minutes)."
                    ),
                    cwe="CWE-307",
                    cvss=7.3,
                )
            )

    # ── Test 3: Token in URL query parameter ────────────────────────────
    if "token" in ctx.target_url.lower() or "api_key" in ctx.target_url.lower():
        ctx.add(
            Finding(
                owasp_category="Broken Authentication",
                owasp_id="API2:2023",
                title="Authentication Token in URL Query Parameter",
                severity="HIGH",
                description=(
                    "The URL contains authentication-related query parameters (token/api_key). "
                    "Tokens in URLs are logged in server logs, browser history, and referrer headers."
                ),
                evidence=f"URL: {ctx.target_url}",
                recommendation=(
                    "Pass authentication tokens in the Authorization header, not in URL query parameters. "
                    "This prevents token leakage through logs and referrer headers."
                ),
                cwe="CWE-598",
                cvss=7.5,
            )
        )

    # ── Test 4: Analyze JWT if present in auth header ───────────────────
    if ctx.auth_token:
        jwt_findings = _analyze_jwt_weaknesses(ctx.auth_token)
        ctx.findings.extend(jwt_findings)

    # ── Test 5: Password in response body ───────────────────────────────
    baseline_body = ctx.metadata.get("baseline_body", "")
    if baseline_body:
        pwd_patterns = re.compile(
            r'"(password|passwd|pwd|secret|token)":\s*"[^"]*"',
            re.IGNORECASE,
        )
        matches = pwd_patterns.findall(baseline_body)
        if matches:
            ctx.add(
                Finding(
                    owasp_category="Broken Authentication",
                    owasp_id="API2:2023",
                    title="Credential Fields Exposed in API Response",
                    severity="CRITICAL",
                    description=(
                        "The API response body contains credential-related fields. "
                        "Passwords and secrets should never be returned to clients."
                    ),
                    evidence=f"Exposed fields: {matches}",
                    recommendation=(
                        "Strip all credential fields from API responses. Use field-level "
                        "serialization to exclude sensitive data."
                    ),
                    cwe="CWE-200",
                    cvss=9.0,
                )
            )

    # ── Test 6: Weak auth scheme detection ──────────────────────────────
    baseline_headers = ctx.metadata.get("baseline_headers", {})
    www_auth = baseline_headers.get("www-authenticate", "")
    if www_auth and "basic" in www_auth.lower():
        ctx.add(
            Finding(
                owasp_category="Broken Authentication",
                owasp_id="API2:2023",
                title="Basic Authentication Detected",
                severity="MEDIUM",
                description=(
                    "The API uses HTTP Basic Authentication, which transmits credentials "
                    "in base64-encoded form (effectively plain text)."
                ),
                evidence=f"WWW-Authenticate: {www_auth}",
                recommendation=(
                    "Migrate to token-based authentication (OAuth 2.0 / JWT with Bearer scheme). "
                    "If Basic Auth is required, ensure it is only used over HTTPS."
                ),
                cwe="CWE-522",
                cvss=5.3,
            )
        )

    # ── Test 7: Session fixation via cookie analysis ────────────────────
    set_cookies = baseline_headers.get("set-cookie", "")
    if set_cookies:
        cookie_lower = set_cookies.lower()
        missing_flags = []
        if "httponly" not in cookie_lower:
            missing_flags.append("HttpOnly")
        if "secure" not in cookie_lower:
            missing_flags.append("Secure")
        if "samesite" not in cookie_lower:
            missing_flags.append("SameSite")
        if missing_flags:
            ctx.add(
                Finding(
                    owasp_category="Broken Authentication",
                    owasp_id="API2:2023",
                    title="Insecure Session Cookie Configuration",
                    severity="MEDIUM",
                    description=(
                        f"Set-Cookie header is missing security flags: {', '.join(missing_flags)}. "
                        "This makes cookies vulnerable to XSS and CSRF attacks."
                    ),
                    evidence=f"Set-Cookie: {set_cookies[:200]}",
                    recommendation=(
                        "Set HttpOnly, Secure, and SameSite=Strict (or Lax) flags on all "
                        "authentication/session cookies."
                    ),
                    cwe="CWE-614",
                    cvss=5.4,
                )
            )
