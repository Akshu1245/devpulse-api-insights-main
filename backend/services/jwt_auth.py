"""
JWT Authentication Service — DevPulse Backend

Handles:
- Password hashing / verification (bcrypt)
- JWT token generation (HS256, python-jose)
- JWT token verification
- FastAPI dependency for protected endpoints

Environment variables required:
  JWT_SECRET   — secret key for signing tokens (min 32 chars recommended)
  JWT_EXPIRE_MINUTES — token lifetime in minutes (default: 60 * 24 = 1440 = 1 day)
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from fastapi import Header, HTTPException
from jose import JWTError, jwt

# ---------------------------------------------------------------------------
# Configuration — fail fast if JWT_SECRET is missing
# ---------------------------------------------------------------------------

_JWT_SECRET: str = os.getenv("JWT_SECRET", "").strip()
_JWT_ALGORITHM = "HS256"
_JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", str(60 * 24)))  # 1 day default


def _get_secret() -> str:
    """Return the JWT secret, raising RuntimeError if not configured."""
    secret = os.getenv("JWT_SECRET", "").strip()
    if not secret:
        raise RuntimeError(
            "JWT_SECRET environment variable is not set. "
            "Add it to your .env file before starting the server."
        )
    return secret


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    """Hash a plain-text password with bcrypt.  Returns the hashed string."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain.encode(), salt).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches the bcrypt *hashed* password."""
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

def create_access_token(user_id: str, extra_claims: dict[str, Any] | None = None) -> str:
    """
    Generate a signed JWT access token.

    Payload:
      sub  — user_id (string UUID)
      iat  — issued-at (UTC)
      exp  — expiry (UTC, now + JWT_EXPIRE_MINUTES)
      jti  — unique token ID (prevents replay if you maintain a denylist)
    """
    secret = _get_secret()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=_JWT_EXPIRE_MINUTES),
        "jti": str(uuid.uuid4()),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, secret, algorithm=_JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode and verify a JWT access token.

    Returns the decoded payload dict.
    Raises HTTPException 401 on any failure (expired, invalid signature, etc.).
    """
    secret = _get_secret()
    try:
        payload = jwt.decode(token, secret, algorithms=[_JWT_ALGORITHM])
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid or expired token: {exc}",
        ) from exc


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

def get_current_user_id_jwt(authorization: str | None = Header(default=None)) -> str:
    """
    FastAPI dependency: extract and validate the DevPulse JWT from the
    Authorization: Bearer <token> header.

    Returns the authenticated user_id (UUID string).
    Raises HTTP 401 on any auth failure.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header",
        )

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    payload = decode_access_token(token)
    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject claim")

    return user_id
