"""
Supabase client for the DevPulse backend.

Uses lazy initialisation so the module can be imported even when
SUPABASE_URL / SUPABASE_SERVICE_KEY are not yet set (e.g. during
unit-test collection).  The client is created on first use.
"""
from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """
    Return the singleton Supabase service-role client.

    Raises RuntimeError if the required environment variables are absent.
    The result is cached so the client is only created once per process.
    """
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()

    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in the environment."
        )

    return create_client(url, key)


# ---------------------------------------------------------------------------
# Backwards-compatible module-level alias.
# Code that does `from services.supabase_client import supabase` continues
# to work; the client is still created lazily on first attribute access.
# ---------------------------------------------------------------------------
class _LazyClient:
    """Proxy that forwards attribute access to the real Supabase client."""

    _client: Client | None = None

    def _get(self) -> Client:
        if self._client is None:
            self._client = get_supabase()
        return self._client

    def __getattr__(self, name: str):  # type: ignore[override]
        return getattr(self._get(), name)


supabase: Client = _LazyClient()  # type: ignore[assignment]
