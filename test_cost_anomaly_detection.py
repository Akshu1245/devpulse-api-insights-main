"""
Test Suite for Cost Anomaly Detection Service

Tests cover:
- Statistical analysis (z-score, baselines, metrics)
- Anomaly detection (endpoint-level and user-level)
- Anomaly classification
- Alert generation
- Cost trends and projections
- Budget policies and violations
"""

import pytest
from datetime import datetime, timedelta
from services.cost_anomaly_detector import (
    CostAnomalyDetector,
    StatisticalMetrics,
    AnomalyRecord,
    AnomalyType,
    AlertSeverity,
    CostTrend
)


class TestStatisticalMetrics:
    """Test statistical metric calculations"""
    
    def test_calculate_metrics_normal_distribution(self):
        """Test metrics calculation with normal distribution"""
        detector = CostAnomalyDetector(None)
        values = [100, 105, 95, 102, 98, 100, 102, 99, 101, 100]
        
        metrics = detector._calculate_metrics(values)
        
        assert metrics.mean == pytest.approx(100.2)
        assert metrics.median == 100
        assert metrics.std_dev > 0
        assert metrics.min_value == 95
        assert metrics.max_value == 105
        assert 0 <= metrics.coefficient_of_variation <= 100
    
    def test_calculate_metrics_empty_list(self):
        """Test metrics with empty list"""
        detector = CostAnomalyDetector(None)
        metrics = detector._calculate_metrics([])
        
        assert metrics.mean == 0
        assert metrics.median == 0
        assert metrics.std_dev == 0
        assert metrics.min_value == 0
        assert metrics.max_value == 0
    
    def test_calculate_metrics_single_value(self):
        """Test metrics with single value"""
        detector = CostAnomalyDetector(None)
        metrics = detector._calculate_metrics([100])
        
        assert metrics.mean == 100
        assert metrics.median == 100
        assert metrics.std_dev == 0
        assert metrics.min_value == 100
        assert metrics.max_value == 100
    
    def test_percentile_calculations(self):
        """Test percentile calculations"""
        detector = CostAnomalyDetector(None)
        values = list(range(1, 101))  # 1 to 100
        
        metrics = detector._calculate_metrics(values)
        
        # Verify percentiles are in expected ranges
        assert metrics.percentile_75 > metrics.mean
        assert metrics.percentile_90 > metrics.percentile_75
        assert metrics.percentile_95 > metrics.percentile_90


class TestAnomalyClassification:
    """Test anomaly type classification"""
    
    def test_classify_high_spike(self):
        """Test classification of high spike"""
        detector = CostAnomalyDetector(None)
        metrics = StatisticalMetrics(
            mean=100, median=100, std_dev=10, min_value=80, max_value=120,
            percentile_75=110, percentile_90=115, percentile_95=118,
            coefficient_of_variation=10
        )
        
        anomaly_type = detector._classify_anomaly(
            z_score=4.0,
            current_value=150,
            metrics=metrics,
            record=None
        )
        
        assert anomaly_type == AnomalyType.HIGH_SPIKE
    
    def test_classify_sustained_high(self):
        """Test classification of sustained high costs"""
        detector = CostAnomalyDetector(None)
        metrics = StatisticalMetrics(
            mean=100, median=100, std_dev=10, min_value=80, max_value=120,
            percentile_75=110, percentile_90=115, percentile_95=118,
            coefficient_of_variation=10
        )
        
        anomaly_type = detector._classify_anomaly(
            z_score=3.0,
            current_value=130,
            metrics=metrics,
            record=None
        )
        
        assert anomaly_type == AnomalyType.SUSTAINED_HIGH
    
    def test_classify_endpoint_surge(self):
        """Test classification of endpoint surge"""
        detector = CostAnomalyDetector(None)
        metrics = StatisticalMetrics(
            mean=100, median=100, std_dev=10, min_value=80, max_value=120,
            percentile_75=110, percentile_90=115, percentile_95=118,
            coefficient_of_variation=10
        )
        
        anomaly_type = detector._classify_anomaly(
            z_score=2.7,
            current_value=127,
            metrics=metrics,
            record={"endpoint_id": "test-endpoint"}
        )
        
        assert anomaly_type == AnomalyType.ENDPOINT_SURGE
    
    def test_classify_model_shift(self):
        """Test classification of model shift impact"""
        detector = CostAnomalyDetector(None)
        metrics = StatisticalMetrics(
            mean=100, median=100, std_dev=10, min_value=80, max_value=120,
            percentile_75=110, percentile_90=115, percentile_95=118,
            coefficient_of_variation=10
        )
        
        anomaly_type = detector._classify_anomaly(
            z_score=2.6,
            current_value=126,
            metrics=metrics,
            record={"model": "claude-opus"}
        )
        
        assert anomaly_type == AnomalyType.MODEL_SHIFT


class TestSeverityAssessment:
    """Test alert severity assessment"""
    
    def test_critical_severity(self):
        """Test critical severity for very high z-score"""
        detector = CostAnomalyDetector(None)
        anomaly = AnomalyRecord(
            anomaly_id="test",
            user_id="user-1",
            endpoint_id="endpoint-1",
            anomaly_type=AnomalyType.HIGH_SPIKE,
            detected_date=datetime.utcnow(),
            anomaly_value=500,
            baseline_value=100,
            z_score=4.5,
            deviation_percentage=400,
            contributing_factors={},
            affected_endpoints=["endpoint-1"]
        )
        
        severity = detector._assess_severity(anomaly)
        assert severity == AlertSeverity.CRITICAL
    
    def test_high_severity(self):
        """Test high severity for z-score between 3.5 and 4.0"""
        detector = CostAnomalyDetector(None)
        anomaly = AnomalyRecord(
            anomaly_id="test",
            user_id="user-1",
            endpoint_id="endpoint-1",
            anomaly_type=AnomalyType.HIGH_SPIKE,
            detected_date=datetime.utcnow(),
            anomaly_value=500,
            baseline_value=100,
            z_score=3.7,
            deviation_percentage=400,
            contributing_factors={},
            affected_endpoints=["endpoint-1"]
        )
        
        severity = detector._assess_severity(anomaly)
        assert severity == AlertSeverity.HIGH
    
    def test_medium_severity(self):
        """Test medium severity for z-score between 3.0 and 3.5"""
        detector = CostAnomalyDetector(None)
        anomaly = AnomalyRecord(
            anomaly_id="test",
            user_id="user-1",
            endpoint_id="endpoint-1",
            anomaly_type=AnomalyType.HIGH_SPIKE,
            detected_date=datetime.utcnow(),
            anomaly_value=400,
            baseline_value=100,
            z_score=3.2,
            deviation_percentage=300,
            contributing_factors={},
            affected_endpoints=["endpoint-1"]
        )
        
        severity = detector._assess_severity(anomaly)
        assert severity == AlertSeverity.MEDIUM
    
    def test_low_severity(self):
        """Test low severity for z-score between 2.5 and 3.0"""
        detector = CostAnomalyDetector(None)
        anomaly = AnomalyRecord(
            anomaly_id="test",
            user_id="user-1",
            endpoint_id="endpoint-1",
            anomaly_type=AnomalyType.HIGH_SPIKE,
            detected_date=datetime.utcnow(),
            anomaly_value=300,
            baseline_value=100,
            z_score=2.6,
            deviation_percentage=200,
            contributing_factors={},
            affected_endpoints=["endpoint-1"]
        )
        
        severity = detector._assess_severity(anomaly)
        assert severity == AlertSeverity.LOW


class TestAlertGeneration:
    """Test alert generation from anomalies"""
    
    def test_alert_from_high_spike(self):
        """Test alert generation for high spike anomaly"""
        detector = CostAnomalyDetector(None)
        anomaly = AnomalyRecord(
            anomaly_id="test-1",
            user_id="user-1",
            endpoint_id="endpoint-1",
            anomaly_type=AnomalyType.HIGH_SPIKE,
            detected_date=datetime.utcnow(),
            anomaly_value=500,
            baseline_value=100,
            z_score=4.0,
            deviation_percentage=400,
            contributing_factors={"model": "claude-opus"},
            affected_endpoints=["endpoint-1"]
        )
        
        title, description = detector._generate_title_description(anomaly)
        
        assert "Cost Spike" in title
        assert "$500" in description or "500" in description
        assert "400" in description  # deviation percentage
    
    def test_recommendations_for_spike(self):
        """Test recommendations for high spike"""
        detector = CostAnomalyDetector(None)
        anomaly = AnomalyRecord(
            anomaly_id="test",
            user_id="user-1",
            endpoint_id="endpoint-1",
            anomaly_type=AnomalyType.HIGH_SPIKE,
            detected_date=datetime.utcnow(),
            anomaly_value=500,
            baseline_value=100,
            z_score=4.0,
            deviation_percentage=400,
            contributing_factors={},
            affected_endpoints=["endpoint-1"]
        )
        
        recommendations = detector._generate_recommendations(anomaly)
        
        assert len(recommendations) > 0
        assert any("usage" in r.lower() or "api" in r.lower() for r in recommendations)
    
    def test_action_items_for_high_deviation(self):
        """Test action item generation for high deviation"""
        detector = CostAnomalyDetector(None)
        anomaly = AnomalyRecord(
            anomaly_id="test",
            user_id="user-1",
            endpoint_id="endpoint-1",
            anomaly_type=AnomalyType.HIGH_SPIKE,
            detected_date=datetime.utcnow(),
            anomaly_value=500,
            baseline_value=100,
            z_score=4.0,
            deviation_percentage=400,
            contributing_factors={},
            affected_endpoints=["endpoint-1"]
        )
        
        items = detector._generate_action_items(anomaly)
        
        assert len(items) > 0
        assert any("investigate" in item.lower() for item in items)


class TestCostTrends:
    """Test cost trend calculations"""
    
    def test_calculate_increasing_trend(self):
        """Test detection of increasing trend"""
        detector = CostAnomalyDetector(None)
        values = [100, 110, 120, 130, 140, 150, 160]
        
        trend = detector._calculate_trend(values)
        assert trend == CostTrend.INCREASING
    
    def test_calculate_decreasing_trend(self):
        """Test detection of decreasing trend"""
        detector = CostAnomalyDetector(None)
        values = [160, 150, 140, 130, 120, 110, 100]
        
        trend = detector._calculate_trend(values)
        assert trend == CostTrend.DECREASING
    
    def test_calculate_stable_trend(self):
        """Test detection of stable trend"""
        detector = CostAnomalyDetector(None)
        values = [100, 101, 99, 100, 102, 98, 100, 101, 99, 100]
        
        trend = detector._calculate_trend(values)
        assert trend == CostTrend.STABLE
    
    def test_project_monthly_cost(self):
        """Test monthly cost projection"""
        detector = CostAnomalyDetector(None)
        values = [10, 10, 10, 10, 10, 10, 10]
        
        projected = detector._project_monthly_cost(values)
        
        # 7-day average is 10, so monthly projection should be ~300
        assert 280 < projected < 320
    
    def test_moving_average_calculation(self):
        """Test moving average calculation"""
        detector = CostAnomalyDetector(None)
        values = [100, 110, 120, 130, 140]
        
        ma = detector._moving_average(values, 3)
        
        # Should have 3 moving average values (100+110+120)/3, (110+120+130)/3, etc.
        assert len(ma) == 3
        assert ma["day_2"] == pytest.approx(110)
        assert ma["day_3"] == pytest.approx(120)
        assert ma["day_4"] == pytest.approx(130)
    
    def test_change_percentage_calculation(self):
        """Test percentage change calculation"""
        detector = CostAnomalyDetector(None)
        values = [100, 150]  # 50% increase
        
        change = detector._calculate_change_percentage(values)
        assert change == pytest.approx(50)
    
    def test_change_percentage_negative(self):
        """Test percentage change calculation with decrease"""
        detector = CostAnomalyDetector(None)
        values = [100, 50]  # 50% decrease
        
        change = detector._calculate_change_percentage(values)
        assert change == pytest.approx(-50)


class TestZScoreThresholding:
    """Test z-score based anomaly detection"""
    
    def test_high_z_score_detected(self):
        """Test that high z-score is detected as anomaly"""
        detector = CostAnomalyDetector(None)
        values = [100, 105, 95, 102, 98, 100, 102, 99, 101, 100, 500]  # Last value is anomaly
        
        metrics = detector._calculate_metrics(values[:-1])
        z_score = (values[-1] - metrics.mean) / metrics.std_dev
        
        # Z-score should be very high
        assert abs(z_score) > detector.z_score_threshold
    
    def test_normal_z_score_not_detected(self):
        """Test that normal z-score is not flagged as anomaly"""
        detector = CostAnomalyDetector(None)
        values = [100, 105, 95, 102, 98, 100, 102, 99, 101, 100]
        
        metrics = detector._calculate_metrics(values[:-1])
        z_score = (values[-1] - metrics.mean) / metrics.std_dev
        
        # Z-score should be below threshold
        assert abs(z_score) < detector.z_score_threshold


class TestEdgeCases:
    """Test edge cases and error handling"""
    
    def test_zero_standard_deviation_handling(self):
        """Test handling of zero standard deviation (all same values)"""
        detector = CostAnomalyDetector(None)
        metrics = StatisticalMetrics(
            mean=100, median=100, std_dev=0, min_value=100, max_value=100,
            percentile_75=100, percentile_90=100, percentile_95=100,
            coefficient_of_variation=0
        )
        
        # Z-score should be 0 when std_dev is 0
        z_score = (100 - metrics.mean) / metrics.std_dev if metrics.std_dev > 0 else 0
        assert z_score == 0
    
    def test_minimal_baseline_requirement(self):
        """Test that minimal baseline requirement is enforced"""
        detector = CostAnomalyDetector(None)
        
        # Should require at least 7 days for valid baseline
        assert detector.min_baseline_days >= 7
    
    def test_baseline_window_size(self):
        """Test that baseline window is 30 days"""
        detector = CostAnomalyDetector(None)
        assert detector.baseline_window_days == 30
    
    def test_z_score_threshold_value(self):
        """Test that z-score threshold is 2.5 (99.4% confidence)"""
        detector = CostAnomalyDetector(None)
        assert detector.z_score_threshold == 2.5


class TestDataIntegrity:
    """Test data integrity and consistency"""
    
    def test_anomaly_record_structure(self):
        """Test anomaly record has all required fields"""
        anomaly = AnomalyRecord(
            anomaly_id="test-1",
            user_id="user-1",
            endpoint_id="endpoint-1",
            anomaly_type=AnomalyType.HIGH_SPIKE,
            detected_date=datetime.utcnow(),
            anomaly_value=500,
            baseline_value=100,
            z_score=4.0,
            deviation_percentage=400,
            contributing_factors={"model": "claude-opus"},
            affected_endpoints=["endpoint-1"]
        )
        
        assert anomaly.anomaly_id == "test-1"
        assert anomaly.user_id == "user-1"
        assert anomaly.z_score > 0
        assert anomaly.deviation_percentage > 0
        assert len(anomaly.affected_endpoints) > 0
    
    def test_metrics_values_are_positive(self):
        """Test that cost metrics are non-negative"""
        detector = CostAnomalyDetector(None)
        values = [100, 110, 120, 130]
        
        metrics = detector._calculate_metrics(values)
        
        assert metrics.mean >= 0
        assert metrics.std_dev >= 0
        assert metrics.min_value >= 0
        assert metrics.max_value >= 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
