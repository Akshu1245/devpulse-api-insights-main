"""
Postman Collection v2.1 Parser — DevPulse Patent 1 Component
Parses Postman Collection JSON, extracts all API endpoints,
detects credential leaks, and triggers OWASP security scans.
"""
from __future__ import annotations

import json
import re
from typing import Any

# Patterns for credential/secret detection in Postman collections
SECRET_PATTERNS = [
    (re.compile(r'(?i)(api[_-]?key|apikey)\s*[:=]\s*["\']?([A-Za-z0-9_\-]{16,})["\']?'), "API Key"),
    (re.compile(r'(?i)(secret[_-]?key|secret)\s*[:=]\s*["\']?([A-Za-z0-9_\-]{16,})["\']?'), "Secret Key"),
    (re.compile(r'(?i)(bearer\s+)([A-Za-z0-9\-._~+/]+=*)'), "Bearer Token"),
    (re.compile(r'(?i)(authorization)\s*[:=]\s*["\']?(Basic\s+[A-Za-z0-9+/=]+)["\']?'), "Basic Auth"),
    (re.compile(r'sk-[A-Za-z0-9]{32,}'), "OpenAI API Key"),
    (re.compile(r'(?i)(razorpay[_-]?key|rzp_)[A-Za-z0-9_]{16,}'), "Razorpay Key"),
    (re.compile(r'(?i)(aws[_-]?access[_-]?key[_-]?id)\s*[:=]\s*["\']?([A-Z0-9]{20})["\']?'), "AWS Access Key"),
    (re.compile(r'(?i)(aws[_-]?secret[_-]?access[_-]?key)\s*[:=]\s*["\']?([A-Za-z0-9/+=]{40})["\']?'), "AWS Secret"),
    (re.compile(r'ghp_[A-Za-z0-9]{36}'), "GitHub Personal Access Token"),
    (re.compile(r'(?i)(password|passwd|pwd)\s*[:=]\s*["\']?([^\s"\']{8,})["\']?'), "Password"),
    (re.compile(r'(?i)(new[_-]?relic[_-]?key|newrelic)\s*[:=]\s*["\']?([A-Za-z0-9_\-]{20,})["\']?'), "New Relic Key"),
    (re.compile(r'(?i)(stripe[_-]?key|sk_live_|pk_live_)[A-Za-z0-9]{24,}'), "Stripe Key"),
]


def _scan_string_for_secrets(text: str, location: str) -> list[dict[str, str]]:
    """Scan a string for credential patterns and return findings."""
    findings = []
    for pattern, label in SECRET_PATTERNS:
        matches = pattern.findall(text)
        if matches:
            findings.append({
                "type": label,
                "location": location,
                "severity": "critical",
                "detail": f"Potential {label} found in {location}",
                "recommendation": f"Remove {label} from collection. Use environment variables instead. Rotate this credential immediately.",
            })
    return findings


def _extract_headers_secrets(headers: list[dict], location: str) -> list[dict[str, str]]:
    """Extract secrets from header key-value pairs."""
    findings = []
    for h in headers:
        key = str(h.get("key", ""))
        value = str(h.get("value", ""))
        combined = f"{key}: {value}"
        findings.extend(_scan_string_for_secrets(combined, f"{location} > header '{key}'"))
    return findings


def _extract_endpoints_from_item(item: dict, parent_path: str = "") -> list[dict[str, Any]]:
    """Recursively extract endpoints from Postman collection items."""
    endpoints = []

    # If item has sub-items (folder), recurse
    if "item" in item:
        folder_name = item.get("name", "")
        path = f"{parent_path}/{folder_name}" if parent_path else folder_name
        for sub_item in item["item"]:
            endpoints.extend(_extract_endpoints_from_item(sub_item, path))
        return endpoints

    # Leaf item — extract request
    request = item.get("request")
    if not request:
        return endpoints

    # Handle both string and object URL formats
    url_obj = request.get("url", {})
    if isinstance(url_obj, str):
        raw_url = url_obj
    elif isinstance(url_obj, dict):
        raw_url = url_obj.get("raw", "")
        if not raw_url:
            # Reconstruct from parts
            protocol = url_obj.get("protocol", "https")
            host = ".".join(url_obj.get("host", []))
            path_parts = "/".join(url_obj.get("path", []))
            raw_url = f"{protocol}://{host}/{path_parts}"
    else:
        raw_url = ""

    method = str(request.get("method", "GET")).upper()
    name = item.get("name", raw_url)
    headers = request.get("header", [])
    body = request.get("body", {})

    # Collect credential findings
    credential_findings = []

    # Scan URL for secrets
    credential_findings.extend(_scan_string_for_secrets(raw_url, f"URL of '{name}'"))

    # Scan headers
    credential_findings.extend(_extract_headers_secrets(headers, f"request '{name}'"))

    # Scan body
    if body:
        body_mode = body.get("mode", "")
        if body_mode == "raw":
            raw_body = body.get("raw", "")
            credential_findings.extend(_scan_string_for_secrets(raw_body, f"body of '{name}'"))
        elif body_mode == "urlencoded":
            for param in body.get("urlencoded", []):
                val = f"{param.get('key', '')}={param.get('value', '')}"
                credential_findings.extend(_scan_string_for_secrets(val, f"body param of '{name}'"))

    # Scan auth block
    auth = request.get("auth", {})
    if auth:
        auth_str = json.dumps(auth)
        credential_findings.extend(_scan_string_for_secrets(auth_str, f"auth block of '{name}'"))

    endpoints.append({
        "name": name,
        "url": raw_url,
        "method": method,
        "folder_path": parent_path,
        "headers": headers,
        "credential_findings": credential_findings,
        "has_credentials_exposed": len(credential_findings) > 0,
    })

    return endpoints


def parse_postman_collection(collection_json: dict) -> dict[str, Any]:
    """
    Parse a Postman Collection v2.1 JSON object.
    Returns extracted endpoints with credential findings.
    """
    info = collection_json.get("info", {})
    collection_name = info.get("name", "Unknown Collection")
    schema = info.get("schema", "")

    # Support both v2.0 and v2.1
    if "v2" not in schema and "collection" not in schema.lower():
        # Try to parse anyway
        pass

    items = collection_json.get("item", [])
    all_endpoints = []
    for item in items:
        all_endpoints.extend(_extract_endpoints_from_item(item))

    # Aggregate credential findings
    all_credential_findings = []
    for ep in all_endpoints:
        all_credential_findings.extend(ep.get("credential_findings", []))

    # Deduplicate by type+location
    seen = set()
    unique_findings = []
    for f in all_credential_findings:
        key = f"{f['type']}:{f['location']}"
        if key not in seen:
            seen.add(key)
            unique_findings.append(f)

    # Extract scannable URLs (filter out template variables like {{baseUrl}})
    scannable_urls = []
    for ep in all_endpoints:
        url = ep["url"]
        # Skip template-only URLs
        if url and not url.startswith("{{") and "{{" not in url.split("?")[0].split("/")[2] if len(url.split("/")) > 2 else True:
            if url.startswith(("http://", "https://")):
                scannable_urls.append({
                    "url": url,
                    "method": ep["method"],
                    "name": ep["name"],
                })

    return {
        "collection_name": collection_name,
        "schema": schema,
        "total_endpoints": len(all_endpoints),
        "endpoints": all_endpoints,
        "scannable_urls": scannable_urls,
        "credential_findings": unique_findings,
        "credentials_exposed_count": len(unique_findings),
        "endpoints_with_credentials": sum(1 for ep in all_endpoints if ep["has_credentials_exposed"]),
        "summary": {
            "critical_findings": len([f for f in unique_findings if f["severity"] == "critical"]),
            "high_findings": len([f for f in unique_findings if f["severity"] == "high"]),
            "total_scannable": len(scannable_urls),
        }
    }
Postman Collection v2.1 Parser — DevPulse Patent 1 Component
Parses Postman Collection JSON, extracts all API endpoints,
detects credential leaks, and triggers OWASP security scans.
"""
from __future__ import annotations

import json
import re
from typing import Any

# Patterns for credential/secret detection in Postman collections
SECRET_PATTERNS = [
    (re.compile(r'(?i)(api[_-]?key|apikey)\s*[:=]\s*["\']?([A-Za-z0-9_\-]{16,})["\']?'), "API Key"),
    (re.compile(r'(?i)(secret[_-]?key|secret)\s*[:=]\s*["\']?([A-Za-z0-9_\-]{16,})["\']?'), "Secret Key"),
    (re.compile(r'(?i)(bearer\s+)([A-Za-z0-9\-._~+/]+=*)'), "Bearer Token"),
    (re.compile(r'(?i)(authorization)\s*[:=]\s*["\']?(Basic\s+[A-Za-z0-9+/=]+)["\']?'), "Basic Auth"),
    (re.compile(r'sk-[A-Za-z0-9]{32,}'), "OpenAI API Key"),
    (re.compile(r'(?i)(razorpay[_-]?key|rzp_)[A-Za-z0-9_]{16,}'), "Razorpay Key"),
    (re.compile(r'(?i)(aws[_-]?access[_-]?key[_-]?id)\s*[:=]\s*["\']?([A-Z0-9]{20})["\']?'), "AWS Access Key"),
    (re.compile(r'(?i)(aws[_-]?secret[_-]?access[_-]?key)\s*[:=]\s*["\']?([A-Za-z0-9/+=]{40})["\']?'), "AWS Secret"),
    (re.compile(r'ghp_[A-Za-z0-9]{36}'), "GitHub Personal Access Token"),
    (re.compile(r'(?i)(password|passwd|pwd)\s*[:=]\s*["\']?([^\s"\']{8,})["\']?'), "Password"),
    (re.compile(r'(?i)(new[_-]?relic[_-]?key|newrelic)\s*[:=]\s*["\']?([A-Za-z0-9_\-]{20,})["\']?'), "New Relic Key"),
    (re.compile(r'(?i)(stripe[_-]?key|sk_live_|pk_live_)[A-Za-z0-9]{24,}'), "Stripe Key"),
]


def _scan_string_for_secrets(text: str, location: str) -> list[dict[str, str]]:
    """Scan a string for credential patterns and return findings."""
    findings = []
    for pattern, label in SECRET_PATTERNS:
        matches = pattern.findall(text)
        if matches:
            findings.append({
                "type": label,
                "location": location,
                "severity": "critical",
                "detail": f"Potential {label} found in {location}",
                "recommendation": f"Remove {label} from collection. Use environment variables instead. Rotate this credential immediately.",
            })
    return findings


def _extract_headers_secrets(headers: list[dict], location: str) -> list[dict[str, str]]:
    """Extract secrets from header key-value pairs."""
    findings = []
    for h in headers:
        key = str(h.get("key", ""))
        value = str(h.get("value", ""))
        combined = f"{key}: {value}"
        findings.extend(_scan_string_for_secrets(combined, f"{location} > header '{key}'"))
    return findings


def _extract_endpoints_from_item(item: dict, parent_path: str = "") -> list[dict[str, Any]]:
    """Recursively extract endpoints from Postman collection items."""
    endpoints = []

    # If item has sub-items (folder), recurse
    if "item" in item:
        folder_name = item.get("name", "")
        path = f"{parent_path}/{folder_name}" if parent_path else folder_name
        for sub_item in item["item"]:
            endpoints.extend(_extract_endpoints_from_item(sub_item, path))
        return endpoints

    # Leaf item — extract request
    request = item.get("request")
    if not request:
        return endpoints

    # Handle both string and object URL formats
    url_obj = request.get("url", {})
    if isinstance(url_obj, str):
        raw_url = url_obj
    elif isinstance(url_obj, dict):
        raw_url = url_obj.get("raw", "")
        if not raw_url:
            # Reconstruct from parts
            protocol = url_obj.get("protocol", "https")
            host = ".".join(url_obj.get("host", []))
            path_parts = "/".join(url_obj.get("path", []))
            raw_url = f"{protocol}://{host}/{path_parts}"
    else:
        raw_url = ""

    method = str(request.get("method", "GET")).upper()
    name = item.get("name", raw_url)
    headers = request.get("header", [])
    body = request.get("body", {})

    # Collect credential findings
    credential_findings = []

    # Scan URL for secrets
    credential_findings.extend(_scan_string_for_secrets(raw_url, f"URL of '{name}'"))

    # Scan headers
    credential_findings.extend(_extract_headers_secrets(headers, f"request '{name}'"))

    # Scan body
    if body:
        body_mode = body.get("mode", "")
        if body_mode == "raw":
            raw_body = body.get("raw", "")
            credential_findings.extend(_scan_string_for_secrets(raw_body, f"body of '{name}'"))
        elif body_mode == "urlencoded":
            for param in body.get("urlencoded", []):
                val = f"{param.get('key', '')}={param.get('value', '')}"
                credential_findings.extend(_scan_string_for_secrets(val, f"body param of '{name}'"))

    # Scan auth block
    auth = request.get("auth", {})
    if auth:
        auth_str = json.dumps(auth)
        credential_findings.extend(_scan_string_for_secrets(auth_str, f"auth block of '{name}'"))

    endpoints.append({
        "name": name,
        "url": raw_url,
        "method": method,
        "folder_path": parent_path,
        "headers": headers,
        "credential_findings": credential_findings,
        "has_credentials_exposed": len(credential_findings) > 0,
    })

    return endpoints


def parse_postman_collection(collection_json: dict) -> dict[str, Any]:
    """
    Parse a Postman Collection v2.1 JSON object.
    Returns extracted endpoints with credential findings.
    """
    info = collection_json.get("info", {})
    collection_name = info.get("name", "Unknown Collection")
    schema = info.get("schema", "")

    # Support both v2.0 and v2.1
    if "v2" not in schema and "collection" not in schema.lower():
        # Try to parse anyway
        pass

    items = collection_json.get("item", [])
    all_endpoints = []
    for item in items:
        all_endpoints.extend(_extract_endpoints_from_item(item))

    # Aggregate credential findings
    all_credential_findings = []
    for ep in all_endpoints:
        all_credential_findings.extend(ep.get("credential_findings", []))

    # Deduplicate by type+location
    seen = set()
    unique_findings = []
    for f in all_credential_findings:
        key = f"{f['type']}:{f['location']}"
        if key not in seen:
            seen.add(key)
            unique_findings.append(f)

    # Extract scannable URLs (filter out template variables like {{baseUrl}})
    scannable_urls = []
    for ep in all_endpoints:
        url = ep["url"]
        # Skip template-only URLs
        if url and not url.startswith("{{") and "{{" not in url.split("?")[0].split("/")[2] if len(url.split("/")) > 2 else True:
            if url.startswith(("http://", "https://")):
                scannable_urls.append({
                    "url": url,
                    "method": ep["method"],
                    "name": ep["name"],
                })

    return {
        "collection_name": collection_name,
        "schema": schema,
        "total_endpoints": len(all_endpoints),
        "endpoints": all_endpoints,
        "scannable_urls": scannable_urls,
        "credential_findings": unique_findings,
        "credentials_exposed_count": len(unique_findings),
        "endpoints_with_credentials": sum(1 for ep in all_endpoints if ep["has_credentials_exposed"]),
        "summary": {
            "critical_findings": len([f for f in unique_findings if f["severity"] == "critical"]),
            "high_findings": len([f for f in unique_findings if f["severity"] == "high"]),
            "total_scannable": len(scannable_urls),
        }
    }

