"""
Rate Limiter Service — DevPulse Backend

Provides:
- Per-IP rate limiting (sliding window)
- Per-user rate limiting (sliding window)
- Per-endpoint cooldown (prevent repeated scans of same target)
- Concurrent scan tracking per user
- Rate limit event logging (IP, user_id, endpoint, timestamp)

All state is in-process memory (no Redis required for single-instance deployments).
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Optional

_log = logging.getLogger("devpulse.rate_limiter")

# ---------------------------------------------------------------------------
# Response format helpers
# ---------------------------------------------------------------------------

RATE_LIMIT_RESPONSE = {
    "success": False,
    "error": {
        "message": "Too many requests",
        "code": "RATE_LIMIT_EXCEEDED",
    },
}

COOLDOWN_RESPONSE = {
    "success": False,
    "error": {
        "message": "This endpoint was scanned recently. Please wait before scanning again.",
        "code": "SCAN_COOLDOWN_ACTIVE",
    },
}

CONCURRENT_LIMIT_RESPONSE = {
    "success": False,
    "error": {
        "message": "Too many active scans. Please wait for current scans to complete.",
        "code": "CONCURRENT_SCAN_LIMIT",
    },
}

ENDPOINT_COUNT_RESPONSE = {
    "success": False,
    "error": {
        "message": "Too many endpoints in a single request. Maximum allowed is {max}.",
        "code": "ENDPOINT_COUNT_EXCEEDED",
    },
}


# ---------------------------------------------------------------------------
# Sliding-window counter
# ---------------------------------------------------------------------------

class _SlidingWindow:
    """Thread-safe sliding window counter for rate limiting."""

    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def is_allowed(self, key: str) -> bool:
        """
        Check if the key is within the rate limit.
        Returns True if allowed, False if limit exceeded.
        Automatically records the hit if allowed.
        """
        now = time.monotonic()
        bucket = self._hits[key]
        # Evict expired entries
        cutoff = now - self.window_seconds
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= self.max_requests:
            return False
        bucket.append(now)
        return True

    def remaining(self, key: str) -> int:
        """Return how many requests remain in the current window."""
        now = time.monotonic()
        bucket = self._hits[key]
        cutoff = now - self.window_seconds
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        return max(0, self.max_requests - len(bucket))

    def reset_at(self, key: str) -> float:
        """Return the Unix timestamp when the oldest hit expires."""
        bucket = self._hits.get(key)
        if not bucket:
            return time.time()
        oldest = bucket[0]
        return time.time() + (self.window_seconds - (time.monotonic() - oldest))


# ---------------------------------------------------------------------------
# Endpoint cooldown tracker
# ---------------------------------------------------------------------------

class _CooldownTracker:
    """Tracks last-scan time per (user_id, endpoint) pair."""

    def __init__(self, cooldown_seconds: int = 45):
        self.cooldown_seconds = cooldown_seconds
        self._last_scan: dict[str, float] = {}

    def is_on_cooldown(self, user_id: str, endpoint: str) -> bool:
        key = f"{user_id}:{endpoint}"
        last = self._last_scan.get(key)
        if last is None:
            return False
        return (time.monotonic() - last) < self.cooldown_seconds

    def record_scan(self, user_id: str, endpoint: str) -> None:
        key = f"{user_id}:{endpoint}"
        self._last_scan[key] = time.monotonic()

    def seconds_remaining(self, user_id: str, endpoint: str) -> int:
        key = f"{user_id}:{endpoint}"
        last = self._last_scan.get(key)
        if last is None:
            return 0
        elapsed = time.monotonic() - last
        remaining = self.cooldown_seconds - elapsed
        return max(0, int(remaining))


# ---------------------------------------------------------------------------
# Concurrent scan tracker
# ---------------------------------------------------------------------------

class _ConcurrentScanTracker:
    """Tracks active (in-flight) scans per user."""

    def __init__(self, max_concurrent: int = 3):
        self.max_concurrent = max_concurrent
        self._active: dict[str, int] = defaultdict(int)

    def can_start(self, user_id: str) -> bool:
        return self._active[user_id] < self.max_concurrent

    def start(self, user_id: str) -> None:
        self._active[user_id] += 1

    def finish(self, user_id: str) -> None:
        if self._active[user_id] > 0:
            self._active[user_id] -= 1

    def active_count(self, user_id: str) -> int:
        return self._active[user_id]


# ---------------------------------------------------------------------------
# Rate limit event logger
# ---------------------------------------------------------------------------

def _log_rate_limit_event(
    event_type: str,
    ip: str,
    user_id: Optional[str],
    endpoint: str,
) -> None:
    """Log a rate limit event with IP, user_id, endpoint, and timestamp."""
    _log.warning(
        "RATE_LIMIT_EVENT type=%s ip=%s user_id=%s endpoint=%s timestamp=%.3f",
        event_type,
        ip,
        user_id or "anonymous",
        endpoint,
        time.time(),
    )


# ---------------------------------------------------------------------------
# Public rate limiter instances
# ---------------------------------------------------------------------------

# POST /scan — 10 requests per minute per IP
scan_ip_limiter = _SlidingWindow(max_requests=10, window_seconds=60)

# POST /scan — 10 requests per minute per user
scan_user_limiter = _SlidingWindow(max_requests=10, window_seconds=60)

# POST /postman/import and /postman/parse — 5 requests per minute per IP
postman_ip_limiter = _SlidingWindow(max_requests=5, window_seconds=60)

# POST /postman/import and /postman/parse — 5 requests per minute per user
postman_user_limiter = _SlidingWindow(max_requests=5, window_seconds=60)

# POST /auth/login and /auth/signup — 5 requests per minute per IP
auth_ip_limiter = _SlidingWindow(max_requests=5, window_seconds=60)

# Endpoint cooldown: 45 seconds between scans of the same endpoint per user
scan_cooldown = _CooldownTracker(cooldown_seconds=45)

# Concurrent scan guard: max 3 simultaneous scans per user
concurrent_scan_tracker = _ConcurrentScanTracker(max_concurrent=3)

# ---------------------------------------------------------------------------
# Limits
# ---------------------------------------------------------------------------

MAX_ENDPOINTS_PER_SCAN = 50   # max endpoints in a single Postman import scan
MAX_POSTMAN_COLLECTION_SIZE_MB = 5  # max Postman JSON payload in MB


# ---------------------------------------------------------------------------
# Check helpers (used in routers)
# ---------------------------------------------------------------------------

def check_scan_rate_limit(ip: str, user_id: str, endpoint: str) -> Optional[dict]:
    """
    Check rate limits for POST /scan.
    Returns error dict if limit exceeded, None if allowed.
    """
    if not scan_ip_limiter.is_allowed(ip):
        _log_rate_limit_event("SCAN_IP_LIMIT", ip, user_id, endpoint)
        return RATE_LIMIT_RESPONSE

    if not scan_user_limiter.is_allowed(user_id):
        _log_rate_limit_event("SCAN_USER_LIMIT", ip, user_id, endpoint)
        return RATE_LIMIT_RESPONSE

    return None


def check_scan_cooldown(user_id: str, endpoint: str, ip: str = "unknown") -> Optional[dict]:
    """
    Check endpoint cooldown for POST /scan.
    Returns error dict if on cooldown, None if allowed.
    """
    if scan_cooldown.is_on_cooldown(user_id, endpoint):
        remaining = scan_cooldown.seconds_remaining(user_id, endpoint)
        _log_rate_limit_event("SCAN_COOLDOWN", ip, user_id, endpoint)
        response = dict(COOLDOWN_RESPONSE)
        response["error"] = dict(COOLDOWN_RESPONSE["error"])
        response["error"]["retry_after_seconds"] = remaining
        return response

    return None


def check_concurrent_scans(user_id: str, ip: str = "unknown", endpoint: str = "/scan") -> Optional[dict]:
    """
    Check concurrent scan limit for a user.
    Returns error dict if limit exceeded, None if allowed.
    """
    if not concurrent_scan_tracker.can_start(user_id):
        _log_rate_limit_event("CONCURRENT_SCAN_LIMIT", ip, user_id, endpoint)
        response = dict(CONCURRENT_LIMIT_RESPONSE)
        response["error"] = dict(CONCURRENT_LIMIT_RESPONSE["error"])
        response["error"]["active_scans"] = concurrent_scan_tracker.active_count(user_id)
        return response

    return None


def check_postman_rate_limit(ip: str, user_id: str) -> Optional[dict]:
    """
    Check rate limits for POST /postman/import and /postman/parse.
    Returns error dict if limit exceeded, None if allowed.
    """
    if not postman_ip_limiter.is_allowed(ip):
        _log_rate_limit_event("POSTMAN_IP_LIMIT", ip, user_id, "/postman/import")
        return RATE_LIMIT_RESPONSE

    if not postman_user_limiter.is_allowed(user_id):
        _log_rate_limit_event("POSTMAN_USER_LIMIT", ip, user_id, "/postman/import")
        return RATE_LIMIT_RESPONSE

    return None


def check_auth_rate_limit(ip: str, endpoint: str) -> Optional[dict]:
    """
    Check rate limits for POST /auth/login and /auth/signup.
    Returns error dict if limit exceeded, None if allowed.
    """
    if not auth_ip_limiter.is_allowed(ip):
        _log_rate_limit_event("AUTH_IP_LIMIT", ip, None, endpoint)
        return RATE_LIMIT_RESPONSE

    return None


def check_endpoint_count(count: int, max_count: int = MAX_ENDPOINTS_PER_SCAN) -> Optional[dict]:
    """
    Check if the number of endpoints exceeds the allowed maximum.
    Returns error dict if exceeded, None if allowed.
    """
    if count > max_count:
        response = {
            "success": False,
            "error": {
                "message": f"Too many endpoints in a single request. Maximum allowed is {max_count}.",
                "code": "ENDPOINT_COUNT_EXCEEDED",
                "max_allowed": max_count,
                "provided": count,
            },
        }
        return response

    return None
