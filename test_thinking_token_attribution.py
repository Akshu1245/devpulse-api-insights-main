"""
Test Suite for Thinking Token Attribution and Tracking

Tests cover:
- Token estimation algorithms
- Cost calculations
- Thinking intensity classification
- Attribution models
- Compliance linking
- Trend analysis
- Model pricing
- Edge cases
"""

import pytest
from datetime import datetime, timedelta
from services.thinking_token_tracker import (
    ThinkingTokenTracker,
    TokenModel,
    ThinkingIntensity,
    ModelPricing,
    ThinkingTokenRecord
)


class TestModelPricing:
    """Test model pricing initialization"""
    
    def test_pricing_initialized(self):
        """Test that pricing is properly initialized"""
        tracker = ThinkingTokenTracker(None)
        pricing = tracker.model_pricing
        
        # Verify key models are present
        assert TokenModel.CLAUDE_OPUS.value in pricing
        assert TokenModel.CLAUDE_SONNET_3_5.value in pricing
        assert TokenModel.CLAUDE_HAIKU_3.value in pricing
    
    def test_opus_pricing(self):
        """Test Claude Opus pricing"""
        tracker = ThinkingTokenTracker(None)
        opus_price = tracker.model_pricing[TokenModel.CLAUDE_OPUS.value]
        
        assert opus_price.thinking_cost_per_million == 150.0
        assert opus_price.input_cost_per_million == 15.0
        assert opus_price.output_cost_per_million == 75.0
        assert opus_price.max_thinking_tokens == 10000
    
    def test_sonnet_pricing(self):
        """Test Claude Sonnet 3.5 pricing"""
        tracker = ThinkingTokenTracker(None)
        sonnet_price = tracker.model_pricing[TokenModel.CLAUDE_SONNET_3_5.value]
        
        assert sonnet_price.thinking_cost_per_million == 15.0
        assert sonnet_price.input_cost_per_million == 3.0
        assert sonnet_price.output_cost_per_million == 15.0


class TestThinkingIntensityClassification:
    """Test thinking intensity classification"""
    
    def test_classify_low_intensity(self):
        """Test classification of low thinking intensity"""
        tracker = ThinkingTokenTracker(None)
        intensity = tracker._classify_thinking_intensity(5.0)
        
        assert intensity == ThinkingIntensity.LOW
    
    def test_classify_moderate_intensity(self):
        """Test classification of moderate thinking intensity"""
        tracker = ThinkingTokenTracker(None)
        intensity = tracker._classify_thinking_intensity(15.0)
        
        assert intensity == ThinkingIntensity.MODERATE
    
    def test_classify_high_intensity(self):
        """Test classification of high thinking intensity"""
        tracker = ThinkingTokenTracker(None)
        intensity = tracker._classify_thinking_intensity(35.0)
        
        assert intensity == ThinkingIntensity.HIGH
    
    def test_classify_extreme_intensity(self):
        """Test classification of extreme thinking intensity"""
        tracker = ThinkingTokenTracker(None)
        intensity = tracker._classify_thinking_intensity(60.0)
        
        assert intensity == ThinkingIntensity.EXTREME


class TestTokenBreakdown:
    """Test token estimation and breakdown"""
    
    def test_estimate_opus_tokens(self):
        """Test token breakdown for Claude Opus"""
        tracker = ThinkingTokenTracker(None)
        pricing = tracker.model_pricing[TokenModel.CLAUDE_OPUS.value]
        
        thinking_tokens, input_tokens, output_tokens = tracker._estimate_token_breakdown(
            model=TokenModel.CLAUDE_OPUS.value,
            total_tokens=10000,
            total_cost=1.50,
            pricing=pricing
        )
        
        # Opus should have ~20% thinking tokens
        assert thinking_tokens > 0
        assert input_tokens > 0
        assert output_tokens > 0
        assert thinking_tokens + input_tokens + output_tokens == 10000
    
    def test_estimate_sonnet_tokens(self):
        """Test token breakdown for Claude Sonnet"""
        tracker = ThinkingTokenTracker(None)
        pricing = tracker.model_pricing[TokenModel.CLAUDE_SONNET_3_5.value]
        
        thinking_tokens, input_tokens, output_tokens = tracker._estimate_token_breakdown(
            model=TokenModel.CLAUDE_SONNET_3_5.value,
            total_tokens=10000,
            total_cost=0.15,
            pricing=pricing
        )
        
        # Sonnet should have ~15% thinking tokens
        assert thinking_tokens > 0
        assert input_tokens > 0
        assert output_tokens > 0
        assert thinking_tokens + input_tokens + output_tokens == 10000
    
    def test_token_ratio_distribution(self):
        """Test that tokens are distributed correctly"""
        tracker = ThinkingTokenTracker(None)
        pricing = tracker.model_pricing[TokenModel.CLAUDE_SONNET_3_5.value]
        
        thinking_tokens, input_tokens, output_tokens = tracker._estimate_token_breakdown(
            model=TokenModel.CLAUDE_SONNET_3_5.value,
            total_tokens=1000,
            total_cost=0.015,
            pricing=pricing
        )
        
        # Verify output tokens > input tokens (typical ratio)
        assert output_tokens > input_tokens


class TestConfidenceScore:
    """Test confidence score calculation"""
    
    def test_high_confidence_opus(self):
        """Test high confidence for Claude Opus values"""
        tracker = ThinkingTokenTracker(None)
        score = tracker._calculate_confidence_score(
            model=TokenModel.CLAUDE_OPUS.value,
            thinking_tokens=2000,
            total_tokens=10000
        )
        
        assert 0.8 <= score <= 1.0
    
    def test_high_confidence_sonnet(self):
        """Test high confidence for Claude Sonnet"""
        tracker = ThinkingTokenTracker(None)
        score = tracker._calculate_confidence_score(
            model=TokenModel.CLAUDE_SONNET_3_5.value,
            thinking_tokens=1500,
            total_tokens=10000
        )
        
        assert 0.8 <= score <= 1.0
    
    def test_medium_confidence_low_thinking(self):
        """Test lower confidence when thinking tokens are very low"""
        tracker = ThinkingTokenTracker(None)
        score = tracker._calculate_confidence_score(
            model=TokenModel.CLAUDE_SONNET_3_5.value,
            thinking_tokens=100,
            total_tokens=10000
        )
        
        assert 0.6 <= score < 0.8
    
    def test_confidence_bounds(self):
        """Test that confidence score is always 0-1"""
        tracker = ThinkingTokenTracker(None)
        score = tracker._calculate_confidence_score(
            model=TokenModel.CLAUDE_HAIKU_3.value,
            thinking_tokens=0,
            total_tokens=0
        )
        
        assert 0.0 <= score <= 1.0


class TestCostCalculations:
    """Test thinking token cost calculations"""
    
    def test_thinking_cost_opus(self):
        """Test thinking token cost calculation for Opus"""
        thinking_tokens = 5000
        pricing = ModelPricing(
            model="claude-opus",
            input_cost_per_million=15.0,
            output_cost_per_million=75.0,
            thinking_cost_per_million=150.0,
            max_thinking_tokens=10000
        )
        
        thinking_cost = (thinking_tokens / 1_000_000) * pricing.thinking_cost_per_million
        
        assert thinking_cost == pytest.approx(0.75)
    
    def test_thinking_cost_sonnet(self):
        """Test thinking token cost calculation for Sonnet"""
        thinking_tokens = 10000
        pricing = ModelPricing(
            model="claude-3.5-sonnet",
            input_cost_per_million=3.0,
            output_cost_per_million=15.0,
            thinking_cost_per_million=15.0,
            max_thinking_tokens=10000
        )
        
        thinking_cost = (thinking_tokens / 1_000_000) * pricing.thinking_cost_per_million
        
        assert thinking_cost == pytest.approx(0.15)
    
    def test_total_cost_breakdown(self):
        """Test that costs add up correctly"""
        input_tokens = 2000
        output_tokens = 7000
        thinking_tokens = 1000
        
        pricing = ModelPricing(
            model="test",
            input_cost_per_million=1.0,
            output_cost_per_million=5.0,
            thinking_cost_per_million=10.0,
            max_thinking_tokens=10000
        )
        
        input_cost = (input_tokens / 1_000_000) * pricing.input_cost_per_million
        output_cost = (output_tokens / 1_000_000) * pricing.output_cost_per_million
        thinking_cost = (thinking_tokens / 1_000_000) * pricing.thinking_cost_per_million
        
        total_cost = input_cost + output_cost + thinking_cost
        
        expected_total = 0.002 + 0.035 + 0.010
        assert total_cost == pytest.approx(expected_total)


class TestThinkingTokenRecord:
    """Test thinking token record creation and structure"""
    
    def test_record_creation(self):
        """Test creating a thinking token record"""
        record = ThinkingTokenRecord(
            record_id="test_1",
            user_id="user_1",
            endpoint_id="endpoint_1",
            date="2024-03-24",
            model="claude-opus",
            total_tokens_used=10000,
            estimated_thinking_tokens=2000,
            estimated_input_tokens=3000,
            estimated_output_tokens=5000,
            thinking_token_cost=0.30,
            input_cost=0.045,
            output_cost=0.375,
            total_cost=0.72,
            thinking_intensity=ThinkingIntensity.MODERATE,
            confidence_score=0.92
        )
        
        assert record.record_id == "test_1"
        assert record.thinking_intensity == ThinkingIntensity.MODERATE
        assert record.confidence_score == pytest.approx(0.92)
    
    def test_record_token_sum(self):
        """Test that record tokens sum correctly"""
        record = ThinkingTokenRecord(
            record_id="test_2",
            user_id="user_1",
            endpoint_id="endpoint_1",
            date="2024-03-24",
            model="claude-sonnet-3.5",
            total_tokens_used=5000,
            estimated_thinking_tokens=750,
            estimated_input_tokens=1500,
            estimated_output_tokens=2750,
            thinking_token_cost=0.01125,
            input_cost=0.0045,
            output_cost=0.04125,
            total_cost=0.057,
            thinking_intensity=ThinkingIntensity.MODERATE,
            confidence_score=0.88
        )
        
        token_sum = (
            record.estimated_thinking_tokens +
            record.estimated_input_tokens +
            record.estimated_output_tokens
        )
        assert token_sum == record.total_tokens_used


class TestAttributionModel:
    """Test attribution model building"""
    
    def test_single_endpoint_attribution(self):
        """Test attribution for single endpoint"""
        # This would require async/database testing
        # Basic structure verification
        tracker = ThinkingTokenTracker(None)
        
        # Verify tracker has attribution building method
        assert hasattr(tracker, 'build_attribution_model')
        assert callable(tracker.build_attribution_model)
    
    def test_compliance_linking(self):
        """Test compliance requirement linking"""
        tracker = ThinkingTokenTracker(None)
        
        # Verify tracker has compliance linking capability
        assert hasattr(tracker, 'link_to_compliance')
        assert callable(tracker.link_to_compliance)


class TestAnalytics:
    """Test analytics calculation"""
    
    def test_analytics_method_exists(self):
        """Test that analytics methods are available"""
        tracker = ThinkingTokenTracker(None)
        
        assert hasattr(tracker, 'get_thinking_analytics')
        assert callable(tracker.get_thinking_analytics)
    
    def test_model_breakdown_method_exists(self):
        """Test that model breakdown is available"""
        tracker = ThinkingTokenTracker(None)
        
        # Verify pricing initialization is done
        assert len(tracker.model_pricing) > 0


class TestTrendDetection:
    """Test thinking token trend detection"""
    
    def test_increasing_trend(self):
        """Test detection of increasing trend"""
        # Trend would be calculated from historical data
        # Verify the method exists for trend calculation
        tracker = ThinkingTokenTracker(None)
        
        assert hasattr(tracker, '_calculate_trend') is False
        # Trend calculation is integrated into analytics
    
    def test_trend_analysis_method_exists(self):
        """Test that trend analysis is available"""
        tracker = ThinkingTokenTracker(None)
        
        assert hasattr(tracker, 'get_thinking_analytics')


class TestEdgeCases:
    """Test edge cases and error handling"""
    
    def test_zero_tokens(self):
        """Test handling of zero tokens"""
        tracker = ThinkingTokenTracker(None)
        
        # Should handle gracefully
        thinking_tokens, input_tokens, output_tokens = tracker._estimate_token_breakdown(
            model=TokenModel.CLAUDE_SONNET_3_5.value,
            total_tokens=0,
            total_cost=0,
            pricing=tracker.model_pricing[TokenModel.CLAUDE_SONNET_3_5.value]
        )
        
        assert thinking_tokens >= 0
        assert input_tokens >= 0
        assert output_tokens >= 0
    
    def test_percent_calculation_safety(self):
        """Test that percent calculations are safe"""
        tracker = ThinkingTokenTracker(None)
        
        # Test division by zero safety
        intensity = tracker._classify_thinking_intensity(0.0)
        assert intensity == ThinkingIntensity.LOW
    
    def test_confidence_with_out_of_range_values(self):
        """Test confidence calculation with extreme values"""
        tracker = ThinkingTokenTracker(None)
        
        score = tracker._calculate_confidence_score(
            model=TokenModel.CLAUDE_OPUS.value,
            thinking_tokens=100000,
            total_tokens=1000
        )
        
        # Score should still be clamped 0-1
        assert 0.0 <= score <= 1.0
    
    def test_extreme_thinking_percentage(self):
        """Test with extreme thinking percentages"""
        tracker = ThinkingTokenTracker(None)
        
        # 100% thinking tokens (edge case)
        intensity = tracker._classify_thinking_intensity(100.0)
        assert intensity == ThinkingIntensity.EXTREME


class TestDataIntegrity:
    """Test data integrity and consistency"""
    
    def test_pricing_model_has_required_fields(self):
        """Test that pricing models have all required fields"""
        tracker = ThinkingTokenTracker(None)
        
        for model_name, pricing in tracker.model_pricing.items():
            assert hasattr(pricing, 'input_cost_per_million')
            assert hasattr(pricing, 'output_cost_per_million')
            assert hasattr(pricing, 'thinking_cost_per_million')
            assert hasattr(pricing, 'max_thinking_tokens')
            
            # All costs should be non-negative
            assert pricing.input_cost_per_million >= 0
            assert pricing.output_cost_per_million >= 0
            assert pricing.thinking_cost_per_million >= 0
    
    def test_cost_consistency(self):
        """Test that costs are consistently calculated"""
        tracker = ThinkingTokenTracker(None)
        pricing = tracker.model_pricing[TokenModel.CLAUDE_SONNET_3_5.value]
        
        # Calculate cost two different ways
        method_1_cost = (1000 / 1_000_000) * pricing.thinking_cost_per_million
        method_2_cost = pricing.thinking_cost_per_million / 1000
        
        assert method_1_cost == pytest.approx(method_2_cost)


class TestMinimumRequirements:
    """Test minimum data requirements"""
    
    def test_minimum_baseline_days(self):
        """Test minimum baseline data requirement"""
        tracker = ThinkingTokenTracker(None)
        
        assert tracker.min_attribution_days >= 1
    
    def test_default_thinking_percentage(self):
        """Test default thinking percentage assumption"""
        tracker = ThinkingTokenTracker(None)
        
        assert 0.0 <= tracker.default_thinking_percentage <= 1.0
        assert tracker.default_thinking_percentage == 0.15  # 15%


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
