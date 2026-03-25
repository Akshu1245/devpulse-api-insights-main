"""
Shadow API Discovery Router — DevPulse Patent 3
FastAPI router exposing the shadow API discovery endpoints.

Patent: NHCE/DEV/2026/003
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from services.auth_guard import require_auth
from services.shadow_api import (
    build_api_inventory,
    correlate_with_traffic,
    extract_routes_from_source,
)
from services.supabase_client import get_supabase

router = APIRouter(prefix="/shadow-api", tags=["shadow-api"])


# ── Request / Response Models ─────────────────────────────────────────────────

class SourceCodeRoute(BaseModel):
    file: str
    route: str
    method: str = "GET"
    framework: str = "fastapi"
    source_code: str | None = None  # Optional raw source for server-side extraction


class TrafficObservation(BaseModel):
    path: str
    method: str
    count: int = 1
    last_seen: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class DiscoverRequest(BaseModel):
    user_id: str
    project_name: str
    source_code_routes: list[SourceCodeRoute] = Field(default_factory=list)
    observed_traffic: list[TrafficObservation] = Field(default_factory=list)
    # Optional: raw source files for server-side extraction
    source_files: list[dict[str, str]] | None = None  # [{"path": "...", "content": "...", "framework": "..."}]


class ResolveRequest(BaseModel):
    user_id: str
    resolution: str  # "documented", "deprecated", "false_positive", "security_risk"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/discover")
async def discover_shadow_apis(
    body: DiscoverRequest,
    _auth: dict = Depends(require_auth),
) -> dict[str, Any]:
    """
    PATENT 3 CORE ENDPOINT: Shadow API Discovery
    
    Accepts source code routes (statically extracted by VS Code extension)
    and observed local development traffic, then correlates them to identify
    shadow API endpoints — routes that appear in traffic but not in source code.
    
    Also accepts raw source files for server-side route extraction.
    """
    supabase = get_supabase()
    
    # Step 1: Build static routes list
    static_routes = []
    
    # From pre-extracted routes (sent by VS Code extension)
    for sr in body.source_code_routes:
        static_routes.append({
            "method": sr.method.upper(),
            "path": sr.route,
            "framework": sr.framework,
            "file": sr.file,
            "extraction_method": "client_static",
        })
    
    # From raw source files (server-side extraction)
    if body.source_files:
        for sf in body.source_files:
            extracted = extract_routes_from_source(
                source_code=sf.get("content", ""),
                framework=sf.get("framework", "fastapi"),
                file_path=sf.get("path", "unknown"),
            )
            static_routes.extend(extracted)
    
    # Step 2: Build traffic observations list
    traffic_observations = [
        {
            "method": t.method.upper(),
            "path": t.path,
            "count": t.count,
            "last_seen": t.last_seen,
        }
        for t in body.observed_traffic
    ]
    
    # Step 3: Correlate static routes with traffic (Patent 3 core algorithm)
    correlation = correlate_with_traffic(static_routes, traffic_observations)
    
    # Step 4: Build structured inventory
    inventory = build_api_inventory(
        user_id=body.user_id,
        project_name=body.project_name,
        correlation_result=correlation,
    )
    
    # Step 5: Persist to Supabase
    try:
        # Upsert inventory record
        supabase.table("shadow_api_inventories").upsert({
            "id": inventory["inventory_id"],
            "user_id": body.user_id,
            "project_name": body.project_name,
            "generated_at": inventory["generated_at"],
            "summary": inventory["summary"],
            "endpoint_count": len(inventory["endpoints"]),
            "shadow_count": inventory["summary"]["shadow_endpoint_count"],
            "shadow_risk_score": inventory["summary"]["shadow_risk_score"],
        }).execute()
        
        # Insert endpoints (delete old ones for this project first)
        if inventory["endpoints"]:
            supabase.table("shadow_api_endpoints").delete().eq(
                "user_id", body.user_id
            ).eq("project_name", body.project_name).execute()
            
            supabase.table("shadow_api_endpoints").insert(inventory["endpoints"]).execute()
    except Exception:
        # Non-fatal: return results even if persistence fails
        pass
    
    return {
        "inventory_id": inventory["inventory_id"],
        "project_name": body.project_name,
        "summary": inventory["summary"],
        "shadow_endpoints": correlation["shadow_endpoints"],
        "documented_active": correlation["documented_active"],
        "dead_routes": correlation["dead_routes"],
        "generated_at": inventory["generated_at"],
    }


@router.get("/inventory/{user_id}")
async def get_shadow_api_inventory(
    user_id: str,
    _auth: dict = Depends(require_auth),
) -> dict[str, Any]:
    """Get the full API inventory for a user across all projects."""
    supabase = get_supabase()
    
    try:
        endpoints_res = supabase.table("shadow_api_endpoints").select("*").eq(
            "user_id", user_id
        ).order("discovered_at", desc=True).execute()
        
        endpoints = endpoints_res.data or []
        
        # Group by project
        projects: dict[str, list] = {}
        for ep in endpoints:
            proj = ep.get("project_name", "default")
            if proj not in projects:
                projects[proj] = []
            projects[proj].append(ep)
        
        return {
            "user_id": user_id,
            "total_endpoints": len(endpoints),
            "shadow_count": sum(1 for e in endpoints if e.get("status") == "shadow_endpoint"),
            "projects": [
                {
                    "name": proj,
                    "endpoints": eps,
                    "shadow_count": sum(1 for e in eps if e.get("status") == "shadow_endpoint"),
                }
                for proj, eps in projects.items()
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/{user_id}")
async def get_shadow_api_stats(
    user_id: str,
    _auth: dict = Depends(require_auth),
) -> dict[str, Any]:
    """Get shadow API discovery statistics for a user."""
    supabase = get_supabase()
    
    try:
        inventories_res = supabase.table("shadow_api_inventories").select("*").eq(
            "user_id", user_id
        ).order("generated_at", desc=True).limit(10).execute()
        
        inventories = inventories_res.data or []
        
        endpoints_res = supabase.table("shadow_api_endpoints").select("*").eq(
            "user_id", user_id
        ).execute()
        
        endpoints = endpoints_res.data or []
        
        shadow_eps = [e for e in endpoints if e.get("status") == "shadow_endpoint"]
        high_risk = [e for e in shadow_eps if e.get("risk_level") == "high"]
        medium_risk = [e for e in shadow_eps if e.get("risk_level") == "medium"]
        
        return {
            "user_id": user_id,
            "total_endpoints_discovered": len(endpoints),
            "shadow_endpoints_found": len(shadow_eps),
            "high_risk_shadow": len(high_risk),
            "medium_risk_shadow": len(medium_risk),
            "low_risk_shadow": len(shadow_eps) - len(high_risk) - len(medium_risk),
            "projects_scanned": len(set(e.get("project_name", "") for e in endpoints)),
            "last_scan": inventories[0]["generated_at"] if inventories else None,
            "scan_history": [
                {
                    "scan_id": inv["id"],
                    "project": inv["project_name"],
                    "shadow_count": inv.get("shadow_count", 0),
                    "risk_score": inv.get("shadow_risk_score", 0),
                    "scanned_at": inv["generated_at"],
                }
                for inv in inventories
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/resolve/{endpoint_id}")
async def resolve_shadow_endpoint(
    endpoint_id: str,
    body: ResolveRequest,
    _auth: dict = Depends(require_auth),
) -> dict[str, Any]:
    """
    Mark a shadow endpoint as resolved with a classification.
    Resolutions: documented, deprecated, false_positive, security_risk
    """
    supabase = get_supabase()
    
    valid_resolutions = {"documented", "deprecated", "false_positive", "security_risk"}
    if body.resolution not in valid_resolutions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid resolution. Must be one of: {', '.join(valid_resolutions)}",
        )
    
    try:
        result = supabase.table("shadow_api_endpoints").update({
            "status": f"resolved_{body.resolution}",
            "resolved_at": datetime.now(timezone.utc).isoformat(),
            "resolution": body.resolution,
        }).eq("id", endpoint_id).eq("user_id", body.user_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Endpoint not found")
        
        return {"success": True, "endpoint_id": endpoint_id, "resolution": body.resolution}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
Shadow API Discovery Router — DevPulse Patent 3
FastAPI router exposing the shadow API discovery endpoints.

Patent: NHCE/DEV/2026/003
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from services.auth_guard import require_auth
from services.shadow_api import (
    build_api_inventory,
    correlate_with_traffic,
    extract_routes_from_source,
)
from services.supabase_client import get_supabase

router = APIRouter(prefix="/shadow-api", tags=["shadow-api"])


# ── Request / Response Models ─────────────────────────────────────────────────

class SourceCodeRoute(BaseModel):
    file: str
    route: str
    method: str = "GET"
    framework: str = "fastapi"
    source_code: str | None = None  # Optional raw source for server-side extraction


class TrafficObservation(BaseModel):
    path: str
    method: str
    count: int = 1
    last_seen: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class DiscoverRequest(BaseModel):
    user_id: str
    project_name: str
    source_code_routes: list[SourceCodeRoute] = Field(default_factory=list)
    observed_traffic: list[TrafficObservation] = Field(default_factory=list)
    # Optional: raw source files for server-side extraction
    source_files: list[dict[str, str]] | None = None  # [{"path": "...", "content": "...", "framework": "..."}]


class ResolveRequest(BaseModel):
    user_id: str
    resolution: str  # "documented", "deprecated", "false_positive", "security_risk"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/discover")
async def discover_shadow_apis(
    body: DiscoverRequest,
    _auth: dict = Depends(require_auth),
) -> dict[str, Any]:
    """
    PATENT 3 CORE ENDPOINT: Shadow API Discovery
    
    Accepts source code routes (statically extracted by VS Code extension)
    and observed local development traffic, then correlates them to identify
    shadow API endpoints — routes that appear in traffic but not in source code.
    
    Also accepts raw source files for server-side route extraction.
    """
    supabase = get_supabase()
    
    # Step 1: Build static routes list
    static_routes = []
    
    # From pre-extracted routes (sent by VS Code extension)
    for sr in body.source_code_routes:
        static_routes.append({
            "method": sr.method.upper(),
            "path": sr.route,
            "framework": sr.framework,
            "file": sr.file,
            "extraction_method": "client_static",
        })
    
    # From raw source files (server-side extraction)
    if body.source_files:
        for sf in body.source_files:
            extracted = extract_routes_from_source(
                source_code=sf.get("content", ""),
                framework=sf.get("framework", "fastapi"),
                file_path=sf.get("path", "unknown"),
            )
            static_routes.extend(extracted)
    
    # Step 2: Build traffic observations list
    traffic_observations = [
        {
            "method": t.method.upper(),
            "path": t.path,
            "count": t.count,
            "last_seen": t.last_seen,
        }
        for t in body.observed_traffic
    ]
    
    # Step 3: Correlate static routes with traffic (Patent 3 core algorithm)
    correlation = correlate_with_traffic(static_routes, traffic_observations)
    
    # Step 4: Build structured inventory
    inventory = build_api_inventory(
        user_id=body.user_id,
        project_name=body.project_name,
        correlation_result=correlation,
    )
    
    # Step 5: Persist to Supabase
    try:
        # Upsert inventory record
        supabase.table("shadow_api_inventories").upsert({
            "id": inventory["inventory_id"],
            "user_id": body.user_id,
            "project_name": body.project_name,
            "generated_at": inventory["generated_at"],
            "summary": inventory["summary"],
            "endpoint_count": len(inventory["endpoints"]),
            "shadow_count": inventory["summary"]["shadow_endpoint_count"],
            "shadow_risk_score": inventory["summary"]["shadow_risk_score"],
        }).execute()
        
        # Insert endpoints (delete old ones for this project first)
        if inventory["endpoints"]:
            supabase.table("shadow_api_endpoints").delete().eq(
                "user_id", body.user_id
            ).eq("project_name", body.project_name).execute()
            
            supabase.table("shadow_api_endpoints").insert(inventory["endpoints"]).execute()
    except Exception:
        # Non-fatal: return results even if persistence fails
        pass
    
    return {
        "inventory_id": inventory["inventory_id"],
        "project_name": body.project_name,
        "summary": inventory["summary"],
        "shadow_endpoints": correlation["shadow_endpoints"],
        "documented_active": correlation["documented_active"],
        "dead_routes": correlation["dead_routes"],
        "generated_at": inventory["generated_at"],
    }


@router.get("/inventory/{user_id}")
async def get_shadow_api_inventory(
    user_id: str,
    _auth: dict = Depends(require_auth),
) -> dict[str, Any]:
    """Get the full API inventory for a user across all projects."""
    supabase = get_supabase()
    
    try:
        endpoints_res = supabase.table("shadow_api_endpoints").select("*").eq(
            "user_id", user_id
        ).order("discovered_at", desc=True).execute()
        
        endpoints = endpoints_res.data or []
        
        # Group by project
        projects: dict[str, list] = {}
        for ep in endpoints:
            proj = ep.get("project_name", "default")
            if proj not in projects:
                projects[proj] = []
            projects[proj].append(ep)
        
        return {
            "user_id": user_id,
            "total_endpoints": len(endpoints),
            "shadow_count": sum(1 for e in endpoints if e.get("status") == "shadow_endpoint"),
            "projects": [
                {
                    "name": proj,
                    "endpoints": eps,
                    "shadow_count": sum(1 for e in eps if e.get("status") == "shadow_endpoint"),
                }
                for proj, eps in projects.items()
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/{user_id}")
async def get_shadow_api_stats(
    user_id: str,
    _auth: dict = Depends(require_auth),
) -> dict[str, Any]:
    """Get shadow API discovery statistics for a user."""
    supabase = get_supabase()
    
    try:
        inventories_res = supabase.table("shadow_api_inventories").select("*").eq(
            "user_id", user_id
        ).order("generated_at", desc=True).limit(10).execute()
        
        inventories = inventories_res.data or []
        
        endpoints_res = supabase.table("shadow_api_endpoints").select("*").eq(
            "user_id", user_id
        ).execute()
        
        endpoints = endpoints_res.data or []
        
        shadow_eps = [e for e in endpoints if e.get("status") == "shadow_endpoint"]
        high_risk = [e for e in shadow_eps if e.get("risk_level") == "high"]
        medium_risk = [e for e in shadow_eps if e.get("risk_level") == "medium"]
        
        return {
            "user_id": user_id,
            "total_endpoints_discovered": len(endpoints),
            "shadow_endpoints_found": len(shadow_eps),
            "high_risk_shadow": len(high_risk),
            "medium_risk_shadow": len(medium_risk),
            "low_risk_shadow": len(shadow_eps) - len(high_risk) - len(medium_risk),
            "projects_scanned": len(set(e.get("project_name", "") for e in endpoints)),
            "last_scan": inventories[0]["generated_at"] if inventories else None,
            "scan_history": [
                {
                    "scan_id": inv["id"],
                    "project": inv["project_name"],
                    "shadow_count": inv.get("shadow_count", 0),
                    "risk_score": inv.get("shadow_risk_score", 0),
                    "scanned_at": inv["generated_at"],
                }
                for inv in inventories
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/resolve/{endpoint_id}")
async def resolve_shadow_endpoint(
    endpoint_id: str,
    body: ResolveRequest,
    _auth: dict = Depends(require_auth),
) -> dict[str, Any]:
    """
    Mark a shadow endpoint as resolved with a classification.
    Resolutions: documented, deprecated, false_positive, security_risk
    """
    supabase = get_supabase()
    
    valid_resolutions = {"documented", "deprecated", "false_positive", "security_risk"}
    if body.resolution not in valid_resolutions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid resolution. Must be one of: {', '.join(valid_resolutions)}",
        )
    
    try:
        result = supabase.table("shadow_api_endpoints").update({
            "status": f"resolved_{body.resolution}",
            "resolved_at": datetime.now(timezone.utc).isoformat(),
            "resolution": body.resolution,
        }).eq("id", endpoint_id).eq("user_id", body.user_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Endpoint not found")
        
        return {"success": True, "endpoint_id": endpoint_id, "resolution": body.resolution}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

