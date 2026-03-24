"""
Cost Anomaly Detection Service

Implements z-score statistical analysis for detecting LLM usage cost anomalies.
- Calculates 30-day rolling baselines
- Detects anomalies using z-score method
- Generates cost alerts with recommendations
- Tracks cost trends and projections
"""

import asyncio
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
from pydantic import BaseModel
import statistics
import math

from services.supabase_client import SupabaseClient


class AnomalyType(str, Enum):
    """Types of cost anomalies"""
    HIGH_SPIKE = "high_spike"
    SUSTAINED_HIGH = "sustained_high"
    ENDPOINT_SURGE = "endpoint_surge"
    MODEL_SHIFT = "model_shift"
    UNUSUAL_PATTERN = "unusual_pattern"


class AlertSeverity(str, Enum):
    """Alert severity levels"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class CostTrend(str, Enum):
    """Cost trend direction"""
    INCREASING = "increasing"
    DECREASING = "decreasing"
    STABLE = "stable"


@dataclass
class StatisticalMetrics:
    """Statistical metrics for cost analysis"""
    mean: float
    median: float
    std_dev: float
    min_value: float
    max_value: float
    percentile_75: float
    percentile_90: float
    percentile_95: float
    coefficient_of_variation: float  # std_dev / mean
    

@dataclass
class AnomalyRecord:
    """Detected anomaly record"""
    anomaly_id: str
    user_id: str
    endpoint_id: Optional[str]
    anomaly_type: AnomalyType
    detected_date: datetime
    anomaly_value: float
    baseline_value: float
    z_score: float
    deviation_percentage: float
    contributing_factors: Dict[str, Any]
    affected_endpoints: List[str]
    

@dataclass
class CostAlert:
    """Cost-based alert"""
    alert_id: str
    user_id: str
    severity: AlertSeverity
    title: str
    description: str
    anomaly_id: str
    detected_date: datetime
    estimated_daily_impact: float
    estimated_monthly_impact: float
    recommendations: List[str]
    action_items: List[str]


class CostAnomalyDetector:
    """
    Detects cost anomalies using statistical analysis.
    
    Algorithm:
    1. Calculate 30-day rolling baseline (mean, std dev)
    2. Apply z-score test: z = (value - mean) / std_dev
    3. Flag anomalies where z-score > 2.5 (99.4% confidence)
    4. Classify anomaly type
    5. Generate alert with recommendations
    """
    
    def __init__(self, supabase_client: SupabaseClient):
        self.db = supabase_client
        self.z_score_threshold = 2.5  # 99.4% confidence interval
        self.min_baseline_days = 7  # Need at least 7 days for valid baseline
        self.baseline_window_days = 30  # Rolling window size
    
    async def detect_anomalies(
        self, 
        user_id: str, 
        lookback_days: int = 1
    ) -> List[AnomalyRecord]:
        """
        Detect cost anomalies for a user.
        
        Args:
            user_id: User UUID
            lookback_days: Number of days to check for anomalies
            
        Returns:
            List of detected anomalies
        """
        anomalies: List[AnomalyRecord] = []
        
        # Get all endpoints for user
        endpoints_response = await self.db.table("endpoints").select("id, name").eq("user_id", user_id).execute()
        
        if not endpoints_response.data:
            return anomalies
        
        # Check each endpoint for anomalies
        for endpoint in endpoints_response.data:
            endpoint_anomalies = await self._detect_endpoint_anomalies(
                user_id=user_id,
                endpoint_id=endpoint["id"],
                endpoint_name=endpoint["name"],
                lookback_days=lookback_days
            )
            anomalies.extend(endpoint_anomalies)
        
        # Check for user-level anomalies
        user_level_anomalies = await self._detect_user_level_anomalies(
            user_id=user_id,
            lookback_days=lookback_days
        )
        anomalies.extend(user_level_anomalies)
        
        return anomalies
    
    async def _detect_endpoint_anomalies(
        self,
        user_id: str,
        endpoint_id: str,
        endpoint_name: str,
        lookback_days: int
    ) -> List[AnomalyRecord]:
        """Detect anomalies for a specific endpoint"""
        anomalies: List[AnomalyRecord] = []
        
        # Get endpoint cost history
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=self.baseline_window_days + lookback_days)
        
        costs_response = await self.db.table("endpoint_llm_costs").select(
            "date, total_cost, model, tokens_used"
        ).eq("endpoint_id", endpoint_id).gte("date", start_date.isoformat()).lte(
            "date", end_date.isoformat()
        ).order("date").execute()
        
        if not costs_response.data or len(costs_response.data) < self.min_baseline_days:
            return anomalies
        
        # Split into baseline and check periods
        baseline_date = end_date - timedelta(days=self.baseline_window_days)
        baseline_costs = [
            record["total_cost"] for record in costs_response.data
            if record["date"] < baseline_date.isoformat()
        ]
        check_costs = [
            record["total_cost"] for record in costs_response.data
            if record["date"] >= baseline_date.isoformat()
        ]
        
        if not baseline_costs or not check_costs:
            return anomalies
        
        # Calculate baseline metrics
        metrics = self._calculate_metrics(baseline_costs)
        
        # Check recent costs for anomalies
        for i, record in enumerate([r for r in costs_response.data if r["date"] >= baseline_date.isoformat()]):
            cost = record["total_cost"]
            record_date = datetime.fromisoformat(record["date"]).date()
            
            # Calculate z-score
            z_score = (cost - metrics.mean) / metrics.std_dev if metrics.std_dev > 0 else 0
            
            # Detect anomaly
            if abs(z_score) > self.z_score_threshold:
                anomaly_type = self._classify_anomaly(
                    z_score, 
                    cost, 
                    metrics,
                    record
                )
                
                deviation_pct = ((cost - metrics.mean) / metrics.mean * 100) if metrics.mean > 0 else 0
                
                anomaly = AnomalyRecord(
                    anomaly_id=f"anom_{endpoint_id}_{record_date.isoformat()}",
                    user_id=user_id,
                    endpoint_id=endpoint_id,
                    anomaly_type=anomaly_type,
                    detected_date=datetime.utcnow(),
                    anomaly_value=cost,
                    baseline_value=metrics.mean,
                    z_score=z_score,
                    deviation_percentage=deviation_pct,
                    contributing_factors={
                        "model": record.get("model"),
                        "tokens_used": record.get("tokens_used"),
                        "endpoint_name": endpoint_name
                    },
                    affected_endpoints=[endpoint_id]
                )
                anomalies.append(anomaly)
        
        return anomalies
    
    async def _detect_user_level_anomalies(
        self,
        user_id: str,
        lookback_days: int
    ) -> List[AnomalyRecord]:
        """Detect user-level cost anomalies across all endpoints"""
        anomalies: List[AnomalyRecord] = []
        
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=self.baseline_window_days + lookback_days)
        
        # Get daily user-level costs
        costs_response = await self.db.table("endpoint_llm_costs").select(
            "date, total_cost"
        ).eq("user_id", user_id).gte("date", start_date.isoformat()).lte(
            "date", end_date.isoformat()
        ).execute()
        
        if not costs_response.data:
            return anomalies
        
        # Aggregate by date
        daily_costs: Dict[str, float] = {}
        for record in costs_response.data:
            date = record["date"]
            daily_costs[date] = daily_costs.get(date, 0) + record["total_cost"]
        
        # Sort and calculate metrics
        sorted_dates = sorted(daily_costs.keys())
        baseline_date = end_date - timedelta(days=self.baseline_window_days)
        
        baseline_costs = [
            daily_costs[date] for date in sorted_dates
            if date < baseline_date.isoformat()
        ]
        
        if len(baseline_costs) < self.min_baseline_days:
            return anomalies
        
        metrics = self._calculate_metrics(baseline_costs)
        
        # Check recent costs
        for date in sorted_dates:
            if date >= baseline_date.isoformat():
                cost = daily_costs[date]
                z_score = (cost - metrics.mean) / metrics.std_dev if metrics.std_dev > 0 else 0
                
                if abs(z_score) > self.z_score_threshold:
                    # Get affected endpoints
                    endpoints_response = await self.db.table("endpoint_llm_costs").select(
                        "endpoint_id"
                    ).eq("user_id", user_id).eq("date", date).execute()
                    
                    affected_endpoints = [
                        e["endpoint_id"] for e in endpoints_response.data
                    ]
                    
                    anomaly_type = self._classify_anomaly(z_score, cost, metrics, None)
                    deviation_pct = ((cost - metrics.mean) / metrics.mean * 100) if metrics.mean > 0 else 0
                    
                    anomaly = AnomalyRecord(
                        anomaly_id=f"anom_user_{user_id}_{date}",
                        user_id=user_id,
                        endpoint_id=None,
                        anomaly_type=anomaly_type,
                        detected_date=datetime.utcnow(),
                        anomaly_value=cost,
                        baseline_value=metrics.mean,
                        z_score=z_score,
                        deviation_percentage=deviation_pct,
                        contributing_factors={"scope": "user_level"},
                        affected_endpoints=affected_endpoints
                    )
                    anomalies.append(anomaly)
        
        return anomalies
    
    def _classify_anomaly(
        self,
        z_score: float,
        current_value: float,
        metrics: StatisticalMetrics,
        record: Optional[Dict[str, Any]]
    ) -> AnomalyType:
        """Classify type of anomaly based on characteristics"""
        abs_z = abs(z_score)
        
        # Very high spike
        if z_score > 3.5:
            return AnomalyType.HIGH_SPIKE
        
        # Model shift
        if record and record.get("model") and "claude-opus" in record.get("model", ""):
            if current_value > metrics.percentile_95:
                return AnomalyType.MODEL_SHIFT
        
        # Sustained pattern
        if 2.5 <= z_score <= 3.5:
            return AnomalyType.SUSTAINED_HIGH
        
        # Endpoint surge
        if record and "endpoint_id" in record:
            return AnomalyType.ENDPOINT_SURGE
        
        return AnomalyType.UNUSUAL_PATTERN
    
    def _calculate_metrics(self, values: List[float]) -> StatisticalMetrics:
        """Calculate statistical metrics for cost data"""
        if not values:
            return StatisticalMetrics(
                mean=0, median=0, std_dev=0, min_value=0, max_value=0,
                percentile_75=0, percentile_90=0, percentile_95=0,
                coefficient_of_variation=0
            )
        
        sorted_values = sorted(values)
        mean = statistics.mean(values)
        median = statistics.median(values)
        std_dev = statistics.stdev(values) if len(values) > 1 else 0
        
        # Calculate percentiles
        def percentile(data: List[float], p: float) -> float:
            index = (len(data) - 1) * (p / 100)
            lower = int(index)
            upper = lower + 1
            if upper >= len(data):
                return data[lower]
            return data[lower] + (data[upper] - data[lower]) * (index - lower)
        
        p75 = percentile(sorted_values, 75)
        p90 = percentile(sorted_values, 90)
        p95 = percentile(sorted_values, 95)
        
        cv = (std_dev / mean * 100) if mean > 0 else 0
        
        return StatisticalMetrics(
            mean=mean,
            median=median,
            std_dev=std_dev,
            min_value=min(values),
            max_value=max(values),
            percentile_75=p75,
            percentile_90=p90,
            percentile_95=p95,
            coefficient_of_variation=cv
        )
    
    async def generate_alerts(
        self,
        anomalies: List[AnomalyRecord]
    ) -> List[CostAlert]:
        """Generate alerts from detected anomalies"""
        alerts: List[CostAlert] = []
        
        for anomaly in anomalies:
            severity = self._assess_severity(anomaly)
            title, description = self._generate_title_description(anomaly)
            recommendations = self._generate_recommendations(anomaly)
            action_items = self._generate_action_items(anomaly)
            
            # Calculate impact estimates
            daily_impact = anomaly.anomaly_value - anomaly.baseline_value
            monthly_impact = daily_impact * 30
            
            alert = CostAlert(
                alert_id=f"alert_{anomaly.anomaly_id}",
                user_id=anomaly.user_id,
                severity=severity,
                title=title,
                description=description,
                anomaly_id=anomaly.anomaly_id,
                detected_date=anomaly.detected_date,
                estimated_daily_impact=max(0, daily_impact),
                estimated_monthly_impact=max(0, monthly_impact),
                recommendations=recommendations,
                action_items=action_items
            )
            alerts.append(alert)
        
        return alerts
    
    def _assess_severity(self, anomaly: AnomalyRecord) -> AlertSeverity:
        """Assess alert severity based on anomaly characteristics"""
        abs_z = abs(anomaly.z_score)
        
        if abs_z > 4.0:
            return AlertSeverity.CRITICAL
        elif abs_z > 3.5:
            return AlertSeverity.HIGH
        elif abs_z > 3.0:
            return AlertSeverity.MEDIUM
        elif abs_z > 2.5:
            return AlertSeverity.LOW
        else:
            return AlertSeverity.INFO
    
    def _generate_title_description(self, anomaly: AnomalyRecord) -> tuple[str, str]:
        """Generate alert title and description"""
        titles = {
            AnomalyType.HIGH_SPIKE: "Critical Cost Spike Detected",
            AnomalyType.SUSTAINED_HIGH: "Sustained High Costs",
            AnomalyType.ENDPOINT_SURGE: "Endpoint Usage Surge",
            AnomalyType.MODEL_SHIFT: "Model Change Impact",
            AnomalyType.UNUSUAL_PATTERN: "Unusual Cost Pattern"
        }
        
        title = titles.get(anomaly.anomaly_type, "Cost Anomaly Detected")
        
        descriptions = {
            AnomalyType.HIGH_SPIKE: f"Cost spiked to ${anomaly.anomaly_value:.2f}, {anomaly.deviation_percentage:.1f}% above baseline of ${anomaly.baseline_value:.2f}",
            AnomalyType.SUSTAINED_HIGH: f"Costs have remained elevated at ${anomaly.anomaly_value:.2f}, {anomaly.deviation_percentage:.1f}% above normal",
            AnomalyType.ENDPOINT_SURGE: f"Endpoint {anomaly.contributing_factors.get('endpoint_name')} showing surge in usage",
            AnomalyType.MODEL_SHIFT: f"Model change (Claude Opus) contributing to {anomaly.deviation_percentage:.1f}% increase",
            AnomalyType.UNUSUAL_PATTERN: f"Unusual spending pattern detected with z-score of {anomaly.z_score:.2f}"
        }
        
        description = descriptions.get(anomaly.anomaly_type, "An unusual cost pattern has been detected")
        return title, description
    
    def _generate_recommendations(self, anomaly: AnomalyRecord) -> List[str]:
        """Generate recommendations based on anomaly"""
        recommendations = []
        
        if anomaly.anomaly_type == AnomalyType.HIGH_SPIKE:
            recommendations.extend([
                "Check for unexpected API usage patterns",
                "Review recent code changes that may affect API calls",
                "Monitor endpoint performance metrics"
            ])
        elif anomaly.anomaly_type == AnomalyType.SUSTAINED_HIGH:
            recommendations.extend([
                "Implement caching to reduce repeated requests",
                "Optimize API response handling",
                "Consider rate limiting on high-traffic endpoints"
            ])
        elif anomaly.anomaly_type == AnomalyType.ENDPOINT_SURGE:
            recommendations.extend([
                "Review endpoint configuration",
                "Check for broken client retry logic",
                "Implement batch processing if applicable"
            ])
        elif anomaly.anomaly_type == AnomalyType.MODEL_SHIFT:
            recommendations.extend([
                "Evaluate if model upgrade was necessary",
                "Consider reverting to previous model if acceptable",
                "Optimize prompts for cost reduction"
            ])
        
        recommendations.extend([
            "Set up cost budget alerts",
            "Review usage trends in dashboard"
        ])
        
        return recommendations
    
    def _generate_action_items(self, anomaly: AnomalyRecord) -> List[str]:
        """Generate action items"""
        items = []
        
        if anomaly.deviation_percentage > 50:
            items.append("URGENT: Investigate high deviation immediately")
        
        if anomaly.affected_endpoints:
            items.append(f"Review {len(anomaly.affected_endpoints)} affected endpoint(s)")
        
        items.append("Compare with compliance requirements")
        items.append("Document root cause")
        
        return items
    
    async def get_cost_trends(
        self,
        user_id: str,
        endpoint_id: Optional[str] = None,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get cost trends for analysis.
        
        Returns trending information:
        - Current trend (increasing/decreasing/stable)
        - Projected costs
        - Historical data
        """
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=days)
        
        # Build query
        query = self.db.table("endpoint_llm_costs").select(
            "date, total_cost, model"
        ).gte("date", start_date.isoformat()).lte("date", end_date.isoformat())
        
        if endpoint_id:
            query = query.eq("endpoint_id", endpoint_id)
        else:
            query = query.eq("user_id", user_id)
        
        response = await query.order("date").execute()
        
        if not response.data:
            return {"status": "no_data"}
        
        # Aggregate by date
        daily_costs: Dict[str, float] = {}
        for record in response.data:
            date = record["date"]
            daily_costs[date] = daily_costs.get(date, 0) + record["total_cost"]
        
        sorted_dates = sorted(daily_costs.keys())
        values = [daily_costs[date] for date in sorted_dates]
        
        # Calculate trend
        trend = self._calculate_trend(values)
        
        # Calculate projections
        projected_monthly = self._project_monthly_cost(values)
        
        # Calculate moving average
        ma_7 = self._moving_average(values, 7)
        
        return {
            "status": "success",
            "daily_costs": daily_costs,
            "trend": trend,
            "current_cost": values[-1] if values else 0,
            "average_cost": statistics.mean(values) if values else 0,
            "projected_monthly": projected_monthly,
            "moving_average_7": ma_7,
            "period_days": days,
            "cost_increase_percentage": self._calculate_change_percentage(values)
        }
    
    def _calculate_trend(self, values: List[float]) -> CostTrend:
        """Determine if costs are increasing, decreasing, or stable"""
        if len(values) < 3:
            return CostTrend.STABLE
        
        # Compare recent average to older average
        mid = len(values) // 2
        recent_avg = statistics.mean(values[mid:])
        older_avg = statistics.mean(values[:mid])
        
        change_pct = abs((recent_avg - older_avg) / older_avg * 100) if older_avg > 0 else 0
        
        if change_pct < 5:  # Less than 5% change is stable
            return CostTrend.STABLE
        elif recent_avg > older_avg:
            return CostTrend.INCREASING
        else:
            return CostTrend.DECREASING
    
    def _project_monthly_cost(self, values: List[float]) -> float:
        """Project monthly cost based on recent average"""
        if not values:
            return 0
        
        # Use last 7 days average as projection basis
        recent_days = min(7, len(values))
        recent_avg = statistics.mean(values[-recent_days:])
        
        return recent_avg * 30
    
    def _moving_average(self, values: List[float], window: int) -> Dict[str, float]:
        """Calculate moving average"""
        if len(values) < window:
            return {}
        
        ma = {}
        for i in range(window - 1, len(values)):
            window_values = values[i - window + 1:i + 1]
            key = f"day_{i}"
            ma[key] = statistics.mean(window_values)
        
        return ma
    
    def _calculate_change_percentage(self, values: List[float]) -> float:
        """Calculate percentage change from start to end"""
        if len(values) < 2 or values[0] == 0:
            return 0
        
        return ((values[-1] - values[0]) / values[0]) * 100


# Request/Response models for API
class CostAnomalyRequest(BaseModel):
    user_id: str
    endpoint_id: Optional[str] = None
    lookback_days: int = 1


class CostTrendRequest(BaseModel):
    user_id: str
    endpoint_id: Optional[str] = None
    days: int = 30


class AnomalyResponse(BaseModel):
    anomaly_id: str
    user_id: str
    endpoint_id: Optional[str]
    anomaly_type: str
    detected_date: datetime
    anomaly_value: float
    baseline_value: float
    z_score: float
    deviation_percentage: float
    affected_endpoints: List[str]


class AlertResponse(BaseModel):
    alert_id: str
    user_id: str
    severity: str
    title: str
    description: str
    detected_date: datetime
    estimated_daily_impact: float
    estimated_monthly_impact: float
    recommendations: List[str]
    action_items: List[str]


class CostTrendResponse(BaseModel):
    status: str
    daily_costs: Dict[str, float]
    trend: str
    current_cost: float
    average_cost: float
    projected_monthly: float
    cost_increase_percentage: float
    period_days: int
