"""
OWASP API1:2023 — Broken Object Level Authorization (BOLA) / IDOR Detection
============================================================================
Tests whether an API enforces object-level access controls by:
  1. Swapping resource IDs in path segments
  2. Using sequential / predictable IDs
  3. Accessing resources without authentication
  4. Testing cross-tenant resource access via ID manipulation
"""

from __future__ import annotations

import re
from typing import Any

import httpx

from services.owasp_engine import (
    Finding,
    ScanContext,
    safe_request,
    register_rule,
    url_replace_path,
)


# ── Payload generators ─────────────────────────────────────────────────────


def _generate_id_variants(original: str) -> list[str]:
    """Produce ID mutation payloads from a detected ID value."""
    variants: list[str] = []
    # sequential
    if original.isdigit():
        n = int(original)
        for offset in (1, -1, 100, 1000):
            variants.append(str(n + offset))
    # common placeholder IDs
    variants.extend(["0", "1", "99999", "null", "undefined", "admin"])
    return variants


def _extract_path_ids(segments: list[str]) -> list[tuple[int, str]]:
    """Return (segment_index, value) for segments that look like resource IDs."""
    results: list[tuple[int, str]] = []
    for i, seg in enumerate(segments):
        if re.match(r"^[0-9a-fA-F]{8,}$", seg) or seg.isdigit():
            results.append((i, seg))
    return results


# ── Main rule ───────────────────────────────────────────────────────────────


@register_rule
async def check_bola(ctx: ScanContext) -> None:
    """Detect Broken Object Level Authorization via ID manipulation."""

    baseline_status = ctx.metadata.get("baseline_status", 0)
    if baseline_status == 0:
        return  # endpoint unreachable — skip

    baseline_json = ctx.metadata.get("baseline_json")
    baseline_body = ctx.metadata.get("baseline_body", "")

    id_positions = _extract_path_ids(ctx.path_segments)
    if not id_positions:
        return  # no numeric/UUID-like IDs in path

    # ── Test 1: IDOR via path manipulation ──────────────────────────────
    for seg_idx, original_id in id_positions:
        variants = _generate_id_variants(original_id)
        for variant_id in variants[:5]:  # limit to avoid flooding
            new_segments = list(ctx.path_segments)
            new_segments[seg_idx] = variant_id
            new_path = "/" + "/".join(new_segments)
            test_url = url_replace_path(ctx.target_url, new_path)

            resp = await safe_request(ctx.client, "GET", test_url)
            if resp is None:
                continue

            if resp.status_code == 200 and baseline_status == 200:
                # Check if we got a DIFFERENT valid resource (IDOR)
                try:
                    resp_json = resp.json()
                    if resp_json != baseline_json:
                        ctx.add(
                            Finding(
                                owasp_category="Broken Object Level Authorization",
                                owasp_id="API1:2023",
                                title="Potential IDOR — Object Accessible via ID Manipulation",
                                severity="HIGH",
                                description=(
                                    f"Changing the resource ID from '{original_id}' to "
                                    f"'{variant_id}' returned a different valid resource (HTTP 200). "
                                    "This indicates the API may not enforce object-level access control."
                                ),
                                evidence=f"GET {test_url} → HTTP {resp.status_code} (different body from baseline)",
                                recommendation=(
                                    "Enforce object-level authorization by verifying the authenticated user "
                                    "has permission to access the requested resource ID. Use indirect "
                                    "references (UUIDs) and validate ownership on every request."
                                ),
                                cwe="CWE-639",
                                cvss=7.5,
                            )
                        )
                        break  # one finding per position is sufficient
                except Exception:
                    pass

    # ── Test 2: Access without authentication ───────────────────────────
    if ctx.auth_token:
        try:
            no_auth_client = httpx.AsyncClient(
                timeout=ctx.client.timeout,
                follow_redirects=True,
                verify=False,
            )
            resp_no_auth = await safe_request(no_auth_client, "GET", ctx.target_url)
            await no_auth_client.aclose()

            if resp_no_auth is not None and resp_no_auth.status_code == 200:
                ctx.add(
                    Finding(
                        owasp_category="Broken Object Level Authorization",
                        owasp_id="API1:2023",
                        title="Resource Accessible Without Authentication",
                        severity="CRITICAL",
                        description=(
                            "The endpoint returns data (HTTP 200) even when no authentication "
                            "token is provided. This is a critical BOLA vulnerability."
                        ),
                        evidence=f"GET {ctx.target_url} (no Auth header) → HTTP {resp_no_auth.status_code}",
                        recommendation=(
                            "Require valid authentication for all API endpoints. Implement "
                            "middleware that rejects unauthenticated requests before they reach "
                            "the business logic."
                        ),
                        cwe="CWE-306",
                        cvss=9.1,
                    )
                )
        except Exception:
            pass

    # ── Test 3: Guessable / sequential ID enumeration ───────────────────
    for seg_idx, original_id in id_positions:
        if original_id.isdigit():
            n = int(original_id)
            sequential_ids = [str(n + i) for i in range(1, 4)]
            accessible_count = 0
            for sid in sequential_ids:
                new_segments = list(ctx.path_segments)
                new_segments[seg_idx] = sid
                new_path = "/" + "/".join(new_segments)
                test_url = url_replace_path(ctx.target_url, new_path)
                resp = await safe_request(ctx.client, "GET", test_url)
                if resp is not None and resp.status_code == 200:
                    accessible_count += 1

            if accessible_count >= 2:
                ctx.add(
                    Finding(
                        owasp_category="Broken Object Level Authorization",
                        owasp_id="API1:2023",
                        title="Sequential ID Enumeration Possible",
                        severity="MEDIUM",
                        description=(
                            f"Sequential resource IDs ({', '.join(sequential_ids)}) all return "
                            f"HTTP 200. The API uses predictable sequential IDs without "
                            f"adequate access control, enabling enumeration attacks."
                        ),
                        evidence=f"GET {test_url} → {accessible_count}/3 sequential IDs returned 200",
                        recommendation=(
                            "Use UUIDs or other non-sequential identifiers. Implement rate "
                            "limiting on resource access and monitor for enumeration patterns."
                        ),
                        cwe="CWE-639",
                        cvss=5.3,
                    )
                )
                break
