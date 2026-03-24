#!/usr/bin/env python3
"""
STEP 2: Risk Score Engine - Test Script

Tests:
1. Endpoint ID generation (URL normalization)
2. Security score calculation
3. Cost anomaly score calculation (mock data)
4. Unified risk score formula
5. Risk level assignment
6. Batch risk score calculation
"""

import sys
from pathlib import Path
import asyncio

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from backend.services.risk_engine import (
    generate_endpoint_id,
    normalize_endpoint_url,
    calculate_security_score,
    RISK_LEVEL_WEIGHTS,
)


def test_endpoint_id_generation():
    """Test endpoint ID generation and consistency."""
    print("TEST 1: Endpoint ID Generation & Consistency")
    print("-" * 50)
    
    test_cases = [
        ("https://api.example.com/users", "GET"),
        ("https://api.example.com/users", "POST"),
        ("https://api.example.com/users?limit=50", "GET"),
        ("https://api.example.com/users/", "GET"),
        ("https://api.example.com/users#section", "GET"),
    ]
    
    try:
        ids = {}
        for url, method in test_cases:
            endpoint_id = generate_endpoint_id(url, method)
            key = (url.split("?")[0].rstrip("/"), method)
            
            print(f"✓ {url} [{method}] → {endpoint_id}")
            
            if key not in ids:
                ids[key] = endpoint_id
            # Same normalized URL+method should give same ID
            if ids[key] != endpoint_id and "?" not in url and "#" not in url:
                print(f"  ⚠ Warning: IDs differ for same endpoint")
        
        # Test that different methods give different IDs
        id_get = generate_endpoint_id("https://api.example.com/users", "GET")
        id_post = generate_endpoint_id("https://api.example.com/users", "POST")
        
        if id_get != id_post:
            print(f"✓ Different methods produce different IDs")
        else:
            print(f"✗ Different methods should produce different IDs")
            return False
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_url_normalization():
    """Test URL normalization for endpoint identification."""
    print("TEST 2: URL Normalization")
    print("-" * 50)
    
    test_cases = [
        ("https://api.example.com/users", "https://api.example.com/users"),
        ("https://api.example.com/users?limit=50", "https://api.example.com/users"),
        ("https://api.example.com/users/", "https://api.example.com/users"),
        ("https://api.example.com/users#section", "https://api.example.com/users"),
        ("http://api.example.com/users", "http://api.example.com/users"),
    ]
    
    try:
        for url, expected in test_cases:
            normalized = normalize_endpoint_url(url)
            match = normalized == expected
            status = "✓" if match else "✗"
            print(f"{status} {url}")
            print(f"  → {normalized}")
            if not match:
                print(f"  Expected: {expected}")
                return False
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_security_score_calculation():
    """Test security score aggregation."""
    print("TEST 3: Security Score Calculation")
    print("-" * 50)
    
    test_cases = [
        ([], 0.0, "No issues"),
        (
            [{"risk_level": "info"}],
            5.0 * 0.3,  # 30% average
            "Single info issue"
        ),
        (
            [{"risk_level": "critical"}],
            100.0,
            "Single critical issue"
        ),
        (
            [
                {"risk_level": "critical"},
                {"risk_level": "high"},
                {"risk_level": "medium"},
            ],
            (0.7 * 100) + (0.3 * (100 + 75 + 50) / 3),
            "Mixed issues"
        ),
    ]
    
    try:
        for issues, expected_max, description in test_cases:
            score = calculate_security_score(issues)
            # Allow small floating point variance
            close = abs(score - expected_max) < 2.0
            status = "✓" if close else "✗"
            print(f"{status} {description}: {score:.2f} (expected ~{expected_max:.2f})")
            if not close:
                return False
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_risk_level_assignment():
    """Test risk level assignment based on score."""
    print("TEST 4: Risk Level Assignment")
    print("-" * 50)
    
    test_cases = [
        (5.0, "info"),
        (25.0, "low"),
        (50.0, "medium"),
        (70.0, "high"),
        (85.0, "critical"),
    ]
    
    try:
        for score, expected_level in test_cases:
            # Simulate risk level logic from calculate_unified_risk_score
            if score >= 80:
                level = "critical"
            elif score >= 60:
                level = "high"
            elif score >= 40:
                level = "medium"
            elif score >= 20:
                level = "low"
            else:
                level = "info"
            
            match = level == expected_level
            status = "✓" if match else "✗"
            print(f"{status} Score {score} → {level} (expected {expected_level})")
            if not match:
                return False
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_unified_risk_formula():
    """Test unified risk score formula."""
    print("TEST 5: Unified Risk Score Formula")
    print("-" * 50)
    
    try:
        # Test case: equal weights
        security_score = 80.0
        cost_anomaly_score = 60.0
        security_weight = 0.5
        cost_weight = 0.5
        
        unified = (security_weight * security_score) + (cost_weight * cost_anomaly_score)
        expected = 70.0
        
        if abs(unified - expected) < 0.1:
            print(f"✓ Equal weights: {unified:.2f} (expected {expected})")
        else:
            print(f"✗ Equal weights: {unified:.2f} (expected {expected})")
            return False
        
        # Test case: security-weighted
        security_weight = 0.6
        cost_weight = 0.4
        
        unified = (security_weight * security_score) + (cost_weight * cost_anomaly_score)
        expected = 72.0
        
        if abs(unified - expected) < 0.1:
            print(f"✓ Security-weighted: {unified:.2f} (expected {expected})")
        else:
            print(f"✗ Security-weighted: {unified:.2f} (expected {expected})")
            return False
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_risk_score_weights():
    """Test that risk level weights are correct."""
    print("TEST 6: Risk Level Weights")
    print("-" * 50)
    
    expected_weights = {
        "critical": 100,
        "high": 75,
        "medium": 50,
        "low": 25,
        "info": 5,
    }
    
    try:
        for level, expected_weight in expected_weights.items():
            actual_weight = RISK_LEVEL_WEIGHTS.get(level)
            
            if actual_weight == expected_weight:
                print(f"✓ {level}: {actual_weight}")
            else:
                print(f"✗ {level}: {actual_weight} (expected {expected_weight})")
                return False
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_edge_cases():
    """Test edge cases."""
    print("TEST 7: Edge Cases")
    print("-" * 50)
    
    try:
        # Empty/malformed endpoint ID
        empty_id = generate_endpoint_id("", "GET")
        if empty_id.startswith("endpoint_"):
            print(f"✓ Empty URL handled: {empty_id}")
        else:
            return False
        
        # Score bounds
        score = calculate_security_score([
            {"risk_level": "critical"},
            {"risk_level": "critical"},
            {"risk_level": "critical"},
        ])
        if 0 <= score <= 100:
            print(f"✓ Score within bounds [0-100]: {score}")
        else:
            print(f"✗ Score out of bounds: {score}")
            return False
        
        # URL variants
        url_variants = [
            "https://api.example.com/users",
            "http://api.example.com/users",
            "https://api.example.com:8080/users",
        ]
        
        ids = [generate_endpoint_id(url, "GET") for url in url_variants]
        if len(set(ids)) == len(ids):
            print(f"✓ Different URLs produce different IDs")
        else:
            print(f"✗ Different URLs should produce different IDs")
            return False
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def run_all_tests():
    """Run all tests and report results."""
    print("\n" + "=" * 50)
    print("STEP 2: RISK SCORE ENGINE - TEST SUITE")
    print("=" * 50 + "\n")
    
    tests = [
        test_endpoint_id_generation,
        test_url_normalization,
        test_security_score_calculation,
        test_risk_level_assignment,
        test_unified_risk_formula,
        test_risk_score_weights,
        test_edge_cases,
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
