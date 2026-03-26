"""
Comprehensive test suite for Postman Collection v2.1 Parser + Security Scanner.

Tests:
1. Variable resolution
2. Deep nested folder traversal
3. Secret detection (regex + Shannon entropy + JWT)
4. All body modes (raw, urlencoded, formdata, graphql)
5. Auth block extraction
6. Scanning pipeline integration
7. Edge cases (empty collections, malformed data)
"""

from __future__ import annotations

import sys
import os
import json

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from services.secret_detector import (
    shannon_entropy,
    detect_secrets_in_string,
    detect_secrets_in_headers,
    detect_secrets_in_body,
    detect_secrets_in_auth,
    deduplicate_findings,
    _detect_jwt_tokens,
    _extract_high_entropy_tokens,
)
from services.postman_parser import (
    extract_collection_variables,
    resolve_variables,
    resolve_url,
    parse_postman_collection,
    is_url_scannable,
)


# ═══════════════════════════════════════════════════════════════════════════════
# Sample Postman Collection v2.1 — Realistic test data
# ═══════════════════════════════════════════════════════════════════════════════

SAMPLE_COLLECTION = {
    "info": {
        "_postman_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "DevPulse Test API Collection",
        "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        "description": "Test collection with nested folders, secrets, and various body types.",
    },
    "variable": [
        {"key": "baseUrl", "value": "https://api.devpulse.io"},
        {"key": "apiKey", "value": "dp_test_key_1234567890abcdef"},
        {"key": "version", "value": "v2"},
        {"key": "userId", "value": "usr_98765"},
        {"key": "dbPassword", "value": "SuperSecret123!@#"},
    ],
    "item": [
        # ── Top-level request ──
        {
            "name": "Health Check",
            "request": {
                "method": "GET",
                "header": [],
                "url": {
                    "raw": "{{baseUrl}}/health",
                    "host": ["{{baseUrl}}"],
                    "path": ["health"],
                },
            },
        },
        # ── Nested folder: Auth ──
        {
            "name": "Authentication",
            "item": [
                {
                    "name": "Login",
                    "request": {
                        "method": "POST",
                        "header": [
                            {"key": "Content-Type", "value": "application/json"},
                            {"key": "X-Api-Key", "value": "{{apiKey}}"},
                        ],
                        "body": {
                            "mode": "raw",
                            "raw": '{"email": "admin@example.com", "password": "MyP@ssw0rd123"}',
                            "options": {"raw": {"language": "json"}},
                        },
                        "url": {
                            "raw": "{{baseUrl}}/{{version}}/auth/login",
                            "host": ["{{baseUrl}}"],
                            "path": ["{{version}}", "auth", "login"],
                        },
                    },
                },
                {
                    "name": "Register with hardcoded secret",
                    "request": {
                        "method": "POST",
                        "header": [
                            {"key": "Content-Type", "value": "application/json"},
                            {
                                "key": "Authorization",
                                "value": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
                            },
                        ],
                        "body": {
                            "mode": "raw",
                            "raw": '{"email": "new@example.com", "name": "John"}',
                        },
                        "url": {
                            "raw": "{{baseUrl}}/v2/auth/register",
                            "host": ["{{baseUrl}}"],
                            "path": ["v2", "auth", "register"],
                        },
                    },
                },
                {
                    "name": "OAuth with AWS Keys",
                    "request": {
                        "method": "POST",
                        "header": [
                            {"key": "X-AWS-Access", "value": "aws_access_placeholder"},
                            {
                                "key": "X-AWS-Secret",
                                "value": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
                            },
                        ],
                        "body": {
                            "mode": "urlencoded",
                            "urlencoded": [
                                {"key": "grant_type", "value": "authorization_code"},
                                {
                                    "key": "client_secret",
                                    "value": "sk-1234567890abcdefghijklmnopqrstuvwxyz1234",
                                },
                            ],
                        },
                        "url": {
                            "raw": "{{baseUrl}}/auth/oauth",
                            "host": ["{{baseUrl}}"],
                            "path": ["auth", "oauth"],
                        },
                    },
                },
            ],
        },
        # ── Deeply nested folder: Users → Admin → Actions ──
        {
            "name": "Users",
            "item": [
                {
                    "name": "Admin",
                    "item": [
                        {
                            "name": "Actions",
                            "item": [
                                {
                                    "name": "Delete User (Dangerous)",
                                    "request": {
                                        "method": "DELETE",
                                        "header": [
                                            {
                                                "key": "Authorization",
                                                "value": "Bearer {{apiKey}}",
                                            },
                                            {
                                                "key": "X-GitHub-Token",
                                                "value": "github_pat_placeholder_token",
                                            },
                                        ],
                                        "url": {
                                            "raw": "{{baseUrl}}/admin/users/{{userId}}",
                                            "host": ["{{baseUrl}}"],
                                            "path": ["admin", "users", "{{userId}}"],
                                            "variable": [
                                                {
                                                    "key": "userId",
                                                    "value": "{{userId}}",
                                                    "description": "User ID to delete",
                                                }
                                            ],
                                        },
                                    },
                                },
                                {
                                    "name": "Get User Profile",
                                    "request": {
                                        "method": "GET",
                                        "header": [
                                            {
                                                "key": "Authorization",
                                                "value": "Bearer token-here",
                                            }
                                        ],
                                        "url": {
                                            "raw": "{{baseUrl}}/users/{{userId}}?include=profile",
                                            "host": ["{{baseUrl}}"],
                                            "path": ["users", "{{userId}}"],
                                            "query": [
                                                {"key": "include", "value": "profile"},
                                                {
                                                    "key": "token",
                                                    "value": "stripe_test_placeholder_token",
                                                },
                                            ],
                                        },
                                    },
                                },
                            ],
                        },
                        {
                            "name": "List All Users",
                            "request": {
                                "method": "GET",
                                "header": [
                                    {
                                        "key": "Authorization",
                                        "value": "Bearer {{apiKey}}",
                                    },
                                    {
                                        "key": "X-Stripe-Key",
                                        "value": "stripe_live_placeholder_token",
                                    },
                                ],
                                "url": {
                                    "raw": "{{baseUrl}}/users?page=1&limit=50",
                                    "host": ["{{baseUrl}}"],
                                    "path": ["users"],
                                    "query": [
                                        {"key": "page", "value": "1"},
                                        {"key": "limit", "value": "50"},
                                    ],
                                },
                            },
                        },
                    ],
                }
            ],
        },
        # ── Form data + GraphQL endpoint ──
        {
            "name": "Upload & GraphQL",
            "item": [
                {
                    "name": "Upload Avatar",
                    "request": {
                        "method": "POST",
                        "header": [
                            {"key": "Authorization", "value": "Bearer {{apiKey}}"}
                        ],
                        "body": {
                            "mode": "formdata",
                            "formdata": [
                                {"key": "file", "value": "", "type": "file"},
                                {
                                    "key": "description",
                                    "value": "Profile picture with password=HiddenPass123!",
                                },
                                {
                                    "key": "api_key",
                                    "value": "dp_inline_key_abcdef123456",
                                },
                            ],
                        },
                        "url": {
                            "raw": "{{baseUrl}}/upload/avatar",
                            "host": ["{{baseUrl}}"],
                            "path": ["upload", "avatar"],
                        },
                    },
                },
                {
                    "name": "GraphQL Query",
                    "request": {
                        "method": "POST",
                        "header": [
                            {"key": "Content-Type", "value": "application/json"},
                            {
                                "key": "X-SendGrid-Key",
                                "value": "SG.abc123def456ghi789jkl012.mno345pqr678stu901vwx234yz",
                            },
                        ],
                        "body": {
                            "mode": "graphql",
                            "graphql": {
                                "query": "query GetUser($id: ID!) { user(id: $id) { name email } }",
                                "variables": '{"id": "usr_123"}',
                            },
                        },
                        "url": {
                            "raw": "{{baseUrl}}/graphql",
                            "host": ["{{baseUrl}}"],
                            "path": ["graphql"],
                        },
                    },
                },
            ],
        },
        # ── Request with PEM private key ──
        {
            "name": "SSH Key Upload",
            "request": {
                "method": "POST",
                "header": [{"key": "Authorization", "value": "Bearer {{apiKey}}"}],
                "body": {
                    "mode": "raw",
                    "raw": '{"key": "-----BEGIN RSA PRIVATE KEY-----\\nMIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHB7MhgHcTz6sE2I2yPB\\naFDrBz9vFqU4yFj3Gh5PSzJ5TkH8TJfLwZQxQB7LgBPGCEfbMhMCEd5FAnXyABC\\ndefEND RSA PRIVATE KEY-----"}',
                },
                "url": {
                    "raw": "{{baseUrl}}/ssh-keys",
                    "host": ["{{baseUrl}}"],
                    "path": ["ssh-keys"],
                },
            },
        },
        # ── Request with database connection string ──
        {
            "name": "Database Config",
            "request": {
                "method": "PUT",
                "header": [],
                "body": {
                    "mode": "raw",
                    "raw": '{"database_url": "postgresql://admin:MyDBSecretPass@prod-db.example.com:5432/production"}',
                },
                "url": {
                    "raw": "http://internal-api.devpulse.io/config/db",
                    "protocol": "http",
                    "host": ["internal-api", "devpulse", "io"],
                    "path": ["config", "db"],
                },
            },
        },
        # ── Request with Slack + Twilio tokens ──
        {
            "name": "Integrations",
            "request": {
                "method": "POST",
                "header": [
                    {
                        "key": "X-Slack-Token",
                        "value": "slack_token_placeholder",
                    },
                    {
                        "key": "X-Twilio-SID",
                        "value": "twilio_sid_placeholder",
                    },
                ],
                "body": {
                    "mode": "raw",
                    "raw": '{"firebase_key": "AAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"}',
                },
                "url": {
                    "raw": "{{baseUrl}}/integrations",
                    "host": ["{{baseUrl}}"],
                    "path": ["integrations"],
                },
            },
        },
        # ── Request with GitHub PAT (new format) ──
        {
            "name": "GitHub Sync",
            "request": {
                "method": "GET",
                "header": [
                    {
                        "key": "Authorization",
                        "value": "token github_pat_placeholder_token",
                    }
                ],
                "url": {
                    "raw": "https://api.github.com/user/repos",
                    "protocol": "https",
                    "host": ["api", "github", "com"],
                    "path": ["user", "repos"],
                },
            },
        },
    ],
}


# ═══════════════════════════════════════════════════════════════════════════════
# Test Functions
# ═══════════════════════════════════════════════════════════════════════════════


def test_shannon_entropy():
    """Test Shannon entropy calculation."""
    low_entropy = shannon_entropy("aaaaaaaaaaaaaaaaaa")
    assert low_entropy < 1.0, (
        f"Low entropy string should have entropy < 1.0, got {low_entropy}"
    )

    high_entropy = shannon_entropy("aB3$xK9@mN2&pQ7!")
    assert high_entropy > 3.0, (
        f"High entropy string should have entropy > 3.0, got {high_entropy}"
    )

    empty = shannon_entropy("")
    assert empty == 0.0, f"Empty string should have entropy 0, got {empty}"

    print("[PASS] Shannon entropy tests")


def test_variable_resolution():
    """Test {{variable}} resolution."""
    variables = {"baseUrl": "https://api.example.com", "version": "v2"}

    resolved, unresolved = resolve_variables("{{baseUrl}}/{{version}}/users", variables)
    assert resolved == "https://api.example.com/v2/users", f"Got: {resolved}"
    assert unresolved == [], f"Expected no unresolved, got: {unresolved}"

    resolved, unresolved = resolve_variables("{{baseUrl}}/{{unknown}}/data", variables)
    assert "https://api.example.com" in resolved
    assert "unknown" in unresolved, (
        f"Expected 'unknown' in unresolved, got: {unresolved}"
    )

    resolved, unresolved = resolve_variables("https://example.com/static", variables)
    assert resolved == "https://example.com/static"
    assert unresolved == []

    print("[PASS] Variable resolution tests")


def test_collection_variable_extraction():
    """Test extracting variables from collection."""
    variables = extract_collection_variables(SAMPLE_COLLECTION)
    assert variables["baseUrl"] == "https://api.devpulse.io"
    assert variables["apiKey"] == "dp_test_key_1234567890abcdef"
    assert variables["version"] == "v2"
    assert variables["dbPassword"] == "SuperSecret123!@#"
    assert len(variables) == 5

    print("[PASS] Collection variable extraction tests")


def test_url_scannability():
    """Test URL scannability detection."""
    assert is_url_scannable("https://api.example.com/users")
    assert is_url_scannable("http://localhost:3000/health")
    assert not is_url_scannable("{{baseUrl}}/users")
    assert not is_url_scannable("https://{{host}}/api")
    assert not is_url_scannable("")
    assert not is_url_scannable("ftp://example.com")

    print("[PASS] URL scannability tests")


def test_jwt_detection():
    """Test JWT token detection."""
    jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    findings = _detect_jwt_tokens(f"Bearer {jwt}", "test location")
    assert len(findings) > 0, "Should detect JWT"
    assert findings[0]["type"] == "JWT Token"
    assert findings[0]["severity"] == "critical"
    assert findings[0]["has_expiration"] == False  # This JWT has no exp claim

    print("[PASS] JWT detection tests")


def test_secret_detection_comprehensive():
    """Test comprehensive secret detection."""
    # API Key
    findings = detect_secrets_in_string(
        'api_key = "stripe_live_placeholder_token"', "test"
    )
    types = {f["type"] for f in findings}
    assert "Stripe Live Secret Key" in types or "API Key" in types, (
        f"Expected Stripe/API key, got: {types}"
    )

    # AWS Key
    findings = detect_secrets_in_string(
        "aws_access_key_id=aws_access_placeholder", "test"
    )
    types = {f["type"] for f in findings}
    assert "AWS Access Key ID" in types, f"Expected AWS key, got: {types}"

    # GitHub PAT
    findings = detect_secrets_in_string(
        "token=github_pat_placeholder_token", "test"
    )
    types = {f["type"] for f in findings}
    assert "GitHub Personal Access Token" in types, f"Expected GitHub PAT, got: {types}"

    # OpenAI Key
    findings = detect_secrets_in_string(
        "key=sk-1234567890abcdefghijklmnopqrstuvwxyz1234", "test"
    )
    types = {f["type"] for f in findings}
    assert "OpenAI API Key" in types, f"Expected OpenAI key, got: {types}"

    # Bearer Token
    findings = detect_secrets_in_string(
        "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc", "test"
    )
    types = {f["type"] for f in findings}
    assert len(types) > 0, "Should detect Bearer or JWT"

    # Password
    findings = detect_secrets_in_string('password = "SuperSecretPassword123!"', "test")
    types = {f["type"] for f in findings}
    assert "Password" in types, f"Expected Password, got: {types}"

    # PEM Private Key
    findings = detect_secrets_in_string("-----BEGIN RSA PRIVATE KEY-----", "test")
    types = {f["type"] for f in findings}
    assert "PEM Private Key" in types, f"Expected PEM key, got: {types}"

    # Database URL
    findings = detect_secrets_in_string(
        'database_url = "postgresql://user:pass@host:5432/db"', "test"
    )
    types = {f["type"] for f in findings}
    assert "Database Connection String" in types, f"Expected DB string, got: {types}"

    # Slack Token
    findings = detect_secrets_in_string(
        "token=slack_token_placeholder", "test"
    )
    types = {f["type"] for f in findings}
    assert "Slack Token" in types, f"Expected Slack token, got: {types}"

    # SendGrid
    findings = detect_secrets_in_string(
        "key=SG.abc123def456ghi789jkl012.mno345pqr678stu901vwx234yz", "test"
    )
    types = {f["type"] for f in findings}
    assert "SendGrid API Key" in types, f"Expected SendGrid key, got: {types}"

    # GitHub Fine-Grained PAT
    findings = detect_secrets_in_string(
        "token=github_pat_placeholder_token",
        "test",
    )
    types = {f["type"] for f in findings}
    assert "GitHub Fine-Grained PAT" in types, (
        f"Expected GitHub fine-grained PAT, got: {types}"
    )

    print("[PASS] Comprehensive secret detection tests")


def test_header_secret_detection():
    """Test secret detection in headers."""
    headers = [
        {
            "key": "Authorization",
            "value": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc",
        },
        {"key": "X-API-Key", "value": "stripe_live_placeholder_token"},
        {"key": "Content-Type", "value": "application/json"},
    ]
    findings = detect_secrets_in_headers(headers, "test request")
    assert len(findings) > 0, "Should find secrets in headers"
    types = {f["type"] for f in findings}
    assert len(types) >= 1, f"Expected at least 1 type, got: {types}"

    print("[PASS] Header secret detection tests")


def test_body_secret_detection():
    """Test secret detection in various body modes."""
    # Raw body
    body_raw = {
        "mode": "raw",
        "raw": '{"api_key": "sk-1234567890abcdefghijklmnopqrstuvwxyz1234"}',
    }
    findings = detect_secrets_in_body(body_raw, "test")
    assert len(findings) > 0, "Should find secrets in raw body"

    # URL-encoded body
    body_urlenc = {
        "mode": "urlencoded",
        "urlencoded": [
            {"key": "client_secret", "value": "aws_access_placeholder"},
            {"key": "grant_type", "value": "authorization_code"},
        ],
    }
    findings = detect_secrets_in_body(body_urlenc, "test")
    assert len(findings) > 0, "Should find secrets in urlencoded body"

    # Form data body
    body_form = {
        "mode": "formdata",
        "formdata": [
            {"key": "api_key", "value": "dp_key_abcdef12345678901234"},
            {"key": "file", "value": ""},
        ],
    }
    findings = detect_secrets_in_body(body_form, "test")
    assert len(findings) > 0, "Should find secrets in formdata body"

    # GraphQL body
    body_gql = {
        "mode": "graphql",
        "graphql": {
            "query": "{ users { id } }",
            "variables": '{"token": "github_pat_placeholder_token"}',
        },
    }
    findings = detect_secrets_in_body(body_gql, "test")
    assert len(findings) > 0, "Should find secrets in GraphQL variables"

    print("[PASS] Body secret detection tests")


def test_parse_full_collection():
    """Test parsing the full sample collection."""
    result = parse_postman_collection(SAMPLE_COLLECTION)

    # Basic metadata
    assert result["collection_name"] == "DevPulse Test API Collection"
    assert (
        result["schema"]
        == "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    )

    # Endpoints count — should find all requests in the nested structure
    assert result["total_endpoints"] >= 12, (
        f"Expected >= 12 endpoints, got {result['total_endpoints']}"
    )

    # Variable resolution
    assert result["variables_resolved"] == 5

    # Secrets should be detected
    assert result["secrets_exposed_count"] > 0, (
        f"Expected secrets, got {result['secrets_exposed_count']}"
    )
    assert result["endpoints_with_secrets"] > 0

    # Scannable URLs (ones with resolved http/https)
    assert result["summary"]["total_scannable_urls"] > 0

    # Methods distribution
    methods = result["summary"]["methods_distribution"]
    assert "GET" in methods or "POST" in methods, f"Expected GET/POST, got: {methods}"

    # Check specific endpoint extraction
    names = [ep["name"] for ep in result["endpoints"]]
    assert "Health Check" in names, f"Missing 'Health Check', got: {names}"
    assert "Login" in names, f"Missing 'Login', got: {names}"
    assert "Delete User (Dangerous)" in names, (
        f"Missing 'Delete User (Dangerous)', got: {names}"
    )

    # Check deeply nested endpoints are extracted
    assert "Get User Profile" in names, f"Missing 'Get User Profile', got: {names}"
    assert "List All Users" in names, f"Missing 'List All Users', got: {names}"

    # Check method extraction
    login_ep = next(ep for ep in result["endpoints"] if ep["name"] == "Login")
    assert login_ep["method"] == "POST"
    assert login_ep["has_secrets"] == True
    assert len(login_ep["secrets_detected"]) > 0

    # Check URL resolution
    health_ep = next(ep for ep in result["endpoints"] if ep["name"] == "Health Check")
    assert health_ep["url"] == "https://api.devpulse.io/health", (
        f"Got: {health_ep['url']}"
    )

    # Check auth type detection
    db_config_ep = next(
        ep for ep in result["endpoints"] if ep["name"] == "Database Config"
    )
    assert db_config_ep["method"] == "PUT"
    assert db_config_ep["url"].startswith("http://"), (
        f"Expected HTTP URL, got: {db_config_ep['url']}"
    )

    # Verify secret detection found specific types
    all_secret_types = {s["type"] for s in result["secret_findings"]}
    expected_types = {
        "JWT Token",
        "AWS Access Key ID",
        "GitHub Personal Access Token",
        "OpenAI API Key",
    }
    found = expected_types & all_secret_types
    assert len(found) >= 3, f"Expected >= 3 of {expected_types}, found: {found}"

    print(
        f"[PASS] Full collection parsing — {result['total_endpoints']} endpoints, {result['secrets_exposed_count']} secrets detected"
    )


def test_deduplicate_findings():
    """Test finding deduplication."""
    findings = [
        {
            "type": "API Key",
            "location": "test > header 'X-Key'",
            "severity": "critical",
        },
        {
            "type": "API Key",
            "location": "test > header 'X-Key'",
            "severity": "critical",
        },
        {
            "type": "API Key",
            "location": "test > header 'Other-Key'",
            "severity": "critical",
        },
    ]
    deduped = deduplicate_findings(findings)
    assert len(deduped) == 2, f"Expected 2 unique, got {len(deduped)}"

    print("[PASS] Deduplication tests")


def test_empty_collection():
    """Test parsing an empty/malformed collection."""
    result = parse_postman_collection({"info": {"name": "Empty"}})
    assert result["collection_name"] == "Empty"
    assert result["total_endpoints"] == 0
    assert result["secrets_exposed_count"] == 0
    assert result["summary"]["total_scannable_urls"] == 0

    result = parse_postman_collection({})
    assert result["collection_name"] == "Unknown Collection"
    assert result["total_endpoints"] == 0

    print("[PASS] Empty/malformed collection tests")


def test_scan_pipeline_structure():
    """Test the scan pipeline produces correct output structure (sync version)."""
    result = parse_postman_collection(SAMPLE_COLLECTION)

    # Verify the output structure matches requirements
    required_keys = [
        "collection_name",
        "total_endpoints",
        "endpoints",
        "secret_findings",
        "summary",
    ]
    for key in required_keys:
        assert key in result, f"Missing key: {key}"

    for ep in result["endpoints"]:
        required_ep_keys = [
            "name",
            "method",
            "url",
            "headers",
            "body",
            "auth",
            "secrets_detected",
        ]
        for key in required_ep_keys:
            assert key in ep, f"Missing endpoint key: {key}"

    print("[PASS] Scan pipeline structure tests")


# ═══════════════════════════════════════════════════════════════════════════════
# Run All Tests
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 70)
    print("DevPulse Postman Parser + Security Scanner — Test Suite")
    print("=" * 70)

    tests = [
        test_shannon_entropy,
        test_variable_resolution,
        test_collection_variable_extraction,
        test_url_scannability,
        test_jwt_detection,
        test_secret_detection_comprehensive,
        test_header_secret_detection,
        test_body_secret_detection,
        test_parse_full_collection,
        test_deduplicate_findings,
        test_empty_collection,
        test_scan_pipeline_structure,
    ]

    passed = 0
    failed = 0
    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"[FAIL] {test.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"[ERROR] {test.__name__}: {type(e).__name__}: {e}")
            failed += 1

    print("=" * 70)
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
    print("=" * 70)

    # Print sample output
    if passed == len(tests):
        print("\n--- Sample Parse Output ---")
        result = parse_postman_collection(SAMPLE_COLLECTION)
        print(
            json.dumps(
                {
                    "collection_name": result["collection_name"],
                    "total_endpoints": result["total_endpoints"],
                    "secrets_exposed_count": result["secrets_exposed_count"],
                    "endpoints_with_secrets": result["endpoints_with_secrets"],
                    "summary": result["summary"],
                    "secret_types_found": list(
                        {s["type"] for s in result["secret_findings"]}
                    ),
                    "endpoint_names": [ep["name"] for ep in result["endpoints"]],
                },
                indent=2,
            )
        )

    sys.exit(0 if failed == 0 else 1)
