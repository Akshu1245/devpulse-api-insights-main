"""
Cost Anomaly Detection and Alerts Router

Endpoints:
- POST /alerts/detect - Detect cost anomalies
- GET /alerts/anomalies - List detected anomalies
- GET /alerts/anomalies/{id} - Get anomaly details
- POST /alerts/anomalies/{id}/acknowledge - Mark anomaly as acknowledged
- GET /alerts - List cost alerts
- GET /alerts/{id} - Get alert details
- POST /alerts/{id}/resolve - Resolve alert
- GET /alerts/trends - Get cost trends
- POST /budgets - Create budget policy
- GET /budgets - List budget policies
- PUT /budgets/{id} - Update budget policy
- DELETE /budgets/{id} - Delete budget policy
- GET /budgets/violations - List budget violations
- GET /dashboard/cost-summary - Get cost summary dashboard
"""

import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from services.supabase_client import SupabaseClient, get_supabase_client
from services.cost_anomaly_detector import (
    CostAnomalyDetector,
    CostAnomalyRequest,
    AnomalyResponse,
    AlertResponse,
    CostTrendResponse
)

router = APIRouter(prefix="/alerts", tags=["alerts"])

# ============================================================
# MODELS
# ============================================================

class BudgetPolicyCreate(BaseModel):
    """Create budget policy request"""
    endpoint_id: Optional[str] = None
    policy_name: str
    policy_description: Optional[str] = None
    daily_budget: Optional[float] = None
    monthly_budget: Optional[float] = None
    alert_threshold_percentage: int = 80
    hard_limit: bool = False


class BudgetPolicyUpdate(BaseModel):
    """Update budget policy request"""
    policy_name: Optional[str] = None
    policy_description: Optional[str] = None
    daily_budget: Optional[float] = None
    monthly_budget: Optional[float] = None
    alert_threshold_percentage: Optional[int] = None
    hard_limit: Optional[bool] = None
    is_active: Optional[bool] = None


class BudgetPolicyResponse(BaseModel):
    """Budget policy response"""
    id: str
    user_id: str
    endpoint_id: Optional[str]
    policy_name: str
    policy_description: Optional[str]
    daily_budget: Optional[float]
    monthly_budget: Optional[float]
    alert_threshold_percentage: int
    hard_limit: bool
    is_active: bool
    created_at: str


class AlertAcknowledgeRequest(BaseModel):
    """Acknowledge anomaly request"""
    notes: Optional[str] = None


class AlertResolveRequest(BaseModel):
    """Resolve alert request"""
    resolution_notes: str
    action_taken: Optional[str] = None


class AnomalyListResponse(BaseModel):
    """List anomalies response"""
    anomalies: List[AnomalyResponse]
    total: int
    status: str


class AlertListResponse(BaseModel):
    """List alerts response"""
    alerts: List[AlertResponse]
    total: int
    status: str


# ============================================================
# HELPER FUNCTIONS
# ============================================================

async def get_user_id(db: SupabaseClient = Depends(get_supabase_client)) -> str:
    """Extract user ID from auth context"""
    # In production, this would extract from JWT token
    # For now, return a placeholder that would be replaced with actual auth
    return "user_context"  # This should be replaced with actual auth extraction


# ============================================================
# COST ANOMALY DETECTION ENDPOINTS
# ============================================================

@router.post("/detect")
async def detect_cost_anomalies(
    request: CostAnomalyRequest,
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """
    Detect cost anomalies for a user.
    
    - Analyzes 30-day rolling baseline
    - Applies z-score statistical test
    - Detects anomalies where z-score > 2.5 (99.4% confidence)
    - Generates alerts automatically
    """
    try:
        detector = CostAnomalyDetector(db)
        
        # Detect anomalies
        anomalies = await detector.detect_anomalies(
            user_id=request.user_id,
            lookback_days=request.lookback_days
        )
        
        # Generate alerts
        alerts = await detector.generate_alerts(anomalies)
        
        # Store anomalies in database
        for anomaly in anomalies:
            await db.table("cost_anomalies").insert({
                "user_id": anomaly.user_id,
                "endpoint_id": anomaly.endpoint_id,
                "anomaly_date": anomaly.detected_date.date().isoformat(),
                "anomaly_type": anomaly.anomaly_type.value,
                "detected_at": anomaly.detected_date.isoformat(),
                "anomaly_value": float(anomaly.anomaly_value),
                "baseline_value": float(anomaly.baseline_value),
                "z_score": float(anomaly.z_score),
                "deviation_percentage": float(anomaly.deviation_percentage),
                "contributing_factors": anomaly.contributing_factors,
                "affected_endpoints": anomaly.affected_endpoints,
                "severity": "high"
            }).execute()
        
        # Store alerts in database
        for alert in alerts:
            await db.table("cost_alerts").insert({
                "user_id": alert.user_id,
                "anomaly_id": f"anom_{alert.anomaly_id}",
                "alert_title": alert.title,
                "alert_description": alert.description,
                "severity": alert.severity.value,
                "detected_at": alert.detected_date.isoformat(),
                "estimated_daily_impact": float(alert.estimated_daily_impact),
                "estimated_monthly_impact": float(alert.estimated_monthly_impact),
                "recommendations": alert.recommendations,
                "action_items": alert.action_items
            }).execute()
        
        return {
            "status": "success",
            "anomalies_detected": len(anomalies),
            "alerts_generated": len(alerts),
            "anomalies": [asdict(a) for a in anomalies[:5]],  # Return first 5
            "alerts": [asdict(a) for a in alerts[:5]]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Anomaly detection failed: {str(e)}")


@router.get("/anomalies")
async def list_anomalies(
    user_id: str = Query(...),
    endpoint_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    days: int = Query(30),
    limit: int = Query(50),
    offset: int = Query(0),
    db: SupabaseClient = Depends(get_supabase_client)
) -> AnomalyListResponse:
    """
    List detected anomalies with filtering.
    
    Query parameters:
    - user_id: User UUID (required)
    - endpoint_id: Filter by endpoint (optional)
    - severity: Filter by severity (critical, high, medium, low, info)
    - days: Days to look back (default: 30)
    - limit: Max results (default: 50)
    - offset: Pagination offset (default: 0)
    """
    try:
        start_date = (datetime.utcnow().date() - timedelta(days=days)).isoformat()
        
        query = db.table("cost_anomalies").select("*").eq(
            "user_id", user_id
        ).gte("anomaly_date", start_date).order("anomaly_date", desc=True)
        
        if endpoint_id:
            query = query.eq("endpoint_id", endpoint_id)
        if severity:
            query = query.eq("severity", severity)
        
        # Get total count
        count_response = await query.execute()
        total = len(count_response.data) if count_response.data else 0
        
        # Get paginated results
        response = await query.range(offset, offset + limit - 1).execute()
        
        anomalies = [AnomalyResponse(
            anomaly_id=a["id"],
            user_id=a["user_id"],
            endpoint_id=a["endpoint_id"],
            anomaly_type=a["anomaly_type"],
            detected_date=datetime.fromisoformat(a["detected_at"]),
            anomaly_value=float(a["anomaly_value"]),
            baseline_value=float(a["baseline_value"]),
            z_score=float(a["z_score"]),
            deviation_percentage=float(a["deviation_percentage"]),
            affected_endpoints=a["affected_endpoints"]
        ) for a in (response.data or [])]
        
        return AnomalyListResponse(
            anomalies=anomalies,
            total=total,
            status="success"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"List anomalies failed: {str(e)}")


@router.get("/anomalies/{anomaly_id}")
async def get_anomaly(
    anomaly_id: str,
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """Get detailed anomaly information"""
    try:
        response = await db.table("cost_anomalies").select("*").eq(
            "id", anomaly_id
        ).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Anomaly not found")
        
        anomaly = response.data[0]
        
        return {
            "status": "success",
            "anomaly": {
                "id": anomaly["id"],
                "endpoint_id": anomaly["endpoint_id"],
                "anomaly_type": anomaly["anomaly_type"],
                "detected_at": anomaly["detected_at"],
                "anomaly_value": float(anomaly["anomaly_value"]),
                "baseline_value": float(anomaly["baseline_value"]),
                "z_score": float(anomaly["z_score"]),
                "deviation_percentage": float(anomaly["deviation_percentage"]),
                "contributing_factors": anomaly["contributing_factors"],
                "affected_endpoints": anomaly["affected_endpoints"],
                "is_acknowledged": anomaly["is_acknowledged"],
                "severity": anomaly["severity"]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Get anomaly failed: {str(e)}")


@router.post("/anomalies/{anomaly_id}/acknowledge")
async def acknowledge_anomaly(
    anomaly_id: str,
    request: AlertAcknowledgeRequest,
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """Mark anomaly as acknowledged"""
    try:
        await db.table("cost_anomalies").update({
            "is_acknowledged": True,
            "acknowledged_at": datetime.utcnow().isoformat()
        }).eq("id", anomaly_id).execute()
        
        return {
            "status": "success",
            "message": "Anomaly acknowledged",
            "anomaly_id": anomaly_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Acknowledge failed: {str(e)}")


# ============================================================
# COST ALERT ENDPOINTS
# ============================================================

@router.get("")
async def list_alerts(
    user_id: str = Query(...),
    severity: Optional[str] = Query(None),
    is_resolved: Optional[bool] = Query(None),
    days: int = Query(30),
    limit: int = Query(50),
    offset: int = Query(0),
    db: SupabaseClient = Depends(get_supabase_client)
) -> AlertListResponse:
    """
    List cost alerts with filtering.
    
    Query parameters:
    - user_id: User UUID (required)
    - severity: Filter by severity level (critical, high, medium, low)
    - is_resolved: Filter by resolution status
    - days: Days to look back (default: 30)
    - limit: Max results (default: 50)
    - offset: Pagination offset (default: 0)
    """
    try:
        start_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
        
        query = db.table("cost_alerts").select("*").eq(
            "user_id", user_id
        ).gte("detected_at", start_date).order("detected_at", desc=True)
        
        if severity:
            query = query.eq("severity", severity)
        if is_resolved is not None:
            query = query.eq("is_resolved", is_resolved)
        
        # Get total count
        count_response = await query.execute()
        total = len(count_response.data) if count_response.data else 0
        
        # Get paginated results
        response = await query.range(offset, offset + limit - 1).execute()
        
        alerts = [AlertResponse(
            alert_id=a["id"],
            user_id=a["user_id"],
            severity=a["severity"],
            title=a["alert_title"],
            description=a["alert_description"],
            detected_date=datetime.fromisoformat(a["detected_at"]),
            estimated_daily_impact=float(a["estimated_daily_impact"]),
            estimated_monthly_impact=float(a["estimated_monthly_impact"]),
            recommendations=a["recommendations"],
            action_items=a["action_items"]
        ) for a in (response.data or [])]
        
        return AlertListResponse(
            alerts=alerts,
            total=total,
            status="success"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"List alerts failed: {str(e)}")


@router.get("/{alert_id}")
async def get_alert(
    alert_id: str,
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """Get alert details"""
    try:
        response = await db.table("cost_alerts").select("*").eq(
            "id", alert_id
        ).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        alert = response.data[0]
        
        return {
            "status": "success",
            "alert": {
                "id": alert["id"],
                "severity": alert["severity"],
                "title": alert["alert_title"],
                "description": alert["alert_description"],
                "detected_at": alert["detected_at"],
                "estimated_daily_impact": float(alert["estimated_daily_impact"]),
                "estimated_monthly_impact": float(alert["estimated_monthly_impact"]),
                "recommendations": alert["recommendations"],
                "action_items": alert["action_items"],
                "is_resolved": alert["is_resolved"],
                "resolved_at": alert["resolved_at"],
                "resolution_notes": alert["resolution_notes"]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Get alert failed: {str(e)}")


@router.post("/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    request: AlertResolveRequest,
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """Resolve alert"""
    try:
        await db.table("cost_alerts").update({
            "is_resolved": True,
            "resolved_at": datetime.utcnow().isoformat(),
            "resolution_notes": request.resolution_notes
        }).eq("id", alert_id).execute()
        
        return {
            "status": "success",
            "message": "Alert resolved",
            "alert_id": alert_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Resolve alert failed: {str(e)}")


# ============================================================
# COST TRENDS ENDPOINTS
# ============================================================

@router.get("/trends")
async def get_cost_trends(
    user_id: str = Query(...),
    endpoint_id: Optional[str] = Query(None),
    days: int = Query(30),
    db: SupabaseClient = Depends(get_supabase_client)
) -> CostTrendResponse:
    """
    Get cost trends for analysis.
    
    Returns:
    - Current trend (increasing/decreasing/stable)
    - Daily costs
    - Projected monthly costs
    - Moving averages
    - Cost change percentage
    """
    try:
        detector = CostAnomalyDetector(db)
        
        trends = await detector.get_cost_trends(
            user_id=user_id,
            endpoint_id=endpoint_id,
            days=days
        )
        
        return CostTrendResponse(**trends)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Get trends failed: {str(e)}")


# ============================================================
# BUDGET POLICY ENDPOINTS
# ============================================================

@router.post("/budgets")
async def create_budget_policy(
    request: BudgetPolicyCreate,
    user_id: str = Query(...),
    db: SupabaseClient = Depends(get_supabase_client)
) -> BudgetPolicyResponse:
    """Create a new budget policy"""
    try:
        policy_id = str(uuid.uuid4())
        
        await db.table("cost_budget_policies").insert({
            "id": policy_id,
            "user_id": user_id,
            "endpoint_id": request.endpoint_id,
            "policy_name": request.policy_name,
            "policy_description": request.policy_description,
            "daily_budget": request.daily_budget,
            "monthly_budget": request.monthly_budget,
            "alert_threshold_percentage": request.alert_threshold_percentage,
            "hard_limit": request.hard_limit,
            "is_active": True,
            "created_at": datetime.utcnow().isoformat()
        }).execute()
        
        return BudgetPolicyResponse(
            id=policy_id,
            user_id=user_id,
            endpoint_id=request.endpoint_id,
            policy_name=request.policy_name,
            policy_description=request.policy_description,
            daily_budget=request.daily_budget,
            monthly_budget=request.monthly_budget,
            alert_threshold_percentage=request.alert_threshold_percentage,
            hard_limit=request.hard_limit,
            is_active=True,
            created_at=datetime.utcnow().isoformat()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Create policy failed: {str(e)}")


@router.get("/budgets")
async def list_budget_policies(
    user_id: str = Query(...),
    is_active: Optional[bool] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """List budget policies"""
    try:
        query = db.table("cost_budget_policies").select("*").eq(
            "user_id", user_id
        ).order("created_at", desc=True)
        
        if is_active is not None:
            query = query.eq("is_active", is_active)
        
        response = await query.range(offset, offset + limit - 1).execute()
        
        policies = [BudgetPolicyResponse(
            id=p["id"],
            user_id=p["user_id"],
            endpoint_id=p["endpoint_id"],
            policy_name=p["policy_name"],
            policy_description=p["policy_description"],
            daily_budget=p["daily_budget"],
            monthly_budget=p["monthly_budget"],
            alert_threshold_percentage=p["alert_threshold_percentage"],
            hard_limit=p["hard_limit"],
            is_active=p["is_active"],
            created_at=p["created_at"]
        ) for p in (response.data or [])]
        
        return {
            "status": "success",
            "policies": policies,
            "total": len(response.data) if response.data else 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"List policies failed: {str(e)}")


@router.put("/budgets/{policy_id}")
async def update_budget_policy(
    policy_id: str,
    request: BudgetPolicyUpdate,
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """Update budget policy"""
    try:
        update_data = {
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if request.policy_name:
            update_data["policy_name"] = request.policy_name
        if request.policy_description is not None:
            update_data["policy_description"] = request.policy_description
        if request.daily_budget is not None:
            update_data["daily_budget"] = request.daily_budget
        if request.monthly_budget is not None:
            update_data["monthly_budget"] = request.monthly_budget
        if request.alert_threshold_percentage is not None:
            update_data["alert_threshold_percentage"] = request.alert_threshold_percentage
        if request.hard_limit is not None:
            update_data["hard_limit"] = request.hard_limit
        if request.is_active is not None:
            update_data["is_active"] = request.is_active
        
        await db.table("cost_budget_policies").update(update_data).eq(
            "id", policy_id
        ).execute()
        
        return {
            "status": "success",
            "message": "Policy updated",
            "policy_id": policy_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Update policy failed: {str(e)}")


@router.delete("/budgets/{policy_id}")
async def delete_budget_policy(
    policy_id: str,
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """Delete budget policy"""
    try:
        await db.table("cost_budget_policies").delete().eq(
            "id", policy_id
        ).execute()
        
        return {
            "status": "success",
            "message": "Policy deleted",
            "policy_id": policy_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete policy failed: {str(e)}")


# ============================================================
# DASHBOARD ENDPOINTS
# ============================================================

@router.get("/dashboard/cost-summary")
async def get_cost_summary(
    user_id: str = Query(...),
    db: SupabaseClient = Depends(get_supabase_client)
) -> Dict[str, Any]:
    """
    Get cost summary dashboard.
    
    Returns:
    - Total endpoints
    - Total anomalies (current month)
    - Critical anomalies
    - Total spend
    - Average daily spend
    - Cost trends
    - Unacknowledged anomalies
    """
    try:
        response = await db.table("cost_summary_dashboard").select("*").eq(
            "user_id", user_id
        ).execute()
        
        if not response.data:
            # Build summary from raw data
            costs_response = await db.table("endpoint_llm_costs").select(
                "total_cost"
            ).eq("user_id", user_id).gte(
                "date", (datetime.utcnow().date() - timedelta(days=30)).isoformat()
            ).execute()
            
            costs = [c["total_cost"] for c in (costs_response.data or [])]
            
            summary = {
                "total_endpoints": 0,
                "total_anomalies": 0,
                "critical_anomalies": 0,
                "total_spend": sum(costs) if costs else 0,
                "avg_daily_spend": (sum(costs) / len(costs)) if costs else 0,
                "last_anomaly_detected": None,
                "unacknowledged_anomalies": 0,
                "avg_trend_change_pct": 0
            }
        else:
            summary = response.data[0]
        
        return {
            "status": "success",
            "summary": summary
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Get summary failed: {str(e)}")
