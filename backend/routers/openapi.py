"""
OpenAPI Spec Import Router — DevPulse
Handles OpenAPI 3.x specification upload, parsing, and scanning pipeline.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import Any

from services.auth_guard import get_current_user_id
from services.openapi_parser import parse_openapi_spec
from services.scan_pipeline import run_scan_pipeline
from services.supabase_client import supabase

router = APIRouter(prefix="/openapi", tags=["openapi"])


class OpenAPIScanRequest(BaseModel):
    user_id: str
    scan_endpoints: bool = True
    max_http_scans: int = 10


@router.post("/parse")
async def parse_spec(
    file: UploadFile = File(..., description="OpenAPI spec file (JSON or YAML)"),
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Parse an uploaded OpenAPI specification without running HTTP scans.
    Fast path for extracting endpoints and security schemes.

    Accepts: .json, .yaml, .yml files
    """
    # Read and parse the file content
    content = await file.read()

    # Try JSON first, then YAML
    spec_dict: dict[str, Any] | None = None
    try:
        spec_dict = json.loads(content.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        pass

    if spec_dict is None:
        # Try YAML parsing
        try:
            import yaml

            spec_dict = yaml.safe_load(content.decode("utf-8"))
        except Exception:
            pass

    if not spec_dict or not isinstance(spec_dict, dict):
        raise HTTPException(
            status_code=400,
            detail="Invalid OpenAPI specification. Provide valid JSON or YAML.",
        )

    # Validate it's an OpenAPI spec
    if "openapi" not in spec_dict and "swagger" not in spec_dict:
        raise HTTPException(
            status_code=400,
            detail="Not an OpenAPI specification. Missing 'openapi' or 'swagger' field.",
        )

    # Parse the specification
    try:
        parsed = parse_openapi_spec(spec_dict)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail={"message": "Failed to parse OpenAPI specification.", "code": "INVALID_OPENAPI_SPEC", "details": {}}
        )

    return {
        "success": True,
        "spec_info": parsed["spec_info"],
        "servers": parsed["servers"],
        "endpoints": parsed["endpoints"],
        "security_schemes": parsed["security_schemes"],
        "summary": parsed["summary"],
    }


@router.post("/import")
async def import_and_scan(
    file: UploadFile = File(..., description="OpenAPI spec file to import and scan"),
    user_id: str = Form(..., description="User ID for storage"),
    scan_endpoints: bool = Form(True, description="Whether to run HTTP scans"),
    max_http_scans: int = Form(10, ge=1, le=50, description="Max HTTP scans to run"),
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Import an OpenAPI spec, parse it, and optionally run HTTP scans against endpoints.

    This is the full pipeline for real API security assessment:
    1. Parse the OpenAPI spec to extract endpoints
    2. Optionally probe each endpoint with HTTP requests
    3. Analyze responses for security issues
    4. Store results in database
    """
    if auth_user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Read and parse the file
    content = await file.read()
    spec_dict: dict[str, Any] | None = None

    # JSON
    try:
        spec_dict = json.loads(content.decode("utf-8"))
    except Exception:
        pass

    # YAML fallback
    if spec_dict is None:
        try:
            import yaml

            spec_dict = yaml.safe_load(content.decode("utf-8"))
        except Exception:
            pass

    if not spec_dict:
        raise HTTPException(
            status_code=400, detail="Could not parse file as JSON or YAML"
        )

    # Parse the spec
    parsed = parse_openapi_spec(spec_dict)

    # Run scan pipeline if requested
    scan_results = []
    if scan_endpoints and parsed["endpoints"]:
        # Build collection-like structure for scan pipeline
        collection = {
            "info": parsed["spec_info"],
            "servers": parsed["servers"],
            "endpoints": parsed["endpoints"],
        }

        try:
            pipeline_result = await run_scan_pipeline(
                collection_json=collection,
                scan_endpoints=True,
                max_http_scans=min(max_http_scans, 50),
            )
            scan_results = pipeline_result.get("endpoints", [])
        except Exception as e:
            # Continue even if scans fail - we still have parsed spec
            scan_results = []

    # Store in database
    import_record = {
        "user_id": user_id,
        "spec_name": parsed["spec_info"]["title"],
        "spec_version": parsed["spec_info"]["version"],
        "total_endpoints": len(parsed["endpoints"]),
        "security_schemes_count": len(parsed["security_schemes"]),
    }

    try:
        supabase.table("openapi_imports").insert(import_record).execute()
    except Exception:
        pass

    # Calculate risk summary from scan results
    risk_summary = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for ep in scan_results:
        for issue in ep.get("security_issues", []):
            level = issue.get("risk_level", "low")
            if level in risk_summary:
                risk_summary[level] += 1

    return {
        "success": True,
        "spec_info": parsed["spec_info"],
        "servers": parsed["servers"],
        "endpoints": parsed["endpoints"],
        "security_schemes": parsed["security_schemes"],
        "summary": parsed["summary"],
        "scan_results": scan_results,
        "risk_summary": risk_summary,
        "endpoints_scanned": len(scan_results),
    }


@router.get("/imports/{user_id}")
def get_user_imports(
    user_id: str,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Get all OpenAPI spec imports for a user."""
    if auth_user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        res = (
            supabase.table("openapi_imports")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return {"success": True, "data": {"imports": res.data or []}}
    except Exception as e:
        return {"success": True, "data": {"imports": []}}
