"""
OpenAPI Spec Parser Service — DevPulse
Parses OpenAPI 3.x specifications to extract API endpoints,
operations, parameters, and security requirements.

Handles:
- JSON and YAML formats
- OpenAPI 3.0.x and 3.1.x
- Path parameters, query parameters, request bodies
- Security schemes (API keys, OAuth2, HTTP auth)
"""

from __future__ import annotations

import json
import re
from typing import Any


def parse_openapi_spec(spec: dict[str, Any]) -> dict[str, Any]:
    """
    Parse an OpenAPI specification and extract all endpoints.

    Args:
        spec: Parsed OpenAPI JSON/YAML dict (already parsed, not raw string)

    Returns:
        Structured dict with endpoints, security schemes, and metadata
    """
    info = spec.get("info", {})
    openapi_version = spec.get("openapi", "")

    # Detect version
    version_major = 3
    if openapi_version.startswith("3.1"):
        version_major = 3.1
    elif openapi_version.startswith("3.0"):
        version_major = 3.0

    # Extract servers
    servers = _extract_servers(spec.get("servers", []))
    base_url = servers[0]["url"] if servers else ""

    # Extract paths and operations
    endpoints = []
    paths = spec.get("paths", {})

    for path, path_item in paths.items():
        if not path_item or not isinstance(path_item, dict):
            continue

        # Each HTTP method on this path
        methods = ["get", "post", "put", "patch", "delete", "head", "options", "trace"]

        for method in methods:
            operation = path_item.get(method)
            if not operation:
                continue

            op_id = operation.get("operationId") or f"{method}_{_sanitize_op_id(path)}"
            summary = operation.get("summary", "")
            description = operation.get("description", "")
            deprecated = operation.get("deprecated", False)

            # Parameters (path, query, header, cookie)
            params = _extract_parameters(operation.get("parameters", []))

            # Request body for POST/PUT/PATCH
            request_body = _extract_request_body(operation.get("requestBody"))

            # Responses
            responses = _extract_responses(operation.get("responses", {}))

            # Security requirements
            security = _extract_security(
                operation.get("security", []),
                spec.get("components", {}).get("securitySchemes", {}),
            )

            # Tags (for grouping)
            tags = operation.get("tags", [])

            endpoints.append(
                {
                    "path": path,
                    "method": method.upper(),
                    "operation_id": op_id,
                    "summary": summary,
                    "description": description,
                    "deprecated": deprecated,
                    "parameters": params,
                    "request_body": request_body,
                    "responses": responses,
                    "security": security,
                    "tags": tags,
                }
            )

    # Extract security schemes
    security_schemes = _extract_security_schemes(
        spec.get("components", {}).get("securitySchemes", {})
    )

    # Extract webhooks (OpenAPI 3.x)
    webhooks = []
    for name, webhook in spec.get("webhooks", {}).items():
        webhooks.append(
            {
                "name": name,
                "operations": _extract_webhook_operations(webhook),
            }
        )

    # Generate summary
    summary = _generate_summary(endpoints, info, security_schemes)

    return {
        "spec_info": {
            "title": info.get("title", "Untitled API"),
            "version": info.get("version", "1.0.0"),
            "description": info.get("description", ""),
            "openapi_version": openapi_version,
            "contact": info.get("contact", {}),
            "license": info.get("license", {}),
        },
        "servers": servers,
        "base_url": base_url,
        "endpoints": endpoints,
        "security_schemes": security_schemes,
        "webhooks": webhooks,
        "summary": summary,
    }


def _extract_servers(servers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Extract server URLs and variables."""
    result = []
    for srv in servers:
        url = srv.get("url", "")
        desc = srv.get("description", "")
        variables = srv.get("variables", {})

        # Resolve variables with defaults
        resolved_url = url
        for var_name, var_def in variables.items():
            default = var_def.get("default", "")
            resolved_url = resolved_url.replace(f"{{{var_name}}}", default)

        result.append(
            {
                "url": resolved_url,
                "description": desc,
                "variables": variables,
            }
        )
    return result


def _extract_parameters(params: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Extract parameter details."""
    result = []
    for p in params:
        result.append(
            {
                "name": p.get("name", ""),
                "in": p.get("in", ""),  # path, query, header, cookie
                "required": p.get("required", False),
                "description": p.get("description", ""),
                "deprecated": p.get("deprecated", False),
                "schema": p.get("schema", {}),
                "example": p.get("example"),
            }
        )
    return result


def _extract_request_body(request_body: dict[str, Any] | None) -> dict[str, Any] | None:
    """Extract request body schema and content types."""
    if not request_body:
        return None

    required = request_body.get("required", False)
    content = request_body.get("content", {})

    content_types = []
    schema = None

    for media_type, media_obj in content.items():
        content_types.append(media_type)
        if not schema and "schema" in media_obj:
            schema = media_obj["schema"]

    return {
        "required": required,
        "content_types": content_types,
        "schema": schema,
    }


def _extract_responses(responses: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract response schemas."""
    result = []
    for status_code, response in responses.items():
        desc = response.get("description", "")
        content = response.get("content", {})

        schemas = {}
        for media_type, media_obj in content.items():
            if "schema" in media_obj:
                schemas[media_type] = media_obj["schema"]

        result.append(
            {
                "status_code": status_code,
                "description": desc,
                "schemas": schemas,
            }
        )
    return result


def _extract_security(
    security_requirements: list[dict[str, Any]], schemes: dict[str, Any]
) -> list[dict[str, Any]]:
    """Extract security requirements with scheme details."""
    result = []
    for req in security_requirements:
        for scheme_name in req.keys():
            scheme = schemes.get(scheme_name, {})
            if scheme:
                result.append(
                    {
                        "scheme_name": scheme_name,
                        "type": scheme.get("type", ""),
                        "scheme": scheme.get("scheme", ""),
                        "flows": scheme.get("flows", {}),
                    }
                )
    return result


def _extract_security_schemes(schemes: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract all security scheme definitions."""
    result = []
    for name, scheme in schemes.items():
        result.append(
            {
                "name": name,
                "type": scheme.get("type", ""),
                "description": scheme.get("description", ""),
                "scheme": scheme.get("scheme", ""),
                "flows": scheme.get("flows", {}),
                "api_key_name": scheme.get("name", ""),
                "in": scheme.get("in", ""),
            }
        )
    return result


def _extract_webhook_operations(webhook: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract webhook operation details."""
    ops = []
    methods = ["get", "post", "put", "patch", "delete"]
    for method in methods:
        if method in webhook:
            op = webhook[method]
            ops.append(
                {
                    "method": method.upper(),
                    "operation_id": op.get("operationId", ""),
                    "summary": op.get("summary", ""),
                }
            )
    return ops


def _sanitize_op_id(path: str) -> str:
    """Convert path to a valid operation ID component."""
    # Remove slashes, braces, dots
    sanitized = re.sub(r"[/{}.-]", "_", path)
    sanitized = re.sub(r"_+", "_", sanitized)
    return sanitized.strip("_").lower()


def _generate_summary(
    endpoints: list[dict], info: dict, security_schemes: list[dict]
) -> dict[str, Any]:
    """Generate summary statistics from parsed spec."""
    methods_count: dict[str, int] = {}
    tags_count: dict[str, int] = {}
    auth_types: set[str] = set()

    for ep in endpoints:
        method = ep["method"]
        methods_count[method] = methods_count.get(method, 0) + 1

        for tag in ep.get("tags", []):
            tags_count[tag] = tags_count.get(tag, 0) + 1

        for sec in ep.get("security", []):
            auth_types.add(sec.get("type", "unknown"))

    return {
        "total_endpoints": len(endpoints),
        "methods": methods_count,
        "top_tags": sorted(tags_count.items(), key=lambda x: -x[1])[:10],
        "auth_types": list(auth_types),
        "total_security_schemes": len(security_schemes),
    }
