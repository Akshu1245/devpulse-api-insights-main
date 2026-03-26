"""
OWASP API3:2023 — Mass Assignment Detection
=============================================
Detects APIs that accept and persist unexpected/privileged fields by:
  1. Injecting extra fields into POST/PUT/PATCH requests
  2. Detecting admin/role fields that get persisted
  3. Testing for price/amount manipulation
  4. Checking if read-only fields can be modified
  5. Testing nested object injection
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from services.owasp_engine import (
    Finding,
    ScanContext,
    safe_request,
    register_rule,
)


# ── Privileged field payloads ───────────────────────────────────────────────

PRIVILEGE_ESCALATION_FIELDS = [
    ("role", "admin"),
    ("is_admin", True),
    ("isAdmin", True),
    ("admin", True),
    ("permissions", ["admin", "superuser"]),
    ("user_type", "admin"),
    ("userType", "admin"),
    ("access_level", 9999),
    ("accessLevel", 9999),
    ("is_superuser", True),
    ("is_staff", True),
    ("verified", True),
    ("is_verified", True),
    ("approved", True),
    ("status", "active"),
    ("account_type", "premium"),
]

PRICE_MANIPULATION_FIELDS = [
    ("price", 0.01),
    ("amount", 0.01),
    ("cost", 0.01),
    ("total", 0.01),
    ("discount", 100),
    ("discount_percent", 100),
    ("free", True),
    ("is_free", True),
]

READONLY_FIELDS = [
    ("id", "INJECTED_ID_12345"),
    ("_id", "INJECTED_ID_12345"),
    ("created_at", "2000-01-01T00:00:00Z"),
    ("createdAt", "2000-01-01T00:00:00Z"),
    ("updated_at", "2000-01-01T00:00:00Z"),
    ("updatedAt", "2000-01-01T00:00:00Z"),
    ("user_id", "INJECTED_USER_999"),
    ("userId", "INJECTED_USER_999"),
    ("owner_id", "INJECTED_USER_999"),
    ("ownerId", "INJECTED_USER_999"),
]

INTERNAL_FIELDS = [
    ("password", "HACKED_PASSWORD_123"),
    ("password_hash", "$2b$10$INJECTED_HASH"),
    ("internal_notes", "INJECTED_INTERNAL_NOTE"),
    ("debug_mode", True),
    ("debugMode", True),
    ("_internal", {"injected": True}),
]


def _build_payload(inject_fields: list[tuple[str, Any]]) -> dict[str, Any]:
    """Build a request payload with injected fields."""
    base = {"name": "test_user", "email": "test@example.com"}
    for key, val in inject_fields:
        base[key] = val
    return base


def _check_reflected_in_response(
    resp_json: Any,
    inject_fields: list[tuple[str, Any]],
) -> list[tuple[str, Any]]:
    """Check if injected fields were accepted/reflected in response."""
    if not isinstance(resp_json, dict):
        return []

    reflected: list[tuple[str, Any]] = []
    for key, expected_val in inject_fields:
        if key in resp_json:
            actual_val = resp_json[key]
            if actual_val == expected_val:
                reflected.append((key, actual_val))
            elif isinstance(expected_val, bool) and actual_val:
                reflected.append((key, actual_val))
    return reflected


# ── Main rule ───────────────────────────────────────────────────────────────


@register_rule
async def check_mass_assignment(ctx: ScanContext) -> None:
    """Detect Mass Assignment vulnerabilities."""

    baseline_status = ctx.metadata.get("baseline_status", 0)
    if baseline_status == 0:
        return

    # ── Test 1: Privilege escalation via field injection ────────────────
    for method in ("POST", "PUT", "PATCH"):
        payload = _build_payload(PRIVILEGE_ESCALATION_FIELDS[:8])
        resp = await safe_request(
            ctx.client,
            method,
            ctx.target_url,
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        if resp is None:
            continue

        if resp.status_code in (200, 201, 204):
            try:
                resp_json = resp.json()
            except Exception:
                resp_json = None

            if resp_json:
                reflected = _check_reflected_in_response(
                    resp_json, PRIVILEGE_ESCALATION_FIELDS[:8]
                )
                if reflected:
                    reflected_str = [f"{k}={v}" for k, v in reflected]
                    ctx.add(
                        Finding(
                            owasp_category="Mass Assignment",
                            owasp_id="API3:2023",
                            title=f"Privilege Escalation via Mass Assignment ({method})",
                            severity="CRITICAL",
                            description=(
                                f"The API accepted and persisted {len(reflected)} injected "
                                f"privileged field(s) via {method}. An attacker could escalate "
                                f"privileges by setting admin roles or bypassing access controls."
                            ),
                            evidence=(
                                f"{method} {ctx.target_url} with injected fields → HTTP {resp.status_code}. "
                                f"Reflected fields: {reflected_str}"
                            ),
                            recommendation=(
                                "Implement allowlists for accepted fields. Use DTOs or serializer "
                                "classes that explicitly define which fields can be set by users. "
                                "Never accept role, admin, or permission fields from client input."
                            ),
                            cwe="CWE-915",
                            cvss=9.8,
                        )
                    )
                    break  # one finding per method is enough

    # ── Test 2: Price/amount manipulation ───────────────────────────────
    for method in ("POST", "PUT", "PATCH"):
        payload = _build_payload(PRICE_MANIPULATION_FIELDS)
        resp = await safe_request(
            ctx.client,
            method,
            ctx.target_url,
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        if resp is None:
            continue

        if resp.status_code in (200, 201, 204):
            try:
                resp_json = resp.json()
            except Exception:
                resp_json = None

            if resp_json:
                reflected = _check_reflected_in_response(
                    resp_json, PRICE_MANIPULATION_FIELDS
                )
                if reflected:
                    reflected_str = [f"{k}={v}" for k, v in reflected]
                    ctx.add(
                        Finding(
                            owasp_category="Mass Assignment",
                            owasp_id="API3:2023",
                            title=f"Price/Amount Manipulation via Mass Assignment ({method})",
                            severity="CRITICAL",
                            description=(
                                f"The API accepted injected financial fields via {method}. "
                                f"This could allow price manipulation attacks."
                            ),
                            evidence=f"Reflected fields: {reflected_str}",
                            recommendation=(
                                "Financial fields (price, amount, cost) must be computed server-side. "
                                "Never accept pricing data from client input. Use allowlists for "
                                "accepted fields."
                            ),
                            cwe="CWE-915",
                            cvss=9.8,
                        )
                    )
                    break

    # ── Test 3: Read-only field modification ────────────────────────────
    for method in ("PUT", "PATCH"):
        payload = _build_payload(READONLY_FIELDS[:4])
        resp = await safe_request(
            ctx.client,
            method,
            ctx.target_url,
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        if resp is None:
            continue

        if resp.status_code in (200, 201, 204):
            try:
                resp_json = resp.json()
            except Exception:
                resp_json = None

            if resp_json:
                reflected = _check_reflected_in_response(resp_json, READONLY_FIELDS[:4])
                if reflected:
                    reflected_str = [f"{k}={v}" for k, v in reflected]
                    ctx.add(
                        Finding(
                            owasp_category="Mass Assignment",
                            owasp_id="API3:2023",
                            title=f"Read-Only Fields Modified via {method}",
                            severity="HIGH",
                            description=(
                                f"The API accepted and reflected read-only fields that should "
                                f"be server-controlled: {reflected_str}."
                            ),
                            evidence=f"Modified read-only fields: {reflected_str}",
                            recommendation=(
                                "Strip read-only fields (id, created_at, user_id, etc.) from "
                                "update requests. Validate that only updatable fields are processed."
                            ),
                            cwe="CWE-915",
                            cvss=7.5,
                        )
                    )
                    break

    # ── Test 4: Internal field injection ────────────────────────────────
    for method in ("POST", "PUT", "PATCH"):
        payload = _build_payload(INTERNAL_FIELDS[:3])
        resp = await safe_request(
            ctx.client,
            method,
            ctx.target_url,
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        if resp is None:
            continue

        if resp.status_code in (200, 201, 204):
            try:
                resp_json = resp.json()
            except Exception:
                resp_json = None

            if resp_json:
                reflected = _check_reflected_in_response(resp_json, INTERNAL_FIELDS[:3])
                if reflected:
                    reflected_str = [f"{k}={v}" for k, v in reflected]
                    ctx.add(
                        Finding(
                            owasp_category="Mass Assignment",
                            owasp_id="API3:2023",
                            title=f"Internal Fields Acceptable via {method}",
                            severity="CRITICAL",
                            description=(
                                f"The API accepted internal/system fields via {method}. "
                                f"This could allow attackers to modify password hashes, "
                                f"internal notes, or debug settings."
                            ),
                            evidence=f"Accepted internal fields: {reflected_str}",
                            recommendation=(
                                "Use strict input validation and allowlists. Internal fields "
                                "(password_hash, internal_notes, debug_mode) must never be "
                                "settable via the API."
                            ),
                            cwe="CWE-915",
                            cvss=9.8,
                        )
                    )
                    break

    # ── Test 5: Nested object injection ─────────────────────────────────
    nested_payloads = [
        {"user": {"role": "admin", "is_admin": True}},
        {"profile": {"permissions": ["admin"]}},
        {"metadata": {"access_level": 9999}},
    ]
    for method in ("POST", "PUT", "PATCH"):
        for nested in nested_payloads:
            payload = {**nested, "name": "test", "email": "test@test.com"}
            resp = await safe_request(
                ctx.client,
                method,
                ctx.target_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            if resp is None:
                continue

            if resp.status_code in (200, 201, 204):
                try:
                    resp_json = resp.json()
                    if isinstance(resp_json, dict):
                        for outer_key, inner_dict in nested.items():
                            if outer_key in resp_json and isinstance(
                                resp_json[outer_key], dict
                            ):
                                for inner_key in inner_dict:
                                    if inner_key in resp_json[outer_key]:
                                        ctx.add(
                                            Finding(
                                                owasp_category="Mass Assignment",
                                                owasp_id="API3:2023",
                                                title=f"Nested Object Injection via {method}",
                                                severity="HIGH",
                                                description=(
                                                    f"The API accepted a nested privileged field "
                                                    f"'{outer_key}.{inner_key}' via {method}. "
                                                    f"This bypasses flat-field validation."
                                                ),
                                                evidence=f"Nested field {outer_key}.{inner_key} reflected in response",
                                                recommendation=(
                                                    "Validate nested objects recursively. Use strict "
                                                    "schema validation (e.g., JSON Schema, Pydantic) "
                                                    "that rejects unknown fields at all nesting levels."
                                                ),
                                                cwe="CWE-915",
                                                cvss=8.6,
                                            )
                                        )
                                        break
                except Exception:
                    pass
