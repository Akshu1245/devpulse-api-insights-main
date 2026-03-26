#!/usr/bin/env python3
"""
OWASP API Security Scanner - Sample Scan Results Generator
===========================================================
Generates realistic sample scan results demonstrating the scanner's
vulnerability detection capabilities.

This creates sample reports for:
1. A vulnerable API (with multiple findings)
2. A secure API (minimal findings)
3. An e-commerce API (business logic vulnerabilities)
"""

import json
from datetime import datetime, timezone
from typing import Any


def generate_vulnerable_api_report() -> dict[str, Any]:
    """Generate sample scan results for a vulnerable API."""
    return {
        "target_url": "https://vulnerable-api.example.com/api/users/123",
        "scan_id": "scan_7f8a9b2c-4d3e-11ef-9a1b-0242ac120002",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "scan_duration_ms": 4523.67,
        "total_findings": 12,
        "summary": {
            "severity_counts": {
                "CRITICAL": 3,
                "HIGH": 5,
                "MEDIUM": 3,
                "LOW": 1,
            },
            "owasp_categories_detected": [
                "Broken Object Level Authorization",
                "Broken Authentication",
                "Excessive Data Exposure",
                "Mass Assignment",
                "Security Misconfiguration",
                "Injection",
            ],
            "risk_score": 95,
        },
        "findings": [
            {
                "owasp_category": "Broken Object Level Authorization",
                "owasp_id": "API1:2023",
                "title": "Potential IDOR — Object Accessible via ID Manipulation",
                "severity": "HIGH",
                "description": (
                    "Changing the resource ID from '123' to '124' returned a different valid "
                    "resource (HTTP 200). This indicates the API may not enforce object-level "
                    "access control, allowing attackers to access other users' data by simply "
                    "incrementing the user ID."
                ),
                "evidence": "GET /api/users/124 → HTTP 200 (different body from baseline)",
                "recommendation": (
                    "Enforce object-level authorization by verifying the authenticated user has "
                    "permission to access the requested resource ID. Use indirect references "
                    "(UUIDs) and validate ownership on every request."
                ),
                "cwe": "CWE-639",
                "cvss": 7.5,
            },
            {
                "owasp_category": "Broken Object Level Authorization",
                "owasp_id": "API1:2023",
                "title": "Resource Accessible Without Authentication",
                "severity": "CRITICAL",
                "description": (
                    "The endpoint returns data (HTTP 200) even when no authentication token is "
                    "provided. This is a critical BOLA vulnerability allowing unauthenticated "
                    "access to user data."
                ),
                "evidence": "GET /api/users/123 (no Auth header) → HTTP 200",
                "recommendation": (
                    "Require valid authentication for all API endpoints. Implement middleware "
                    "that rejects unauthenticated requests before they reach the business logic."
                ),
                "cwe": "CWE-306",
                "cvss": 9.1,
            },
            {
                "owasp_category": "Broken Authentication",
                "owasp_id": "API2:2023",
                "title": "No Brute-Force Protection Detected",
                "severity": "HIGH",
                "description": (
                    "Sent 10 rapid failed login attempts without rate limiting. The API does not "
                    "appear to implement brute-force protection, allowing attackers to attempt "
                    "unlimited password guesses."
                ),
                "evidence": "POST /auth/login → 10/10 requests returned 401 (no 429 received)",
                "recommendation": (
                    "Implement account lockout or progressive delays after failed login attempts. "
                    "Use rate limiting (e.g., 5 failed attempts per 15 minutes)."
                ),
                "cwe": "CWE-307",
                "cvss": 7.3,
            },
            {
                "owasp_category": "Broken Authentication",
                "owasp_id": "API2:2023",
                "title": "JWT Missing Expiration Claim",
                "severity": "HIGH",
                "description": (
                    "The JWT token does not contain an 'exp' claim, meaning it never expires. "
                    "If a token is compromised, it can be used indefinitely."
                ),
                "evidence": "JWT payload keys: ['user_id', 'username', 'role', 'iat']",
                "recommendation": (
                    "Always include 'exp' claim in JWTs with a reasonable TTL (e.g., 15-60 "
                    "minutes). Use refresh tokens for longer sessions."
                ),
                "cwe": "CWE-613",
                "cvss": 7.5,
            },
            {
                "owasp_category": "Excessive Data Exposure",
                "owasp_id": "API3:2023",
                "title": "Sensitive Fields Exposed in API Response",
                "severity": "HIGH",
                "description": (
                    "The API response contains 5 sensitive fields that should not be exposed to "
                    "clients. Fields include: password_hash, internal_id, role, permissions, "
                    "session_id. This allows attackers to obtain credential hashes and internal "
                    "system information."
                ),
                "evidence": (
                    "Sensitive fields found: ["
                    "password_hash (str), internal_id (int), role (str), permissions (list), "
                    "session_id (str)"
                    "]"
                ),
                "recommendation": (
                    "Implement response filtering to remove internal/sensitive fields. Use DTOs "
                    "(Data Transfer Objects) or serializer classes to explicitly define which "
                    "fields are exposed."
                ),
                "cwe": "CWE-200",
                "cvss": 6.5,
            },
            {
                "owasp_category": "Excessive Data Exposure",
                "owasp_id": "API3:2023",
                "title": "PII Patterns Detected in Response Body",
                "severity": "HIGH",
                "description": (
                    "The API response body contains patterns matching personally identifiable "
                    "information: email, ssn, phone. This may indicate excessive data exposure "
                    "violating privacy regulations (GDPR, CCPA)."
                ),
                "evidence": "PII types detected: ['email', 'ssn', 'phone']",
                "recommendation": (
                    "Audit the API response to ensure only necessary data is returned. Mask or "
                    "remove PII that is not required by the client. Implement field-level access "
                    "controls."
                ),
                "cwe": "CWE-359",
                "cvss": 7.5,
            },
            {
                "owasp_category": "Excessive Data Exposure",
                "owasp_id": "API3:2023",
                "title": "Debug/Admin Endpoint Publicly Accessible: /api/debug",
                "severity": "CRITICAL",
                "description": (
                    "The endpoint /api/debug is publicly accessible and returns HTTP 200. This "
                    "may expose sensitive configuration, environment variables, or administrative "
                    "functions."
                ),
                "evidence": "GET /api/debug → HTTP 200 (Content-Type: application/json)",
                "recommendation": (
                    "Restrict debug and admin endpoints to internal networks or authenticated "
                    "administrators. Remove unnecessary endpoints from production deployments."
                ),
                "cwe": "CWE-489",
                "cvss": 8.6,
            },
            {
                "owasp_category": "Mass Assignment",
                "owasp_id": "API3:2023",
                "title": "Privilege Escalation via Mass Assignment (PUT)",
                "severity": "CRITICAL",
                "description": (
                    "The API accepted and persisted 3 injected privileged fields via PUT. An "
                    "attacker could escalate privileges by setting admin roles or bypassing "
                    "access controls. Fields accepted: role=admin, is_admin=True, "
                    "access_level=9999."
                ),
                "evidence": (
                    "PUT /api/users/123 with injected fields → HTTP 200. "
                    "Reflected fields: ['role=admin', 'is_admin=True', 'access_level=9999']"
                ),
                "recommendation": (
                    "Implement allowlists for accepted fields. Use DTOs or serializer classes "
                    "that explicitly define which fields can be set by users. Never accept role, "
                    "admin, or permission fields from client input."
                ),
                "cwe": "CWE-915",
                "cvss": 9.8,
            },
            {
                "owasp_category": "Mass Assignment",
                "owasp_id": "API3:2023",
                "title": "Price/Amount Manipulation via Mass Assignment (POST)",
                "severity": "CRITICAL",
                "description": (
                    "The API accepted injected financial fields via POST. This could allow price "
                    "manipulation attacks where attackers set their own prices for purchases."
                ),
                "evidence": "Reflected fields: ['price=0.01', 'discount=100', 'free=True']",
                "recommendation": (
                    "Financial fields (price, amount, cost) must be computed server-side. Never "
                    "accept pricing data from client input. Use allowlists for accepted fields."
                ),
                "cwe": "CWE-915",
                "cvss": 9.8,
            },
            {
                "owasp_category": "Security Misconfiguration",
                "owasp_id": "API8:2023",
                "title": "Missing Strict-Transport-Security (HSTS) Header",
                "severity": "HIGH",
                "description": (
                    "The API does not send the HSTS header. Clients may connect over HTTP, making "
                    "them vulnerable to downgrade attacks and man-in-the-middle interception."
                ),
                "evidence": "Header 'strict-transport-security' not present in response",
                "recommendation": (
                    "Set Strict-Transport-Security: max-age=31536000; includeSubDomains; preload"
                ),
                "cwe": "CWE-319",
                "cvss": 7.5,
            },
            {
                "owasp_category": "Security Misconfiguration",
                "owasp_id": "API8:2023",
                "title": "Open CORS Policy — Origin Reflection",
                "severity": "HIGH",
                "description": (
                    "The API reflects the request Origin 'https://evil.com' in the "
                    "Access-Control-Allow-Origin response header. This allows any website to make "
                    "cross-origin requests to this API, potentially stealing user data."
                ),
                "evidence": (
                    "OPTIONS /api/users/123\n"
                    "  Request Origin: https://evil.com\n"
                    "  Response ACAO: https://evil.com"
                ),
                "recommendation": (
                    "Whitelist specific allowed origins. Never reflect the Origin header "
                    "dynamically. Use a strict CORS policy that only allows trusted domains."
                ),
                "cwe": "CWE-942",
                "cvss": 7.5,
            },
            {
                "owasp_category": "Security Misconfiguration",
                "owasp_id": "API8:2023",
                "title": "No Rate Limiting Enforcement",
                "severity": "MEDIUM",
                "description": (
                    "Sent 50 requests in 2.34 seconds (21.4 req/s). All requests succeeded "
                    "without any rate limiting (429 responses). This makes the API vulnerable to "
                    "brute-force and DoS attacks."
                ),
                "evidence": (
                    "Requests: 50, Duration: 2.34s, Rate: 21.4 req/s, "
                    "Success: 50/50, Rate Limited: 0"
                ),
                "recommendation": (
                    "Implement rate limiting using algorithms like token bucket or sliding window. "
                    "Start with conservative limits (e.g., 100 req/min per IP, 1000 req/min per "
                    "authenticated user). Return 429 with Retry-After header when limits are "
                    "exceeded."
                ),
                "cwe": "CWE-770",
                "cvss": 5.3,
            },
        ],
    }


def generate_secure_api_report() -> dict[str, Any]:
    """Generate sample scan results for a well-secured API."""
    return {
        "target_url": "https://secure-api.example.com/v1/users/abc-123-def",
        "scan_id": "scan_9c2b4e6f-4d3e-11ef-9a1b-0242ac120002",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "scan_duration_ms": 3891.23,
        "total_findings": 3,
        "summary": {
            "severity_counts": {
                "CRITICAL": 0,
                "HIGH": 0,
                "MEDIUM": 2,
                "LOW": 1,
            },
            "owasp_categories_detected": [
                "Security Misconfiguration",
            ],
            "risk_score": 18,
        },
        "findings": [
            {
                "owasp_category": "Security Misconfiguration",
                "owasp_id": "API8:2023",
                "title": "Missing X-XSS-Protection Header",
                "severity": "LOW",
                "description": "Legacy XSS protection header is not set.",
                "evidence": "Header 'x-xss-protection' not present in response",
                "recommendation": "Set X-XSS-Protection: 1; mode=block (or rely on CSP).",
                "cwe": "CWE-79",
                "cvss": 3.1,
            },
            {
                "owasp_category": "Security Misconfiguration",
                "owasp_id": "API8:2023",
                "title": "Missing Permissions-Policy Header",
                "severity": "LOW",
                "description": "No Permissions-Policy means browser features are unrestricted.",
                "evidence": "Header 'permissions-policy' not present in response",
                "recommendation": "Set Permissions-Policy to restrict unused browser features.",
                "cwe": "CWE-693",
                "cvss": 3.1,
            },
            {
                "owasp_category": "Security Misconfiguration",
                "owasp_id": "API8:2023",
                "title": "No Rate Limit Headers Present",
                "severity": "MEDIUM",
                "description": (
                    "The API response does not include any rate limiting headers "
                    "(X-RateLimit-*, Ratelimit-*). This makes it difficult for clients to "
                    "understand their usage limits."
                ),
                "evidence": "No rate limit headers found in response",
                "recommendation": (
                    "Implement rate limiting and expose limits via standard headers: "
                    "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset."
                ),
                "cwe": "CWE-770",
                "cvss": 5.3,
            },
        ],
    }


def generate_ecommerce_api_report() -> dict[str, Any]:
    """Generate sample scan results for an e-commerce API with business logic vulns."""
    return {
        "target_url": "https://shop-api.example.com/api/orders/5678",
        "scan_id": "scan_a3d5f7g8-4d3e-11ef-9a1b-0242ac120002",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "scan_duration_ms": 5234.89,
        "total_findings": 8,
        "summary": {
            "severity_counts": {
                "CRITICAL": 2,
                "HIGH": 3,
                "MEDIUM": 2,
                "LOW": 1,
            },
            "owasp_categories_detected": [
                "Broken Object Level Authorization",
                "Broken Authentication",
                "Mass Assignment",
                "Security Misconfiguration",
                "Injection",
            ],
            "risk_score": 82,
        },
        "findings": [
            {
                "owasp_category": "Broken Object Level Authorization",
                "owasp_id": "API1:2023",
                "title": "Sequential ID Enumeration Possible",
                "severity": "MEDIUM",
                "description": (
                    "Sequential resource IDs (5679, 5680, 5681) all return HTTP 200. The API "
                    "uses predictable sequential IDs without adequate access control, enabling "
                    "enumeration attacks where attackers can discover all order IDs."
                ),
                "evidence": "GET /api/orders/5681 → 3/3 sequential IDs returned 200",
                "recommendation": (
                    "Use UUIDs or other non-sequential identifiers. Implement rate limiting on "
                    "resource access and monitor for enumeration patterns."
                ),
                "cwe": "CWE-639",
                "cvss": 5.3,
            },
            {
                "owasp_category": "Broken Authentication",
                "owasp_id": "API2:2023",
                "title": "Authentication Token in URL Query Parameter",
                "severity": "HIGH",
                "description": (
                    "The URL contains authentication-related query parameters (token/api_key). "
                    "Tokens in URLs are logged in server logs, browser history, and referrer "
                    "headers, potentially exposing them to attackers."
                ),
                "evidence": "URL: https://shop-api.example.com/api/orders/5678?api_key=sk_live_...",
                "recommendation": (
                    "Pass authentication tokens in the Authorization header, not in URL query "
                    "parameters. This prevents token leakage through logs and referrer headers."
                ),
                "cwe": "CWE-598",
                "cvss": 7.5,
            },
            {
                "owasp_category": "Broken Authentication",
                "owasp_id": "API2:2023",
                "title": "Insecure Session Cookie Configuration",
                "severity": "MEDIUM",
                "description": (
                    "Set-Cookie header is missing security flags: HttpOnly, Secure, SameSite. "
                    "This makes cookies vulnerable to XSS and CSRF attacks."
                ),
                "evidence": "Set-Cookie: session=abc123; Path=/",
                "recommendation": (
                    "Set HttpOnly, Secure, and SameSite=Strict (or Lax) flags on all "
                    "authentication/session cookies."
                ),
                "cwe": "CWE-614",
                "cvss": 5.4,
            },
            {
                "owasp_category": "Mass Assignment",
                "owasp_id": "API3:2023",
                "title": "Price/Amount Manipulation via Mass Assignment (POST)",
                "severity": "CRITICAL",
                "description": (
                    "The API accepted injected financial fields via POST. This could allow price "
                    "manipulation attacks where attackers set their own prices for purchases, "
                    "potentially resulting in significant financial loss."
                ),
                "evidence": "Reflected fields: ['price=0.01', 'total=0.01', 'discount=100']",
                "recommendation": (
                    "Financial fields (price, amount, cost) must be computed server-side. Never "
                    "accept pricing data from client input. Use allowlists for accepted fields."
                ),
                "cwe": "CWE-915",
                "cvss": 9.8,
            },
            {
                "owasp_category": "Mass Assignment",
                "owasp_id": "API3:2023",
                "title": "Read-Only Fields Modified via PUT",
                "severity": "HIGH",
                "description": (
                    "The API accepted and reflected read-only fields that should be "
                    "server-controlled: id, created_at, user_id. This could allow attackers to "
                    "manipulate audit trails and ownership."
                ),
                "evidence": (
                    "Modified read-only fields: ['id=INJECTED_ID_12345', "
                    "'created_at=2000-01-01T00:00:00Z']"
                ),
                "recommendation": (
                    "Strip read-only fields (id, created_at, user_id, etc.) from update "
                    "requests. Validate that only updatable fields are processed."
                ),
                "cwe": "CWE-915",
                "cvss": 7.5,
            },
            {
                "owasp_category": "Injection",
                "owasp_id": "API8:2023",
                "title": "SQL Injection in Query Parameter",
                "severity": "CRITICAL",
                "description": (
                    "The API appears vulnerable to SQL injection via query parameters. Payload "
                    "' OR '1'='1' --' triggered an error response indicating unsanitized database "
                    "queries."
                ),
                "evidence": (
                    "Error patterns found: ['SQL syntax', 'near \\'\\' OR', 'unclosed quotation']"
                ),
                "recommendation": (
                    "Use parameterized queries or prepared statements. Never concatenate user "
                    "input into SQL queries. Implement input validation and sanitization."
                ),
                "cwe": "CWE-89",
                "cvss": 9.8,
            },
            {
                "owasp_category": "Security Misconfiguration",
                "owasp_id": "API8:2023",
                "title": "Server Header Exposes Technology Information",
                "severity": "LOW",
                "description": (
                    "The 'server' response header reveals server technology: 'nginx/1.18.0'. "
                    "This helps attackers target known vulnerabilities for this specific version."
                ),
                "evidence": "server: nginx/1.18.0",
                "recommendation": "Remove or genericize the 'server' header in production.",
                "cwe": "CWE-200",
                "cvss": 3.1,
            },
            {
                "owasp_category": "Security Misconfiguration",
                "owasp_id": "API8:2023",
                "title": "Open Redirect via 'redirect' Parameter",
                "severity": "MEDIUM",
                "description": (
                    "The API redirects to unvalidated URLs supplied via the 'redirect' query "
                    "parameter. This can be used for phishing attacks where users are redirected "
                    "to malicious sites."
                ),
                "evidence": "GET /api/orders/5678?redirect=https://evil.com/phishing → Redirect to https://evil.com/phishing",
                "recommendation": (
                    "Validate redirect URLs against an allowlist. Never redirect to external URLs "
                    "supplied by the client."
                ),
                "cwe": "CWE-601",
                "cvss": 6.1,
            },
        ],
    }


def save_sample_reports(output_dir: str = "sample_scan_results") -> None:
    """Generate and save all sample reports."""
    import os

    os.makedirs(output_dir, exist_ok=True)

    reports = {
        "vulnerable_api_scan": generate_vulnerable_api_report(),
        "secure_api_scan": generate_secure_api_report(),
        "ecommerce_api_scan": generate_ecommerce_api_report(),
    }

    for name, report in reports.items():
        filepath = os.path.join(output_dir, f"{name}.json")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f"✅ Generated: {filepath}")

    print(f"\n📁 All reports saved to: {output_dir}/")


if __name__ == "__main__":
    save_sample_reports()
