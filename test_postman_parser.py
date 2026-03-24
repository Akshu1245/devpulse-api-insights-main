#!/usr/bin/env python3
"""
STEP 1: Postman Collection Parser - Test Script

Tests:
1. Parser: Parse sample Postman collection JSON
2. Endpoint extraction: Verify all endpoints are extracted
3. Nested folder traversal: Verify hierarchical paths
4. Error handling: Invalid JSON, missing fields
5. Validation: Endpoint structure validation
"""

import json
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from services.postman_parser import (
    parse_postman_collection,
    PostmanParseError,
    validate_endpoint,
)


def test_parse_valid_collection():
    """Test parsing valid Postman collection."""
    print("TEST 1: Parse Valid Postman Collection")
    print("-" * 50)
    
    with open("backend/sample_postman_collection.json") as f:
        collection_json = f.read()
    
    try:
        result = parse_postman_collection(collection_json)
        
        print(f"✓ Collection Name: {result['collection_name']}")
        print(f"✓ Endpoints Found: {result['endpoint_count']}")
        print(f"✓ Endpoints Scanned: {len(result['endpoints'])}")
        
        # Print first endpoint
        if result['endpoints']:
            ep = result['endpoints'][0]
            print(f"\nFirst Endpoint:")
            print(f"  - Name: {ep['name']}")
            print(f"  - Method: {ep['method']}")
            print(f"  - URL: {ep['url']}")
            print(f"  - Path: {ep['path']}")
            print(f"  - Headers: {len(ep['headers'])}")
        
        print("\n✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_nested_folders():
    """Test recursive traversal of nested folders."""
    print("TEST 2: Nested Folder Traversal")
    print("-" * 50)
    
    collection = {
        "info": {"name": "Test", "description": ""},
        "item": [
            {
                "name": "Folder A",
                "item": [
                    {
                        "name": "Deep Request",
                        "request": {
                            "method": "GET",
                            "url": "https://api.test.com/deep"
                        }
                    }
                ]
            }
        ]
    }
    
    try:
        result = parse_postman_collection(json.dumps(collection))
        
        if result['endpoints']:
            ep = result['endpoints'][0]
            path = ep.get('path')
            
            if 'Folder A' in path and 'Deep Request' in path:
                print(f"✓ Nested path: {path}")
                print("✅ PASS\n")
                return True
        
        print("❌ FAIL: Nested path not found\n")
        return False
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_invalid_json():
    """Test error handling for invalid JSON."""
    print("TEST 3: Invalid JSON Error Handling")
    print("-" * 50)
    
    try:
        parse_postman_collection("{invalid json")
        print("❌ FAIL: Should have raised PostmanParseError\n")
        return False
    except PostmanParseError as e:
        print(f"✓ Caught error: {str(e)}")
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: Wrong exception type: {str(e)}\n")
        return False


def test_missing_info_field():
    """Test error for missing info field."""
    print("TEST 4: Missing 'info' Field")
    print("-" * 50)
    
    collection = {"item": []}
    
    try:
        parse_postman_collection(json.dumps(collection))
        print("❌ FAIL: Should have raised PostmanParseError\n")
        return False
    except PostmanParseError as e:
        print(f"✓ Caught error: {str(e)}")
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: Wrong exception: {str(e)}\n")
        return False


def test_missing_item_field():
    """Test error for missing item field."""
    print("TEST 5: Missing 'item' Field")
    print("-" * 50)
    
    collection = {"info": {"name": "Test"}}
    
    try:
        parse_postman_collection(json.dumps(collection))
        print("❌ FAIL: Should have raised PostmanParseError\n")
        return False
    except PostmanParseError as e:
        print(f"✓ Caught error: {str(e)}")
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: Wrong exception: {str(e)}\n")
        return False


def test_url_formats():
    """Test different URL format handling."""
    print("TEST 6: URL Format Handling")
    print("-" * 50)
    
    collection = {
        "info": {"name": "Test", "description": ""},
        "item": [
            {
                "name": "String URL",
                "request": {
                    "method": "GET",
                    "url": "https://api.test.com/endpoint1"
                }
            },
            {
                "name": "Object URL",
                "request": {
                    "method": "POST",
                    "url": {
                        "raw": "https://api.test.com/endpoint2",
                        "protocol": "https",
                        "host": ["api", "test", "com"],
                        "path": ["endpoint2"]
                    }
                }
            }
        ]
    }
    
    try:
        result = parse_postman_collection(json.dumps(collection))
        
        if len(result['endpoints']) == 2:
            ep1_url = result['endpoints'][0]['url']
            ep2_url = result['endpoints'][1]['url']
            
            print(f"✓ String URL format: {ep1_url}")
            print(f"✓ Object URL format: {ep2_url}")
            print("✅ PASS\n")
            return True
        
        print(f"❌ FAIL: Expected 2 endpoints, got {len(result['endpoints'])}\n")
        return False
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_body_extraction():
    """Test different body format extraction."""
    print("TEST 7: Body Format Extraction")
    print("-" * 50)
    
    collection = {
        "info": {"name": "Test", "description": ""},
        "item": [
            {
                "name": "Raw Body",
                "request": {
                    "method": "POST",
                    "url": "https://api.test.com/test",
                    "body": {
                        "mode": "raw",
                        "raw": "{\"key\": \"value\"}"
                    }
                }
            }
        ]
    }
    
    try:
        result = parse_postman_collection(json.dumps(collection))
        body = result['endpoints'][0]['body']
        
        if body == "{\"key\": \"value\"}":
            print(f"✓ Body extracted: {body}")
            print("✅ PASS\n")
            return True
        
        print(f"❌ FAIL: Body extraction failed\n")
        return False
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def test_endpoint_validation():
    """Test endpoint structure validation."""
    print("TEST 8: Endpoint Validation")
    print("-" * 50)
    
    valid_ep = {
        "name": "Test",
        "method": "GET",
        "url": "https://api.test.com/test",
        "headers": []
    }
    
    invalid_ep = {
        "name": "Test",
        "method": "GET"
        # Missing url and headers
    }
    
    try:
        if validate_endpoint(valid_ep):
            print("✓ Valid endpoint: PASS")
        else:
            print("✗ Valid endpoint: FAIL")
            return False
        
        if not validate_endpoint(invalid_ep):
            print("✓ Invalid endpoint rejected: PASS")
        else:
            print("✗ Invalid endpoint not rejected: FAIL")
            return False
        
        print("✅ PASS\n")
        return True
    except Exception as e:
        print(f"❌ FAIL: {str(e)}\n")
        return False


def run_all_tests():
    """Run all tests and report results."""
    print("\n" + "=" * 50)
    print("STEP 1: POSTMAN PARSER - TEST SUITE")
    print("=" * 50 + "\n")
    
    tests = [
        test_parse_valid_collection,
        test_nested_folders,
        test_invalid_json,
        test_missing_info_field,
        test_missing_item_field,
        test_url_formats,
        test_body_extraction,
        test_endpoint_validation,
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
