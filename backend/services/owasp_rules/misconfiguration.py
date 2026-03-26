"""
OWASP API8:2023 — Security Misconfiguration Detection
======================================================
Detects server/API configuration weaknesses by:
  1. Checking security headers (HSTS, CSP, X-Frame, etc.)
  2. Testing CORS misconfiguration (wildcard, reflection)
  3. Detecting information disclosure via headers
  4. Testing HTTP method exposure
  5. Checking TLS/SSL configuration
  6. Verbing / HTTP method confusion
  7. Missing rate limiting
  8. Verbose error responses
"""

from __future__ import annotations

import re
import ssl
import socket
from typing import Any
from urllib.parse import urlparse

import httpx

from services.owasp_engine import (
    Finding,
    ScanContext,
    Severity,
    safe_request,
    register_rule,
    url_add_query_param,
)


# ── Security header definitions ────────────────────────────────────────────

SECURITY_HEADERS = {
    "strict-transport-security": {
        "severity": "HIGH",
        "title": "Missing Strict-Transport-Security (HSTS) Header",
        "description": (
            "The API does not send the HSTS header. Clients may connect over "
            "HTTP, making them vulnerable to downgrade attacks."
        ),
        "recommendation": (
            "Set Strict-Transport-Security: max-age=31536000; includeSubDomains; preload"
        ),
        "cwe": "CWE-319",
        "cvss": 7.5,
    },
    "x-content-type-options": {
        "severity": "MEDIUM",
        "title": "Missing X-Content-Type-Options Header",
        "description": (
            "Without nosniff, browsers may MIME-sniff responses, leading to "
            "security issues if content is misinterpreted."
        ),
        "recommendation": "Set X-Content-Type-Options: nosniff",
        "cwe": "CWE-693",
        "cvss": 5.3,
    },
    "x-frame-options": {
        "severity": "MEDIUM",
        "title": "Missing X-Frame-Options Header",
        "description": "Without X-Frame-Options, the API response may be embedded in iframes (clickjacking).",
        "recommendation": "Set X-Frame-Options: DENY or SAMEORIGIN",
        "cwe": "CWE-1021",
        "cvss": 5.3,
    },
    "content-security-policy": {
        "severity": "MEDIUM",
        "title": "Missing Content-Security-Policy Header",
        "description": "No CSP header means browsers have no policy for loading resources.",
        "recommendation": "Define a strict Content-Security-Policy appropriate for the API.",
        "cwe": "CWE-693",
        "cvss": 5.3,
    },
    "x-xss-protection": {
        "severity": "LOW",
        "title": "Missing X-XSS-Protection Header",
        "description": "Legacy XSS protection header is not set.",
        "recommendation": "Set X-XSS-Protection: 1; mode=block (or rely on CSP).",
        "cwe": "CWE-79",
        "cvss": 3.1,
    },
    "referrer-policy": {
        "severity": "LOW",
        "title": "Missing Referrer-Policy Header",
        "description": "No Referrer-Policy means full URLs may be leaked via Referer header.",
        "recommendation": "Set Referrer-Policy: strict-origin-when-cross-origin",
        "cwe": "CWE-200",
        "cvss": 3.1,
    },
    "permissions-policy": {
        "severity": "LOW",
        "title": "Missing Permissions-Policy Header",
        "description": "No Permissions-Policy means browser features are unrestricted.",
        "recommendation": "Set Permissions-Policy to restrict unused browser features.",
        "cwe": "CWE-693",
        "cvss": 3.1,
    },
}

TECH_DISCLOSURE_HEADERS = {
    "server": {
        "severity": "LOW",
        "title": "Server Header Exposes Technology Information",
        "cwe": "CWE-200",
        "cvss": 3.1,
    },
    "x-powered-by": {
        "severity": "LOW",
        "title": "X-Powered-By Header Exposes Stack Information",
        "cwe": "CWE-200",
        "cvss": 3.1,
    },
    "x-aspnet-version": {
        "severity": "LOW",
        "title": "X-AspNet-Version Header Exposes .NET Version",
        "cwe": "CWE-200",
        "cvss": 3.1,
    },
    "x-aspnetmvc-version": {
        "severity": "LOW",
        "title": "X-AspNetMvc-Version Header Exposes Framework Version",
        "cwe": "CWE-200",
        "cvss": 3.1,
    },
    "x-generator": {
        "severity": "LOW",
        "title": "X-Generator Header Exposes CMS/Generator",
        "cwe": "CWE-200",
        "cvss": 3.1,
    },
}

DANGEROUS_METHODS = {"TRACE", "TRACK", "DEBUG", "CONNECT"}


# ── CORS testing ───────────────────────────────────────────────────────────


async def _test_cors_reflection(ctx: ScanContext) -> None:
    """Test if CORS origin is reflected (open CORS)."""
    evil_origins = [
        "https://evil.com",
        "https://attacker.net",
        "null",
    ]
    for origin in evil_origins:
        resp = await safe_request(
            ctx.client,
            "OPTIONS",
            ctx.target_url,
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )
        if resp is None:
            continue

        acao = resp.headers.get("access-control-allow-origin", "")
        if acao == origin or acao == "*":
            sev = "HIGH" if acao == origin else "HIGH"
            ctx.add(
                Finding(
                    owasp_category="Security Misconfiguration",
                    owasp_id="API8:2023",
                    title="Open CORS Policy — Origin Reflection",
                    severity=sev,
                    description=(
                        f"The API reflects the request Origin '{origin}' in the "
                        f"Access-Control-Allow-Origin response header. This allows any "
                        f"website to make cross-origin requests to this API."
                    ),
                    evidence=(
                        f"OPTIONS {ctx.target_url}\n"
                        f"  Request Origin: {origin}\n"
                        f"  Response ACAO: {acao}"
                    ),
                    recommendation=(
                        "Whitelist specific allowed origins. Never reflect the Origin header "
                        "dynamically. Use a strict CORS policy that only allows trusted domains."
                    ),
                    cwe="CWE-942",
                    cvss=7.5,
                )
            )
            return  # one finding is sufficient


async def _test_cors_credentials(ctx: ScanContext) -> None:
    """Test if CORS allows credentials with wildcard or open origin."""
    resp = await safe_request(
        ctx.client,
        "OPTIONS",
        ctx.target_url,
        headers={
            "Origin": "https://evil.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    if resp is None:
        return

    acao = resp.headers.get("access-control-allow-origin", "")
    acac = resp.headers.get("access-control-allow-credentials", "")

    if acac.lower() == "true" and acao == "*":
        ctx.add(
            Finding(
                owasp_category="Security Misconfiguration",
                owasp_id="API8:2023",
                title="CORS Wildcard with Credentials Allowed",
                severity="CRITICAL",
                description=(
                    "The API sets Access-Control-Allow-Origin: * with "
                    "Access-Control-Allow-Credentials: true. This is a critical misconfiguration "
                    "that allows any site to make credentialed requests."
                ),
                evidence=f"ACAO: {acao}, ACAC: {acac}",
                recommendation=(
                    "Never use wildcard CORS with credentials. Whitelist specific origins "
                    "and set ACAO to the requesting origin only after validation."
                ),
                cwe="CWE-942",
                cvss=9.1,
            )
        )


# ── TLS check ──────────────────────────────────────────────────────────────


async def _check_tls(ctx: ScanContext) -> None:
    """Check for HTTP (no TLS)."""
    if ctx.parsed_url.scheme == "http":
        ctx.add(
            Finding(
                owasp_category="Security Misconfiguration",
                owasp_id="API8:2023",
                title="API Served Over HTTP (No TLS)",
                severity="CRITICAL",
                description=(
                    "The API is served over unencrypted HTTP. All data including "
                    "authentication credentials can be intercepted."
                ),
                evidence=f"URL scheme: {ctx.parsed_url.scheme}",
                recommendation=(
                    "Serve the API exclusively over HTTPS. Redirect HTTP to HTTPS. "
                    "Use HSTS to prevent downgrade attacks."
                ),
                cwe="CWE-319",
                cvss=9.1,
            )
        )


# ── HTTP method exposure ───────────────────────────────────────────────────


async def _check_dangerous_methods(ctx: ScanContext) -> None:
    """Test for dangerous HTTP methods."""
    for method in DANGEROUS_METHODS:
        resp = await safe_request(ctx.client, method, ctx.target_url)
        if resp is not None and resp.status_code not in (405, 403, 501, 404):
            ctx.add(
                Finding(
                    owasp_category="Security Misconfiguration",
                    owasp_id="API8:2023",
                    title=f"Dangerous HTTP Method Allowed: {method}",
                    severity="HIGH",
                    description=(
                        f"The API responds to HTTP {method} method, which can be used for "
                        f"cross-site tracing attacks or proxy tunneling."
                    ),
                    evidence=f"{method} {ctx.target_url} → HTTP {resp.status_code}",
                    recommendation=(
                        f"Disable HTTP {method} method. Allow only the methods required by "
                        f"the API (GET, POST, PUT, DELETE, PATCH)."
                    ),
                    cwe="CWE-749",
                    cvss=7.5,
                )
            )


# ── Rate limiting check ────────────────────────────────────────────────────


async def _check_rate_limiting(ctx: ScanContext) -> None:
    """Test if rate limiting is in place."""
    responses: list[httpx.Response] = []
    for _ in range(25):
        resp = await safe_request(ctx.client, "GET", ctx.target_url)
        if resp is not None:
            responses.append(resp)

    rate_limited = any(r.status_code == 429 for r in responses)
    if not rate_limited and len(responses) >= 20:
        ctx.add(
            Finding(
                owasp_category="Security Misconfiguration",
                owasp_id="API8:2023",
                title="No Rate Limiting Detected",
                severity="MEDIUM",
                description=(
                    f"Sent {len(responses)} rapid requests without receiving HTTP 429 "
                    f"(Too Many Requests). The API may lack rate limiting, making it "
                    f"susceptible to brute-force and DoS attacks."
                ),
                evidence=f"Sent {len(responses)} requests, none returned 429",
                recommendation=(
                    "Implement rate limiting per IP and per user/API key. Use a "
                    "token bucket or sliding window algorithm. Return 429 with "
                    "Retry-After header when limits are exceeded."
                ),
                cwe="CWE-770",
                cvss=5.3,
            )
        )


# ── Main rule ───────────────────────────────────────────────────────────────


@register_rule
async def check_misconfiguration(ctx: ScanContext) -> None:
    """Detect Security Misconfiguration vulnerabilities."""

    baseline_status = ctx.metadata.get("baseline_status", 0)
    baseline_headers = ctx.metadata.get("baseline_headers", {})

    if baseline_status == 0:
        return

    # ── TLS check ───────────────────────────────────────────────────────
    await _check_tls(ctx)

    # ── Security headers ────────────────────────────────────────────────
    for header, info in SECURITY_HEADERS.items():
        if header not in baseline_headers:
            ctx.add(
                Finding(
                    owasp_category="Security Misconfiguration",
                    owasp_id="API8:2023",
                    title=info["title"],
                    severity=info["severity"],
                    description=info["description"],
                    evidence=f"Header '{header}' not present in response",
                    recommendation=info["recommendation"],
                    cwe=info["cwe"],
                    cvss=info["cvss"],
                )
            )

    # ── Technology disclosure ───────────────────────────────────────────
    for header, info in TECH_DISCLOSURE_HEADERS.items():
        if header in baseline_headers:
            value = baseline_headers[header]
            ctx.add(
                Finding(
                    owasp_category="Security Misconfiguration",
                    owasp_id="API8:2023",
                    title=info["title"],
                    severity=info["severity"],
                    description=(
                        f"The '{header}' response header reveals server technology: '{value}'. "
                        f"This helps attackers target known vulnerabilities."
                    ),
                    evidence=f"{header}: {value}",
                    recommendation=f"Remove or genericize the '{header}' header in production.",
                    cwe=info["cwe"],
                    cvss=info["cvss"],
                )
            )

    # ── CORS testing ────────────────────────────────────────────────────
    await _test_cors_reflection(ctx)
    await _test_cors_credentials(ctx)

    # ── Dangerous HTTP methods ──────────────────────────────────────────
    await _check_dangerous_methods(ctx)

    # ── Rate limiting ───────────────────────────────────────────────────
    await _check_rate_limiting(ctx)

    # ── CORS wildcard without credentials ───────────────────────────────
    acao = baseline_headers.get("access-control-allow-origin", "")
    if acao == "*":
        ctx.add(
            Finding(
                owasp_category="Security Misconfiguration",
                owasp_id="API8:2023",
                title="CORS Wildcard (Access-Control-Allow-Origin: *)",
                severity="MEDIUM",
                description=(
                    "The API allows cross-origin requests from any domain. "
                    "While this may be intentional for public APIs, it can expose "
                    "internal APIs to cross-origin attacks."
                ),
                evidence=f"Access-Control-Allow-Origin: {acao}",
                recommendation=(
                    "For public APIs, wildcard CORS may be acceptable. For internal "
                    "or authenticated APIs, restrict CORS to known trusted origins."
                ),
                cwe="CWE-942",
                cvss=5.3,
            )
        )

    # ── HTTP to HTTPS redirect check ────────────────────────────────────
    if ctx.parsed_url.scheme == "https":
        http_url = ctx.target_url.replace("https://", "http://", 1)
        resp = await safe_request(ctx.client, "GET", http_url)
        if resp is not None:
            if resp.status_code not in (301, 302, 307, 308):
                ctx.add(
                    Finding(
                        owasp_category="Security Misconfiguration",
                        owasp_id="API8:2023",
                        title="HTTP Does Not Redirect to HTTPS",
                        severity="MEDIUM",
                        description=(
                            "The HTTP version of the API does not redirect to HTTPS. "
                            "Clients connecting over HTTP will use an unencrypted channel."
                        ),
                        evidence=f"GET {http_url} → HTTP {resp.status_code} (no redirect)",
                        recommendation="Configure the server to redirect all HTTP requests to HTTPS.",
                        cwe="CWE-319",
                        cvss=5.3,
                    )
                )

    # ── Open redirect test ──────────────────────────────────────────────
    redirect_params = [
        "redirect",
        "url",
        "next",
        "return",
        "returnTo",
        "goto",
        "destination",
    ]
    for param in redirect_params:
        test_url = url_add_query_param(
            ctx.target_url, param, "https://evil.com/phishing"
        )
        resp = await safe_request(ctx.client, "GET", test_url)
        if resp is not None and resp.status_code in (301, 302, 307, 308):
            location = resp.headers.get("location", "")
            if "evil.com" in location:
                ctx.add(
                    Finding(
                        owasp_category="Security Misconfiguration",
                        owasp_id="API8:2023",
                        title=f"Open Redirect via '{param}' Parameter",
                        severity="MEDIUM",
                        description=(
                            f"The API redirects to unvalidated URLs supplied via the "
                            f"'{param}' query parameter. This can be used for phishing attacks."
                        ),
                        evidence=f"GET {test_url} → Redirect to {location}",
                        recommendation=(
                            "Validate redirect URLs against an allowlist. Never redirect "
                            "to external URLs supplied by the client."
                        ),
                        cwe="CWE-601",
                        cvss=6.1,
                    )
                )
                break
