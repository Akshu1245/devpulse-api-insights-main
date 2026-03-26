import logging
import os
import time
import uuid
from collections import defaultdict, deque

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Structured logger — writes to stdout; no stack traces in HTTP responses.
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
_log = logging.getLogger("devpulse")

# ---------------------------------------------------------------------------
# Fail-fast: JWT_SECRET must be set before the app starts.
# ---------------------------------------------------------------------------
_JWT_SECRET = os.getenv("JWT_SECRET", "").strip()
if not _JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET environment variable is not set. "
        "Add  JWT_SECRET=<random-32+-char-string>  to your .env file."
    )

# ---------------------------------------------------------------------------
# Fail-fast: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.
# ---------------------------------------------------------------------------
_SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
_SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
if not _SUPABASE_URL or not _SUPABASE_KEY:
    raise RuntimeError(
        "SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are not set. "
        "Add them to your .env file."
    )

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

# ---------------------------------------------------------------------------
# Public paths that do NOT require authentication.
# /auth/* is always public (signup / login).
# All other paths must carry a valid DevPulse JWT.
# ---------------------------------------------------------------------------
_PUBLIC_PATHS: frozenset[str] = frozenset(
    {
        "/health",
        "/ready",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/auth/signup",
        "/auth/login",
    }
)

from routers import (
    alerts,
    alert_config,
    auth as auth_router,
    compliance,
    kill_switch,
    llm,
    llm_proxy,
    openapi,
    scan,
    postman,
    thinking_tokens,
    shadow_api,
)

app = FastAPI(
    title="DevPulse API Security & Cost Intelligence API",
    version="1.0.0",
    description="The only developer tool combining API security scanning and LLM cost intelligence. Patent applications: NHCE/DEV/2026/001-004.",
)

_origins_raw = os.getenv("FRONTEND_URL", "http://localhost:5173")
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
    """
    Global coarse-grained rate limiter (120 req/min per IP by default).
    Fine-grained per-endpoint limits are enforced inside each router
    using services.rate_limiter.
    """

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
            _log.warning(
                "RATE_LIMIT_EVENT type=GLOBAL_IP_LIMIT ip=%s endpoint=%s timestamp=%.3f",
                ip,
                request.url.path,
                now,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "success": False,
                    "error": {
                        "message": "Too many requests",
                        "code": "RATE_LIMIT_EXCEEDED",
                    },
                },
            )
        bucket.append(now)
        return await call_next(request)


class KillSwitchMiddleware(BaseHTTPMiddleware):
    """
    Per-request kill switch guard.

    Reads the optional  x-agent-id  header.  If present the request is
    checked against the kill switch engine before being forwarded.
    Requests without  x-agent-id  pass through unchanged (non-agent traffic).

    On a kill-switch block the middleware returns 429 immediately and adds
    the  x-kill-switch-reason  header so clients can surface the reason.
    """

    _BYPASS_PATHS = {"/health", "/ready", "/kill-switch/release"}

    async def dispatch(self, request: Request, call_next):
        if request.url.path in self._BYPASS_PATHS:
            return await call_next(request)

        agent_id = request.headers.get("x-agent-id", "").strip()
        if not agent_id:
            return await call_next(request)

        from services.kill_switch import get_engine

        engine = get_engine()

        # Check current block status first
        blocked, msg = engine.is_blocked(agent_id)
        if blocked:
            return JSONResponse(
                status_code=429,
                headers={
                    "x-kill-switch-reason": "blocked",
                    "x-kill-switch-message": msg,
                },
                content={"detail": f"Agent blocked by kill switch: {msg}"},
            )

        # Check request-rate / loop detection (user_id inferred from header or "unknown")
        user_id = request.headers.get("x-user-id", "unknown")
        event = engine.record_request(
            agent_id=agent_id,
            user_id=user_id,
            endpoint=request.url.path,
        )
        if event:
            return JSONResponse(
                status_code=429,
                headers={
                    "x-kill-switch-reason": event.reason.value,
                    "x-kill-switch-message": event.detail,
                },
                content={
                    "detail": f"Kill switch activated: {event.reason.value}",
                    "reason": event.reason.value,
                    "auto_release_at": event.auto_release_at,
                },
            )

        return await call_next(request)


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """
    Global JWT authentication middleware.

    Every request to a non-public path must carry a valid DevPulse JWT
    (issued by POST /auth/login) in the  Authorization: Bearer <token>
    header.  The validated user_id is stored in  request.state.user_id
    so downstream handlers can read it without re-validating the token.

    Public paths (/health, /ready, /docs, /auth/signup, /auth/login, etc.)
    bypass this check entirely.
    """

    async def dispatch(self, request: Request, call_next):
        # Always allow OPTIONS (CORS pre-flight) and public paths
        if request.method == "OPTIONS" or request.url.path in _PUBLIC_PATHS:
            return await call_next(request)

        auth_header = request.headers.get("authorization", "")
        if not auth_header.lower().startswith("bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid Authorization header"},
            )

        token = auth_header.split(" ", 1)[1].strip()
        if not token:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing bearer token"},
            )

        try:
            from jose import JWTError, jwt as jose_jwt
            payload = jose_jwt.decode(token, _JWT_SECRET, algorithms=["HS256"])
            user_id: str | None = payload.get("sub")
            if not user_id:
                raise ValueError("Token missing subject claim")
            request.state.user_id = user_id
        except Exception:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or expired token"},
            )

        return await call_next(request)


rate_limit_requests = int(os.getenv("RATE_LIMIT_REQUESTS", "120"))
rate_limit_window = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
app.add_middleware(
    RateLimitMiddleware,
    max_requests=rate_limit_requests,
    window_seconds=rate_limit_window,
)
# Kill switch runs before rate limiter so agent blocks are caught first
app.add_middleware(KillSwitchMiddleware)
# JWT auth runs before kill switch so unauthenticated requests are rejected early
app.add_middleware(JWTAuthMiddleware)
app.add_middleware(RequestIdMiddleware)


def _error_code_from_status(status_code: int) -> str:
    """Map HTTP status codes to machine-readable error codes."""
    return {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        422: "VALIDATION_ERROR",
        429: "RATE_LIMITED",
        500: "INTERNAL_ERROR",
        503: "SERVICE_UNAVAILABLE",
    }.get(status_code, "ERROR")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    request_id = getattr(
        request.state, "request_id", request.headers.get("x-request-id", "")
    )
    _log.warning(
        "HTTP %s %s %s — %s [req=%s]",
        exc.status_code,
        request.method,
        request.url.path,
        exc.detail,
        request_id,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "message": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
                "code": _error_code_from_status(exc.status_code),
                "details": exc.detail if not isinstance(exc.detail, str) else {},
            },
            "request_id": request_id,
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(
        request.state, "request_id", request.headers.get("x-request-id", "")
    )
    _log.error(
        "Unhandled exception %s %s — %s: %s [req=%s]",
        request.method,
        request.url.path,
        type(exc).__name__,
        exc,
        request_id,
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "message": "Internal server error",
                "code": "INTERNAL_ERROR",
                "details": {},
            },
            "request_id": request_id,
        },
    )


# Auth router — public endpoints (signup / login)
app.include_router(auth_router.router)

# Core routers — DevPulse Patent Portfolio
app.include_router(scan.router)          # Patent 1: Unified Security + Cost
app.include_router(llm.router)           # Patent 1: LLM Cost Intelligence
app.include_router(llm_proxy.router)     # Real LLM API Proxy with thinking token attribution
app.include_router(openapi.router)       # OpenAPI Spec Import
app.include_router(alerts.router)
app.include_router(compliance.router)    # Patent 4: Compliance Evidence Generation
app.include_router(postman.router)       # Patent 1: Postman Refugee Engine
app.include_router(thinking_tokens.router)  # Patent 2: Thinking Token Attribution
app.include_router(shadow_api.router)    # Patent 3: Shadow API Discovery
app.include_router(kill_switch.router)   # Agent Safety: Autonomous Kill Switch


@app.get("/health")
async def health():
    return {"success": True, "status": "ok", "service": "devpulse-api", "version": "1.0.0"}


@app.get("/ready")
async def ready():
    return {"success": True, "ready": True}
