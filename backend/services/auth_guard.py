"""
Auth Guard — FastAPI dependencies for endpoint-level authentication.

Two dependency functions are provided:

  get_current_user_id()
    Validates the DevPulse JWT (issued by POST /auth/login) and returns
    the authenticated user_id string.  Use this on all protected endpoints.

  require_auth()
    Same validation, but returns a dict {"user_id": str, "email": None}.
    Kept for backwards compatibility with the shadow-api router.

  assert_same_user(auth_user_id, requested_user_id)
    Raises HTTP 403 if the two IDs differ.  Call this on every endpoint
    that accepts a user_id parameter to enforce user isolation.
"""
from __future__ import annotations

from typing import Any

from fastapi import Header, HTTPException

from services.jwt_auth import decode_access_token


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    """
    FastAPI dependency: extract and validate the DevPulse JWT from the
    Authorization: Bearer <token> header.

    Returns the authenticated user's UUID string.
    Raises HTTP 401 if the token is missing, malformed, or invalid.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header",
        )

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    # decode_access_token raises HTTP 401 on any failure
    payload = decode_access_token(token)
    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject claim")

    return user_id


def require_auth(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """
    FastAPI dependency: validates the JWT and returns a dict with user info.

    Returns {"user_id": str, "email": None}
    Raises HTTP 401 if the token is missing, malformed, or invalid.

    Use this when you need the full user dict rather than just the user_id.
    """
    user_id = get_current_user_id(authorization=authorization)
    return {"user_id": user_id, "email": None}


def assert_same_user(auth_user_id: str, requested_user_id: str) -> None:
    """
    Raises HTTP 403 if the authenticated user is trying to access another
    user's data.  Call this after get_current_user_id() to enforce user
    isolation on every endpoint that accepts a user_id parameter.
    """
    if auth_user_id != requested_user_id:
        raise HTTPException(status_code=403, detail="Forbidden: user mismatch")
