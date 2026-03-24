"""
Shadow API Discovery Router

API endpoints for detecting, analyzing, and managing shadow APIs
- Endpoint pattern matching
- Behavioral analysis
- Risk assessment
- Compliance linking
- Remediation recommendations
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional, List
from datetime import datetime

from services.auth_guard import get_current_user_id, assert_same_user
from services.shadow_api_detector import (
    ShadowAPIDetector,
    ShadowAPIRiskLevel,
    ShadowAPIDiscovery
)

router = APIRouter(prefix="/shadow-api", tags=["shadow-api"])

# Initialize detector
detector = ShadowAPIDetector()


@router.on_event("startup")
async def startup_event():
    """Initialize shadow API detector on startup"""
    await detector.initialize()


@router.post("/discover")
async def discover_shadow_apis(
    user_id: str = Query(..., description="User ID"),
    lookback_days: int = Query(30, ge=1, le=365, description="Days to analyze"),
    min_requests: int = Query(5, ge=1, description="Minimum requests threshold"),
    auth_user_id: str = Depends(get_current_user_id)
) -> dict:
    """
    Scan for shadow APIs
    
    Analyzes endpoint usage patterns to detect undocumented endpoints
    that may pose security risks.
    
    Args:
        user_id: User identifier
        lookback_days: Number of days to analyze (1-365)
        auth_user_id: Authenticated user ID from token
        min_requests: Minimum requests to consider endpoint
        token: Authentication bearer token
    
    Returns:
        Discovery results with shadow API list and summary
    """
    
    try:
        # Detect shadow APIs
        shadow_apis = await detector.detect_shadow_apis(
            user_id=user_id,
            lookback_days=lookback_days,
            min_requests=min_requests
        )
        
        # Save discoveries
        for api in shadow_apis:
            try:
                detector.client.table("shadow_api_discoveries").insert({
                    "user_id": user_id,
                    "endpoint_path": api.endpoint_path,
                    "http_method": api.http_method,
                    "first_seen": api.first_seen.isoformat(),
                    "last_seen": api.last_seen.isoformat(),
                    "request_count": api.request_count,
                    "unique_users": api.unique_users,
                    "avg_response_time_ms": api.avg_response_time_ms,
                    "risk_level": api.risk_level.value,
                    "risk_score": api.risk_score,
                    "confidence": api.confidence,
                    "anomaly_types": [a.value for a in api.anomaly_types],
                    "behavioral_patterns": api.behavioral_patterns,
                    "affected_compliance_ids": api.affected_compliance,
                    "remediation_items": api.remediation_items,
                    "status": "active",
                    "discovered_at": datetime.utcnow().isoformat()
                }).execute()
            except Exception as e:
                print(f"Error saving discovery: {e}")
        
        return {
            "status": "success",
            "discoveries_count": len(shadow_apis),
            "shadow_apis": [api.to_dict() for api in shadow_apis],
            "summary": {
                "critical_count": sum(1 for a in shadow_apis if a.risk_level == ShadowAPIRiskLevel.CRITICAL),
                "high_count": sum(1 for a in shadow_apis if a.risk_level == ShadowAPIRiskLevel.HIGH),
                "medium_count": sum(1 for a in shadow_apis if a.risk_level == ShadowAPIRiskLevel.MEDIUM),
                "low_count": sum(1 for a in shadow_apis if a.risk_level == ShadowAPIRiskLevel.LOW),
                "avg_risk_score": sum(a.risk_score for a in shadow_apis) / len(shadow_apis) if shadow_apis else 0
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Discovery failed: {str(e)}")


@router.get("/discoveries")
async def list_shadow_apis(
    user_id: str = Query(..., description="User ID"),
    risk_level: Optional[str] = Query(None, description="Filter by risk level"),
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    auth_user_id: str = Depends(get_current_user_id)
) -> dict:
    """
    List discovered shadow APIs
    
    Args:
        user_id: User identifier
        risk_level: Filter by risk level (low/medium/high/critical)
        limit: Number of results
        offset: Pagination offset
        token: Authentication bearer token
    
    Returns:
        Paginated list of shadow API discoveries
    """
    
    try:
        query = detector.client.table("shadow_api_discoveries") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("status", "active")
        
        if risk_level:
            query = query.eq("risk_level", risk_level)
        
        response = query \
            .order("risk_score", desc=True) \
            .range(offset, offset + limit - 1) \
            .execute()
        
        discoveries = response.data or []
        
        # Count total
        count_response = detector.client.table("shadow_api_discoveries") \
            .select("id", count="exact") \
            .eq("user_id", user_id) \
            .eq("status", "active")
        
        if risk_level:
            count_response = count_response.eq("risk_level", risk_level)
        
        count_result = count_response.execute()
        total_count = count_result.count or 0
        
        return {
            "status": "success",
            "total": total_count,
            "limit": limit,
            "offset": offset,
            "discoveries": discoveries
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list discoveries: {str(e)}")


@router.get("/discoveries/{discovery_id}")
async def get_shadow_api_details(
    discovery_id: str,
    user_id: str = Query(..., description="User ID"),
    auth_user_id: str = Depends(get_current_user_id)
) -> dict:
    """
    Get detailed information about a shadow API
    
    Args:
        discovery_id: Discovery record ID
        user_id: User identifier
        token: Authentication bearer token
    
    Returns:
        Detailed shadow API discovery information
    """
    
    try:
        response = detector.client.table("shadow_api_discoveries") \
            .select("*") \
            .eq("id", discovery_id) \
            .eq("user_id", user_id) \
            .single() \
            .execute()
        
        discovery = response.data
        
        if not discovery:
            raise HTTPException(status_code=404, detail="Discovery not found")
        
        return {
            "status": "success",
            "discovery": discovery
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get discovery: {str(e)}")


@router.post("/discoveries/{discovery_id}/dismiss")
async def dismiss_shadow_api(
    discovery_id: str,
    user_id: str = Query(..., description="User ID"),
    reason: str = Query(..., description="Dismissal reason"),
    auth_user_id: str = Depends(get_current_user_id)
) -> dict:
    """
    Dismiss a shadow API discovery (mark as false positive)
    
    Args:
        discovery_id: Discovery record ID
        user_id: User identifier
        reason: Reason for dismissal
        token: Authentication bearer token
    
    Returns:
        Dismissal confirmation
    """
    
    try:
        success = await detector.dismiss_shadow_api(user_id, discovery_id, reason)
        
        if not success:
            raise HTTPException(status_code=400, detail="Failed to dismiss discovery")
        
        return {
            "status": "dismissed",
            "discovery_id": discovery_id,
            "reason": reason
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dismissal failed: {str(e)}")


@router.post("/discoveries/{discovery_id}/whitelist")
async def whitelist_shadow_api(
    discovery_id: str,
    user_id: str = Query(..., description="User ID"),
    auth_user_id: str = Depends(get_current_user_id)
) -> dict:
    """
    Whitelist a shadow API as authorized/documented
    
    Args:
        discovery_id: Discovery record ID
        user_id: User identifier
        token: Authentication bearer token
    
    Returns:
        Whitelist confirmation
    """
    
    try:
        success = await detector.whitelist_shadow_api(user_id, discovery_id)
        
        if not success:
            raise HTTPException(status_code=400, detail="Failed to whitelist discovery")
        
        return {
            "status": "whitelisted",
            "discovery_id": discovery_id
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Whitelisting failed: {str(e)}")


@router.get("/analytics")
async def get_shadow_api_analytics(
    user_id: str = Query(..., description="User ID"),
    auth_user_id: str = Depends(get_current_user_id)
) -> dict:
    """
    Get shadow API analytics and statistics
    
    Args:
        user_id: User identifier
        token: Authentication bearer token
    
    Returns:
        Analytics summary with risk distribution
    """
    
    try:
        analytics = await detector.get_shadow_api_analytics(user_id)
        
        return {
            "status": "success",
            "analytics": analytics
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get analytics: {str(e)}")


@router.get("/analytics/by-compliance")
async def get_shadow_apis_by_compliance(
    user_id: str = Query(..., description="User ID"),
    auth_user_id: str = Depends(get_current_user_id)
) -> dict:
    """
    Get shadow APIs grouped by affected compliance requirement
    
    Args:
        user_id: User identifier
        token: Authentication bearer token
    
    Returns:
        Shadow APIs grouped by compliance requirement
    """
    
    try:
        response = detector.client.table("shadow_api_discoveries") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("status", "active") \
            .execute()
        
        discoveries = response.data or []
        
        # Group by compliance
        compliance_map = {}
        for discovery in discoveries:
            compliance_ids = discovery.get('affected_compliance_ids', [])
            
            if not compliance_ids:
                if 'uncategorized' not in compliance_map:
                    compliance_map['uncategorized'] = []
                compliance_map['uncategorized'].append(discovery)
            else:
                for req_id in compliance_ids:
                    if req_id not in compliance_map:
                        compliance_map[req_id] = []
                    compliance_map[req_id].append(discovery)
        
        return {
            "status": "success",
            "by_compliance": {
                req_id: {
                    "count": len(apis),
                    "critical_count": sum(1 for a in apis if a.get('risk_level') == 'critical'),
                    "high_count": sum(1 for a in apis if a.get('risk_level') == 'high'),
                    "avg_risk_score": sum(a.get('risk_score', 0) for a in apis) / len(apis) if apis else 0,
                    "apis": apis
                }
                for req_id, apis in compliance_map.items()
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get compliance analytics: {str(e)}")


@router.get("/risks-by-anomaly")
async def get_risks_by_anomaly_type(
    user_id: str = Query(..., description="User ID"),
    auth_user_id: str = Depends(get_current_user_id)
) -> dict:
    """
    Get shadow APIs grouped by anomaly type
    
    Args:
        user_id: User identifier
        token: Authentication bearer token
    
    Returns:
        Shadow APIs grouped by detected anomaly type
    """
    
    try:
        response = detector.client.table("shadow_api_discoveries") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("status", "active") \
            .execute()
        
        discoveries = response.data or []
        
        # Group by anomaly type
        anomaly_map = {}
        for discovery in discoveries:
            anomalies = discovery.get('anomaly_types', [])
            
            for anomaly in anomalies:
                if anomaly not in anomaly_map:
                    anomaly_map[anomaly] = []
                anomaly_map[anomaly].append(discovery)
        
        return {
            "status": "success",
            "by_anomaly": {
                anomaly: {
                    "count": len(apis),
                    "avg_risk_score": sum(a.get('risk_score', 0) for a in apis) / len(apis) if apis else 0,
                    "critical_count": sum(1 for a in apis if a.get('risk_level') == 'critical'),
                    "apis": apis
                }
                for anomaly, apis in anomaly_map.items()
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get anomaly analysis: {str(e)}")


@router.get("/dashboard")
async def get_shadow_api_dashboard(
    user_id: str = Query(..., description="User ID"),
    auth_user_id: str = Depends(get_current_user_id)
) -> dict:
    """
    Get comprehensive shadow API dashboard
    
    Args:
        user_id: User identifier
        token: Authentication bearer token
    
    Returns:
        Complete dashboard with all metrics and top risks
    """
    
    try:
        # Get analytics
        analytics = await detector.get_shadow_api_analytics(user_id)
        
        # Get top 10 by risk
        response = detector.client.table("shadow_api_discoveries") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("status", "active") \
            .order("risk_score", desc=True) \
            .limit(10) \
            .execute()
        
        top_risks = response.data or []
        
        # Get by risk level
        response = detector.client.table("shadow_api_discoveries") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("status", "active") \
            .execute()
        
        all_discoveries = response.data or []
        
        risk_distribution = {
            'critical': sum(1 for a in all_discoveries if a.get('risk_level') == 'critical'),
            'high': sum(1 for a in all_discoveries if a.get('risk_level') == 'high'),
            'medium': sum(1 for a in all_discoveries if a.get('risk_level') == 'medium'),
            'low': sum(1 for a in all_discoveries if a.get('risk_level') == 'low')
        }
        
        return {
            "status": "success",
            "dashboard": {
                "analytics": analytics,
                "risk_distribution": risk_distribution,
                "top_risks": top_risks
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get dashboard: {str(e)}")
