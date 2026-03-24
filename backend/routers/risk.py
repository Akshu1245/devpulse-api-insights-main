"""
Unified Risk Score API Endpoints

Routes:
- GET /risk/endpoint/{endpoint_id} - Get current risk score
- GET /risk/endpoint/{endpoint_id}/history - Get risk history
- GET /risk/summary - Get summary statistics
- GET /risk/high-risk - Get high-risk endpoints
"""

from typing import Any

from fastapi import APIRouter, HTTPException, Depends, Query

from backend.services.risk_engine import (
    get_endpoint_risk_history,
    generate_endpoint_id,
)
from backend.services.auth_guard import get_current_user_id
from backend.services.supabase_client import supabase


router = APIRouter(prefix="/risk", tags=["risk"])


# ============================================================================
# Models
# ============================================================================


class RiskScoreResponse:
    """Single risk score record."""
    pass


# ============================================================================
# Routes
# ============================================================================


@router.get("/endpoint/{endpoint_id}")
async def get_endpoint_risk_score(
    endpoint_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Get current unified risk score for an endpoint.
    
    Args:
        endpoint_id: Unique endpoint identifier
        user_id: Current user (from auth)
    
    Returns:
        Latest risk score with all metrics
    """
    try:
        response = (
            supabase.table("endpoint_risk_scores")
            .select("*")
            .eq("user_id", user_id)
            .eq("endpoint_id", endpoint_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        
        data = response.data
        if not data:
            raise HTTPException(
                status_code=404,
                detail=f"No risk score found for endpoint {endpoint_id}"
            )
        
        return data[0]
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/endpoint/{endpoint_id}/history")
async def get_endpoint_risk_history_route(
    endpoint_id: str,
    days: int = Query(30, ge=1, le=90),
    user_id: str = Depends(get_current_user_id),
) -> list[dict[str, Any]]:
    """
    Get historical risk scores for an endpoint.
    
    Args:
        endpoint_id: Unique endpoint identifier
        days: Number of days to retrieve (1-90, default: 30)
        user_id: Current user (from auth)
    
    Returns:
        List of risk scores ordered by timestamp (newest first)
    """
    history = await get_endpoint_risk_history(user_id, endpoint_id, days)
    return history


@router.get("/summary")
async def get_risk_summary(
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Get risk summary statistics for all endpoints.
    
    Returns:
    - Total endpoints scanned
    - Risk level distribution (critical, high, medium, low, info)
    - Average unified risk score
    - Highest risk endpoint
    - Recently scanned endpoints
    """
    try:
        # Get all unique endpoints for user
        response = (
            supabase.table("endpoint_risk_scores")
            .select("endpoint_id,unified_risk_score,risk_level,endpoint_url,created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        
        records = response.data or []
        
        if not records:
            return {
                "total_endpoints": 0,
                "risk_distribution": {
                    "critical": 0,
                    "high": 0,
                    "medium": 0,
                    "low": 0,
                    "info": 0,
                },
                "average_risk_score": 0.0,
                "highest_risk_endpoint": None,
                "recently_scanned": [],
            }
        
        # Get unique endpoints (most recent scan per endpoint)
        seen_endpoints = {}
        unique_records = []
        for record in records:
            endpoint_id = record.get("endpoint_id")
            if endpoint_id not in seen_endpoints:
                seen_endpoints[endpoint_id] = True
                unique_records.append(record)
        
        # Calculate distribution
        risk_distribution = {
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0,
            "info": 0,
        }
        
        risk_scores = []
        highest_risk = None
        
        for record in unique_records:
            risk_level = record.get("risk_level", "info")
            risk_distribution[risk_level] = risk_distribution.get(risk_level, 0) + 1
            
            score = record.get("unified_risk_score", 0)
            risk_scores.append(score)
            
            if highest_risk is None or score > highest_risk["unified_risk_score"]:
                highest_risk = record
        
        # Calculate average
        avg_score = sum(risk_scores) / len(risk_scores) if risk_scores else 0.0
        
        return {
            "total_endpoints": len(unique_records),
            "risk_distribution": risk_distribution,
            "average_risk_score": round(avg_score, 2),
            "highest_risk_endpoint": {
                "endpoint_id": highest_risk.get("endpoint_id"),
                "endpoint_url": highest_risk.get("endpoint_url"),
                "risk_level": highest_risk.get("risk_level"),
                "unified_risk_score": highest_risk.get("unified_risk_score"),
            } if highest_risk else None,
            "recently_scanned": [
                {
                    "endpoint_id": r.get("endpoint_id"),
                    "endpoint_url": r.get("endpoint_url"),
                    "risk_level": r.get("risk_level"),
                    "unified_risk_score": r.get("unified_risk_score"),
                    "created_at": r.get("created_at"),
                }
                for r in records[:10]  # Last 10 scans
            ],
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/high-risk")
async def get_high_risk_endpoints(
    threshold: float = Query(70.0, ge=0, le=100),
    limit: int = Query(50, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
) -> list[dict[str, Any]]:
    """
    Get high-risk endpoints above threshold.
    
    Args:
        threshold: Risk score threshold (0-100, default: 70)
        limit: Maximum results to return (1-100, default: 50)
        user_id: Current user (from auth)
    
    Returns:
        List of endpoints with risk >= threshold, ordered by risk score
    """
    try:
        response = (
            supabase.table("endpoint_risk_scores")
            .select("*")
            .eq("user_id", user_id)
            .gte("unified_risk_score", threshold)
            .order("unified_risk_score", desc=True)
            .limit(limit)
            .execute()
        )
        
        records = response.data or []
        
        # Remove duplicates (keep most recent per endpoint)
        seen = {}
        unique_records = []
        for record in records:
            endpoint_id = record.get("endpoint_id")
            if endpoint_id not in seen:
                seen[endpoint_id] = True
                unique_records.append(record)
        
        return unique_records
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/by-url")
async def get_risk_score_by_url(
    url: str,
    method: str = Query("GET"),
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Get risk score for an endpoint by URL.
    
    Generates endpoint_id from URL and looks up risk score.
    
    Args:
        url: Full endpoint URL
        method: HTTP method (default: GET)
        user_id: Current user (from auth)
    
    Returns:
        Risk score record for the endpoint
    """
    from backend.services.risk_engine import generate_endpoint_id
    
    try:
        endpoint_id = generate_endpoint_id(url, method)
        
        response = (
            supabase.table("endpoint_risk_scores")
            .select("*")
            .eq("user_id", user_id)
            .eq("endpoint_id", endpoint_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        
        data = response.data
        if not data:
            return {
                "endpoint_id": endpoint_id,
                "endpoint_url": url,
                "method": method,
                "message": "No risk score found. Run a scan first.",
            }
        
        return data[0]
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
