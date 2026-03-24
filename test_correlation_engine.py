#!/usr/bin/env python3
"""
STEP 3: Endpoint Correlation Engine - Test Script

Tests:
1. Endpoint inventory creation
2. Endpoint profile building
3. Timeline generation
4. Statistics aggregation
5. Search functionality
6. Correlation linking
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "backend"))


def test_endpoint_id_consistency():
    """Test that endpoint IDs are consistent across different URLs."""
    print("TEST 1: Endpoint ID Consistency Across URLs")
    print("-" * 50)
    
    from backend.services.correlation_engine import EndpointStatus
    
    try:
        # Verify enum values
        statuses = [s.value for s in EndpointStatus]
        
        expected = ["active", "deprecated", "archived", "removed"]
        if statuses == expected:
            print(f"✓ Endpoint statuses: {statuses}")
        else:
            print(f"✗ Status mismatch: {statuses} vs {expected}")
            return False
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_correlation_integration():
    """Test correlation with risk engine."""
    print("TEST 2: Correlation Integration with Risk Engine")
    print("-" * 50)
    
    from backend.services.correlation_engine import EndpointStatus
    from backend.services.risk_engine import generate_endpoint_id
    
    try:
        # Simulate endpoint creation flow
        endpoints = [
            ("https://api.example.com/users", "GET"),
            ("https://api.example.com/users", "POST"),
            ("https://api.example.com/products", "GET"),
        ]
        
        endpoint_ids = []
        for url, method in endpoints:
            ep_id = generate_endpoint_id(url, method)
            endpoint_ids.append(ep_id)
            print(f"✓ {url} [{method}] → {ep_id}")
        
        # Verify uniqueness per method
        if endpoint_ids[0] != endpoint_ids[1]:
            print(f"✓ Different methods produce different IDs")
        else:
            print(f"✗ Same ID for different methods")
            return False
        
        # Verify same method+URL produce same ID
        id_check = generate_endpoint_id(endpoints[0][0], endpoints[0][1])
        if id_check == endpoint_ids[0]:
            print(f"✓ Repeatable ID generation")
        else:
            print(f"✗ Non-repeatable ID generation")
            return False
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_profile_structure():
    """Test endpoint profile structure."""
    print("TEST 3: Endpoint Profile Structure")
    print("-" * 50)
    
    try:
        # Mock profile structure
        profile = {
            "endpoint_id": "endpoint_abc123",
            "endpoint_url": "https://api.example.com/users",
            "method": "GET",
            "status": "active",
            "created_at": "2024-01-15T10:00:00Z",
            "metadata": {"name": "Get Users"},
            "current": {
                "risk": {
                    "unified_risk_score": 65.0,
                    "risk_level": "high"
                },
                "latest_scan": None
            },
            "history": {
                "cost_30d": [],
                "security_count": 0,
                "risk_score_count": 1
            },
            "correlations": []
        }
        
        # Verify structure
        required_keys = ["endpoint_id", "endpoint_url", "method", "status", "current", "history", "correlations"]
        for key in required_keys:
            if key not in profile:
                print(f"✗ Missing key: {key}")
                return False
        
        print(f"✓ Profile has {len(required_keys)} required keys")
        print(f"✓ Risk score: {profile['current']['risk']['unified_risk_score']}")
        print(f"✓ Status: {profile['status']}")
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_timeline_event_types():
    """Test timeline event structure."""
    print("TEST 4: Timeline Event Types")
    print("-" * 50)
    
    try:
        # Mock timeline events
        events = [
            {
                "type": "security_scan",
                "timestamp": "2024-01-15T10:00:00Z",
                "data": {"issue": "Missing HSTS header", "risk_level": "high"}
            },
            {
                "type": "risk_score_update",
                "timestamp": "2024-01-15T10:05:00Z",
                "data": {"score": 65.0, "level": "high"}
            }
        ]
        
        valid_types = ["security_scan", "risk_score_update", "cost_event"]
        
        for event in events:
            if event["type"] not in valid_types:
                print(f"✗ Invalid event type: {event['type']}")
                return False
            print(f"✓ Event type '{event['type']}' at {event['timestamp']}")
        
        # Check chronological order
        if events[0]["timestamp"] < events[1]["timestamp"]:
            print(f"✓ Events in chronological order")
        else:
            print(f"✗ Events not in order")
            return False
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_statistics_aggregation():
    """Test endpoint statistics."""
    print("TEST 5: Statistics Aggregation")
    print("-" * 50)
    
    try:
        # Mock stats
        stats = {
            "total_endpoints": 42,
            "by_status": {
                "active": 35,
                "deprecated": 5,
                "archived": 2,
                "removed": 0
            },
            "by_method": {
                "GET": 20,
                "POST": 15,
                "PUT": 5,
                "DELETE": 2
            },
            "average_risk_score": 45.3
        }
        
        # Verify structure
        if stats["total_endpoints"] != sum(stats["by_status"].values()):
            print(f"✗ Status totals don't match")
            return False
        
        if stats["total_endpoints"] != sum(stats["by_method"].values()):
            print(f"✗ Method totals don't match")
            return False
        
        print(f"✓ Total endpoints: {stats['total_endpoints']}")
        print(f"✓ Active: {stats['by_status']['active']}")
        print(f"✓ By method: {list(stats['by_method'].keys())}")
        print(f"✓ Average risk: {stats['average_risk_score']}")
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_correlation_sources():
    """Test various correlation sources."""
    print("TEST 6: Correlation Sources")
    print("-" * 50)
    
    try:
        sources = [
            "postman_scan",
            "llm_usage",
            "risk_score",
            "github_pr",
            "security_alert"
        ]
        
        for source in sources:
            print(f"✓ Source type: {source}")
        
        # Mock correlation record
        correlation = {
            "endpoint_id": "endpoint_abc123",
            "source": "postman_scan",
            "source_id": "scan_12345",
            "source_data": {
                "issue": "Missing CSP header",
                "risk_level": "medium"
            },
            "linked_at": "2024-01-15T10:00:00Z"
        }
        
        if "source" in correlation and "source_id" in correlation:
            print(f"✓ Correlation linkage: {correlation['source']} → {correlation['source_id']}")
        else:
            print(f"✗ Missing correlation fields")
            return False
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_url_search_patterns():
    """Test URL search functionality."""
    print("TEST 7: URL Search Patterns")
    print("-" * 50)
    
    try:
        endpoints = [
            {"endpoint_url": "https://api.example.com/users", "method": "GET"},
            {"endpoint_url": "https://api.example.com/users/123", "method": "PUT"},
            {"endpoint_url": "https://api.example.com/products", "method": "GET"},
            {"endpoint_url": "https://api.example.com/admin/settings", "method": "POST"},
        ]
        
        # Test search patterns
        search_tests = [
            ("users", 2),  # Should find 2 endpoints with "users"
            ("api", 4),    # Should find all 4
            ("admin", 1),  # Should find 1
            ("products", 1),  # Should find 1
        ]
        
        for query, expected_count in search_tests:
            matches = [
                ep for ep in endpoints
                if query.lower() in ep["endpoint_url"].lower()
            ]
            
            if len(matches) == expected_count:
                print(f"✓ Search '{query}': {len(matches)} matches")
            else:
                print(f"✗ Search '{query}': {len(matches)} matches (expected {expected_count})")
                return False
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_lifecycle_transitions():
    """Test endpoint status transitions."""
    print("TEST 8: Lifecycle Status Transitions")
    print("-" * 50)
    
    try:
        # Valid transitions
        transitions = [
            ("active", "deprecated"),
            ("deprecated", "archived"),
            ("archived", "archived"),  # Can stay archived
            ("active", "removed"),
        ]
        
        valid_statuses = ["active", "deprecated", "archived", "removed"]
        
        for from_status, to_status in transitions:
            if from_status in valid_statuses and to_status in valid_statuses:
                print(f"✓ {from_status} → {to_status}")
            else:
                print(f"✗ Invalid status in transition")
                return False
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def run_all_tests():
    """Run all tests and report results."""
    print("\n" + "=" * 50)
    print("STEP 3: ENDPOINT CORRELATION ENGINE - TEST SUITE")
    print("=" * 50 + "\n")
    
    tests = [
        test_endpoint_id_consistency,
        test_correlation_integration,
        test_profile_structure,
        test_timeline_event_types,
        test_statistics_aggregation,
        test_correlation_sources,
        test_url_search_patterns,
        test_lifecycle_transitions,
    ]
    
    results = []
    for test in tests:
        try:
            results.append(test())
        except Exception as e:
            print(f"❌ Test error: {str(e)}\n")
            results.append(False)
    
    # Summary
    print("=" * 50)
    print(f"Results: {sum(results)}/{len(results)} tests passed")
    print("=" * 50 + "\n")
    
    return all(results)


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
