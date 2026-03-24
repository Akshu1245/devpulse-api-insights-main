"""
Endpoint Correlation Engine

Links endpoints across security, cost, and risk dimensions.

Provides unified endpoint profiles with:
- Security scan history
- Cost tracking
- Risk score trends
- Metadata and lifecycle info
"""

from datetime import datetime, timedelta
from typing import Any, Optional
from enum import Enum

from backend.services.supabase_client import supabase
from backend.services.risk_engine import generate_endpoint_id


# ============================================================================
# Enums
# ============================================================================


class EndpointStatus(str, Enum):
    """Endpoint lifecycle status."""
    ACTIVE = "active"
    DEPRECATED = "deprecated"
    ARCHIVED = "archived"
    REMOVED = "removed"


class CorrelationSource(str, Enum):
    """Source of endpoint discovery."""
    POSTMAN = "postman"
    SCANNER = "scanner"
    LLM_TRACKER = "llm_tracker"
    GITHUB = "github"
    MANUAL = "manual"


# ============================================================================
# Endpoint Inventory Management
# ============================================================================


async def create_or_update_endpoint(
    user_id: str,
    endpoint_id: str,
    endpoint_url: str,
    method: str,
    source: str = "postman",
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Create or update endpoint in inventory.
    
    Args:
        user_id: User identifier
        endpoint_id: Unique endpoint ID (from risk_engine)
        endpoint_url: Full URL
        method: HTTP method
        source: Discovery source (postman, scanner, etc.)
        metadata: Additional endpoint metadata
    
    Returns:
        Endpoint inventory record
    """
    try:
        # Check if endpoint exists
        response = (
            supabase.table("endpoint_inventory")
            .select("*")
            .eq("user_id", user_id)
            .eq("endpoint_id", endpoint_id)
            .single()
            .execute()
        )
        
        existing = response.data if response.data else None
    except Exception:
        existing = None
    
    record = {
        "user_id": user_id,
        "endpoint_id": endpoint_id,
        "endpoint_url": endpoint_url,
        "method": method,
        "status": EndpointStatus.ACTIVE.value,
        "metadata": metadata or {},
        "last_seen": datetime.utcnow().isoformat(),
    }
    
    try:
        if existing:
            # Update
            record["updated_at"] = datetime.utcnow().isoformat()
            supabase.table("endpoint_inventory").update(record).eq(
                "endpoint_id", endpoint_id
            ).eq("user_id", user_id).execute()
        else:
            # Insert
            record["created_at"] = datetime.utcnow().isoformat()
            supabase.table("endpoint_inventory").insert([record]).execute()
        
        return record
    except Exception as e:
        print(f"Error managing endpoint inventory: {str(e)}")
        return record


async def link_endpoint_to_source(
    user_id: str,
    endpoint_id: str,
    source: str,
    source_id: str,
    source_data: Optional[dict[str, Any]] = None,
) -> bool:
    """
    Link endpoint to a data source (scan, cost, risk, etc.).
    
    Args:
        user_id: User identifier
        endpoint_id: Endpoint ID
        source: Source type (postman_scan, llm_usage, risk_score, etc.)
        source_id: ID in source table
        source_data: Additional source-specific data
    
    Returns:
        True if successful
    """
    try:
        record = {
            "user_id": user_id,
            "endpoint_id": endpoint_id,
            "source": source,
            "source_id": source_id,
            "source_data": source_data or {},
            "linked_at": datetime.utcnow().isoformat(),
        }
        
        supabase.table("endpoint_correlations").insert([record]).execute()
        return True
    except Exception as e:
        print(f"Error linking endpoint to source: {str(e)}")
        return False


async def get_endpoint_profile(
    user_id: str,
    endpoint_id: str,
) -> dict[str, Any]:
    """
    Get complete endpoint profile with all correlated data.
    
    Returns:
    - Endpoint inventory record
    - Security scans (latest + trend)
    - Cost data (latest + trend)
    - Risk scores (latest + trend)
    - Timeline of changes
    
    Args:
        user_id: User identifier
        endpoint_id: Endpoint ID
    
    Returns:
        Comprehensive endpoint profile
    """
    try:
        # Get endpoint inventory
        inv_response = (
            supabase.table("endpoint_inventory")
            .select("*")
            .eq("user_id", user_id)
            .eq("endpoint_id", endpoint_id)
            .single()
            .execute()
        )
        
        endpoint = inv_response.data or {}
        
        # Get latest risk score
        risk_response = (
            supabase.table("endpoint_risk_scores")
            .select("*")
            .eq("user_id", user_id)
            .eq("endpoint_id", endpoint_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        
        latest_risk = risk_response.data[0] if risk_response.data else None
        
        # Get latest security scan
        scan_response = (
            supabase.table("postman_scans")
            .select("*")
            .eq("user_id", user_id)
            .eq("endpoint_url", endpoint.get("endpoint_url"))
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        
        latest_scan = scan_response.data[0] if scan_response.data else None
        
        # Get cost data (last 30 days, best effort via LLM usage)
        # Note: Cost data is per-user/model, not per-endpoint
        thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()
        cost_response = (
            supabase.table("llm_usage")
            .select("cost_inr, recorded_at, model")
            .eq("user_id", user_id)
            .gte("recorded_at", thirty_days_ago)
            .order("recorded_at", desc=True)
            .limit(30)
            .execute()
        )
        
        cost_history = cost_response.data or []
        
        # Get all correlations for this endpoint
        corr_response = (
            supabase.table("endpoint_correlations")
            .select("*")
            .eq("user_id", user_id)
            .eq("endpoint_id", endpoint_id)
            .order("linked_at", desc=True)
            .execute()
        )
        
        correlations = corr_response.data or []
        
        # Build profile
        profile = {
            "endpoint_id": endpoint_id,
            "endpoint_url": endpoint.get("endpoint_url"),
            "method": endpoint.get("method"),
            "status": endpoint.get("status", "active"),
            "created_at": endpoint.get("created_at"),
            "updated_at": endpoint.get("updated_at"),
            "last_seen": endpoint.get("last_seen"),
            "metadata": endpoint.get("metadata", {}),
            
            # Current state
            "current": {
                "risk": latest_risk if latest_risk else None,
                "latest_scan": latest_scan if latest_scan else None,
            },
            
            # Historical data
            "history": {
                "cost_30d": cost_history,
                "security_count": len(
                    [c for c in correlations if c.get("source") == "postman_scan"]
                ),
                "risk_score_count": len(
                    [c for c in correlations if c.get("source") == "risk_score"]
                ),
            },
            
            # Correlations
            "correlations": correlations,
        }
        
        return profile
    
    except Exception as e:
        print(f"Error building endpoint profile: {str(e)}")
        return {}


async def get_user_endpoints(
    user_id: str,
    status: Optional[str] = None,
    method: Optional[str] = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """
    Get all endpoints for a user with their current risk scores.
    
    Args:
        user_id: User identifier
        status: Filter by status (active, deprecated, etc.)
        method: Filter by HTTP method
        limit: Max results (1-1000)
    
    Returns:
        List of endpoint records with correlated data
    """
    try:
        query = (
            supabase.table("endpoint_inventory")
            .select("*")
            .eq("user_id", user_id)
        )
        
        if status:
            query = query.eq("status", status)
        if method:
            query = query.eq("method", method)
        
        response = query.order("last_seen", desc=True).limit(min(limit, 1000)).execute()
        
        endpoints = response.data or []
        
        # Enrich with latest risk scores
        for endpoint in endpoints:
            endpoint_id = endpoint.get("endpoint_id")
            
            try:
                risk_response = (
                    supabase.table("endpoint_risk_scores")
                    .select("unified_risk_score, risk_level, created_at")
                    .eq("user_id", user_id)
                    .eq("endpoint_id", endpoint_id)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                
                if risk_response.data:
                    endpoint["risk"] = risk_response.data[0]
                else:
                    endpoint["risk"] = None
            except Exception:
                endpoint["risk"] = None
        
        return endpoints
    
    except Exception as e:
        print(f"Error retrieving user endpoints: {str(e)}")
        return []


async def search_endpoints(
    user_id: str,
    query: str,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """
    Search endpoints by URL pattern or method.
    
    Args:
        user_id: User identifier
        query: Search term (matches URL or method)
        limit: Max results
    
    Returns:
        List of matching endpoints
    """
    try:
        # Query endpoint_inventory with text search
        response = (
            supabase.table("endpoint_inventory")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        
        endpoints = response.data or []
        
        # Client-side filtering (Supabase full-text search optional)
        query_lower = query.lower()
        results = [
            ep for ep in endpoints
            if query_lower in ep.get("endpoint_url", "").lower()
            or query_lower in ep.get("method", "").lower()
        ]
        
        return results[:limit]
    
    except Exception as e:
        print(f"Error searching endpoints: {str(e)}")
        return []


async def get_endpoint_timeline(
    user_id: str,
    endpoint_id: str,
    days: int = 30,
) -> list[dict[str, Any]]:
    """
    Get timeline of security, cost, and risk changes for endpoint.
    
    Returns events in chronological order (oldest first).
    
    Args:
        user_id: User identifier
        endpoint_id: Endpoint ID
        days: Historical period
    
    Returns:
        List of timeline events
    """
    try:
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
        
        # Get security scans
        scans_response = (
            supabase.table("postman_scans")
            .select("created_at, risk_level, issue")
            .eq("user_id", user_id)
            .gte("created_at", cutoff)
            .order("created_at", asc=True)
            .execute()
        )
        
        scans = [
            {
                "type": "security_scan",
                "timestamp": s.get("created_at"),
                "data": {"issue": s.get("issue"), "risk_level": s.get("risk_level")},
            }
            for s in (scans_response.data or [])
        ]
        
        # Get risk score changes
        risk_response = (
            supabase.table("endpoint_risk_scores")
            .select("created_at, unified_risk_score, risk_level")
            .eq("user_id", user_id)
            .eq("endpoint_id", endpoint_id)
            .gte("created_at", cutoff)
            .order("created_at", asc=True)
            .execute()
        )
        
        risks = [
            {
                "type": "risk_score_update",
                "timestamp": r.get("created_at"),
                "data": {"score": r.get("unified_risk_score"), "level": r.get("risk_level")},
            }
            for r in (risk_response.data or [])
        ]
        
        # Merge and sort
        timeline = scans + risks
        timeline.sort(key=lambda x: x.get("timestamp", ""))
        
        return timeline
    
    except Exception as e:
        print(f"Error building timeline: {str(e)}")
        return []


async def get_endpoint_stats(user_id: str) -> dict[str, Any]:
    """
    Get aggregate statistics about user's endpoints.
    
    Returns:
    - Total endpoints
    - By status
    - By method
    - Average risk score
    - Most recently modified
    """
    try:
        response = (
            supabase.table("endpoint_inventory")
            .select("status, method, endpoint_id")
            .eq("user_id", user_id)
            .execute()
        )
        
        endpoints = response.data or []
        
        # Count by status
        status_counts = {}
        for ep in endpoints:
            status = ep.get("status", "active")
            status_counts[status] = status_counts.get(status, 0) + 1
        
        # Count by method
        method_counts = {}
        for ep in endpoints:
            method = ep.get("method", "UNKNOWN")
            method_counts[method] = method_counts.get(method, 0) + 1
        
        # Get average risk score
        all_risks = []
        for endpoint in endpoints:
            endpoint_id = ep.get("endpoint_id")
            try:
                risk_resp = (
                    supabase.table("endpoint_risk_scores")
                    .select("unified_risk_score")
                    .eq("user_id", user_id)
                    .eq("endpoint_id", endpoint_id)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if risk_resp.data:
                    all_risks.append(risk_resp.data[0].get("unified_risk_score", 0))
            except Exception:
                pass
        
        avg_risk = sum(all_risks) / len(all_risks) if all_risks else 0.0
        
        return {
            "total_endpoints": len(endpoints),
            "by_status": status_counts,
            "by_method": method_counts,
            "average_risk_score": round(avg_risk, 2),
        }
    
    except Exception as e:
        print(f"Error computing endpoint stats: {str(e)}")
        return {}
