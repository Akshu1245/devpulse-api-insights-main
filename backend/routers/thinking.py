"""
Thinking Token Attribution and Analytics Router

Endpoints:
- POST /thinking/track - Track thinking tokens
- GET /thinking/records - List thinking token records
- POST /thinking/attribution - Build attribution model
- GET /thinking/attribution/{id} - Get attribution details
- POST /thinking/attribution/{id}/link - Link to compliance
- GET /thinking/analytics - Get thinking token analytics
- GET /thinking/compliance-cost/{req-id} - Estimate compliance-driven cost
- GET /thinking/trends - Get thinking token trends
- GET /thinking/model-distribution - Get model usage distribution
- GET /thinking/dashboard - Thinking analytics dashboard
"""

import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from services.supabase_client import SupabaseClient, get_supabase_client
from services.thinking_token_tracker import (
    ThinkingTokenTracker,
    ThinkingTokenRequest,
    AttributionModelRequest,
    ComplianceLinkRequest,
    ThinkingTokenResponse,
    AttributionModelResponse,
    AnalyticsResponse
)

router = APIRouter(prefix="/thinking", tags=["thinking_tokens"])

# ============================================================
# MODELS
# ============================================================

class TrackingRequest(BaseModel):
    """Thinking token tracking request"""
    user_id: str
    endpoint_id: Optional[str] = None
    lookback_days: int = 30


class AttributionRequest(BaseModel):
    """Build attribution model request"""
    user_id: str
    endpoint_id: str
    period_days: int = 30


class ComplianceLinkingRequest(BaseModel):
    """Link attribution to compliance requirement"""
    attribution_id: str
    requirement_ids: List[str]


class AnalyticsRequest(BaseModel):
    """Analytics request"""
    user_id: str
    endpoint_id: Optional[str] = None
    days: int = 30


class ThinkingTokenRecordResponse(BaseModel):
    """Response for thinking token record"""
    record_id: str
    endpoint_id: str
    date: str
    model: str
    estimated_thinking_tokens: int
    thinking_token_cost: float
    thinking_intensity: str
    confidence_score: float
    total_tokens_used: int
    total_cost: float


class AttributionResponse(BaseModel):
    """Response for attribution model"""
    attribution_id: str
    endpoint_id: str
    period_start: str
    period_end: str
    total_cost: float
    thinking_cost_percentage: float
    cost_per_request: float
    total_thinking_tokens: int
    avg_thinking_intensity: str
    model_distribution: Dict[str, float]


class ListRecordsResponse(BaseModel):
    """List thinking token records response"""
    records: List[ThinkingTokenRecordResponse]
    total: int
    status: str


# ============================================================
# THINKING TOKEN TRACKING ENDPOINTS
# ============================================================

@router.post("/track")
async def track_thinking_tokens(
    request: TrackingRequest,
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """
    Track thinking tokens for user/endpoint.
    
    Estimates thinking token usage and cost from LLM usage data.
    
    Request:
    - user_id: User UUID (required)
    - endpoint_id: Filter to endpoint (optional)
    - lookback_days: Days to analyze (default: 30)
    
    Returns:
    - List of thinking token records
    - Total metrics
    - Model distribution
    """
    try:
        tracker = ThinkingTokenTracker(db)
        
        records = await tracker.track_thinking_tokens(
            user_id=request.user_id,
            endpoint_id=request.endpoint_id,
            lookback_days=request.lookback_days
        )
        
        if not records:
            return {
                "status": "no_data",
                "user_id": request.user_id,
                "period_days": request.lookback_days
            }
        
        # Store records in database
        for record in records:
            await db.table("thinking_token_records").insert({
                "user_id": record.user_id,
                "endpoint_id": record.endpoint_id,
                "record_date": record.date,
                "model": record.model,
                "total_tokens_used": record.total_tokens_used,
                "estimated_thinking_tokens": record.estimated_thinking_tokens,
                "estimated_input_tokens": record.estimated_input_tokens,
                "estimated_output_tokens": record.estimated_output_tokens,
                "thinking_token_cost": float(record.thinking_token_cost),
                "input_cost": float(record.input_cost),
                "output_cost": float(record.output_cost),
                "total_cost": float(record.total_cost),
                "thinking_intensity": record.thinking_intensity.value,
                "confidence_score": float(record.confidence_score)
            }).execute()
        
        # Calculate aggregate metrics
        total_thinking_cost = sum(r.thinking_token_cost for r in records)
        total_tokens = sum(r.total_tokens_used for r in records)
        total_thinking_tokens = sum(r.estimated_thinking_tokens for r in records)
        
        return {
            "status": "success",
            "records_tracked": len(records),
            "total_thinking_cost": float(total_thinking_cost),
            "total_thinking_tokens": total_thinking_tokens,
            "total_tokens": total_tokens,
            "thinking_percentage": (total_thinking_tokens / total_tokens * 100) if total_tokens > 0 else 0,
            "period_days": request.lookback_days
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tracking failed: {str(e)}")


@router.get("/records")
async def list_thinking_records(
    user_id: str = Query(...),
    endpoint_id: Optional[str] = Query(None),
    model: Optional[str] = Query(None),
    intensity: Optional[str] = Query(None),
    days: int = Query(30),
    limit: int = Query(50),
    offset: int = Query(0),
    db: SupabaseClient = Depends(get_supabase_client)
) -> ListRecordsResponse:
    """
    List thinking token records with filtering.
    
    Query parameters:
    - user_id: User UUID (required)
    - endpoint_id: Filter by endpoint (optional)
    - model: Filter by model (optional)
    - intensity: Filter by thinking intensity (optional)
    - days: Days to look back (default: 30)
    - limit: Max results (default: 50)
    - offset: Pagination offset (default: 0)
    """
    try:
        start_date = (datetime.utcnow().date() - timedelta(days=days)).isoformat()
        
        query = db.table("thinking_token_records").select("*").eq(
            "user_id", user_id
        ).gte("record_date", start_date).order("record_date", desc=True)
        
        if endpoint_id:
            query = query.eq("endpoint_id", endpoint_id)
        if model:
            query = query.eq("model", model)
        if intensity:
            query = query.eq("thinking_intensity", intensity)
        
        # Get total count
        count_response = await query.execute()
        total = len(count_response.data) if count_response.data else 0
        
        # Get paginated results
        response = await query.range(offset, offset + limit - 1).execute()
        
        records = [ThinkingTokenRecordResponse(
            record_id=r["id"],
            endpoint_id=r["endpoint_id"],
            date=r["record_date"],
            model=r["model"],
            estimated_thinking_tokens=r["estimated_thinking_tokens"],
            thinking_token_cost=float(r["thinking_token_cost"]),
            thinking_intensity=r["thinking_intensity"],
            confidence_score=float(r["confidence_score"]),
            total_tokens_used=r["total_tokens_used"],
            total_cost=float(r["total_cost"])
        ) for r in (response.data or [])]
        
        return ListRecordsResponse(
            records=records,
            total=total,
            status="success"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"List records failed: {str(e)}")


# ============================================================
# ATTRIBUTION ENDPOINTS
# ============================================================

@router.post("/attribution")
async def build_attribution(
    request: AttributionRequest,
    db: SupabaseClient = Depends(get_supabase_client)
) -> AttributionResponse:
    """
    Build cost attribution model for endpoint.
    
    Shows thinking token cost allocation and trends.
    """
    try:
        tracker = ThinkingTokenTracker(db)
        
        model = await tracker.build_attribution_model(
            user_id=request.user_id,
            endpoint_id=request.endpoint_id,
            period_days=request.period_days
        )
        
        if not model:
            raise HTTPException(status_code=404, detail="No data for attribution")
        
        # Store attribution in database
        attribution_id = model.attribution_id
        await db.table("thinking_token_attributions").insert({
            "user_id": model.user_id,
            "endpoint_id": model.endpoint_id,
            "attribution_date": datetime.utcnow().date().isoformat(),
            "period_start_date": model.period_start.date().isoformat(),
            "period_end_date": model.period_end.date().isoformat(),
            "period_days": request.period_days,
            "total_requests": model.total_requests,
            "total_tokens": model.total_tokens,
            "total_thinking_tokens": model.total_thinking_tokens,
            "total_cost": float(model.total_cost),
            "thinking_cost_total": float(sum(
                r.thinking_token_cost for r in await tracker.track_thinking_tokens(
                    user_id=request.user_id,
                    endpoint_id=request.endpoint_id,
                    lookback_days=request.period_days
                )
            )),
            "thinking_cost_percentage": float(model.thinking_cost_percentage),
            "cost_per_request": float(model.cost_per_request),
            "avg_thinking_intensity": model.avg_thinking_intensity.value,
            "model_distribution": model.model_distribution
        }).execute()
        
        return AttributionResponse(
            attribution_id=attribution_id,
            endpoint_id=model.endpoint_id,
            period_start=model.period_start.isoformat(),
            period_end=model.period_end.isoformat(),
            total_cost=float(model.total_cost),
            thinking_cost_percentage=float(model.thinking_cost_percentage),
            cost_per_request=float(model.cost_per_request),
            total_thinking_tokens=model.total_thinking_tokens,
            avg_thinking_intensity=model.avg_thinking_intensity.value,
            model_distribution=model.model_distribution
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Attribution build failed: {str(e)}")


@router.get("/attribution/{attribution_id}")
async def get_attribution(
    attribution_id: str,
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """Get attribution model details"""
    try:
        response = await db.table("thinking_token_attributions").select("*").eq(
            "id", attribution_id
        ).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Attribution not found")
        
        attr = response.data[0]
        
        return {
            "status": "success",
            "attribution": {
                "id": attr["id"],
                "endpoint_id": attr["endpoint_id"],
                "period_start": attr["period_start_date"],
                "period_end": attr["period_end_date"],
                "total_cost": float(attr["total_cost"]),
                "thinking_cost_percentage": float(attr["thinking_cost_percentage"]),
                "cost_per_request": float(attr["cost_per_request"]),
                "total_thinking_tokens": attr["total_thinking_tokens"],
                "avg_thinking_intensity": attr["avg_thinking_intensity"],
                "model_distribution": attr["model_distribution"],
                "compliance_linked": attr["compliance_linked"]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Get attribution failed: {str(e)}")


@router.post("/attribution/{attribution_id}/link")
async def link_to_compliance(
    attribution_id: str,
    request: ComplianceLinkingRequest,
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """
    Link attribution to compliance requirements.
    
    Creates record showing which compliance requirements drove thinking token usage.
    """
    try:
        tracker = ThinkingTokenTracker(db)
        
        result = await tracker.link_to_compliance(
            attribution_id=attribution_id,
            requirement_ids=request.requirement_ids
        )
        
        # Mark attribution as compliance-linked
        if result["status"] == "linked":
            await db.table("thinking_token_attributions").update({
                "compliance_linked": True
            }).eq("id", attribution_id).execute()
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Link to compliance failed: {str(e)}")


# ============================================================
# ANALYTICS ENDPOINTS
# ============================================================

@router.get("/analytics")
async def get_thinking_analytics(
    user_id: str = Query(...),
    endpoint_id: Optional[str] = Query(None),
    days: int = Query(30),
    db: SupabaseClient = Depends(get_supabase_client)
) -> AnalyticsResponse:
    """
    Get thinking token analytics.
    
    Returns:
    - Total thinking tokens used
    - Thinking cost percentage
    - Model breakdown
    - Trend analysis
    - Top models
    """
    try:
        tracker = ThinkingTokenTracker(db)
        
        analytics = await tracker.get_thinking_analytics(
            user_id=user_id,
            endpoint_id=endpoint_id,
            days=days
        )
        
        return AnalyticsResponse(**analytics)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analytics failed: {str(e)}")


@router.get("/compliance-cost/{requirement_id}")
async def estimate_compliance_cost(
    requirement_id: str,
    user_id: str = Query(...),
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """
    Estimate thinking token cost driven by specific compliance requirement.
    
    Shows total cost allocation for meeting a compliance requirement.
    """
    try:
        tracker = ThinkingTokenTracker(db)
        
        result = await tracker.estimate_compliance_driven_cost(
            user_id=user_id,
            requirement_id=requirement_id
        )
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Estimate compliance cost failed: {str(e)}")


@router.get("/trends")
async def get_thinking_trends(
    user_id: str = Query(...),
    endpoint_id: Optional[str] = Query(None),
    days: int = Query(30),
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """
    Get thinking token trends.
    
    Returns:
    - Trend direction (increasing/decreasing/stable)
    - Historical data
    - Projections
    - Model contributing to trend
    """
    try:
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=days)
        
        query = db.table("thinking_token_trends").select("*").eq(
            "user_id", user_id
        ).gte("trend_date", start_date.isoformat()).order("trend_date", desc=True)
        
        if endpoint_id:
            query = query.eq("endpoint_id", endpoint_id)
        
        response = await query.limit(1).execute()
        
        if not response.data:
            return {
                "status": "no_data",
                "user_id": user_id,
                "endpoint_id": endpoint_id
            }
        
        trend = response.data[0]
        
        return {
            "status": "success",
            "trend_direction": trend["trend_direction"],
            "avg_thinking_percentage": float(trend["avg_thinking_percentage"]),
            "total_thinking_tokens": trend["total_thinking_tokens"],
            "total_thinking_cost": float(trend["total_thinking_cost"]),
            "projected_monthly": float(trend["projected_monthly_thinking_cost"]),
            "confidence": float(trend["trend_confidence"]),
            "model_contributing": trend["model_contributing"],
            "calculated_at": trend["calculated_at"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Get trends failed: {str(e)}")


@router.get("/model-distribution")
async def get_model_distribution(
    user_id: str = Query(...),
    days: int = Query(30),
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """
    Get model usage and thinking token distribution.
    
    Returns:
    - Models used
    - Tokens per model
    - Cost per model
    - Average thinking percentage per model
    """
    try:
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=days)
        
        response = await db.table("thinking_token_records").select(
            "model, COUNT(*) as record_count, SUM(estimated_thinking_tokens) as thinking_tokens, SUM(thinking_token_cost) as thinking_cost"
        ).eq("user_id", user_id).gte("record_date", start_date.isoformat()).group_by(
            "model"
        ).execute()
        
        if not response.data:
            return {
                "status": "no_data",
                "user_id": user_id,
                "period_days": days
            }
        
        models = {}
        for record in response.data:
            models[record["model"]] = {
                "record_count": record.get("record_count", 0),
                "thinking_tokens": record.get("thinking_tokens", 0),
                "thinking_cost": float(record.get("thinking_cost", 0))
            }
        
        return {
            "status": "success",
            "models": models,
            "total_models": len(models),
            "period_days": days
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model distribution failed: {str(e)}")


# ============================================================
# DASHBOARD ENDPOINTS
# ============================================================

@router.get("/dashboard")
async def thinking_dashboard(
    user_id: str = Query(...),
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """
    Get thinking token analytics dashboard.
    
    Returns comprehensive overview:
    - Summary metrics
    - Model distribution
    - Compliance linkage
    - Trends
    - Recommendations
    """
    try:
        # Get summary from materialized view
        summary_response = await db.table("thinking_token_summary").select("*").eq(
            "user_id", user_id
        ).execute()
        
        if not summary_response.data:
            return {
                "status": "no_data",
                "user_id": user_id
            }
        
        summary = summary_response.data[0]
        
        # Get model distribution
        model_response = await db.table("model_thinking_distribution").select("*").eq(
            "user_id", user_id
        ).execute()
        
        models = {}
        if model_response.data:
            for record in model_response.data:
                models[record["model"]] = {
                    "records": record["record_count"],
                    "thinking_tokens": record["total_thinking_tokens"],
                    "thinking_cost": float(record["total_thinking_cost"]),
                    "avg_thinking_percentage": float(record["avg_thinking_percentage"])
                }
        
        # Get compliance linkage
        compliance_response = await db.table("compliance_driven_thinking_costs").select("*").eq(
            "user_id", user_id
        ).limit(5).execute()
        
        top_requirements = []
        if compliance_response.data:
            top_requirements = [
                {
                    "requirement_id": r["requirement_id"],
                    "thinking_cost": float(r["total_thinking_cost"]),
                    "affected_endpoints": r["affected_endpoints"]
                } for r in compliance_response.data
            ]
        
        return {
            "status": "success",
            "summary": {
                "endpoints_using_thinking": summary["endpoints_using_thinking"],
                "total_thinking_tokens": summary["total_thinking_tokens"],
                "total_thinking_cost": float(summary["total_thinking_cost"]),
                "avg_thinking_percentage": float(summary["avg_thinking_percentage"]),
                "compliance_requirements_linked": summary["compliance_requirements_linked"]
            },
            "model_distribution": models,
            "top_compliance_requirements": top_requirements,
            "refreshed_at": summary["refreshed_at"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dashboard failed: {str(e)}")
