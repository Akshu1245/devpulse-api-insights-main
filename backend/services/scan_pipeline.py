"""
Scanning Pipeline — DevPulse
Orchestrates the full Postman import → parse → scan → results flow.

Combines:
1. Postman collection parsing (endpoints, secrets, variables)
2. HTTP security probing (headers, HTTPS, CORS)
3. Risk scoring per endpoint
4. Unified structured output
"""

from __future__ import annotations

import asyncio
from typing import Any

from services.postman_parser import parse_postman_collection
from services.risk_score import calculate_security_score
from services.scanner import run_security_probe


SEVERITY_ORDER = {
    "critical": 4,
    "high": 3,
    "medium": 2,
    "low": 1,
    "minimal": 0,
    "info": 0,
}


def _compute_endpoint_risk_level(
    security_issues: list[dict], secrets: list[dict]
) -> str:
    """
    Compute overall risk level for a single endpoint
    based on both security scan issues and secret findings.
    """
    max_severity = 0
    for issue in security_issues:
        sev = SEVERITY_ORDER.get(issue.get("risk_level", "low"), 1)
        max_severity = max(max_severity, sev)
    for secret in secrets:
        sev = SEVERITY_ORDER.get(secret.get("severity", "low"), 1)
        max_severity = max(max_severity, sev)

    if max_severity >= 4:
        return "critical"
    elif max_severity >= 3:
        return "high"
    elif max_severity >= 2:
        return "medium"
    elif max_severity >= 1:
        return "low"
    return "minimal"


def _build_security_issues_for_static_checks(endpoint: dict) -> list[dict[str, Any]]:
    """
    Perform static (non-HTTP) security checks on an endpoint's structure.
    These run without making any network requests.
    """
    issues: list[dict[str, Any]] = []

    # Check for HTTP (not HTTPS) in URL
    url = endpoint.get("url", "")
    if url.startswith("http://"):
        issues.append(
            {
                "issue": "Endpoint URL uses HTTP instead of HTTPS",
                "risk_level": "critical",
                "recommendation": "Use HTTPS to encrypt traffic in transit.",
                "source": "static_analysis",
            }
        )

    # Check for missing auth
    auth = endpoint.get("auth", {})
    if not auth:
        # Only flag if URL looks like an API endpoint (not just docs)
        if any(
            seg in url.lower() for seg in ["/api/", "/v1/", "/v2/", "/graphql", "/rest"]
        ):
            issues.append(
                {
                    "issue": "No authentication configured for API endpoint",
                    "risk_level": "high",
                    "recommendation": "Add authentication (Bearer, API Key, OAuth) to protect this endpoint.",
                    "source": "static_analysis",
                }
            )

    # Check for secrets in the endpoint itself
    if endpoint.get("has_secrets"):
        issues.append(
            {
                "issue": "Hardcoded secrets detected in endpoint configuration",
                "risk_level": "critical",
                "recommendation": "Remove hardcoded secrets. Use environment variables or a vault.",
                "source": "static_analysis",
            }
        )

    # Check for unresolved variables (configuration risk)
    unresolved = endpoint.get("unresolved_variables", [])
    if unresolved:
        issues.append(
            {
                "issue": f"Unresolved variables: {', '.join(unresolved)}",
                "risk_level": "low",
                "recommendation": "Ensure all collection variables are defined or provided at runtime.",
                "source": "static_analysis",
            }
        )

    # Check for sensitive paths
    sensitive_patterns = [
        "/admin",
        "/internal",
        "/debug",
        "/config",
        "/secret",
        "/password",
        "/token",
    ]
    url_lower = url.lower()
    for pattern in sensitive_patterns:
        if pattern in url_lower:
            issues.append(
                {
                    "issue": f"URL contains sensitive path segment '{pattern}'",
                    "risk_level": "medium",
                    "recommendation": "Ensure sensitive paths are protected with proper authorization and not exposed publicly.",
                    "source": "static_analysis",
                }
            )
            break  # Only flag once per endpoint

    return issues


def _build_endpoint_result(
    endpoint: dict,
    http_scan_results: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Build a unified result object for a single endpoint.
    Combines static analysis, HTTP scan results, and secret findings.
    """
    # Static security checks
    static_issues = _build_security_issues_for_static_checks(endpoint)

    # HTTP scan results (if available)
    http_issues = []
    if http_scan_results:
        for finding in http_scan_results:
            http_issues.append(
                {
                    "issue": finding.get("issue", ""),
                    "risk_level": finding.get("risk_level", "low"),
                    "recommendation": finding.get("recommendation", ""),
                    "source": "http_probe",
                    "method": finding.get("method", "GET"),
                }
            )

    # All security issues combined
    all_security_issues = static_issues + http_issues

    # Compute security score
    security_score = calculate_security_score(all_security_issues)

    # Compute overall risk level
    risk_level = _compute_endpoint_risk_level(
        all_security_issues, endpoint.get("secrets_detected", [])
    )

    return {
        "name": endpoint["name"],
        "method": endpoint["method"],
        "url": endpoint["url"],
        "folder_path": endpoint.get("folder_path", ""),
        "headers": endpoint.get("headers", []),
        "body": endpoint.get("body", {}),
        "query_params": endpoint.get("query_params", []),
        "auth": endpoint.get("auth", {}),
        "description": endpoint.get("description", ""),
        "security_issues": all_security_issues,
        "secrets_detected": endpoint.get("secrets_detected", []),
        "security_score": security_score,
        "risk_level": risk_level,
        "is_scannable": endpoint.get("is_scannable", False),
        "unresolved_variables": endpoint.get("unresolved_variables", []),
    }


async def run_scan_pipeline(
    collection_json: dict,
    scan_endpoints: bool = True,
    max_http_scans: int = 10,
) -> dict[str, Any]:
    """
    Full scanning pipeline for a Postman collection.

    Steps:
    1. Parse the collection (endpoints, variables, secrets)
    2. For each scannable URL, run HTTP security probe (up to max_http_scans)
    3. Build unified endpoint results with combined risk scores
    4. Return structured scan results

    Args:
        collection_json: Raw Postman Collection v2.1 JSON
        scan_endpoints: Whether to run HTTP security probes (can be slow)
        max_http_scans: Maximum number of URLs to probe via HTTP

    Returns:
        Structured scan result matching the required output format
    """
    # Step 1: Parse the collection
    parsed = parse_postman_collection(collection_json)

    # Step 2: Run HTTP security probes on scannable URLs
    http_scan_cache: dict[str, list[dict]] = {}
    if scan_endpoints and parsed["scannable_urls"]:
        urls_to_scan = parsed["scannable_urls"][:max_http_scans]

        # Run scans concurrently for performance
        async def _scan_one(url_info: dict) -> tuple[str, list[dict]]:
            url = url_info["url"]
            try:
                results = await run_security_probe(url)
                return url, results
            except Exception as e:
                return url, [
                    {
                        "issue": f"Scan failed: {str(e)}",
                        "risk_level": "low",
                        "recommendation": "Check if the endpoint is reachable and accepts connections.",
                        "method": url_info.get("method", "GET"),
                    }
                ]

        tasks = [_scan_one(ui) for ui in urls_to_scan]
        scan_results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in scan_results:
            if isinstance(result, tuple):
                url, findings = result
                http_scan_cache[url] = findings

    # Step 3: Build unified endpoint results
    endpoint_results: list[dict[str, Any]] = []
    for ep in parsed["endpoints"]:
        http_results = http_scan_cache.get(ep["url"])
        endpoint_results.append(_build_endpoint_result(ep, http_results))

    # Step 4: Compute collection-level summary
    risk_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "minimal": 0}
    for ep_result in endpoint_results:
        rl = ep_result.get("risk_level", "minimal")
        risk_counts[rl] = risk_counts.get(rl, 0) + 1

    # Count total security issues across all endpoints
    total_security_issues = sum(
        len(ep.get("security_issues", [])) for ep in endpoint_results
    )
    total_secrets = len(parsed.get("secret_findings", []))

    return {
        "collection_name": parsed["collection_name"],
        "schema": parsed["schema"],
        "total_endpoints": parsed["total_endpoints"],
        "endpoints": endpoint_results,
        "secret_findings": parsed["secret_findings"],
        "secrets_exposed_count": parsed["secrets_exposed_count"],
        "endpoints_with_secrets": parsed["endpoints_with_secrets"],
        "endpoints_scanned_http": len(http_scan_cache),
        "variables_resolved": parsed["variables_resolved"],
        "summary": {
            "total_endpoints": parsed["total_endpoints"],
            "total_security_issues": total_security_issues,
            "total_secrets_detected": total_secrets,
            "risk_distribution": risk_counts,
            "endpoints_with_secrets": parsed["endpoints_with_secrets"],
            "endpoints_with_unresolved_vars": parsed["endpoints_with_unresolved_vars"],
            "scannable_urls": parsed["summary"]["total_scannable_urls"],
            "methods_distribution": parsed["summary"]["methods_distribution"],
            "secrets_by_severity": {
                "critical": parsed["summary"]["critical_secrets"],
                "high": parsed["summary"]["high_secrets"],
                "medium": parsed["summary"]["medium_secrets"],
                "low": parsed["summary"]["low_secrets"],
            },
        },
    }
