"""
In-memory LRU cache for DevPulse backend.
Caches expensive operations: scan results, LLM usage summaries, compliance reports.
Uses TTL-based expiry for freshness.
"""
from __future__ import annotations

import time
from collections import OrderedDict
from typing import Any, Optional


class TTLCache:
    """
    Thread-safe LRU cache with TTL expiry.
    Prevents redundant database queries and API calls.
    """

    def __init__(self, maxsize: int = 512, ttl_seconds: int = 120):
        self._cache: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self._maxsize = maxsize
        self._ttl = ttl_seconds

    def get(self, key: str) -> Optional[Any]:
        """Get a cached value. Returns None if missing or expired."""
        if key not in self._cache:
            return None
        value, expires_at = self._cache[key]
        if time.monotonic() > expires_at:
            del self._cache[key]
            return None
        # Move to end (LRU)
        self._cache.move_to_end(key)
        return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Cache a value with optional custom TTL."""
        expires_at = time.monotonic() + (ttl or self._ttl)
        if key in self._cache:
            self._cache.move_to_end(key)
        self._cache[key] = (value, expires_at)
        # Evict oldest if over capacity
        while len(self._cache) > self._maxsize:
            self._cache.popitem(last=False)

    def delete(self, key: str) -> None:
        """Remove a key from cache."""
        self._cache.pop(key, None)

    def invalidate_prefix(self, prefix: str) -> int:
        """Remove all keys starting with prefix. Returns count removed."""
        keys_to_remove = [k for k in self._cache if k.startswith(prefix)]
        for k in keys_to_remove:
            del self._cache[k]
        return len(keys_to_remove)

    def clear(self) -> None:
        """Clear all cached entries."""
        self._cache.clear()

    def __len__(self) -> int:
        return len(self._cache)


# Global cache instances
# Scan results: 2 minute TTL (scans are expensive HTTP calls)
scan_cache = TTLCache(maxsize=256, ttl_seconds=120)

# LLM usage summaries: 1 minute TTL (cost data updates frequently)
llm_cache = TTLCache(maxsize=256, ttl_seconds=60)

# Compliance reports: 5 minute TTL (rarely changes)
compliance_cache = TTLCache(maxsize=128, ttl_seconds=300)

# Thinking token stats: 2 minute TTL
thinking_cache = TTLCache(maxsize=256, ttl_seconds=120)


def cache_key(*parts: str) -> str:
    """Build a cache key from parts."""
    return ":".join(str(p) for p in parts)
In-memory LRU cache for DevPulse backend.
Caches expensive operations: scan results, LLM usage summaries, compliance reports.
Uses TTL-based expiry for freshness.
"""
from __future__ import annotations

import time
from collections import OrderedDict
from typing import Any, Optional


class TTLCache:
    """
    Thread-safe LRU cache with TTL expiry.
    Prevents redundant database queries and API calls.
    """

    def __init__(self, maxsize: int = 512, ttl_seconds: int = 120):
        self._cache: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self._maxsize = maxsize
        self._ttl = ttl_seconds

    def get(self, key: str) -> Optional[Any]:
        """Get a cached value. Returns None if missing or expired."""
        if key not in self._cache:
            return None
        value, expires_at = self._cache[key]
        if time.monotonic() > expires_at:
            del self._cache[key]
            return None
        # Move to end (LRU)
        self._cache.move_to_end(key)
        return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Cache a value with optional custom TTL."""
        expires_at = time.monotonic() + (ttl or self._ttl)
        if key in self._cache:
            self._cache.move_to_end(key)
        self._cache[key] = (value, expires_at)
        # Evict oldest if over capacity
        while len(self._cache) > self._maxsize:
            self._cache.popitem(last=False)

    def delete(self, key: str) -> None:
        """Remove a key from cache."""
        self._cache.pop(key, None)

    def invalidate_prefix(self, prefix: str) -> int:
        """Remove all keys starting with prefix. Returns count removed."""
        keys_to_remove = [k for k in self._cache if k.startswith(prefix)]
        for k in keys_to_remove:
            del self._cache[k]
        return len(keys_to_remove)

    def clear(self) -> None:
        """Clear all cached entries."""
        self._cache.clear()

    def __len__(self) -> int:
        return len(self._cache)


# Global cache instances
# Scan results: 2 minute TTL (scans are expensive HTTP calls)
scan_cache = TTLCache(maxsize=256, ttl_seconds=120)

# LLM usage summaries: 1 minute TTL (cost data updates frequently)
llm_cache = TTLCache(maxsize=256, ttl_seconds=60)

# Compliance reports: 5 minute TTL (rarely changes)
compliance_cache = TTLCache(maxsize=128, ttl_seconds=300)

# Thinking token stats: 2 minute TTL
thinking_cache = TTLCache(maxsize=256, ttl_seconds=120)


def cache_key(*parts: str) -> str:
    """Build a cache key from parts."""
    return ":".join(str(p) for p in parts)

