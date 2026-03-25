"""
Postman Collection Import Router — DevPulse
Handles Postman Collection v2.1 JSON upload, credential detection,
and triggers OWASP security scanning on extracted endpoints.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any

from services.auth_guard import get_current_user_id
from services.postman_parser import parse_postman_collection
from services.scanner import run_security_probe
from services.supabase_client import supabase

router = APIRouter(prefix="/postman", tags=["postman"])


class PostmanImportRequest(BaseModel):
    collection: dict  # Raw Postman Collection JSON
    scan_endpoints: bool = True  # Whether to trigger OWASP scan on extracted URLs
    user_id: str


@router.post("/import")
async def import_postman_collection(
    req: PostmanImportRequest,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Import a Postman Collection, detect credentials, and optionally scan endpoints.
    
    This is the 'Postman Refugee Engine' — the primary acquisition mechanism.
    Shows credential findings immediately on import.
    """
    if auth_user_id != req.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Parse the collection
    try:
        parsed = parse_postman_collection(req.collection)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Postman collection: {str(e)}")

    # Store import record in Supabase
    import_record = {
        "user_id": req.user_id,
        "collection_name": parsed["collection_name"],
        "total_endpoints": parsed["total_endpoints"],
        "credentials_exposed_count": parsed["credentials_exposed_count"],
        "endpoints_with_credentials": parsed["endpoints_with_credentials"],
    }
    
    try:
        supabase.table("postman_imports").insert(import_record).execute()
    except Exception:
        pass  # Non-critical, continue

    # Optionally scan the first 10 scannable URLs (rate limit for free tier)
    scan_results = []
    if req.scan_endpoints and parsed["scannable_urls"]:
        urls_to_scan = parsed["scannable_urls"][:10]
        for url_info in urls_to_scan:
            try:
                findings = await run_security_probe(url_info["url"])
                for finding in findings:
                    finding["endpoint_name"] = url_info["name"]
                    finding["endpoint"] = url_info["url"]
                    finding["method"] = url_info["method"]
                    # Store in scan_results table
                    try:
                        supabase.table("scan_results").insert({
                            "user_id": req.user_id,
                            "endpoint": url_info["url"],
                            "method": finding.get("method", url_info["method"]),
                            "risk_level": finding.get("risk_level", "low"),
                            "issue": finding.get("issue", ""),
                            "recommendation": finding.get("recommendation", ""),
                        }).execute()
                    except Exception:
                        pass
                scan_results.extend(findings)
            except Exception as e:
                scan_results.append({
                    "endpoint": url_info["url"],
                    "error": str(e),
                    "risk_level": "unknown",
                })

    return {
        "success": True,
        "collection_name": parsed["collection_name"],
        "total_endpoints": parsed["total_endpoints"],
        "scannable_urls_count": len(parsed["scannable_urls"]),
        "credential_findings": parsed["credential_findings"],
        "credentials_exposed_count": parsed["credentials_exposed_count"],
        "endpoints_with_credentials": parsed["endpoints_with_credentials"],
        "summary": parsed["summary"],
        "scan_results": scan_results,
        "endpoints": parsed["endpoints"],
        "alert": (
            f"🚨 CRITICAL: {parsed['credentials_exposed_count']} exposed credential(s) found in your Postman collection! "
            f"These may have been visible in public workspaces. Rotate these credentials immediately."
        ) if parsed["credentials_exposed_count"] > 0 else None,
    }


@router.get("/imports/{user_id}")
def get_user_imports(
    user_id: str,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Get all Postman collection imports for a user."""
    if auth_user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    try:
        res = (
            supabase.table("postman_imports")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return {"imports": res.data or []}
    except Exception as e:
        return {"imports": [], "error": str(e)}
Postman Collection Import Router — DevPulse
Handles Postman Collection v2.1 JSON upload, credential detection,
and triggers OWASP security scanning on extracted endpoints.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any

from services.auth_guard import get_current_user_id
from services.postman_parser import parse_postman_collection
from services.scanner import run_security_probe
from services.supabase_client import supabase

router = APIRouter(prefix="/postman", tags=["postman"])


class PostmanImportRequest(BaseModel):
    collection: dict  # Raw Postman Collection JSON
    scan_endpoints: bool = True  # Whether to trigger OWASP scan on extracted URLs
    user_id: str


@router.post("/import")
async def import_postman_collection(
    req: PostmanImportRequest,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Import a Postman Collection, detect credentials, and optionally scan endpoints.
    
    This is the 'Postman Refugee Engine' — the primary acquisition mechanism.
    Shows credential findings immediately on import.
    """
    if auth_user_id != req.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Parse the collection
    try:
        parsed = parse_postman_collection(req.collection)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Postman collection: {str(e)}")

    # Store import record in Supabase
    import_record = {
        "user_id": req.user_id,
        "collection_name": parsed["collection_name"],
        "total_endpoints": parsed["total_endpoints"],
        "credentials_exposed_count": parsed["credentials_exposed_count"],
        "endpoints_with_credentials": parsed["endpoints_with_credentials"],
    }
    
    try:
        supabase.table("postman_imports").insert(import_record).execute()
    except Exception:
        pass  # Non-critical, continue

    # Optionally scan the first 10 scannable URLs (rate limit for free tier)
    scan_results = []
    if req.scan_endpoints and parsed["scannable_urls"]:
        urls_to_scan = parsed["scannable_urls"][:10]
        for url_info in urls_to_scan:
            try:
                findings = await run_security_probe(url_info["url"])
                for finding in findings:
                    finding["endpoint_name"] = url_info["name"]
                    finding["endpoint"] = url_info["url"]
                    finding["method"] = url_info["method"]
                    # Store in scan_results table
                    try:
                        supabase.table("scan_results").insert({
                            "user_id": req.user_id,
                            "endpoint": url_info["url"],
                            "method": finding.get("method", url_info["method"]),
                            "risk_level": finding.get("risk_level", "low"),
                            "issue": finding.get("issue", ""),
                            "recommendation": finding.get("recommendation", ""),
                        }).execute()
                    except Exception:
                        pass
                scan_results.extend(findings)
            except Exception as e:
                scan_results.append({
                    "endpoint": url_info["url"],
                    "error": str(e),
                    "risk_level": "unknown",
                })

    return {
        "success": True,
        "collection_name": parsed["collection_name"],
        "total_endpoints": parsed["total_endpoints"],
        "scannable_urls_count": len(parsed["scannable_urls"]),
        "credential_findings": parsed["credential_findings"],
        "credentials_exposed_count": parsed["credentials_exposed_count"],
        "endpoints_with_credentials": parsed["endpoints_with_credentials"],
        "summary": parsed["summary"],
        "scan_results": scan_results,
        "endpoints": parsed["endpoints"],
        "alert": (
            f"🚨 CRITICAL: {parsed['credentials_exposed_count']} exposed credential(s) found in your Postman collection! "
            f"These may have been visible in public workspaces. Rotate these credentials immediately."
        ) if parsed["credentials_exposed_count"] > 0 else None,
    }


@router.get("/imports/{user_id}")
def get_user_imports(
    user_id: str,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Get all Postman collection imports for a user."""
    if auth_user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    try:
        res = (
            supabase.table("postman_imports")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return {"imports": res.data or []}
    except Exception as e:
        return {"imports": [], "error": str(e)}

