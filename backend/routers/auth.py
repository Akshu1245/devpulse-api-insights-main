"""
Auth Router — DevPulse Backend

Endpoints:
  POST /auth/signup  — register a new user (bcrypt password, stored in Supabase)
  POST /auth/login   — authenticate and receive a JWT

Users are stored in the  devpulse_users  table:
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid()
  email       text  UNIQUE NOT NULL
  password    text  NOT NULL  (bcrypt hash — never plain text)
  created_at  timestamptz DEFAULT now()

Create the table once in Supabase SQL editor:

  CREATE TABLE IF NOT EXISTS devpulse_users (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email      text UNIQUE NOT NULL,
    password   text NOT NULL,
    created_at timestamptz DEFAULT now()
  );

  -- Only the service-role key can read/write this table
  ALTER TABLE devpulse_users ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "service role only" ON devpulse_users
    USING (false) WITH CHECK (false);
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field

from services.jwt_auth import create_access_token, hash_password, verify_password
from services.rate_limiter import check_auth_rate_limit
from services.supabase_client import get_supabase

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Minimum 8 characters")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/signup", status_code=201)
def signup(req: SignupRequest, request: Request) -> dict:
    """
    Register a new user.

    - Checks for duplicate email
    - Hashes the password with bcrypt
    - Stores the user in devpulse_users
    - Returns user_id (no token — user must login separately)

    Response:
      { "success": true, "user_id": "...", "message": "User created" }
    """
    # Rate limiting: 5 requests per minute per IP
    ip = request.client.host if request.client else "unknown"
    rl_error = check_auth_rate_limit(ip=ip, endpoint="/auth/signup")
    if rl_error:
        return JSONResponse(status_code=429, content=rl_error)

    supabase = get_supabase()

    # Check for duplicate email
    existing = (
        supabase.table("devpulse_users")
        .select("id")
        .eq("email", req.email.lower())
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Email already registered")

    # Hash password — never store plain text
    hashed = hash_password(req.password)

    # Insert user
    result = (
        supabase.table("devpulse_users")
        .insert({"email": req.email.lower(), "password": hashed})
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create user")

    user_id: str = result.data[0]["id"]

    return {
        "success": True,
        "user_id": user_id,
        "message": "User created",
    }


@router.post("/login")
def login(req: LoginRequest, request: Request) -> dict:
    """
    Authenticate a user and return a JWT.

    - Looks up the user by email
    - Verifies the bcrypt password
    - Issues a signed JWT containing user_id and expiry

    Response:
      {
        "success": true,
        "token": "<JWT>",
        "user": { "id": "...", "email": "..." }
      }

    Errors:
      401 — invalid credentials (email not found or wrong password)
    """
    ip = request.client.host if request.client else "unknown"
    rl_error = check_auth_rate_limit(ip=ip, endpoint="/auth/login")
    if rl_error:
        return JSONResponse(status_code=429, content=rl_error)

    supabase = get_supabase()

    # Fetch user by email
    result = (
        supabase.table("devpulse_users")
        .select("id, email, password")
        .eq("email", req.email.lower())
        .execute()
    )

    if not result.data:
        # Use a generic message to avoid email enumeration
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = result.data[0]

    # Verify password
    if not verify_password(req.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Generate JWT
    token = create_access_token(user_id=user["id"])

    return {
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
        },
    }
