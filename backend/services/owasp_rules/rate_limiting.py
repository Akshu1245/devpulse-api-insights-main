"""
OWASP API8:2023 — Rate Limiting & DoS Detection
================================================
Detects APIs lacking proper rate limiting by:
  1. Sending rapid sequential requests
  2. Analyzing response headers for rate limit info
  3. Testing for resource exhaustion vulnerabilities
  4. Checking for request size limits
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from services.owasp_engine import (
    Finding,
    ScanContext,
    safe_request,
    register_rule,
)


# ── Rate limit header patterns ─────────────────────────────────────────────

RATE_LIMIT_HEADERS = {
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
    "ratelimit-limit",
    "ratelimit-remaining",
    "ratelimit-reset",
    "x-rate-limit-limit",
    "x-rate-limit-remaining",
    "x-rate-limit-reset",
}


def _analyze_rate_limit_headers(headers: dict[str, str]) -> dict[str, Any] | None:
    """Extract rate limit info from response headers."""
    info: dict[str, Any] = {}
    for header in RATE_LIMIT_HEADERS:
        if header in headers:
            info[header] = headers[header]
    return info if info else None


# ── Main rule ───────────────────────────────────────────────────────────────


@register_rule
async def check_rate_limiting(ctx: ScanContext) -> None:
    """Detect missing or weak rate limiting."""

    baseline_status = ctx.metadata.get("baseline_status", 0)
    if baseline_status == 0:
        return

    baseline_headers = ctx.metadata.get("baseline_headers", {})

    # ── Test 1: Check for rate limit headers ─────────────────────────────
    rate_info = _analyze_rate_limit_headers(baseline_headers)
    if not rate_info:
        ctx.add(
            Finding(
                owasp_category="Security Misconfiguration",
                owasp_id="API8:2023",
                title="No Rate Limit Headers Present",
                severity="MEDIUM",
                description=(
                    "The API response does not include any rate limiting headers "
                    "(X-RateLimit-*, Ratelimit-*). This makes it difficult for clients "
                    "to understand their usage limits."
                ),
                evidence="No rate limit headers found in response",
                recommendation=(
                    "Implement rate limiting and expose limits via standard headers: "
                    "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset. "
                    "Follow RFC 6585 for 429 Too Many Requests responses."
                ),
                cwe="CWE-770",
                cvss=5.3,
            )
        )

    # ── Test 2: Rapid fire test ──────────────────────────────────────────
    # Send 50 rapid requests and check for 429 responses
    request_count = 50
    responses: list[httpx.Response] = []
    start_time = time.monotonic()

    # Use semaphore to control concurrency
    semaphore = asyncio.Semaphore(10)

    async def make_request() -> httpx.Response | None:
        async with semaphore:
            return await safe_request(ctx.client, "GET", ctx.target_url)

    tasks = [make_request() for _ in range(request_count)]
    results = await asyncio.gather(*tasks)
    responses = [r for r in results if r is not None]

    elapsed = time.monotonic() - start_time

    # Analyze responses
    status_codes = [r.status_code for r in responses]
    rate_limited_count = sum(1 for code in status_codes if code == 429)
    success_count = sum(1 for code in status_codes if code in (200, 201, 204))

    # If more than 80% succeeded without rate limiting
    if rate_limited_count == 0 and success_count >= request_count * 0.8:
        ctx.add(
            Finding(
                owasp_category="Security Misconfiguration",
                owasp_id="API8:2023",
                title="No Rate Limiting Enforcement",
                severity="HIGH",
                description=(
                    f"Sent {request_count} requests in {elapsed:.2f} seconds "
                    f"({request_count/elapsed:.1f} req/s). All requests succeeded "
                    f"without any rate limiting (429 responses). "
                    f"This makes the API vulnerable to brute-force and DoS attacks."
                ),
                evidence=(
                    f"Requests: {request_count}, Duration: {elapsed:.2f}s, "
                    f"Rate: {request_count/elapsed:.1f} req/s, "
                    f"Success: {success_count}/{request_count}, "
                    f"Rate Limited: {rate_limited_count}"
                ),
                recommendation=(
                    "Implement rate limiting using algorithms like token bucket or "
                    "sliding window. Start with conservative limits (e.g., 100 req/min "
                    "per IP, 1000 req/min per authenticated user). Return 429 with "
                    "Retry-After header when limits are exceeded."
                ),
                cwe="CWE-770",
                cvss=7.5,
            )
        )
    elif rate_limited_count > 0 and rate_limited_count < request_count * 0.5:
        # Rate limiting exists but is weak
        ctx.add(
            Finding(
                owasp_category="Security Misconfiguration",
                owasp_id="API8:2023",
                title="Weak Rate Limiting Configuration",
                severity="MEDIUM",
                description=(
                    f"Rate limiting is present but only triggered after "
                    f"{rate_limited_count}/{request_count} requests. "
                    f"The threshold may be too permissive."
                ),
                evidence=f"Rate limited {rate_limited_count}/{request_count} requests",
                recommendation=(
                    "Review rate limiting thresholds. Consider implementing "
                    "progressive rate limiting that becomes stricter with continued abuse."
                ),
                cwe="CWE-770",
                cvss=5.3,
            )
        )

    # ── Test 3: Large payload DoS ────────────────────────────────────────
    # Test if API accepts extremely large request bodies
    large_payloads = [
        ("large_json", {"data": "x" * 1_000_000}),  # 1MB
        ("large_array", {"items": ["x"] * 10000}),  # 10k items
    ]

    for name, payload in large_payloads:
        resp = await safe_request(
            ctx.client,
            "POST",
            ctx.target_url,
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        if resp is not None and resp.status_code in (200, 201, 204):
            ctx.add(
                Finding(
                    owasp_category="Security Misconfiguration",
                    owasp_id="API8:2023",
                    title=f"No Request Size Limit ({name})",
                    severity="MEDIUM",
                    description=(
                        f"The API accepts very large request bodies without rejection. "
                        f"This could lead to memory exhaustion or DoS attacks."
                    ),
                    evidence=f"POST with {name} payload accepted (HTTP {resp.status_code})",
                    recommendation=(
                        "Implement request size limits at the web server or API gateway level. "
                        "Reject requests exceeding reasonable size thresholds (e.g., 1MB for JSON). "
                        "Return 413 Payload Too Large for oversized requests."
                    ),
                    cwe="CWE-770",
                    cvss=5.3,
                )
            )
            break

    # ── Test 4: Concurrent connection test ───────────────────────────────
    # Test if API handles concurrent connections properly
    concurrent_count = 100
    concurrent_semaphore = asyncio.Semaphore(concurrent_count)

    async def concurrent_request() -> httpx.Response | None:
        async with concurrent_semaphore:
            return await safe_request(ctx.client, "GET", ctx.target_url)

    concurrent_tasks = [concurrent_request() for _ in range(concurrent_count)]
    concurrent_results = await asyncio.gather(*concurrent_tasks, return_exceptions=True)

    error_count = sum(1 for r in concurrent_results if isinstance(r, Exception))
    success_concurrent = sum(
        1 for r in concurrent_results if hasattr(r, "status_code") and r.status_code == 200  # type: ignore
    )

    if error_count > concurrent_count * 0.5:
        ctx.add(
            Finding(
                owasp_category="Security Misconfiguration",
                owasp_id="API8:2023",
                title="API Unstable Under Concurrent Load",
                severity="MEDIUM",
                description=(
                    f"Sent {concurrent_count} concurrent requests and {error_count} failed. "
                    f"This indicates the API may be vulnerable to concurrent connection DoS."
                ),
                evidence=f"{error_count}/{concurrent_count} concurrent requests failed",
                recommendation=(
                    "Implement proper connection pooling and concurrency controls. "
                    "Use load balancing and auto-scaling to handle traffic spikes."
                ),
                cwe="CWE-770",
                cvss=5.3,
            )
        )
