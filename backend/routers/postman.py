"""
Postman Collection Upload & Scan Router

Endpoints:
- POST /postman/upload: Upload Postman collection JSON
- GET /postman/history: Get upload history
"""

import json
from datetime import datetime
from typing import Any

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile, Depends, Header
from pydantic import BaseModel, Field

from backend.services.postman_parser import (
    parse_postman_collection,
    PostmanParseError,
    validate_endpoint,
)
from backend.services.scanner import run_security_probe
from backend.services.supabase_client import supabase
from backend.services.auth_guard import get_current_user_id
from backend.services.risk_engine import (
    generate_endpoint_id,
    calculate_batch_risk_scores,
)
from backend.services.correlation_engine import (
    create_or_update_endpoint,
    link_endpoint_to_source,
)


router = APIRouter(prefix="/postman", tags=["postman"])


# ============================================================================
# Models
# ============================================================================


class PostmanEndpointResult(BaseModel):
    """Single endpoint scan result with unified risk score."""
    name: str
    method: str
    url: str
    endpoint_id: str
    headers: list[dict[str, str]]
    body: str = ""
    path: str
    folder: str = ""
    description: str = ""
    issues: list[dict[str, Any]] = Field(default_factory=list)
    risk_level: str = "info"
    security_score: float = 0.0
    cost_anomaly_score: float = 0.0
    unified_risk_score: float = 0.0


class PostmanUploadResponse(BaseModel):
    """Response from Postman collection upload."""
    collection_name: str
    collection_description: str
    endpoint_count: int
    scanned_count: int
    results: list[PostmanEndpointResult]
    upload_id: str
    timestamp: str


class PostmanHistory(BaseModel):
    """Single entry in upload history."""
    upload_id: str
    collection_name: str
    endpoint_count: int
    scanned_count: int
    created_at: str
    issues_found: int


# ============================================================================
# Helper Functions
# ============================================================================


def _compute_risk_level(issues: list[dict[str, Any]]) -> str:
    """
    Compute overall risk level from security issues.
    
    Priority: critical > high > medium > low > info
    """
    if not issues:
        return "info"
    
    levels = [issue.get("risk_level", "info") for issue in issues]
    
    if "critical" in levels:
        return "critical"
    if "high" in levels:
        return "high"
    if "medium" in levels:
        return "medium"
    if "low" in levels:
        return "low"
    return "info"


async def _scan_endpoint_safe(endpoint: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    """
    Safely scan a single endpoint. Returns issues and risk level.
    
    Handles network errors and returns gracefully.
    """
    try:
        issues = await run_security_probe(endpoint["url"])
        risk_level = _compute_risk_level(issues)
        return issues, risk_level
    except (httpx.RequestError, httpx.TimeoutException) as e:
        # Network/timeout error
        return [
            {
                "issue": f"Network error during scan: {str(e)}",
                "risk_level": "medium",
                "recommendation": "Check endpoint connectivity and retry",
                "method": endpoint["method"]
            }
        ], "medium"
    except ValueError as e:
        # Invalid URL error
        return [
            {
                "issue": f"Invalid URL: {str(e)}",
                "risk_level": "high",
                "recommendation": "Verify URL format",
                "method": endpoint["method"]
            }
        ], "high"
    except Exception as e:
        # Unknown error
        return [
            {
                "issue": f"Unexpected error: {str(e)}",
                "risk_level": "low",
                "recommendation": "Retry or contact support",
                "method": endpoint["method"]
            }
        ], "low"


async def _store_scan_results(
    user_id: str,
    upload_id: str,
    collection_name: str,
    endpoints_with_results: list[dict[str, Any]]
) -> int:
    """
    Store Postman scan results in database.
    
    Inserts into:
    - postman_uploads: Collection metadata
    - postman_scans: Individual endpoint scans
    - security_alerts: Critical/high issues (if alerts table exists)
    
    Returns count of critical/high issues found.
    """
    issues_count = 0
    
    try:
        # Store collection upload metadata
        upload_record = {
            "user_id": user_id,
            "upload_id": upload_id,
            "collection_name": collection_name,
            "endpoint_count": len(endpoints_with_results),
            "created_at": datetime.utcnow().isoformat(),
        }
        
        # Create table if doesn't exist
        try:
            supabase.table("postman_uploads").insert([upload_record]).execute()
        except Exception:
            pass  # Table might not exist, continue with per-scan storage
        
        # Store individual scans
        scan_records = []
        alert_records = []
        
        for endpoint in endpoints_with_results:
            issues = endpoint.get("issues", [])
            risk_level = endpoint.get("risk_level", "info")
            
            # Count critical/high issues
            for issue in issues:
                if issue.get("risk_level") in ("critical", "high"):
                    issues_count += 1
            
            # Store each issue
            for issue in issues:
                scan_record = {
                    "user_id": user_id,
                    "upload_id": upload_id,
                    "endpoint_name": endpoint.get("name"),
                    "endpoint_url": endpoint.get("url"),
                    "method": endpoint.get("method"),
                    "issue": issue.get("issue"),
                    "risk_level": issue.get("risk_level"),
                    "recommendation": issue.get("recommendation"),
                    "created_at": datetime.utcnow().isoformat(),
                }
                scan_records.append(scan_record)
                
                # Also create alert for critical/high issues
                if issue.get("risk_level") in ("critical", "high"):
                    alert_record = {
                        "user_id": user_id,
                        "severity": issue.get("risk_level"),
                        "description": f"{endpoint.get('name')} ({endpoint.get('method')}): {issue.get('issue')}",
                        "endpoint": endpoint.get("url"),
                        "source": "postman_parser",
                        "resolved": False,
                        "created_at": datetime.utcnow().isoformat(),
                    }
                    alert_records.append(alert_record)
        
        # Batch insert scans (if table exists)
        if scan_records:
            try:
                supabase.table("postman_scans").insert(scan_records).execute()
            except Exception:
                pass  # Table might not exist
        
        # Batch insert alerts (to security_alerts table)
        if alert_records:
            try:
                supabase.table("security_alerts").insert(alert_records).execute()
            except Exception:
                pass  # Table might not exist
    
    except Exception as e:
        # Log but don't fail - we still want to return results to user
        print(f"Error storing scan results: {str(e)}")
    
    return issues_count


# ============================================================================
# Routes
# ============================================================================


@router.post("/upload", response_model=PostmanUploadResponse)
async def upload_postman_collection(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
) -> PostmanUploadResponse:
    """
    Upload and scan a Postman Collection v2.1 JSON file.
    
    Steps:
    1. Validate file is JSON
    2. Parse Postman collection
    3. Scan each endpoint
    4. Store results
    5. Return structured response
    
    Returns:
    - Collection metadata
    - Extracted endpoints with security scan results
    - Summary statistics
    """
    
    # Validate file type
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(
            status_code=400,
            detail="File must be JSON (.json extension)"
        )
    
    # Read file
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="File is empty")
        collection_json = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be valid UTF-8 JSON")
    
    # Parse collection
    try:
        parsed = parse_postman_collection(collection_json)
    except PostmanParseError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    collection_name = parsed.get("collection_name", "")
    collection_description = parsed.get("collection_description", "")
    endpoints = parsed.get("endpoints", [])
    
    # Scan each endpoint and collect results
    scanned_endpoints = []
    for endpoint in endpoints:
        # Validate endpoint structure
        if not validate_endpoint(endpoint):
            continue
        
        # Scan this endpoint
        issues, risk_level = await _scan_endpoint_safe(endpoint)
        
        scanned_endpoints.append({
            "name": endpoint.get("name", ""),
            "method": endpoint.get("method", "GET"),
            "url": endpoint.get("url", ""),
            "headers": endpoint.get("headers", []),
            "body": endpoint.get("body", ""),
            "path": endpoint.get("path", ""),
            "folder": endpoint.get("folder", ""),
            "description": endpoint.get("description", ""),
            "issues": issues,
            "risk_level": risk_level,
        })
    
    # Generate upload ID
    upload_id = f"postman_{user_id}_{int(datetime.utcnow().timestamp())}"
    
    # Calculate unified risk scores for all endpoints
    risk_scores = await calculate_batch_risk_scores(
        user_id=user_id,
        upload_id=upload_id,
        endpoints_with_issues=scanned_endpoints,
    )
    
    # Map risk scores back to endpoints
    risk_score_map = {rs.get("endpoint_id"): rs for rs in risk_scores}
    
    results = []
    for endpoint in scanned_endpoints:
        endpoint_id = generate_endpoint_id(endpoint.get("url", ""), endpoint.get("method", "GET"))
        risk_data = risk_score_map.get(endpoint_id, {})
        
        # Create/update endpoint in inventory
        await create_or_update_endpoint(
            user_id=user_id,
            endpoint_id=endpoint_id,
            endpoint_url=endpoint.get("url", ""),
            method=endpoint.get("method", "GET"),
            source="postman",
            metadata={
                "name": endpoint.get("name"),
                "description": endpoint.get("description"),
                "folder": endpoint.get("folder"),
                "path": endpoint.get("path"),
                "collection_name": collection_name,
            }
        )
        
        # Link endpoint to risk score
        await link_endpoint_to_source(
            user_id=user_id,
            endpoint_id=endpoint_id,
            source="risk_score",
            source_id=risk_data.get("endpoint_id", ""),
            source_data={
                "unified_risk_score": risk_data.get("unified_risk_score"),
                "risk_level": risk_data.get("risk_level"),
                "upload_id": upload_id,
            }
        )
        
        result = PostmanEndpointResult(
            name=endpoint.get("name", ""),
            method=endpoint.get("method", "GET"),
            url=endpoint.get("url", ""),
            endpoint_id=endpoint_id,
            headers=endpoint.get("headers", []),
            body=endpoint.get("body", ""),
            path=endpoint.get("path", ""),
            folder=endpoint.get("folder", ""),
            description=endpoint.get("description", ""),
            issues=endpoint.get("issues", []),
            risk_level=risk_data.get("risk_level", endpoint.get("risk_level", "info")),
            security_score=risk_data.get("security_score", 0.0),
            cost_anomaly_score=risk_data.get("cost_anomaly_score", 0.0),
            unified_risk_score=risk_data.get("unified_risk_score", 0.0),
        )
        results.append(result)
    
    # Store results in database
    critical_high_count = await _store_scan_results(
        user_id,
        upload_id,
        collection_name,
        [r.model_dump() for r in results]
    )
    
    return PostmanUploadResponse(
        collection_name=collection_name,
        collection_description=collection_description,
        endpoint_count=len(endpoints),
        scanned_count=len(results),
        results=results,
        upload_id=upload_id,
        timestamp=datetime.utcnow().isoformat()
    )


@router.get("/history", response_model=list[PostmanHistory])
async def get_postman_history(
    user_id: str = Depends(get_current_user_id),
    limit: int = 50,
) -> list[PostmanHistory]:
    """
    Get upload history for authenticated user.
    
    Returns last N uploads with summary statistics.
    """
    
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")
    
    try:
        # Query postman_uploads table
        response = (
            supabase.table("postman_uploads")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        
        uploads = response.data or []
        results = []
        
        for upload in uploads:
            # Count critical/high issues for this upload
            try:
                issues_response = (
                    supabase.table("postman_scans")
                    .select("risk_level")
                    .eq("upload_id", upload.get("upload_id"))
                    .in_("risk_level", ["critical", "high"])
                    .execute()
                )
                issues_found = len(issues_response.data or [])
            except Exception:
                issues_found = 0
            
            history = PostmanHistory(
                upload_id=upload.get("upload_id"),
                collection_name=upload.get("collection_name"),
                endpoint_count=upload.get("endpoint_count", 0),
                scanned_count=upload.get("endpoint_count", 0),
                created_at=upload.get("created_at"),
                issues_found=issues_found,
            )
            results.append(history)
        
        return results
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving history: {str(e)}")
