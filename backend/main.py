import os
import time
import uuid
from collections import defaultdict, deque

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, EmailStr

from routers import alerts, compliance, llm, scan, postman, risk, endpoints, ci_cd, cost_alerts, thinking, shadow_api, agentguard
from services.auth_guard import get_current_user_id
from services.supabase_client import supabase
from typing import Optional

load_dotenv()

app = FastAPI(title="DevPulse API Security API", version="1.0.0")

# CORS configuration with production deployment support
_origins_raw = os.getenv("FRONTEND_URL", "http://localhost:5173,https://devpulse-api-insights-main-main-nmu60dejg.vercel.app,https://devpulse-api-insights-main-main-seven.vercel.app")
_origins = [o.strip() for o in _origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
        start = time.time()
        response = await call_next(request)
        elapsed_ms = int((time.time() - start) * 1000)
        response.headers["x-request-id"] = request_id
        response.headers["x-response-time-ms"] = str(elapsed_ms)
        response.headers["x-content-type-options"] = "nosniff"
        response.headers["x-frame-options"] = "DENY"
        response.headers["referrer-policy"] = "no-referrer"
        response.headers["cache-control"] = "no-store"
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_requests: int = 120, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        if request.url.path in {"/health", "/ready"}:
            return await call_next(request)

        ip = request.client.host if request.client else "unknown"
        now = time.time()
        bucket = self._hits[ip]
        while bucket and (now - bucket[0]) > self.window_seconds:
            bucket.popleft()
        if len(bucket) >= self.max_requests:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please retry shortly."},
            )
        bucket.append(now)
        return await call_next(request)


rate_limit_requests = int(os.getenv("RATE_LIMIT_REQUESTS", "120"))
rate_limit_window = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
app.add_middleware(RateLimitMiddleware, max_requests=rate_limit_requests, window_seconds=rate_limit_window)
app.add_middleware(RequestIdMiddleware)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    request_id = getattr(request.state, "request_id", request.headers.get("x-request-id", ""))
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "request_id": request_id},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", request.headers.get("x-request-id", ""))
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id},
    )


app.include_router(scan.router)
app.include_router(llm.router)
app.include_router(alerts.router)
app.include_router(compliance.router)
app.include_router(postman.router)
app.include_router(risk.router)
app.include_router(endpoints.router)
app.include_router(ci_cd.router)
app.include_router(cost_alerts.router)
app.include_router(thinking.router)
app.include_router(shadow_api.router)
app.include_router(agentguard.router)


# Authentication Endpoints
class SignUpRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None


class SignInRequest(BaseModel):
    email: str
    password: str


class SignUpResponse(BaseModel):
    user_id: str
    email: str
    success: bool


class AuthResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: str
    email: str


@app.post("/auth/signup", response_model=SignUpResponse)
async def signup(request: SignUpRequest):
    """
    Sign up with email and password
    
    Args:
        request: SignUpRequest with email, password, and optional full_name
        
    Returns:
        User ID and email on success
    """
    try:
        # Create user via Supabase
        response = supabase.auth.sign_up({
            "email": request.email,
            "password": request.password,
            "options": {
                "data": {
                    "full_name": request.full_name or request.email.split("@")[0]
                }
            }
        })
        
        user = response.user
        if not user:
            raise HTTPException(status_code=400, detail="Sign up failed")
        
        return SignUpResponse(
            user_id=user.id,
            email=user.email,
            success=True
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Sign up failed: {str(e)}")


@app.post("/auth/signin", response_model=AuthResponse)
async def signin(request: SignInRequest):
    """
    Sign in with email and password
    
    Args:
        request: SignInRequest with email and password
        
    Returns:
        Access token and user information
    """
    try:
        # Sign in via Supabase
        response = supabase.auth.sign_in_with_password({
            "email": request.email,
            "password": request.password
        })
        
        if not response.session:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        return AuthResponse(
            access_token=response.session.access_token,
            token_type="bearer",
            user_id=response.user.id,
            email=response.user.email
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Sign in failed: {str(e)}")


@app.post("/auth/logout")
async def logout(user_id: str = Depends(get_current_user_id)):
    """
    Sign out the authenticated user
    
    Returns:
        Success confirmation
    """
    try:
        return {
            "status": "success",
            "message": "Signed out successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Logout failed: {str(e)}")


@app.get("/auth/me")
async def get_me(user_id: str = Depends(get_current_user_id)):
    """
    Get current authenticated user profile
    
    Returns:
        User profile information
    """
    try:
        # Get user from Supabase
        response = supabase.auth.admin.get_user(user_id)
        user = response.user
        
        return {
            "user_id": user.id,
            "email": user.email,
            "created_at": user.created_at,
            "last_sign_in_at": user.last_sign_in_at,
            "user_metadata": user.user_metadata or {}
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get user profile: {str(e)}")


@app.post("/auth/password-reset")
async def request_password_reset(email: str):
    """
    Request password reset email
    
    Args:
        email: User email address
        
    Returns:
        Success confirmation
    """
    try:
        supabase.auth.reset_password_for_email(email)
        return {
            "status": "success",
            "message": "Password reset email sent"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Password reset failed: {str(e)}")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    return {"status": "ready", "origins": _origins}
