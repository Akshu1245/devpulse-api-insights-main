"""
Postman Collection v2.1 Parser — DevPulse
Parses deeply nested Postman Collection JSON, extracts all API endpoints,
resolves variables, detects secrets, and prepares data for scanning pipeline.

Supports Postman Collection v2.0 and v2.1 schemas.
Handles: nested folders, variable resolution, all body modes (raw/json/form-data/graphql),
         auth blocks, query params, path variables.
"""

from __future__ import annotations

import re
from typing import Any

from services.secret_detector import (
    deduplicate_findings,
    detect_secrets_in_auth,
    detect_secrets_in_body,
    detect_secrets_in_headers,
    detect_secrets_in_string,
)

# ─── Variable Resolution ─────────────────────────────────────────────────────

VARIABLE_PATTERN = re.compile(r"\{\{([^}]+)\}\}")


def extract_collection_variables(collection_json: dict) -> dict[str, str]:
    """
    Extract variables defined at the collection level.
    These appear in collection_json["variable"] as a list of {key, value} objects.
    Also supports variable objects with type/value fields.
    """
    variables: dict[str, str] = {}

    # Collection-level variables (v2.1 format)
    raw_vars = collection_json.get("variable", [])
    if isinstance(raw_vars, list):
        for var in raw_vars:
            key = var.get("key", "")
            value = var.get("value", "")
            if key:
                variables[key] = str(value)
    elif isinstance(raw_vars, dict):
        for key, value in raw_vars.items():
            variables[key] = str(value)

    return variables


def resolve_variables(text: str, variables: dict[str, str]) -> tuple[str, list[str]]:
    """
    Replace {{variable}} placeholders with known values.
    Returns the resolved string and a list of unresolved variable names.
    """
    if not text or "{{" not in text:
        return text, []

    unresolved: list[str] = []

    def _replace(match: re.Match[str]) -> str:
        var_name = match.group(1).strip()
        if var_name in variables:
            return variables[var_name]
        unresolved.append(var_name)
        return match.group(0)  # Keep original {{varName}}

    resolved = VARIABLE_PATTERN.sub(_replace, text)
    return resolved, unresolved


def resolve_url(url_obj: Any, variables: dict[str, str]) -> tuple[str, list[str]]:
    """
    Extract and resolve a URL from a Postman request.url object or string.
    Returns (resolved_url, unresolved_variable_names).
    """
    if isinstance(url_obj, str):
        return resolve_variables(url_obj, variables)

    if isinstance(url_obj, dict):
        raw = url_obj.get("raw", "")
        if raw:
            return resolve_variables(raw, variables)

        # Reconstruct from parts
        protocol = url_obj.get("protocol", "https")
        host_parts = url_obj.get("host", [])
        path_parts = url_obj.get("path", [])

        if isinstance(host_parts, list):
            host = ".".join(host_parts)
        else:
            host = str(host_parts)

        if isinstance(path_parts, list):
            path = "/".join(str(p) for p in path_parts)
        else:
            path = str(path_parts)

        # Query parameters
        query_parts = []
        for q in url_obj.get("query", []):
            q_key = q.get("key", "")
            q_val = q.get("value", "")
            if q_key:
                query_parts.append(f"{q_key}={q_val}")
        query_str = "?" + "&".join(query_parts) if query_parts else ""

        reconstructed = f"{protocol}://{host}/{path}{query_str}"
        return resolve_variables(reconstructed, variables)

    return "", []


def resolve_headers(
    headers: list[dict], variables: dict[str, str]
) -> tuple[list[dict], list[str]]:
    """Resolve variables in header key-value pairs."""
    resolved = []
    all_unresolved: list[str] = []
    for h in headers:
        key = h.get("key", "")
        value = h.get("value", "")
        resolved_key, unres_k = resolve_variables(str(key), variables)
        resolved_value, unres_v = resolve_variables(str(value), variables)
        all_unresolved.extend(unres_k + unres_v)
        resolved.append(
            {
                "key": resolved_key,
                "value": resolved_value,
                "disabled": h.get("disabled", False),
            }
        )
    return resolved, all_unresolved


def resolve_body(body: dict, variables: dict[str, str]) -> tuple[dict, list[str]]:
    """Resolve variables in request body."""
    if not body:
        return body, []

    all_unresolved: list[str] = []
    resolved_body = dict(body)

    mode = body.get("mode", "")
    if mode == "raw":
        raw = body.get("raw", "")
        resolved, unres = resolve_variables(str(raw), variables)
        resolved_body["raw"] = resolved
        all_unresolved.extend(unres)
    elif mode == "urlencoded":
        resolved_params = []
        for param in body.get("urlencoded", []):
            rk, uk = resolve_variables(str(param.get("key", "")), variables)
            rv, uv = resolve_variables(str(param.get("value", "")), variables)
            all_unresolved.extend(uk + uv)
            resolved_params.append({**param, "key": rk, "value": rv})
        resolved_body["urlencoded"] = resolved_params
    elif mode == "formdata":
        resolved_params = []
        for param in body.get("formdata", []):
            rk, uk = resolve_variables(str(param.get("key", "")), variables)
            rv, uv = resolve_variables(str(param.get("value", "")), variables)
            all_unresolved.extend(uk + uv)
            resolved_params.append({**param, "key": rk, "value": rv})
        resolved_body["formdata"] = resolved_params
    elif mode == "graphql":
        gql = body.get("graphql", {})
        q, uq = resolve_variables(str(gql.get("query", "")), variables)
        v, uv = resolve_variables(str(gql.get("variables", "")), variables)
        all_unresolved.extend(uq + uv)
        resolved_body["graphql"] = {"query": q, "variables": v}

    return resolved_body, all_unresolved


# ─── URL Parsing Helpers ─────────────────────────────────────────────────────


def extract_query_params(url_obj: Any) -> list[dict[str, str]]:
    """Extract query parameters from a Postman URL object."""
    if not isinstance(url_obj, dict):
        return []
    params = []
    for q in url_obj.get("query", []):
        if not q.get("disabled", False):
            params.append(
                {
                    "key": q.get("key", ""),
                    "value": q.get("value", ""),
                }
            )
    return params


def extract_path_variables(url_obj: Any) -> list[dict[str, str]]:
    """Extract path variables from a Postman URL object."""
    if not isinstance(url_obj, dict):
        return []
    vars_list = []
    for v in url_obj.get("variable", []):
        vars_list.append(
            {
                "key": v.get("key", ""),
                "value": v.get("value", ""),
                "description": v.get("description", ""),
            }
        )
    return vars_list


def is_url_scannable(url: str) -> bool:
    """Check if a URL is scannable (has http/https and no unresolved variables in host)."""
    if not url:
        return False
    if not url.startswith(("http://", "https://")):
        return False
    # Check if host part has unresolved variables
    try:
        without_protocol = url.split("://", 1)[1]
        host = without_protocol.split("/")[0].split("?")[0]
        if "{{" in host:
            return False
    except (IndexError, ValueError):
        return False
    return True


# ─── Request Extraction ──────────────────────────────────────────────────────


def _extract_request_from_item(
    item: dict,
    variables: dict[str, str],
    parent_path: str = "",
) -> list[dict[str, Any]]:
    """
    Recursively extract API endpoints from a Postman collection item.
    Handles nested folders (item.item[]) and leaf requests.
    """
    endpoints: list[dict[str, Any]] = []

    # Folder with sub-items — recurse
    if "item" in item:
        folder_name = item.get("name", "")
        path = f"{parent_path}/{folder_name}" if parent_path else folder_name
        for sub_item in item["item"]:
            endpoints.extend(_extract_request_from_item(sub_item, variables, path))
        return endpoints

    # Leaf request node
    request = item.get("request")
    if not request:
        return endpoints

    name = item.get("name", "Unnamed Request")

    # ── Method ──
    method = str(request.get("method", "GET")).upper()

    # ── URL ──
    url_obj = request.get("url", {})
    raw_url, url_unresolved = resolve_url(url_obj, variables)
    query_params = extract_query_params(url_obj)
    path_variables = extract_path_variables(url_obj)

    # ── Headers ──
    headers_raw = request.get("header", [])
    headers, header_unresolved = resolve_headers(headers_raw, variables)

    # ── Body ──
    body_raw = request.get("body", {})
    body, body_unresolved = resolve_body(body_raw, variables)

    # ── Auth ──
    auth = request.get("auth", {})

    # ── Description ──
    description = request.get("description", "")
    if isinstance(description, dict):
        description = description.get("content", "")

    # ── Secret Detection ──
    secret_findings: list[dict[str, Any]] = []
    location = f"request '{name}'"

    # Scan URL
    secret_findings.extend(detect_secrets_in_string(raw_url, f"{location} > URL"))

    # Scan headers
    secret_findings.extend(detect_secrets_in_headers(headers, location))

    # Scan body
    secret_findings.extend(detect_secrets_in_body(body, location))

    # Scan auth
    secret_findings.extend(detect_secrets_in_auth(auth, location))

    # Scan query params
    for qp in query_params:
        val = f"{qp['key']}={qp['value']}"
        secret_findings.extend(
            detect_secrets_in_string(val, f"{location} > query param '{qp['key']}'")
        )

    # Scan path variables
    for pv in path_variables:
        val = f"{pv['key']}={pv['value']}"
        secret_findings.extend(
            detect_secrets_in_string(val, f"{location} > path variable '{pv['key']}'")
        )

    # Deduplicate
    secret_findings = deduplicate_findings(secret_findings)

    # ── Determine auth summary ──
    auth_summary = {}
    if auth:
        auth_type = auth.get("type", "unknown")
        auth_summary = {"type": auth_type}

    endpoints.append(
        {
            "name": name,
            "method": method,
            "url": raw_url,
            "folder_path": parent_path,
            "headers": headers,
            "body": body if body else {},
            "query_params": query_params,
            "path_variables": path_variables,
            "auth": auth_summary,
            "description": description,
            "secrets_detected": secret_findings,
            "has_secrets": len(secret_findings) > 0,
            "unresolved_variables": list(
                set(url_unresolved + header_unresolved + body_unresolved)
            ),
            "is_scannable": is_url_scannable(raw_url),
        }
    )

    return endpoints


# ─── Main Parser Entry Point ─────────────────────────────────────────────────


def parse_postman_collection(collection_json: dict) -> dict[str, Any]:
    """
    Parse a Postman Collection v2.0/v2.1 JSON object.

    Returns a structured result containing:
    - collection_name: Name of the collection
    - schema: Detected schema version
    - total_endpoints: Total number of API endpoints found
    - endpoints: List of extracted endpoint objects with secrets
    - scannable_urls: URLs that can be probed via HTTP
    - secret_findings: Aggregated deduplicated secret findings
    - summary: High-level statistics
    """
    info = collection_json.get("info", {})
    collection_name = info.get("name", "Unknown Collection")
    schema = info.get("schema", "")

    # Extract collection-level variables
    variables = extract_collection_variables(collection_json)

    # Recursively extract all endpoints
    items = collection_json.get("item", [])
    all_endpoints: list[dict[str, Any]] = []
    for item in items:
        all_endpoints.extend(_extract_request_from_item(item, variables))

    # Aggregate all secret findings
    all_secrets: list[dict[str, Any]] = []
    for ep in all_endpoints:
        for finding in ep.get("secrets_detected", []):
            finding["endpoint_name"] = ep["name"]
            finding["endpoint_url"] = ep["url"]
            all_secrets.append(finding)
    all_secrets = deduplicate_findings(all_secrets)

    # Build scannable URLs list
    scannable_urls = []
    for ep in all_endpoints:
        if ep["is_scannable"]:
            scannable_urls.append(
                {
                    "url": ep["url"],
                    "method": ep["method"],
                    "name": ep["name"],
                }
            )

    # Count by severity
    critical_count = sum(1 for s in all_secrets if s.get("severity") == "critical")
    high_count = sum(1 for s in all_secrets if s.get("severity") == "high")
    medium_count = sum(1 for s in all_secrets if s.get("severity") == "medium")
    low_count = sum(1 for s in all_secrets if s.get("severity") in ("low",))

    # Methods distribution
    methods_used: dict[str, int] = {}
    for ep in all_endpoints:
        m = ep["method"]
        methods_used[m] = methods_used.get(m, 0) + 1

    return {
        "collection_name": collection_name,
        "schema": schema,
        "total_endpoints": len(all_endpoints),
        "endpoints": all_endpoints,
        "scannable_urls": scannable_urls,
        "secret_findings": all_secrets,
        "secrets_exposed_count": len(all_secrets),
        "endpoints_with_secrets": sum(1 for ep in all_endpoints if ep["has_secrets"]),
        "endpoints_with_unresolved_vars": sum(
            1 for ep in all_endpoints if ep["unresolved_variables"]
        ),
        "variables_resolved": len(variables),
        "summary": {
            "critical_secrets": critical_count,
            "high_secrets": high_count,
            "medium_secrets": medium_count,
            "low_secrets": low_count,
            "total_scannable_urls": len(scannable_urls),
            "methods_distribution": methods_used,
        },
    }
