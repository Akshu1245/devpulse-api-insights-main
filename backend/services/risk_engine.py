"""
Unified Risk Score Engine

Combines security severity and cost anomaly scores into a single risk metric.

Risk Score = (security_weight × security_score) + (cost_weight × cost_anomaly_score)

Where:
- security_score: Aggregated severity from security issues (0-100)
- cost_anomaly_score: Deviation from historical baseline (0-100)
- Weights are configurable, default: security=0.6, cost=0.4
"""

import hashlib
import statistics
from datetime import datetime, timedelta
from typing import Any, Optional
from urllib.parse import urlparse

from backend.services.supabase_client import supabase


# ============================================================================
# Constants
# ============================================================================

RISK_LEVEL_WEIGHTS = {
    "critical": 100,
    "high": 75,
    "medium": 50,
    "low": 25,
    "info": 5,
}

DEFAULT_SECURITY_WEIGHT = 0.6
DEFAULT_COST_WEIGHT = 0.4

# Configurable via environment or defaults
SECURITY_WEIGHT = 0.6
COST_WEIGHT = 0.4


# ============================================================================
# Endpoint ID Generation
# ============================================================================


def normalize_endpoint_url(url: str) -> str:
    """
    Normalize URL for consistent endpoint identification.
    
    Removes query params, fragments, and trailing slashes to create
    a canonical form for the same logical endpoint.
    
    Examples:
    - https://api.example.com/users?limit=50 → https://api.example.com/users
    - https://api.example.com/users/ → https://api.example.com/users
    - https://api.example.com/users#section → https://api.example.com/users
    """
    try:
        parsed = urlparse(url.strip())
        # Reconstruct without query, fragment, and normalize path
        normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path}".rstrip("/")
        return normalized or url
    except Exception:
        return url.strip()


def generate_endpoint_id(url: str, method: str = "GET") -> str:
    """
    Generate a unique, consistent endpoint ID.
    
    Uses normalized URL + method as seed for SHA256 hash.
    Format: endpoint_<hash>
    
    Args:
        url: Full endpoint URL
        method: HTTP method (GET, POST, etc.)
    
    Returns:
        Consistent endpoint_id (e.g., "endpoint_a1b2c3d4...")
    """
    normalized = normalize_endpoint_url(url)
    method_upper = (method or "GET").upper().strip()
    
    # Create seed from normalized URL + method
    seed = f"{normalized}|{method_upper}"
    
    # Hash for consistent ID
    hash_obj = hashlib.sha256(seed.encode("utf-8"))
    hash_hex = hash_obj.hexdigest()[:16]  # Use first 16 chars
    
    return f"endpoint_{hash_hex}"


# ============================================================================
# Security Score Calculation
# ============================================================================


def calculate_security_score(issues: list[dict[str, Any]]) -> float:
    """
    Calculate security score from list of security issues.
    
    Aggregates risk levels using weighted formula.
    Result: 0-100 (0=no issues, 100=critical issues present)
    
    Args:
        issues: List of issue dicts with "risk_level" key
    
    Returns:
        Security score (0-100)
    """
    if not issues:
        return 0.0
    
    # Collect all risk level values
    risk_values = []
    for issue in issues:
        level = issue.get("risk_level", "info").lower()
        weight = RISK_LEVEL_WEIGHTS.get(level, 5)
        risk_values.append(weight)
    
    if not risk_values:
        return 0.0
    
    # Use max as primary score (highest risk issue determines severity)
    max_risk = max(risk_values)
    
    # Average accounts for multiple issues
    avg_risk = sum(risk_values) / len(risk_values)
    
    # Blend: 70% max + 30% average
    blended = (0.7 * max_risk) + (0.3 * avg_risk)
    
    return min(100.0, blended)


# ============================================================================
# Cost Anomaly Calculation
# ============================================================================


async def calculate_cost_anomaly_score(
    user_id: str,
    endpoint_url: Optional[str] = None
) -> float:
    """
    Calculate cost anomaly score by comparing current usage to baseline.
    
    Uses 30-day historical LLM usage data to establish baseline.
    Compares current (today) vs average to derive anomaly score.
    
    Result: 0-100 (0=within baseline, 100=extreme spike)
    
    Args:
        user_id: User identifier
        endpoint_url: Optional endpoint URL (for future endpoint-specific anomaly)
    
    Returns:
        Cost anomaly score (0-100)
    """
    try:
        # Query llm_usage for past 30 days
        thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()
        
        response = (
            supabase.table("llm_usage")
            .select("cost_inr, recorded_at")
            .eq("user_id", user_id)
            .gte("recorded_at", thirty_days_ago)
            .order("recorded_at", desc=True)
            .execute()
        )
        
        records = response.data or []
        
        if not records:
            # No historical data, assume normal (score = 0)
            return 0.0
        
        # Extract costs
        costs = [float(r.get("cost_inr", 0)) for r in records]
        
        if len(costs) < 2:
            # Not enough data for anomaly detection
            return 0.0
        
        # Calculate baseline statistics
        avg_cost = statistics.mean(costs)
        
        # Need at least 2 values for stdev
        if len(costs) >= 2:
            try:
                stdev_cost = statistics.stdev(costs)
            except statistics.StatisticsError:
                stdev_cost = 0.0
        else:
            stdev_cost = 0.0
        
        # Use most recent cost (today's spending)
        current_cost = costs[0]
        
        # Calculate z-score (standard deviations from mean)
        if stdev_cost > 0:
            z_score = (current_cost - avg_cost) / stdev_cost
        else:
            # No variance, check if current is higher than average
            z_score = 1.0 if current_cost > avg_cost else 0.0
        
        # Convert z-score to 0-100 anomaly score
        # z_score < -1: under-spending (score = 0)
        # z_score in [-1, 1]: normal (score = 0-30)
        # z_score in [1, 3]: elevated (score = 30-80)
        # z_score > 3: extreme (score = 80-100)
        
        if z_score < -1:
            anomaly_score = 0.0
        elif z_score <= 1:
            # Linear from 0 to 30
            anomaly_score = ((z_score + 1) / 2) * 30
        elif z_score <= 3:
            # Linear from 30 to 80
            anomaly_score = 30 + ((z_score - 1) / 2) * 50
        else:
            # Logarithmic scale for extreme values
            extreme_factor = min(1.0, (z_score - 3) / 5)
            anomaly_score = 80 + (extreme_factor * 20)
        
        return min(100.0, max(0.0, anomaly_score))
    
    except Exception as e:
        # On error, return neutral score
        print(f"Error calculating cost anomaly: {str(e)}")
        return 0.0


# ============================================================================
# Unified Risk Score
# ============================================================================


async def calculate_unified_risk_score(
    endpoint_id: str,
    endpoint_url: str,
    method: str,
    user_id: str,
    issues: list[dict[str, Any]],
    security_weight: float = SECURITY_WEIGHT,
    cost_weight: float = COST_WEIGHT,
) -> dict[str, Any]:
    """
    Calculate unified risk score combining security and cost metrics.
    
    Args:
        endpoint_id: Unique endpoint identifier
        endpoint_url: Full URL
        method: HTTP method
        user_id: User identifier
        issues: Security issues list
        security_weight: Weight for security score (default: 0.6)
        cost_weight: Weight for cost anomaly (default: 0.4)
    
    Returns:
        Dict with:
        - endpoint_id: str
        - security_score: float (0-100)
        - cost_anomaly_score: float (0-100)
        - unified_risk_score: float (0-100)
        - risk_level: str (critical, high, medium, low, info)
        - component_breakdown: dict with details
    """
    
    # Calculate individual scores
    security_score = calculate_security_score(issues)
    cost_anomaly_score = await calculate_cost_anomaly_score(user_id, endpoint_url)
    
    # Normalize weights (ensure they sum to 1.0)
    weight_sum = security_weight + cost_weight
    if weight_sum == 0:
        security_weight = 0.6
        cost_weight = 0.4
        weight_sum = 1.0
    
    norm_security_weight = security_weight / weight_sum
    norm_cost_weight = cost_weight / weight_sum
    
    # Calculate unified score
    unified_risk_score = (
        (norm_security_weight * security_score) +
        (norm_cost_weight * cost_anomaly_score)
    )
    
    # Determine risk level from unified score
    if unified_risk_score >= 80:
        risk_level = "critical"
    elif unified_risk_score >= 60:
        risk_level = "high"
    elif unified_risk_score >= 40:
        risk_level = "medium"
    elif unified_risk_score >= 20:
        risk_level = "low"
    else:
        risk_level = "info"
    
    return {
        "endpoint_id": endpoint_id,
        "endpoint_url": endpoint_url,
        "method": method,
        "security_score": round(security_score, 2),
        "cost_anomaly_score": round(cost_anomaly_score, 2),
        "unified_risk_score": round(unified_risk_score, 2),
        "risk_level": risk_level,
        "component_breakdown": {
            "security_weight": norm_security_weight,
            "cost_weight": norm_cost_weight,
            "security_issues_count": len(issues),
            "highest_risk_level": max(
                [i.get("risk_level", "info") for i in issues],
                key=lambda x: RISK_LEVEL_WEIGHTS.get(x, 0)
            ) if issues else "none",
        },
        "timestamp": datetime.utcnow().isoformat(),
    }


# ============================================================================
# Database Storage
# ============================================================================


async def store_endpoint_risk_score(
    user_id: str,
    upload_id: str,
    risk_data: dict[str, Any],
) -> bool:
    """
    Store unified risk score in database.
    
    Creates/updates records in:
    - endpoint_risk_scores: Main risk score record
    
    Args:
        user_id: User identifier
        upload_id: Upload batch identifier
        risk_data: Risk score dict from calculate_unified_risk_score
    
    Returns:
        True if successful, False otherwise
    """
    try:
        record = {
            "user_id": user_id,
            "upload_id": upload_id,
            "endpoint_id": risk_data.get("endpoint_id"),
            "endpoint_url": risk_data.get("endpoint_url"),
            "method": risk_data.get("method"),
            "security_score": risk_data.get("security_score"),
            "cost_anomaly_score": risk_data.get("cost_anomaly_score"),
            "unified_risk_score": risk_data.get("unified_risk_score"),
            "risk_level": risk_data.get("risk_level"),
            "created_at": risk_data.get("timestamp"),
        }
        
        # Try to insert into endpoint_risk_scores table
        supabase.table("endpoint_risk_scores").insert([record]).execute()
        return True
    
    except Exception as e:
        print(f"Error storing risk score: {str(e)}")
        return False


async def get_endpoint_risk_history(
    user_id: str,
    endpoint_id: str,
    days: int = 30
) -> list[dict[str, Any]]:
    """
    Get historical risk scores for an endpoint.
    
    Args:
        user_id: User identifier
        endpoint_id: Endpoint ID
        days: Days of history to retrieve (default: 30)
    
    Returns:
        List of risk score records ordered by timestamp
    """
    try:
        cutoff_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
        
        response = (
            supabase.table("endpoint_risk_scores")
            .select("*")
            .eq("user_id", user_id)
            .eq("endpoint_id", endpoint_id)
            .gte("created_at", cutoff_date)
            .order("created_at", desc=True)
            .execute()
        )
        
        return response.data or []
    
    except Exception as e:
        print(f"Error retrieving risk history: {str(e)}")
        return []


# ============================================================================
# Batch Risk Score Calculation
# ============================================================================


async def calculate_batch_risk_scores(
    user_id: str,
    upload_id: str,
    endpoints_with_issues: list[dict[str, Any]],
    security_weight: float = SECURITY_WEIGHT,
    cost_weight: float = COST_WEIGHT,
) -> list[dict[str, Any]]:
    """
    Calculate unified risk scores for multiple endpoints.
    
    Args:
        user_id: User identifier
        upload_id: Upload batch identifier
        endpoints_with_issues: List of endpoint dicts with "url", "method", "issues"
        security_weight: Security score weight
        cost_weight: Cost anomaly weight
    
    Returns:
        List of risk score dicts
    """
    results = []
    
    for endpoint in endpoints_with_issues:
        url = endpoint.get("url", "")
        method = endpoint.get("method", "GET")
        issues = endpoint.get("issues", [])
        
        # Generate endpoint_id
        endpoint_id = generate_endpoint_id(url, method)
        
        # Calculate unified risk score
        risk_score = await calculate_unified_risk_score(
            endpoint_id=endpoint_id,
            endpoint_url=url,
            method=method,
            user_id=user_id,
            issues=issues,
            security_weight=security_weight,
            cost_weight=cost_weight,
        )
        
        # Store in database
        await store_endpoint_risk_score(user_id, upload_id, risk_score)
        
        results.append(risk_score)
    
    return results
