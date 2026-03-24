"""
Endpoint Inventory & Correlation API Routes

Endpoints:
- GET /endpoints - List all user endpoints
- GET /endpoints/{endpoint_id} - Get endpoint profile
- GET /endpoints/{endpoint_id}/timeline - Get history
- GET /endpoints/search - Search endpoints
- GET /endpoints/stats - Aggregate statistics
"""

from typing import Any

from fastapi import APIRouter, HTTPException, Depends, Query

from backend.services.correlation_engine import (
    get_endpoint_profile,
    get_user_endpoints,
    search_endpoints,
    get_endpoint_timeline,
    get_endpoint_stats,
    EndpointStatus,
)
from backend.services.auth_guard import get_current_user_id


router = APIRouter(prefix="/endpoints", tags=["endpoints"])


# ============================================================================
# Routes
# ============================================================================


@router.get("")
async def list_endpoints(
    user_id: str = Depends(get_current_user_id),
    status: str = Query(None, regex="^(active|deprecated|archived|removed)$"),
    method: str = Query(None),
    limit: int = Query(100, ge=1, le=1000),
) -> dict[str, Any]:
    """
    List all endpoints for authenticated user.
    
    Optional filters:
    - status: Filter by lifecycle status
    - method: Filter by HTTP method
    - limit: Max results (1-1000)
    
    Returns:
    - List of endpoints with latest risk scores
    - Enriched with current state
    """
    try:
        endpoints = await get_user_endpoints(
            user_id=user_id,
            status=status,
            method=method,
            limit=limit,
        )
        
        return {
            "count": len(endpoints),
            "endpoints": endpoints,
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_stats(
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Get aggregate statistics about user's endpoints.
    
    Returns:
    - Total endpoint count
    - Distribution by status
    - Distribution by HTTP method
    - Average risk score across all endpoints
    """
    try:
        stats = await get_endpoint_stats(user_id)
        return stats
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def search(
    q: str = Query(..., min_length=1),
    limit: int = Query(50, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
) -> list[dict[str, Any]]:
    """
    Search endpoints by URL or method.
    
    Query Parameters:
    - q: Search term (required)
    - limit: Max results (1-100)
    
    Returns:
    List of matching endpoints
    """
    try:
        results = await search_endpoints(
            user_id=user_id,
            query=q,
            limit=limit,
        )
        
        return results
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{endpoint_id}")
async def get_endpoint(
    endpoint_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Get comprehensive endpoint profile.
    
    Includes:
    - Endpoint metadata and lifecycle
    - Current risk score
    - Latest security scan
    - Cost trend (30-day)
    - All correlations
    - Timeline of changes
    
    Returns:
    Complete endpoint profile
    """
    try:
        profile = await get_endpoint_profile(
            user_id=user_id,
            endpoint_id=endpoint_id,
        )
        
        if not profile:
            raise HTTPException(
                status_code=404,
                detail=f"Endpoint {endpoint_id} not found"
            )
        
        return profile
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{endpoint_id}/timeline")
async def get_timeline(
    endpoint_id: str,
    days: int = Query(30, ge=1, le=90),
    user_id: str = Depends(get_current_user_id),
) -> list[dict[str, Any]]:
    """
    Get timeline of security, cost, and risk events for endpoint.
    
    Query Parameters:
    - days: Historical period (1-90, default: 30)
    
    Returns:
    Chronologically ordered list of events:
    - security_scan: Issue discovered during scan
    - risk_score_update: Risk score updated
    - cost_event: Cost anomaly detected (future)
    
    Events include:
    - type: Event type
    - timestamp: When it occurred
    - data: Event-specific details
    """
    try:
        timeline = await get_endpoint_timeline(
            user_id=user_id,
            endpoint_id=endpoint_id,
            days=days,
        )
        
        return timeline
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
