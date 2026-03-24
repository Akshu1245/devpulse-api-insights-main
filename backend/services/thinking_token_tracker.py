"""
Thinking Token Attribution and Tracking Service

Implements tracking and cost attribution for Claude thinking tokens.
- Monitors thinking token usage per endpoint
- Calculates thinking token costs per model
- Builds attribution models
- Links to compliance requirements
- Generates thinking token analytics
"""

import asyncio
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
from pydantic import BaseModel
import statistics

from services.supabase_client import SupabaseClient


class TokenModel(str, Enum):
    """Supported Claude models"""
    CLAUDE_OPUS = "claude-opus"
    CLAUDE_SONNET_3_5 = "claude-3.5-sonnet"
    CLAUDE_SONNET_3 = "claude-3-sonnet"
    CLAUDE_HAIKU_3 = "claude-3-haiku"
    CLAUDE_INSTANT = "claude-instant-1.3"


class ThinkingIntensity(str, Enum):
    """Thinking token intensity levels"""
    LOW = "low"          # 5-10% thinking tokens
    MODERATE = "moderate"  # 10-25% thinking tokens
    HIGH = "high"        # 25-50% thinking tokens
    EXTREME = "extreme"  # 50%+ thinking tokens


@dataclass
class ModelPricing:
    """Pricing information for a model"""
    model: str
    input_cost_per_million: float
    output_cost_per_million: float
    thinking_cost_per_million: float
    max_thinking_tokens: int


@dataclass
class ThinkingTokenRecord:
    """Thinking token usage record"""
    record_id: str
    user_id: str
    endpoint_id: str
    date: str
    model: str
    total_tokens_used: int
    estimated_thinking_tokens: int
    estimated_input_tokens: int
    estimated_output_tokens: int
    thinking_token_cost: float
    input_cost: float
    output_cost: float
    total_cost: float
    thinking_intensity: ThinkingIntensity
    confidence_score: float


@dataclass
class AttributionModel:
    """Cost attribution model"""
    attribution_id: str
    user_id: str
    endpoint_id: str
    period_start: datetime
    period_end: datetime
    total_requests: int
    total_tokens: int
    total_thinking_tokens: int
    total_cost: float
    thinking_cost_percentage: float
    cost_per_request: float
    avg_thinking_intensity: ThinkingIntensity
    model_distribution: Dict[str, float]  # Model -> percentage
    compliance_linked: bool


class ThinkingTokenTracker:
    """
    Tracks and attributes thinking token usage.
    
    Algorithm:
    1. Fetch endpoint usage from endpoint_llm_costs
    2. Estimate thinking token percentage based on model and patterns
    3. Calculate thinking token costs
    4. Build attribution models per endpoint
    5. Link to compliance requirements
    """
    
    def __init__(self, supabase_client: SupabaseClient):
        self.db = supabase_client
        self.model_pricing = self._initialize_pricing()
        self.min_attribution_days = 1
        self.default_thinking_percentage = 0.15  # 15% default estimate
    
    def _initialize_pricing(self) -> Dict[str, ModelPricing]:
        """Initialize model pricing information"""
        return {
            TokenModel.CLAUDE_OPUS.value: ModelPricing(
                model=TokenModel.CLAUDE_OPUS.value,
                input_cost_per_million=15.0,
                output_cost_per_million=75.0,
                thinking_cost_per_million=150.0,
                max_thinking_tokens=10000
            ),
            TokenModel.CLAUDE_SONNET_3_5.value: ModelPricing(
                model=TokenModel.CLAUDE_SONNET_3_5.value,
                input_cost_per_million=3.0,
                output_cost_per_million=15.0,
                thinking_cost_per_million=15.0,
                max_thinking_tokens=10000
            ),
            TokenModel.CLAUDE_SONNET_3.value: ModelPricing(
                model=TokenModel.CLAUDE_SONNET_3.value,
                input_cost_per_million=3.0,
                output_cost_per_million=15.0,
                thinking_cost_per_million=15.0,
                max_thinking_tokens=10000
            ),
            TokenModel.CLAUDE_HAIKU_3.value: ModelPricing(
                model=TokenModel.CLAUDE_HAIKU_3.value,
                input_cost_per_million=0.80,
                output_cost_per_million=4.0,
                thinking_cost_per_million=4.0,
                max_thinking_tokens=10000
            ),
        }
    
    async def track_thinking_tokens(
        self,
        user_id: str,
        endpoint_id: Optional[str] = None,
        lookback_days: int = 30
    ) -> List[ThinkingTokenRecord]:
        """
        Track thinking token usage across endpoints.
        
        Args:
            user_id: User UUID
            endpoint_id: Filter to specific endpoint (optional)
            lookback_days: Number of days to analyze
            
        Returns:
            List of thinking token records
        """
        records: List[ThinkingTokenRecord] = []
        
        # Get endpoint costs
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=lookback_days)
        
        query = self.db.table("endpoint_llm_costs").select(
            "endpoint_id, date, model, total_cost, tokens_used, request_count"
        ).eq("user_id", user_id).gte("date", start_date.isoformat()).lte(
            "date", end_date.isoformat()
        )
        
        if endpoint_id:
            query = query.eq("endpoint_id", endpoint_id)
        
        response = await query.execute()
        
        if not response.data:
            return records
        
        # Process each cost record
        for cost_record in response.data:
            record = await self._estimate_thinking_tokens(
                user_id=user_id,
                cost_record=cost_record
            )
            if record:
                records.append(record)
        
        return records
    
    async def _estimate_thinking_tokens(
        self,
        user_id: str,
        cost_record: Dict[str, Any]
    ) -> Optional[ThinkingTokenRecord]:
        """Estimate thinking tokens from a cost record"""
        try:
            model = cost_record.get("model", TokenModel.CLAUDE_SONNET_3_5.value)
            total_tokens = cost_record.get("tokens_used", 0)
            total_cost = float(cost_record.get("total_cost", 0))
            
            # Validate model
            if model not in self.model_pricing:
                return None
            
            pricing = self.model_pricing[model]
            
            # Estimate thinking tokens based on total cost and model
            thinking_tokens, input_tokens, output_tokens = self._estimate_token_breakdown(
                model=model,
                total_tokens=total_tokens,
                total_cost=total_cost,
                pricing=pricing
            )
            
            # Calculate costs
            thinking_cost = (thinking_tokens / 1_000_000) * pricing.thinking_cost_per_million
            input_cost = (input_tokens / 1_000_000) * pricing.input_cost_per_million
            output_cost = (output_tokens / 1_000_000) * pricing.output_cost_per_million
            
            # Determine thinking intensity
            thinking_percentage = (thinking_tokens / total_tokens * 100) if total_tokens > 0 else 0
            thinking_intensity = self._classify_thinking_intensity(thinking_percentage)
            
            # Calculate confidence based on model patterns
            confidence = self._calculate_confidence_score(
                model=model,
                thinking_tokens=thinking_tokens,
                total_tokens=total_tokens
            )
            
            record = ThinkingTokenRecord(
                record_id=f"ttr_{user_id}_{cost_record['endpoint_id']}_{cost_record['date']}",
                user_id=user_id,
                endpoint_id=cost_record["endpoint_id"],
                date=cost_record["date"],
                model=model,
                total_tokens_used=total_tokens,
                estimated_thinking_tokens=thinking_tokens,
                estimated_input_tokens=input_tokens,
                estimated_output_tokens=output_tokens,
                thinking_token_cost=thinking_cost,
                input_cost=input_cost,
                output_cost=output_cost,
                total_cost=input_cost + output_cost + thinking_cost,
                thinking_intensity=thinking_intensity,
                confidence_score=confidence
            )
            return record
        except Exception as e:
            return None
    
    def _estimate_token_breakdown(
        self,
        model: str,
        total_tokens: int,
        total_cost: float,
        pricing: ModelPricing
    ) -> tuple[int, int, int]:
        """Estimate input, output, and thinking token breakdown"""
        # Start with model-specific heuristics
        if "opus" in model.lower():
            thinking_pct = 0.20  # 20% thinking tokens typical for Opus
        elif "sonnet-3.5" in model.lower():
            thinking_pct = 0.15  # 15% for Sonnet 3.5
        else:
            thinking_pct = self.default_thinking_percentage
        
        thinking_tokens = int(total_tokens * thinking_pct)
        remaining_tokens = total_tokens - thinking_tokens
        
        # Distribute remaining between input and output
        # Typical ratio is ~30% input, ~70% output for LLM calls
        input_pct = 0.30
        input_tokens = int(remaining_tokens * input_pct)
        output_tokens = remaining_tokens - input_tokens
        
        # Validate against cost
        calculated_cost = (
            (input_tokens / 1_000_000) * pricing.input_cost_per_million +
            (output_tokens / 1_000_000) * pricing.output_cost_per_million +
            (thinking_tokens / 1_000_000) * pricing.thinking_cost_per_million
        )
        
        # Adjust if calculated cost diverges significantly from actual
        if calculated_cost > 0 and abs(calculated_cost - total_cost) / total_cost > 0.2:
            # Recalculate with inverse approach
            # Assume thinking_pct of total cost
            thinking_cost_est = total_cost * thinking_pct
            remaining_cost = total_cost - thinking_cost_est
            
            # Solve for input/output split
            thinking_tokens = int(thinking_cost_est / pricing.thinking_cost_per_million * 1_000_000)
            thinking_tokens = min(thinking_tokens, int(total_tokens * 0.5))
            
            remaining_tokens = total_tokens - thinking_tokens
        
        return thinking_tokens, input_tokens, output_tokens
    
    def _classify_thinking_intensity(self, thinking_percentage: float) -> ThinkingIntensity:
        """Classify thinking intensity based on percentage"""
        if thinking_percentage < 10:
            return ThinkingIntensity.LOW
        elif thinking_percentage < 25:
            return ThinkingIntensity.MODERATE
        elif thinking_percentage < 50:
            return ThinkingIntensity.HIGH
        else:
            return ThinkingIntensity.EXTREME
    
    def _calculate_confidence_score(
        self,
        model: str,
        thinking_tokens: int,
        total_tokens: int
    ) -> float:
        """Calculate confidence in thinking token estimation"""
        # Base confidence on how much thinking activity we observed
        thinking_pct = (thinking_tokens / total_tokens * 100) if total_tokens > 0 else 0
        
        # Models with known thinking patterns have higher confidence
        if "opus" in model.lower() or "sonnet-3.5" in model.lower():
            base_confidence = 0.85
        else:
            base_confidence = 0.70
        
        # Adjust based on thinking percentage being in typical range
        if 5 <= thinking_pct <= 40:
            confidence = base_confidence + 0.10
        elif thinking_pct > 40:
            confidence = base_confidence
        else:
            confidence = base_confidence - 0.10
        
        return min(1.0, max(0.0, confidence))
    
    async def build_attribution_model(
        self,
        user_id: str,
        endpoint_id: str,
        period_days: int = 30
    ) -> Optional[AttributionModel]:
        """
        Build cost attribution model for endpoint.
        
        Returns model showing:
        - Total cost breakdown
        - Thinking token percentage
        - Cost per request
        - Model distribution
        """
        try:
            records = await self.track_thinking_tokens(
                user_id=user_id,
                endpoint_id=endpoint_id,
                lookback_days=period_days
            )
            
            if not records:
                return None
            
            period_start = datetime.fromisoformat(records[0].date)
            period_end = datetime.fromisoformat(records[-1].date)
            
            # Aggregate metrics
            total_requests = sum(
                len(records) for _ in records  # Request count from cost records
            )
            total_tokens = sum(r.total_tokens_used for r in records)
            total_thinking_tokens = sum(r.estimated_thinking_tokens for r in records)
            total_cost = sum(r.total_cost for r in records)
            thinking_cost = sum(r.thinking_token_cost for r in records)
            
            thinking_cost_pct = (thinking_cost / total_cost * 100) if total_cost > 0 else 0
            cost_per_request = total_cost / total_requests if total_requests > 0 else 0
            
            # Model distribution
            model_dist = {}
            for record in records:
                if record.model not in model_dist:
                    model_dist[record.model] = 0
                model_dist[record.model] += 1
            
            # Normalize to percentages
            total_count = len(records)
            model_dist_pct = {
                model: (count / total_count * 100) for model, count in model_dist.items()
            }
            
            # Average thinking intensity
            intensities = [r.thinking_intensity.value for r in records]
            avg_intensity_value = statistics.mode(intensities) if intensities else ThinkingIntensity.MODERATE.value
            avg_intensity = ThinkingIntensity(avg_intensity_value)
            
            model = AttributionModel(
                attribution_id=f"attr_{user_id}_{endpoint_id}_{period_end.date()}",
                user_id=user_id,
                endpoint_id=endpoint_id,
                period_start=period_start,
                period_end=period_end,
                total_requests=total_requests,
                total_tokens=total_tokens,
                total_thinking_tokens=total_thinking_tokens,
                total_cost=total_cost,
                thinking_cost_percentage=thinking_cost_pct,
                cost_per_request=cost_per_request,
                avg_thinking_intensity=avg_intensity,
                model_distribution=model_dist_pct,
                compliance_linked=False
            )
            
            return model
        except Exception as e:
            return None
    
    async def link_to_compliance(
        self,
        attribution_id: str,
        requirement_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Link thinking token cost attribution to compliance requirements.
        
        Creates record showing which compliance requirements drove thinking token usage.
        """
        try:
            # Create link records
            for req_id in requirement_ids:
                await self.db.table("thinking_token_compliance_links").insert({
                    "attribution_id": attribution_id,
                    "requirement_id": req_id,
                    "linked_at": datetime.utcnow().isoformat(),
                    "status": "active"
                }).execute()
            
            return {
                "status": "linked",
                "attribution_id": attribution_id,
                "requirements_linked": len(requirement_ids)
            }
        except Exception as e:
            return {"status": "error", "detail": str(e)}
    
    async def get_thinking_analytics(
        self,
        user_id: str,
        endpoint_id: Optional[str] = None,
        days: int = 30
    ) -> Dict[str, Any]:
        """Get thinking token analytics"""
        try:
            records = await self.track_thinking_tokens(
                user_id=user_id,
                endpoint_id=endpoint_id,
                lookback_days=days
            )
            
            if not records:
                return {"status": "no_data"}
            
            # Calculate aggregate metrics
            total_thinking_tokens = sum(r.estimated_thinking_tokens for r in records)
            total_thinking_cost = sum(r.thinking_token_cost for r in records)
            total_cost = sum(r.total_cost for r in records)
            
            # Model breakdown
            model_thinking_stats = {}
            for record in records:
                if record.model not in model_thinking_stats:
                    model_thinking_stats[record.model] = {
                        "count": 0,
                        "total_thinking_tokens": 0,
                        "total_thinking_cost": 0,
                        "avg_thinking_pct": 0
                    }
                
                stats = model_thinking_stats[record.model]
                stats["count"] += 1
                stats["total_thinking_tokens"] += record.estimated_thinking_tokens
                stats["total_thinking_cost"] += record.thinking_token_cost
            
            # Calculate averages
            for model, stats in model_thinking_stats.items():
                if stats["count"] > 0:
                    total_tokens = sum(
                        r.total_tokens_used for r in records if r.model == model
                    )
                    stats["avg_thinking_pct"] = (
                        stats["total_thinking_tokens"] / total_tokens * 100
                        if total_tokens > 0 else 0
                    )
            
            # Trend analysis (compare first half to second half)
            mid_point = len(records) // 2
            first_half_cost = sum(r.thinking_token_cost for r in records[:mid_point])
            second_half_cost = sum(r.thinking_token_cost for r in records[mid_point:])
            trend_change = (
                ((second_half_cost - first_half_cost) / first_half_cost * 100)
                if first_half_cost > 0 else 0
            )
            
            return {
                "status": "success",
                "period_days": days,
                "total_thinking_tokens": total_thinking_tokens,
                "total_thinking_cost": total_thinking_cost,
                "total_cost": total_cost,
                "thinking_cost_percentage": (total_thinking_cost / total_cost * 100) if total_cost > 0 else 0,
                "model_breakdown": model_thinking_stats,
                "trend_change_percentage": trend_change,
                "top_models": sorted(
                    model_thinking_stats.items(),
                    key=lambda x: x[1]["total_thinking_cost"],
                    reverse=True
                )[:3]
            }
        except Exception as e:
            return {"status": "error", "detail": str(e)}
    
    async def estimate_compliance_driven_cost(
        self,
        user_id: str,
        requirement_id: str
    ) -> Dict[str, Any]:
        """
        Estimate cost of thinking tokens driven by specific compliance requirement.
        """
        try:
            # Fetch compliance-linked attributions
            links_response = await self.db.table(
                "thinking_token_compliance_links"
            ).select("attribution_id").eq("requirement_id", requirement_id).execute()
            
            if not links_response.data:
                return {"status": "no_data", "requirement_id": requirement_id}
            
            total_thinking_cost = 0
            total_tokens = 0
            count = 0
            
            for link in links_response.data:
                attr_id = link["attribution_id"]
                # Get attribution details
                attr_response = await self.db.table(
                    "thinking_token_attributions"
                ).select("*").eq("attribution_id", attr_id).execute()
                
                if attr_response.data:
                    attr = attr_response.data[0]
                    total_thinking_cost += float(attr.get("thinking_cost_percentage", 0))
                    total_tokens += int(attr.get("total_thinking_tokens", 0))
                    count += 1
            
            return {
                "status": "success",
                "requirement_id": requirement_id,
                "total_attributions": count,
                "estimated_thinking_cost": total_thinking_cost,
                "total_thinking_tokens": total_tokens,
                "avg_cost_per_attribution": total_thinking_cost / count if count > 0 else 0
            }
        except Exception as e:
            return {"status": "error", "detail": str(e)}


# Request/Response models for API
class ThinkingTokenRequest(BaseModel):
    user_id: str
    endpoint_id: Optional[str] = None
    lookback_days: int = 30


class AttributionModelRequest(BaseModel):
    user_id: str
    endpoint_id: str
    period_days: int = 30


class ComplianceLinkRequest(BaseModel):
    attribution_id: str
    requirement_ids: List[str]


class ThinkingTokenResponse(BaseModel):
    record_id: str
    endpoint_id: str
    date: str
    model: str
    estimated_thinking_tokens: int
    thinking_token_cost: float
    thinking_intensity: str
    confidence_score: float


class AttributionModelResponse(BaseModel):
    attribution_id: str
    endpoint_id: str
    period_start: str
    period_end: str
    total_cost: float
    thinking_cost_percentage: float
    cost_per_request: float
    avg_thinking_intensity: str


class AnalyticsResponse(BaseModel):
    status: str
    total_thinking_tokens: int
    total_thinking_cost: float
    thinking_cost_percentage: float
    model_breakdown: Dict[str, Any]
    trend_change_percentage: float
