"""
Test Suite for Shadow API Detection

Tests for:
- Pattern matching
- Behavioral analysis
- Risk scoring
- Anomaly detection
- Compliance linking
- False positive handling
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch

from services.shadow_api_detector import (
    ShadowAPIDetector,
    ShadowAPIRiskLevel,
    BehaviorAnomalyType,
    EndpointPattern,
    ShadowAPIDiscovery,
    BehaviorAnalysis
)


class TestPatternMatching:
    """Test endpoint pattern matching and regex building"""
    
    def test_documented_endpoint_detection(self):
        """Test detection of documented endpoints"""
        detector = ShadowAPIDetector()
        detector.documented_endpoints = [
            EndpointPattern(path="/api/users", method="GET"),
            EndpointPattern(path="/api/users/:id", method="GET"),
            EndpointPattern(path="/api/users/:id/posts", method="GET"),
        ]
        
        assert detector._is_documented("/api/users", "GET") == True
        assert detector._is_documented("/api/users/123", "GET") == True
        assert detector._is_documented("/api/users/123/posts", "GET") == True
    
    def test_undocumented_endpoint_detection(self):
        """Test detection of undocumented endpoints"""
        detector = ShadowAPIDetector()
        detector.documented_endpoints = [
            EndpointPattern(path="/api/users", method="GET"),
        ]
        
        assert detector._is_documented("/api/admin", "GET") == False
        assert detector._is_documented("/api/debug", "GET") == False
        assert detector._is_documented("/internal/status", "GET") == False
    
    def test_method_distinction(self):
        """Test that method matters in endpoint matching"""
        detector = ShadowAPIDetector()
        detector.documented_endpoints = [
            EndpointPattern(path="/api/users", method="GET"),
        ]
        
        assert detector._is_documented("/api/users", "GET") == True
        assert detector._is_documented("/api/users", "POST") == False
        assert detector._is_documented("/api/users", "DELETE") == False
    
    def test_path_similarity_calculation(self):
        """Test path similarity scoring"""
        detector = ShadowAPIDetector()
        
        # Identical paths
        similarity = detector._calculate_path_similarity("/api/users", "/api/users")
        assert similarity == 1.0
        
        # One segment different
        similarity = detector._calculate_path_similarity("/api/users", "/api/admin")
        assert 0.4 < similarity < 0.6
        
        # Completely different
        similarity = detector._calculate_path_similarity("/api/users", "/v2/data")
        assert similarity <= 0.5


class TestPathAnomalyDetection:
    """Test detection of suspicious path patterns"""
    
    def test_admin_path_detection(self):
        """Test detection of admin paths"""
        detector = ShadowAPIDetector()
        
        anomalies, risk = detector._analyze_path_anomalies("/api/admin/users", "GET")
        assert BehaviorAnomalyType.ELEVATED_PRIVILEGE in anomalies
        assert risk >= 25
    
    def test_debug_path_detection(self):
        """Test detection of debug paths"""
        detector = ShadowAPIDetector()
        
        anomalies, risk = detector._analyze_path_anomalies("/debug/status", "GET")
        assert BehaviorAnomalyType.ELEVATED_PRIVILEGE in anomalies
    
    def test_credential_exposure_detection(self):
        """Test detection of credential exposure patterns"""
        detector = ShadowAPIDetector()
        
        anomalies, risk = detector._analyze_path_anomalies("/api/secrets/password", "GET")
        assert BehaviorAnomalyType.DATA_EXPOSURE in anomalies
        assert risk >= 30
    
    def test_unusual_http_method_detection(self):
        """Test detection of unusual HTTP methods"""
        detector = ShadowAPIDetector()
        
        anomalies, risk = detector._analyze_path_anomalies("/api/users", "PROPFIND")
        assert BehaviorAnomalyType.UNAUTHORIZED_METHOD in anomalies


class TestBehavioralAnalysis:
    """Test behavioral pattern analysis"""
    
    def test_high_request_rate_detection(self):
        """Test detection of suspicious request rates"""
        detector = ShadowAPIDetector()
        
        behavioral_data = {
            'average_requests_per_hour': 150,
            'avg_payload_size': 1000,
            'max_payload_size': 5000,
            'status_code_distribution': {}
        }
        
        anomalies, risk = detector._analyze_behavioral_patterns(behavioral_data)
        assert BehaviorAnomalyType.RAPID_REQUESTS in anomalies
        assert risk >= 20
    
    def test_large_payload_detection(self):
        """Test detection of unusually large payloads"""
        detector = ShadowAPIDetector()
        
        behavioral_data = {
            'average_requests_per_hour': 10,
            'avg_payload_size': 1000,
            'max_payload_size': 15_000_000,
            'status_code_distribution': {}
        }
        
        anomalies, risk = detector._analyze_behavioral_patterns(behavioral_data)
        assert BehaviorAnomalyType.LARGE_PAYLOAD in anomalies
        assert risk >= 15
    
    def test_authorization_failure_detection(self):
        """Test detection of authorization failures"""
        detector = ShadowAPIDetector()
        
        behavioral_data = {
            'average_requests_per_hour': 10,
            'avg_payload_size': 1000,
            'max_payload_size': 5000,
            'status_code_distribution': {
                '401': 30,
                '403': 20,
                '200': 50
            }
        }
        
        anomalies, risk = detector._analyze_behavioral_patterns(behavioral_data)
        assert BehaviorAnomalyType.UNAUTHORIZED_METHOD in anomalies
    
    def test_sql_injection_pattern_detection(self):
        """Test detection of injection attack patterns"""
        detector = ShadowAPIDetector()
        
        behavioral_data = {
            'average_requests_per_hour': 10,
            'avg_payload_size': 1000,
            'max_payload_size': 5000,
            'status_code_distribution': {},
            'parameter_patterns': {
                'sql': 3,
                'cmd': 2,
                'exec': 1
            }
        }
        
        anomalies, risk = detector._analyze_behavioral_patterns(behavioral_data)
        assert BehaviorAnomalyType.UNUSUAL_PARAMETER in anomalies
        assert risk >= 30


class TestRiskScoring:
    """Test risk score calculation"""
    
    def test_admin_endpoint_high_risk(self):
        """Test that admin endpoints get high risk scores"""
        detector = ShadowAPIDetector()
        
        risk_score, risk_level = detector._calculate_risk_score(
            "/api/admin/users",
            "GET",
            {'average_requests_per_hour': 10, 'avg_payload_size': 100, 'max_payload_size': 1000, 'status_code_distribution': {}},
            0.1
        )
        
        assert risk_score >= 35
        assert risk_level in [ShadowAPIRiskLevel.HIGH, ShadowAPIRiskLevel.CRITICAL]
    
    def test_normal_endpoint_low_risk(self):
        """Test that normal endpoints get low risk scores"""
        detector = ShadowAPIDetector()
        
        risk_score, risk_level = detector._calculate_risk_score(
            "/api/data/list",
            "GET",
            {'average_requests_per_hour': 5, 'avg_payload_size': 100, 'max_payload_size': 500, 'status_code_distribution': {}},
            0.9  # High similarity to documented
        )
        
        assert risk_score <= 35
        assert risk_level == ShadowAPIRiskLevel.LOW
    
    def test_risk_level_boundaries(self):
        """Test risk level classification boundaries"""
        detector = ShadowAPIDetector()
        
        # Low risk (< 35)
        _, level = detector._calculate_risk_score("/api/data", "GET", {}, 0.9)
        assert level == ShadowAPIRiskLevel.LOW
        
        # Medium risk (35-55)
        _, level = detector._calculate_risk_score("/api/status", "GET", {'average_requests_per_hour': 50}, 0.5)
        assert level == ShadowAPIRiskLevel.MEDIUM
        
        # High risk (55-75)
        _, level = detector._calculate_risk_score("/api/_internal", "GET", {'average_requests_per_hour': 100}, 0.2)
        assert level == ShadowAPIRiskLevel.HIGH
    
    def test_risk_score_normalization(self):
        """Test that risk scores are normalized to 0-100"""
        detector = ShadowAPIDetector()
        
        risk_score, _ = detector._calculate_risk_score(
            "/api/admin/debug",
            "GET",
            {'average_requests_per_hour': 1000},
            0.0
        )
        
        assert 0 <= risk_score <= 100


class TestConfidenceScoring:
    """Test confidence calculation"""
    
    def test_high_request_count_confidence(self):
        """Test that high request counts increase confidence"""
        detector = ShadowAPIDetector()
        
        confidence_low = detector._calculate_confidence(10, 2, 5)
        confidence_high = detector._calculate_confidence(500, 20, 30)
        
        assert confidence_high > confidence_low
    
    def test_many_users_confidence(self):
        """Test that many unique users increase confidence"""
        detector = ShadowAPIDetector()
        
        confidence_few_users = detector._calculate_confidence(100, 1, 30)
        confidence_many_users = detector._calculate_confidence(100, 20, 30)
        
        assert confidence_many_users > confidence_few_users
    
    def test_long_observation_period_confidence(self):
        """Test that longer observation periods increase confidence"""
        detector = ShadowAPIDetector()
        
        confidence_short = detector._calculate_confidence(50, 5, 1)
        confidence_long = detector._calculate_confidence(50, 5, 30)
        
        assert confidence_long > confidence_short
    
    def test_confidence_bounds(self):
        """Test that confidence is bounded to 0-1"""
        detector = ShadowAPIDetector()
        
        confidence = detector._calculate_confidence(1000, 100, 365)
        assert 0 <= confidence <= 1


class TestRemediationGeneration:
    """Test remediation recommendation generation"""
    
    def test_critical_remediation(self):
        """Test remediation for critical risk"""
        detector = ShadowAPIDetector()
        
        items = detector._generate_remediation_items(
            "/api/admin/users",
            ShadowAPIRiskLevel.CRITICAL,
            [BehaviorAnomalyType.ELEVATED_PRIVILEGE],
            ["PCI-DSS-7"]
        )
        
        assert any("URGENT" in item for item in items)
        assert any("block" in item.lower() for item in items)
    
    def test_elevated_privilege_remediation(self):
        """Test remediation for elevated privilege anomalies"""
        detector = ShadowAPIDetector()
        
        items = detector._generate_remediation_items(
            "/api/data",
            ShadowAPIRiskLevel.MEDIUM,
            [BehaviorAnomalyType.ELEVATED_PRIVILEGE],
            []
        )
        
        assert any("role" in item.lower() for item in items)
    
    def test_data_exposure_remediation(self):
        """Test remediation for data exposure"""
        detector = ShadowAPIDetector()
        
        items = detector._generate_remediation_items(
            "/api/users/password",
            ShadowAPIRiskLevel.HIGH,
            [BehaviorAnomalyType.DATA_EXPOSURE],
            []
        )
        
        assert any("data" in item.lower() and "mask" in item.lower() for item in items)
    
    def test_compliance_remediation(self):
        """Test remediation mentions compliance requirements"""
        detector = ShadowAPIDetector()
        
        items = detector._generate_remediation_items(
            "/api/data",
            ShadowAPIRiskLevel.HIGH,
            [],
            ["PCI-DSS-7", "GDPR-32"]
        )
        
        assert any("PCI-DSS-7" in item and "GDPR-32" in item for item in items)


class TestEndpointBehaviorAnalysis:
    """Test analysis of endpoint behavior from request data"""
    
    def test_response_time_calculation(self):
        """Test response time metrics calculation"""
        detector = ShadowAPIDetector()
        
        requests = [
            {'response_time_ms': 100},
            {'response_time_ms': 150},
            {'response_time_ms': 200},
        ]
        
        behavior = detector._analyze_endpoint_behavior(requests)
        
        assert behavior['avg_response_time_ms'] == 150
        assert behavior['max_response_time_ms'] == 200
    
    def test_status_code_distribution(self):
        """Test status code distribution tracking"""
        detector = ShadowAPIDetector()
        
        requests = [
            {'response_status': 200},
            {'response_status': 200},
            {'response_status': 404},
            {'response_status': 500},
        ]
        
        behavior = detector._analyze_endpoint_behavior(requests)
        
        assert behavior['status_code_distribution'][200] == 2
        assert behavior['status_code_distribution'][404] == 1
        assert behavior['status_code_distribution'][500] == 1
    
    def test_payload_size_tracking(self):
        """Test payload size metrics"""
        detector = ShadowAPIDetector()
        
        requests = [
            {'payload_size': 100},
            {'payload_size': 200},
            {'payload_size': 150},
        ]
        
        behavior = detector._analyze_endpoint_behavior(requests)
        
        assert behavior['avg_payload_size'] == 150
        assert behavior['max_payload_size'] == 200
    
    def test_request_rate_calculation(self):
        """Test hourly request rate calculation"""
        detector = ShadowAPIDetector()
        
        requests = [
            {'created_at': '2024-03-24T10:00:00Z'},
            {'created_at': '2024-03-24T10:15:00Z'},
            {'created_at': '2024-03-24T11:00:00Z'},
            {'created_at': '2024-03-24T11:30:00Z'},
        ]
        
        behavior = detector._analyze_endpoint_behavior(requests)
        
        assert behavior['total_requests'] == 4
        assert behavior['average_requests_per_hour'] > 0


class TestPathSegmentExtraction:
    """Test path segment extraction"""
    
    def test_simple_path_segmentation(self):
        """Test simple path segmentation"""
        detector = ShadowAPIDetector()
        
        segments = detector._extract_path_segments("/api/users/123")
        assert segments == ["api", "users", "123"]
    
    def test_trailing_slash_handling(self):
        """Test handling of trailing slashes"""
        detector = ShadowAPIDetector()
        
        segments = detector._extract_path_segments("/api/users/")
        assert segments == ["api", "users"]
    
    def test_empty_path(self):
        """Test handling of empty path"""
        detector = ShadowAPIDetector()
        
        segments = detector._extract_path_segments("/")
        assert segments == []


class TestEdgeCases:
    """Test edge cases and error handling"""
    
    def test_zero_requests_endpoint(self):
        """Test handling of endpoint with zero requests"""
        detector = ShadowAPIDetector()
        
        requests = []
        behavior = detector._analyze_endpoint_behavior(requests)
        
        assert behavior['total_requests'] == 0
        assert behavior['avg_response_time_ms'] == 0
    
    def test_single_request_analysis(self):
        """Test analysis with single request"""
        detector = ShadowAPIDetector()
        
        requests = [{'response_time_ms': 100, 'response_status': 200}]
        behavior = detector._analyze_endpoint_behavior(requests)
        
        assert behavior['total_requests'] == 1
        assert behavior['avg_response_time_ms'] == 100
    
    def test_very_long_path(self):
        """Test handling of very long paths"""
        detector = ShadowAPIDetector()
        
        long_path = "/api/" + "/".join(["segment"] * 20)
        anomalies, risk = detector._analyze_path_anomalies(long_path, "GET")
        
        # Long paths should be flagged as suspicious
        assert BehaviorAnomalyType.PATTERN_MISMATCH in anomalies
    
    def test_special_characters_in_path(self):
        """Test handling of special characters in paths"""
        detector = ShadowAPIDetector()
        
        path = "/api/users/%20/data"
        anomalies, risk = detector._analyze_path_anomalies(path, "GET")
        
        # Should handle special characters gracefully
        assert isinstance(anomalies, list)
        assert isinstance(risk, (int, float))


class TestAnomalyClassification:
    """Test anomaly type classification"""
    
    def test_all_anomaly_types_recognized(self):
        """Test that all anomaly types are properly defined"""
        anomaly_types = [
            BehaviorAnomalyType.UNAUTHORIZED_METHOD,
            BehaviorAnomalyType.UNUSUAL_PARAMETER,
            BehaviorAnomalyType.LARGE_PAYLOAD,
            BehaviorAnomalyType.DATA_EXPOSURE,
            BehaviorAnomalyType.RAPID_REQUESTS,
            BehaviorAnomalyType.ELEVATED_PRIVILEGE,
            BehaviorAnomalyType.PATTERN_MISMATCH
        ]
        
        assert len(anomaly_types) == 7
        assert all(isinstance(at, BehaviorAnomalyType) for at in anomaly_types)
    
    def test_risk_level_categories(self):
        """Test that all risk levels are properly defined"""
        risk_levels = [
            ShadowAPIRiskLevel.LOW,
            ShadowAPIRiskLevel.MEDIUM,
            ShadowAPIRiskLevel.HIGH,
            ShadowAPIRiskLevel.CRITICAL
        ]
        
        assert len(risk_levels) == 4
        assert all(isinstance(rl, ShadowAPIRiskLevel) for rl in risk_levels)


class TestDataStructures:
    """Test data structure definitions"""
    
    def test_endpoint_pattern_creation(self):
        """Test creation of endpoint pattern"""
        pattern = EndpointPattern(
            path="/api/users",
            method="GET",
            description="Get users",
            parameters=["limit", "offset"]
        )
        
        assert pattern.path == "/api/users"
        assert pattern.method == "GET"
        assert len(pattern.parameters) == 2
    
    def test_shadow_api_discovery_creation(self):
        """Test creation of shadow API discovery record"""
        now = datetime.utcnow()
        
        discovery = ShadowAPIDiscovery(
            endpoint_path="/api/admin",
            http_method="GET",
            first_seen=now,
            last_seen=now,
            request_count=50,
            unique_users=5,
            avg_response_time_ms=150.0,
            risk_level=ShadowAPIRiskLevel.HIGH,
            risk_score=65.5,
            confidence=0.85
        )
        
        assert discovery.endpoint_path == "/api/admin"
        assert discovery.risk_level == ShadowAPIRiskLevel.HIGH
        assert discovery.confidence == 0.85
    
    def test_discovery_serialization(self):
        """Test serialization of discovery to dict"""
        now = datetime.utcnow()
        
        discovery = ShadowAPIDiscovery(
            endpoint_path="/api/admin",
            http_method="GET",
            first_seen=now,
            last_seen=now,
            request_count=50,
            unique_users=5,
            avg_response_time_ms=150.0,
            risk_level=ShadowAPIRiskLevel.HIGH,
            risk_score=65.5,
            confidence=0.85
        )
        
        data = discovery.to_dict()
        
        assert data['endpoint_path'] == "/api/admin"
        assert data['risk_level'] == "high"
        assert data['confidence'] == 0.85


class TestMinimumRequirements:
    """Test minimum functional requirements"""
    
    def test_detector_initialization(self):
        """Test detector can be initialized"""
        detector = ShadowAPIDetector()
        assert detector is not None
    
    def test_detector_has_required_methods(self):
        """Test detector has all required methods"""
        detector = ShadowAPIDetector()
        
        required_methods = [
            '_is_documented',
            '_calculate_path_similarity',
            '_analyze_path_anomalies',
            '_analyze_behavioral_patterns',
            '_calculate_risk_score',
            '_calculate_confidence',
            '_generate_remediation_items',
            '_analyze_endpoint_behavior'
        ]
        
        for method_name in required_methods:
            assert hasattr(detector, method_name)
            assert callable(getattr(detector, method_name))
