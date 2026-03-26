"""
Shadow API Discovery Engine — DevPulse Patent 3
Method for Shadow API Endpoint Discovery Through Correlation of IDE Static Route
Extraction and Local Development Traffic Signatures.

Patent: NHCE/DEV/2026/003

Novel method: Correlates statically-extracted routes from source code (5 frameworks)
with observed local development traffic to identify undocumented/shadow API endpoints.
Distinguished from enterprise tools (Salt Security, Noname) by:
- Operating at IDE/development level, not production network
- Using local traffic, not production traffic
- Requiring zero network infrastructure
- Accessible at <$100/month vs $2000+/month enterprise tools
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

# ── Framework Route Extraction Patterns ──────────────────────────────────────
# Patent 3 core: static route extraction from 5 web frameworks

FRAMEWORK_PATTERNS = {
    "fastapi": [
        # @app.get("/path"), @router.post("/path/{id}")
        r'@(?:app|router)\.(get|post|put|patch|delete|head|options)\s*\(\s*["\']([^"\']+)["\']',
        # @app.api_route("/path", methods=["GET"])
        r'@(?:app|router)\.api_route\s*\(\s*["\']([^"\']+)["\']',
    ],
    "flask": [
        # @app.route("/path", methods=["GET", "POST"])
        r'@(?:app|blueprint)\s*\.route\s*\(\s*["\']([^"\']+)["\'](?:.*?methods\s*=\s*\[([^\]]+)\])?',
        # @app.get("/path")
        r'@(?:app|blueprint)\.(get|post|put|patch|delete)\s*\(\s*["\']([^"\']+)["\']',
    ],
    "express": [
        # app.get('/path', handler), router.post('/path/:id', handler)
        r'(?:app|router)\.(get|post|put|patch|delete|all)\s*\(\s*["\']([^"\']+)["\']',
        # router.use('/path', ...)
        r'(?:app|router)\.use\s*\(\s*["\']([^"\']+)["\']',
    ],
    "django": [
        # path('endpoint/', view), re_path(r'^endpoint/$', view)
        r'(?:path|re_path)\s*\(\s*["\']([^"\']+)["\']',
        # url(r'^endpoint/$', view)
        r'url\s*\(\s*r?["\']([^"\']+)["\']',
    ],
    "nextjs": [
        # export default function handler in pages/api/...
        # Route inferred from file path pattern: pages/api/[...].ts
        r'export\s+(?:default\s+)?(?:async\s+)?function\s+(?:handler|GET|POST|PUT|PATCH|DELETE)',
        # app/api/route/route.ts exports
        r'export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)',
    ],
    "spring": [
        # @GetMapping("/path"), @PostMapping("/path/{id}")
        r'@(?:Get|Post|Put|Patch|Delete|Request)Mapping\s*(?:\(\s*(?:value\s*=\s*)?["\']([^"\']+)["\'])?',
    ],
}

# HTTP methods for normalization
HTTP_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}


def extract_routes_from_source(
    source_code: str,
    framework: str,
    file_path: str = "unknown",
) -> list[dict[str, Any]]:
    """
    PATENT 3 CORE ALGORITHM STEP 1: Static Route Extraction
    
    Extracts API route definitions from source code using framework-specific
    regex patterns. Supports FastAPI, Flask, Express, Django, Next.js, Spring.
    
    Args:
        source_code: Raw source code content
        framework: One of fastapi, flask, express, django, nextjs, spring
        file_path: Source file path for inventory tracking
    
    Returns:
        List of extracted route definitions with method, path, framework, file
    """
    routes = []
    patterns = FRAMEWORK_PATTERNS.get(framework.lower(), [])
    
    for pattern in patterns:
        matches = re.finditer(pattern, source_code, re.IGNORECASE | re.MULTILINE)
        for match in matches:
            groups = [g for g in match.groups() if g]
            if not groups:
                continue
            
            # Extract method and path from match groups
            method = "GET"
            path = ""
            
            for g in groups:
                g_upper = g.upper().strip()
                if g_upper in HTTP_METHODS:
                    method = g_upper
                elif g.startswith("/") or "{" in g or "<" in g:
                    path = g.strip()
            
            if not path and groups:
                # Last resort: use first group as path
                path = groups[-1].strip()
            
            if path:
                # Normalize path: convert framework-specific params to {param}
                normalized = _normalize_path(path, framework)
                routes.append({
                    "method": method,
                    "path": normalized,
                    "raw_path": path,
                    "framework": framework,
                    "file": file_path,
                    "extraction_method": "static_ast",
                })
    
    return routes


def _normalize_path(path: str, framework: str) -> str:
    """Normalize path parameters to unified {param} format."""
    # Flask/Werkzeug: <type:name> -> {name}
    path = re.sub(r"<(?:[^:>]+:)?([^>]+)>", r"{\1}", path)
    # Express: :param -> {param}
    path = re.sub(r":([a-zA-Z_][a-zA-Z0-9_]*)", r"{\1}", path)
    # Django regex patterns: (?P<name>...) -> {name}
    path = re.sub(r"\(\?P<([^>]+)>[^)]+\)", r"{\1}", path)
    # Remove trailing slashes for comparison
    path = path.rstrip("/") or "/"
    return path


def correlate_with_traffic(
    static_routes: list[dict[str, Any]],
    observed_traffic: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    PATENT 3 CORE ALGORITHM STEP 2: Static-Dynamic Correlation
    
    Correlates statically-extracted routes with observed local development traffic
    to identify:
    1. Documented routes (in source AND in traffic) — confirmed active
    2. Shadow endpoints (in traffic but NOT in source) — undocumented/shadow APIs
    3. Dead routes (in source but NOT in traffic) — potentially unused
    
    This is the novel correlation method that distinguishes Patent 3 from
    enterprise tools that only use production traffic analysis.
    
    Args:
        static_routes: Routes extracted from source code
        observed_traffic: Traffic observations from local dev proxy/logs
    
    Returns:
        Correlation result with shadow endpoints identified
    """
    # Build lookup sets for O(1) matching
    static_set: set[str] = set()
    static_map: dict[str, dict[str, Any]] = {}
    
    for route in static_routes:
        key = _route_key(route["method"], route["path"])
        static_set.add(key)
        static_map[key] = route
    
    traffic_set: set[str] = set()
    traffic_map: dict[str, dict[str, Any]] = {}
    
    for traffic in observed_traffic:
        # Normalize observed traffic path (strip query params)
        clean_path = traffic["path"].split("?")[0].rstrip("/") or "/"
        # Try to match against known static routes (handle path params)
        matched_key = _match_traffic_to_route(traffic["method"], clean_path, static_set, static_map)
        if matched_key:
            traffic_set.add(matched_key)
            traffic_map[matched_key] = {**traffic, "matched_static": True}
        else:
            # This is a shadow endpoint — observed in traffic but not in source
            shadow_key = _route_key(traffic["method"], clean_path)
            traffic_set.add(shadow_key)
            traffic_map[shadow_key] = {**traffic, "matched_static": False, "path": clean_path}
    
    # Classify endpoints
    documented_active = []
    shadow_endpoints = []
    dead_routes = []
    
    for key, route in static_map.items():
        if key in traffic_set:
            documented_active.append({
                **route,
                "status": "documented_active",
                "traffic_count": traffic_map.get(key, {}).get("count", 0),
            })
        else:
            dead_routes.append({
                **route,
                "status": "dead_route",
                "traffic_count": 0,
            })
    
    for key, traffic in traffic_map.items():
        if not traffic.get("matched_static", True):
            shadow_endpoints.append({
                "method": traffic["method"],
                "path": traffic["path"],
                "status": "shadow_endpoint",
                "traffic_count": traffic.get("count", 1),
                "last_seen": traffic.get("last_seen", datetime.now(timezone.utc).isoformat()),
                "risk_level": _assess_shadow_risk(traffic["path"], traffic["method"]),
                "framework": "unknown",
                "file": "not_in_source",
                "extraction_method": "traffic_correlation",
            })
    
    return {
        "documented_active": documented_active,
        "shadow_endpoints": shadow_endpoints,
        "dead_routes": dead_routes,
        "summary": {
            "total_static_routes": len(static_routes),
            "total_traffic_paths": len(observed_traffic),
            "documented_active_count": len(documented_active),
            "shadow_endpoint_count": len(shadow_endpoints),
            "dead_route_count": len(dead_routes),
            "shadow_risk_score": _calculate_shadow_risk_score(shadow_endpoints),
        },
    }


def _route_key(method: str, path: str) -> str:
    """Create a normalized lookup key for a route."""
    return f"{method.upper()}:{path.lower()}"


def _match_traffic_to_route(
    method: str,
    observed_path: str,
    static_set: set[str],
    static_map: dict[str, dict[str, Any]],
) -> str | None:
    """
    Match an observed traffic path to a static route, handling path parameters.
    e.g., /users/123 matches /users/{id}
    """
    # Direct match first
    direct_key = _route_key(method, observed_path)
    if direct_key in static_set:
        return direct_key
    
    # Try parametric matching
    observed_segments = observed_path.split("/")
    
    for key, route in static_map.items():
        if not key.startswith(method.upper() + ":"):
            continue
        route_segments = route["path"].split("/")
        if len(route_segments) != len(observed_segments):
            continue
        
        match = True
        for r_seg, o_seg in zip(route_segments, observed_segments):
            if r_seg.startswith("{") and r_seg.endswith("}"):
                continue  # Path parameter — matches anything
            if r_seg.lower() != o_seg.lower():
                match = False
                break
        
        if match:
            return key
    
    return None


def _assess_shadow_risk(path: str, method: str) -> str:
    """Assess risk level of a shadow endpoint based on path and method patterns."""
    path_lower = path.lower()
    
    # High-risk patterns
    high_risk_patterns = [
        "admin", "internal", "debug", "test", "dev", "staging",
        "secret", "private", "config", "settings", "env",
        "backup", "export", "import", "upload", "download",
        "token", "auth", "login", "password", "key", "credential",
    ]
    
    for pattern in high_risk_patterns:
        if pattern in path_lower:
            return "high"
    
    # Medium risk: write operations on unknown endpoints
    if method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
        return "medium"
    
    return "low"


def _calculate_shadow_risk_score(shadow_endpoints: list[dict[str, Any]]) -> int:
    """Calculate overall shadow API risk score (0-100)."""
    if not shadow_endpoints:
        return 0
    
    score = 0
    for ep in shadow_endpoints:
        risk = ep.get("risk_level", "low")
        if risk == "high":
            score += 30
        elif risk == "medium":
            score += 15
        else:
            score += 5
    
    return min(score, 100)


def build_api_inventory(
    user_id: str,
    project_name: str,
    correlation_result: dict[str, Any],
) -> dict[str, Any]:
    """
    Build a complete API inventory record from correlation results.
    This is the output artifact of Patent 3 — a structured inventory
    of all API endpoints with their discovery status and risk classification.
    """
    now = datetime.now(timezone.utc).isoformat()
    
    all_endpoints = []
    
    for ep in correlation_result["documented_active"]:
        all_endpoints.append({
            "id": str(uuid4()),
            "user_id": user_id,
            "project_name": project_name,
            "method": ep["method"],
            "path": ep["path"],
            "status": "documented_active",
            "risk_level": "low",
            "framework": ep.get("framework", "unknown"),
            "source_file": ep.get("file", "unknown"),
            "traffic_count": ep.get("traffic_count", 0),
            "discovery_method": "static_extraction",
            "discovered_at": now,
            "last_seen": now,
        })
    
    for ep in correlation_result["shadow_endpoints"]:
        all_endpoints.append({
            "id": str(uuid4()),
            "user_id": user_id,
            "project_name": project_name,
            "method": ep["method"],
            "path": ep["path"],
            "status": "shadow_endpoint",
            "risk_level": ep.get("risk_level", "medium"),
            "framework": "unknown",
            "source_file": "not_in_source",
            "traffic_count": ep.get("traffic_count", 1),
            "discovery_method": "traffic_correlation",
            "discovered_at": now,
            "last_seen": ep.get("last_seen", now),
        })
    
    for ep in correlation_result["dead_routes"]:
        all_endpoints.append({
            "id": str(uuid4()),
            "user_id": user_id,
            "project_name": project_name,
            "method": ep["method"],
            "path": ep["path"],
            "status": "dead_route",
            "risk_level": "info",
            "framework": ep.get("framework", "unknown"),
            "source_file": ep.get("file", "unknown"),
            "traffic_count": 0,
            "discovery_method": "static_extraction",
            "discovered_at": now,
            "last_seen": None,
        })
    
    return {
        "inventory_id": str(uuid4()),
        "user_id": user_id,
        "project_name": project_name,
        "generated_at": now,
        "endpoints": all_endpoints,
        "summary": correlation_result["summary"],
    }
