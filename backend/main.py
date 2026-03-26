import os
import time
import uuid
from collections import defaultdict, deque

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from routers import (
    alerts,
    alert_config,
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

load_dotenv()

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


rate_limit_requests = int(os.getenv("RATE_LIMIT_REQUESTS", "120"))
rate_limit_window = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
app.add_middleware(
    RateLimitMiddleware,
    max_requests=rate_limit_requests,
    window_seconds=rate_limit_window,
)
# Kill switch runs before rate limiter so agent blocks are caught first
app.add_middleware(KillSwitchMiddleware)
app.add_middleware(RequestIdMiddleware)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    request_id = getattr(
        request.state, "request_id", request.headers.get("x-request-id", "")
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "request_id": request_id},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(
        request.state, "request_id", request.headers.get("x-request-id", "")
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id},
    )


# Core routers — DevPulse Patent Portfolio
app.include_router(scan.router)  # Patent 1: Unified Security + Cost
app.include_router(llm.router)  # Patent 1: LLM Cost Intelligence
app.include_router(
    llm_proxy.router
)  # Real LLM API Proxy with thinking token attribution
app.include_router(openapi.router)  # OpenAPI Spec Import
app.include_router(alerts.router)
app.include_router(compliance.router)  # Patent 4: Compliance Evidence Generation
app.include_router(postman.router)  # Patent 1: Postman Refugee Engine
app.include_router(thinking_tokens.router)  # Patent 2: Thinking Token Attribution
app.include_router(shadow_api.router)  # Patent 3: Shadow API Discovery
app.include_router(kill_switch.router)  # Agent Safety: Autonomous Kill Switch


@app.get("/health")
async def health():
    return {"status": "ok", "service": "devpulse-api", "patents": 4}


@app.get("/ready")
async def ready():
    return {"ready": True}
