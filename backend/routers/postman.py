"""
Postman Collection Import Router — DevPulse
Handles Postman Collection v2.1 JSON upload, credential detection,
and triggers the full scanning pipeline on extracted endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any

from services.auth_guard import get_current_user_id
from services.postman_parser import parse_postman_collection
from services.scan_pipeline import run_scan_pipeline
from services.supabase_client import supabase

router = APIRouter(prefix="/postman", tags=["postman"])


class PostmanImportRequest(BaseModel):
    collection: dict
    scan_endpoints: bool = True
    user_id: str
    max_http_scans: int = 10


@router.post("/import")
async def import_postman_collection(
    req: PostmanImportRequest,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Import a Postman Collection, detect secrets, and run the full scanning pipeline.
    Returns structured scan results with per-endpoint risk assessment.
    """
    if auth_user_id != req.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Run the full scan pipeline
    try:
        result = await run_scan_pipeline(
            collection_json=req.collection,
            scan_endpoints=req.scan_endpoints,
            max_http_scans=min(req.max_http_scans, 50),
        )
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Invalid Postman collection: {str(e)}"
        )

    # Store import record in Supabase
    import_record = {
        "user_id": req.user_id,
        "collection_name": result["collection_name"],
        "total_endpoints": result["total_endpoints"],
        "credentials_exposed_count": result["secrets_exposed_count"],
        "endpoints_with_credentials": result["endpoints_with_secrets"],
    }
    try:
        supabase.table("postman_imports").insert(import_record).execute()
    except Exception:
        pass

    # Store individual scan results for high/critical endpoints
    for ep in result.get("endpoints", []):
        if ep.get("risk_level") in ("critical", "high"):
            for issue in ep.get("security_issues", []):
                if issue.get("risk_level") in ("critical", "high"):
                    try:
                        supabase.table("scan_results").insert(
                            {
                                "user_id": req.user_id,
                                "endpoint": ep["url"],
                                "method": ep["method"],
                                "risk_level": issue["risk_level"],
                                "issue": issue["issue"],
                                "recommendation": issue["recommendation"],
                            }
                        ).execute()
                    except Exception:
                        pass

    # Build alert if secrets are found
    alert = None
    if result["secrets_exposed_count"] > 0:
        alert = (
            f"CRITICAL: {result['secrets_exposed_count']} exposed credential(s) found in your Postman collection! "
            f"These may have been visible in public workspaces. Rotate these credentials immediately."
        )

    return {
        "success": True,
        "collection_name": result["collection_name"],
        "total_endpoints": result["total_endpoints"],
        "endpoints": result["endpoints"],
        "secret_findings": result["secret_findings"],
        "secrets_exposed_count": result["secrets_exposed_count"],
        "endpoints_with_secrets": result["endpoints_with_secrets"],
        "endpoints_scanned_http": result["endpoints_scanned_http"],
        "summary": result["summary"],
        "alert": alert,
    }


@router.post("/parse")
async def parse_only(
    req: PostmanImportRequest,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Parse a Postman Collection without running HTTP scans.
    Fast path for just extracting endpoints and detecting secrets.
    """
    if auth_user_id != req.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        parsed = parse_postman_collection(req.collection)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Invalid Postman collection: {str(e)}"
        )

    return {
        "success": True,
        "collection_name": parsed["collection_name"],
        "total_endpoints": parsed["total_endpoints"],
        "endpoints": parsed["endpoints"],
        "secret_findings": parsed["secret_findings"],
        "secrets_exposed_count": parsed["secrets_exposed_count"],
        "endpoints_with_secrets": parsed["endpoints_with_secrets"],
        "variables_resolved": parsed["variables_resolved"],
        "summary": parsed["summary"],
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
