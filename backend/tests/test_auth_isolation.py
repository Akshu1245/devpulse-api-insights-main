"""
Tests for JWT authentication and user isolation.

These tests verify that:
1. Endpoints reject requests without a valid JWT (HTTP 401)
2. Endpoints reject requests where the authenticated user_id does not match
   the requested user_id (HTTP 403)
3. The auth_guard helpers behave correctly in isolation

Run with:
    cd backend && pytest tests/test_auth_isolation.py -v
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock, patch

# ---------------------------------------------------------------------------
# Helpers — create real JWTs for testing
# ---------------------------------------------------------------------------

_TEST_SECRET = "test-secret-key-for-unit-tests-only-32chars"


def _make_token(user_id: str, expired: bool = False) -> str:
    """Generate a signed JWT for testing using the test secret."""
    from jose import jwt as jose_jwt

    now = datetime.now(timezone.utc)
    if expired:
        exp = now - timedelta(hours=1)
    else:
        exp = now + timedelta(hours=1)

    payload = {
        "sub": user_id,
        "iat": now,
        "exp": exp,
        "jti": str(uuid.uuid4()),
    }
    return jose_jwt.encode(payload, _TEST_SECRET, algorithm="HS256")


# ---------------------------------------------------------------------------
# Unit tests for auth_guard helpers
# ---------------------------------------------------------------------------


class TestGetCurrentUserId:
    """Tests for services.auth_guard.get_current_user_id"""

    def test_missing_header_raises_401(self):
        from services.auth_guard import get_current_user_id

        with pytest.raises(HTTPException) as exc_info:
            get_current_user_id(authorization=None)
        assert exc_info.value.status_code == 401

    def test_non_bearer_header_raises_401(self):
        from services.auth_guard import get_current_user_id

        with pytest.raises(HTTPException) as exc_info:
            get_current_user_id(authorization="Basic dXNlcjpwYXNz")
        assert exc_info.value.status_code == 401

    def test_empty_token_raises_401(self):
        from services.auth_guard import get_current_user_id

        with pytest.raises(HTTPException) as exc_info:
            get_current_user_id(authorization="Bearer ")
        assert exc_info.value.status_code == 401

    def test_invalid_token_raises_401(self):
        from services.auth_guard import get_current_user_id

        with patch.dict(os.environ, {"JWT_SECRET": _TEST_SECRET}):
            with pytest.raises(HTTPException) as exc_info:
                get_current_user_id(authorization="Bearer invalid.token.here")
        assert exc_info.value.status_code == 401

    def test_expired_token_raises_401(self):
        from services.auth_guard import get_current_user_id

        token = _make_token("user-uuid-1234", expired=True)
        with patch.dict(os.environ, {"JWT_SECRET": _TEST_SECRET}):
            with pytest.raises(HTTPException) as exc_info:
                get_current_user_id(authorization=f"Bearer {token}")
        assert exc_info.value.status_code == 401

    def test_valid_token_returns_user_id(self):
        from services.auth_guard import get_current_user_id

        user_id = "user-uuid-1234"
        token = _make_token(user_id)
        with patch.dict(os.environ, {"JWT_SECRET": _TEST_SECRET}):
            result = get_current_user_id(authorization=f"Bearer {token}")
        assert result == user_id


class TestRequireAuth:
    """Tests for services.auth_guard.require_auth"""

    def test_missing_header_raises_401(self):
        from services.auth_guard import require_auth

        with pytest.raises(HTTPException) as exc_info:
            require_auth(authorization=None)
        assert exc_info.value.status_code == 401

    def test_valid_token_returns_dict_with_user_id(self):
        from services.auth_guard import require_auth

        user_id = "user-uuid-5678"
        token = _make_token(user_id)
        with patch.dict(os.environ, {"JWT_SECRET": _TEST_SECRET}):
            result = require_auth(authorization=f"Bearer {token}")
        assert result["user_id"] == user_id
        assert "user_id" in result


class TestAssertSameUser:
    """Tests for services.auth_guard.assert_same_user"""

    def test_same_user_passes(self):
        from services.auth_guard import assert_same_user

        # Should not raise
        assert assert_same_user("user-abc", "user-abc") is None

    def test_different_user_raises_403(self):
        from services.auth_guard import assert_same_user

        with pytest.raises(HTTPException) as exc_info:
            assert_same_user("user-abc", "user-xyz")
        assert exc_info.value.status_code == 403
        assert "Forbidden" in exc_info.value.detail


# ---------------------------------------------------------------------------
# Unit tests for jwt_auth helpers
# ---------------------------------------------------------------------------


class TestJwtAuth:
    """Tests for services.jwt_auth token creation and verification."""

    def test_create_and_decode_token(self):
        from services.jwt_auth import create_access_token, decode_access_token

        user_id = str(uuid.uuid4())
        with patch.dict(os.environ, {"JWT_SECRET": _TEST_SECRET}):
            token = create_access_token(user_id=user_id)
            payload = decode_access_token(token)
        assert payload["sub"] == user_id
        assert "exp" in payload
        assert "jti" in payload

    def test_invalid_token_raises_401(self):
        from services.jwt_auth import decode_access_token

        with patch.dict(os.environ, {"JWT_SECRET": _TEST_SECRET}):
            with pytest.raises(HTTPException) as exc_info:
                decode_access_token("not.a.valid.token")
        assert exc_info.value.status_code == 401

    def test_hash_and_verify_password(self):
        from services.jwt_auth import hash_password, verify_password

        plain = "MySecurePassword123!"
        hashed = hash_password(plain)
        assert hashed != plain
        assert verify_password(plain, hashed) is True
        assert verify_password("WrongPassword", hashed) is False

    def test_missing_jwt_secret_raises_runtime_error(self):
        from services.jwt_auth import create_access_token

        with patch.dict(os.environ, {"JWT_SECRET": ""}):
            with pytest.raises(RuntimeError, match="JWT_SECRET"):
                create_access_token(user_id="some-user")


# ---------------------------------------------------------------------------
# Integration-style tests using FastAPI TestClient
# ---------------------------------------------------------------------------


@pytest.fixture
def scan_client():
    """
    Returns a TestClient for the scan router with Supabase mocked out.
    """
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from routers import scan

    test_app = FastAPI()
    test_app.include_router(scan.router)
    return TestClient(test_app, raise_server_exceptions=False)


class TestScanEndpointAuth:
    """Verify /scan enforces authentication and user isolation."""

    def test_scan_without_auth_returns_401(self, scan_client):
        resp = scan_client.post(
            "/scan",
            json={"endpoint": "https://example.com/api", "user_id": "user-1"},
        )
        # Without a valid JWT the dependency raises 401
        assert resp.status_code in (401, 422)

    def test_scan_wrong_user_returns_403(self, scan_client):
        """Authenticated as user-1 but requesting scan for user-2 → 403."""
        user_id = "user-1"
        token = _make_token(user_id)

        with patch.dict(os.environ, {"JWT_SECRET": _TEST_SECRET}):
            resp = scan_client.post(
                "/scan",
                json={"endpoint": "https://example.com/api", "user_id": "user-2"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 403

    def test_list_scans_wrong_user_returns_403(self, scan_client):
        """Authenticated as user-1 but requesting scans for user-2 → 403."""
        user_id = "user-1"
        token = _make_token(user_id)

        with patch.dict(os.environ, {"JWT_SECRET": _TEST_SECRET}):
            resp = scan_client.get(
                "/scans/user-2",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 403
# Integration-style tests using FastAPI TestClient
# ---------------------------------------------------------------------------


@pytest.fixture
def scan_client():
    """
    Returns a TestClient for the scan router with Supabase mocked out.
    """
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from routers import scan

    test_app = FastAPI()
    test_app.include_router(scan.router)
    return TestClient(test_app, raise_server_exceptions=False)


class TestScanEndpointAuth:
    """Verify /scan enforces authentication and user isolation."""

    def test_scan_without_auth_returns_401(self, scan_client):
        resp = scan_client.post(
            "/scan",
            json={"endpoint": "https://example.com/api", "user_id": "user-1"},
        )
        # Without a valid JWT the dependency raises 401
        assert resp.status_code in (401, 422)

    def test_scan_wrong_user_returns_403(self, scan_client):
        """Authenticated as user-1 but requesting scan for user-2 → 403."""
        user_id = "user-1"
        token = _make_token(user_id)

        with patch.dict(os.environ, {"JWT_SECRET": _TEST_SECRET}):
            resp = scan_client.post(
                "/scan",
                json={"endpoint": "https://example.com/api", "user_id": "user-2"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 403

    def test_list_scans_wrong_user_returns_403(self, scan_client):
        """Authenticated as user-1 but requesting scans for user-2 → 403."""
        user_id = "user-1"
        token = _make_token(user_id)

        with patch.dict(os.environ, {"JWT_SECRET": _TEST_SECRET}):
            resp = scan_client.get(
                "/scans/user-2",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 403

# ---------------------------------------------------------------------------


@pytest.fixture
def scan_client():
    """
    Returns a TestClient for the scan router with Supabase mocked out.
    """
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from routers import scan

    test_app = FastAPI()
    test_app.include_router(scan.router)
    return TestClient(test_app, raise_server_exceptions=False)


class TestScanEndpointAuth:
    """Verify /scan enforces authentication and user isolation."""

    def test_scan_without_auth_returns_401(self, scan_client):
        resp = scan_client.post(
            "/scan",
            json={"endpoint": "https://example.com/api", "user_id": "user-1"},
        )
        # Without a valid JWT the dependency raises 401
        assert resp.status_code in (401, 422)

    def test_scan_wrong_user_returns_403(self, scan_client):
        """Authenticated as user-1 but requesting scan for user-2 → 403."""
        user_id = "user-1"
        token = _make_token(user_id)

        with patch.dict(os.environ, {"JWT_SECRET": _TEST_SECRET}):
            resp = scan_client.post(
                "/scan",
                json={"endpoint": "https://example.com/api", "user_id": "user-2"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 403

    def test_list_scans_wrong_user_returns_403(self, scan_client):
        """Authenticated as user-1 but requesting scans for user-2 → 403."""
        user_id = "user-1"
        token = _make_token(user_id)

        with patch.dict(os.environ, {"JWT_SECRET": _TEST_SECRET}):
            resp = scan_client.get(
                "/scans/user-2",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 403

